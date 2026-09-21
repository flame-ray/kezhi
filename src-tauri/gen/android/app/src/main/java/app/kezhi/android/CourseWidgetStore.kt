package app.kezhi.android

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale

object CourseWidgetStore {
  private const val PREFS = "kezhi_course_widget"
  fun decode(content: String): List<WidgetCourse> {
    require(content.toByteArray(Charsets.UTF_8).size <= 4 * 1024 * 1024) { "小组件数据过大" }
    val json = JSONObject(content)
    require(json.getInt("version") == 1)
    val rows = json.getJSONArray("events")
    require(rows.length() <= 10000)
    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { isLenient = false }
    val clock = Regex("([01]\\d|2[0-3]):[0-5]\\d")
    return (0 until rows.length()).map { index ->
      val row = rows.getJSONObject(index)
      val date = row.getString("date")
      require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(date) && dateFormat.format(dateFormat.parse(date)!!) == date)
      val start = row.getString("start"); val end = row.getString("end")
      require(clock.matches(start) && clock.matches(end) && end > start)
      val title = row.getString("title"); val location = row.getString("location")
      require(title.length <= 120 && location.length <= 120)
      WidgetCourse(date, start, end, title, location)
    }
  }
  @Synchronized fun save(context: Context, content: String) {
    decode(content) // Reject invalid data without replacing the previous cache.
    require(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("snapshot", content).commit()) { "小组件本地保存失败" }
  }
  fun load(context: Context): List<WidgetCourse>? = try {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", null)?.let { decode(it) }
  } catch (_: Exception) { null }
}
