package app.kezhi.android

import android.app.PendingIntent
import android.content.Context
import android.provider.Settings
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Locale

/** Resolve the current size ourselves, including hosts that don't apply sized RemoteViews. */
object CourseWidgetViews {
  fun motionEnabled(context: Context): Boolean = try {
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f &&
      Settings.Global.getFloat(context.contentResolver, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f) > 0f
  } catch (_: Exception) { true }

  fun layoutId(form: WidgetForm, motion: Boolean): Int = when (form) {
    WidgetForm.TILE -> R.layout.course_widget_tile
    WidgetForm.COMPACT -> R.layout.course_widget_compact
    WidgetForm.STRIP -> R.layout.course_widget_strip
    WidgetForm.DAY_NARROW, WidgetForm.DAY_MEDIUM, WidgetForm.AGENDA -> R.layout.course_widget_day
    else -> if (motion) R.layout.course_widget_panel else R.layout.course_widget_panel_static
  }

  fun responsive(context: Context, portrait: Pair<Float, Float>, landscape: Pair<Float, Float>, create: (WidgetForm, Float, Float) -> RemoteViews): RemoteViews {
    val scale = context.resources.configuration.fontScale.coerceIn(1f, 2f)
    // Always send resolved orientation layouts, not the old five-breakpoint map.
    // Some launchers stretch its smallest child without reselecting the template.
    return RemoteViews(create(CourseWidgetLayout.choose(landscape.first, landscape.second, scale), landscape.first, landscape.second),
      create(CourseWidgetLayout.choose(portrait.first, portrait.second, scale), portrait.first, portrait.second))
  }

  fun render(context: Context, form: WidgetForm, agenda: WidgetAgenda, hasData: Boolean, now: Long,
    open: PendingIntent, refresh: PendingIntent, width: Float = form.width, height: Float = form.height, widgetId: Int = 0): RemoteViews {
    if (form.isDay) return CourseWidgetDayViews.render(context, agenda, hasData, now, width, height, widgetId, open, refresh)
    val views = RemoteViews(context.packageName, layoutId(form, motionEnabled(context)))
    val day = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(now)
    val ongoing = agenda.today.firstOrNull { it.startsAt <= now && it.endsAt > now }
    val hero = ongoing ?: agenda.next
    val state = if (ongoing != null) "上课中" else "下一节"
    val whenLabel = when { hero == null -> ""; hero.course.date == day -> "今天"; else -> hero.course.date.substring(5).replace("-", "/") }
    val title = when { !hasData -> "打开课织同步"; hero == null -> "暂无后续课程"; else -> hero.course.title }
    val room = hero?.course?.location?.ifBlank { "教室待定" } ?: ""
    val time = when { !hasData -> "课织"; hero == null -> "休息"; else -> hero.course.start }
    val meta = when { !hasData -> "打开应用导入课表"; hero == null -> "享受你的空闲时间"; else -> "$room · 至 ${hero.course.end}" }
    val status = when {
      !hasData -> "待同步"; hero == null -> "今天"; form == WidgetForm.TILE -> if (whenLabel == "今天") state else whenLabel
      else -> "$state · $whenLabel"
    }
    views.setOnClickPendingIntent(android.R.id.background, open)
    views.setContentDescription(android.R.id.background, "$status，$title，$time，$meta。点击打开课织")
    views.setTextViewText(R.id.widget_status, status)
    views.setTextViewText(R.id.widget_time, time)
    if (form == WidgetForm.TILE) {
      // At one-cell size, accessibility labels retain all details even when the
      // visual status line must yield its space to large-font time text.
      if (context.resources.configuration.fontScale > 1.3f) views.setViewVisibility(R.id.widget_status, View.GONE)
      return views
    }
    views.setTextViewText(R.id.widget_next_title, title)
    views.setTextViewText(R.id.widget_next_meta, if (form == WidgetForm.COMPACT && hero != null) room else meta)
    if (form == WidgetForm.COMPACT || form == WidgetForm.STRIP) return views
    views.setOnClickPendingIntent(R.id.widget_refresh, refresh)
    views.setTextViewText(R.id.widget_date, SimpleDateFormat("M月d日 E", Locale.CHINA).format(now))
    val left = agenda.today.count { it.endsAt > now }
    views.setTextViewText(R.id.widget_today_title, when {
      !hasData -> "今天的安排"; agenda.today.isEmpty() -> "今天没有课程"
      left > 0 -> "今天 ${agenda.today.size} 堂 · 还剩 $left 堂"
      else -> "今天 ${agenda.today.size} 堂 · 已全部结束"
    })
    val footer = when {
      !hasData -> "点击导入你的课表"
      agenda.today.isEmpty() -> "今天没有课程"
      form == WidgetForm.CARD -> "拉高展开今日课程"
      else -> "点击查看课表"
    }
    views.setTextViewText(R.id.widget_footer, footer + " · " + SimpleDateFormat("HH:mm", Locale.ROOT).format(now) + " 更新")
    return views
  }

}
