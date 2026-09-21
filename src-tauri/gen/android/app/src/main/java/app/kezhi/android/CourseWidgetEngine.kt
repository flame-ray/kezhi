package app.kezhi.android

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

data class WidgetCourse(val date: String, val start: String, val end: String, val title: String, val location: String)
data class TimedWidgetCourse(val course: WidgetCourse, val startsAt: Long, val endsAt: Long)
data class WidgetAgenda(val today: List<TimedWidgetCourse>, val next: TimedWidgetCourse?, val refreshAt: Long)

/** Pure local-calendar calculation; works without an Activity, WebView or network. */
object CourseWidgetEngine {
  fun agenda(courses: List<WidgetCourse>, now: Long, zone: TimeZone = TimeZone.getDefault()): WidgetAgenda {
    val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = zone }
    val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).apply { timeZone = zone; isLenient = false }
    val day = dayFormat.format(now)
    val timed = courses.mapNotNull { course ->
      try {
        val start = timeFormat.parse(course.date + " " + course.start)!!.time
        val end = timeFormat.parse(course.date + " " + course.end)!!.time
        if (end <= start) null else TimedWidgetCourse(course, start, end)
      } catch (_: Exception) { null }
    }.sortedWith(compareBy<TimedWidgetCourse> { it.startsAt }.thenBy { it.course.title })
    val tomorrow = Calendar.getInstance(zone).apply {
      timeInMillis = now; add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val boundary = timed.flatMap { listOf(it.startsAt, it.endsAt) }.filter { it > now }.minOrNull()
    return WidgetAgenda(timed.filter { it.course.date == day }, timed.firstOrNull { it.startsAt > now },
      minOf(boundary ?: tomorrow, tomorrow) + 1000)
  }
}
