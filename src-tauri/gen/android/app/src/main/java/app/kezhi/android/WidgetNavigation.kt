package app.kezhi.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.util.UUID

object WidgetNavigation {
  fun intent(context: Context, course: WidgetCourse): Intent = Intent(context, MainActivity::class.java)
    .setData(Uri.Builder().scheme("kezhi-widget").authority("course").appendQueryParameter("id", course.id).appendQueryParameter("date", course.date).build())
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  fun pending(context: Context, course: WidgetCourse): PendingIntent = PendingIntent.getActivity(context, 0, intent(context, course), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  fun fillIn(course: WidgetCourse) = Intent().putExtra("widgetCourseId", course.id).putExtra("widgetCourseDate", course.date)
  private fun prefs(context: Context) = context.getSharedPreferences("kezhi_widget_navigation", Context.MODE_PRIVATE)
  @Synchronized fun capture(context: Context, intent: Intent): Boolean {
    val uri = intent.data
    val id = if (uri?.scheme == "kezhi-widget" && uri.host == "course") uri.getQueryParameter("id") else intent.getStringExtra("widgetCourseId")
    val date = if (uri?.scheme == "kezhi-widget" && uri.host == "course") uri.getQueryParameter("date") else intent.getStringExtra("widgetCourseDate")
    if (id.isNullOrBlank() || id.length > 512 || date == null || !Regex("\\d{4}-\\d{2}-\\d{2}").matches(date)) return false
    // Navigation can only select an existing local occurrence, never execute URLs.
    if (CourseWidgetStore.load(context)?.none { it.id == id && it.date == date } != false) return false
    val payload = JSONObject().put("id", id).put("date", date).put("token", UUID.randomUUID().toString()).put("created", System.currentTimeMillis())
    return prefs(context).edit().putString("pending", payload.toString()).commit()
  }
  @Synchronized fun read(context: Context): JSONObject? = try {
    val value = prefs(context).getString("pending", null)?.let { JSONObject(it) }
    value?.takeIf { System.currentTimeMillis() - it.getLong("created") in 0..600000 }
  } catch (_: Exception) { null }
  @Synchronized fun acknowledge(context: Context, token: String) {
    if (read(context)?.optString("token") == token) prefs(context).edit().remove("pending").commit()
  }
}
