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
import { useRef, useState } from "react";
import { buildPhoneCalendarEvents } from "../exporting/phoneCalendar";
import { writePhoneCalendar } from "../platform/phoneCalendar";
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
  const [phoneConfirm, setPhoneConfirm] = useState(false);
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

  const exportItem = (kind: "ics" | "csv" | "json" | "svg") => {
    const baseName = `课织-${context.termName}`;
    if (kind === "ics") downloadText(buildScheduleIcs(context), `${baseName}.ics`, "text/calendar;charset=utf-8");
    if (kind === "csv") downloadText(buildScheduleCsv(context), `${baseName}.csv`, "text/csv;charset=utf-8");
    if (kind === "json") downloadText(buildScheduleJson(context), `${baseName}-备份.json`, "application/json;charset=utf-8");
    if (kind === "svg") downloadText(buildWeekSvg(context, week), `${baseName}-第${week}周.svg`, "image/svg+xml;charset=utf-8");
    onExported(`${kind.toUpperCase()} 文件已生成`);
  };

  const importToPhone = async () => {
    if (pending.current) return;
    pending.current = true;
    setPhoneBusy(true);
    setPhoneMessage("");
    try {
      const events = buildPhoneCalendarEvents(context);
      if (!events.length) throw new Error("当前没有可导入的课程，请检查课表和开学日期");
      const result = await writePhoneCalendar(events);
      const message = "已写入「" + result.calendarName + "」：新增 " + result.inserted + " 节，更新 " + result.updated + " 节";
      setPhoneMessage(message);
      setPhoneConfirm(false);
      onExported(message);
    } catch (error) {
      setPhoneMessage(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setPhoneBusy(false);
    }
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
            <p>按开学日期、单双周和当前作息展开整个学期，写入独立的「课织课表」本地日历。同一条课程重复导入会更新，不会重复添加，也不删除你的其他日程。</p>
            {android ? <>
              {!phoneConfirm && <button className="primary-button" disabled={phoneBusy || !snapshot.courses.length} onClick={() => { setPhoneConfirm(true); setPhoneMessage(""); }}><Icon name="calendar" />{phoneBusy ? "正在写入…" : "导入手机日历"}</button>}
              {phoneConfirm && <div className="phone-calendar-confirm">
                <p>将请求日历读写权限，仅用于识别和写入课织日历。课程提醒跟随课织设置。后续改课需再次导入；课织中删除的课程不会自动从系统日历删除。确认继续？</p>
                <div className="footer-actions"><button className="cancel-button" disabled={phoneBusy} onClick={() => setPhoneConfirm(false)}>暂不导入</button><button className="primary-button" disabled={phoneBusy} onClick={() => void importToPhone()}>{phoneBusy ? "正在写入…" : "确认写入日历"}</button></div>
              </div>}
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
