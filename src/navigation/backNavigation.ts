export interface AppBackState {
  syncReviewOpen: boolean;
  importOpen: boolean;
  courseEditorOpen: boolean;
  exportOpen: boolean;
  timetableOpen: boolean;
  settingsOpen: boolean;
  courseDetailsOpen: boolean;
}

export type AppBackDestination =
  | "sync-review"
  | "import"
  | "course-editor"
  | "export"
  | "timetable"
  | "settings"
  | "course-details"
  | "root";

const backPriority: ReadonlyArray<readonly [keyof AppBackState, AppBackDestination]> = [
  ["syncReviewOpen", "sync-review"],
  ["importOpen", "import"],
  ["courseEditorOpen", "course-editor"],
  ["exportOpen", "export"],
  ["timetableOpen", "timetable"],
  ["settingsOpen", "settings"],
  ["courseDetailsOpen", "course-details"],
];

export function resolveAppBackDestination(state: AppBackState): AppBackDestination {
  return backPriority.find(([key]) => state[key])?.[1] ?? "root";
}
