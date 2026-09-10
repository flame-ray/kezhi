import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CourseDetails } from "./components/CourseDetails";
import { CourseOccurrenceDialog } from "./components/CourseOccurrenceDialog";
import { normalizeCourseExceptions, occurrenceDateKey, resolveCourseOccurrences } from "./domain/courseExceptions";
import { CourseEditorDialog, type CourseDraftSlot } from "./components/CourseEditorDialog";
import { CalendarImportDialog } from "./components/CalendarImportDialog";
import { GradeEditorDialog } from "./components/GradeEditorDialog";
import { GradesPage } from "./components/GradesPage";
import { EmptySchedule } from "./components/EmptySchedule";
import { ExportDialog } from "./components/ExportDialog";
import { ImportWizard, type ImportWizardHandle } from "./components/ImportWizard";
import { SettingsDialog } from "./components/SettingsDialog";
import { SelectionAssistantPage } from "./components/SelectionAssistantPage";
import { Sidebar } from "./components/Sidebar";
import { SyncReviewDialog } from "./components/SyncReviewDialog";
import { TimetableDialog } from "./components/TimetableDialog";
import { TodayAgenda } from "./components/TodayAgenda";
import { WeekCalendar, type WeekCalendarHandle } from "./components/WeekCalendar";
import { defaultPresets } from "./data/demo";
import { alignImportedWeeks, dateForCourse, normalizeAcademicCalendar, resolveAcademicCalendar, suggestAcademicCalendar } from "./domain/academicCalendar";
import { academicPositionForDate } from "./domain/dayAgenda";
import { MAX_ACADEMIC_WEEK, MIN_ACADEMIC_WEEK, type CourseMeeting, type DayOfWeek, type ScheduleSnapshot, type TimetablePreset } from "./domain/schedule";
import { mergeGrades, normalizeGrades, type GradeRecord } from "./grades/gradeCenter";
import { activePreset, buildWeekView, formatWeekRange, moveMeeting } from "./domain/scheduleEngine";
import { validateTimetablePreset } from "./domain/timetable";
import { DEFAULT_TEACHING_START_KEY, DEFAULT_TERM_START_KEY, normalizeTeachingStartKey, normalizeTermStartKey } from "./domain/termDate";
import { parseZhengfangSchedule } from "./importing/zhengfangAdapter";
import { mergeIcsCourses } from "./importing/icsImport";
import { resolveSchoolLoginUrl } from "./importing/schoolCatalog";
import { resolveAppBackDestination } from "./navigation/backNavigation";
import { installAndroidBackHandler } from "./platform/androidBack";
import { fetchPortalResource, fetchSchoolSchedule, getSchoolLoginStatus, isTauriRuntime, loadScheduleSnapshot, openSchoolLogin, prepareSchoolSession, probePortalClock, readPortalPageSnapshot, saveScheduleSnapshot, submitPortalRequest, type SchoolLoginRequest } from "./platform/tauriBridge";
import { clearScheduledCourseNotifications, clearScheduledSelectionNotifications, ensureNotificationPermission, replaceScheduledCourseNotifications, replaceScheduledSelectionNotifications, sendReminderTestNotification } from "./platform/notifications";
import { getRuntimeCapabilities } from "./platform/runtime";
import { buildReminderSchedule, normalizeReminderSettings } from "./reminders/reminderSchedule";
import { applySeatPayload, expireSelectionSchedule, markSelectionScheduleTriggered, nextMonitorDelaySeconds, normalizeSelectionAssistant, recordMonitorFailure, selectionSchedulePhase } from "./selection/selectionAssistant";
import { defaultAutoGrabConfig, emptyGrabRun, renderSubmitBody, type GrabRunState } from "./selection/autoGrab";
import { startAutoGrab, type GrabRunnerHandle, type GrabTransport } from "./selection/autoGrabRunner";
import { calibrateClock, formatSkew, type ClockProbeResult } from "./selection/clockSync";
import { applyScheduleSyncPlan, createScheduleSyncPlan, type ScheduleSyncPlan, type SyncChoice } from "./sync/scheduleSync";
import { Icon } from "./ui/Icon";
import { MotionRegion, Presence } from "./ui/Motion";
import { InteractionFeedback, Snackbar } from "./ui/Feedback";

const STORAGE_KEY = "kezhi.schedule.prototype.v2";
const THEME_KEY = "kezhi.appearance.theme";
function normalizeSnapshot(snapshot: ScheduleSnapshot): ScheduleSnapshot {
  return { ...snapshot, courseExceptions: normalizeCourseExceptions(snapshot.courseExceptions), ...normalizeAcademicCalendar(snapshot), reminderSettings: normalizeReminderSettings(snapshot.reminderSettings), selectionAssistant: normalizeSelectionAssistant(snapshot.selectionAssistant), grades: normalizeGrades(snapshot.grades) };
}

function saveCompatibilitySnapshot(snapshot: ScheduleSnapshot): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
type AppTheme = "light" | "dark";
type PrimaryPage = "课表" | "今天" | "选课" | "成绩";

function initialSnapshot(): ScheduleSnapshot {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeSnapshot(JSON.parse(saved) as ScheduleSnapshot);
  } catch {
    // A corrupt prototype snapshot should never prevent the app from opening.
  }
  return normalizeSnapshot({ courses: [], presets: defaultPresets, activePresetId: "summer", studentGrade: 1, termStartsOn: DEFAULT_TERM_START_KEY, teachingStartsOn: DEFAULT_TEACHING_START_KEY });
}

function initialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Appearance preference can safely fall back to the system setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot>(initialSnapshot);
  const [activePage, setActivePage] = useState<PrimaryPage>("课表");
  const [week, setWeek] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseMeeting | "new">();
  const [occurrenceOpen, setOccurrenceOpen] = useState<{ course: CourseMeeting; date: string }>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const [editingGrade, setEditingGrade] = useState<GradeRecord | "new">();
  const [importOpen, setImportOpen] = useState(false);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);
  const [newCourseSlot, setNewCourseSlot] = useState<CourseDraftSlot>();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncPlan, setSyncPlan] = useState<ScheduleSyncPlan>();
  const [toast, setToast] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [storageBackend, setStorageBackend] = useState<"loading" | "sqlite" | "local">(() => isTauriRuntime() ? "loading" : "local");
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const syncInFlight = useRef(false);
  const reminderSyncGeneration = useRef(0);
  const reminderSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const selectionMonitorInFlight = useRef(false);
  const selectionScheduleNotificationRef = useRef("");
  const autoGrabHandleRef = useRef<GrabRunnerHandle | undefined>(undefined);
  const autoGrabArmedRef = useRef("");
  const [grabRun, setGrabRun] = useState<GrabRunState>(() => emptyGrabRun());
  const [scheduledReminderCount, setScheduledReminderCount] = useState(0);
  const importWizardRef = useRef<ImportWizardHandle>(null);
  const weekCalendarRef = useRef<WeekCalendarHandle>(null);
  const appBackHandlerRef = useRef<() => void>(() => undefined);
  const capabilities = getRuntimeCapabilities();

  const calendar = useMemo(() => resolveAcademicCalendar(normalizeAcademicCalendar(snapshot)), [snapshot.schoolId, snapshot.academicYear, snapshot.semester, snapshot.studentGrade, snapshot.termStartsOn, snapshot.teachingStartsOn]);
  const effectiveCourses = useMemo(() => resolveCourseOccurrences(snapshot.courses, snapshot.courseExceptions, calendar), [snapshot.courses, snapshot.courseExceptions, calendar]);
  const view = useMemo(() => buildWeekView(effectiveCourses, calendar, week), [effectiveCourses, calendar, week]);
  const preset = activePreset(snapshot);
  const previousView = useMemo(() => buildWeekView(effectiveCourses, calendar, Math.max(MIN_ACADEMIC_WEEK, week - 1)), [effectiveCourses, calendar, week]);
  const nextView = useMemo(() => buildWeekView(effectiveCourses, calendar, Math.min(MAX_ACADEMIC_WEEK, week + 1)), [effectiveCourses, calendar, week]);
  const selected = effectiveCourses.find((course) => course.id === selectedId) ?? snapshot.courses.find(course => course.id === selectedId);
  const selectedBase = snapshot.courses.find(course => course.id === (selected?.occurrence?.courseId ?? selected?.id));
  const openSelectedOccurrence = () => {
    if (selected && selectedBase) setOccurrenceOpen({ course: selectedBase, date: selected.occurrence?.originalDate ?? selectedDate ?? occurrenceDateKey(dateForCourse(calendar, week, selected.day)) });
  };
  const selectionAssistant = normalizeSelectionAssistant(snapshot.selectionAssistant);
  const grades = normalizeGrades(snapshot.grades);
  const currentAcademicWeek = Math.min(MAX_ACADEMIC_WEEK, Math.max(MIN_ACADEMIC_WEEK, academicPositionForDate(new Date(), calendar).week));
  const reminderSettings = normalizeReminderSettings(snapshot.reminderSettings);
  const hasCourses = snapshot.courses.length > 0;
  const isLocalSchedule = snapshot.schoolName === "本地课表";
  const termLabel = snapshot.academicYear && snapshot.semester
    ? `${snapshot.academicYear}–${snapshot.academicYear + 1} 第${snapshot.semester === 1 ? "一" : "二"}学期`
    : "尚未选择学期";

  appBackHandlerRef.current = () => {
    if (occurrenceOpen) { setOccurrenceOpen(undefined); return; }
    if (weekCalendarRef.current?.cancelOverlay()) return;
    const destination = resolveAppBackDestination({
      syncReviewOpen: Boolean(syncPlan),
      importOpen,
      calendarImportOpen,
      courseEditorOpen: Boolean(editingCourse),
      gradeEditorOpen: Boolean(editingGrade),
      exportOpen,
      timetableOpen,
      settingsOpen,
      courseDetailsOpen: Boolean(selected),
      secondaryPageOpen: activePage !== "课表",
    });

    if (destination === "sync-review") setSyncPlan(undefined);
    else if (destination === "import") {
      const wizard = importWizardRef.current;
      if (wizard) wizard.goBack();
      else setImportOpen(false);
    }
    else if (destination === "calendar-import") setCalendarImportOpen(false);
    else if (destination === "course-editor") {
      setEditingCourse(undefined);
      setNewCourseSlot(undefined);
    } else if (destination === "grade-editor") setEditingGrade(undefined);
    else if (destination === "export") setExportOpen(false);
    else if (destination === "timetable") setTimetableOpen(false);
    else if (destination === "settings") setSettingsOpen(false);
    else if (destination === "course-details") setSelectedId(undefined);
    else if (destination === "secondary-page") setActivePage("课表");
    else if (weekCalendarRef.current?.cancelDraft()) return;
    else if (toast) setToast(undefined);
    else setToast("已在课表首页，返回手势不会退出应用");
  };

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The active theme still applies even if storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    let removeHandler: (() => void) | undefined;
    void installAndroidBackHandler(capabilities.platform, () => appBackHandlerRef.current())
      .then((remove) => {
        if (cancelled) remove();
        else removeHandler = remove;
      })
      .catch((error) => {
        if (!cancelled) {
          setToast(`系统返回手势接入失败：${error instanceof Error ? error.message : String(error)}`);
        }
      });
    return () => {
      cancelled = true;
      removeHandler?.();
    };
  }, [capabilities.platform]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    const initializeStorage = async () => {
      try {
        const stored = await loadScheduleSnapshot();
        if (cancelled) return;
        if (stored) {
          setSnapshot(normalizeSnapshot(stored));
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
          const fallbackSaved = saveCompatibilitySnapshot(snapshot);
          setStorageBackend("local");
          setToast(fallbackSaved
            ? `SQLite 保存失败，已切换兼容存储：${error instanceof Error ? error.message : String(error)}`
            : `本地保存失败，请立即导出备份：${error instanceof Error ? error.message : String(error)}`);
        });
      } else {
        if (!saveCompatibilitySnapshot(snapshot)) setToast("本地保存失败，请立即导出 JSON 备份");
      }
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [snapshot, storageBackend]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (storageBackend === "loading" || !capabilities.native) return;
    const generation = ++reminderSyncGeneration.current;
    const timeout = window.setTimeout(() => {
      reminderSyncQueue.current = reminderSyncQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (generation !== reminderSyncGeneration.current) return;
          if (!reminderSettings.enabled) {
            await clearScheduledCourseNotifications();
            if (generation === reminderSyncGeneration.current) setScheduledReminderCount(0);
            return;
          }
          const reminders = buildReminderSchedule(effectiveCourses, preset, calendar, reminderSettings);
          const count = await replaceScheduledCourseNotifications(reminders);
          if (generation === reminderSyncGeneration.current) setScheduledReminderCount(count);
        })
        .catch((error) => {
          if (generation === reminderSyncGeneration.current) {
            setToast(`课程提醒安排失败：${error instanceof Error ? error.message : String(error)}`);
          }
        });
    }, 500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [calendar, capabilities.native, preset, reminderSettings.enabled, reminderSettings.defaultMinutes, effectiveCourses, storageBackend]);

  const changeWeek = (next: number) => {
    const safeWeek = Math.min(MAX_ACADEMIC_WEEK, Math.max(MIN_ACADEMIC_WEEK, next));
    setWeek(safeWeek);
    setSelectedId(undefined);
  };

  const handleMove = (id: string, day: DayOfWeek, period: number) => {
    setSnapshot((current) => ({ ...current, courses: moveMeeting(current.courses, id, day, period, preset.periods.length) }));
    setSelectedId(id);
    setSelectedDate(occurrenceDateKey(dateForCourse(calendar, week, day)));
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
    if (capabilities.schoolLogin === "unavailable") {
      if (interactive) {
        setImportOpen(true);
        setToast("当前环境不支持学校安全登录，请使用 Windows 或 Android 原生版");
      }
      return;
    }
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const loginRequest = { schoolId: snapshot.schoolId, accountId: snapshot.accountId };
      await prepareSchoolSession(loginRequest);
      let authenticated = false;
      const attempts = capabilities.schoolLogin === "embedded-window" ? 180 : 4;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await delay(650);
        const status = await getSchoolLoginStatus(loginRequest);
        if (status.authenticated) {
          authenticated = true;
          break;
        }
        if (!status.windowOpen) break;
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
      const recommendation = suggestAcademicCalendar({
        schoolId: snapshot.schoolId,
        academicYear: snapshot.academicYear,
        semester: snapshot.semester,
        studentGrade: snapshot.studentGrade,
      });
      const aligned = alignImportedWeeks(official.courses, recommendation.importWeekOffset);
      const plan = createScheduleSyncPlan(snapshot.courses, aligned.courses);
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
    if (capabilities.schoolLogin !== "separate-window") return;
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
    setNewCourseSlot(undefined);
    setSelectedId(meeting.id);
    setSelectedDate(occurrenceDateKey(dateForCourse(calendar, week, meeting.day)));
    setToast("课程已保存到本机");
  };

  const deleteCourse = (id: string) => {
    setSnapshot((current) => ({ ...current, courses: current.courses.filter((course) => course.id !== id), courseExceptions: current.courseExceptions?.filter(change => change.courseId !== id) }));
    setEditingCourse(undefined);
    setNewCourseSlot(undefined);
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
    const normalized = { ...next, name: next.name.trim() || "未命名作息" };
    const validationError = validateTimetablePreset(normalized);
    if (validationError) {
      setToast(validationError);
      return;
    }
    setSnapshot((current) => ({
      ...current,
      presets: current.presets.map((presetItem) => presetItem.id === normalized.id ? normalized : presetItem),
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

  const openNewCourse = (slot?: CourseDraftSlot) => {
    setSelectedId(undefined);
    setNewCourseSlot(slot);
    setEditingCourse("new");
  };

  const toggleReminders = async (enabled: boolean): Promise<boolean> => {
    if (enabled) {
      try {
        if (!(await ensureNotificationPermission())) {
          setToast("未获得系统通知权限，请在系统设置中允许课织发送通知");
          return false;
        }
      } catch (error) {
        setToast(`无法开启通知：${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }
    setSnapshot((current) => ({
      ...current,
      reminderSettings: { ...normalizeReminderSettings(current.reminderSettings), enabled },
    }));
    if (!enabled) setScheduledReminderCount(0);
    setToast(enabled ? "课程提醒已开启，正在安排未来通知" : "课程提醒已关闭");
    return true;
  };

  const updateCourseReminder = (courseId: string, minutes: number | undefined) => {
    setSnapshot((current) => ({
      ...current,
      courses: current.courses.map((course) => course.id === courseId ? { ...course, reminderMinutes: minutes } : course),
    }));
    setToast(minutes === 0 ? "这门课已关闭提醒" : "课程提醒已更新");
  };

  const testReminder = async () => {
    try {
      await sendReminderTestNotification();
      setToast("测试通知已发送");
    } catch (error) {
      setToast(`测试通知失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const portalRequest = (url: string): SchoolLoginRequest => {
    const school = resolveSchoolLoginUrl(url);
    if (!school?.loginUrl) throw new Error("请输入有效的 HTTPS 教务系统网址");
    return {
      schoolId: school.id,
      accountId: snapshot.accountId ?? "selection-default",
      loginUrl: school.loginUrl,
      purpose: "selection",
    };
  };

  const openSelectionPortal = async (url: string) => {
    await openSchoolLogin(portalRequest(url));
  };

  const readSelectionPortal = async (url: string) => readPortalPageSnapshot(portalRequest(url));

  const fetchSelectionResource = async (portalUrl: string, endpointUrl: string) => {
    const payload = await fetchPortalResource({ ...portalRequest(portalUrl), endpointUrl });
    return payload.body;
  };

  const grabClockEndpoint = useCallback(() => selectionAssistant.adapter?.monitorEndpoint
    ?? selectionAssistant.adapter?.entryUrl
    ?? selectionAssistant.portalUrl, [selectionAssistant.adapter?.entryUrl, selectionAssistant.adapter?.monitorEndpoint, selectionAssistant.portalUrl]);

  const handleGrabRun = useCallback((next: GrabRunState) => {
    setGrabRun(next);
    const terminal = next.status === "done" || next.status === "stopped";
    if (!terminal && !next.successIds.length) return;
    setSnapshot((current) => {
      const assistant = normalizeSelectionAssistant(current.selectionAssistant);
      const changed = next.successIds.filter((id) => assistant.targets.some((target) => target.id === id && target.status !== "submitted"));
      const shouldDisarm = terminal && assistant.autoGrab?.enabled;
      if (!changed.length && !shouldDisarm) return current;
      return {
        ...current,
        selectionAssistant: {
          ...assistant,
          targets: assistant.targets.map((target) => changed.includes(target.id) ? { ...target, status: "submitted" as const, lastMessage: "已自动抢到" } : target),
          autoGrab: shouldDisarm && assistant.autoGrab
            ? { ...assistant.autoGrab, enabled: false }
            : assistant.autoGrab,
        },
      };
    });
  }, []);

  const grabTransport = useMemo<GrabTransport>(() => ({
    submit: async (target, template) => {
      const payload = await submitPortalRequest({
        ...portalRequest(selectionAssistant.portalUrl),
        endpointUrl: template.endpointUrl,
        method: template.method,
        body: renderSubmitBody(template, target),
        contentType: template.contentType,
      });
      return { status: payload.status, body: payload.body };
    },
    probeClock: async () => {
      const result = await probePortalClock({ ...portalRequest(selectionAssistant.portalUrl), endpointUrl: grabClockEndpoint() });
      return {
        sentAt: result.localSentAt,
        receivedAt: result.localReceivedAt,
        serverTimeMs: result.serverDate ? Date.parse(result.serverDate) : undefined,
      };
    },
    prewarm: async () => {
      await prepareSchoolSession(portalRequest(selectionAssistant.portalUrl));
    },
  }), [grabClockEndpoint, selectionAssistant.portalUrl, snapshot.accountId]);

  const startAutoGrabRun = useCallback((immediate: boolean) => {
    if (!capabilities.native) {
      setToast("自动抢课需要 Windows 或 Android 原生版");
      return;
    }
    const assistant = normalizeSelectionAssistant(snapshot.selectionAssistant);
    const config = assistant.autoGrab;
    if (!config?.template?.endpointUrl) {
      setToast("请先在第 5 步填写提交接口地址和参数模板");
      return;
    }
    if (!immediate && !config.startsAt) {
      setToast("请先设置开抢时间");
      return;
    }
    if (!assistant.targets.length) {
      setToast("请先添加要抢的课程");
      return;
    }
    autoGrabHandleRef.current?.stop();
    setGrabRun(emptyGrabRun(config.clockOffsetMs));
    setSnapshot((current) => ({
      ...current,
      selectionAssistant: { ...normalizeSelectionAssistant(current.selectionAssistant), autoGrab: { ...config, enabled: !immediate } },
    }));
    autoGrabHandleRef.current = startAutoGrab({
      config,
      targets: assistant.targets,
      transport: grabTransport,
      onRun: handleGrabRun,
      onNotice: setToast,
      immediate,
    });
    setToast(immediate
      ? "正在立即试跑；本次会向学校提交真实选课请求，但不会保存为定时任务"
      : "自动抢课已部署，到点会自动提交；请保持应用在前台运行");
  }, [capabilities.native, grabTransport, handleGrabRun, snapshot.selectionAssistant]);

  const stopAutoGrabRun = useCallback(() => {
    autoGrabHandleRef.current?.stop("已手动停止");
    autoGrabHandleRef.current = undefined;
    setSnapshot((current) => {
      const assistant = normalizeSelectionAssistant(current.selectionAssistant);
      if (!assistant.autoGrab?.enabled) return current;
      return { ...current, selectionAssistant: { ...assistant, autoGrab: { ...assistant.autoGrab, enabled: false } } };
    });
  }, []);

  const calibrateGrabClock = useCallback(async () => {
    if (!capabilities.native) {
      setToast("校时需要 Windows 或 Android 原生版");
      return;
    }
    try {
      const samples: ClockProbeResult[] = [];
      for (let index = 0; index < 3; index += 1) {
        const result = await probePortalClock({ ...portalRequest(selectionAssistant.portalUrl), endpointUrl: grabClockEndpoint() });
        samples.push({
          sentAt: result.localSentAt,
          receivedAt: result.localReceivedAt,
          serverTimeMs: result.serverDate ? Date.parse(result.serverDate) : undefined,
        });
        if (index < 2) await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const calibration = calibrateClock(samples);
      if (calibration.source !== "server-date") {
        setToast("没能读到学校服务器时间，请先在原生版里登录并打开选课页");
        return;
      }
      setSnapshot((current) => {
        const assistant = normalizeSelectionAssistant(current.selectionAssistant);
        return {
          ...current,
          selectionAssistant: {
            ...assistant,
            autoGrab: {
              ...(assistant.autoGrab ?? defaultAutoGrabConfig()),
              clockOffsetMs: calibration.offsetMs,
              clockCalibratedAt: calibration.calibratedAt,
              autoCalibrate: true,
            },
          },
        };
      });
      setToast(`已按学校服务器时间校准：${formatSkew(calibration.offsetMs)}（往返 ${calibration.rttMs} 毫秒）`);
    } catch (error) {
      setToast(`校时失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [capabilities.native, grabClockEndpoint, selectionAssistant.portalUrl]);

  useEffect(() => {
    const assistant = selectionAssistant;
    const endpoint = assistant.adapter?.monitorEndpoint;
    if (!capabilities.native || !assistant.monitorEnabled || !endpoint || !assistant.portalUrl || assistant.targets.length === 0) return;
    const wait = nextMonitorDelaySeconds(assistant.intervalSeconds, assistant.consecutiveFailures) * 1000;
    const timer = window.setTimeout(() => {
      if (selectionMonitorInFlight.current) return;
      selectionMonitorInFlight.current = true;
      void fetchSelectionResource(assistant.portalUrl, endpoint)
        .then((body) => {
          const result = applySeatPayload(assistant, body);
          setSnapshot((current) => ({ ...current, selectionAssistant: applySeatPayload(normalizeSelectionAssistant(current.selectionAssistant), body).state }));
          if (result.availableCount) setToast(`选课助手发现 ${result.availableCount} 门课程有余量，请前往官方页面确认`);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setSnapshot((current) => ({ ...current, selectionAssistant: recordMonitorFailure(normalizeSelectionAssistant(current.selectionAssistant), message) }));
        })
        .finally(() => { selectionMonitorInFlight.current = false; });
    }, wait);
    return () => window.clearTimeout(timer);
    // Polling is rescheduled whenever the persisted monitor state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.native, selectionAssistant.adapter?.monitorEndpoint, selectionAssistant.consecutiveFailures, selectionAssistant.intervalSeconds, selectionAssistant.monitorEnabled, selectionAssistant.portalUrl, selectionAssistant.targets.length]);

  useEffect(() => {
    if (!capabilities.native) return;
    const schedule = selectionAssistant.schedule;
    const signature = schedule?.status === "scheduled" ? `${schedule.startsAt}:${schedule.preflightMinutes}` : "";
    if (selectionScheduleNotificationRef.current === signature) return;
    selectionScheduleNotificationRef.current = signature;
    const operation = schedule?.status === "scheduled"
      ? replaceScheduledSelectionNotifications(new Date(schedule.startsAt), schedule.preflightMinutes)
      : clearScheduledSelectionNotifications();
    void operation.catch((error) => setToast(`选课定时提醒设置失败：${error instanceof Error ? error.message : String(error)}`));
  }, [capabilities.native, selectionAssistant.schedule?.preflightMinutes, selectionAssistant.schedule?.startsAt, selectionAssistant.schedule?.status]);

  useEffect(() => {
    const assistant = selectionAssistant;
    const schedule = assistant.schedule;
    if (!capabilities.native || !schedule || schedule.status !== "scheduled" || !assistant.portalUrl) return;
    let cancelled = false;
    let timer: number | undefined;

    const waitForStart = () => {
      if (cancelled) return;
      const phase = selectionSchedulePhase(schedule);
      if (phase === "expired") {
        setSnapshot((current) => ({ ...current, selectionAssistant: expireSelectionSchedule(normalizeSelectionAssistant(current.selectionAssistant)) }));
        setToast("选课预约已经过期，请重新设置时间");
        return;
      }
      const remaining = Date.parse(schedule.startsAt) - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(waitForStart, Math.min(remaining, 60_000));
        return;
      }

      setSnapshot((current) => ({ ...current, selectionAssistant: markSelectionScheduleTriggered(normalizeSelectionAssistant(current.selectionAssistant)) }));
      const endpoint = assistant.adapter?.monitorEndpoint;
      const entryUrl = assistant.adapter?.entryUrl || assistant.portalUrl;
      const fetchTask = endpoint ? fetchSelectionResource(assistant.portalUrl, endpoint) : Promise.resolve<string | undefined>(undefined);
      const openTask = openSelectionPortal(entryUrl);
      void Promise.allSettled([fetchTask, openTask]).then(([checked, opened]) => {
        if (cancelled) return;
        const capturedResult = checked.status === "fulfilled" && checked.value
          ? applySeatPayload(markSelectionScheduleTriggered(assistant), checked.value)
          : undefined;
        const availableCount = capturedResult?.availableCount ?? 0;
        setSnapshot((current) => {
          let next = markSelectionScheduleTriggered(normalizeSelectionAssistant(current.selectionAssistant));
          if (checked.status === "fulfilled" && checked.value) {
            const result = applySeatPayload(next, checked.value);
            next = result.state;
          } else if (checked.status === "rejected") {
            next = recordMonitorFailure(next, checked.reason instanceof Error ? checked.reason.message : String(checked.reason));
          }
          return { ...current, selectionAssistant: next };
        });
        if (availableCount) setToast(`预约已触发：发现 ${availableCount} 门课程有余量，请立即在官网确认`);
        else if (opened.status === "fulfilled") setToast("预约已触发，已快速打开学校官方选课页面");
        else setToast(`预约已触发，但页面打开失败：${opened.reason instanceof Error ? opened.reason.message : String(opened.reason)}`);
      });
    };

    waitForStart();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // The timer owns its minute-by-minute wakeups until the persisted schedule changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.native, selectionAssistant.schedule?.startsAt, selectionAssistant.schedule?.status]);

  // 应用重启后仍然记得已经部署过的抢课任务，只要时间还没过就自动重新武装。
  useEffect(() => {
    if (!capabilities.native) return;
    const config = selectionAssistant.autoGrab;
    if (!config?.enabled || !config.startsAt || !config.template?.endpointUrl) return;
    if (Date.parse(config.startsAt) < Date.now() - 5 * 60_000) return;
    const signature = `${config.startsAt}:${config.prewarmMinutes}:${config.template.endpointUrl}`;
    if (autoGrabArmedRef.current === signature) return;
    autoGrabArmedRef.current = signature;
    startAutoGrabRun(false);
    // The runner owns its own timers after deployment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.native, selectionAssistant.autoGrab?.enabled, selectionAssistant.autoGrab?.startsAt, selectionAssistant.autoGrab?.prewarmMinutes, selectionAssistant.autoGrab?.template?.endpointUrl]);

  useEffect(() => () => autoGrabHandleRef.current?.stop(), []);

  const saveGrade = (grade: GradeRecord) => {
    setSnapshot((current) => ({ ...current, grades: mergeGrades(normalizeGrades(current.grades), [grade]) }));
    setEditingGrade(undefined);
    setToast("成绩已保存到本机");
  };

  const deleteGrade = (id: string) => {
    setSnapshot((current) => ({ ...current, grades: normalizeGrades(current.grades).filter((record) => record.id !== id) }));
    setEditingGrade(undefined);
    setToast("成绩记录已删除");
  };

  const pageTitle = activePage === "课表" ? "我的课表" : activePage === "今天" ? "今天" : activePage === "选课" ? "选课助手" : "成绩";
  const pageContext = activePage === "课表" ? (hasCourses ? `第 ${week} 周` : "等待导入") : activePage === "今天" ? "每日安排" : activePage === "选课" ? "学校页面学习" : `${grades.length} 条记录`;
  const pageStatus = activePage === "选课" ? (selectionAssistant.monitorEnabled ? "监控中" : selectionAssistant.adapter ? "已学习" : "待配置") : activePage === "成绩" ? (grades.length ? "仅本机" : "待录入") : isLocalSchedule ? "本地" : hasCourses ? "进行中" : "待导入";
  const schedulePage = activePage === "课表" || activePage === "今天";

  return (
    <div className="app-shell">
      <InteractionFeedback />

      <Sidebar
        active={settingsOpen ? "设置" : activePage}
        schoolName={snapshot.schoolName}
        onNavigate={(item) => {
          if (item === "设置") setSettingsOpen(true);
          else if (item === "课表" || item === "今天" || item === "选课" || item === "成绩") {
            setSelectedId(undefined);
            setEditingGrade(undefined);
            setActivePage(item as PrimaryPage);
          } else setToast(`${item}模块已加入开发路线图`);
        }}
      />

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb"><span>{isLocalSchedule ? "自定义课表" : termLabel}</span><i />{pageContext}</div>
            <div className="title-row">
              <h1>{pageTitle}</h1>
              <span className={`term-status ${(activePage === "成绩" ? grades.length : activePage === "选课" ? selectionAssistant.adapter : hasCourses) ? "" : "waiting"}`}>{pageStatus}</span>
            </div>
          </div>
          <div className="top-actions">
            {schedulePage && <button className="soft-button export-action" onClick={() => hasCourses ? setExportOpen(true) : setToast("请先导入或手动添加课程")}><Icon name="download" />导出</button>}
            {schedulePage && <button className="soft-button import-action" onClick={() => setImportOpen(true)}><Icon name="upload" /><span>导入</span></button>}
            {schedulePage && <button className={`soft-button sync-action ${syncing ? "syncing" : ""}`} disabled={syncing} onClick={() => void handleSync()}><Icon name="refresh" />{syncing ? "同步中" : "同步"}</button>}
            <button className="soft-button theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "切换亮色主题" : "切换暗色主题"} title={theme === "dark" ? "切换亮色主题" : "切换暗色主题"}><Icon name={theme === "dark" ? "sun" : "moon"} /><span>{theme === "dark" ? "亮色" : "暗色"}</span></button>
            {schedulePage && <button className="primary-button create-action" onClick={() => openNewCourse()}><Icon name="plus" /><span>新建课程</span></button>}
          </div>
        </header>

        <MotionRegion className="page-transition" motionKey={activePage}>
        {activePage === "课表" ? (
          <div className="view-stage schedule-view-stage" key="schedule">
            <section className="calendar-toolbar">
              <div className="week-control">
                <button className="icon-button" onClick={() => changeWeek(week - 1)} aria-label="上一周"><Icon name="chevron-left" /></button>
                <button className="today-button" onClick={() => changeWeek(currentAcademicWeek)}>本周</button>
                <button className="icon-button" onClick={() => changeWeek(week + 1)} aria-label="下一周"><Icon name="chevron-right" /></button>
                <button className="week-date" onClick={() => setTimetableOpen(true)} aria-label="调整第1周日期"><strong>第 {week} 周</strong><span>{formatWeekRange(view)}</span></button>
              </div>
              <div className="view-options">
                <button className="preset-button" onClick={() => setTimetableOpen(true)}><Icon name="clock" /><span>{preset.name}</span><Icon name="chevron-right" /></button>
                <div className="segmented"><button className="active">周</button><button onClick={() => setActivePage("今天")}>日</button></div>
              </div>
            </section>

            <div className="workspace">
              <section className="calendar-panel">
                <WeekCalendar
                  view={view}
                  previousView={previousView}
                  nextView={nextView}
                  preset={preset}
                  selectedId={selectedId}
                  canGoPrevious={week > 1}
                  canGoNext={week < MAX_ACADEMIC_WEEK}
                  onSelect={(meeting: CourseMeeting) => { setSelectedId(meeting.id); setSelectedDate(occurrenceDateKey(dateForCourse(calendar, week, meeting.day))); }}
                  onMove={handleMove}
                  ref={weekCalendarRef}
                  onCreate={(day, startPeriod, endPeriod) => openNewCourse({ day, startPeriod, endPeriod })}
                  onChangeWeek={(delta) => changeWeek(week + delta)}
                />
                {!hasCourses && <EmptySchedule onImport={() => setImportOpen(true)} onCreate={() => openNewCourse()} />}
                <div className="calendar-hint"><span className="hint-dot" />左右滑动切周 · 长按空白格，用箭头调时间后点 ＋ · 淡色为非本周或未开课</div>
              </section>
              <CourseDetails meeting={selected} preset={preset} reminderSettings={reminderSettings} onClose={() => setSelectedId(undefined)} onEdit={() => selectedBase && setEditingCourse(selectedBase)} onOccurrence={openSelectedOccurrence} onReminderChange={(minutes) => selectedBase && updateCourseReminder(selectedBase.id, minutes)} onOpenReminderSettings={() => setSettingsOpen(true)} />
            </div>
          </div>
        ) : activePage === "今天" ? (
          <div className="view-stage today-view-stage" key="today">
            <div className="workspace today-workspace">
              <TodayAgenda courses={effectiveCourses} preset={preset} calendar={calendar} onSelect={(meeting, date) => { setSelectedId(meeting.id); setSelectedDate(occurrenceDateKey(date)); }} onCreate={(day, startPeriod) => openNewCourse({ day, startPeriod })} onOpenWeek={(nextWeek) => { changeWeek(nextWeek); setActivePage("课表"); }} />
              <CourseDetails meeting={selected} preset={preset} reminderSettings={reminderSettings} onClose={() => setSelectedId(undefined)} onEdit={() => selectedBase && setEditingCourse(selectedBase)} onOccurrence={openSelectedOccurrence} onReminderChange={(minutes) => selectedBase && updateCourseReminder(selectedBase.id, minutes)} onOpenReminderSettings={() => setSettingsOpen(true)} />
            </div>
          </div>
        ) : activePage === "选课" ? (
          <SelectionAssistantPage
            state={selectionAssistant}
            nativeAvailable={capabilities.native}
            run={grabRun}
            onChange={(next) => setSnapshot((current) => ({ ...current, selectionAssistant: next }))}
            onOpenPortal={openSelectionPortal}
            onReadPortal={readSelectionPortal}
            onFetchResource={fetchSelectionResource}
            onStartAutoGrab={startAutoGrabRun}
            onStopAutoGrab={stopAutoGrabRun}
            onCalibrateClock={calibrateGrabClock}
            onToast={setToast}
          />
        ) : (
          <GradesPage
            records={grades}
            defaultYear={snapshot.academicYear ?? new Date().getFullYear()}
            defaultSemester={snapshot.semester ?? 1}
            onChange={(next) => setSnapshot((current) => ({ ...current, grades: next }))}
            onEdit={(grade) => setEditingGrade(grade ?? "new")}
            onToast={setToast}
          />
        )}
        </MotionRegion>
      </main>

      <Presence>
      {settingsOpen && (
        <SettingsDialog
          onOpenExport={() => { setSettingsOpen(false); setExportOpen(true); }}
          settings={reminderSettings}
          scheduledCount={scheduledReminderCount}
          nativeNotifications={capabilities.native}
          onToggleReminders={toggleReminders}
          onDefaultMinutesChange={(defaultMinutes) => setSnapshot((current) => ({ ...current, reminderSettings: { ...normalizeReminderSettings(current.reminderSettings), defaultMinutes } }))}
          onTestNotification={testReminder}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      </Presence>

      <Presence>
      {timetableOpen && (
        <TimetableDialog
          presets={snapshot.presets}
          activeId={snapshot.activePresetId}
          termStartsOn={snapshot.termStartsOn ?? DEFAULT_TERM_START_KEY}
          teachingStartsOn={snapshot.teachingStartsOn ?? snapshot.termStartsOn ?? DEFAULT_TERM_START_KEY}
          studentGrade={snapshot.studentGrade ?? 1}
          onStudentGradeChange={(studentGrade) => setSnapshot((current) => {
            const suggestion = suggestAcademicCalendar({
              schoolId: current.schoolId,
              academicYear: current.academicYear ?? 2026,
              semester: current.semester ?? 1,
              studentGrade,
            });
            return { ...current, studentGrade, termStartsOn: suggestion.termStartsOn, teachingStartsOn: suggestion.teachingStartsOn };
          })}
          onTermStartChange={(value) => setSnapshot((current) => {
            const termStartsOn = normalizeTermStartKey(value);
            return { ...current, termStartsOn, teachingStartsOn: normalizeTeachingStartKey(current.teachingStartsOn, termStartsOn) };
          })}
          onTeachingStartChange={(value) => setSnapshot((current) => ({
            ...current,
            teachingStartsOn: normalizeTeachingStartKey(value, current.termStartsOn),
          }))}
          onActivate={(id) => setSnapshot((current) => ({ ...current, activePresetId: id }))}
          onChange={updatePreset}
          onCreate={createPreset}
          onClose={() => setTimetableOpen(false)}
        />
      )}
      </Presence>

      <Presence>
      {editingCourse && (
        <CourseEditorDialog
          meeting={editingCourse === "new" ? undefined : editingCourse}
          initialSlot={editingCourse === "new" ? newCourseSlot : undefined}
          maxPeriod={preset.periods.length}
          onSave={saveCourse}
          onDelete={editingCourse === "new" ? undefined : deleteCourse}
          onClose={() => {
            setEditingCourse(undefined);
            setNewCourseSlot(undefined);
          }}
        />
      )}
      </Presence>

      <Presence>{occurrenceOpen && <CourseOccurrenceDialog course={occurrenceOpen.course} date={occurrenceOpen.date} calendar={calendar} preset={preset}
        courses={snapshot.courses} changes={snapshot.courseExceptions}
        existing={snapshot.courseExceptions?.find(change => change.courseId === occurrenceOpen.course.id && change.originalDate === occurrenceOpen.date)}
        onClose={() => setOccurrenceOpen(undefined)}
        onSave={change => {
          setSnapshot(current => ({ ...current, courseExceptions: normalizeCourseExceptions([...(current.courseExceptions ?? []).filter(entry => entry.courseId !== change.courseId || entry.originalDate !== change.originalDate), change]) }));
          setOccurrenceOpen(undefined); setSelectedId(undefined); setToast("已保存本次变更 · 再次点课程可撤销");
        }}
        onUndo={() => {
          setSnapshot(current => ({ ...current, courseExceptions: (current.courseExceptions ?? []).filter(entry => entry.courseId !== occurrenceOpen.course.id || entry.originalDate !== occurrenceOpen.date) }));
          setOccurrenceOpen(undefined); setSelectedId(undefined); setToast("已撤销本次变更，其他周未改变");
        }} />}</Presence>

      <Presence>
      {editingGrade && (
        <GradeEditorDialog
          grade={editingGrade === "new" ? undefined : editingGrade}
          defaultYear={snapshot.academicYear ?? new Date().getFullYear()}
          defaultSemester={snapshot.semester ?? 1}
          onSave={saveGrade}
          onDelete={editingGrade === "new" ? undefined : deleteGrade}
          onClose={() => setEditingGrade(undefined)}
        />
      )}
      </Presence>

      <Presence>
      {importOpen && (
        <ImportWizard
          ref={importWizardRef}
          activeAccountId={snapshot.accountId}
          onClose={() => setImportOpen(false)}
          onStartManual={() => {
            setImportOpen(false);
            openNewCourse();
          }}
          onRestore={(restored) => {
            setSnapshot(normalizeSnapshot(restored));
            setImportOpen(false);
            setWeek(1);
            setToast(`已恢复 ${restored.courses.length} 条课程记录`);
          }}
          onStartCalendarImport={() => {
            setImportOpen(false);
            setCalendarImportOpen(true);
          }}
          onImported={(school, account, importedCourses, keepLocal, term) => {
            setSnapshot((current) => {
              const importedIds = new Set(importedCourses.map((course) => course.id));
              const localCourses = keepLocal ? current.courses.filter((course) => !importedIds.has(course.id)) : [];
              const sameContext = current.accountId === account.id && current.schoolId === school.id && current.academicYear === term.academicYear && current.semester === term.semester;
              const courseIds = new Set([...localCourses, ...importedCourses].map(course => course.id));
              const courseExceptions = sameContext ? current.courseExceptions?.filter(change => courseIds.has(change.courseId)) : [];
              return { ...current, courseExceptions, schoolName: school.name, schoolId: school.id, accountId: account.id, academicYear: term.academicYear, semester: term.semester, studentGrade: term.studentGrade, termStartsOn: normalizeTermStartKey(term.termStartsOn), teachingStartsOn: normalizeTeachingStartKey(term.teachingStartsOn, term.termStartsOn), lastSyncAt: new Date().toISOString(), courses: [...localCourses, ...importedCourses] };
            });
            setImportOpen(false);
            setToast(`已从${school.name}导入 ${importedCourses.length} 条课程`);
          }}
        />
      )}
      </Presence>

      <Presence>
      {calendarImportOpen && (
        <CalendarImportDialog
          preset={preset}
          currentTermStartsOn={snapshot.termStartsOn ?? DEFAULT_TERM_START_KEY}
          hasExistingCourses={hasCourses}
          onClose={() => setCalendarImportOpen(false)}
          onImport={(courses, termStartsOn, mode) => {
            setSnapshot((current) => {
              const replace = mode === "replace";
              return {
                ...current,
                schoolName: replace || !current.schoolName ? "日历导入" : current.schoolName,
                termStartsOn,
                teachingStartsOn: replace || current.courses.length === 0 ? termStartsOn : current.teachingStartsOn,
                courses: replace ? courses : mergeIcsCourses(current.courses, courses),
                courseExceptions: replace ? [] : current.courseExceptions,
              };
            });
            setCalendarImportOpen(false);
            setActivePage("课表");
            setWeek(1);
            setSelectedId(undefined);
            setToast(`已从日历${mode === "replace" ? "导入" : "合并"} ${courses.length} 门课程`);
          }}
        />
      )}
      </Presence>

      <Presence>{exportOpen && (
        <ExportDialog
          snapshot={snapshot}
          preset={preset}
          calendar={calendar}
          week={week}
          onClose={() => setExportOpen(false)}
          onExported={(message) => setToast(message)}
          onPrint={() => {
            setExportOpen(false);
            window.setTimeout(() => window.print(), 240);
          }}
        />
      )}

      </Presence>
      <Presence>{syncPlan && <SyncReviewDialog plan={syncPlan} onClose={() => setSyncPlan(undefined)} onApply={applySyncChoices} />}</Presence>

      <Presence>{toast && <Snackbar message={toast} onClose={() => setToast(undefined)} />}</Presence>
    </div>
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
