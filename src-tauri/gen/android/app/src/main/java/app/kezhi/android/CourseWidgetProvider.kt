package app.kezhi.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import java.util.concurrent.Executors

class CourseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = dispatch(context) { refresh(it) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    // Capture the delivered size: re-reading manager options on the async worker
    // can return a stale cached bundle on vendor launchers.
    val snapshot = Bundle(manager.getAppWidgetOptions(id)).apply { putAll(options) }
    dispatch(context) { refresh(it, id, snapshot) }
  }
  override fun onDisabled(context: Context) { alarm(context).cancel(refreshIntent(context)) }
  override fun onDeleted(context: Context, ids: IntArray) {
    val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    ids.forEach { edit.remove("signature_$it").remove("page_$it").remove("motion_$it") }; edit.apply()
  }
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_PAGE -> dispatch(context) { refresh(it) } // Migrate clicks from an old paged widget.
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
    internal fun sizes(options: Bundle): Pair<Pair<Float, Float>, Pair<Float, Float>> {
      val minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 240).coerceAtLeast(48).toFloat()
      val maxW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minW.toInt()).coerceAtLeast(48).toFloat()
      val minH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220).coerceAtLeast(48).toFloat()
      val maxH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minH.toInt()).coerceAtLeast(48).toFloat()
      return Pair(Pair(minW, maxH), Pair(maxW, minH))
    }
    @Synchronized fun refresh(context: Context, onlyId: Int? = null, resizeOptions: Bundle? = null) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, CourseWidgetProvider::class.java))
      if (ids.isEmpty()) { alarm(context).cancel(refreshIntent(context)); return }
      val courses = CourseWidgetStore.load(context)
      val now = System.currentTimeMillis()
      val agenda = CourseWidgetEngine.agenda(courses ?: emptyList(), now)
      val open = PendingIntent.getActivity(context, 4202, Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      for (id in ids.filter { onlyId == null || it == onlyId }) {
        val (portrait, landscape) = sizes(resizeOptions ?: manager.getAppWidgetOptions(id))
        val views = CourseWidgetViews.responsive(context, portrait, landscape) { form, width, height ->
          CourseWidgetViews.render(context, form, agenda, courses != null, now, open, refreshIntent(context), width, height, id)
        }
        manager.updateAppWidget(id, views)
        @Suppress("DEPRECATION")
        manager.notifyAppWidgetViewDataChanged(id, R.id.widget_day_list)
      }
      // Inexact, non-wakeup: no busy polling, permanent service or exact alarm permission.
      alarm(context).set(AlarmManager.RTC, agenda.refreshAt, refreshIntent(context))
    }
  }
}
