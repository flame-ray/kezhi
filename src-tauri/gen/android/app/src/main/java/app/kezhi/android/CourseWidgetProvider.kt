package app.kezhi.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import java.util.concurrent.Executors

class CourseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = dispatch(context) { refresh(it) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = dispatch(context) { refresh(it, id) }
  override fun onDisabled(context: Context) { alarm(context).cancel(refreshIntent(context)) }
  override fun onDeleted(context: Context, ids: IntArray) {
    val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    ids.forEach { edit.remove("signature_$it").remove("page_$it").remove("motion_$it") }; edit.apply()
  }
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_PAGE -> dispatch(context) { changePage(it, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1), intent.getIntExtra("direction", 1)) }
      ACTION_REFRESH, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_DATE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED -> dispatch(context) { refresh(it) }
      else -> super.onReceive(context, intent)
    }
  }
  private fun dispatch(context: Context, action: (Context) -> Unit) {
    val pending = goAsync()
    worker.execute { try { action(context.applicationContext) } catch (_: Exception) {
      android.util.Log.w("KezhiWidget", "Widget update failed; next system refresh will retry")
    } finally { pending.finish() } }
  }
  companion object {
    const val ACTION_REFRESH = "app.kezhi.android.WIDGET_REFRESH"
    const val ACTION_PAGE = "app.kezhi.android.WIDGET_PAGE"
    private const val PREFS = "kezhi_widget_presentation"
    private val worker = Executors.newSingleThreadExecutor()
    private fun alarm(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private fun refreshIntent(context: Context) = PendingIntent.getBroadcast(context, 4201,
      Intent(context, CourseWidgetProvider::class.java).setAction(ACTION_REFRESH),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun pageIntent(context: Context, id: Int, direction: Int) = PendingIntent.getBroadcast(context, 0,
      Intent(context, CourseWidgetProvider::class.java).setAction(ACTION_PAGE).setData(Uri.parse("kezhi-widget://page/$id/$direction"))
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("direction", direction),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun sizes(options: Bundle): Pair<Pair<Float, Float>, Pair<Float, Float>> {
      val minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 240).coerceAtLeast(48).toFloat()
      val maxW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minW.toInt()).coerceAtLeast(48).toFloat()
      val minH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220).coerceAtLeast(48).toFloat()
      val maxH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minH.toInt()).coerceAtLeast(48).toFloat()
      return Pair(Pair(minW, maxH), Pair(maxW, minH))
    }
    private fun signature(rows: List<TimedWidgetCourse>) = rows.joinToString("|") { "${it.startsAt}:${it.endsAt}:${it.course.title}:${it.course.location}" }
    @Synchronized fun refresh(context: Context, onlyId: Int? = null) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, CourseWidgetProvider::class.java))
      if (ids.isEmpty()) { alarm(context).cancel(refreshIntent(context)); return }
      val courses = CourseWidgetStore.load(context)
      val now = System.currentTimeMillis()
      val agenda = CourseWidgetEngine.agenda(courses ?: emptyList(), now)
      val rows = agenda.today.take(30) // Bound binder payload even with a huge or malformed import.
      val signature = signature(rows)
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val open = PendingIntent.getActivity(context, 4202, Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      for (id in ids.filter { onlyId == null || it == onlyId }) {
        val page = if (prefs.getString("signature_$id", null) == signature) CourseWidgetLayout.page(prefs.getInt("page_$id", 0), rows.size)
          else rows.indexOfFirst { it.endsAt > now }.coerceAtLeast(0) / 3
        prefs.edit().putString("signature_$id", signature).putInt("page_$id", page)
          .putBoolean("motion_$id", CourseWidgetViews.motionEnabled(context)).apply()
        val (portrait, landscape) = sizes(manager.getAppWidgetOptions(id))
        val views = CourseWidgetViews.responsive(context, portrait, landscape) { form ->
          CourseWidgetViews.render(context, form, agenda, courses != null, now, rows, page, open, refreshIntent(context),
            pageIntent(context, id, -1), pageIntent(context, id, 1))
        }
        manager.updateAppWidget(id, views)
      }
      // Inexact, non-wakeup: no busy polling, permanent service or exact alarm permission.
      alarm(context).set(AlarmManager.RTC, agenda.refreshAt, refreshIntent(context))
    }
    @Synchronized private fun changePage(context: Context, id: Int, direction: Int) {
      val manager = AppWidgetManager.getInstance(context)
      if (id !in manager.getAppWidgetIds(ComponentName(context, CourseWidgetProvider::class.java))) return
      val rows = CourseWidgetEngine.agenda(CourseWidgetStore.load(context) ?: emptyList(), System.currentTimeMillis()).today.take(30)
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getString("signature_$id", null) != signature(rows) ||
        prefs.getBoolean("motion_$id", true) != CourseWidgetViews.motionEnabled(context)) { refresh(context, id); return }
      val page = CourseWidgetLayout.page(prefs.getInt("page_$id", 0) + if (direction < 0) -1 else 1, rows.size)
      prefs.edit().putInt("page_$id", page).apply()
      val (portrait, landscape) = sizes(manager.getAppWidgetOptions(id))
      // Change only the existing ViewFlipper child; don't rebuild or flash the full widget.
      manager.partiallyUpdateAppWidget(id, CourseWidgetViews.responsive(context, portrait, landscape) { form ->
        CourseWidgetViews.pageUpdate(context, form, page, CourseWidgetLayout.pageCount(rows.size))
      })
    }
  }
}
