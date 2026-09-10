package app.kezhi.android

import android.app.Activity
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.ContentValues
import android.os.SystemClock
import android.provider.CalendarContract
import android.provider.CalendarContract.Events as E
import android.provider.CalendarContract.Calendars as C
import android.provider.CalendarContract.Reminders as R
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

/** Preview is read-only. A short-lived one-use plan binds confirmation to exact provider state. */
class CalendarSyncEngine(private val activity: Activity, private val account: String, private val name: String) {
  internal data class Row(val id: Long, val uri: String, val title: String, val location: String, val description: String, val start: Long, val end: Long, val reminders: List<Pair<Int, Int>>)
  internal data class Change(val kind: String, val uri: String, val old: Row?, val event: PhoneCalendarEvent?)
  private data class Plan(val token: String, val at: Long, val calendar: Long?, val before: List<Row>, val changes: List<Change>, val unchanged: Int)
  private var pending: Plan? = null
  private val resolver get() = activity.contentResolver
  private val legacy = Regex("^kezhi://course/[a-f0-9]{64}$")
  private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  fun preview(args: PhoneCalendarArgs): JSObject {
    pending = null
    require(args.scope.length in 1..4096) { "日历范围无效" }
    val calendar = findCalendar()
    val before = readRows(calendar)
    val prefix = "kezhi://course/v2/${hash(args.scope)}/"
    val wanted = args.events.associateBy { prefix + hash(it.key) }
    val (changes, unchanged) = reconcileRows(before, wanted, prefix, args.cleanupLegacy)
    require(changes.size <= 6000) { "待更新事件过多，请先缩小范围" }
    val plan = Plan(UUID.randomUUID().toString(), SystemClock.elapsedRealtime(), calendar, before, changes, unchanged)
    pending = plan
    return JSObject().apply {
      put("token", plan.token); put("calendarName", name)
      put("inserted", changes.count { it.kind == "insert" }); put("updated", changes.count { it.kind == "update" }); put("deleted", changes.count { it.kind == "delete" }); put("unchanged", unchanged)
      put("legacyPreserved", if (args.cleanupLegacy) 0 else before.count { legacy.matches(it.uri) })
      put("changes", JSONArray().apply { changes.forEach { change -> put(JSONObject().apply {
        put("kind", change.kind); put("title", change.event?.title ?: change.old!!.title)
        put("startMs", change.event?.startMs ?: change.old!!.start)
        put("location", change.event?.location ?: change.old!!.location)
        change.old?.let { put("previousStartMs", it.start); put("previousLocation", it.location) }
      }) } })
    }
  }

  fun apply(token: String): JSObject {
    val plan = pending ?: error("预览已失效，请重新预览")
    require(plan.token == token && SystemClock.elapsedRealtime() - plan.at <= 600000) { "预览已过期，请重新预览" }
    pending = null
    require(findCalendar() == plan.calendar && readRows(plan.calendar) == plan.before) { "系统日历已变化，未执行本次更新，请重新预览" }
    var inserted = 0; var updated = 0; var deleted = 0
    try {
      if (plan.changes.isNotEmpty()) {
        val calendar = plan.calendar ?: createCalendar()
        // Deletes run last; each bounded batch is atomic. Retry always starts with a fresh preview.
        for (chunk in plan.changes.chunked(60)) {
          val ops = arrayListOf<ContentProviderOperation>()
          for (change in chunk) {
            val old = change.old
            val selection = "${E._ID}=? AND ${E.CALENDAR_ID}=? AND ${E.CUSTOM_APP_PACKAGE}=? AND ${E.CUSTOM_APP_URI}=? AND ${E.DELETED}=0"
            val args = if (old == null) emptyArray() else arrayOf(old.id.toString(), calendar.toString(), activity.packageName, old.uri)
            if (old != null) {
              // Re-check inside the same batch, including user edits made after preview validation.
              val expected = ContentValues().apply { put(E.TITLE, old.title); put(E.EVENT_LOCATION, old.location); put(E.DESCRIPTION, old.description); put(E.DTSTART, old.start); put(E.DTEND, old.end) }
              ops.add(ContentProviderOperation.newAssertQuery(E.CONTENT_URI).withSelection(selection, args).withExpectedCount(1).withValues(expected).build())
            }
            if (change.kind == "delete") {
              ops.add(ContentProviderOperation.newDelete(E.CONTENT_URI).withSelection(selection, args).withExpectedCount(1).build())
              continue
            }
            val event = change.event!!
            val values = ContentValues().apply {
              put(E.CALENDAR_ID, calendar); put(E.TITLE, event.title); put(E.EVENT_LOCATION, event.location); put(E.DESCRIPTION, event.description)
              put(E.DTSTART, event.startMs); put(E.DTEND, event.endMs); put(E.EVENT_TIMEZONE, "Asia/Shanghai")
              put(E.CUSTOM_APP_PACKAGE, activity.packageName); put(E.CUSTOM_APP_URI, change.uri); put(E.HAS_ALARM, if (event.reminderMinutes > 0) 1 else 0)
            }
            val index = ops.size
            if (old == null) ops.add(ContentProviderOperation.newInsert(E.CONTENT_URI).withValues(values).build())
            else {
              ops.add(ContentProviderOperation.newUpdate(E.CONTENT_URI).withSelection(selection, args).withExpectedCount(1).withValues(values).build())
              ops.add(ContentProviderOperation.newDelete(R.CONTENT_URI).withSelection("${R.EVENT_ID}=?", arrayOf(old.id.toString())).build())
            }
            if (event.reminderMinutes > 0) {
              val alarm = ContentProviderOperation.newInsert(R.CONTENT_URI).withValue(R.MINUTES, event.reminderMinutes).withValue(R.METHOD, R.METHOD_ALERT)
              if (old == null) alarm.withValueBackReference(R.EVENT_ID, index) else alarm.withValue(R.EVENT_ID, old.id)
              ops.add(alarm.build())
            }
          }
          resolver.applyBatch(CalendarContract.AUTHORITY, ops)
          inserted += chunk.count { it.kind == "insert" }; updated += chunk.count { it.kind == "update" }; deleted += chunk.count { it.kind == "delete" }
        }
      }
    } catch (error: Exception) { throw IllegalStateException("更新未全部完成：已新增 $inserted、修改 $updated、删除 $deleted。请重新预览后继续。原因：${error.message}", error) }
    return JSObject().apply { put("inserted", inserted); put("updated", updated); put("deleted", deleted); put("unchanged", plan.unchanged); put("calendarName", name) }
  }

  private fun findCalendar(): Long? {
    resolver.query(C.CONTENT_URI, arrayOf(C._ID), "${C.ACCOUNT_NAME}=? AND ${C.ACCOUNT_TYPE}=? AND ${C.NAME}=?", arrayOf(account, CalendarContract.ACCOUNT_TYPE_LOCAL, "kezhi-courses-v1"), null)?.use {
      return if (it.moveToFirst()) it.getLong(0) else null
    } ?: error("无法读取系统日历服务")
  }

  private fun readRows(calendar: Long?): List<Row> {
    if (calendar == null) return emptyList()
    val rows = mutableListOf<Row>()
    resolver.query(E.CONTENT_URI, arrayOf(E._ID, E.CUSTOM_APP_URI, E.TITLE, E.EVENT_LOCATION, E.DESCRIPTION, E.DTSTART, E.DTEND),
      "${E.CALENDAR_ID}=? AND ${E.CUSTOM_APP_PACKAGE}=? AND ${E.DELETED}=0", arrayOf(calendar.toString(), activity.packageName), "${E._ID} ASC")?.use { cursor ->
      while (cursor.moveToNext()) {
        require(rows.size < 12000) { "课织日历事件过多，暂不能安全预览" }
        rows.add(Row(cursor.getLong(0), cursor.getString(1).orEmpty(), cursor.getString(2).orEmpty(), cursor.getString(3).orEmpty(), cursor.getString(4).orEmpty(), cursor.getLong(5), cursor.getLong(6), emptyList()))
      }
    } ?: error("无法读取课织课程事件")
    val alarms = mutableMapOf<Long, MutableList<Pair<Int, Int>>>()
    for (chunk in rows.chunked(200)) {
      resolver.query(R.CONTENT_URI, arrayOf(R.EVENT_ID, R.MINUTES, R.METHOD), "${R.EVENT_ID} IN (${chunk.joinToString(",") { "?" }})", chunk.map { it.id.toString() }.toTypedArray(), null)?.use { cursor ->
        while (cursor.moveToNext()) alarms.getOrPut(cursor.getLong(0)) { mutableListOf() }.add(cursor.getInt(1) to cursor.getInt(2))
      } ?: error("无法读取课程提醒，已停止预览")
    }
    return rows.map { it.copy(reminders = alarms[it.id].orEmpty().sortedWith(compareBy({ pair -> pair.first }, { pair -> pair.second }))) }
  }

  private fun createCalendar(): Long {
    val uri = C.CONTENT_URI.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true").appendQueryParameter(C.ACCOUNT_NAME, account).appendQueryParameter(C.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build()
    val values = ContentValues().apply {
      put(C.ACCOUNT_NAME, account); put(C.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL); put(C.NAME, "kezhi-courses-v1"); put(C.CALENDAR_DISPLAY_NAME, name)
      put(C.CALENDAR_COLOR, 0xff0b57d0.toInt()); put(C.CALENDAR_ACCESS_LEVEL, C.CAL_ACCESS_OWNER); put(C.OWNER_ACCOUNT, account)
      put(C.CALENDAR_TIME_ZONE, "Asia/Shanghai"); put(C.VISIBLE, 1); put(C.SYNC_EVENTS, 1)
    }
    return ContentUris.parseId(resolver.insert(uri, values) ?: error("无法创建课织日历"))
  }

  companion object {
    internal fun reconcileRows(before: List<Row>, wanted: Map<String, PhoneCalendarEvent>, prefix: String, cleanupLegacy: Boolean): Pair<List<Change>, Int> {
      val changes = mutableListOf<Change>()
      var unchanged = 0
      val grouped = before.groupBy { it.uri }
      for ((uri, event) in wanted) {
        val matches = grouped[uri].orEmpty()
        require(matches.size <= 1) { "课织日历中存在重复标识，请先在系统日历检查重复事件" }
        val old = matches.firstOrNull()
        val reminders = if (event.reminderMinutes > 0) listOf(event.reminderMinutes to R.METHOD_ALERT) else emptyList()
        if (old == null) changes.add(Change("insert", uri, null, event))
        else if (old.title != event.title || old.location != event.location || old.description != event.description || old.start != event.startMs || old.end != event.endMs || old.reminders != reminders) changes.add(Change("update", uri, old, event))
        else unchanged++
      }
      for (old in before) {
        val inScope = old.uri.startsWith(prefix) && Regex("[a-f0-9]{64}").matches(old.uri.removePrefix(prefix))
        val legacy = Regex("^kezhi://course/[a-f0-9]{64}$").matches(old.uri)
        if ((inScope && old.uri !in wanted) || (cleanupLegacy && legacy)) changes.add(Change("delete", old.uri, old, null))
      }
      return changes to unchanged
    }
  }
}
