package app.kezhi.android

enum class WidgetForm(val width: Float, val height: Float) {
  TILE(48f, 48f), COMPACT(100f, 152f), STRIP(240f, 64f), CARD(240f, 220f),
  DAY_NARROW(48f, 260f), DAY_MEDIUM(112f, 260f), AGENDA(240f, 300f);

  val isDay: Boolean get() = this == DAY_NARROW || this == DAY_MEDIUM || this == AGENDA
}

/** Logical dp breakpoints, not launcher cell counts (which differ by device). */
object CourseWidgetLayout {
  fun choose(width: Float, height: Float, fontScale: Float = 1f): WidgetForm {
    val scale = fontScale.coerceIn(1f, 2f)
    // Height is useful even in a one-column widget; don't send tall/narrow shapes
    // back to the tiny clock. Day lists can scroll when accessibility fonts grow.
    if (height >= 260f) return when {
      width >= 240f && height >= 300f -> WidgetForm.AGENDA
      width >= 112f -> WidgetForm.DAY_MEDIUM
      else -> WidgetForm.DAY_NARROW
    }
    return WidgetForm.values().filter { !it.isDay && (it == WidgetForm.TILE || width >= it.width * scale && height >= it.height * scale) }
      .maxByOrNull { it.width * it.height } ?: WidgetForm.TILE
  }
  fun pageCount(count: Int) = ((count + 2) / 3).coerceAtLeast(1)
  fun page(index: Int, count: Int): Int { val pages = pageCount(count); return ((index % pages) + pages) % pages }
}
