package app.kezhi.android

import org.junit.Assert.*
import org.junit.Test

class CalendarSyncEngineTest {
  private val prefix = "kezhi://course/v2/" + "a".repeat(64) + "/"
  private val uri = prefix + "b".repeat(64)
  private fun event() = PhoneCalendarEvent().apply { key = "test"; title = "数学"; location = "A301"; description = "教师"; startMs = 1800000000000L; endMs = startMs + 2700000; reminderMinutes = 15 }
  private fun row(id: Long = 1, key: String = uri) = event().let { CalendarSyncEngine.Row(id, key, it.title, it.location, it.description, it.startMs, it.endMs, listOf(15 to 1)) }
  @Test fun insertionUpdateAndUnchangedAreDistinct() {
    assertEquals("insert", CalendarSyncEngine.reconcileRows(emptyList(), mapOf(uri to event()), prefix, false).first.single().kind)
    assertEquals(1, CalendarSyncEngine.reconcileRows(listOf(row()), mapOf(uri to event()), prefix, false).second)
    val moved = event().apply { startMs += 86400000; endMs += 86400000 }
    assertEquals("update", CalendarSyncEngine.reconcileRows(listOf(row()), mapOf(uri to moved), prefix, false).first.single().kind)
  }
  @Test fun emptyTimetableDeletesOnlyCurrentScope() {
    val other = row(2, "kezhi://course/v2/" + "c".repeat(64) + "/" + "b".repeat(64))
    val unknown = row(3, "https://personal-event")
    val changes = CalendarSyncEngine.reconcileRows(listOf(row(), other, unknown), emptyMap(), prefix, false).first
    assertEquals(listOf(1L), changes.map { it.old!!.id })
    assertEquals("delete", changes.single().kind)
  }
  @Test fun legacyCleanupRequiresExplicitOptInAndPreservesNewOtherScopes() {
    val old = row(2, "kezhi://course/" + "d".repeat(64))
    assertTrue(CalendarSyncEngine.reconcileRows(listOf(old), emptyMap(), prefix, false).first.isEmpty())
    assertEquals("delete", CalendarSyncEngine.reconcileRows(listOf(old), emptyMap(), prefix, true).first.single().kind)
    val malformed = row(3, prefix + "not-an-event")
    assertTrue(CalendarSyncEngine.reconcileRows(listOf(malformed), emptyMap(), prefix, true).first.isEmpty())
  }
  @Test fun changedReminderIsAnUpdate() {
    assertEquals("update", CalendarSyncEngine.reconcileRows(listOf(row()), mapOf(uri to event().apply { reminderMinutes = 0 }), prefix, false).first.single().kind)
  }
  @Test(expected = IllegalArgumentException::class) fun duplicatesStopThePlan() {
    CalendarSyncEngine.reconcileRows(listOf(row(), row(2)), mapOf(uri to event()), prefix, false)
  }
}
