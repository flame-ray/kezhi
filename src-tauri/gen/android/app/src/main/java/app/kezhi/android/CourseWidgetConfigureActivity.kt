package app.kezhi.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import java.text.SimpleDateFormat
import java.util.Locale

/** Draft choices are previewed locally and committed only when Save is tapped. */
class CourseWidgetConfigureActivity : AppCompatActivity() {
  companion object {
    fun pending(context: android.content.Context, id: Int): PendingIntent = PendingIntent.getActivity(context, id,
      Intent(context, CourseWidgetConfigureActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private var widgetId = -1
  private val fields = mutableListOf<Spinner>()
  private lateinit var preview: FrameLayout
  private lateinit var status: TextView
  private var loading = true
  private var saving = false
  private val drafts = mutableMapOf<Int, WidgetAppearance>()
  private fun rememberDraft() {
    if(widgetId > 0 && fields.size == 4) drafts[widgetId] = appearance()
  }
  override fun onSaveInstanceState(outState: Bundle) {
    rememberDraft()
    outState.putInt("selected_widget", widgetId)
    outState.putBundle("widget_drafts", Bundle().apply {
      drafts.forEach { (id, style) -> putBundle(id.toString(), Bundle().apply {
        putString("theme", style.theme); putInt("opacity", style.opacity)
        putInt("font", style.font); putBoolean("compact", style.compact)
      }) }
    })
    super.onSaveInstanceState(outState)
  }
  private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
  private fun label(value: String, size: Float = 14f) = TextView(this).apply {
    text = value; textSize = size; setTextColor(getColor(R.color.widget_text)); setPadding(0, dp(10), 0, dp(6))
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState); setResult(RESULT_CANCELED)
    savedInstanceState?.getBundle("widget_drafts")?.let { saved ->
      saved.keySet().forEach { key ->
        val id = key.toIntOrNull()
        val style = saved.getBundle(key)
        if(id != null && id > 0 && style != null) drafts[id] = WidgetAppearance(
          style.getString("theme", "system"), style.getInt("opacity", 100),
          style.getInt("font", 100), style.getBoolean("compact", false)).normalized()
      }
    }
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(getColor(R.color.widget_surface)) }
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      v.setPadding(dp(20) + bars.left, bars.top, dp(20) + bars.right, bars.bottom); insets
    }
    root.addView(label("桌面课表外观", 24f).apply { typeface = Typeface.DEFAULT_BOLD })
    root.addView(label("各组件的选择分别保留；保存只应用于当前组件。", 12f))
    val manager = AppWidgetManager.getInstance(this)
    val component = ComponentName(this, CourseWidgetProvider::class.java)
    val requested = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
    val ids = manager.getAppWidgetIds(component).toMutableList()
    if(requested > 0 && manager.getAppWidgetInfo(requested)?.provider == component && requested !in ids) ids.add(requested)
    // A host configuration must return the same ID it was asked to configure.
    // Never fall back to a different widget if the requested one was removed.
    if(requested != -1) ids.retainAll(listOf(requested))
    if(ids.isEmpty()) {
      root.addView(label(if(requested != -1) "这个小组件已不可用，请返回桌面重新添加。" else "还没有桌面小组件。请先从课织设置或桌面小组件列表添加。"))
      root.addView(MaterialButton(this).apply { text = "返回"; setOnClickListener { finish() } })
      setContentView(root); return
    }
    val picker = Spinner(this).apply {
      adapter = ArrayAdapter(this@CourseWidgetConfigureActivity, android.R.layout.simple_spinner_dropdown_item, ids.map { "桌面课表 · #$it" })
      isEnabled = ids.size > 1; contentDescription = "选择要设置的桌面课表"
    }
    root.addView(picker)
    val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(ScrollView(this).apply { addView(body) }, LinearLayout.LayoutParams(-1, 0, 1f))
    val choices = listOf("颜色" to listOf("跟随系统", "浅色", "深色"),
      "背景不透明度（文字保持清晰）" to listOf("100% · 实色", "75% · 柔和", "50% · 通透"),
      "字号" to listOf("标准", "稍小", "稍大"), "信息密度" to listOf("舒适", "紧凑"))
    choices.forEach { (title, options) ->
      body.addView(label(title))
      val field = Spinner(this).apply { adapter = ArrayAdapter(this@CourseWidgetConfigureActivity, android.R.layout.simple_spinner_dropdown_item, options); contentDescription = title }
      fields.add(field); body.addView(field, LinearLayout.LayoutParams(-1, dp(48)))
    }
    body.addView(MaterialButton(this).apply {
      text = "恢复默认外观"; cornerRadius = dp(24)
      backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_surface))
      setTextColor(getColor(R.color.widget_accent)); strokeWidth = dp(1)
      strokeColor = ColorStateList.valueOf(getColor(R.color.widget_outline))
      setOnClickListener {
        if(!saving) {
          loading = true; fields.forEach { it.setSelection(0) }; loading = false
          updatePreview()
        }
      }
    }, LinearLayout.LayoutParams(-1, dp(52)))
    body.addView(label("恢复默认仅修改预览，点击下方保存后才生效。", 12f))
    body.addView(label("实际课程外观预览 · 最多两堂", 12f))
    preview = FrameLayout(this); body.addView(preview, LinearLayout.LayoutParams(-1, dp(340)))
    preview.addOnLayoutChangeListener { _, left, _, right, _, oldLeft, _, oldRight, _ ->
      if(right - left != oldRight - oldLeft) preview.post { updatePreview() }
    }
    status = label("", 12f); body.addView(status)
    body.addView(label("跟随系统的实色使用系统配色，半透明使用对应明暗底色。空间不足时滚动查看，不隐藏已结束课程。", 12f))
    val buttons = LinearLayout(this)
    buttons.addView(MaterialButton(this).apply {
      text = "取消"; cornerRadius = dp(24); backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_surface))
      setTextColor(getColor(R.color.widget_accent)); strokeWidth = dp(1); strokeColor = ColorStateList.valueOf(getColor(R.color.widget_outline)); setOnClickListener { finish() }
    }, LinearLayout.LayoutParams(0, dp(54), 1f))
    val save = MaterialButton(this).apply { text = "保存此外观"; cornerRadius = dp(24)
      backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_accent)); setTextColor(getColor(R.color.widget_surface)) }
    buttons.addView(save, LinearLayout.LayoutParams(0, dp(54), 2f).apply { marginStart = dp(12) })
    root.addView(buttons); setContentView(root)
    fun load() {
      val target = ids[picker.selectedItemPosition.coerceAtLeast(0)]
      if(target == widgetId) return
      rememberDraft(); widgetId = target
      val s = drafts[widgetId] ?: WidgetPreferences.load(this, widgetId); loading = true
      val selections = listOf(listOf("system", "light", "dark").indexOf(s.theme), listOf(100, 75, 50).indexOf(s.opacity), listOf(100, 90, 115).indexOf(s.font), if(s.compact) 1 else 0)
      fields.forEachIndexed { i, field -> field.setSelection(selections[i]) }; loading = false
      preview.post { updatePreview() }
    }
    fun listener(action: () -> Unit) = object : AdapterView.OnItemSelectedListener {
      override fun onNothingSelected(parent: AdapterView<*>?) {}
      override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = action()
    }
    fields.forEach { it.onItemSelectedListener = listener { if(!loading) updatePreview() } }
    picker.onItemSelectedListener = listener { load() }
    val initialId = if(requested != -1) requested else savedInstanceState?.getInt("selected_widget", -1) ?: -1
    picker.setSelection(ids.indexOf(initialId).coerceAtLeast(0)); load()
    save.setOnClickListener {
      if(saving) return@setOnClickListener
      if(manager.getAppWidgetInfo(widgetId)?.provider != component) { status.text = "小组件已移除，请重新添加"; return@setOnClickListener }
      saving = true; save.isEnabled = false
      val selected = appearance(); val target = widgetId
      Thread {
        try {
          WidgetPreferences.save(this, target, selected); CourseWidgetProvider.refresh(this, target)
          runOnUiThread { setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, target)); finish() }
        } catch (_: Exception) { runOnUiThread { saving = false; save.isEnabled = true; status.text = "保存失败，请重试" } }
      }.start()
    }
  }
  private fun appearance() = WidgetAppearance(
    listOf("system", "light", "dark")[fields[0].selectedItemPosition.coerceAtLeast(0)],
    listOf(100, 75, 50)[fields[1].selectedItemPosition.coerceAtLeast(0)],
    listOf(100, 90, 115)[fields[2].selectedItemPosition.coerceAtLeast(0)], fields[3].selectedItemPosition == 1)
  private fun updatePreview() {
    if(loading || widgetId <= 0 || preview.width <= 0) return
    val now = System.currentTimeMillis(); val data = CourseWidgetStore.load(this)
    val agenda = CourseWidgetEngine.agenda(data ?: emptyList(), now)
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val views = CourseWidgetDayViews.render(this, agenda.copy(today = agenda.today.take(2)), data != null, now,
      preview.width / resources.displayMetrics.density, 340f, widgetId, open, open, appearance())
    preview.removeAllViews(); preview.addView(views.apply(this, preview), FrameLayout.LayoutParams(-1, -1))
    preview.addView(View(this).apply { isClickable = true; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }, FrameLayout.LayoutParams(-1, -1))
    val synced = CourseWidgetStore.syncedAt(this)
    status.text = if(synced == 0L) "尚未同步课表，请先进入课织完成导入。" else "课程同步于 " + SimpleDateFormat("M/d HH:mm", Locale.CHINA).format(synced) + "；仅预览，点击保存后生效。"
  }
}
