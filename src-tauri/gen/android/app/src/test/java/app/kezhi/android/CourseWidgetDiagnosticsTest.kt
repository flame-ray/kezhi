package app.kezhi.android

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.text.SimpleDateFormat
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class CourseWidgetDiagnosticsTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val now = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).parse("2026-10-13 09:00")!!.time
  private fun snapshot(vararg dates: String) = JSONObject().put("version",1).put("events",JSONArray().apply {
    dates.forEach { date -> put(JSONObject().put("date",date).put("start","08:20").put("end","09:55")
      .put("id","private-id").put("title","private-course").put("location","private-room")) }
  }).toString()
  @Test fun missingAndEmptyHaveDifferentStates() {
    assertEquals("missing",CourseWidgetDiagnostics.read(context,now).getString("cacheState"))
    CourseWidgetStore.save(context,snapshot())
    val report = CourseWidgetDiagnostics.read(context,now)
    assertEquals("ready",report.getString("cacheState"))
    assertEquals(0,report.getInt("eventCount"))
    assertTrue(report.isNull("firstDate"))
    assertTrue(report.getLong("syncedAt") > 0)
  }
  @Test fun corruptCacheIsReportedWithoutExposingIt() {
    context.getSharedPreferences("kezhi_course_widget",Context.MODE_PRIVATE).edit()
      .putString("snapshot","private-corrupt-content").putLong("syncedAt",123).commit()
    val report = CourseWidgetDiagnostics.read(context,now)
    assertEquals("invalid",report.getString("cacheState"))
    assertEquals(123L,report.getLong("syncedAt"))
    assertFalse(report.toString().contains("private"))
  }
  @Test fun countsAndDateRangeAreLocalAggregatesOnly() {
    CourseWidgetStore.save(context,snapshot("2026-10-15","2026-10-13","2026-10-13","2026-09-17"))
    val manager = shadowOf(AppWidgetManager.getInstance(context))
    manager.bindAppWidgetId(901,ComponentName(context,CourseWidgetProvider::class.java))
    manager.bindAppWidgetId(902,ComponentName(context,CourseWidgetProvider::class.java))
    val report = CourseWidgetDiagnostics.read(context,now)
    assertEquals(2,report.getInt("widgetCount"))
    assertEquals(2,report.getInt("todayCount"))
    assertEquals(4,report.getInt("eventCount"))
    assertEquals("2026-09-17",report.getString("firstDate"))
    assertEquals("2026-10-15",report.getString("lastDate"))
    assertEquals("2026-10-13",report.getString("today"))
    assertEquals(9,report.length())
    assertFalse(report.toString().contains("private"))
  }
  @Test fun inspectingDoesNotChangeSyncTimeAndInvalidWriteKeepsCache() {
    CourseWidgetStore.save(context,snapshot("2026-10-13"))
    val time = CourseWidgetStore.syncedAt(context)
    CourseWidgetDiagnostics.read(context,now + 10000)
    assertEquals(time,CourseWidgetStore.syncedAt(context))
    try { CourseWidgetStore.save(context,"invalid"); fail("invalid snapshot accepted") } catch (_: Exception) {}
    assertEquals(1,CourseWidgetDiagnostics.read(context,now).getInt("eventCount"))
    assertEquals(time,CourseWidgetStore.syncedAt(context))
  }
}
