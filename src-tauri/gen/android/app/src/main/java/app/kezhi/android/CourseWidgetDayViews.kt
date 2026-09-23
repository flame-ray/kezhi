package app.kezhi.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Locale

data class WidgetDayPlan(val width: Float, val titleSp: Float, val fits: Boolean, val narrow: Boolean, val wide: Boolean)

/** A continuous day, not three-course pages. Completed courses remain visible. */
object CourseWidgetDayViews {
  private fun time(item: TimedWidgetCourse, narrow: Boolean, wide: Boolean) = item.course.start + (if (narrow || wide) "\n" else "–") + item.course.end
  private fun room(item: TimedWidgetCourse, now: Long, wide: Boolean): String =
    item.course.location.ifBlank { "教室待定" } + when {
      item.startsAt <= now && item.endsAt > now -> if (wide) " · 上课中" else "\n上课中"
      item.endsAt <= now && wide -> " · 已结束"
      else -> ""
    }

  fun plan(context: Context, width: Float, height: Float, rows: List<TimedWidgetCourse>, now: Long): WidgetDayPlan {
    val narrow = width < 112f
    val wide = width >= 240f
    val preferred = if (narrow) 11f else if (wide) 14f else 13f
    val density = context.resources.displayMetrics.density
    val scale = context.resources.configuration.fontScale
    val inner = (width - if (narrow) 12f else 34f).coerceAtLeast(16f)
    fun lines(text: String, sp: Float, available: Float, bold: Boolean = false): Float {
      val paint = TextPaint().apply { textSize = sp * scale * density; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT }
      return StaticLayout.Builder.obtain(text, 0, text.length, paint, (available * density).toInt().coerceAtLeast(1))
        .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setLineSpacing(density, 1f).build().height / density
    }
    fun fits(title: Float): Boolean {
      if (rows.size > 30) return false // Keep large imports off the resize/binder path.
      // Header/date/summary/footer + conservative text rounding and row spacing.
      val budget = height - 110f * scale.coerceAtLeast(1f)
      val total = rows.sumOf { item ->
        val time = lines(time(item, narrow, wide), if (narrow) 10f else 11f, if (wide) 50f else inner, true)
        val copyWidth = if (wide) inner - 58f else inner
        val copy = lines(item.course.title, title, copyWidth, true) + 3f + lines(room(item, now, wide), 10f, copyWidth)
        (if (wide) maxOf(time, copy) + 18f else time + 4f + copy + 18f).toDouble()
      }
      return total <= budget
    }
    val title = listOf(preferred, preferred - 1f).firstOrNull { fits(it) } ?: preferred
    return WidgetDayPlan(width, title, fits(title), narrow, wide)
  }

  fun row(context: Context, item: TimedWidgetCourse, plan: WidgetDayPlan, now: Long, open: PendingIntent? = null): RemoteViews {
    val view = RemoteViews(context.packageName, if (plan.wide) R.layout.course_widget_day_row_wide else R.layout.course_widget_day_row)
    if (plan.narrow) {
      val horizontal = (2 * context.resources.displayMetrics.density).toInt()
      val vertical = (5 * context.resources.displayMetrics.density).toInt()
      view.setViewPadding(R.id.widget_day_row_card, horizontal, vertical, horizontal, vertical)
    }
    view.setTextViewText(R.id.widget_day_row_time, time(item, plan.narrow, plan.wide))
    view.setTextViewTextSize(R.id.widget_day_row_time, TypedValue.COMPLEX_UNIT_SP, if (plan.narrow) 10f else 11f)
    view.setTextViewText(R.id.widget_day_row_title, item.course.title)
    view.setTextViewTextSize(R.id.widget_day_row_title, TypedValue.COMPLEX_UNIT_SP, plan.titleSp)
    view.setTextViewText(R.id.widget_day_row_room, room(item, now, plan.wide))
    val ongoing = item.startsAt <= now && item.endsAt > now
    view.setInt(R.id.widget_day_row_card, "setBackgroundResource", if (ongoing) R.drawable.widget_day_active else R.drawable.widget_day_idle)
    view.setTextColor(R.id.widget_day_row_title, context.getColor(if (item.endsAt <= now) R.color.widget_muted else R.color.widget_text))
    view.setContentDescription(R.id.widget_day_row_root, "${item.course.start} 至 ${item.course.end}，${item.course.title}，${item.course.location}" + if (ongoing) "，上课中" else "")
    if (open != null) view.setOnClickPendingIntent(R.id.widget_day_row_root, open)
    else view.setOnClickFillInIntent(R.id.widget_day_row_root, Intent())
    return view
  }

  fun render(context: Context, agenda: WidgetAgenda, hasData: Boolean, now: Long, width: Float, height: Float,
    widgetId: Int, open: PendingIntent, refresh: PendingIntent): RemoteViews {
    val plan = plan(context, width, height, agenda.today, now)
    val view = RemoteViews(context.packageName, R.layout.course_widget_day)
    val density = context.resources.displayMetrics.density
    val pad = ((if (plan.narrow) 4 else 12) * density).toInt()
    view.setViewPadding(android.R.id.background, pad, (14 * density).toInt(), pad, (12 * density).toInt())
    view.setOnClickPendingIntent(android.R.id.background, open)
    view.setOnClickPendingIntent(R.id.widget_day_refresh, refresh)
    view.setViewVisibility(R.id.widget_day_refresh, if (plan.narrow) View.GONE else View.VISIBLE)
    view.setTextViewTextSize(R.id.widget_day_heading, TypedValue.COMPLEX_UNIT_SP, if (plan.narrow) 12f else 16f)
    view.setTextViewText(R.id.widget_day_heading, if (plan.wide) "今天的课表" else "今天")
    view.setTextViewText(R.id.widget_day_date, SimpleDateFormat(if (plan.narrow) "M/d" else "M月d日 E", Locale.CHINA).format(now))
    val remaining = agenda.today.count { it.endsAt > now }
    view.setTextViewText(R.id.widget_day_summary, if (plan.narrow) "${agenda.today.size}堂" else "${agenda.today.size} 堂 · 剩 $remaining 堂")
    view.removeAllViews(R.id.widget_day_rows)
    val empty = agenda.today.isEmpty() || !hasData
    view.setViewVisibility(R.id.widget_day_empty, if (empty) View.VISIBLE else View.GONE)
    view.setTextViewText(R.id.widget_day_empty, if (!hasData) "打开课织\n同步课表" else "今天没有课\n好好休息")
    view.setViewVisibility(R.id.widget_day_rows, if (!empty && plan.fits) View.VISIBLE else View.GONE)
    view.setViewVisibility(R.id.widget_day_list, if (!empty && !plan.fits) View.VISIBLE else View.GONE)
    if (!empty && plan.fits) {
      agenda.today.forEach { view.addView(R.id.widget_day_rows, row(context, it, plan, now, open)) }
    } else if (!empty) {
      // No truncated day or tiny illegible text: an unpaged native list is the
      // fallback only when every complete course row cannot physically fit.
      val adapter = Intent(context, CourseWidgetDayService::class.java)
        .putExtra("width", width).putExtra("titleSp", plan.titleSp)
        .setData(Uri.parse("kezhi-widget://day/$widgetId/$width/${plan.titleSp}"))
      @Suppress("DEPRECATION")
      view.setRemoteAdapter(R.id.widget_day_list, adapter)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
      val template = PendingIntent.getActivity(context, 4300 + widgetId, Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), flags)
      view.setPendingIntentTemplate(R.id.widget_day_list, template)
    }
    val footer = when { !hasData -> "点击同步"; !empty && !plan.fits -> if (plan.narrow) "上下滑动" else "上下滑动 · 查看全天"; else -> if (plan.narrow) "全天" else "全天已展开" }
    view.setTextViewText(R.id.widget_day_footer, footer)
    view.setContentDescription(android.R.id.background, if (!hasData) "打开课织同步课表" else "今天 ${agenda.today.size} 堂课程，剩余 $remaining 堂。" + if (empty) "暂无后续课程" else "全天课表")
    return view
  }
}
