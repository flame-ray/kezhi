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
