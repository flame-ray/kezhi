package app.kezhi.android

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale

/** Aggregate metadata only: never return names, locations, IDs or account data. */
object CourseWidgetDiagnostics {
  fun read(context: Context, now: Long = System.currentTimeMillis()): JSONObject {
    val cache = CourseWidgetStore.inspect(context)
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(now)
    val widgetCount = AppWidgetManager.getInstance(context)
      .getAppWidgetIds(ComponentName(context, CourseWidgetProvider::class.java)).size
    return JSONObject().put("cacheState", cache.state).put("syncedAt", cache.syncedAt)
      .put("checkedAt", now).put("today", today).put("widgetCount", widgetCount)
      .put("eventCount", cache.courses.size).put("todayCount", cache.courses.count { it.date == today })
      .put("firstDate", cache.courses.minOfOrNull { it.date } ?: JSONObject.NULL)
      .put("lastDate", cache.courses.maxOfOrNull { it.date } ?: JSONObject.NULL)
  }
}
