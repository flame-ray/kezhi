export type SelectionTargetStatus = "watching" | "paused" | "available" | "submitted" | "failed" | "unknown";

export interface PortalFormSignal {
  action: string;
  method: string;
  fields: string[];
}

export interface PortalLinkSignal {
  url: string;
  text: string;
}

export interface PortalResourceSignal {
  url: string;
  initiatorType: string;
}

export interface PortalPageSnapshot {
  pageUrl: string;
  title: string;
  headings: string[];
  forms: PortalFormSignal[];
  links: PortalLinkSignal[];
  resources: PortalResourceSignal[];
}

export interface PortalEndpointCandidate {
  url: string;
  label: string;
  source: "form" | "link" | "resource" | "page";
  method: "GET" | "POST" | "UNKNOWN";
  safeToPoll: boolean;
  score: number;
}

export interface LearnedPortalAdapter {
  id: string;
  origin: string;
  portalUrl: string;
  pageTitle: string;
  systemHint: "正方" | "青果" | "URP" | "未知系统";
  confidence: number;
  learnedAt: string;
  monitorEndpoint?: string;
  entryUrl: string;
  evidence: string[];
  candidates: PortalEndpointCandidate[];
}

export interface SelectionTarget {
  id: string;
  courseCode: string;
  courseName: string;
  teacher?: string;
  priority: 1 | 2 | 3;
  status: SelectionTargetStatus;
  availableSeats?: number;
  capacity?: number;
  lastCheckedAt?: string;
  lastMessage?: string;
}

export type SelectionScheduleStatus = "scheduled" | "triggered" | "expired";

export interface SelectionRunSchedule {
  startsAt: string;
  preflightMinutes: 1 | 3 | 5 | 10;
  status: SelectionScheduleStatus;
  lastTriggeredAt?: string;
}

export interface SelectionAssistantState {
  portalUrl: string;
  adapter?: LearnedPortalAdapter;
  targets: SelectionTarget[];
  monitorEnabled: boolean;
  intervalSeconds: number;
  requireConfirmation: true;
  consecutiveFailures: number;
  schedule?: SelectionRunSchedule;
}

export interface SeatObservation {
  status: "available" | "full" | "unknown";
  availableSeats?: number;
  capacity?: number;
  message: string;
}

export interface SelectionMonitorResult {
  state: SelectionAssistantState;
  availableCount: number;
}

export type SelectionSchedulePhase = "inactive" | "waiting" | "preflight" | "due" | "triggered" | "expired";

const selectionKeywords = ["选课", "课程选择", "选课中心", "elective", "courseselect", "course-select", "course_selection", "xsxk", "xk/", "xk."];
const seatKeywords = ["余量", "剩余", "容量", "可选", "available", "remaining", "vacancy", "capacity", "quota"];

export function defaultSelectionAssistant(portalUrl = ""): SelectionAssistantState {
  return {
    portalUrl: safeHttpsUrl(portalUrl) ?? "",
    targets: [],
    monitorEnabled: false,
    intervalSeconds: 45,
    requireConfirmation: true,
    consecutiveFailures: 0,
  };
}

export function normalizeSelectionAssistant(value: unknown): SelectionAssistantState {
  if (!isRecord(value)) return defaultSelectionAssistant();
  const portalUrl = safeHttpsUrl(value.portalUrl) ?? "";
  const targets = Array.isArray(value.targets) ? value.targets.slice(0, 100).map(parseTarget).filter((target): target is SelectionTarget => Boolean(target)) : [];
  const intervalSeconds = typeof value.intervalSeconds === "number" && Number.isFinite(value.intervalSeconds)
    ? Math.min(600, Math.max(30, Math.round(value.intervalSeconds)))
    : 45;
  return {
    portalUrl,
    adapter: parseAdapter(value.adapter),
    targets,
    monitorEnabled: Boolean(value.monitorEnabled),
    intervalSeconds,
    requireConfirmation: true,
    consecutiveFailures: integerInRange(value.consecutiveFailures, 0, 20) ?? 0,
    schedule: parseSchedule(value.schedule),
  };
}

export function armSelectionSchedule(
  state: SelectionAssistantState,
  startsAt: string,
  preflightMinutes: number,
  now = new Date(),
): SelectionAssistantState {
  const parsed = Date.parse(startsAt);
  const allowedPreflight = [1, 3, 5, 10].includes(preflightMinutes) ? preflightMinutes as 1 | 3 | 5 | 10 : 5;
  if (!Number.isFinite(parsed)) throw new Error("请选择有效的选课开始时间");
  if (parsed < now.getTime() + 5_000) throw new Error("预约时间至少需要晚于现在 5 秒");
  if (parsed > now.getTime() + 366 * 24 * 60 * 60 * 1_000) throw new Error("预约时间不能超过一年");
  return {
    ...state,
    schedule: {
      startsAt: new Date(parsed).toISOString(),
      preflightMinutes: allowedPreflight,
      status: "scheduled",
    },
    requireConfirmation: true,
  };
}

export function selectionSchedulePhase(schedule: SelectionRunSchedule | undefined, now = new Date()): SelectionSchedulePhase {
  if (!schedule) return "inactive";
  if (schedule.status === "triggered") return "triggered";
  if (schedule.status === "expired") return "expired";
  const remaining = Date.parse(schedule.startsAt) - now.getTime();
  if (remaining < -15 * 60_000) return "expired";
  if (remaining <= 0) return "due";
  if (remaining <= schedule.preflightMinutes * 60_000) return "preflight";
  return "waiting";
}

export function markSelectionScheduleTriggered(state: SelectionAssistantState, now = new Date()): SelectionAssistantState {
  if (!state.schedule) return state;
  return {
    ...state,
    schedule: { ...state.schedule, status: "triggered", lastTriggeredAt: now.toISOString() },
    requireConfirmation: true,
  };
}

export function expireSelectionSchedule(state: SelectionAssistantState): SelectionAssistantState {
  if (!state.schedule) return state;
  return { ...state, schedule: { ...state.schedule, status: "expired" }, requireConfirmation: true };
}

export function learnSelectionInterface(snapshot: PortalPageSnapshot, portalUrl: string, now = new Date()): LearnedPortalAdapter {
  const safePortal = safeHttpsUrl(portalUrl);
  const pageUrl = safeHttpsUrl(snapshot.pageUrl);
  if (!safePortal || !pageUrl) throw new Error("学习页面必须来自有效的 HTTPS 教务网址");
  const origin = new URL(safePortal).origin;
  if (new URL(pageUrl).origin !== origin) throw new Error("学习页面与填写的教务网址不在同一站点");

  const rawCandidates: PortalEndpointCandidate[] = [
    candidate(pageUrl, snapshot.title, "page", "GET", origin),
    ...snapshot.forms.map((form) => candidate(form.action || pageUrl, `${form.action} ${form.fields.join(" ")}`, "form", normalizeMethod(form.method), origin)),
    ...snapshot.links.map((link) => candidate(link.url, `${link.text} ${link.url}`, "link", "GET", origin)),
    ...snapshot.resources.map((resource) => candidate(resource.url, `${resource.initiatorType} ${resource.url}`, "resource", "UNKNOWN", origin)),
  ].filter((item): item is PortalEndpointCandidate => Boolean(item));

  const candidates = dedupeCandidates(rawCandidates)
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
  const primary = candidates.find((item) => item.safeToPoll && item.source === "form")
    ?? candidates.find((item) => item.safeToPoll && item.source !== "page")
    ?? candidates.find((item) => item.safeToPoll);
  const evidence = [
    ...snapshot.headings.filter((text) => containsKeyword(text, selectionKeywords)),
    ...candidates.slice(0, 3).map((item) => `${sourceLabel(item.source)}：${new URL(item.url).pathname}`),
  ].slice(0, 5);
  const context = [safePortal, pageUrl, snapshot.title, ...snapshot.headings, ...candidates.map((item) => item.url)].join(" ").toLowerCase();
  const confidence = Math.min(98, Math.max(18, Math.round((candidates[0]?.score ?? 0) * 8 + evidence.length * 5)));
  return {
    id: `adapter-${hashText(origin)}`,
    origin,
    portalUrl: safePortal,
    pageTitle: cleanText(snapshot.title, 120) || new URL(pageUrl).hostname,
    systemHint: inferSystem(context),
    confidence,
    learnedAt: now.toISOString(),
    monitorEndpoint: primary?.url,
    entryUrl: candidates.find((item) => item.source === "link" || item.source === "page")?.url ?? pageUrl,
    evidence: evidence.length ? evidence : ["已记录当前教务页面，尚未发现明确的选课入口"],
    candidates,
  };
}

export function observeSeatAvailability(payload: string, target: Pick<SelectionTarget, "courseCode" | "courseName">): SeatObservation {
  const trimmed = payload.trim();
  if (!trimmed) return { status: "unknown", message: "接口没有返回内容" };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const records = collectRecords(parsed, 0);
    const matched = records.find((record) => recordMatches(record, target));
    if (matched) {
      const available = pickNumeric(matched, ["availableSeats", "available", "remaining", "remain", "vacancy", "余量", "剩余", "yl", "syrs"]);
      const capacity = pickNumeric(matched, ["capacity", "quota", "limit", "max", "容量", "jxbrl", "krl"]);
      if (available !== undefined) return seatResult(available, capacity);
    }
  } catch {
    // HTML and text responses are handled below.
  }

  const normalized = stripMarkup(trimmed);
  const targetToken = target.courseCode.trim() || target.courseName.trim();
  const index = targetToken ? normalized.toLowerCase().indexOf(targetToken.toLowerCase()) : 0;
  if (index < 0) return { status: "unknown", message: "返回内容中未找到这门课程" };
  const nearby = normalized.slice(Math.max(0, index - 120), index + targetToken.length + 360);
  const availableMatch = nearby.match(/(?:余量|剩余|可选|available|remaining|vacancy)\s*[:：]?\s*(\d{1,5})/i);
  const capacityMatch = nearby.match(/(?:容量|上限|capacity|quota|limit)\s*[:：]?\s*(\d{1,5})/i);
  if (!availableMatch) return { status: "unknown", message: "找到了课程，但无法识别余量字段" };
  return seatResult(Number(availableMatch[1]), capacityMatch ? Number(capacityMatch[1]) : undefined);
}

export function nextMonitorDelaySeconds(intervalSeconds: number, consecutiveFailures: number): number {
  const base = Math.min(600, Math.max(30, Math.round(intervalSeconds)));
  return Math.min(15 * 60, base * 2 ** Math.min(4, Math.max(0, Math.round(consecutiveFailures))));
}

export function applySeatPayload(state: SelectionAssistantState, payload: string, checkedAt = new Date()): SelectionMonitorResult {
  let availableCount = 0;
  const timestamp = checkedAt.toISOString();
  const targets = state.targets.map((target) => {
    if (target.status === "submitted") return target;
    const observation = observeSeatAvailability(payload, target);
    if (observation.status === "available") availableCount += 1;
    return {
      ...target,
      status: observation.status === "available" ? "available" as const : observation.status === "full" ? "watching" as const : "unknown" as const,
      availableSeats: observation.availableSeats,
      capacity: observation.capacity,
      lastCheckedAt: timestamp,
      lastMessage: observation.message,
    };
  });
  return { state: { ...state, targets, consecutiveFailures: 0, requireConfirmation: true }, availableCount };
}

export function recordMonitorFailure(state: SelectionAssistantState, message: string, checkedAt = new Date()): SelectionAssistantState {
  const timestamp = checkedAt.toISOString();
  return {
    ...state,
    consecutiveFailures: Math.min(20, state.consecutiveFailures + 1),
    targets: state.targets.map((target) => target.status === "submitted" ? target : { ...target, status: "failed", lastCheckedAt: timestamp, lastMessage: message }),
    requireConfirmation: true,
  };
}

function candidate(rawUrl: string, label: string, source: PortalEndpointCandidate["source"], method: PortalEndpointCandidate["method"], origin: string): PortalEndpointCandidate | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl, origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) return undefined;
  url.hash = "";
  const haystack = `${label} ${url.pathname} ${url.search}`.toLowerCase();
  let score = selectionKeywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 3 : 0), 0);
  score += seatKeywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
  if (/login|logout|captcha|password|auth/.test(haystack)) score -= 4;
  return {
    url: url.href,
    label: cleanText(label, 100) || url.pathname,
    source,
    method,
    safeToPoll: method === "GET" && !/logout|delete|drop|submit|confirm|save/i.test(url.href),
    score,
  };
}

function dedupeCandidates(items: PortalEndpointCandidate[]): PortalEndpointCandidate[] {
  const map = new Map<string, PortalEndpointCandidate>();
  for (const item of items) {
    const key = `${item.method}:${item.url}`;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) map.set(key, item);
  }
  return [...map.values()];
}

function normalizeMethod(value: string): PortalEndpointCandidate["method"] {
  const normalized = value.trim().toUpperCase();
  return normalized === "GET" ? "GET" : normalized === "POST" ? "POST" : "UNKNOWN";
}

function inferSystem(text: string): LearnedPortalAdapter["systemHint"] {
  if (/jwglxt|zhengfang|正方/.test(text)) return "正方";
  if (/kingosoft|青果|jsxsd/.test(text)) return "青果";
  if (/urp|jwxt|综合教务/.test(text)) return "URP";
  return "未知系统";
}

function parseTarget(value: unknown): SelectionTarget | undefined {
  if (!isRecord(value)) return undefined;
  const id = cleanText(value.id, 120);
  const courseName = cleanText(value.courseName, 160);
  const courseCode = cleanText(value.courseCode, 120);
  if (!id || (!courseName && !courseCode)) return undefined;
  const statuses: SelectionTargetStatus[] = ["watching", "paused", "available", "submitted", "failed", "unknown"];
  return {
    id,
    courseName,
    courseCode,
    teacher: cleanText(value.teacher, 120) || undefined,
    priority: (integerInRange(value.priority, 1, 3) ?? 2) as 1 | 2 | 3,
    status: statuses.includes(value.status as SelectionTargetStatus) ? value.status as SelectionTargetStatus : "paused",
    availableSeats: integerInRange(value.availableSeats, 0, 100_000),
    capacity: integerInRange(value.capacity, 0, 100_000),
    lastCheckedAt: safeIsoDate(value.lastCheckedAt),
    lastMessage: cleanText(value.lastMessage, 300) || undefined,
  };
}

function parseAdapter(value: unknown): LearnedPortalAdapter | undefined {
  if (!isRecord(value)) return undefined;
  const portalUrl = safeHttpsUrl(value.portalUrl);
  const origin = typeof value.origin === "string" ? value.origin : undefined;
  if (!portalUrl || !origin || new URL(portalUrl).origin !== origin) return undefined;
  const candidates = Array.isArray(value.candidates) ? value.candidates.slice(0, 12).map(parseCandidate).filter((item): item is PortalEndpointCandidate => Boolean(item)) : [];
  const hints: LearnedPortalAdapter["systemHint"][] = ["正方", "青果", "URP", "未知系统"];
  return {
    id: cleanText(value.id, 120) || `adapter-${hashText(origin)}`,
    origin,
    portalUrl,
    pageTitle: cleanText(value.pageTitle, 120) || new URL(portalUrl).hostname,
    systemHint: hints.includes(value.systemHint as LearnedPortalAdapter["systemHint"]) ? value.systemHint as LearnedPortalAdapter["systemHint"] : "未知系统",
    confidence: integerInRange(value.confidence, 0, 100) ?? 0,
    learnedAt: safeIsoDate(value.learnedAt) ?? new Date(0).toISOString(),
    monitorEndpoint: safeSameOriginUrl(value.monitorEndpoint, origin),
    entryUrl: safeSameOriginUrl(value.entryUrl, origin) ?? portalUrl,
    evidence: Array.isArray(value.evidence) ? value.evidence.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 5) : [],
    candidates,
  };
}

function parseSchedule(value: unknown): SelectionRunSchedule | undefined {
  if (!isRecord(value)) return undefined;
  const startsAt = safeIsoDate(value.startsAt);
  const preflight = integerInRange(value.preflightMinutes, 1, 10);
  const statuses: SelectionScheduleStatus[] = ["scheduled", "triggered", "expired"];
  if (!startsAt || !preflight || ![1, 3, 5, 10].includes(preflight) || !statuses.includes(value.status as SelectionScheduleStatus)) return undefined;
  return {
    startsAt,
    preflightMinutes: preflight as 1 | 3 | 5 | 10,
    status: value.status as SelectionScheduleStatus,
    lastTriggeredAt: safeIsoDate(value.lastTriggeredAt),
  };
}

function parseCandidate(value: unknown): PortalEndpointCandidate | undefined {
  if (!isRecord(value)) return undefined;
  const url = safeHttpsUrl(value.url);
  const sources: PortalEndpointCandidate["source"][] = ["form", "link", "resource", "page"];
  const methods: PortalEndpointCandidate["method"][] = ["GET", "POST", "UNKNOWN"];
  if (!url || !sources.includes(value.source as PortalEndpointCandidate["source"]) || !methods.includes(value.method as PortalEndpointCandidate["method"])) return undefined;
  return {
    url,
    label: cleanText(value.label, 100),
    source: value.source as PortalEndpointCandidate["source"],
    method: value.method as PortalEndpointCandidate["method"],
    safeToPoll: Boolean(value.safeToPoll),
    score: integerInRange(value.score, -20, 100) ?? 0,
  };
}

function collectRecords(value: unknown, depth: number): Record<string, unknown>[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectRecords(item, depth + 1));
  if (!isRecord(value)) return [];
  return [value, ...Object.values(value).flatMap((item) => collectRecords(item, depth + 1))].slice(0, 5_000);
}

function recordMatches(record: Record<string, unknown>, target: Pick<SelectionTarget, "courseCode" | "courseName">): boolean {
  const text = Object.values(record).filter((value) => typeof value === "string" || typeof value === "number").join(" ").toLowerCase();
  const code = target.courseCode.trim().toLowerCase();
  const name = target.courseName.trim().toLowerCase();
  return Boolean((code && text.includes(code)) || (name && text.includes(name)));
}

function pickNumeric(record: Record<string, unknown>, keys: string[]): number | undefined {
  const entry = Object.entries(record).find(([key]) => keys.includes(key.toLowerCase()));
  if (!entry) return undefined;
  const number = typeof entry[1] === "number" ? entry[1] : Number(String(entry[1]).trim());
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
}

function seatResult(availableSeats: number, capacity?: number): SeatObservation {
  return availableSeats > 0
    ? { status: "available", availableSeats, capacity, message: `发现 ${availableSeats} 个余量，请前往官方页面确认` }
    : { status: "full", availableSeats: 0, capacity, message: "当前没有余量" };
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function safeSameOriginUrl(value: unknown, origin: string): string | undefined {
  const url = safeHttpsUrl(value);
  return url && new URL(url).origin === origin ? url : undefined;
}

function containsKeyword(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function sourceLabel(source: PortalEndpointCandidate["source"]): string {
  return { form: "表单", link: "入口", resource: "网络资源", page: "当前页面" }[source];
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function integerInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function safeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function stripMarkup(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
