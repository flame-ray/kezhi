import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applySeatPayload, armSelectionSchedule, defaultSelectionAssistant, learnSelectionInterface, recordMonitorFailure, selectionSchedulePhase, type PortalPageSnapshot, type SelectionAssistantState, type SelectionTarget } from "../selection/selectionAssistant";
import { Icon } from "../ui/Icon";

interface SelectionAssistantPageProps {
  state?: SelectionAssistantState;
  nativeAvailable: boolean;
  onChange: (state: SelectionAssistantState) => void;
  onOpenPortal: (url: string) => Promise<void>;
  onReadPortal: (url: string) => Promise<PortalPageSnapshot>;
  onFetchResource: (portalUrl: string, endpointUrl: string) => Promise<string>;
  onToast: (message: string) => void;
}

const statusLabels: Record<SelectionTarget["status"], string> = {
  watching: "监控中",
  paused: "已暂停",
  available: "发现余量",
  submitted: "已完成",
  failed: "检查失败",
  unknown: "等待识别",
};

export function SelectionAssistantPage({ state: suppliedState, nativeAvailable, onChange, onOpenPortal, onReadPortal, onFetchResource, onToast }: SelectionAssistantPageProps) {
  const state = suppliedState ?? defaultSelectionAssistant();
  const [learning, setLearning] = useState(false);
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [scheduleTime, setScheduleTime] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 10 * 60_000)));
  const [preflightMinutes, setPreflightMinutes] = useState(5);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const checkingRef = useRef(false);
  const safeCandidates = useMemo(() => state.adapter?.candidates.filter((candidate) => candidate.safeToPoll) ?? [], [state.adapter]);
  const schedulePhase = selectionSchedulePhase(state.schedule, new Date(clockNow));
  const scheduleRemaining = state.schedule ? Math.max(0, Date.parse(state.schedule.startsAt) - clockNow) : 0;

  useEffect(() => {
    if (!state.schedule || state.schedule.status !== "scheduled") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [state.schedule]);

  const update = (patch: Partial<SelectionAssistantState>) => onChange({ ...state, ...patch, requireConfirmation: true });

  const startLearning = async () => {
    if (!validPortalUrl(state.portalUrl)) {
      onToast("请先填写有效的 HTTPS 教务系统网址");
      return;
    }
    if (!nativeAvailable) {
      onToast("接口学习需要 Windows 或 Android 原生版");
      return;
    }
    try {
      setLearning(true);
      await onOpenPortal(state.portalUrl);
      onToast("请登录并进入选课页面，完成一次课程查询后返回课织");
    } catch (error) {
      setLearning(false);
      onToast(error instanceof Error ? error.message : String(error));
    }
  };

  const finishLearning = async () => {
    try {
      setReading(true);
      const snapshot = await onReadPortal(state.portalUrl);
      const adapter = learnSelectionInterface(snapshot, state.portalUrl);
      update({ adapter, monitorEnabled: false, consecutiveFailures: 0 });
      setLearning(false);
      onToast(adapter.monitorEndpoint ? `已找到 ${adapter.candidates.length} 个候选入口` : "已记录页面，但还没有发现可安全轮询的 GET 接口");
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      setReading(false);
    }
  };

  const addTarget = () => {
    if (!courseName.trim() && !courseCode.trim()) {
      onToast("请填写课程名称或课程编号");
      return;
    }
    const target: SelectionTarget = {
      id: newId("selection"),
      courseCode: courseCode.trim().slice(0, 120),
      courseName: courseName.trim().slice(0, 160),
      teacher: teacher.trim().slice(0, 120) || undefined,
      priority: Math.min(3, state.targets.length + 1) as 1 | 2 | 3,
      status: "paused",
    };
    update({ targets: [...state.targets, target] });
    setCourseCode("");
    setCourseName("");
    setTeacher("");
  };

  const runCheck = useCallback(async (interactive: boolean) => {
    if (checkingRef.current || !state.adapter?.monitorEndpoint || state.targets.length === 0) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const body = await onFetchResource(state.portalUrl, state.adapter.monitorEndpoint);
      const result = applySeatPayload(state, body);
      onChange(result.state);
      if (result.availableCount) onToast(`发现 ${result.availableCount} 门课程有余量，请到官方页面确认`);
      else if (interactive) onToast("已完成检查，暂未发现可选余量");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onChange(recordMonitorFailure(state, message));
      if (interactive) onToast(message);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [onChange, onFetchResource, onToast, state]);

  const openOfficialPage = () => {
    const url = state.adapter?.entryUrl || state.portalUrl;
    if (url) void onOpenPortal(url).catch((error) => onToast(error instanceof Error ? error.message : String(error)));
  };

  const armSchedule = () => {
    if (!nativeAvailable || !state.adapter || !state.targets.length) {
      onToast("请先学习选课入口并添加候选课程");
      return;
    }
    try {
      const armed = armSelectionSchedule({ ...state, monitorEnabled: false }, scheduleTime, preflightMinutes);
      onChange(armed);
      setClockNow(Date.now());
      onToast("预约已保存；系统会在预热和开始时提醒你");
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="view-stage data-page-stage" key="selection">
      <section className="selection-page page-surface">
        <header className="module-hero selection-hero"><div><span className="eyebrow">LOCAL PORTAL LEARNER</span><h2>通用选课助手</h2><p>学习学校官方页面、监控余量，最终选课始终由你确认。</p></div><span className="safety-chip"><Icon name="shield" />同域只读 · 最短 30 秒</span></header>

        <div className="selection-grid">
          <section className="selection-setup-card">
            <div className="section-heading"><span className="step-badge">1</span><div><h3>学习学校选课入口</h3><p>登录后进入选课页并查询一次，课织会读取页面结构和已访问资源地址。</p></div></div>
            <label className="portal-url-field"><Icon name="school" /><input value={state.portalUrl} onChange={(event) => update({ portalUrl: event.target.value, adapter: event.target.value === state.portalUrl ? state.adapter : undefined, monitorEnabled: false })} placeholder="https://学校教务系统登录网址" inputMode="url" /></label>
            <div className="learning-actions"><button className="primary-button" disabled={!nativeAvailable} onClick={() => void startLearning()}><Icon name="search" />{learning ? "继续浏览学校页面" : "打开页面开始学习"}</button><button className="soft-button" disabled={!learning || reading} onClick={() => void finishLearning()}><Icon name="check" />{reading ? "正在分析" : "我已进入选课页，读取"}</button></div>
            {!nativeAvailable && <div className="inline-warning"><Icon name="warning" />浏览器预览不能读取学校会话，请安装 Windows 或 Android 原生版。</div>}
            {state.adapter && <div className="adapter-result"><div className="adapter-score"><strong>{state.adapter.confidence}%</strong><span>识别置信度</span></div><div><strong>{state.adapter.systemHint} · {state.adapter.pageTitle}</strong><span>{state.adapter.monitorEndpoint ? "已找到可安全轮询的只读入口" : "已记录入口，需要继续浏览或手动选择候选"}</span><small>{state.adapter.evidence.join(" · ")}</small></div></div>}
            {state.adapter && safeCandidates.length > 0 && <label className="field endpoint-select"><span>余量查询入口</span><select value={state.adapter.monitorEndpoint ?? ""} onChange={(event) => update({ adapter: { ...state.adapter!, monitorEndpoint: event.target.value || undefined }, monitorEnabled: false })}><option value="">暂不启用监控</option>{safeCandidates.map((candidate) => <option key={candidate.url} value={candidate.url}>{candidate.method} · {shortEndpoint(candidate.url)}</option>)}</select><small>只列出同域 HTTPS 且不会提交、退选或保存的 GET 地址</small></label>}
          </section>

          <section className="selection-target-card">
            <div className="section-heading"><span className="step-badge">2</span><div><h3>添加候选课程</h3><p>课程编号最准确，也可只填写名称和教师。</p></div></div>
            <div className="selection-target-form"><input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="课程编号" /><input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="课程名称" /><input value={teacher} onChange={(event) => setTeacher(event.target.value)} placeholder="教师（可选）" /><button className="icon-button" onClick={addTarget} aria-label="添加候选课程"><Icon name="plus" /></button></div>
            <div className="selection-target-list">{state.targets.length ? state.targets.map((target, index) => <article className={`selection-target status-${target.status}`} key={target.id}><span className="target-priority">P{target.priority}</span><div><strong>{target.courseName || target.courseCode}</strong><small>{target.courseCode || "未填写编号"}{target.teacher ? ` · ${target.teacher}` : ""}</small><span>{target.lastMessage ?? statusLabels[target.status]}</span></div>{target.availableSeats !== undefined && <b>{target.availableSeats}<small>余量</small></b>}<button className="icon-button" onClick={() => update({ targets: state.targets.filter((item) => item.id !== target.id), monitorEnabled: state.targets.length > 1 && state.monitorEnabled })} aria-label={`删除第${index + 1}个候选`}><Icon name="trash" /></button></article>) : <div className="small-empty">至少添加一门候选课程后才能监控</div>}</div>
          </section>
        </div>

        <section className="selection-monitor-card">
            <div className="section-heading"><span className="step-badge">3</span><div><h3>余量监控</h3><p>切换到其他页面后仍会继续；连续失败会自动降低频率。</p></div></div>
          <div className="monitor-controls"><label><span>检查间隔</span><select value={state.intervalSeconds} onChange={(event) => update({ intervalSeconds: Number(event.target.value) })}><option value="30">30 秒</option><option value="45">45 秒</option><option value="60">1 分钟</option><option value="120">2 分钟</option><option value="300">5 分钟</option></select></label><button className="soft-button" disabled={!nativeAvailable || !state.adapter?.monitorEndpoint || !state.targets.length || checking} onClick={() => void runCheck(true)}><Icon name="refresh" />{checking ? "检查中" : "立即检查"}</button><button className={`monitor-toggle ${state.monitorEnabled ? "active" : ""}`} disabled={!nativeAvailable || !state.adapter?.monitorEndpoint || !state.targets.length} onClick={() => update({ monitorEnabled: !state.monitorEnabled, targets: state.targets.map((target) => ({ ...target, status: state.monitorEnabled ? "paused" : "watching" })) })}><i /><span>{state.monitorEnabled ? "监控已开启" : "开启监控"}</span></button><button className="primary-button" disabled={!nativeAvailable || !state.portalUrl} onClick={openOfficialPage}><Icon name="arrow-right" />前往官方页面确认</button></div>
          <div className="confirmation-note"><Icon name="shield" /><span><strong>不会自动提交选课</strong><small>课织不会绕过验证码、抢占登录会话或高频请求；发现余量后由你在学校官方页面完成确认。</small></span></div>
        </section>

        <section className="selection-schedule-card">
          <div className="section-heading"><span className="step-badge">4</span><div><h3>定时快速确认</h3><p>提前预热登录；到点时一次查询和打开官方页面并行执行。</p></div></div>
          <div className="schedule-controls">
            <label><span>选课开始时间</span><input type="datetime-local" value={scheduleTime} min={toLocalDateTimeInput(new Date(Date.now() + 5_000))} onChange={(event) => setScheduleTime(event.target.value)} /></label>
            <label><span>提前提醒</span><select value={preflightMinutes} onChange={(event) => setPreflightMinutes(Number(event.target.value))}><option value="1">1 分钟</option><option value="3">3 分钟</option><option value="5">5 分钟</option><option value="10">10 分钟</option></select></label>
            <button className="soft-button" disabled={!nativeAvailable || !state.portalUrl} onClick={openOfficialPage}><Icon name="refresh" />预热登录</button>
            {state.schedule?.status === "scheduled"
              ? <button className="soft-button danger-soft" onClick={() => update({ schedule: undefined })}><Icon name="close" />取消预约</button>
              : <button className="primary-button" disabled={!nativeAvailable || !state.adapter || !state.targets.length} onClick={armSchedule}><Icon name="check" />预约辅助</button>}
          </div>
          {state.schedule && <div className={`schedule-status phase-${schedulePhase}`}><span className="schedule-pulse" /><div><strong>{schedulePhaseLabel(schedulePhase)}</strong><small>{new Date(state.schedule.startsAt).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></div><b>{schedulePhase === "waiting" || schedulePhase === "preflight" ? formatCountdown(scheduleRemaining) : schedulePhase === "triggered" ? "已触发" : "待处理"}</b></div>}
          <div className="confirmation-note compact"><Icon name="warning" /><span><strong>极快的是本地响应，不是高频轰炸</strong><small>应用存活时会到点立即并行执行；退到后台时由系统通知唤醒你。验证码、提交按钮和学校限流仍由官网控制。</small></span></div>
        </section>
      </section>
    </div>
  );
}

function validPortalUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function shortEndpoint(value: string): string {
  try { const url = new URL(value); return `${url.pathname}${url.search}`.slice(0, 80); } catch { return value.slice(0, 80); }
}

function newId(prefix: string): string {
  return typeof crypto.randomUUID === "function" ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function schedulePhaseLabel(phase: ReturnType<typeof selectionSchedulePhase>): string {
  return { inactive: "未预约", waiting: "等待开始", preflight: "请预热登录", due: "正在快速打开", triggered: "本次预约已触发", expired: "预约已过期" }[phase];
}
