package app.kezhi.android

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

data class WidgetAppearance(val theme: String = "system", val opacity: Int = 100, val font: Int = 100, val compact: Boolean = false) {
  fun normalized() = copy(theme = theme.takeIf { it in listOf("system", "light", "dark") } ?: "system",
    opacity = opacity.takeIf { it in listOf(50, 75, 100) } ?: 100, font = font.takeIf { it in listOf(90, 100, 115) } ?: 100)
  val textScale: Float get() = normalized().font / 100f
  fun json() = JSONObject().put("theme", theme).put("opacity", opacity).put("font", font).put("compact", compact)
}

object WidgetPreferences {
  private fun prefs(context: Context) = context.getSharedPreferences("kezhi_widget_settings", Context.MODE_PRIVATE)
  fun load(context: Context, id: Int): WidgetAppearance = try {
    val json = JSONObject(prefs(context).getString("style_$id", "{}")!!)
    WidgetAppearance(json.optString("theme", "system"), json.optInt("opacity", 100), json.optInt("font", 100), json.optBoolean("compact", false)).normalized()
  } catch (_: Exception) { WidgetAppearance() }
  fun save(context: Context, id: Int, style: WidgetAppearance) {
    require(id > 0)
    check(prefs(context).edit().putString("style_$id", style.normalized().json().toString()).commit())
  }
  private fun date(now: Long) = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(now)
  fun day(context: Context, id: Int, now: Long): Int = if (prefs(context).getString("day_date_$id", null) == date(now)) prefs(context).getInt("day_$id", 0).coerceIn(0, 1) else 0
  fun toggleDay(context: Context, id: Int, now: Long) {
    prefs(context).edit().putString("day_date_$id", date(now)).putInt("day_$id", 1 - day(context, id, now)).commit()
  }
  fun remove(context: Context, id: Int) { prefs(context).edit().remove("style_$id").remove("day_$id").remove("day_date_$id").apply() }
  fun displayTime(now: Long, offset: Int): Long = if (offset == 0) now else Calendar.getInstance().apply {
    timeInMillis = now; add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
  }.timeInMillis
}
