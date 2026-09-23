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
  private fun render(form: WidgetForm, agenda: WidgetAgenda = sample(), data: Boolean = true): View {
    val click = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    return CourseWidgetViews.render(context, form, agenda, data, now, agenda.today, 0, click, click, click, click)
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
  @Test fun pagingUpdatesOnlyDisplayedChildAndKeepsNativeAnimation() {
    val view = render(WidgetForm.AGENDA)
    val flipper = view.findViewById<ViewFlipper>(R.id.widget_pages)
    assertEquals(3, flipper.childCount)
    assertFalse(flipper.isFlipping)
    assertNotNull(flipper.inAnimation)
    CourseWidgetViews.pageUpdate(context, WidgetForm.AGENDA, 1, 3).reapply(context, view)
    assertEquals(1, flipper.displayedChild)
    assertEquals("2 / 3", view.findViewById<TextView>(R.id.widget_page_number).text.toString())
  }
  @Test fun disabledSystemAnimationUsesStaticFlipper() {
    Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
    assertNull(render(WidgetForm.AGENDA).findViewById<ViewFlipper>(R.id.widget_pages).inAnimation)
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
}
