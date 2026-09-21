package app.kezhi.android

import org.junit.Assert.*
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class CourseWidgetEngineTest {
  private val zone = TimeZone.getTimeZone("Asia/Shanghai")
  private fun at(value: String, tz: TimeZone = zone) = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).apply { timeZone = tz }.parse(value)!!.time
  private fun course(day: String = "2026-09-21", start: String = "08:20", end: String = "09:55", title: String = "数学") = WidgetCourse(day, start, end, title, "A301")
  @Test fun beforeClassShowsTodayAndNextWithStartRefresh() {
    val agenda = CourseWidgetEngine.agenda(listOf(course()), at("2026-09-21 08:00"), zone)
    assertEquals(1, agenda.today.size)
    assertEquals("数学", agenda.next!!.course.title)
    assertEquals(at("2026-09-21 08:20") + 1000, agenda.refreshAt)
  }
  @Test fun ongoingCourseStaysInTodayButNextSkipsIt() {
    val agenda = CourseWidgetEngine.agenda(listOf(course(start="10:15", end="11:50",title="英语"), course()), at("2026-09-21 08:20"), zone)
    assertEquals(listOf("数学","英语"), agenda.today.map { it.course.title })
    assertEquals("英语", agenda.next!!.course.title)
    assertEquals(at("2026-09-21 09:55") + 1000, agenda.refreshAt)
  }
  @Test fun atEndMovesToNextAndKeepsHistory() {
    val agenda = CourseWidgetEngine.agenda(listOf(course(), course("2026-09-22",title="物理")), at("2026-09-21 09:55"), zone)
    assertEquals(1, agenda.today.size)
    assertEquals("物理", agenda.next!!.course.title)
    assertEquals(at("2026-09-22 00:00") + 1000, agenda.refreshAt)
  }
  @Test fun midnightAndEmptyDaysRefreshWithoutWebView() {
    val agenda = CourseWidgetEngine.agenda(listOf(course("2026-09-22")), at("2026-09-22 00:00"), zone)
    assertEquals(1, agenda.today.size)
    assertEquals(at("2026-09-22 08:20") + 1000, agenda.refreshAt)
    val empty = CourseWidgetEngine.agenda(emptyList(), at("2026-09-21 23:59"), zone)
    assertTrue(empty.today.isEmpty()); assertNull(empty.next)
    assertEquals(at("2026-09-22 00:00") + 1000, empty.refreshAt)
  }
  @Test fun invalidAndCancelledProjectionCannotCreateEvents() {
    val agenda = CourseWidgetEngine.agenda(listOf(course(end="08:00"), course("invalid")), at("2026-09-21 08:00"), zone)
    assertTrue(agenda.today.isEmpty()); assertNull(agenda.next)
  }
  @Test fun daylightSavingUsesLocalMidnightNotFixed24Hours() {
    val tz = TimeZone.getTimeZone("America/New_York")
    val agenda = CourseWidgetEngine.agenda(emptyList(), at("2026-03-08 00:00", tz), tz)
    assertEquals(at("2026-03-09 00:00",tz) + 1000, agenda.refreshAt)
    assertEquals(23 * 3600000L + 1000, agenda.refreshAt-at("2026-03-08 00:00",tz))
  }
}
