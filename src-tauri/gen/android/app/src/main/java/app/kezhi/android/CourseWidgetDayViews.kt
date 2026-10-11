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

data class WidgetDayPlan(val width: Float, val titleSp: Float, val fits: Boolean, val narrow: Boolean, val wide: Boolean, val style: WidgetAppearance = WidgetAppearance())

/** A continuous day, not three-course pages. Completed courses remain visible. */
object CourseWidgetDayViews {
  private fun time(item: TimedWidgetCourse, narrow: Boolean, wide: Boolean) = item.course.start + (if (narrow || wide) "\n" else "–") + item.course.end
  private fun room(item: TimedWidgetCourse, now: Long, wide: Boolean): String =
    item.course.location.ifBlank { "教室待定" } + when {
      item.startsAt <= now && item.endsAt > now -> if (wide) " · 上课中" else "\n上课中"
      item.endsAt <= now && wide -> " · 已结束"
      else -> ""
    }

  fun plan(context: Context, width: Float, height: Float, rows: List<TimedWidgetCourse>, now: Long, style: WidgetAppearance = WidgetAppearance()): WidgetDayPlan {
    val narrow = width < 112f
    val wide = width >= 240f
    val preferred = if (narrow) 11f else if (wide) 14f else 13f
    val density = context.resources.displayMetrics.density
    val scale = context.resources.configuration.fontScale * style.textScale
    val inner = (width - if (narrow) 12f else 34f).coerceAtLeast(16f)
    fun lines(text: String, sp: Float, available: Float, bold: Boolean = false): Float {
      val paint = TextPaint().apply { textSize = sp * scale * density; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT }
      return StaticLayout.Builder.obtain(text, 0, text.length, paint, (available * density).toInt().coerceAtLeast(1))
        .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setLineSpacing(density, 1f).build().height / density
    }
    fun fits(title: Float): Boolean {
      if (rows.size > 30) return false // Keep large imports off the resize/binder path.
      // Header/date/summary/footer + conservative text rounding and row spacing.
      val budget = height - 148f * scale.coerceAtLeast(1f)
      val total = rows.sumOf { item ->
        val time = lines(time(item, narrow, wide), if (narrow) 10f else 11f, if (wide) 50f else inner, true)
        val copyWidth = if (wide) inner - 58f else inner
        val displayTitle = (if(item.startsAt <= now && item.endsAt > now) "● " else "") + item.course.title
        val copy = lines(displayTitle, title, copyWidth, true) + 3f + lines(room(item, now, wide), 10f, copyWidth)
        (if (wide) maxOf(time, copy) + (if (style.compact) 12f else 18f) else time + 4f + copy + (if (style.compact) 12f else 18f)).toDouble()
      }
      return total <= budget
    }
    val title = listOf(preferred, preferred - 1f).firstOrNull { fits(it) } ?: preferred
    return WidgetDayPlan(width, title, fits(title), narrow, wide, style)
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
    val style = plan.style
    WidgetStyle.text(view, R.id.widget_day_row_time, if(plan.narrow) 10f else 11f, context, style, "accent")
    WidgetStyle.text(view, R.id.widget_day_row_title, plan.titleSp, context, style, if(item.endsAt <= now) "muted" else "text")
    WidgetStyle.text(view, R.id.widget_day_row_room, 10f, context, style, "muted")
    // Keep theme/opacity consistent with this instance, including collection rows.
    if (!ongoing || style.theme != "system" || style.opacity != 100) view.setInt(R.id.widget_day_row_card, "setBackgroundResource", WidgetStyle.background(context, style, true))
    if (ongoing) view.setTextViewText(R.id.widget_day_row_title, "● " + item.course.title)
    if (style.compact) {
      val d = context.resources.displayMetrics.density
      view.setViewPadding(R.id.widget_day_row_card, ((if(plan.narrow) 2 else 5)*d).toInt(), (2*d).toInt(), ((if(plan.narrow) 2 else 5)*d).toInt(), (2*d).toInt())
    }
    if (open != null) view.setOnClickPendingIntent(R.id.widget_day_row_root, if(item.course.id.isNotEmpty()) WidgetNavigation.pending(context, item.course) else open)
    else view.setOnClickFillInIntent(R.id.widget_day_row_root, WidgetNavigation.fillIn(item.course))
    return view
  }

  fun render(context: Context, agenda: WidgetAgenda, hasData: Boolean, now: Long, width: Float, height: Float,
    widgetId: Int, open: PendingIntent, refresh: PendingIntent, style: WidgetAppearance = WidgetAppearance(), dayOffset: Int = 0): RemoteViews {
    val plan = plan(context, width, height, agenda.today, now, style)
    val view = RemoteViews(context.packageName, R.layout.course_widget_day)
    val density = context.resources.displayMetrics.density
    val pad = ((if (plan.narrow) 4 else 12) * density).toInt()
    view.setViewPadding(android.R.id.background, pad, (14 * density).toInt(), pad, (12 * density).toInt())
    view.setOnClickPendingIntent(android.R.id.background, open)
    view.setOnClickPendingIntent(R.id.widget_day_refresh, refresh)
    view.setViewVisibility(R.id.widget_day_refresh, if (plan.narrow) View.GONE else View.VISIBLE)
    view.setTextViewTextSize(R.id.widget_day_heading, TypedValue.COMPLEX_UNIT_SP, if (plan.narrow) 12f else 16f)
    val dayLabel = if(dayOffset == 1) "明天" else "今天"
    view.setTextViewText(R.id.widget_day_heading, if (plan.wide) dayLabel + "的课表" else dayLabel)
    view.setTextViewText(R.id.widget_day_date, SimpleDateFormat(if (plan.narrow) "M/d" else "M月d日 E", Locale.CHINA).format(WidgetPreferences.displayTime(now, dayOffset)))
    val remaining = agenda.today.count { it.endsAt > now }
    view.setTextViewText(R.id.widget_day_summary, if (plan.narrow) "${agenda.today.size}堂" else "${agenda.today.size} 堂 · 剩 $remaining 堂")
    view.removeAllViews(R.id.widget_day_rows)
    val empty = agenda.today.isEmpty() || !hasData
    view.setViewVisibility(R.id.widget_day_empty, if (empty) View.VISIBLE else View.GONE)
    view.setTextViewText(R.id.widget_day_empty, if (!hasData) "打开课织\n同步课表" else dayLabel + "没有课\n好好休息")
    view.setViewVisibility(R.id.widget_day_rows, if (!empty && plan.fits) View.VISIBLE else View.GONE)
    view.setViewVisibility(R.id.widget_day_list, if (!empty && !plan.fits) View.VISIBLE else View.GONE)
    if (!empty && plan.fits) {
      agenda.today.forEach { view.addView(R.id.widget_day_rows, row(context, it, plan, now, open)) }
    } else if (!empty) {
      // No truncated day or tiny illegible text: an unpaged native list is the
      // fallback only when every complete course row cannot physically fit.
      val adapter = Intent(context, CourseWidgetDayService::class.java)
        .putExtra("width", width).putExtra("titleSp", plan.titleSp).putExtra("widgetId", widgetId)
        .setData(Uri.parse("kezhi-widget://day/$widgetId/$width/${plan.titleSp}/$dayOffset/${style.hashCode()}"))
      @Suppress("DEPRECATION")
      view.setRemoteAdapter(R.id.widget_day_list, adapter)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
      val template = PendingIntent.getActivity(context, 4300 + widgetId, Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), flags)
      view.setPendingIntentTemplate(R.id.widget_day_list, template)
    }
    val footer = when { !hasData -> "点击同步"; !empty && !plan.fits -> if (plan.narrow) "上下滑动" else "上下滑动 · 查看全天"; else -> if (plan.narrow) "全天" else "全天已展开" }
    view.setTextViewText(R.id.widget_day_footer, footer)
    view.setTextViewText(R.id.widget_day_toggle, if(dayOffset == 1) "‹ 今天" else "明天 ›")
    view.setOnClickPendingIntent(R.id.widget_day_toggle, CourseWidgetProvider.toggleIntent(context, widgetId))
    view.setOnClickPendingIntent(R.id.widget_day_heading, CourseWidgetConfigureActivity.pending(context, widgetId))
    view.setContentDescription(R.id.widget_day_heading, dayLabel + "课表，点击设置小组件外观")
    view.setInt(android.R.id.background, "setBackgroundResource", WidgetStyle.background(context, style))
    WidgetStyle.text(view, R.id.widget_day_heading, if(plan.narrow) 12f else 16f, context, style)
    WidgetStyle.text(view, R.id.widget_day_date, 10f, context, style, "muted")
    WidgetStyle.text(view, R.id.widget_day_summary, 11f, context, style, "accent")
    WidgetStyle.text(view, R.id.widget_day_empty, 12f, context, style, "muted")
    WidgetStyle.text(view, R.id.widget_day_footer, 9f, context, style, "muted")
    WidgetStyle.text(view, R.id.widget_day_toggle, 11f, context, style, "accent")
    WidgetStyle.text(view, R.id.widget_day_refresh, 22f, context, style, "accent")
    view.setContentDescription(android.R.id.background, if (!hasData) "打开课织同步课表" else "$dayLabel ${agenda.today.size} 堂课程，剩余 $remaining 堂。" + if (empty) "暂无后续课程" else "全天课表")
    return view
  }
}
