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

  const formats = [
    { kind: "ics" as const, icon: "calendar" as const, title: "日历文件", extension: "ICS", copy: "导入 Outlook、Google Calendar 或手机日历" },
    { kind: "csv" as const, icon: "chart" as const, title: "电子表格", extension: "CSV", copy: "使用 Excel 或其他表格软件打开" },
    { kind: "svg" as const, icon: "today" as const, title: "课表图片", extension: "SVG", copy: `导出第 ${week} 周高清矢量课表` },
    { kind: "json" as const, icon: "shield" as const, title: "本地备份", extension: "JSON", copy: "保留课程、作息与学校配置" },
  ];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><span className="eyebrow">导出与备份</span><h2 id="export-title">把课表带到任何地方</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="export-body">
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
      </section>
    </div>
  );
}
