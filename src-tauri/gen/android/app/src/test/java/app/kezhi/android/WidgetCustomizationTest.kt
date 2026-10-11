package app.kezhi.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Spinner
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetCustomizationTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val now = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).parse("2026-09-25 07:00")!!.time
  private fun saveCourses() {
    val rows = JSONArray().put(JSONObject().put("id","course-a").put("date","2026-09-25").put("start","08:20").put("end","09:55").put("title","高等数学").put("location","医学院301"))
    CourseWidgetStore.save(context, JSONObject().put("version",1).put("events",rows).toString())
  }
  @Test fun eachWidgetKeepsIndependentValidatedSettings() {
    val s = WidgetAppearance("dark", 50, 115, true)
    WidgetPreferences.save(context, 1, s)
    assertEquals(s, WidgetPreferences.load(context, 1))
    assertEquals(WidgetAppearance(), WidgetPreferences.load(context, 2))
    WidgetPreferences.save(context, 2, WidgetAppearance("invalid", -5, 999))
    assertEquals(WidgetAppearance(), WidgetPreferences.load(context, 2))
    WidgetPreferences.remove(context, 1)
    assertEquals(WidgetAppearance(), WidgetPreferences.load(context, 1))
  }
  @Test fun dayChoiceIsIndependentAndResetsAtNextLocalDay() {
    assertEquals(0, WidgetPreferences.day(context, 1, now))
    WidgetPreferences.toggleDay(context, 1, now)
    assertEquals(1, WidgetPreferences.day(context, 1, now))
    assertEquals(0, WidgetPreferences.day(context, 2, now))
    val tomorrow = WidgetPreferences.displayTime(now, 1)
    assertEquals("2026-09-26 00:00", SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).format(tomorrow))
    assertEquals(0, WidgetPreferences.day(context, 1, tomorrow))
    WidgetPreferences.toggleDay(context, 1, now)
    assertEquals(0, WidgetPreferences.day(context, 1, now))
  }
  @Test fun navigationChecksLocalOccurrenceAndAcknowledgesOnlyMatchingToken() {
    saveCourses()
    val course = CourseWidgetStore.load(context)!!.first()
    assertTrue(WidgetNavigation.capture(context, WidgetNavigation.intent(context, course)))
    val first = WidgetNavigation.read(context)!!
    WidgetNavigation.acknowledge(context, "wrong")
    assertNotNull(WidgetNavigation.read(context))
    assertTrue(WidgetNavigation.capture(context, WidgetNavigation.fillIn(course)))
    val second = WidgetNavigation.read(context)!!
    assertNotEquals(first.getString("token"), second.getString("token"))
    WidgetNavigation.acknowledge(context, first.getString("token"))
    assertNotNull(WidgetNavigation.read(context))
    WidgetNavigation.acknowledge(context, second.getString("token"))
    assertNull(WidgetNavigation.read(context))
    assertFalse(WidgetNavigation.capture(context, WidgetNavigation.intent(context, course.copy(id="missing"))))
    assertFalse(WidgetNavigation.capture(context, WidgetNavigation.intent(context, course.copy(date="2026-09-26"))))
  }
  @Test fun staticCourseClickCarriesTheCorrectOccurrence() {
    saveCourses()
    val item = CourseWidgetEngine.agenda(CourseWidgetStore.load(context)!!, now).today.first()
    val open = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val row = CourseWidgetDayViews.row(context, item, WidgetDayPlan(350f,14f,true,false,true), now, open).apply(context, FrameLayout(context))
    row.performClick()
    val intent = shadowOf(context).nextStartedActivity
    assertEquals("course-a", intent.data!!.getQueryParameter("id"))
    assertEquals("2026-09-25", intent.data!!.getQueryParameter("date"))
  }
  private fun measure(view: View, width: Int, height: Int) {
    val d = context.resources.displayMetrics.density
    view.measure(View.MeasureSpec.makeMeasureSpec((width*d).toInt(), View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec((height*d).toInt(), View.MeasureSpec.EXACTLY))
    view.layout(0,0,view.measuredWidth,view.measuredHeight)
  }
  private fun descendants(view: View): List<View> = listOf(view) + if(view is ViewGroup)
    (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
  private fun spinners(activity: CourseWidgetConfigureActivity) =
    descendants(activity.findViewById(android.R.id.content)).filterIsInstance<Spinner>()
  private fun idle() = shadowOf(android.os.Looper.getMainLooper()).idle()
  @Test fun appearanceDraftSurvivesRecreationWithoutBeingCommitted() {
    shadowOf(AppWidgetManager.getInstance(context)).bindAppWidgetId(701,ComponentName(context,CourseWidgetProvider::class.java))
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java,
      Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,701)).setup().visible()
    idle()
    spinners(controller.get())[1].setSelection(2)
    spinners(controller.get())[2].setSelection(2)
    spinners(controller.get())[3].setSelection(2)
    spinners(controller.get())[4].setSelection(1)
    idle(); controller.recreate(); idle()
    val fields = spinners(controller.get())
    assertEquals(listOf(0,2,2,2,1), fields.map { it.selectedItemPosition })
    assertEquals(WidgetAppearance(), WidgetPreferences.load(context,701))
    controller.pause().stop().destroy()
  }
  @Test fun switchingWidgetsKeepsSeparateDraftsAndSelectedWidgetOnRecreation() {
    val manager = shadowOf(AppWidgetManager.getInstance(context))
    manager.bindAppWidgetId(702,ComponentName(context,CourseWidgetProvider::class.java))
    manager.bindAppWidgetId(703,ComponentName(context,CourseWidgetProvider::class.java))
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java).setup().visible()
    idle()
    var fields = spinners(controller.get())
    fields[1].setSelection(2); idle()
    fields[0].setSelection(1); idle()
    assertEquals(0, fields[1].selectedItemPosition)
    fields[1].setSelection(1); idle()
    controller.recreate(); idle()
    fields = spinners(controller.get())
    assertEquals(1, fields[0].selectedItemPosition)
    assertEquals(1, fields[1].selectedItemPosition)
    fields[0].setSelection(0); idle()
    assertEquals(2, fields[1].selectedItemPosition)
    for(id in listOf(702,703)) assertEquals(WidgetAppearance(),WidgetPreferences.load(context,id))
    controller.pause().stop().destroy()
  }
  @Test fun desktopConfigurationCannotSwitchToAnotherWidget() {
    val manager = shadowOf(AppWidgetManager.getInstance(context))
    manager.bindAppWidgetId(704,ComponentName(context,CourseWidgetProvider::class.java))
    manager.bindAppWidgetId(705,ComponentName(context,CourseWidgetProvider::class.java))
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java,
      Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,705)).setup().visible()
    idle()
    val picker = spinners(controller.get()).first()
    assertEquals(1,picker.count)
    assertFalse(picker.isEnabled)
    assertTrue(picker.selectedItem.toString().contains("705"))
    controller.pause().stop().destroy()
  }
  @Test fun resetAppearanceIsADraftAndCancelKeepsExistingSettings() {
    shadowOf(AppWidgetManager.getInstance(context)).bindAppWidgetId(707,ComponentName(context,CourseWidgetProvider::class.java))
    val original = WidgetAppearance("dark",50,115,true)
    WidgetPreferences.save(context,707,original)
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java,
      Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,707)).setup().visible()
    idle()
    val root = controller.get().findViewById<View>(android.R.id.content)
    descendants(root).filterIsInstance<TextView>().first { it.text.toString() == "恢复默认外观" }.performClick()
    idle()
    assertEquals(listOf(0,0,0,0,0), spinners(controller.get()).map { it.selectedItemPosition })
    assertEquals(original, WidgetPreferences.load(context,707))
    descendants(root).filterIsInstance<TextView>().first { it.text.toString() == "取消" }.performClick()
    assertTrue(controller.get().isFinishing)
    assertEquals(original, WidgetPreferences.load(context,707))
    controller.pause().stop().destroy()
  }
  @Test fun missingRequestedWidgetDoesNotConfigureADifferentOne() {
    shadowOf(AppWidgetManager.getInstance(context)).bindAppWidgetId(706,ComponentName(context,CourseWidgetProvider::class.java))
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java,
      Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,999)).setup().visible()
    idle()
    assertTrue(spinners(controller.get()).isEmpty())
    val text = descendants(controller.get().findViewById(android.R.id.content)).filterIsInstance<TextView>().map { it.text.toString() }
    assertTrue(text.any { it.contains("这个小组件已不可用") })
    controller.pause().stop().destroy()
  }
  private fun save(view: View, name: String) {
    val dir = File("build/reports/widget-previews-1.4.0").apply { mkdirs() }
    val image = Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
    view.draw(Canvas(image))
    File(dir,"$name.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) }; image.recycle()
  }
  @Test fun bothThemesAndOpacityRenderAndTomorrowIsLabeled() {
    saveCourses()
    val agenda = CourseWidgetEngine.agenda(CourseWidgetStore.load(context)!!, now)
    val open = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    for(theme in listOf("light","dark")) {
      val style = WidgetAppearance(theme,75,115,true)
      val views = CourseWidgetDayViews.render(context,agenda,true,now,300f,420f,1,open,open,style,1)
      val view = views.apply(context,FrameLayout(context))
      measure(view,300,420)
      assertEquals("明天的课表",view.findViewById<TextView>(R.id.widget_day_heading).text.toString())
      assertEquals("‹ 今天",view.findViewById<TextView>(R.id.widget_day_toggle).text.toString())
      assertEquals(WidgetStyle.color(context,style,"text"),view.findViewById<TextView>(R.id.widget_day_heading).currentTextColor)
      save(view,theme)
    }
  }
  @Test fun configurationScreenLoadsAndPreviewDoesNotSaveDraft() {
    val manager = AppWidgetManager.getInstance(context)
    shadowOf(manager).bindAppWidgetId(700,ComponentName(context,CourseWidgetProvider::class.java))
    val controller = Robolectric.buildActivity(CourseWidgetConfigureActivity::class.java,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,700)).setup().visible()
    val activity = controller.get()
    val root = activity.findViewById<ViewGroup>(android.R.id.content)
    measure(root,390,844); shadowOf(android.os.Looper.getMainLooper()).idle()
    fun all(view: View): List<View> = listOf(view) + if(view is ViewGroup) (0 until view.childCount).flatMap { all(view.getChildAt(it)) } else emptyList()
    val spinners = all(root).filterIsInstance<Spinner>()
    assertEquals(5,spinners.size)
    spinners[1].setSelection(2); shadowOf(android.os.Looper.getMainLooper()).idle()
    assertEquals(WidgetAppearance(),WidgetPreferences.load(context,700))
    save(root,"configuration")
    controller.pause().stop().destroy()
  }
  @Test @Config(sdk = [28]) fun stylingUsesRemoteViewsActionsAvailableBeforeAndroid12() {
    val open = PendingIntent.getActivity(context, 1, Intent(context,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
    val empty = WidgetAgenda(emptyList(),null,now+1000)
    for(form in WidgetForm.values()) assertNotNull(CourseWidgetViews.render(context,form,empty,true,now,open,open,style=WidgetAppearance("dark",50,90,true)).apply(context,FrameLayout(context)))
  }
}
