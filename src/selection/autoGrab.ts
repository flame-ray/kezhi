/**
 * 全自动抢课的核心规则层。
 *
 * 这一层是纯函数：不碰网络、不碰 DOM，只负责「什么时候发、发几次、结果怎么算」，
 * 方便单独测试，也让真正发起请求的执行器保持很薄。
 *
 * 安全边界（刻意保留）：
 * - 只请求用户自己学习过、且同域 HTTPS 的提交地址；
 * - 遇到验证码一律停下来交还给人，不做任何识别或绕过；
 * - 有硬上限的并发、频率与总时长，不做无节制轰炸。
 */

import type { SelectionTarget } from "./selectionAssistant";

export type GrabOutcome =
  | "success"
  | "duplicate"
  | "full"
  | "not_open"
  | "captcha"
  | "session_expired"
  | "error";

export type GrabRunStatus = "idle" | "calibrating" | "prewarm" | "armed" | "running" | "stopped" | "done";

export interface GrabBurstConfig {
  /** 同时在飞的请求数，1–3 */
  concurrency: number;
  /** 最短重试间隔（毫秒） */
  minIntervalMs: number;
  /** 最长重试间隔（毫秒），退避到这里就不再拉长 */
  maxIntervalMs: number;
  /** 每门课最多尝试多少次 */
  maxAttemptsPerTarget: number;
  /** 整轮抢课最长持续多久（毫秒） */
  maxRunMs: number;
}

/** 提交请求的模板，字段值里可以用 {课程编号} 之类的占位符 */
export interface GrabSubmitTemplate {
  endpointUrl: string;
  method: "POST" | "GET";
  /** 请求体；GET 时会作为查询串拼到地址后面 */
  bodyTemplate: string;
  contentType: string;
}

export interface AutoGrabConfig {
  enabled: boolean;
  startsAt?: string;
  /** 开始前多少分钟自动预热会话，0 表示不预热 */
  prewarmMinutes: number;
  /** 服务端时间 − 本地时间，由校时得到 */
  clockOffsetMs: number;
  clockCalibratedAt?: string;
  autoCalibrate: boolean;
  template?: GrabSubmitTemplate;
  burst: GrabBurstConfig;
  /** 遇到验证码立即停止并提示（固定为 true，不可关） */
  stopOnCaptcha: true;
  stopOnSessionExpired: boolean;
  /** 命中「已满」时是否继续重试，捡别人退课的位置 */
  retryWhenFull: boolean;
}

export interface GrabAttemptRecord {
  at: string;
  targetId: string;
  attempt: number;
  outcome: GrabOutcome;
  status?: number;
  message: string;
}

export interface GrabTargetProgress {
  targetId: string;
  attempts: number;
  outcome?: GrabOutcome;
  message?: string;
  finishedAt?: string;
}

export interface GrabLogEntry {
  at: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

export interface GrabRunState {
  status: GrabRunStatus;
  startedAt?: string;
  finishedAt?: string;
  attemptCount: number;
  successIds: string[];
  progress: Record<string, GrabTargetProgress>;
  log: GrabLogEntry[];
  lastMessage?: string;
  offsetMs: number;
}

export interface GrabBatchSelection {
  targets: SelectionTarget[];
  nextCursor: number;
}

export const GRAB_PLACEHOLDERS = ["courseCode", "courseName", "teacher", "timestamp", "now"] as const;

const OUTCOME_LABELS: Record<GrabOutcome, string> = {
  success: "抢课成功",
  duplicate: "已选过该课",
  full: "人数已满",
  not_open: "选课尚未开放",
  captcha: "需要验证码",
  session_expired: "登录已过期",
  error: "请求失败",
};

export function defaultGrabBurst(): GrabBurstConfig {
  return {
    concurrency: 2,
    minIntervalMs: 500,
    maxIntervalMs: 2_000,
    maxAttemptsPerTarget: 40,
    maxRunMs: 3 * 60_000,
  };
}

export function defaultAutoGrabConfig(startsAt?: string): AutoGrabConfig {
  return {
    enabled: false,
    startsAt,
    prewarmMinutes: 3,
    clockOffsetMs: 0,
    autoCalibrate: true,
    burst: defaultGrabBurst(),
    stopOnCaptcha: true,
    stopOnSessionExpired: true,
    retryWhenFull: true,
  };
}

export function outcomeLabel(outcome: GrabOutcome): string {
  return OUTCOME_LABELS[outcome];
}

/** 抢到手或已选过，都不需要再重试 */
export function isTerminalOutcome(outcome: GrabOutcome): boolean {
  return outcome === "success" || outcome === "duplicate";
}

/** 需要立刻停下来交给人处理的状况 */
export function isBlockingOutcome(outcome: GrabOutcome): boolean {
  return outcome === "captcha" || outcome === "session_expired";
}

export function emptyGrabRun(offsetMs = 0): GrabRunState {
  return { status: "idle", attemptCount: 0, successIds: [], progress: {}, log: [], offsetMs };
}

/**
 * 把捕获到的真实请求体里属于某门课的字面量换成占位符。
 * 学习时抓到的是「选某一门课」的请求，换掉课程标识后才能复用到每门候选课。
 */
export function templatizeSubmitBody(body: string, target: { courseCode?: string; courseName?: string; teacher?: string }): string {
  const replacements: [string | undefined, string][] = [
    [target.courseCode, "{courseCode}"],
    [target.courseName, "{courseName}"],
    [target.teacher, "{teacher}"],
  ];
  let result = body;
  for (const [value, placeholder] of replacements) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    for (const variant of new Set([trimmed, encodeURIComponent(trimmed), formEncode(trimmed)])) {
      if (variant && variant !== trimmed) result = result.split(variant).join(placeholder);
    }
    result = result.split(trimmed).join(placeholder);
  }
  return result;
}

function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function renderSubmitBody(template: GrabSubmitTemplate, target: SelectionTarget, now = new Date()): string {
  const values: Record<string, string> = {
    courseCode: target.courseCode ?? "",
    courseName: target.courseName ?? "",
    teacher: target.teacher ?? "",
    timestamp: String(now.getTime()),
    now: now.toISOString(),
  };
  return template.bodyTemplate.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => {
    const value = values[key];
    return value === undefined ? whole : encodeURIComponent(value);
  });
}

/**
 * 判定一次提交的结果。
 * 先认 JSON（正方教务基本都返回 JSON），再看 HTTP 状态，最后按关键词兜底。
 * 顺序很关键：验证码要先于「失败」判定，否则会被当成普通错误一直重试。
 */
export function classifySubmitResponse(status: number, body: string): { outcome: GrabOutcome; message: string } {
  const text = (body ?? "").trim();
  const lowered = text.toLowerCase();

  const parsed = tryParseJson(text);
  if (parsed) {
    const explicit = readJsonOutcome(parsed);
    if (explicit) return explicit;
  }

  if (status === 401 || status === 403 || status === 419 || status === 302 || status === 301) {
    return { outcome: "session_expired", message: `登录状态失效（HTTP ${status}），请重新登录` };
  }
  if (status >= 500) return { outcome: "error", message: `学校服务器异常（HTTP ${status}）` };
  if (status >= 400) return { outcome: "error", message: `提交被拒绝（HTTP ${status}）` };

  if (/验证码|captcha|checkcode|verifycode|codeimage/i.test(text)) {
    return { outcome: "captcha", message: "学校要求填写验证码，已暂停，请手动完成" };
  }
  if (/登录已过期|会话超时|会话已失效|请重新登录|未登录|重新登陆|login.*expired/i.test(text)) {
    return { outcome: "session_expired", message: "登录已过期，请重新登录" };
  }
  if (/未开始|尚未开始|还没开始|不在选课时间|选课时间|时间未到|未开放|not.*open/i.test(text)) {
    return { outcome: "not_open", message: "选课还没有开放" };
  }
  if (/已满|人数已满|容量已满|没有余量|余量不足|超额|超过.*人数|限选|full/i.test(text)) {
    return { outcome: "full", message: "当前没有余量" };
  }
  if (/已选|已选择|重复|已经选|already|exists|已存在/i.test(text)) {
    return { outcome: "duplicate", message: "这门课已经在你的课表里" };
  }
  if (/成功|success|\bok\b|"flag"\s*:\s*1|"result"\s*:\s*1/i.test(text)) {
    return { outcome: "success", message: "提交成功，请到官网确认" };
  }
  if (!text) return { outcome: "error", message: "学校没有返回内容" };
  return { outcome: "error", message: truncate(text, 120) };
}

/**
 * 下一次重试要等多久：随尝试次数线性拉长，出错额外加罚，再叠加 ±15% 抖动，
 * 避免多门课的请求整齐地撞在一起。
 */
export function nextBurstDelayMs(
  attemptIndex: number,
  burst: GrabBurstConfig,
  consecutiveErrors = 0,
  random: () => number = Math.random,
): number {
  const min = clamp(burst.minIntervalMs, 250, 5_000);
  const max = Math.max(min, clamp(burst.maxIntervalMs, min, 30_000));
  const ramp = Math.min(1, Math.max(0, attemptIndex) / 12);
  const base = min + (max - min) * ramp;
  const penalty = Math.min(4, Math.max(0, consecutiveErrors)) * 250;
  const jitter = 1 + (random() - 0.5) * 0.3;
  return Math.round(clamp(base * jitter + penalty, min, max + penalty));
}

/**
 * 距离开抢还很远时用粗粒度定时器省电，临近时逐步收紧到毫秒级。
 * 返回 null 表示「该自旋了」，交给执行器做最后几十毫秒的忙等。
 */
export function spinWaitDelay(remainingMs: number): number | null {
  if (remainingMs <= 40) return null;
  if (remainingMs <= 500) return Math.max(1, remainingMs - 40);
  if (remainingMs <= 3_000) return Math.max(1, remainingMs - 200);
  if (remainingMs <= 30_000) return Math.max(1, remainingMs - 1_000);
  return Math.min(30_000, Math.max(1, remainingMs - 5_000));
}

export function beginGrabRun(run: GrabRunState, status: GrabRunStatus, at = new Date(), resetStart = false): GrabRunState {
  return { ...run, status, startedAt: resetStart || !run.startedAt ? at.toISOString() : run.startedAt, finishedAt: undefined };
}

export function recordGrabAttempt(run: GrabRunState, record: GrabAttemptRecord): GrabRunState {
  const previous = run.progress[record.targetId];
  const progress: GrabTargetProgress = {
    targetId: record.targetId,
    attempts: (previous?.attempts ?? 0) + 1,
    outcome: record.outcome,
    message: record.message,
    finishedAt: isTerminalOutcome(record.outcome) ? record.at : undefined,
  };
  const successIds = record.outcome === "success" && !run.successIds.includes(record.targetId)
    ? [...run.successIds, record.targetId]
    : run.successIds;
  return {
    ...run,
    attemptCount: run.attemptCount + 1,
    successIds,
    progress: { ...run.progress, [record.targetId]: progress },
    lastMessage: `${outcomeLabel(record.outcome)}：${record.message}`,
    log: appendLog(run.log, {
      at: record.at,
      level: record.outcome === "success" ? "success" : isBlockingOutcome(record.outcome) ? "error" : record.outcome === "error" ? "warn" : "info",
      message: `第 ${progress.attempts} 次 · ${outcomeLabel(record.outcome)} · ${record.message}`,
    }),
  };
}

export function finishGrabRun(run: GrabRunState, status: Extract<GrabRunStatus, "done" | "stopped">, message: string, at = new Date()): GrabRunState {
  return {
    ...run,
    status,
    finishedAt: at.toISOString(),
    lastMessage: message,
    log: appendLog(run.log, { at: at.toISOString(), level: status === "done" ? "success" : "warn", message }),
  };
}

export function appendLog(log: GrabLogEntry[], entry: GrabLogEntry): GrabLogEntry[] {
  return [...log, entry].slice(-80);
}

/** 是否已经没有继续重试的必要了 */
export function shouldStopGrab(run: GrabRunState, config: AutoGrabConfig, targetCount: number, now = new Date()): string | undefined {
  if (run.status !== "running") return undefined;
  if (targetCount > 0 && run.successIds.length >= targetCount) return "全部目标已抢到";
  if (run.startedAt && now.getTime() - Date.parse(run.startedAt) > config.burst.maxRunMs) return "已达到最长抢课时长，自动停止";
  const exhausted = Object.values(run.progress).filter((item) =>
    !isTerminalOutcome(item.outcome ?? "error")
    && (item.attempts ?? 0) >= config.burst.maxAttemptsPerTarget,
  );
  const pending = Math.max(0, targetCount - run.successIds.length);
  if (targetCount > 0 && exhausted.length >= pending && exhausted.length > 0) return "所有课程都已达到最大尝试次数";
  return undefined;
}

/** 单门课是否还需要继续发请求 */
export function targetNeedsAttempt(run: GrabRunState, targetId: string, config: AutoGrabConfig): boolean {
  const progress = run.progress[targetId];
  if (!progress) return true;
  if (isTerminalOutcome(progress.outcome ?? "error")) return false;
  if (progress.outcome === "session_expired" && config.stopOnSessionExpired) return false;
  if (progress.outcome === "captcha") return false;
  if (progress.outcome === "full" && !config.retryWhenFull) return false;
  return (progress.attempts ?? 0) < config.burst.maxAttemptsPerTarget;
}

/**
 * 从固定顺序的候选课中循环取下一批，避免并发数小于候选数时总是重试最前面的课程。
 * 这里只改变公平性，不改变并发数、间隔或总请求上限。
 */
export function selectGrabBatch(
  targets: SelectionTarget[],
  run: GrabRunState,
  config: AutoGrabConfig,
  cursor = 0,
): GrabBatchSelection {
  if (!targets.length) return { targets: [], nextCursor: 0 };
  const start = ((Math.trunc(cursor) % targets.length) + targets.length) % targets.length;
  const limit = Math.min(targets.length, config.burst.concurrency);
  const selected: SelectionTarget[] = [];
  let scanned = 0;
  while (scanned < targets.length && selected.length < limit) {
    const target = targets[(start + scanned) % targets.length];
    if (targetNeedsAttempt(run, target.id, config)) selected.push(target);
    scanned += 1;
  }
  return { targets: selected, nextCursor: (start + scanned) % targets.length };
}

export function grabProgressText(run: GrabRunState, targetCount: number): string {
  if (run.status === "running") return `已发起 ${run.attemptCount} 次 · 成功 ${run.successIds.length}/${targetCount}`;
  if (run.status === "done") return `完成 · 成功 ${run.successIds.length}/${targetCount}`;
  if (run.status === "stopped") return `已停止 · 成功 ${run.successIds.length}/${targetCount}`;
  if (run.status === "armed") return "已就绪，等待开抢";
  if (run.status === "prewarm") return "正在预热登录会话";
  if (run.status === "calibrating") return "正在校准学校服务器时间";
  return "尚未开始";
}

export function normalizeAutoGrabConfig(value: unknown): AutoGrabConfig {
  if (!isRecord(value)) return defaultAutoGrabConfig();
  const burst = isRecord(value.burst) ? value.burst : {};
  const minIntervalMs = Math.round(clamp(numberOr(burst.minIntervalMs, 500), 250, 5_000));
  const maxIntervalMs = Math.round(clamp(numberOr(burst.maxIntervalMs, 2_000), minIntervalMs, 30_000));
  const startsAt = safeIsoDate(value.startsAt);
  return {
    enabled: Boolean(value.enabled),
    startsAt,
    prewarmMinutes: Math.round(clamp(numberOr(value.prewarmMinutes, 3), 0, 30)),
    clockOffsetMs: Math.round(clamp(numberOr(value.clockOffsetMs, 0), -86_400_000, 86_400_000)),
    clockCalibratedAt: safeIsoDate(value.clockCalibratedAt),
    autoCalibrate: value.autoCalibrate !== false,
    template: normalizeTemplate(value.template),
    burst: {
      concurrency: Math.round(clamp(numberOr(burst.concurrency, 2), 1, 3)),
      minIntervalMs,
      maxIntervalMs,
      maxAttemptsPerTarget: Math.round(clamp(numberOr(burst.maxAttemptsPerTarget, 40), 1, 200)),
      maxRunMs: Math.round(clamp(numberOr(burst.maxRunMs, 180_000), 30_000, 1_800_000)),
    },
    stopOnCaptcha: true,
    stopOnSessionExpired: value.stopOnSessionExpired !== false,
    retryWhenFull: value.retryWhenFull !== false,
  };
}

function normalizeTemplate(value: unknown): GrabSubmitTemplate | undefined {
  if (!isRecord(value)) return undefined;
  const endpointUrl = typeof value.endpointUrl === "string" ? value.endpointUrl.trim() : "";
  // 这里只做基本清洗；协议和同域校验由原生层在真正发请求时把关，
  // 否则用户还没输完整的 https 地址就会被归一化清掉。
  if (!endpointUrl) return undefined;
  const method = value.method === "GET" ? "GET" : "POST";
  return {
    endpointUrl: endpointUrl.slice(0, 2_048),
    method,
    bodyTemplate: typeof value.bodyTemplate === "string" ? value.bodyTemplate.slice(0, 8_000) : "",
    contentType: typeof value.contentType === "string" && value.contentType.trim()
      ? value.contentType.trim().slice(0, 200)
      : "application/x-www-form-urlencoded;charset=UTF-8",
  };
}

function tryParseJson(text: string): unknown {
  if (!text.startsWith("{") && !text.startsWith("[")) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readJsonOutcome(value: unknown): { outcome: GrabOutcome; message: string } | undefined {
  const record = firstRecord(value);
  if (!record) return undefined;
  const message = pickString(record, ["msg", "message", "messageInfo", "info", "resultMsg", "errorMsg"]) ?? "";
  const flag = pickValue(record, ["flag", "success", "result", "code", "status", "isSuccess"]);

  if (message) {
    const messageOutcome = outcomeFromMessage(message);
    if (messageOutcome !== "error") return { outcome: messageOutcome, message };
  }
  if (isTruthyFlag(flag)) return { outcome: "success", message: message || "提交成功，请到官网确认" };
  if (isKnownFailureFlag(flag)) {
    const outcome = outcomeFromMessage(message);
    return { outcome, message: message || outcomeLabel(outcome) };
  }
  return undefined;
}

function outcomeFromMessage(message: string): GrabOutcome {
  const text = message.toLowerCase();
  if (/验证码|captcha|checkcode/i.test(message)) return "captcha";
  if (/过期|重新登录|未登录|relogin|login/i.test(text)) return "session_expired";
  if (/未开始|尚未开始|不在选课时间|时间未到|未开放/i.test(message)) return "not_open";
  if (/已满|没有余量|余量不足|超额|限选|人数/i.test(message)) return "full";
  if (/已选|重复|已经选|already|exists/i.test(text)) return "duplicate";
  return "error";
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value.trim() === "1" || value.trim().toLowerCase() === "true" || value.trim().toLowerCase() === "success";
  return false;
}

function isKnownFailureFlag(value: unknown): boolean {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value === 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "0" || normalized === "false" || normalized === "error" || normalized === "fail";
  }
  return false;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return firstRecord(value[0]);
  if (isRecord(value)) return value;
  return undefined;
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const direct = record[key];
    if (direct !== undefined) return direct;
    const lowered = Object.keys(record).find((item) => item.toLowerCase() === key.toLowerCase());
    if (lowered) return record[lowered];
  }
  return undefined;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  const value = pickValue(record, keys);
  return typeof value === "string" ? value.trim() : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function safeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
