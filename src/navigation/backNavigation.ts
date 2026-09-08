export interface AppBackState {
  syncReviewOpen: boolean;
  importOpen: boolean;
  calendarImportOpen: boolean;
  courseEditorOpen: boolean;
  gradeEditorOpen: boolean;
  exportOpen: boolean;
  timetableOpen: boolean;
  settingsOpen: boolean;
  courseDetailsOpen: boolean;
  secondaryPageOpen: boolean;
}

export type AppBackDestination =
  | "sync-review"
  | "import"
  | "calendar-import"
  | "course-editor"
  | "grade-editor"
  | "export"
  | "timetable"
  | "settings"
  | "course-details"
  | "secondary-page"
  | "root";

const backPriority: ReadonlyArray<readonly [keyof AppBackState, AppBackDestination]> = [
  ["syncReviewOpen", "sync-review"],
  ["importOpen", "import"],
  ["calendarImportOpen", "calendar-import"],
  ["courseEditorOpen", "course-editor"],
  ["gradeEditorOpen", "grade-editor"],
  ["exportOpen", "export"],
  ["timetableOpen", "timetable"],
  ["settingsOpen", "settings"],
  ["courseDetailsOpen", "course-details"],
  ["secondaryPageOpen", "secondary-page"],
];

export function resolveAppBackDestination(state: AppBackState): AppBackDestination {
  return backPriority.find(([key]) => state[key])?.[1] ?? "root";
}
