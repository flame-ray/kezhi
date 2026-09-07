import { describe, expect, it } from "vitest";
import { resolveAppBackDestination, type AppBackState } from "./backNavigation";

const rootState: AppBackState = {
  syncReviewOpen: false,
  importOpen: false,
  calendarImportOpen: false,
  courseEditorOpen: false,
  exportOpen: false,
  timetableOpen: false,
  settingsOpen: false,
  courseDetailsOpen: false,
  secondaryPageOpen: false,
};

describe("app back navigation", () => {
  it.each([
    ["syncReviewOpen", "sync-review"],
    ["importOpen", "import"],
    ["calendarImportOpen", "calendar-import"],
    ["courseEditorOpen", "course-editor"],
    ["exportOpen", "export"],
    ["timetableOpen", "timetable"],
    ["settingsOpen", "settings"],
    ["courseDetailsOpen", "course-details"],
    ["secondaryPageOpen", "secondary-page"],
  ] as const)("routes %s to %s", (key, destination) => {
    expect(resolveAppBackDestination({ ...rootState, [key]: true })).toBe(destination);
  });

  it("always closes the highest visible layer first", () => {
    expect(resolveAppBackDestination({
      ...rootState,
      settingsOpen: true,
      courseEditorOpen: true,
      importOpen: true,
      syncReviewOpen: true,
    })).toBe("sync-review");
  });

  it("stays at the application root instead of requesting an exit", () => {
    expect(resolveAppBackDestination(rootState)).toBe("root");
  });
});
