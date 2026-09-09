/**
 * 教务服务器时钟校准。
 *
 * 抢课的成败往往取决于几百毫秒：本机时钟和学校服务器时钟经常相差几秒，
 * 直接用本地时间定时会错过开放瞬间。这里用一次 HTTP 往返估算偏移，
 * 让「到点」以学校服务器的时间为准。
 */

export interface ClockSample {
  /** 请求发出时的本地时间戳（毫秒） */
  sentAt: number;
  /** 收到响应头时的本地时间戳（毫秒） */
  receivedAt: number;
  /** 服务端 `Date` 响应头解析出的时间戳（毫秒），缺失时该样本不参与计算 */
  serverTimeMs?: number;
}

export interface ClockCalibration {
  /** 服务端时间 ≈ 本地时间 + offsetMs */
  offsetMs: number;
  /** 最优样本的往返时延 */
  rttMs: number;
  samples: number;
  calibratedAt: string;
  source: "server-date" | "uncalibrated";
}

export interface ClockProbeResult {
  sentAt: number;
  receivedAt: number;
  serverTimeMs?: number;
}

export const UNCALIBRATED: ClockCalibration = {
  offsetMs: 0,
  rttMs: 0,
  samples: 0,
  calibratedAt: new Date(0).toISOString(),
  source: "uncalibrated",
};

/**
 * 用最小往返时延的样本估算时钟偏移，和 NTP 的思路一致：
 * 偏移 = 服务端时间 + RTT / 2 - 本地接收时间。
 * 往返越慢误差越大，所以只把延迟同量级的样本一起平均，慢请求直接丢掉。
 */
export function calibrateClock(samples: ClockSample[], now = new Date()): ClockCalibration {
  const usable = samples
    .filter((sample) => Number.isFinite(sample.serverTimeMs))
    .filter((sample) => Number.isFinite(sample.sentAt) && Number.isFinite(sample.receivedAt))
    .filter((sample) => sample.receivedAt >= sample.sentAt)
    .map((sample) => ({
      rttMs: sample.receivedAt - sample.sentAt,
      offsetMs: Math.round((sample.serverTimeMs as number) + (sample.receivedAt - sample.sentAt) / 2 - sample.receivedAt),
    }))
    .filter((sample) => Number.isFinite(sample.offsetMs) && Math.abs(sample.offsetMs) < 24 * 60 * 60 * 1_000);

  if (!usable.length) return { ...UNCALIBRATED, calibratedAt: now.toISOString() };

  const best = usable.reduce((left, right) => (right.rttMs < left.rttMs ? right : left));
  // 只信任延迟和最优样本同量级的测量，慢请求里的时间不确定性太大。
  const close = usable.filter((sample) => sample.rttMs <= best.rttMs * 2 + 50);
  const offsetMs = Math.round(close.reduce((total, item) => total + item.offsetMs, 0) / close.length);
  return {
    offsetMs,
    rttMs: best.rttMs,
    samples: usable.length,
    calibratedAt: now.toISOString(),
    source: "server-date",
  };
}

/** 把本地时间换算成学校服务器时间 */
export function serverNow(offsetMs: number, localNow = Date.now()): number {
  return localNow + (Number.isFinite(offsetMs) ? offsetMs : 0);
}

/** 距离服务器时间意义上「开始」还有多少毫秒，负数表示已经到点 */
export function serverRemainingMs(startsAt: string, offsetMs: number, localNow = Date.now()): number {
  const target = Date.parse(startsAt);
  if (!Number.isFinite(target)) return Number.NaN;
  return target - serverNow(offsetMs, localNow);
}

export function formatSkew(offsetMs: number): string {
  if (!Number.isFinite(offsetMs) || offsetMs === 0) return "±0.00 秒";
  const sign = offsetMs > 0 ? "+" : "−";
  return `${sign}${(Math.abs(offsetMs) / 1_000).toFixed(2)} 秒`;
}

export function isCalibrated(value: ClockCalibration | undefined): boolean {
  return Boolean(value && value.source === "server-date");
}
