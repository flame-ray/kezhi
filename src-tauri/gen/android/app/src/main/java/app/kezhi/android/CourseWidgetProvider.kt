package app.kezhi.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors

class CourseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = refreshAsync(context)
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = refreshAsync(context)
  override fun onDisabled(context: Context) { alarm(context).cancel(refreshIntent(context)) }
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in listOf(ACTION_REFRESH, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_DATE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED)) refreshAsync(context)
    else super.onReceive(context, intent)
  }
  private fun refreshAsync(context: Context) {
    val pending = goAsync()
    worker.execute { try { refresh(context.applicationContext) } catch (_: Exception) { android.util.Log.w("KezhiWidget", "Widget update failed; next system refresh will retry") } finally { pending.finish() } }
  }
  companion object {
    const val ACTION_REFRESH = "app.kezhi.android.WIDGET_REFRESH"
    private val worker = Executors.newSingleThreadExecutor()
    private fun alarm(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private fun refreshIntent(context: Context) = PendingIntent.getBroadcast(context, 4201,
      Intent(context, CourseWidgetProvider::class.java).setAction(ACTION_REFRESH),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    @Synchronized fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, CourseWidgetProvider::class.java))
      if (ids.isEmpty()) { alarm(context).cancel(refreshIntent(context)); return }
      val courses = CourseWidgetStore.load(context)
      val now = System.currentTimeMillis()
      val agenda = CourseWidgetEngine.agenda(courses ?: emptyList(), now)
      val openApp = PendingIntent.getActivity(context, 4202, Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val dayKey = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(now)
      val rows = if (agenda.today.any { it.endsAt > now }) agenda.today.filter { it.endsAt > now } else agenda.today.takeLast(3)
      for (id in ids) {
        val views = RemoteViews(context.packageName, R.layout.course_widget)
        views.setOnClickPendingIntent(R.id.widget_root, openApp)
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(context))
        views.setTextViewText(R.id.widget_date, SimpleDateFormat("M月d日 E", Locale.CHINA).format(now))
        views.setTextViewText(R.id.widget_today_title, "今天 · ${agenda.today.size} 堂课")
        val next = agenda.next
        views.setTextViewText(R.id.widget_next_title, when { courses == null -> "打开课织，同步课程"; next == null -> "暂无后续课程"; else -> next.course.title })
        views.setTextViewText(R.id.widget_next_meta, when {
          courses == null -> "首次使用请打开应用导入课表"
          next == null -> if (agenda.today.any { it.endsAt > now }) "今天还有正在进行的课程" else "享受你的空闲时间"
          else -> (if (next.course.date == dayKey) "今天" else next.course.date.substring(5).replace("-", "/")) +
            " ${next.course.start}–${next.course.end} · ${next.course.location.ifBlank { "教室待定" }}"
        })
        val idsForRows = listOf(R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3)
        val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 300)
        // Leave room for the header and footer even at the minimum resize height.
        // Respect accessibility font scaling by reducing the number of rows.
        val usableHeight = height / context.resources.configuration.fontScale.coerceAtLeast(1f)
        val limit = when { usableHeight < 290 -> 1; usableHeight < 340 -> 2; else -> 3 }
        views.setInt(R.id.widget_next_meta, "setMaxLines", if (usableHeight < 290) 1 else 2)
        for ((index, viewId) in idsForRows.withIndex()) {
          val item = rows.getOrNull(index)
          views.setViewVisibility(viewId, if (item != null && index < limit) View.VISIBLE else View.GONE)
          if (item != null) {
            val state = if (item.startsAt <= now && item.endsAt > now) "上课中 · " else if (item.endsAt <= now) "已结束 · " else ""
            views.setTextViewText(viewId, "${item.course.start}  ${state}${item.course.title}\n${item.course.location.ifBlank { "教室待定" }} · 至 ${item.course.end}")
          }
        }
        views.setTextViewText(R.id.widget_footer, when {
          courses == null -> "点击打开课织"
          agenda.today.isEmpty() -> "今天没有课程"
          rows.size > limit -> "另有 ${rows.size-limit} 堂课 · 点击查看全部"
          agenda.today.all { it.endsAt <= now } -> "今天课程已结束"
          else -> "点击查看课表"
        } + " · " + SimpleDateFormat("HH:mm", Locale.ROOT).format(now) + " 更新")
        manager.updateAppWidget(id, views)
      }
      // Non-wakeup/inexact: no exact-alarm permission or permanent background service.
      // The system may defer this under power restrictions; refresh is always available.
      alarm(context).set(AlarmManager.RTC, agenda.refreshAt, refreshIntent(context))
    }
  }
}
