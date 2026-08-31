import type { TimetablePreset } from "../domain/schedule";
import { Icon } from "../ui/Icon";

interface TimetableDialogProps {
  presets: TimetablePreset[];
  activeId: string;
  onActivate: (id: string) => void;
  onChange: (preset: TimetablePreset) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function TimetableDialog({
  presets,
  activeId,
  onActivate,
  onChange,
  onCreate,
  onClose,
}: TimetableDialogProps) {
  const active = presets.find((preset) => preset.id === activeId) ?? presets[0];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="timetable-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><span className="eyebrow">作息方案</span><h2 id="timetable-title">让时间适应你的学校</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="preset-tabs">
          {presets.map((preset) => (
            <button className={preset.id === activeId ? "active" : ""} key={preset.id} onClick={() => onActivate(preset.id)}>{preset.name}</button>
          ))}
          <button className="add-preset" onClick={onCreate}><Icon name="plus" />新方案</button>
        </div>

        <div className="preset-title-row">
          <input
            aria-label="方案名称"
            value={active.name}
            onChange={(event) => onChange({ ...active, name: event.target.value })}
          />
          <span>{active.periods.length} 节课</span>
        </div>

        <div className="period-editor">
          {active.periods.map((period) => (
            <div className="period-editor-row" key={period.index}>
              <strong>{period.index}</strong>
              <label>开始<input type="time" value={period.start} onChange={(event) => onChange({ ...active, periods: active.periods.map((item) => item.index === period.index ? { ...item, start: event.target.value } : item) })} /></label>
              <span>—</span>
              <label>结束<input type="time" value={period.end} onChange={(event) => onChange({ ...active, periods: active.periods.map((item) => item.index === period.index ? { ...item, end: event.target.value } : item) })} /></label>
            </div>
          ))}
        </div>

        <footer className="dialog-footer">
          <span>修改会自动保存在本机</span>
          <button className="primary-button" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  );
}
