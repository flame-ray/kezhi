package app.kezhi.android

enum class WidgetForm(val width: Float, val height: Float) {
  TILE(48f, 48f), COMPACT(100f, 152f), STRIP(240f, 64f), CARD(240f, 220f), AGENDA(240f, 410f)
}

/** Logical dp breakpoints, not launcher cell counts (which differ by device). */
object CourseWidgetLayout {
  fun choose(width: Float, height: Float, fontScale: Float = 1f): WidgetForm {
    val scale = fontScale.coerceIn(1f, 2f)
    return WidgetForm.values().filter { it == WidgetForm.TILE || width >= it.width * scale && height >= it.height * scale }
      .maxByOrNull { it.width * it.height } ?: WidgetForm.TILE
  }
  fun pageCount(count: Int) = ((count + 2) / 3).coerceAtLeast(1)
  fun page(index: Int, count: Int): Int { val pages = pageCount(count); return ((index % pages) + pages) % pages }
}
