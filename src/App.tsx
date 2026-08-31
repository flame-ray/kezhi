import { useEffect, useMemo, useRef, useState } from "react";
import { CourseDetails } from "./components/CourseDetails";
import { CourseEditorDialog } from "./components/CourseEditorDialog";
import { EmptySchedule } from "./components/EmptySchedule";
import { ExportDialog } from "./components/ExportDialog";
import { ImportWizard } from "./components/ImportWizard";
import { Sidebar } from "./components/Sidebar";
import { SyncReviewDialog } from "./components/SyncReviewDialog";
import { TimetableDialog } from "./components/TimetableDialog";
import { WeekCalendar } from "./components/WeekCalendar";
import { defaultPresets } from "./data/demo";
import type { CourseMeeting, DayOfWeek, ScheduleSnapshot, TimetablePreset } from "./domain/schedule";
import { activePreset, buildWeekView, formatWeekRange, moveMeeting } from "./domain/scheduleEngine";
import { parseZhengfangSchedule } from "./importing/zhengfangAdapter";
import { fetchSchoolSchedule, getSchoolLoginStatus, isTauriRuntime, loadScheduleSnapshot, prepareSchoolSession, saveScheduleSnapshot } from "./platform/tauriBridge";
import { applyScheduleSyncPlan, createScheduleSyncPlan, type ScheduleSyncPlan, type SyncChoice } from "./sync/scheduleSync";
import { Icon } from "./ui/Icon";

const STORAGE_KEY = "kezhi.schedule.prototype.v2";
const TERM_START = new Date(2026, 7, 31);

function initialSnapshot(): ScheduleSnapshot {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as ScheduleSnapshot;
  } catch {
    // A corrupt prototype snapshot should never prevent the app from opening.
  }
  return { courses: [], presets: defaultPresets, activePresetId: "summer" };
}

export function App() {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot>(initialSnapshot);
  const [week, setWeek] = useState(1);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [selectedId, setSelectedId] = useState<string>();
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseMeeting | "new">();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [syncPlan, setSyncPlan] = useState<ScheduleSyncPlan>();
  const [toast, setToast] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [storageBackend, setStorageBackend] = useState<"loading" | "sqlite" | "local">(() => isTauriRuntime() ? "loading" : "local");
  const syncInFlight = useRef(false);

  const view = useMemo(() => buildWeekView(snapshot.courses, TERM_START, week), [snapshot.courses, week]);
  const preset = activePreset(snapshot);
  const selected = snapshot.courses.find((course) => course.id === selectedId && course.weeks.includes(week));
  const hasCourses = snapshot.courses.length > 0;
  const isLocalSchedule = snapshot.schoolName === "本地课表";
  const termLabel = snapshot.academicYear && snapshot.semester
    ? `${snapshot.academicYear}–${snapshot.academicYear + 1} 第${snapshot.semester === 1 ? "一" : "二"}学期`
    : "尚未选择学期";

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    const initializeStorage = async () => {
      try {
        const stored = await loadScheduleSnapshot();
        if (cancelled) return;
        if (stored) {
          setSnapshot(stored);
        } else {
          await saveScheduleSnapshot(snapshot);
        }
        if (!cancelled) setStorageBackend("sqlite");
      } catch (error) {
        if (cancelled) return;
        setStorageBackend("local");
        setToast(`SQLite 初始化失败，已使用兼容存储：${error instanceof Error ? error.message : String(error)}`);
      }
    };
    void initializeStorage();
    return () => { cancelled = true; };
    // Only the first in-memory snapshot is used as a migration source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (storageBackend === "loading") return;
    const timeout = window.setTimeout(() => {
      if (storageBackend === "sqlite") {
        void saveScheduleSnapshot(snapshot).catch((error) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
          setStorageBackend("local");
          setToast(`SQLite 保存失败，已切换兼容存储：${error instanceof Error ? error.message : String(error)}`);
        });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      }
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [snapshot, storageBackend]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const changeWeek = (next: number) => {
    const safeWeek = Math.min(24, Math.max(1, next));
    setDirection(safeWeek >= week ? "right" : "left");
    setWeek(safeWeek);
    setSelectedId(undefined);
  };

  const handleMove = (id: string, day: DayOfWeek, period: number) => {
    setSnapshot((current) => ({ ...current, courses: moveMeeting(current.courses, id, day, period) }));
    setSelectedId(id);
    setToast("课程已移动 · 下次同步时会询问如何合并");
  };

  const syncFromSchool = async (interactive: boolean) => {
    if (syncInFlight.current) return;
    if (!snapshot.schoolId || !snapshot.accountId || !snapshot.academicYear || !snapshot.semester) {
      if (interactive) {
        setImportOpen(true);
        setToast("请先连接学校并导入课表");
      }
      return;
    }
    if (!isTauriRuntime()) {
      if (interactive) setToast("自动同步仅在 Windows 原生版中可用");
      return;
    }
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const loginRequest = { schoolId: snapshot.schoolId, accountId: snapshot.accountId };
      await prepareSchoolSession(loginRequest);
      let authenticated = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await delay(650);
        const status = await getSchoolLoginStatus(loginRequest);
        if (status.authenticated) {
          authenticated = true;
          break;
        }
      }
      if (!authenticated) {
        if (interactive) {
          setImportOpen(true);
          setToast("学校登录已过期，请重新登录后导入");
        }
        return;
      }
      const payload = await fetchSchoolSchedule({
        schoolId: snapshot.schoolId,
        accountId: snapshot.accountId,
        academicYear: snapshot.academicYear,
        semester: snapshot.semester,
      });
      const official = parseZhengfangSchedule(payload.rows);
      const plan = createScheduleSyncPlan(snapshot.courses, official.courses);
      if (plan.changes.length === 0) {
        setSnapshot((current) => ({ ...current, lastSyncAt: plan.checkedAt }));
        if (interactive) setToast(`课表已是最新 · ${plan.unchangedCount} 条课程无变化`);
      } else {
        setSyncPlan(plan);
        if (!interactive) setToast(`自动同步发现 ${plan.changes.length} 项变化，等待确认`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (interactive) {
        if (/登录|会话|窗口/.test(message)) setImportOpen(true);
        setToast(message);
      }
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  };

  const handleSync = () => syncFromSchool(true);

  useEffect(() => {
    if (storageBackend === "loading") return;
    if (!snapshot.schoolId || !snapshot.accountId || !snapshot.academicYear || !snapshot.semester) return;
    const lastSync = snapshot.lastSyncAt ? Date.parse(snapshot.lastSyncAt) : 0;
    const stale = !Number.isFinite(lastSync) || Date.now() - lastSync >= 15 * 60 * 1000;
    const timeout = stale ? window.setTimeout(() => void syncFromSchool(false), 1800) : undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncFromSchool(false);
    }, 30 * 60 * 1000);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
    // This startup check intentionally keys only on the persisted connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageBackend, snapshot.schoolId, snapshot.accountId, snapshot.academicYear, snapshot.semester, snapshot.lastSyncAt]);

  const saveCourse = (meeting: CourseMeeting) => {
    setSnapshot((current) => {
      const exists = current.courses.some((course) => course.id === meeting.id);
      return {
        ...current,
        schoolName: current.schoolName ?? "本地课表",
        courses: exists
          ? current.courses.map((course) => course.id === meeting.id ? meeting : course)
          : [...current.courses, { ...meeting, source: "local" }],
      };
    });
    setEditingCourse(undefined);
    setSelectedId(meeting.id);
    setToast("课程已保存到本机");
  };

  const deleteCourse = (id: string) => {
    setSnapshot((current) => ({ ...current, courses: current.courses.filter((course) => course.id !== id) }));
    setEditingCourse(undefined);
    setSelectedId(undefined);
    setToast("课程已删除");
  };

  const applySyncChoices = (choices: Record<string, SyncChoice>) => {
    if (!syncPlan) return;
    setSnapshot((current) => {
      const courses = applyScheduleSyncPlan(current.courses, syncPlan, choices);
      return { ...current, courses, lastSyncAt: syncPlan.checkedAt };
    });
    setSyncPlan(undefined);
    setToast("同步选择已应用 · 记录已保存在本机");
  };

  const updatePreset = (next: TimetablePreset) => {
    setSnapshot((current) => ({
      ...current,
      presets: current.presets.map((presetItem) => presetItem.id === next.id ? next : presetItem),
    }));
  };

  const createPreset = () => {
    const copy: TimetablePreset = {
      ...preset,
      id: `custom-${Date.now()}`,
      name: "新作息方案",
      periods: preset.periods.map((period) => ({ ...period })),
    };
    setSnapshot((current) => ({ ...current, presets: [...current.presets, copy], activePresetId: copy.id }));
  };

  return (
    <div className="app-shell">
      <Sidebar
        active="课表"
        schoolName={snapshot.schoolName}
        onNavigate={(item) => item === "课表" ? undefined : setToast(`${item}模块已加入开发路线图`)}
      />

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb"><span>{isLocalSchedule ? "自定义课表" : termLabel}</span><i />{hasCourses ? `第 ${week} 周` : "等待导入"}</div>
            <div className="title-row">
              <h1>我的课表</h1>
              <span className={`term-status ${hasCourses ? "" : "waiting"}`}>{isLocalSchedule ? "本地" : hasCourses ? "进行中" : "待导入"}</span>
            </div>
          </div>
          <div className="top-actions">
            <button className="soft-button" onClick={() => hasCourses ? setExportOpen(true) : setToast("请先导入或手动添加课程")}><Icon name="download" />导出</button>
            <button className="soft-button" onClick={() => setImportOpen(true)}><Icon name="upload" />导入</button>
            <button className={`soft-button ${syncing ? "syncing" : ""}`} disabled={syncing} onClick={() => void handleSync()}><Icon name="refresh" />{syncing ? "同步中" : "同步"}</button>
            <button className="primary-button" onClick={() => setEditingCourse("new")}><Icon name="plus" />新建课程</button>
          </div>
        </header>

        <section className="calendar-toolbar">
          <div className="week-control">
            <button className="icon-button" onClick={() => changeWeek(week - 1)} aria-label="上一周"><Icon name="chevron-left" /></button>
            <button className="today-button" onClick={() => changeWeek(1)}>本周</button>
            <button className="icon-button" onClick={() => changeWeek(week + 1)} aria-label="下一周"><Icon name="chevron-right" /></button>
            <div className="week-date"><strong>第 {week} 周</strong><span>{formatWeekRange(view)}</span></div>
          </div>
          <div className="view-options">
            <button className="preset-button" onClick={() => setTimetableOpen(true)}><Icon name="clock" /><span>{preset.name}</span><Icon name="chevron-right" /></button>
            <div className="segmented"><button className="active">周</button><button onClick={() => setToast("日视图将在下一阶段接入")}>日</button></div>
          </div>
        </section>

        <div className="workspace">
          <section className="calendar-panel">
            <WeekCalendar
              view={view}
              preset={preset}
              selectedId={selectedId}
              direction={direction}
              onSelect={(meeting: CourseMeeting) => setSelectedId(meeting.id)}
              onMove={handleMove}
            />
            {!hasCourses && (
              <EmptySchedule onImport={() => setImportOpen(true)} onCreate={() => setEditingCourse("new")} />
            )}
            <div className="calendar-hint"><span className="hint-dot" />拖动课程可临时调整时间；本地修改不会被自动同步静默覆盖。</div>
          </section>
          <CourseDetails meeting={selected} preset={preset} onClose={() => setSelectedId(undefined)} onEdit={() => selected && setEditingCourse(selected)} />
        </div>
      </main>

      {timetableOpen && (
        <TimetableDialog
          presets={snapshot.presets}
          activeId={snapshot.activePresetId}
          onActivate={(id) => setSnapshot((current) => ({ ...current, activePresetId: id }))}
          onChange={updatePreset}
          onCreate={createPreset}
          onClose={() => setTimetableOpen(false)}
        />
      )}

      {editingCourse && (
        <CourseEditorDialog
          meeting={editingCourse === "new" ? undefined : editingCourse}
          maxPeriod={preset.periods.length}
          onSave={saveCourse}
          onDelete={editingCourse === "new" ? undefined : deleteCourse}
          onClose={() => setEditingCourse(undefined)}
        />
      )}

      {importOpen && (
        <ImportWizard
          activeAccountId={snapshot.accountId}
          onClose={() => setImportOpen(false)}
          onRestore={(restored) => {
            setSnapshot(restored);
            setImportOpen(false);
            setWeek(1);
            setToast(`已恢复 ${restored.courses.length} 条课程记录`);
          }}
          onImported={(school, account, importedCourses, keepLocal, term) => {
            setSnapshot((current) => {
              const importedIds = new Set(importedCourses.map((course) => course.id));
              const localCourses = keepLocal ? current.courses.filter((course) => !importedIds.has(course.id)) : [];
              return { ...current, schoolName: school.name, schoolId: school.id, accountId: account.id, academicYear: term.academicYear, semester: term.semester, lastSyncAt: new Date().toISOString(), courses: [...localCourses, ...importedCourses] };
            });
            setImportOpen(false);
            setToast(`已从${school.name}导入 ${importedCourses.length} 条课程`);
          }}
        />
      )}

      {exportOpen && (
        <ExportDialog
          snapshot={snapshot}
          preset={preset}
          termStartsOn={TERM_START}
          week={week}
          onClose={() => setExportOpen(false)}
          onExported={(message) => setToast(message)}
          onPrint={() => {
            setExportOpen(false);
            window.setTimeout(() => window.print(), 80);
          }}
        />
      )}

      {syncPlan && <SyncReviewDialog plan={syncPlan} onClose={() => setSyncPlan(undefined)} onApply={applySyncChoices} />}

      {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast(undefined)}><Icon name="close" /></button></div>}
    </div>
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
