package app.kezhi.android

import android.Manifest
import android.app.Activity
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.ContentValues
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars as calendars
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class PhoneCalendarEvent {
  lateinit var key: String
  lateinit var title: String
  var location: String = ""
  var description: String = ""
  var startMs: Long = 0
  var endMs: Long = 0
  var reminderMinutes: Int = 0
}

@InvokeArg
class PhoneCalendarArgs {
  var events: Array<PhoneCalendarEvent> = emptyArray()
}

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR], alias = "calendar")])
class PhoneCalendarPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private val account = "app.kezhi.android.local"
  private val calendarName = "课织课表"

  @Command
  fun writeCalendar(invoke: Invoke) {
    if (!busy.compareAndSet(false, true)) {
      invoke.reject("已有日历导入正在处理，请稍后重试")
      return
    }
    try {
      validate(invoke.parseArgs(PhoneCalendarArgs::class.java))
      if (getPermissionState("calendar") != PermissionState.GRANTED) {
        requestPermissionForAlias("calendar", invoke, "calendarPermissionResult")
      } else writeGranted(invoke)
    } catch (error: Exception) {
      busy.set(false)
      invoke.reject(error.message ?: "日历导入参数无效")
    }
  }

  @PermissionCallback
  fun calendarPermissionResult(invoke: Invoke) {
    if (getPermissionState("calendar") != PermissionState.GRANTED) {
      busy.set(false)
      invoke.reject("未获得日历权限，未写入任何课程。请在系统应用权限中允许日历访问后重试。")
    } else writeGranted(invoke)
  }

  private fun validate(args: PhoneCalendarArgs) {
    require(args.events.size in 1..3000) { "一次请选择 1–3000 节课程" }
    require(args.events.map { it.key }.distinct().size == args.events.size) { "课程标识重复" }
    for (event in args.events) {
      require(event.key.length in 1..2048 && event.title.length in 1..500 && event.location.length <= 1000 && event.description.length <= 4000) { "课程文本过长或不完整" }
      require(event.startMs in 946684800000L..7258118400000L && event.endMs > event.startMs && event.endMs - event.startMs <= 86400000L) { "课程时间无效" }
      require(event.reminderMinutes in 0..10080) { "课程提醒时间无效" }
    }
  }

  private fun writeGranted(invoke: Invoke) {
    worker.execute {
      var inserted = 0
      var updated = 0
      try {
        val args = invoke.parseArgs(PhoneCalendarArgs::class.java)
        validate(args)
        val resolver = activity.contentResolver
        val calendarId = findOrCreateCalendar()
        val existing = mutableMapOf<String, Long>()
        // Only inspect events owned by this app in its LOCAL calendar.
        resolver.query(CalendarContract.Events.CONTENT_URI,
          arrayOf(CalendarContract.Events._ID, CalendarContract.Events.CUSTOM_APP_URI),
          "${CalendarContract.Events.CALENDAR_ID}=? AND ${CalendarContract.Events.CUSTOM_APP_PACKAGE}=? AND ${CalendarContract.Events.DELETED}=0",
          arrayOf(calendarId.toString(), activity.packageName), null)?.use { cursor ->
          while (cursor.moveToNext()) existing[cursor.getString(1) ?: ""] = cursor.getLong(0)
        } ?: error("无法读取课织日历，请检查系统日历是否可用")

        for (chunk in args.events.toList().chunked(80)) {
          val ops = ArrayList<ContentProviderOperation>()
          var chunkInserted = 0
          var chunkUpdated = 0
          for (event in chunk) {
            val key = "kezhi://course/" + MessageDigest.getInstance("SHA-256").digest(event.key.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
            val id = existing[key]
            val values = ContentValues().apply {
              put(CalendarContract.Events.CALENDAR_ID, calendarId)
              put(CalendarContract.Events.TITLE, event.title)
              put(CalendarContract.Events.EVENT_LOCATION, event.location)
              put(CalendarContract.Events.DESCRIPTION, event.description)
              put(CalendarContract.Events.DTSTART, event.startMs)
              put(CalendarContract.Events.DTEND, event.endMs)
              put(CalendarContract.Events.EVENT_TIMEZONE, "Asia/Shanghai")
              put(CalendarContract.Events.CUSTOM_APP_PACKAGE, activity.packageName)
              put(CalendarContract.Events.CUSTOM_APP_URI, key)
              put(CalendarContract.Events.HAS_ALARM, if (event.reminderMinutes > 0) 1 else 0)
            }
            val insertIndex = ops.size
            if (id == null) {
              ops.add(ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI).withValues(values).build())
              chunkInserted++
            } else {
              ops.add(ContentProviderOperation.newUpdate(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id)).withValues(values).build())
              ops.add(ContentProviderOperation.newDelete(CalendarContract.Reminders.CONTENT_URI)
                .withSelection("${CalendarContract.Reminders.EVENT_ID}=?", arrayOf(id.toString())).build())
              chunkUpdated++
            }
            if (event.reminderMinutes > 0) {
              val reminder = ContentProviderOperation.newInsert(CalendarContract.Reminders.CONTENT_URI)
                .withValue(CalendarContract.Reminders.MINUTES, event.reminderMinutes)
                .withValue(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
              if (id == null) reminder.withValueBackReference(CalendarContract.Reminders.EVENT_ID, insertIndex)
              else reminder.withValue(CalendarContract.Reminders.EVENT_ID, id)
              ops.add(reminder.build())
            }
          }
          // Small atomic batches keep binder payloads bounded. A retry reuses IDs.
          resolver.applyBatch(CalendarContract.AUTHORITY, ops)
          inserted += chunkInserted
          updated += chunkUpdated
        }
        invoke.resolve(JSObject().apply { put("inserted", inserted); put("updated", updated); put("calendarName", calendarName) })
      } catch (error: Exception) {
        invoke.reject("日历写入未完成（已新增 $inserted 节、更新 $updated 节）。可重试，不会重复添加已写入的课程。原因：" + (error.message ?: "系统日历不可用"))
      } finally {
        busy.set(false)
      }
    }
  }

  private fun findOrCreateCalendar(): Long {
    activity.contentResolver.query(calendars.CONTENT_URI, arrayOf(calendars._ID),
      "${calendars.ACCOUNT_NAME}=? AND ${calendars.ACCOUNT_TYPE}=? AND ${calendars.NAME}=?",
      arrayOf(account, CalendarContract.ACCOUNT_TYPE_LOCAL, "kezhi-courses-v1"), null)?.use {
      if (it.moveToFirst()) return it.getLong(0)
    } ?: error("系统没有可访问的日历服务")
    val uri = calendars.CONTENT_URI.buildUpon()
      .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
      .appendQueryParameter(calendars.ACCOUNT_NAME, account)
      .appendQueryParameter(calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build()
    val values = ContentValues().apply {
      put(calendars.ACCOUNT_NAME, account)
      put(calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
      put(calendars.NAME, "kezhi-courses-v1")
      put(calendars.CALENDAR_DISPLAY_NAME, calendarName)
      put(calendars.CALENDAR_COLOR, 0xff0b57d0.toInt())
      put(calendars.CALENDAR_ACCESS_LEVEL, calendars.CAL_ACCESS_OWNER)
      put(calendars.OWNER_ACCOUNT, account)
      put(calendars.CALENDAR_TIME_ZONE, "Asia/Shanghai")
      put(calendars.VISIBLE, 1)
      put(calendars.SYNC_EVENTS, 1)
    }
    return ContentUris.parseId(activity.contentResolver.insert(uri, values) ?: error("无法创建课织本地日历"))
  }
}
