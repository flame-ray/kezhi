package app.kezhi.android

import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Locale

/** Pre-render the native variants so Android 12+ can resize without waking the app. */
object CourseWidgetViews {
  fun motionEnabled(context: Context): Boolean = try {
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f &&
      Settings.Global.getFloat(context.contentResolver, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f) > 0f
  } catch (_: Exception) { true }

  fun layoutId(form: WidgetForm, motion: Boolean): Int = when (form) {
    WidgetForm.TILE -> R.layout.course_widget_tile
    WidgetForm.COMPACT -> R.layout.course_widget_compact
    WidgetForm.STRIP -> R.layout.course_widget_strip
    else -> if (motion) R.layout.course_widget_panel else R.layout.course_widget_panel_static
  }

  fun responsive(context: Context, portrait: Pair<Float, Float>, landscape: Pair<Float, Float>, create: (WidgetForm) -> RemoteViews): RemoteViews {
    val scale = context.resources.configuration.fontScale.coerceIn(1f, 2f)
    if (Build.VERSION.SDK_INT >= 31) {
      val variants = WidgetForm.values().associate { form ->
        val factor = if (form == WidgetForm.TILE) 1f else scale
        SizeF(form.width * factor, form.height * factor) to create(form)
      }
      return RemoteViews(variants)
    }
    return RemoteViews(create(CourseWidgetLayout.choose(landscape.first, landscape.second, scale)),
      create(CourseWidgetLayout.choose(portrait.first, portrait.second, scale)))
  }

  fun render(context: Context, form: WidgetForm, agenda: WidgetAgenda, hasData: Boolean, now: Long,
    rows: List<TimedWidgetCourse>, page: Int, open: PendingIntent, refresh: PendingIntent,
    previous: PendingIntent, next: PendingIntent): RemoteViews {
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
    val expanded = form == WidgetForm.AGENDA && rows.isNotEmpty()
    views.setViewVisibility(R.id.widget_pages, if (expanded) View.VISIBLE else View.GONE)
    val pages = CourseWidgetLayout.pageCount(rows.size)
    views.setViewVisibility(R.id.widget_pager, if (expanded && pages > 1) View.VISIBLE else View.GONE)
    if (expanded) {
      views.removeAllViews(R.id.widget_pages)
      for (group in rows.chunked(3)) {
        val sheet = RemoteViews(context.packageName, R.layout.course_widget_page)
        for (item in group) {
          val row = RemoteViews(context.packageName, R.layout.course_widget_row)
          val label = when { item.startsAt <= now && item.endsAt > now -> "上课中"; item.endsAt <= now -> "已结束"; else -> "至 ${item.course.end}" }
          row.setTextViewText(R.id.widget_row_time, item.course.start)
          row.setTextViewText(R.id.widget_row_title, item.course.title)
          row.setTextViewText(R.id.widget_row_meta, item.course.location.ifBlank { "教室待定" } + " · " + label)
          row.setOnClickPendingIntent(R.id.widget_row_title, open)
          sheet.addView(R.id.widget_page_rows, row)
        }
        views.addView(R.id.widget_pages, sheet)
      }
      views.setDisplayedChild(R.id.widget_pages, page)
      views.setTextViewText(R.id.widget_page_number, "${page + 1} / $pages")
      views.setOnClickPendingIntent(R.id.widget_previous, previous)
      views.setOnClickPendingIntent(R.id.widget_next, next)
    }
    val footer = when {
      !hasData -> "点击导入你的课表"
      agenda.today.isEmpty() -> "今天没有课程"
      agenda.today.size > rows.size -> "展示前 ${rows.size} 堂 · 打开查看全部"
      form == WidgetForm.CARD -> "拉高展开今日课程"
      else -> "点击查看课表"
    }
    views.setTextViewText(R.id.widget_footer, footer + " · " + SimpleDateFormat("HH:mm", Locale.ROOT).format(now) + " 更新")
    return views
  }

  fun pageUpdate(context: Context, form: WidgetForm, page: Int, pages: Int): RemoteViews {
    val views = RemoteViews(context.packageName, layoutId(form, motionEnabled(context)))
    if (form == WidgetForm.AGENDA) {
      views.setDisplayedChild(R.id.widget_pages, page)
      views.setTextViewText(R.id.widget_page_number, "${page + 1} / $pages")
    }
    return views
  }
}
