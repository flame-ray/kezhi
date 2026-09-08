export type GradeStatus = "passed" | "failed" | "pending";

export interface GradeRecord {
  id: string;
  courseCode: string;
  courseName: string;
  academicYear: number;
  semester: 1 | 2;
  score: string;
  credits: number;
  gradePoint?: number;
  category?: string;
  source: "manual" | "school" | "csv";
  updatedAt: string;
}

export interface GradeSummary {
  courseCount: number;
  completedCount: number;
  passedCount: number;
  failedCount: number;
  earnedCredits: number;
  attemptedCredits: number;
  averageScore?: number;
  gpa?: number;
  passRate?: number;
}

export interface GradeDistributionBucket {
  label: string;
  count: number;
  tone: "great" | "good" | "pass" | "fail";
}

export function normalizeGrades(value: unknown): GradeRecord[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 2_000).map(parseGrade).filter((grade): grade is GradeRecord => {
    if (!grade || ids.has(grade.id)) return false;
    ids.add(grade.id);
    return true;
  });
}

export function summarizeGrades(records: GradeRecord[]): GradeSummary {
  let completedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let earnedCredits = 0;
  let attemptedCredits = 0;
  let scoreWeight = 0;
  let scoreCredits = 0;
  let pointWeight = 0;
  let pointCredits = 0;

  for (const record of records) {
    const outcome = gradeOutcome(record.score);
    if (outcome.status === "pending") continue;
    completedCount += 1;
    attemptedCredits += record.credits;
    if (outcome.status === "passed") {
      passedCount += 1;
      earnedCredits += record.credits;
    } else {
      failedCount += 1;
    }
    if (outcome.numericScore !== undefined) {
      scoreWeight += outcome.numericScore * record.credits;
      scoreCredits += record.credits;
    }
    const point = record.gradePoint ?? inferredGradePoint(record.score);
    if (point !== undefined) {
      pointWeight += point * record.credits;
      pointCredits += record.credits;
    }
  }

  return {
    courseCount: records.length,
    completedCount,
    passedCount,
    failedCount,
    earnedCredits: round(earnedCredits, 1),
    attemptedCredits: round(attemptedCredits, 1),
    averageScore: scoreCredits ? round(scoreWeight / scoreCredits, 1) : undefined,
    gpa: pointCredits ? round(pointWeight / pointCredits, 2) : undefined,
    passRate: completedCount ? round(passedCount / completedCount * 100, 1) : undefined,
  };
}

export function gradeDistribution(records: GradeRecord[]): GradeDistributionBucket[] {
  const buckets: GradeDistributionBucket[] = [
    { label: "优秀", count: 0, tone: "great" },
    { label: "良好", count: 0, tone: "good" },
    { label: "及格", count: 0, tone: "pass" },
    { label: "未通过", count: 0, tone: "fail" },
  ];
  for (const record of records) {
    const outcome = gradeOutcome(record.score);
    if (outcome.status === "pending") continue;
    if (outcome.status === "failed") buckets[3].count += 1;
    else if ((outcome.numericScore ?? scoreBand(record.score)) >= 90) buckets[0].count += 1;
    else if ((outcome.numericScore ?? scoreBand(record.score)) >= 75) buckets[1].count += 1;
    else buckets[2].count += 1;
  }
  return buckets;
}

export function gradeOutcome(score: string): { status: GradeStatus; numericScore?: number } {
  const value = score.trim();
  if (!value || /^(待公布|未出|缓考|缺考待定|pending|--)$/i.test(value)) return { status: "pending" };
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return { status: numeric >= 60 ? "passed" : "failed", numericScore: numeric };
  if (/^(优秀|良好|中等|及格|合格|通过|优|良|中)$/i.test(value)) return { status: "passed" };
  if (/不及格|不合格|未通过|挂科|fail/i.test(value)) return { status: "failed" };
  return { status: "pending" };
}

export function inferredGradePoint(score: string): number | undefined {
  const numeric = Number(score.trim());
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
    if (numeric < 60) return 0;
    if (numeric >= 90) return 4;
    if (numeric >= 85) return 3.7;
    if (numeric >= 82) return 3.3;
    if (numeric >= 78) return 3;
    if (numeric >= 75) return 2.7;
    if (numeric >= 72) return 2.3;
    if (numeric >= 68) return 2;
    if (numeric >= 64) return 1.5;
    return 1;
  }
  const map: Record<string, number> = { 优秀: 4, 优: 4, 良好: 3, 良: 3, 中等: 2, 中: 2, 及格: 1, 合格: 1, 通过: 1, 不及格: 0, 不合格: 0, 未通过: 0 };
  return map[score.trim()];
}

export function parseGradeCsv(text: string, fallbackYear: number, fallbackSemester: 1 | 2): GradeRecord[] {
  const rows = parseDelimitedRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("成绩文件没有可导入的数据");
  const headers = rows[0].map(normalizeHeader);
  const index = {
    name: findHeader(headers, ["课程名称", "课程", "coursename", "name"]),
    code: findHeader(headers, ["课程编号", "课程代码", "coursecode", "code"]),
    score: findHeader(headers, ["成绩", "分数", "score", "grade"]),
    credits: findHeader(headers, ["学分", "credits", "credit"]),
    point: findHeader(headers, ["绩点", "gradepoint", "gpa"]),
    year: findHeader(headers, ["学年", "academicyear", "year"]),
    semester: findHeader(headers, ["学期", "semester", "term"]),
    category: findHeader(headers, ["课程性质", "类别", "category"]),
  };
  if (index.name < 0 || index.score < 0) throw new Error("成绩文件至少需要“课程名称”和“成绩”两列");

  const records = rows.slice(1).flatMap((row, rowIndex) => {
    const courseName = cell(row, index.name).slice(0, 160);
    const score = cell(row, index.score).slice(0, 40);
    if (!courseName || !score) return [];
    const academicYear = parseYear(cell(row, index.year)) ?? fallbackYear;
    const semester = parseSemester(cell(row, index.semester)) ?? fallbackSemester;
    const credits = parseDecimal(cell(row, index.credits), 0, 30) ?? 0;
    const gradePoint = parseDecimal(cell(row, index.point), 0, 5);
    return [{
      id: `grade-csv-${Date.now()}-${rowIndex}`,
      courseCode: cell(row, index.code).slice(0, 120),
      courseName,
      academicYear,
      semester,
      score,
      credits,
      gradePoint,
      category: cell(row, index.category).slice(0, 80) || undefined,
      source: "csv" as const,
      updatedAt: new Date().toISOString(),
    }];
  });
  if (!records.length) throw new Error("成绩文件中没有可识别的有效记录");
  return records;
}

export function mergeGrades(existing: GradeRecord[], incoming: GradeRecord[]): GradeRecord[] {
  const map = new Map(existing.map((record) => [gradeIdentity(record), record]));
  for (const record of incoming) map.set(gradeIdentity(record), record);
  return [...map.values()].sort((left, right) => right.academicYear - left.academicYear || right.semester - left.semester || left.courseName.localeCompare(right.courseName, "zh-CN"));
}

function parseGrade(value: unknown): GradeRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = clean(value.id, 120);
  const courseName = clean(value.courseName, 160);
  const score = clean(value.score, 40);
  const academicYear = integer(value.academicYear, 2000, 2100);
  const semester = integer(value.semester, 1, 2) as 1 | 2 | undefined;
  const credits = decimal(value.credits, 0, 30);
  if (!id || !courseName || !score || !academicYear || !semester || credits === undefined) return undefined;
  return {
    id,
    courseCode: clean(value.courseCode, 120),
    courseName,
    academicYear,
    semester,
    score,
    credits,
    gradePoint: decimal(value.gradePoint, 0, 5),
    category: clean(value.category, 80) || undefined,
    source: value.source === "school" ? "school" : value.source === "csv" ? "csv" : "manual",
    updatedAt: safeIso(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cellValue += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cellValue.trim());
      cellValue = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cellValue.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cellValue = "";
    } else cellValue += char;
  }
  row.push(cellValue.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.slice(0, 2_001);
}

function findHeader(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_\-()（）]/g, "");
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

function parseYear(value: string): number | undefined {
  const match = value.match(/20\d{2}/);
  return match ? integer(Number(match[0]), 2000, 2100) : undefined;
}

function parseSemester(value: string): 1 | 2 | undefined {
  if (/^(1|一|秋|上)/.test(value)) return 1;
  if (/^(2|二|春|下)/.test(value)) return 2;
  return undefined;
}

function parseDecimal(value: string, min: number, max: number): number | undefined {
  if (!value) return undefined;
  return decimal(Number(value), min, max);
}

function gradeIdentity(record: GradeRecord): string {
  return `${record.academicYear}|${record.semester}|${record.courseCode || record.courseName}`.toLowerCase();
}

function scoreBand(score: string): number {
  return { 优秀: 95, 优: 95, 良好: 82, 良: 82, 中等: 70, 中: 70, 及格: 60, 合格: 60, 通过: 60 }[score.trim()] ?? 0;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function decimal(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 100) / 100 : undefined;
}

function safeIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
