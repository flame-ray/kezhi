/**
 * 全自动抢课执行器。
 *
 * 负责把 autoGrab 里的规则落到真实的等待与请求上：
 *   校时 → 预热会话 → 精确等到开抢瞬间 → 并发提交 → 抖动重试 → 自动收尾。
 *
 * 它自己不发网络请求，全部通过 transport 注入，方便测试也方便替换实现。
 */

import {
  appendLog,
  beginGrabRun,
  classifySubmitResponse,
  defaultAutoGrabConfig,
  finishGrabRun,
  isBlockingOutcome,
  nextBurstDelayMs,
  recordGrabAttempt,
  selectGrabBatch,
  shouldStopGrab,
  spinWaitDelay,
  targetNeedsAttempt,
  type AutoGrabConfig,
  type GrabRunState,
  type GrabSubmitTemplate,
} from "./autoGrab";
import { calibrateClock, serverRemainingMs, type ClockProbeResult } from "./clockSync";
import type { SelectionTarget } from "./selectionAssistant";

export interface SubmitResponse {
  status: number;
  body: string;
}

interface GrabBatchResult {
  target: SelectionTarget;
  response?: SubmitResponse;
  error?: string;
}

export interface GrabTransport {
  submit: (target: SelectionTarget, template: GrabSubmitTemplate) => Promise<SubmitResponse>;
  probeClock: () => Promise<ClockProbeResult>;
  prewarm: () => Promise<void>;
}

export interface GrabRunnerOptions {
  config: AutoGrabConfig;
  targets: SelectionTarget[];
  transport: GrabTransport;
  onRun: (run: GrabRunState) => void;
  onNotice?: (message: string) => void;
  /** 立即开抢，跳过等待（用于试跑） */
  immediate?: boolean;
  now?: () => number;
}

export interface GrabRunnerHandle {
  stop: (reason?: string) => void;
  isRunning: () => boolean;
}

const CALIBRATION_SAMPLES = 3;
const CALIBRATION_GAP_MS = 400;

export function startAutoGrab(options: GrabRunnerOptions): GrabRunnerHandle {
  const now = options.now ?? (() => Date.now());
  const config = { ...defaultAutoGrabConfig(), ...options.config, burst: { ...defaultAutoGrabConfig().burst, ...options.config.burst } };
  const targets = options.targets.filter((target) => target.status !== "submitted");
  let run = beginGrabRun(emptyRun(config.clockOffsetMs), "calibrating", new Date(now()));
  let stopped = false;
  let wakeup: (() => void) | undefined;

  const publish = (next: GrabRunState) => {
    run = next;
    options.onRun(next);
  };

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeup = undefined;
      resolve();
    }, ms);
    wakeup = () => {
      clearTimeout(timer);
      wakeup = undefined;
      resolve();
    };
  });

  const stop = (reason?: string) => {
    if (stopped) return;
    stopped = true;
    wakeup?.();
    if (run.status === "running" || run.status === "armed" || run.status === "prewarm" || run.status === "calibrating") {
      publish(finishGrabRun(run, "stopped", reason ?? "已手动停止", new Date(now())));
    }
  };

  void (async () => {
    try {
      if (!config.template) {
        publish(finishGrabRun(run, "stopped", "还没有配置提交接口，请先学习选课入口并填写提交参数"));
        return;
      }
      if (!targets.length) {
        publish(finishGrabRun(run, "stopped", "还没有添加要抢的课程"));
        return;
      }

      // 1. 校时：用学校服务器的时间作为「到点」基准。
      let offsetMs = config.clockOffsetMs;
      if (config.autoCalibrate) {
        const samples: ClockProbeResult[] = [];
        for (let index = 0; index < CALIBRATION_SAMPLES; index += 1) {
          if (stopped) return;
          try {
            samples.push(await options.transport.probeClock());
          } catch {
            // 校时失败不致命，退回本地时钟继续。
            break;
          }
          if (index < CALIBRATION_SAMPLES - 1) await sleep(CALIBRATION_GAP_MS);
        }
        if (stopped) return;
        const calibration = calibrateClock(samples, new Date(now()));
        if (calibration.source === "server-date") {
          offsetMs = calibration.offsetMs;
          publish({ ...run, offsetMs, log: appendLog(run.log, { at: new Date(now()).toISOString(), level: "info", message: `已按学校服务器时间校准（偏移 ${offsetMs >= 0 ? "+" : ""}${offsetMs} 毫秒，往返 ${calibration.rttMs} 毫秒）` }) });
        } else {
          publish({ ...run, log: appendLog(run.log, { at: new Date(now()).toISOString(), level: "warn", message: "没能读取到学校服务器时间，改用本机时钟" }) });
        }
      }

      if (stopped) return;

      // 2. 预热：提前把登录会话刷新一遍，避免开抢时才发现掉线。
      const startsAt = config.startsAt;
      const prewarmAt = startsAt ? Date.parse(startsAt) - config.prewarmMinutes * 60_000 : undefined;
      if (!options.immediate && startsAt && prewarmAt !== undefined && config.prewarmMinutes > 0) {
        const waitForPrewarm = prewarmAt - (now() + offsetMs);
        if (waitForPrewarm > 0) {
          publish(beginGrabRun(run, "armed", new Date(now())));
          await waitUntil(waitForPrewarm);
          if (stopped) return;
        }
        publish(beginGrabRun(run, "prewarm", new Date(now())));
        try {
          await options.transport.prewarm();
          publish({ ...run, log: appendLog(run.log, { at: new Date(now()).toISOString(), level: "info", message: "登录会话已预热" }) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          publish({ ...run, log: appendLog(run.log, { at: new Date(now()).toISOString(), level: "warn", message: `会话预热失败：${message}` }) });
        }
        if (stopped) return;
      }

      // 3. 精确等到开放瞬间。
      if (!options.immediate && startsAt) {
        publish(beginGrabRun(run, "armed", new Date(now())));
        const remaining = serverRemainingMs(startsAt, offsetMs, now());
        await waitUntil(remaining);
        if (stopped) return;
      }

      // 4. 开抢。计时从这里重新开始，校时和预热的时间不该算进最长抢课时长。
      publish(beginGrabRun(run, "running", new Date(now()), true));
      options.onNotice?.("已到开抢时间，正在自动提交");

      let consecutiveErrors = 0;
      let batchCursor = 0;
      while (!stopped) {
        const stopReason = shouldStopGrab(run, config, targets.length, new Date(now()));
        if (stopReason) {
          publish(finishGrabRun(run, "done", stopReason, new Date(now())));
          options.onNotice?.(stopReason);
          return;
        }

        if (!targets.some((target) => targetNeedsAttempt(run, target.id, config))) {
          publish(finishGrabRun(run, "done", run.successIds.length ? `抢课结束，成功 ${run.successIds.length} 门` : "抢课结束，没有抢到", new Date(now())));
          options.onNotice?.(run.successIds.length ? `抢课结束，成功 ${run.successIds.length} 门` : "抢课结束，没有抢到");
          return;
        }

        const selection = selectGrabBatch(targets, run, config, batchCursor);
        const batch = selection.targets;
        batchCursor = selection.nextCursor;
        const results = await Promise.all(batch.map(async (target): Promise<GrabBatchResult> => {
          try {
            return { target, response: await options.transport.submit(target, config.template as GrabSubmitTemplate) };
          } catch (error) {
            return { target, error: error instanceof Error ? error.message : String(error) };
          }
        }));

        if (stopped) return;

        let blocked: string | undefined;
        let sawError = false;
        for (const result of results) {
          const at = new Date(now()).toISOString();
          const attempt = (run.progress[result.target.id]?.attempts ?? 0) + 1;
          if (result.error || !result.response) {
            sawError = true;
            publish(recordGrabAttempt(run, { at, targetId: result.target.id, attempt, outcome: "error", message: result.error ?? "没有收到学校响应" }));
            continue;
          }
          const { outcome, message } = classifySubmitResponse(result.response.status, result.response.body);
          publish(recordGrabAttempt(run, { at, targetId: result.target.id, attempt, outcome, status: result.response.status, message }));
          if (outcome === "error") sawError = true;
          if (isBlockingOutcome(outcome)) {
            blocked = outcome === "captcha" ? "学校要求填写验证码，已停止自动抢课" : "登录已过期，已停止自动抢课";
          }
        }

        if (blocked) {
          publish(finishGrabRun(run, "stopped", blocked, new Date(now())));
          options.onNotice?.(blocked);
          return;
        }

        consecutiveErrors = sawError ? consecutiveErrors + 1 : 0;
        const maxAttempts = Math.max(...targets.map((target) => run.progress[target.id]?.attempts ?? 0));
        const delay = nextBurstDelayMs(maxAttempts, config.burst, consecutiveErrors);
        await sleep(delay);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      publish(finishGrabRun(run, "stopped", `抢课异常终止：${message}`, new Date(now())));
      options.onNotice?.(`抢课异常终止：${message}`);
    }
  })();

  async function waitUntil(remainingMs: number): Promise<void> {
    let remaining = remainingMs;
    for (;;) {
      if (stopped || remaining <= 0) return;
      const current = remaining;
      const delay = spinWaitDelay(current);
      if (delay === null) {
        // 最后几十毫秒也让出渲染线程；真正的后台精确定时应由原生调度器承担。
        await sleep(current);
        return;
      }
      const before = now();
      await sleep(delay);
      remaining -= now() - before;
    }
  }

  return { stop, isRunning: () => !stopped && (run.status === "running" || run.status === "armed" || run.status === "prewarm" || run.status === "calibrating") };
}

function emptyRun(offsetMs: number): GrabRunState {
  return { status: "idle", attemptCount: 0, successIds: [], progress: {}, log: [], offsetMs };
}
