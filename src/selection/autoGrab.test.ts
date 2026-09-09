import { describe, expect, it } from "vitest";
import {
  classifySubmitResponse,
  defaultAutoGrabConfig,
  emptyGrabRun,
  nextBurstDelayMs,
  normalizeAutoGrabConfig,
  recordGrabAttempt,
  renderSubmitBody,
  selectGrabBatch,
  shouldStopGrab,
  spinWaitDelay,
  targetNeedsAttempt,
  templatizeSubmitBody,
} from "./autoGrab";
import { startAutoGrab, type GrabTransport } from "./autoGrabRunner";
import { calibrateClock, formatSkew, serverRemainingMs } from "./clockSync";
import type { SelectionTarget } from "./selectionAssistant";

const target: SelectionTarget = { id: "t1", courseCode: "MATH101", courseName: "高等数学", teacher: "李老师", priority: 1, status: "watching" };

function config(overrides: Partial<ReturnType<typeof defaultAutoGrabConfig>> = {}) {
  return { ...defaultAutoGrabConfig(), ...overrides };
}

describe("提交结果判定", () => {
  it("识别正方风格的 JSON 成功响应", () => {
    expect(classifySubmitResponse(200, JSON.stringify({ flag: "1", msg: "选课成功" }))).toMatchObject({ outcome: "success" });
  });

  it("把 JSON 失败原因映射到具体结果", () => {
    expect(classifySubmitResponse(200, JSON.stringify({ flag: "0", msg: "人数已满" }))).toMatchObject({ outcome: "full" });
    expect(classifySubmitResponse(200, JSON.stringify({ success: false, msg: "不在选课时间范围内" }))).toMatchObject({ outcome: "not_open" });
    expect(classifySubmitResponse(200, JSON.stringify({ flag: 0, message: "该课程已选择" }))).toMatchObject({ outcome: "duplicate" });
  });

  it("响应标志与失败消息冲突时优先停止或等待", () => {
    expect(classifySubmitResponse(200, JSON.stringify({ success: true, msg: "请输入验证码" }))).toMatchObject({ outcome: "captcha" });
    expect(classifySubmitResponse(200, JSON.stringify({ flag: 1, msg: "当前人数已满" }))).toMatchObject({ outcome: "full" });
  });

  it("验证码优先于其他判定，避免无意义重试", () => {
    expect(classifySubmitResponse(200, "选课失败：验证码错误").outcome).toBe("captcha");
    expect(classifySubmitResponse(200, JSON.stringify({ flag: "0", msg: "请输入验证码" })).outcome).toBe("captcha");
  });

  it("按 HTTP 状态判断登录失效与服务器异常", () => {
    expect(classifySubmitResponse(302, "").outcome).toBe("session_expired");
    expect(classifySubmitResponse(401, "").outcome).toBe("session_expired");
    expect(classifySubmitResponse(503, "").outcome).toBe("error");
  });

  it("纯文本响应也能识别常见结果", () => {
    expect(classifySubmitResponse(200, "选课成功").outcome).toBe("success");
    expect(classifySubmitResponse(200, "当前教学班容量已满").outcome).toBe("full");
    expect(classifySubmitResponse(200, "登录已过期请重新登录").outcome).toBe("session_expired");
  });
});

describe("抢课节奏", () => {
  it("重试间隔始终落在配置区间内并带抖动", () => {
    const burst = defaultAutoGrabConfig().burst;
    for (let index = 0; index < 40; index += 1) {
      const delay = nextBurstDelayMs(index, burst, 0, () => 0.9);
      expect(delay).toBeGreaterThanOrEqual(burst.minIntervalMs);
      expect(delay).toBeLessThanOrEqual(burst.maxIntervalMs);
    }
    expect(nextBurstDelayMs(20, burst, 4)).toBeGreaterThan(nextBurstDelayMs(0, burst, 0, () => 0.5));
  });

  it("越接近开抢点定时器越密，最后交给自旋", () => {
    expect(spinWaitDelay(3_600_000)).toBe(30_000);
    expect(spinWaitDelay(20_000)).toBe(19_000);
    expect(spinWaitDelay(1_000)).toBe(800);
    expect(spinWaitDelay(300)).toBe(260);
    expect(spinWaitDelay(10)).toBeNull();
  });

  it("归一化会把越界的并发和频率夹回安全区间", () => {
    const normalized = normalizeAutoGrabConfig({ burst: { concurrency: 99, minIntervalMs: 1, maxIntervalMs: 999_999, maxAttemptsPerTarget: 0 }, prewarmMinutes: 999, clockOffsetMs: 1e9 });
    expect(normalized.burst.concurrency).toBe(3);
    expect(normalized.burst.minIntervalMs).toBe(250);
    expect(normalized.burst.maxAttemptsPerTarget).toBe(1);
    expect(normalized.prewarmMinutes).toBe(30);
    expect(normalized.clockOffsetMs).toBe(86_400_000);
    expect(normalized.stopOnCaptcha).toBe(true);
  });
});

describe("运行状态归约", () => {
  it("成功和重复都不再重试，验证码会拦下后续请求", () => {
    let run = recordGrabAttempt(emptyGrabRun(), { at: new Date().toISOString(), targetId: "t1", attempt: 1, outcome: "success", message: "ok" });
    expect(targetNeedsAttempt(run, "t1", config())).toBe(false);
    expect(run.successIds).toEqual(["t1"]);

    run = recordGrabAttempt(emptyGrabRun(), { at: new Date().toISOString(), targetId: "t1", attempt: 1, outcome: "duplicate", message: "已选" });
    expect(targetNeedsAttempt(run, "t1", config())).toBe(false);

    run = recordGrabAttempt(emptyGrabRun(), { at: new Date().toISOString(), targetId: "t1", attempt: 1, outcome: "captcha", message: "验证码" });
    expect(targetNeedsAttempt(run, "t1", config())).toBe(false);

    run = recordGrabAttempt(emptyGrabRun(), { at: new Date().toISOString(), targetId: "t1", attempt: 1, outcome: "full", message: "满" });
    expect(targetNeedsAttempt(run, "t1", config({ retryWhenFull: true }))).toBe(true);
    expect(targetNeedsAttempt(run, "t1", config({ retryWhenFull: false }))).toBe(false);
  });

  it("全部抢到或超过最长时长后停止", () => {
    const base = recordGrabAttempt({ ...emptyGrabRun(), status: "running", startedAt: new Date().toISOString() }, { at: new Date().toISOString(), targetId: "t1", attempt: 1, outcome: "success", message: "ok" });
    expect(shouldStopGrab(base, config(), 1)).toBe("全部目标已抢到");

    const timedOut = { ...emptyGrabRun(), status: "running" as const, startedAt: new Date(Date.now() - 600_000).toISOString() };
    expect(shouldStopGrab(timedOut, config(), 2)).toContain("最长抢课时长");
  });

  it("成功目标达到尝试上限时不会让其他目标提前停止", () => {
    const running = {
      ...emptyGrabRun(),
      status: "running" as const,
      startedAt: new Date().toISOString(),
      successIds: ["t1"],
      progress: {
        t1: { targetId: "t1", attempts: 40, outcome: "success" as const },
        t2: { targetId: "t2", attempts: 1, outcome: "full" as const },
      },
    };
    expect(shouldStopGrab(running, config(), 2)).toBeUndefined();
  });

  it("候选课程按轮转顺序公平进入并发批次", () => {
    const targets = [
      target,
      { ...target, id: "t2", courseCode: "PHYS101" },
      { ...target, id: "t3", courseCode: "CHEM101" },
    ];
    const settings = config({ burst: { ...defaultAutoGrabConfig().burst, concurrency: 1 } });
    const first = selectGrabBatch(targets, emptyGrabRun(), settings, 0);
    const second = selectGrabBatch(targets, emptyGrabRun(), settings, first.nextCursor);
    const third = selectGrabBatch(targets, emptyGrabRun(), settings, second.nextCursor);
    expect([first.targets[0].id, second.targets[0].id, third.targets[0].id]).toEqual(["t1", "t2", "t3"]);
  });

  it("把抓到的请求体里属于课程的字面量换成占位符", () => {
    const captured = "jx0404id=202620261MATH101&kcmc=%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6&xkfs=1";
    expect(templatizeSubmitBody(captured, { courseCode: "MATH101", courseName: "高等数学" }))
      .toBe("jx0404id=202620261{courseCode}&kcmc={courseName}&xkfs=1");
  });

  it("参数模板会按课程替换占位符", () => {
    const rendered = renderSubmitBody(
      { endpointUrl: "https://jw.example.edu.cn/xk", method: "POST", bodyTemplate: "id={courseCode}&name={courseName}&t={timestamp}", contentType: "application/x-www-form-urlencoded" },
      target,
      new Date("2026-09-08T00:00:00.000Z"),
    );
    expect(rendered).toBe(`id=MATH101&name=${encodeURIComponent("高等数学")}&t=1788825600000`);
  });
});

describe("服务器时钟校准", () => {
  it("取往返最快的样本估算偏移", () => {
    const calibration = calibrateClock([
      { sentAt: 1_000, receivedAt: 1_900, serverTimeMs: 1_400 },
      { sentAt: 2_000, receivedAt: 2_060, serverTimeMs: 2_100 },
    ]);
    // 第二个样本往返 60ms：偏移 = 2100 + 30 - 2060 = +70
    expect(calibration.offsetMs).toBe(70);
    expect(calibration.rttMs).toBe(60);
    expect(calibration.source).toBe("server-date");
  });

  it("没有可用样本时退回本地时钟", () => {
    expect(calibrateClock([{ sentAt: 0, receivedAt: 10 }]).source).toBe("uncalibrated");
    expect(formatSkew(1_500)).toBe("+1.50 秒");
  });

  it("用校准后的偏移计算剩余时间", () => {
    expect(serverRemainingMs("2026-09-08T00:00:10.000Z", 0, Date.parse("2026-09-08T00:00:00.000Z"))).toBe(10_000);
    expect(serverRemainingMs("2026-09-08T00:00:10.000Z", 5_000, Date.parse("2026-09-08T00:00:00.000Z"))).toBe(5_000);
  });
});

describe("执行器", () => {
  it("立即运行时会自动重试直到抢到并收尾", async () => {
    let calls = 0;
    const transport: GrabTransport = {
      submit: async () => {
        calls += 1;
        return calls < 3
          ? { status: 200, body: JSON.stringify({ flag: "0", msg: "人数已满" }) }
          : { status: 200, body: JSON.stringify({ flag: "1", msg: "选课成功" }) };
      },
      probeClock: async () => ({ sentAt: 0, receivedAt: 1 }),
      prewarm: async () => undefined,
    };

    const finished = await runGrab(transport, { immediate: true });
    expect(finished.status).toBe("done");
    expect(finished.successIds).toEqual(["t1"]);
    expect(finished.attemptCount).toBe(3);
    expect(calls).toBe(3);
  });

  it("遇到验证码立即停止，不再继续请求", async () => {
    let calls = 0;
    const transport: GrabTransport = {
      submit: async () => {
        calls += 1;
        return { status: 200, body: JSON.stringify({ flag: "0", msg: "验证码错误" }) };
      },
      probeClock: async () => ({ sentAt: 0, receivedAt: 1 }),
      prewarm: async () => undefined,
    };

    const finished = await runGrab(transport, { immediate: true });
    expect(finished.status).toBe("stopped");
    expect(finished.lastMessage).toContain("验证码");
    expect(calls).toBe(1);
  });

  it("达到最大尝试次数后停止", async () => {
    let calls = 0;
    const transport: GrabTransport = {
      submit: async () => {
        calls += 1;
        return { status: 200, body: JSON.stringify({ flag: "0", msg: "人数已满" }) };
      },
      probeClock: async () => ({ sentAt: 0, receivedAt: 1 }),
      prewarm: async () => undefined,
    };

    const finished = await runGrab(transport, { immediate: true, maxAttempts: 2 });
    expect(finished.status).toBe("done");
    expect(calls).toBe(2);
  });
});

function runGrab(transport: GrabTransport, options: { immediate: boolean; maxAttempts?: number }) {
  const settings = defaultAutoGrabConfig();
  settings.template = { endpointUrl: "https://jw.example.edu.cn/xk/submit", method: "POST", bodyTemplate: "id={courseCode}", contentType: "application/x-www-form-urlencoded" };
  settings.autoCalibrate = false;
  settings.burst = { concurrency: 1, minIntervalMs: 250, maxIntervalMs: 250, maxAttemptsPerTarget: options.maxAttempts ?? 10, maxRunMs: 30_000 };

  let latest = emptyGrabRun();
  let settle: (value: typeof latest) => void = () => undefined;
  const done = new Promise<typeof latest>((resolve) => { settle = resolve; });

  startAutoGrab({
    config: settings,
    targets: [target],
    transport,
    immediate: options.immediate,
    onRun: (run) => {
      latest = run;
      if (run.status === "done" || run.status === "stopped") settle(run);
    },
  });

  return done;
}
