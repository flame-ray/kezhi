package app.kezhi.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.ViewFlipper
import android.widget.LinearLayout
import android.widget.ListView
import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.os.Parcel
import android.widget.RemoteViews
import android.content.ComponentName
import android.content.res.Configuration
import org.robolectric.Shadows.shadowOf
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CourseWidgetViewsTest {
  private val context: Context get() = RuntimeEnvironment.getApplication()
  private val now = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).parse("2026-09-22 07:00")!!.time
  private fun sample(): WidgetAgenda {
    val names = listOf("高等数学（一）", "大学英语", "无机化学实验", "中国近现代史纲要", "人工智能基础", "体育", "大学语文")
    val rows = (1..7).map { i -> TimedWidgetCourse(WidgetCourse("2026-09-22", "%02d:20".format(i+7), "%02d:55".format(i+7), names[i-1], "医学院301"), now+3600000L*i, now+3600000L*i+2100000) }
    return WidgetAgenda(rows, rows[0], 2000)
  }
  private fun render(form: WidgetForm, agenda: WidgetAgenda = sample(), data: Boolean = true, width: Float = form.width, height: Float = form.height): View {
    val click = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    return CourseWidgetViews.render(context, form, agenda, data, now, click, click, width, height)
      .apply(context, FrameLayout(context))
  }
  private fun measure(view: View, width: Int, height: Int) {
    val density = context.resources.displayMetrics.density
    view.measure(View.MeasureSpec.makeMeasureSpec((width*density).toInt(), View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec((height*density).toInt(), View.MeasureSpec.EXACTLY))
    view.layout(0, 0, view.measuredWidth, view.measuredHeight)
  }
  private fun assertFits(parent: ViewGroup) {
    for (i in 0 until parent.childCount) {
      val child = parent.getChildAt(i)
      if (child.visibility != View.VISIBLE) continue
      assertTrue("child ${child.id} exceeds height ${parent.height}: ${child.bottom}", child.bottom <= parent.height)
      assertTrue("child ${child.id} exceeds width ${parent.width}: ${child.right}", child.right <= parent.width)
      if (child is ViewGroup) assertFits(child)
    }
  }
  @Test fun allFormsInflateAsRemoteViewsAndFitTheirMinimumBounds() {
    for (form in WidgetForm.values()) {
      val view = render(form)
      measure(view, form.width.toInt(), form.height.toInt())
      assertFits(view as ViewGroup)
      assertNotNull(view.contentDescription)
      val directory = File("build/reports/widget-previews").apply { mkdirs() }
      val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
      view.draw(Canvas(bitmap))
      File(directory, "${form.name.lowercase()}.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      bitmap.recycle()
    }
  }
  @Test fun tallOneAndTwoColumnWidgetsShowTheEntireDayWithoutPages() {
    for ((width, height, count) in listOf(Triple(57f, 550f, 3), Triple(130f, 600f, 7), Triple(350f, 550f, 7))) {
      val agenda = sample().copy(today = sample().today.take(count))
      val form = CourseWidgetLayout.choose(width, height)
      val view = render(form, agenda, width = width, height = height)
      measure(view, width.toInt(), height.toInt())
      val rows = view.findViewById<LinearLayout>(R.id.widget_day_rows)
      assertEquals("width=$width", View.VISIBLE, rows.visibility)
      assertEquals(count, rows.childCount)
      assertFits(view as ViewGroup)
      for (i in 0 until count) {
        val title = rows.getChildAt(i).findViewById<TextView>(R.id.widget_day_row_title)
        assertEquals(agenda.today[i].course.title, title.text.toString())
        assertNull(title.ellipsize)
        assertEquals(title.text.length, title.layout.getLineEnd(title.layout.lineCount - 1))
      }
      savePreview(view, "day-${width.toInt()}")
    }
  }
  @Test fun crowdedDaysUseContinuousListInsteadOfDroppingRows() {
    val view = render(WidgetForm.DAY_NARROW)
    assertEquals(View.VISIBLE, view.findViewById<ListView>(R.id.widget_day_list).visibility)
    assertEquals("上下滑动", view.findViewById<TextView>(R.id.widget_day_footer).text.toString())
  }
  private fun savePreview(view: View, name: String) {
    val directory = File("build/reports/widget-previews-1.3.2").apply { mkdirs() }
    val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
    view.draw(Canvas(bitmap))
    File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
  }
  @Test fun resizeSelectsCurrentLayoutEvenWhenHostDoesNotPassAnApplySize() {
    val click = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val oldMap = RemoteViews(mapOf(
      android.util.SizeF(48f, 48f) to CourseWidgetViews.render(context, WidgetForm.TILE, sample(), true, now, click, click),
      android.util.SizeF(350f, 550f) to CourseWidgetViews.render(context, WidgetForm.AGENDA, sample(), true, now, click, click, 350f, 550f)))
    assertNull(oldMap.apply(context, FrameLayout(context)).findViewById<View>(R.id.widget_day_rows))
    for ((w, h) in listOf(57f to 90f, 350f to 550f, 57f to 550f, 130f to 600f, 57f to 90f)) {
      val bundle = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w.toInt())
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w.toInt())
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h.toInt())
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h.toInt())
      }
      val (portrait, landscape) = CourseWidgetProvider.sizes(bundle)
      val views = CourseWidgetViews.responsive(context, portrait, landscape) { form, width, height ->
        CourseWidgetViews.render(context, form, sample(), true, now, click, click, width, height)
      }
      // Binder round-trip and legacy apply(context,parent) reproduce a host with
      // no responsive-layout selection, which used to pick the smallest child.
      val parcel = Parcel.obtain()
      views.writeToParcel(parcel, 0); parcel.setDataPosition(0)
      val copy = RemoteViews.CREATOR.createFromParcel(parcel); parcel.recycle()
      val applied = copy.apply(context, FrameLayout(context))
      assertEquals(h >= 260f, applied.findViewById<View>(R.id.widget_day_rows) != null)
    }
  }
  @Test fun disabledSystemAnimationUsesStaticFlipper() {
    Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
    assertNull(render(WidgetForm.CARD).findViewById<ViewFlipper>(R.id.widget_pages).inAnimation)
  }
  @Test fun emptyAndMissingSchedulesKeepActionableText() {
    val empty = WidgetAgenda(emptyList(), null, 2000L)
    for (form in WidgetForm.values()) {
      assertTrue(render(form, empty, false).contentDescription.contains("同步"))
      assertTrue(render(form, empty, true).contentDescription.contains("暂无后续课程"))
    }
  }
  @Test @Config(sdk = [28]) fun oldAndroidCanInflateAllForms() {
    for (form in WidgetForm.values()) assertNotNull(render(form))
  }
  @Test fun listFactoryKeepsAllCoursesAndReloadsLocalData() {
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(System.currentTimeMillis())
    val events = org.json.JSONArray()
    for (i in 1..35) events.put(org.json.JSONObject().put("date", date).put("start", "08:20").put("end", "09:55").put("title", "测试课程%02d".format(i)).put("location", "测试教室"))
    CourseWidgetStore.save(context, org.json.JSONObject().put("version", 1).put("events", events).toString())
    val factory = CourseWidgetDayService.Factory(context, Intent().putExtra("width", 57f))
    factory.onCreate()
    assertEquals(35, factory.count)
    val last = factory.getViewAt(34)!!.apply(context, FrameLayout(context))
    assertEquals("测试课程35", last.findViewById<TextView>(R.id.widget_day_row_title).text.toString())
    assertNull(factory.getViewAt(35))
    CourseWidgetStore.save(context, "{\"version\":1,\"events\":[]}")
    factory.onDataSetChanged()
    assertEquals(0, factory.count)
  }
  @Test fun callbackSizeOverridesStaleManagerOptions() {
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    shadow.bindAppWidgetId(712, ComponentName(context, CourseWidgetProvider::class.java))
    val expanded = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 350)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 350)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 550)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 550)
    }
    CourseWidgetProvider.refresh(context, 712, expanded)
    assertNotNull(shadow.getViewFor(712).findViewById<View>(R.id.widget_day_rows))
    val small = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 57)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 57)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 90)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 90)
    }
    CourseWidgetProvider.refresh(context, 712, small)
    assertNull(shadow.getViewFor(712).findViewById<View>(R.id.widget_day_rows))
  }
  @Test fun largeFontsKeepTallDayModeAndReadableUnclippedRows() {
    val configuration = Configuration(context.resources.configuration).apply { fontScale = 1.5f }
    val scaled = context.createConfigurationContext(configuration)
    val click = PendingIntent.getActivity(scaled, 0, Intent(scaled, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    for (width in listOf(57f, 130f, 350f)) {
      val form = CourseWidgetLayout.choose(width, 550f, 1.5f)
      assertTrue(form.isDay)
      val view = CourseWidgetViews.render(scaled, form, sample(), true, now, click, click, width, 550f).apply(scaled, FrameLayout(scaled))
      measure(view, width.toInt(), 550)
      assertFits(view as ViewGroup)
    }
  }
  @Test @Config(qualifiers = "night") fun darkDayPreview() {
    val view = render(WidgetForm.AGENDA, width = 350f, height = 550f)
    measure(view, 350, 550)
    assertFits(view as ViewGroup)
    savePreview(view, "day-dark")
  }
}
