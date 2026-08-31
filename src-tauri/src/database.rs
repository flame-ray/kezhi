use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, sync::Mutex, time::Duration};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScheduleSnapshot {
    pub courses: Vec<CourseMeeting>,
    pub presets: Vec<TimetablePreset>,
    pub active_preset_id: String,
    pub school_name: Option<String>,
    pub school_id: Option<String>,
    pub account_id: Option<String>,
    pub academic_year: Option<u16>,
    pub semester: Option<u8>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CourseMeeting {
    pub id: String,
    pub course_code: String,
    pub title: String,
    pub teacher: String,
    pub location: String,
    pub day: u8,
    pub start_period: u8,
    pub end_period: u8,
    pub weeks: Vec<u8>,
    pub color: String,
    pub status: Option<String>,
    pub note: Option<String>,
    pub source: Option<String>,
    pub source_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TimetablePreset {
    pub id: String,
    pub name: String,
    pub periods: Vec<Period>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct Period {
    pub index: u8,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalAccountProfile {
    pub id: String,
    pub school_id: String,
    #[serde(default)]
    pub login_name: String,
    pub label: String,
    pub created_at: String,
}

pub(crate) struct ScheduleStore {
    connection: Mutex<Connection>,
}

impl ScheduleStore {
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(database_error)?;
        Self::from_connection(connection)
    }

    fn from_connection(connection: Connection) -> Result<Self, String> {
        connection
            .busy_timeout(Duration::from_secs(3))
            .map_err(database_error)?;
        connection.execute_batch(SCHEMA).map_err(database_error)?;
        migrate_schema(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub(crate) fn load(&self) -> Result<Option<ScheduleSnapshot>, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "本地数据库锁已损坏".to_string())?;
        load_snapshot(&connection)
    }

    pub(crate) fn save(&self, snapshot: &ScheduleSnapshot) -> Result<(), String> {
        validate_snapshot(snapshot)?;
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| "本地数据库锁已损坏".to_string())?;
        let transaction = connection.transaction().map_err(database_error)?;

        transaction
            .execute(
                "INSERT INTO schedule_state (
                    singleton, active_preset_id, school_name, school_id, account_id,
                    academic_year, semester, last_sync_at
                 ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(singleton) DO UPDATE SET
                    active_preset_id = excluded.active_preset_id,
                    school_name = excluded.school_name,
                    school_id = excluded.school_id,
                    account_id = excluded.account_id,
                    academic_year = excluded.academic_year,
                    semester = excluded.semester,
                    last_sync_at = excluded.last_sync_at",
                params![
                    snapshot.active_preset_id,
                    snapshot.school_name,
                    snapshot.school_id,
                    snapshot.account_id,
                    snapshot.academic_year,
                    snapshot.semester,
                    snapshot.last_sync_at,
                ],
            )
            .map_err(database_error)?;

        transaction
            .execute("DELETE FROM course_meetings", [])
            .map_err(database_error)?;
        for (position, course) in snapshot.courses.iter().enumerate() {
            let weeks_json =
                serde_json::to_string(&course.weeks).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO course_meetings (
                        id, course_code, title, teacher, location, day, start_period, end_period,
                        weeks_json, color, status, note, source, source_key, position
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                    params![
                        course.id,
                        course.course_code,
                        course.title,
                        course.teacher,
                        course.location,
                        course.day,
                        course.start_period,
                        course.end_period,
                        weeks_json,
                        course.color,
                        course.status,
                        course.note,
                        course.source,
                        course.source_key,
                        position as i64,
                    ],
                )
                .map_err(database_error)?;
        }

        transaction
            .execute("DELETE FROM timetable_presets", [])
            .map_err(database_error)?;
        for (position, preset) in snapshot.presets.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO timetable_presets (id, name, position) VALUES (?1, ?2, ?3)",
                    params![preset.id, preset.name, position as i64],
                )
                .map_err(database_error)?;
            for period in &preset.periods {
                transaction
                    .execute(
                        "INSERT INTO timetable_periods (preset_id, period_index, start_time, end_time)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![preset.id, period.index, period.start, period.end],
                    )
                    .map_err(database_error)?;
            }
        }

        transaction.commit().map_err(database_error)
    }

    pub(crate) fn load_accounts(&self) -> Result<Vec<LocalAccountProfile>, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "本地数据库锁已损坏".to_string())?;
        let mut statement = connection
            .prepare("SELECT id, school_id, login_name, label, created_at FROM local_accounts ORDER BY created_at, id")
            .map_err(database_error)?;
        let accounts = statement
            .query_map([], |row| {
                Ok(LocalAccountProfile {
                    id: row.get(0)?,
                    school_id: row.get(1)?,
                    login_name: row.get(2)?,
                    label: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        Ok(accounts)
    }

    pub(crate) fn save_account(&self, account: &LocalAccountProfile) -> Result<(), String> {
        validate_account(account)?;
        let connection = self
            .connection
            .lock()
            .map_err(|_| "本地数据库锁已损坏".to_string())?;
        connection
            .execute(
                "INSERT INTO local_accounts (id, school_id, login_name, label, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                    school_id = excluded.school_id,
                    login_name = excluded.login_name,
                    label = excluded.label,
                    created_at = excluded.created_at",
                params![
                    account.id,
                    account.school_id,
                    account.login_name,
                    account.label,
                    account.created_at
                ],
            )
            .map_err(database_error)?;
        Ok(())
    }
}

fn migrate_schema(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(local_accounts)")
        .map_err(database_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(database_error)?;
    let mut has_login_name = false;
    for column in columns {
        if column.map_err(database_error)? == "login_name" {
            has_login_name = true;
            break;
        }
    }
    drop(statement);

    if !has_login_name {
        connection
            .execute(
                "ALTER TABLE local_accounts ADD COLUMN login_name TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(database_error)?;
    }
    connection
        .execute(
            "UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'",
            [],
        )
        .map_err(database_error)?;
    Ok(())
}

fn load_snapshot(connection: &Connection) -> Result<Option<ScheduleSnapshot>, String> {
    let state = connection
        .query_row(
            "SELECT active_preset_id, school_name, school_id, account_id, academic_year, semester, last_sync_at
             FROM schedule_state WHERE singleton = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<u16>>(4)?,
                    row.get::<_, Option<u8>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?;
    let Some((
        active_preset_id,
        school_name,
        school_id,
        account_id,
        academic_year,
        semester,
        last_sync_at,
    )) = state
    else {
        return Ok(None);
    };

    let mut course_statement = connection
        .prepare(
            "SELECT id, course_code, title, teacher, location, day, start_period, end_period,
                    weeks_json, color, status, note, source, source_key
             FROM course_meetings ORDER BY position",
        )
        .map_err(database_error)?;
    let course_rows = course_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, u8>(5)?,
                row.get::<_, u8>(6)?,
                row.get::<_, u8>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<String>>(13)?,
            ))
        })
        .map_err(database_error)?;
    let mut courses = Vec::new();
    for row in course_rows {
        let (
            id,
            course_code,
            title,
            teacher,
            location,
            day,
            start_period,
            end_period,
            weeks_json,
            color,
            status,
            note,
            source,
            source_key,
        ) = row.map_err(database_error)?;
        let weeks = serde_json::from_str::<Vec<u8>>(&weeks_json)
            .map_err(|_| "本地数据库中的课程周次已损坏".to_string())?;
        courses.push(CourseMeeting {
            id,
            course_code,
            title,
            teacher,
            location,
            day,
            start_period,
            end_period,
            weeks,
            color,
            status,
            note,
            source,
            source_key,
        });
    }

    let mut preset_statement = connection
        .prepare("SELECT id, name FROM timetable_presets ORDER BY position")
        .map_err(database_error)?;
    let preset_rows = preset_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    let mut presets = Vec::new();
    for row in preset_rows {
        let (id, name) = row.map_err(database_error)?;
        let mut period_statement = connection
            .prepare(
                "SELECT period_index, start_time, end_time FROM timetable_periods
                 WHERE preset_id = ?1 ORDER BY period_index",
            )
            .map_err(database_error)?;
        let periods = period_statement
            .query_map([&id], |row| {
                Ok(Period {
                    index: row.get(0)?,
                    start: row.get(1)?,
                    end: row.get(2)?,
                })
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        presets.push(TimetablePreset { id, name, periods });
    }

    let snapshot = ScheduleSnapshot {
        courses,
        presets,
        active_preset_id,
        school_name,
        school_id,
        account_id,
        academic_year,
        semester,
        last_sync_at,
    };
    validate_snapshot(&snapshot)?;
    Ok(Some(snapshot))
}

fn validate_snapshot(snapshot: &ScheduleSnapshot) -> Result<(), String> {
    if snapshot.courses.len() > 5_000 {
        return Err("课程数量超过本地存储上限".into());
    }
    if snapshot.presets.is_empty() || snapshot.presets.len() > 50 {
        return Err("作息方案数量无效".into());
    }
    if !snapshot
        .presets
        .iter()
        .any(|preset| preset.id == snapshot.active_preset_id)
    {
        return Err("当前作息方案不存在".into());
    }
    if snapshot
        .academic_year
        .is_some_and(|year| !(2000..=2100).contains(&year))
        || snapshot
            .semester
            .is_some_and(|semester| !matches!(semester, 1 | 2))
    {
        return Err("学年或学期无效".into());
    }
    if snapshot
        .school_id
        .as_deref()
        .is_some_and(|value| !safe_identifier(value))
        || snapshot
            .account_id
            .as_deref()
            .is_some_and(|value| !safe_identifier(value))
    {
        return Err("学校或账号标识无效".into());
    }

    let mut course_ids = HashSet::new();
    for course in &snapshot.courses {
        if !course_ids.insert(course.id.as_str()) || !valid_text(&course.id, 200) {
            return Err("课程标识重复或无效".into());
        }
        if !valid_text(&course.course_code, 200)
            || !valid_text(&course.title, 200)
            || !valid_text(&course.teacher, 200)
            || !valid_text(&course.location, 200)
        {
            return Err(format!("课程“{}”包含无效文本", course.title));
        }
        if !(1..=7).contains(&course.day)
            || !(1..=30).contains(&course.start_period)
            || !(course.start_period..=30).contains(&course.end_period)
            || course.weeks.is_empty()
            || course.weeks.iter().any(|week| !(1..=30).contains(week))
        {
            return Err(format!("课程“{}”的时间无效", course.title));
        }
        if !matches!(
            course.color.as_str(),
            "blue" | "teal" | "coral" | "violet" | "rose" | "amber" | "indigo"
        ) || course
            .status
            .as_deref()
            .is_some_and(|value| !matches!(value, "normal" | "changed" | "cancelled"))
            || course
                .source
                .as_deref()
                .is_some_and(|value| !matches!(value, "local" | "school"))
        {
            return Err(format!("课程“{}”包含未知状态", course.title));
        }
    }

    let mut preset_ids = HashSet::new();
    for preset in &snapshot.presets {
        if !preset_ids.insert(preset.id.as_str())
            || !valid_text(&preset.id, 200)
            || !valid_text(&preset.name, 100)
            || preset.periods.is_empty()
            || preset.periods.len() > 30
        {
            return Err("作息方案格式无效".into());
        }
        let mut period_ids = HashSet::new();
        for period in &preset.periods {
            if !period_ids.insert(period.index)
                || !(1..=30).contains(&period.index)
                || !valid_time(&period.start)
                || !valid_time(&period.end)
            {
                return Err(format!("作息方案“{}”的节次无效", preset.name));
            }
        }
    }
    Ok(())
}

fn validate_account(account: &LocalAccountProfile) -> Result<(), String> {
    if !safe_identifier(&account.id)
        || !safe_identifier(&account.school_id)
        || account.login_name.chars().count() > 80
        || !valid_text(&account.label, 40)
        || account.created_at.is_empty()
        || account.created_at.len() > 64
    {
        return Err("本地账号档案格式无效".into());
    }
    Ok(())
}

fn safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

fn valid_time(value: &str) -> bool {
    let Some((hours, minutes)) = value.split_once(':') else {
        return false;
    };
    hours.len() == 2
        && minutes.len() == 2
        && hours.parse::<u8>().is_ok_and(|number| number <= 23)
        && minutes.parse::<u8>().is_ok_and(|number| number <= 59)
}

fn database_error(error: rusqlite::Error) -> String {
    format!("本地数据库错误：{error}")
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '2');

CREATE TABLE IF NOT EXISTS schedule_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    active_preset_id TEXT NOT NULL,
    school_name TEXT,
    school_id TEXT,
    account_id TEXT,
    academic_year INTEGER,
    semester INTEGER,
    last_sync_at TEXT
);

CREATE TABLE IF NOT EXISTS course_meetings (
    id TEXT PRIMARY KEY,
    course_code TEXT NOT NULL,
    title TEXT NOT NULL,
    teacher TEXT NOT NULL,
    location TEXT NOT NULL,
    day INTEGER NOT NULL,
    start_period INTEGER NOT NULL,
    end_period INTEGER NOT NULL,
    weeks_json TEXT NOT NULL,
    color TEXT NOT NULL,
    status TEXT,
    note TEXT,
    source TEXT,
    source_key TEXT,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_periods (
    preset_id TEXT NOT NULL REFERENCES timetable_presets(id) ON DELETE CASCADE,
    period_index INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    PRIMARY KEY (preset_id, period_index)
);

CREATE TABLE IF NOT EXISTS local_accounts (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    login_name TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> ScheduleSnapshot {
        ScheduleSnapshot {
            courses: vec![CourseMeeting {
                id: "course-1".into(),
                course_code: "MATH101".into(),
                title: "高等数学".into(),
                teacher: "林老师".into(),
                location: "A101".into(),
                day: 2,
                start_period: 1,
                end_period: 2,
                weeks: vec![1, 3, 5],
                color: "blue".into(),
                status: Some("normal".into()),
                note: Some("单周".into()),
                source: Some("school".into()),
                source_key: Some("class-1".into()),
            }],
            presets: vec![TimetablePreset {
                id: "summer".into(),
                name: "夏季作息".into(),
                periods: vec![
                    Period {
                        index: 1,
                        start: "08:20".into(),
                        end: "09:05".into(),
                    },
                    Period {
                        index: 2,
                        start: "09:10".into(),
                        end: "09:55".into(),
                    },
                ],
            }],
            active_preset_id: "summer".into(),
            school_name: Some("宁德师范学院".into()),
            school_id: Some("ndnu".into()),
            account_id: Some("account-1".into()),
            academic_year: Some(2026),
            semester: Some(1),
            last_sync_at: Some("2026-08-31T00:00:00.000Z".into()),
        }
    }

    fn memory_store() -> ScheduleStore {
        ScheduleStore::from_connection(Connection::open_in_memory().unwrap()).unwrap()
    }

    #[test]
    fn round_trips_a_normalized_snapshot() {
        let store = memory_store();
        let snapshot = sample_snapshot();
        store.save(&snapshot).unwrap();
        assert_eq!(store.load().unwrap(), Some(snapshot));
    }

    #[test]
    fn a_save_replaces_removed_rows_in_one_snapshot() {
        let store = memory_store();
        let mut snapshot = sample_snapshot();
        store.save(&snapshot).unwrap();
        snapshot.courses.clear();
        store.save(&snapshot).unwrap();
        assert!(store.load().unwrap().unwrap().courses.is_empty());
    }

    #[test]
    fn rejects_invalid_data_before_opening_a_transaction() {
        let store = memory_store();
        let mut snapshot = sample_snapshot();
        snapshot.courses[0].day = 9;
        assert!(store.save(&snapshot).unwrap_err().contains("时间无效"));
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn stores_multiple_local_account_profiles() {
        let store = memory_store();
        let first = LocalAccountProfile {
            id: "account-1".into(),
            school_id: "ndnu".into(),
            login_name: "20260001".into(),
            label: "主账号".into(),
            created_at: "2026-08-31T00:00:00.000Z".into(),
        };
        let second = LocalAccountProfile {
            id: "account-2".into(),
            school_id: "ndnu".into(),
            login_name: "20260002".into(),
            label: "备用账号".into(),
            created_at: "2026-08-31T00:01:00.000Z".into(),
        };
        store.save_account(&first).unwrap();
        store.save_account(&second).unwrap();
        assert_eq!(store.load_accounts().unwrap(), vec![first, second]);
    }

    #[test]
    fn migrates_legacy_account_profiles_without_losing_them() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE local_accounts (
                    id TEXT PRIMARY KEY,
                    school_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    created_at TEXT NOT NULL
                 );
                 INSERT INTO local_accounts (id, school_id, label, created_at)
                 VALUES ('legacy-1', 'ndnu', 'legacy', '2026-08-31T00:00:00.000Z');",
            )
            .unwrap();

        let store = ScheduleStore::from_connection(connection).unwrap();
        let accounts = store.load_accounts().unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, "legacy-1");
        assert_eq!(accounts[0].login_name, "");
        assert_eq!(accounts[0].label, "legacy");
    }
}
