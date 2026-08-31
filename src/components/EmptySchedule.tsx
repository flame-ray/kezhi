import { Icon } from "../ui/Icon";

interface EmptyScheduleProps {
  onImport: () => void;
  onCreate: () => void;
}

export function EmptySchedule({ onImport, onCreate }: EmptyScheduleProps) {
  return (
    <div className="empty-schedule-overlay">
      <div className="empty-weave" aria-hidden="true">
        <i /><i /><i />
        <span><Icon name="calendar" /></span>
      </div>
      <span className="empty-eyebrow">从这里开始</span>
      <h2>导入你的第一张课表</h2>
      <p>登录学校官方教务系统，课织会读取课程并在导入前让你检查结果。密码不会输入到课织自己的表单中。</p>
      <div className="empty-actions">
        <button className="primary-button" onClick={onImport}><Icon name="school" />导入教务课表</button>
        <button className="soft-button" onClick={onCreate}><Icon name="plus" />手动添加课程</button>
      </div>
      <div className="empty-import-types">
        <span><Icon name="shield" />学校官方登录</span>
        <span>Excel</span>
        <span>ICS</span>
        <span>本地保存</span>
      </div>
    </div>
  );
}
