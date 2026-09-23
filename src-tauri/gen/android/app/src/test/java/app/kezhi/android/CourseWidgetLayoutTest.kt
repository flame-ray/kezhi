package app.kezhi.android

import org.junit.Assert.*
import org.junit.Test

class CourseWidgetLayoutTest {
  @Test fun supportsSmallCardsAndTallDayLayouts() {
    assertEquals(WidgetForm.TILE, CourseWidgetLayout.choose(57f, 102f))
    assertEquals(WidgetForm.COMPACT, CourseWidgetLayout.choose(130f, 220f))
    assertEquals(WidgetForm.STRIP, CourseWidgetLayout.choose(276f, 102f))
    assertEquals(WidgetForm.CARD, CourseWidgetLayout.choose(276f, 220f))
    assertEquals(WidgetForm.AGENDA, CourseWidgetLayout.choose(276f, 455f))
    assertEquals(WidgetForm.DAY_NARROW, CourseWidgetLayout.choose(57f, 550f))
    assertEquals(WidgetForm.DAY_MEDIUM, CourseWidgetLayout.choose(130f, 550f))
  }
  @Test fun boundariesNeverChooseAFormThatDoesNotFit() {
    for (width in listOf(48f, 99f, 100f, 239f, 240f, 350f, 700f))
      for (height in listOf(48f, 63f, 64f, 151f, 152f, 219f, 220f, 409f, 410f, 800f)) {
        val form = CourseWidgetLayout.choose(width, height)
        assertTrue(form.width <= width && form.height <= height)
      }
    assertEquals(WidgetForm.STRIP, CourseWidgetLayout.choose(240f, 219f))
    assertEquals(WidgetForm.AGENDA, CourseWidgetLayout.choose(240f, 409f))
  }
  @Test fun largerFontsReduceInformationDensity() {
    assertEquals(WidgetForm.AGENDA, CourseWidgetLayout.choose(300f, 460f))
    assertEquals(WidgetForm.AGENDA, CourseWidgetLayout.choose(300f, 460f, 1.25f))
    assertEquals(WidgetForm.TILE, CourseWidgetLayout.choose(57f, 102f, 2f))
  }
  @Test fun pagesWrapAndCopeWithDeletion() {
    assertEquals(1, CourseWidgetLayout.pageCount(0))
    assertEquals(1, CourseWidgetLayout.pageCount(3))
    assertEquals(2, CourseWidgetLayout.pageCount(4))
    assertEquals(0, CourseWidgetLayout.page(2, 4))
    assertEquals(1, CourseWidgetLayout.page(-1, 4))
    assertEquals(0, CourseWidgetLayout.page(9, 0))
  }
}
