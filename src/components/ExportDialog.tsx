import type { ScheduleSnapshot, TimetablePreset } from "../domain/schedule";
import type { ResolvedAcademicCalendar } from "../domain/academicCalendar";
import {
  buildScheduleCsv,
  buildScheduleIcs,
  buildScheduleJson,
  buildWeekSvg,
  downloadText,
  type ExportContext,
} from "../exporting/scheduleExport";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";
import { useMemo, useRef, useState } from "react";
import { buildPhoneCalendarEvents, phoneCalendarScope } from "../exporting/phoneCalendar";
import { applyPhoneCalendar, previewPhoneCalendar, type PhoneCalendarPreview } from "../platform/phoneCalendar";
import { getRuntimeCapabilities } from "../platform/runtime";

interface ExportDialogProps {
  snapshot: ScheduleSnapshot;
  preset: TimetablePreset;
  calendar: ResolvedAcademicCalendar;
  week: number;
  onClose: () => void;
  onPrint: () => void;
  onExported: (message: string) => void;
}

export function ExportDialog({ snapshot, preset, calendar, week, onClose, onPrint, onExported }: ExportDialogProps) {
  const [preview, setPreview] = useState<{ plan: PhoneCalendarPreview; fingerprint: string }>();
  const [cleanupLegacy, setCleanupLegacy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [visibleChanges, setVisibleChanges] = useState(50);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");
  const pending = useRef(false);
  const android = getRuntimeCapabilities().platform === "android";
  const academicYear = snapshot.academicYear ?? calendar.weekOneStartsOn.getFullYear();
  const semester = snapshot.semester ?? 1;
  const context: ExportContext = {
    snapshot,
    preset,
    calendar,
    termName: `${academicYear}–${academicYear + 1} 第${semester === 1 ? "一" : "二"}学期`,
  };
  const fingerprint = useMemo(() => JSON.stringify([snapshot.courses, snapshot.courseExceptions, snapshot.schoolId, snapshot.schoolName, snapshot.accountId, snapshot.academicYear, snapshot.semester, snapshot.reminderSettings, preset, calendar, cleanupLegacy]), [snapshot, preset, calendar, cleanupLegacy]);
  const currentPreview = preview?.fingerprint === fingerprint ? preview.plan : undefined;

  const exportItem = (kind: "ics" | "csv" | "json" | "svg") => {
    const baseName = `课织-${context.termName}`;
    if (kind === "ics") downloadText(buildScheduleIcs(context), `${baseName}.ics`, "text/calendar;charset=utf-8");
    if (kind === "csv") downloadText(buildScheduleCsv(context), `${baseName}.csv`, "text/csv;charset=utf-8");
    if (kind === "json") downloadText(buildScheduleJson(context), `${baseName}-备份.json`, "application/json;charset=utf-8");
    if (kind === "svg") downloadText(buildWeekSvg(context, week), `${baseName}-第${week}周.svg`, "image/svg+xml;charset=utf-8");
    onExported(`${kind.toUpperCase()} 文件已生成`);
  };

  const previewPhone = async () => {
    if (pending.current) return;
    pending.current = true;
    setPhoneBusy(true);
    setPhoneMessage("");
    try {
      const events = buildPhoneCalendarEvents(context);
      setPreview(undefined); setConfirmed(false); setVisibleChanges(50);
      const plan = await previewPhoneCalendar(events, phoneCalendarScope(context), cleanupLegacy);
      setPreview({ plan, fingerprint });
    } catch (error) {
      setPhoneMessage(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setPhoneBusy(false);
    }
  };

  const applyPreview = async () => {
    if (pending.current || !currentPreview || !confirmed) return;
    pending.current = true; setPhoneBusy(true); setPhoneMessage("");
    try {
      const result = await applyPhoneCalendar(currentPreview.token);
      const message = `已更新「${result.calendarName}」：新增 ${result.inserted}、修改 ${result.updated}、删除 ${result.deleted ?? 0} 节`;
      setPhoneMessage(message); onExported(message);
    } catch (error) { setPhoneMessage(error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; setPhoneBusy(false); setPreview(undefined); setConfirmed(false); }
  };

  const formats = [
    { kind: "ics" as const, icon: "calendar" as const, title: "日历文件", extension: "ICS", copy: "导入 Outlook、Google Calendar 或手机日历" },
    { kind: "csv" as const, icon: "chart" as const, title: "电子表格", extension: "CSV", copy: "使用 Excel 或其他表格软件打开" },
    { kind: "svg" as const, icon: "today" as const, title: "课表图片", extension: "SVG", copy: `导出第 ${week} 周高清矢量课表` },
    { kind: "json" as const, icon: "shield" as const, title: "本地备份", extension: "JSON", copy: "保留课程、作息与学校配置" },
  ];

  return (
    <DialogSurface className="export-dialog" labelledBy="export-title" onClose={onClose}>
        <header className="dialog-header">
          <div><span className="eyebrow">导出与备份</span><h2 id="export-title">把课表带到任何地方</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="export-body">
          <section className="phone-calendar-card">
            <span className="eyebrow">手机系统日历</span>
            <h3>把上课时间放进日历</h3>
            <p>先预览新增、修改和删除，再确认更新。仅处理独立「课织课表」日历中本应用创建的事件；当前账号和学期之外的新版本事件不受影响。</p>
            {android ? <>
              <p>将请求日历访问权限；预览阶段不会写入或删除事件。空课表也可预览，清理本学期已停课的旧事件。</p>
              <label className="backup-confirm"><input type="checkbox" disabled={phoneBusy} checked={cleanupLegacy} onChange={event => {setCleanupLegacy(event.target.checked); setPreview(undefined); setConfirmed(false);}} /><span>同时清理旧版课织事件（可能包含其他账号、学期；以预览清单为准）</span></label>
              <button className="primary-button" disabled={phoneBusy} onClick={() => void previewPhone()}><Icon name="calendar" />{phoneBusy ? "正在处理…" : "预览手机日历更新"}</button>
              {currentPreview && <section className="phone-calendar-preview" aria-label="手机日历更新预览">
                <strong>新增 {currentPreview.inserted} · 修改 {currentPreview.updated} · 删除 {currentPreview.deleted} · 不变 {currentPreview.unchanged}</strong>
                {currentPreview.legacyPreserved > 0 && <p>保留 {currentPreview.legacyPreserved} 条旧版事件。旧版没有账号／学期标识；如首次更新出现重复，可勾选上方旧版清理后重新预览。</p>}
                <ol>{currentPreview.changes.slice(0, visibleChanges).map((change, index) => <li key={index}><strong>{({ insert: "新增", update: "修改", delete: "删除" })[change.kind]} · {change.title}</strong><span>{new Date(change.startMs).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})} · {change.location}</span>{change.kind === "update" && <small>原安排：{new Date(change.previousStartMs!).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})} · {change.previousLocation}</small>}</li>)}</ol>
                {currentPreview.changes.length > visibleChanges && <button className="soft-button" onClick={() => setVisibleChanges(count => count + 50)}>再显示 50 条（共 {currentPreview.changes.length} 条）</button>}
                {currentPreview.changes.length > 0 ? <><label className="backup-confirm"><input type="checkbox" checked={confirmed} disabled={phoneBusy} onChange={event => setConfirmed(event.target.checked)} /><span>已核对清单，确认上述新增、修改和删除</span></label><button className="primary-button" disabled={!confirmed || phoneBusy} onClick={() => void applyPreview()}>确认更新手机日历</button></> : <p>没有需要更新的事件。</p>}
              </section>}
            </> : <p>直接写入请使用 Android 安装版；电脑上可导出下方 ICS 文件，再通过日历软件导入。</p>}
            {phoneMessage && <p role="status" className="phone-calendar-message">{phoneMessage}</p>}
          </section>
          <div className="export-grid">{formats.map((format) => (
            <button className="export-card" onClick={() => exportItem(format.kind)} key={format.kind}>
              <span className={`export-icon export-${format.kind}`}><Icon name={format.icon} /></span>
              <span><strong>{format.title}</strong><small>{format.copy}</small></span>
              <em>{format.extension}</em><Icon name="download" />
            </button>
          ))}</div>
          <button className="print-card" onClick={onPrint}><span className="export-icon export-print"><Icon name="book" /></span><span><strong>打印或保存为 PDF</strong><small>调用 Windows 打印面板，可选择“Microsoft Print to PDF”</small></span><Icon name="arrow-right" /></button>
          <div className="privacy-note export-privacy"><Icon name="shield" /><span>所有导出均在本机生成，不会上传课程或身份信息。</span></div>
        </div>
        <footer className="dialog-footer"><span>当前共有 {snapshot.courses.length} 条课程记录</span><button className="cancel-button" onClick={onClose}>关闭</button></footer>
    </DialogSurface>
  );
}
