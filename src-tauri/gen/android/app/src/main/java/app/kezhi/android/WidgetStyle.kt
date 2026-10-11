package app.kezhi.android

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.util.TypedValue
import android.widget.RemoteViews

object WidgetStyle {
  fun dark(context: Context, style: WidgetAppearance) = style.theme == "dark" ||
    style.theme == "system" && context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
  fun color(context: Context, style: WidgetAppearance, kind: String): Int {
    if (style.theme == "system") return context.getColor(when(kind) { "accent" -> R.color.widget_accent; "muted" -> R.color.widget_muted; else -> R.color.widget_text })
    return Color.parseColor(if (dark(context, style)) when(kind) { "accent" -> "#B3CAFF"; "muted" -> "#BCC4DA"; else -> "#F1F3FF" }
      else when(kind) { "accent" -> "#3156B8"; "muted" -> "#596177"; else -> "#202638" })
  }
  fun background(context: Context, style: WidgetAppearance, row: Boolean = false): Int {
    if (style.theme == "system" && style.opacity == 100) return if (row) R.drawable.widget_day_idle else R.drawable.widget_background
    val index = when(style.opacity) { 50 -> 0; 75 -> 1; else -> 2 }
    return (if (dark(context, style)) {
      if(row) intArrayOf(R.drawable.widget_style_dark_50_row, R.drawable.widget_style_dark_75_row, R.drawable.widget_style_dark_100_row) else intArrayOf(R.drawable.widget_style_dark_50_root, R.drawable.widget_style_dark_75_root, R.drawable.widget_style_dark_100_root)
    } else {
      if(row) intArrayOf(R.drawable.widget_style_light_50_row, R.drawable.widget_style_light_75_row, R.drawable.widget_style_light_100_row) else intArrayOf(R.drawable.widget_style_light_50_root, R.drawable.widget_style_light_75_root, R.drawable.widget_style_light_100_root)
    })[index]
  }
  fun text(view: RemoteViews, id: Int, sp: Float, context: Context, style: WidgetAppearance, kind: String = "text") {
    view.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * style.textScale)
    view.setTextColor(id, color(context, style, kind))
  }
  fun apply(context: Context, view: RemoteViews, form: WidgetForm, style: WidgetAppearance) {
    view.setInt(android.R.id.background, "setBackgroundResource", background(context, style))
    text(view, R.id.widget_status, 11f, context, style, "accent")
    text(view, R.id.widget_time, when(form) { WidgetForm.TILE -> 15f; WidgetForm.COMPACT -> 30f; WidgetForm.STRIP -> 23f; else -> 26f }, context, style, "accent")
    if (form == WidgetForm.TILE) return
    text(view, R.id.widget_next_title, if(form == WidgetForm.COMPACT) 16f else 17f, context, style)
    text(view, R.id.widget_next_meta, if(form == WidgetForm.COMPACT) 11f else 12f, context, style, "muted")
    if (form != WidgetForm.CARD) return
    text(view, R.id.widget_brand, 15f, context, style)
    text(view, R.id.widget_date, 11f, context, style, "muted")
    text(view, R.id.widget_refresh, 24f, context, style, "accent")
    text(view, R.id.widget_today_title, 12f, context, style)
    text(view, R.id.widget_footer, 10f, context, style, "muted")
    view.setInt(R.id.widget_feature_box, "setBackgroundResource", background(context, style, true))
  }
}
