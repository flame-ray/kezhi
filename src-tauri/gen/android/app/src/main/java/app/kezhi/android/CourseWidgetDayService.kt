package app.kezhi.android

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** Local-only scrolling fallback, protected by BIND_REMOTEVIEWS in the manifest. */
class CourseWidgetDayService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext, intent)

  internal class Factory(private val context: Context, intent: Intent) : RemoteViewsFactory {
    private val width = intent.getFloatExtra("width", 130f).coerceAtLeast(48f)
    private val plan = WidgetDayPlan(width, intent.getFloatExtra("titleSp", 13f).coerceIn(10f, 14f), false, width < 112f, width >= 240f)
    private var rows = emptyList<TimedWidgetCourse>()
    private var now = 0L
    override fun onCreate() = onDataSetChanged()
    override fun onDataSetChanged() {
      now = System.currentTimeMillis()
      rows = CourseWidgetEngine.agenda(CourseWidgetStore.load(context) ?: emptyList(), now).today
    }
    override fun onDestroy() { rows = emptyList() }
    override fun getCount() = rows.size
    override fun getViewAt(position: Int): RemoteViews? = rows.getOrNull(position)?.let { CourseWidgetDayViews.row(context, it, plan, now) }
    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount() = 1
    override fun getItemId(position: Int) = position.toLong()
    override fun hasStableIds() = false
  }
}
