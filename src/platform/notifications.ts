import {
  cancel,
  createChannel,
  Importance,
  isPermissionGranted,
  pending,
  requestPermission,
  Schedule,
  sendNotification,
  Visibility,
} from "@tauri-apps/plugin-notification";
import type { ScheduledCourseReminder } from "../reminders/reminderSchedule";
import { isCourseReminderNotificationId } from "../reminders/reminderSchedule";
import { getRuntimeCapabilities } from "./runtime";

const COURSE_CHANNEL_ID = "course-reminders";
const SELECTION_CHANNEL_ID = "selection-assistant";
const SELECTION_PREFLIGHT_NOTIFICATION_ID = 2_000_000_001;
const SELECTION_DUE_NOTIFICATION_ID = 2_000_000_002;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!getRuntimeCapabilities().native) return false;
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

export async function replaceScheduledCourseNotifications(reminders: ScheduledCourseReminder[]): Promise<number> {
  if (!getRuntimeCapabilities().native) return 0;
  if (!(await isPermissionGranted())) return 0;

  await cancelScheduledCourseNotifications();
  const capabilities = getRuntimeCapabilities();
  if (capabilities.platform === "android") {
    await createChannel({
      id: COURSE_CHANNEL_ID,
      name: "上课提醒",
      description: "按课表时间提醒即将开始的课程",
      importance: Importance.High,
      visibility: Visibility.Private,
      lights: true,
      vibration: true,
    });
  }

  for (const reminder of reminders) {
    sendNotification({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      schedule: Schedule.at(reminder.at, false, true),
      autoCancel: true,
      group: "kezhi-courses",
      channelId: capabilities.platform === "android" ? COURSE_CHANNEL_ID : undefined,
      extra: { courseId: reminder.courseId, week: reminder.week },
    });
  }
  return reminders.length;
}

export async function clearScheduledCourseNotifications(): Promise<void> {
  if (!getRuntimeCapabilities().native) return;
  if (await isPermissionGranted()) await cancelScheduledCourseNotifications();
}

async function cancelScheduledCourseNotifications(): Promise<void> {
  const ids = (await pending())
    .map((notification) => notification.id)
    .filter(isCourseReminderNotificationId);
  if (ids.length) await cancel(ids);
}

export async function sendReminderTestNotification(): Promise<void> {
  if (!(await ensureNotificationPermission())) throw new Error("未获得系统通知权限");
  const capabilities = getRuntimeCapabilities();
  if (capabilities.platform === "android") {
    await createChannel({
      id: COURSE_CHANNEL_ID,
      name: "上课提醒",
      description: "按课表时间提醒即将开始的课程",
      importance: Importance.High,
      visibility: Visibility.Private,
      lights: true,
      vibration: true,
    });
  }
  sendNotification({
    title: "课织提醒测试",
    body: "系统通知已连接，今后的课程会按设置时间提醒。",
    channelId: capabilities.platform === "android" ? COURSE_CHANNEL_ID : undefined,
    autoCancel: true,
  });
}

export async function replaceScheduledSelectionNotifications(at: Date, preflightMinutes: number): Promise<void> {
  if (!getRuntimeCapabilities().native) return;
  if (!(await ensureNotificationPermission())) throw new Error("未获得系统通知权限");
  await cancel([SELECTION_PREFLIGHT_NOTIFICATION_ID, SELECTION_DUE_NOTIFICATION_ID]);
  const capabilities = getRuntimeCapabilities();
  if (capabilities.platform === "android") {
    await createChannel({
      id: SELECTION_CHANNEL_ID,
      name: "选课助手",
      description: "选课开始前与开始时的本地提醒",
      importance: Importance.High,
      visibility: Visibility.Private,
      lights: true,
      vibration: true,
    });
  }
  const channelId = capabilities.platform === "android" ? SELECTION_CHANNEL_ID : undefined;
  const preflightAt = new Date(at.getTime() - preflightMinutes * 60_000);
  if (preflightAt.getTime() > Date.now()) {
    sendNotification({
      id: SELECTION_PREFLIGHT_NOTIFICATION_ID,
      title: `选课将在 ${preflightMinutes} 分钟后开始`,
      body: "请打开课织预热登录会话，并确认验证码已完成。",
      schedule: Schedule.at(preflightAt, false, true),
      autoCancel: true,
      group: "kezhi-selection",
      channelId,
    });
  }
  sendNotification({
    id: SELECTION_DUE_NOTIFICATION_ID,
    title: "选课时间到了",
    body: "课织已进入快速确认流程，请在学校官方页面完成选课。",
    schedule: Schedule.at(at, false, true),
    autoCancel: true,
    group: "kezhi-selection",
    channelId,
  });
}

export async function clearScheduledSelectionNotifications(): Promise<void> {
  if (!getRuntimeCapabilities().native || !(await isPermissionGranted())) return;
  await cancel([SELECTION_PREFLIGHT_NOTIFICATION_ID, SELECTION_DUE_NOTIFICATION_ID]);
}
