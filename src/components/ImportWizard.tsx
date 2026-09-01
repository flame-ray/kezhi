import { useEffect, useMemo, useRef, useState } from "react";
import type { LocalAccountProfile } from "../domain/account";
import type { CourseMeeting, ScheduleSnapshot } from "../domain/schedule";
import { normalizeTermStartKey, suggestTermStartKey } from "../domain/termDate";
import { createLocalAccount, loadLocalAccounts } from "../importing/accountStore";
import { parseScheduleBackup } from "../importing/backupImport";
import { resolveSchoolLoginUrl, schoolCatalog, type SchoolDefinition } from "../importing/schoolCatalog";
import { parseZhengfangSchedule, type ScheduleAdapterResult } from "../importing/zhengfangAdapter";
import { fetchSchoolSchedule, getSchoolLoginStatus, hideSchoolLogin, openSchoolLogin } from "../platform/tauriBridge";
import { getRuntimeCapabilities } from "../platform/runtime";
import { Icon } from "../ui/Icon";

interface ImportWizardProps {
  activeAccountId?: string;
  onImported: (
    school: SchoolDefinition,
    account: LocalAccountProfile,
    courses: CourseMeeting[],
    keepLocal: boolean,
    term: { academicYear: number; semester: 1 | 2; termStartsOn: string },
  ) => void;
  onRestore: (snapshot: ScheduleSnapshot) => void;
  onStartManual: () => void;
  onClose: () => void;
}

type LoginState = "idle" | "opening" | "checking" | "connected";

export function ImportWizard({ activeAccountId, onImported, onRestore, onStartManual, onClose }: ImportWizardProps) {
  const [step, setStep] = useState(1);
  const [schoolUrl, setSchoolUrl] = useState(schoolCatalog[0].loginUrl ?? "");
  const [urlError, setUrlError] = useState<string>();
  const [school, setSchool] = useState<SchoolDefinition>(schoolCatalog[0]);
  const [accounts, setAccounts] = useState<LocalAccountProfile[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccountId ?? "new");
  const [accountLabel, setAccountLabel] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeAccount, setActiveAccount] = useState<LocalAccountProfile>();
  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [loginError, setLoginError] = useState<string>();
  const initialAcademicYear = useMemo(() => {
    const today = new Date();
    return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  }, []);
  const [academicYear, setAcademicYear] = useState(initialAcademicYear);
  const [semester, setSemester] = useState<1 | 2>(1);
  const [termStartsOn, setTermStartsOn] = useState(() => suggestTermStartKey(initialAcademicYear, 1));
  const [analyzing, setAnalyzing] = useState(false);
  const [readError, setReadError] = useState<string>();
  const [adapterResult, setAdapterResult] = useState<ScheduleAdapterResult>();
  const [keepLocal, setKeepLocal] = useState(true);
  const [restoreError, setRestoreError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const capabilities = getRuntimeCapabilities();
  const schoolSupported = school.id === "ndnu";
  const loginCapable = schoolSupported && capabilities.schoolLogin !== "unavailable";
  const embeddedLogin = capabilities.schoolLogin === "embedded-window";
  const manualImportFlow = !loginCapable;
  const wizardSteps = manualImportFlow
    ? ["填写网址", "保存账号", "导入课表"]
    : ["填写网址", "安全登录", "读取课表", "确认导入"];
  const schoolAccounts = useMemo(() => accounts.filter((account) => account.schoolId === school.id), [accounts, school.id]);

  useEffect(() => {
    let cancelled = false;
    loadLocalAccounts()
      .then((storedAccounts) => {
        if (!cancelled) setAccounts(storedAccounts);
      })
      .catch((error) => {
        if (!cancelled) setLoginError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!embeddedLogin || loginState !== "opening" || !activeAccount) return;
    let cancelled = false;
    let checking = false;
    const request = { schoolId: school.id, accountId: activeAccount.id };
    const pollStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const status = await getSchoolLoginStatus(request);
        if (cancelled) return;
        if (status.authenticated) {
          setLoginError(undefined);
          setLoginState("connected");
          await hideSchoolLogin(request);
          if (!cancelled) setStep(3);
        } else if (!status.windowOpen) {
          setLoginState("idle");
          setLoginError("登录页已关闭，请重新打开并完成登录。");
        }
      } catch (error) {
        if (!cancelled) {
          setLoginState("idle");
          setLoginError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        checking = false;
      }
    };
    const firstCheck = window.setTimeout(() => void pollStatus(), 650);
    const interval = window.setInterval(() => void pollStatus(), 650);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [activeAccount, embeddedLogin, loginState, school.id]);

  const continueFromSchoolUrl = () => {
    const nextSchool = resolveSchoolLoginUrl(schoolUrl);
    if (!nextSchool) {
      setUrlError("请输入有效的 HTTPS 教务系统网址");
      return;
    }
    setUrlError(undefined);
    if (nextSchool.id !== school.id) {
      setSelectedAccountId("new");
      setAccountLabel("");
      setLoginName("");
      setActiveAccount(undefined);
      setLoginState("idle");
      setLoginError(undefined);
    }
    setSchool(nextSchool);
    setSchoolUrl(nextSchool.loginUrl ?? schoolUrl.trim());
    setStep(2);
  };

  const resolveAccount = async (): Promise<LocalAccountProfile> => {
    const existing = accounts.find((account) => account.id === selectedAccountId && account.schoolId === school.id);
    if (existing) return existing;
    const created = await createLocalAccount(
      school.id,
      loginName,
      accountLabel || `账号 ${schoolAccounts.length + 1}`,
    );
    setAccounts((current) => [...current, created]);
    setSelectedAccountId(created.id);
    return created;
  };

  const launchLogin = async () => {
    setLoginError(undefined);
    if (!schoolSupported) {
      setLoginError("该学校的原生登录适配器尚未完成。");
      return;
    }
    if (!loginCapable) {
      setLoginError(
        "当前环境无法隔离学校登录会话，请使用 Windows 或 Android 原生版。",
      );
      return;
    }
    const account = await resolveAccount();
    setActiveAccount(account);
    setLoginState("opening");
    try {
      await openSchoolLogin({ schoolId: school.id, accountId: account.id });
    } catch (error) {
      setLoginState("idle");
      setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const saveAccountOnly = async () => {
    setLoginError(undefined);
    try {
      const account = await resolveAccount();
      setActiveAccount(account);
      setStep(3);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const checkLogin = async () => {
    if (!activeAccount) return;
    setLoginError(undefined);
    setLoginState("checking");
    try {
      const status = await getSchoolLoginStatus({ schoolId: school.id, accountId: activeAccount.id });
      if (!status.windowOpen) {
        setLoginState("idle");
        setLoginError("登录窗口已关闭。请重新打开，完成登录后再检查。");
        return;
      }
      if (!status.authenticated) {
        setLoginState("opening");
        setLoginError("尚未检测到有效登录会话。请在学校页面完成登录，再返回这里检查。");
        return;
      }
      setLoginError(undefined);
      setLoginState("connected");
      await hideSchoolLogin({ schoolId: school.id, accountId: activeAccount.id });
      if (embeddedLogin) setStep(3);
    } catch (error) {
      setLoginState("opening");
      setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const restoreBackup = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setRestoreError("备份文件不能超过 5 MB");
      return;
    }
    try {
      const snapshot = parseScheduleBackup(await file.text());
      onRestore(snapshot);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "无法读取备份文件");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const readSchedule = async () => {
    if (!activeAccount) return;
    setAnalyzing(true);
    setReadError(undefined);
    try {
      const payload = await fetchSchoolSchedule({
        schoolId: school.id,
        accountId: activeAccount.id,
        academicYear,
        semester,
      });
      const result = parseZhengfangSchedule(payload.rows);
      if (result.courses.length === 0) throw new Error("该学期没有读取到有效课程，请确认学年和学期");
      setAdapterResult(result);
      setStep(4);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : String(error));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header import-header">
          <div><span className="eyebrow">导入教务课表</span><h2 id="import-title">连接你的学校</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </header>
        <div className="wizard-steps" style={{ gridTemplateColumns: `repeat(${wizardSteps.length}, 1fr)` }}>{wizardSteps.map((label, index) => <div className={`${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}`} key={label}><i>{step > index + 1 ? <Icon name="check" /> : index + 1}</i><span>{label}</span></div>)}</div>

        <div className="wizard-body">
          {step === 1 && <div className="url-entry-stage">
            <label className={`school-url-field ${urlError ? "invalid" : ""}`}>
              <span className="school-url-box"><Icon name="shield" /><input type="url" inputMode="url" enterKeyHint="go" value={schoolUrl} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => { setSchoolUrl(event.target.value); setUrlError(undefined); }} onKeyDown={(event) => { if (event.key === "Enter") continueFromSchoolUrl(); }} placeholder="https://学校教务系统登录网址" /></span>
              <small>粘贴学校教务系统的 HTTPS 登录页网址</small>
            </label>
            {urlError && <div className="form-error url-error"><Icon name="warning" />{urlError}</div>}
          </div>}

          {step === 2 && <div className="login-stage">
            <div className="browser-preview"><div className="browser-bar"><i/><i/><i/><span><Icon name="shield" />{school.domain ?? "学校官方教务网站"}</span></div><div className="browser-content"><span className="large-school-icon"><Icon name="school" /></span><h3>{school.name}</h3><p>{loginState === "connected" ? "官方登录会话已建立，密码从未经过课织界面。" : loginState === "opening" || loginState === "checking" ? embeddedLogin ? "请在学校页面登录，然后点击顶部醒目的“登录完成，导入课表”。" : "请在独立窗口完成登录，再返回课织检查状态。" : loginCapable ? embeddedLogin ? "将打开应用内学校官方登录页，登录后可一键导入。" : "登录将在独立的内置浏览器窗口中进行。" : "保存账号后，可以继续从备份导入或手动添加课程。"}</p>{loginState === "connected" && <span className="connected-badge"><Icon name="check" />已安全连接</span>}</div></div>
            <div className="login-side">
              <label className="account-session-field"><span>本地账号</span><select value={selectedAccountId} disabled={loginState !== "idle"} onChange={(event) => setSelectedAccountId(event.target.value)}>{schoolAccounts.map((account) => <option value={account.id} key={account.id}>{account.label}</option>)}<option value="new">＋ 新账号</option></select></label>
              {selectedAccountId !== "new" && <div className="saved-account-name">已保存账号：{schoolAccounts.find((account) => account.id === selectedAccountId)?.loginName || "旧版账号未记录学号"}</div>}
              {selectedAccountId === "new" && <label className="account-session-field"><span>学号 / 登录账号</span><input value={loginName} disabled={loginState !== "idle"} maxLength={80} autoCapitalize="none" autoCorrect="off" onChange={(event) => setLoginName(event.target.value)} placeholder="仅保存在本机" /><small>用于识别和切换账号，不会自动填写密码</small></label>}
              {selectedAccountId === "new" && <label className="account-session-field"><span>账号备注</span><input value={accountLabel} disabled={loginState !== "idle"} maxLength={40} onChange={(event) => setAccountLabel(event.target.value)} placeholder={`账号 ${schoolAccounts.length + 1}`} /><small>例如“主账号”或“辅修账号”</small></label>}
              <div className="security-copy"><Icon name="shield" /><div><strong>密码只输入在学校官方页面</strong><span>课织不创建密码输入框、不保存明文密码。账号标识和备注保存在本机 SQLite；登录会话不会传给界面层。</span></div></div>
              {!loginCapable && <div className="runtime-warning"><Icon name="warning" />当前环境暂不读取学校登录会话，保存后仍可继续导入</div>}
              {loginError && <div className="form-error login-error"><Icon name="warning" />{loginError}</div>}
            </div>
          </div>}

          {step === 3 && manualImportFlow && <div className="android-import-stage"><span className="analyze-orbit"><Icon name="upload" /></span><h3>账号已保存，继续导入课表</h3><p>可以恢复课织 JSON 备份，或直接进入课表手动添加课程。</p><input ref={fileInput} className="hidden-file-input" type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0])} /><div className="android-import-actions"><button className="restore-backup-button" onClick={() => fileInput.current?.click()}><Icon name="upload" /><span><strong>从课织备份恢复</strong><small>选择此前导出的 JSON 文件</small></span><Icon name="chevron-right" /></button><button className="restore-backup-button manual-import-button" onClick={onStartManual}><Icon name="plus" /><span><strong>手动添加课程</strong><small>从第一门课程开始创建本地课表</small></span><Icon name="chevron-right" /></button></div>{restoreError && <div className="form-error restore-error"><Icon name="warning" />{restoreError}</div>}</div>}
          {step === 3 && !manualImportFlow && <div className="analyze-stage"><span className={`analyze-orbit ${analyzing ? "running" : ""}`}><Icon name="calendar" /></span><h3>{analyzing ? "正在读取学校课表…" : "选择学期和第 1 周日期"}</h3><p>{analyzing ? "正在通过本机登录会话读取课程、周次、教师和教室。" : "请确认第 1 周周一，课表上的每一天都将据此计算。"}</p><div className="term-fields"><label><span>学年</span><input type="number" min={2000} max={2100} value={academicYear} disabled={analyzing} onChange={(event) => { const value = Number(event.target.value); setAcademicYear(value); setTermStartsOn(suggestTermStartKey(value, semester)); }} /></label><label><span>学期</span><select value={semester} disabled={analyzing} onChange={(event) => { const value = Number(event.target.value) as 1 | 2; setSemester(value); setTermStartsOn(suggestTermStartKey(academicYear, value)); }}><option value={1}>第一学期</option><option value={2}>第二学期</option></select></label><label><span>第 1 周周一</span><input type="date" value={termStartsOn} disabled={analyzing} onChange={(event) => setTermStartsOn(normalizeTermStartKey(event.target.value))} /></label></div><div className="analysis-checks"><span><Icon name="check" />官方域名已校验</span><span><Icon name="check" />日期可稍后修改</span><span className={analyzing ? "checking" : "pending"}><Icon name="refresh" />{analyzing ? "正在解析" : "等待读取"}</span></div>{readError && <div className="form-error read-error"><Icon name="warning" />{readError}</div>}</div>}

          {step === 4 && adapterResult && <div className="import-review"><div className="review-summary"><span><strong>{adapterResult.courses.length}</strong><small>课程记录</small></span><span><strong>{new Set(adapterResult.courses.map((course) => course.title)).size}</strong><small>不同课程</small></span><span><strong>{adapterResult.warnings.length}</strong><small>解析提醒</small></span></div><div className="review-success"><Icon name="check" /><div><strong>已读取真实教务数据</strong><span>共检查 {adapterResult.sourceRows} 条学校记录，已识别星期、节次和周次规则。</span></div></div>{adapterResult.warnings.length > 0 && <div className="review-warning"><Icon name="warning" /><div><strong>{adapterResult.warnings.length} 项记录被跳过</strong><span>{adapterResult.warnings[0]}</span></div></div>}<label className="import-option"><input type="checkbox" checked={keepLocal} onChange={(event) => setKeepLocal(event.target.checked)} /><span><strong>保留本地课程</strong><small>关闭后将使用本次读取的学校课表替换当前课程</small></span></label></div>}
        </div>

        <footer className="dialog-footer wizard-footer">
          <button className="cancel-button" onClick={() => step > 1 ? setStep((current) => current - 1) : onClose()}>{step > 1 ? "上一步" : "取消"}</button>
          {step === 1 && <button className="primary-button" disabled={!schoolUrl.trim()} onClick={continueFromSchoolUrl}>继续<Icon name="arrow-right" /></button>}
          {step === 2 && loginState === "idle" && (loginCapable
            ? <button className="primary-button" disabled={accountsLoading || (selectedAccountId === "new" && !loginName.trim())} onClick={() => void launchLogin()}>{accountsLoading ? "正在读取账号…" : embeddedLogin ? "进入学校登录" : "打开内置浏览器"}</button>
            : <button className="primary-button" disabled={accountsLoading || (selectedAccountId === "new" && !loginName.trim())} onClick={() => void saveAccountOnly()}>{accountsLoading ? "正在读取账号…" : "保存并继续"}</button>)}
          {step === 2 && (loginState === "opening" || loginState === "checking") && <div className="footer-actions"><button className="soft-button" disabled={loginState === "checking"} onClick={() => void launchLogin()}>重新打开</button><button className="primary-button" disabled={loginState === "checking"} onClick={() => void checkLogin()}>{loginState === "checking" ? "正在检查…" : "我已完成登录"}</button></div>}
          {step === 2 && loginState === "connected" && <button className="primary-button" onClick={() => setStep(3)}>继续<Icon name="arrow-right" /></button>}
          {step === 3 && manualImportFlow && <button className="primary-button" onClick={onStartManual}>手动添加课程<Icon name="arrow-right" /></button>}
          {step === 3 && !manualImportFlow && activeAccount && <button className="primary-button" disabled={analyzing || academicYear < 2000 || academicYear > 2100} onClick={() => void readSchedule()}>{analyzing ? "读取中…" : "读取课表"}</button>}
          {step === 4 && activeAccount && adapterResult && <button className="primary-button" onClick={() => onImported(school, activeAccount, adapterResult.courses, keepLocal, { academicYear, semester, termStartsOn })}>确认导入</button>}
        </footer>
      </section>
    </div>
  );
}
