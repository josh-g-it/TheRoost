use std::collections::HashMap;

use chrono::{Datelike, NaiveDate, Utc};

use crate::models::recap::*;
use crate::services::cache_db::CacheDbHandle;
use crate::services::fun_comparisons;
use crate::utils::error::{AppError, MutexExt};

const DAY_NAMES: &[&str] = &[
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

/// Generate a monthly recap for the given year/month.
pub fn generate_monthly_recap(
    db: &CacheDbHandle,
    year: i32,
    month: u32,
) -> Result<RecapData, AppError> {
    let period_key = format!("{}-{:02}", year, month);

    let start_date = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::Validation("Invalid date".into()))?;
    let end_date = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .ok_or_else(|| AppError::Validation("Invalid end date".into()))?;

    let start_ts = start_date
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();
    let end_ts = end_date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();

    // Previous month range for trends
    let prev_start = if month == 1 {
        NaiveDate::from_ymd_opt(year - 1, 12, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month - 1, 1)
    }
    .ok_or_else(|| AppError::Validation("Invalid prev date".into()))?;
    let prev_start_ts = prev_start
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();

    compute_recap(
        db,
        &period_key,
        "monthly",
        start_ts,
        end_ts,
        prev_start_ts,
        start_ts,
    )
}

/// Generate a yearly recap for the given year.
pub fn generate_yearly_recap(db: &CacheDbHandle, year: i32) -> Result<RecapData, AppError> {
    let period_key = format!("{}", year);

    let start_date = NaiveDate::from_ymd_opt(year, 1, 1)
        .ok_or_else(|| AppError::Validation("Invalid year".into()))?;
    let end_date = NaiveDate::from_ymd_opt(year + 1, 1, 1)
        .ok_or_else(|| AppError::Validation("Invalid end year".into()))?;
    let start_ts = start_date
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();
    let end_ts = end_date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();

    // Previous year
    let prev_start = NaiveDate::from_ymd_opt(year - 1, 1, 1)
        .ok_or_else(|| AppError::Validation("Invalid prev year".into()))?;
    let prev_start_ts = prev_start
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();

    let mut recap = compute_recap(
        db,
        &period_key,
        "yearly",
        start_ts,
        end_ts,
        prev_start_ts,
        start_ts,
    )?;

    // Yearly-only: month-by-month playtime breakdown
    let db_guard = db.lock_or_err("DB")?;
    let mut monthly_playtime = vec![0u32; 12];
    for m in 1..=12u32 {
        let m_start = NaiveDate::from_ymd_opt(year, m, 1).unwrap();
        let m_end = if m == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
        } else {
            NaiveDate::from_ymd_opt(year, m + 1, 1).unwrap()
        };
        let m_start_ts = m_start.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
        let m_end_ts = m_end.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
        let sessions = db_guard.get_sessions_in_range(m_start_ts, m_end_ts)?;
        monthly_playtime[(m - 1) as usize] =
            sessions.iter().filter_map(|s| s.duration_minutes).sum();
    }
    drop(db_guard);
    recap.monthly_playtime = Some(monthly_playtime);

    Ok(recap)
}

/// Core computation shared between monthly and yearly recaps.
fn compute_recap(
    db: &CacheDbHandle,
    period_key: &str,
    period_type: &str,
    start_ts: i64,
    end_ts: i64,
    prev_start_ts: i64,
    prev_end_ts: i64,
) -> Result<RecapData, AppError> {
    // ── 1. Query data (brief lock acquisitions) ─────────────────────

    let (sessions, prev_sessions, achievements, first_sessions) = {
        let db_guard = db.lock_or_err("DB")?;
        let sessions = db_guard.get_sessions_in_range(start_ts, end_ts)?;
        let prev_sessions = db_guard.get_sessions_in_range(prev_start_ts, prev_end_ts)?;
        let achievements = db_guard.get_achievements_in_range(start_ts, end_ts)?;
        let first_sessions = db_guard.get_first_session_per_game()?;
        (sessions, prev_sessions, achievements, first_sessions)
    };

    // ── 2. Per-game aggregation ─────────────────────────────────────

    // (total_minutes, session_count, longest_session_minutes)
    let mut game_stats: HashMap<String, (u32, u32, u32)> = HashMap::new();
    let mut longest_session_minutes: u32 = 0;
    let mut longest_session_game_id = String::new();

    for s in &sessions {
        let dur = s.duration_minutes.unwrap_or(0);
        let entry = game_stats.entry(s.game_id.clone()).or_insert((0, 0, 0));
        entry.0 += dur;
        entry.1 += 1;
        if dur > entry.2 {
            entry.2 = dur;
        }
        if dur > longest_session_minutes {
            longest_session_minutes = dur;
            longest_session_game_id = s.game_id.clone();
        }
    }

    let total_minutes: u32 = game_stats.values().map(|(m, _, _)| m).sum();
    let total_sessions = sessions.len() as u32;
    let unique_games_played = game_stats.len() as u32;
    let avg_session_minutes = if total_sessions > 0 {
        total_minutes / total_sessions
    } else {
        0
    };

    let prev_period_minutes: u32 = prev_sessions
        .iter()
        .filter_map(|s| s.duration_minutes)
        .sum();

    // ── 3. Get game names ───────────────────────────────────────────

    let game_ids: Vec<String> = game_stats.keys().cloned().collect();
    let name_map: HashMap<String, String> = {
        let db_guard = db.lock_or_err("DB")?;
        let mut names: HashMap<String, String> = db_guard
            .get_game_names_bulk(&game_ids)?
            .into_iter()
            .collect();
        // Also get name for longest session game if not in game_stats
        if !longest_session_game_id.is_empty() && !names.contains_key(&longest_session_game_id) {
            if let Ok(bulk) = db_guard.get_game_names_bulk(&[longest_session_game_id.clone()]) {
                for (id, name) in bulk {
                    names.insert(id, name);
                }
            }
        }
        names
    };

    let get_name = |id: &str| -> String {
        name_map
            .get(id)
            .cloned()
            .unwrap_or_else(|| "Unknown Game".to_string())
    };

    // ── 4. Top games ────────────────────────────────────────────────

    let mut top_games_sorted: Vec<(&String, &(u32, u32, u32))> = game_stats.iter().collect();
    top_games_sorted.sort_by(|a, b| b.1 .0.cmp(&a.1 .0));

    let top_games: Vec<RecapTopGame> = top_games_sorted
        .iter()
        .take(5)
        .map(|(id, (mins, sess, _))| RecapTopGame {
            game_id: (*id).clone(),
            name: get_name(id),
            minutes: *mins,
            sessions: *sess,
        })
        .collect();

    let top_game = top_games.first().cloned().unwrap_or(RecapTopGame {
        game_id: String::new(),
        name: "No games played".to_string(),
        minutes: 0,
        sessions: 0,
    });

    let longest_session_game_name = get_name(&longest_session_game_id);

    // ── 5. Day of week ──────────────────────────────────────────────

    let mut dow_minutes = [0u32; 7]; // Mon=0 .. Sun=6
    for s in &sessions {
        let dur = s.duration_minutes.unwrap_or(0);
        let dt = chrono::DateTime::from_timestamp(s.start_time, 0);
        if let Some(dt) = dt {
            let dow = dt.weekday().num_days_from_monday() as usize; // Mon=0..Sun=6
            dow_minutes[dow] += dur;
        }
    }

    let busiest_idx = dow_minutes
        .iter()
        .enumerate()
        .max_by_key(|(_, m)| *m)
        .map(|(i, _)| i)
        .unwrap_or(0);

    let busiest_day = RecapBusiestDay {
        day: DAY_NAMES[busiest_idx].to_string(),
        minutes: dow_minutes[busiest_idx],
    };

    // ── 6. Play streak within the period ────────────────────────────

    let mut play_dates: Vec<NaiveDate> = sessions
        .iter()
        .filter_map(|s| chrono::DateTime::from_timestamp(s.start_time, 0).map(|dt| dt.date_naive()))
        .collect();
    play_dates.sort();
    play_dates.dedup();

    let longest_streak_days = if play_dates.is_empty() {
        0
    } else {
        let mut max_streak = 1u32;
        let mut current_streak = 1u32;
        for i in 1..play_dates.len() {
            let diff = play_dates[i]
                .signed_duration_since(play_dates[i - 1])
                .num_days();
            if diff == 1 {
                current_streak += 1;
                if current_streak > max_streak {
                    max_streak = current_streak;
                }
            } else {
                current_streak = 1;
            }
        }
        max_streak
    };

    // ── 7. Genre breakdown ──────────────────────────────────────────

    let genre_breakdown = {
        let db_guard = db.lock_or_err("DB")?;
        let genre_data = db_guard.get_genres_for_games(&game_ids)?;
        drop(db_guard);

        compute_genre_breakdown(&genre_data, &game_stats, total_minutes)
    };

    // ── 8. New discoveries ──────────────────────────────────────────

    let first_session_map: HashMap<String, i64> = first_sessions.into_iter().collect();
    let new_discoveries: Vec<RecapDiscovery> = game_ids
        .iter()
        .filter(|id| {
            first_session_map
                .get(*id)
                .map(|ts| *ts >= start_ts && *ts < end_ts)
                .unwrap_or(false)
        })
        .map(|id| RecapDiscovery {
            game_id: id.clone(),
            name: get_name(id),
        })
        .collect();

    // ── 9. Achievement highlights ───────────────────────────────────

    let achievements_unlocked = achievements.len() as u32;
    let mut notable_achievements: Vec<RecapAchievement> = achievements
        .iter()
        .map(|(game_id, a)| {
            let rarity = a.global_percent.unwrap_or(100.0);
            RecapAchievement {
                game_name: get_name(game_id),
                achievement_name: a.display_name.clone(),
                rarity,
            }
        })
        .collect();
    // Sort by rarity ascending (rarest first)
    notable_achievements.sort_by(|a, b| {
        a.rarity
            .partial_cmp(&b.rarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    notable_achievements.truncate(5);

    // ── 10. Fun comparisons ─────────────────────────────────────────

    let fun_comparisons = fun_comparisons::pick_comparisons(total_minutes);

    // ── Build result ────────────────────────────────────────────────

    Ok(RecapData {
        version: 1,
        period_type: period_type.to_string(),
        period_key: period_key.to_string(),
        generated_at: Utc::now().timestamp(),
        total_minutes,
        total_sessions,
        unique_games_played,
        avg_session_minutes,
        longest_session_minutes,
        longest_session_game_id,
        longest_session_game_name,
        longest_streak_days,
        top_game,
        top_games,
        genre_breakdown,
        busiest_day,
        prev_period_minutes,
        new_discoveries,
        achievements_unlocked,
        notable_achievements,
        fun_comparisons,
        monthly_playtime: None,
    })
}

/// Compute genre percentage breakdown from genres JSON and per-game playtime.
fn compute_genre_breakdown(
    genre_data: &[(String, String)],
    game_stats: &HashMap<String, (u32, u32, u32)>,
    total_minutes: u32,
) -> Vec<RecapGenreEntry> {
    use crate::models::metadata::GenreInfo;

    let mut genre_minutes: HashMap<String, u32> = HashMap::new();

    for (game_id, genres_json) in genre_data {
        let minutes = game_stats.get(game_id).map(|(m, _, _)| *m).unwrap_or(0);
        if minutes == 0 {
            continue;
        }

        if let Ok(genres) = serde_json::from_str::<Vec<GenreInfo>>(genres_json) {
            if genres.is_empty() {
                *genre_minutes.entry("Other".to_string()).or_insert(0) += minutes;
            } else {
                // Split playtime equally among the game's genres
                let per_genre = minutes / genres.len() as u32;
                let remainder = minutes % genres.len() as u32;
                for (i, g) in genres.iter().enumerate() {
                    let m = per_genre + if i == 0 { remainder } else { 0 };
                    *genre_minutes.entry(g.description.clone()).or_insert(0) += m;
                }
            }
        } else {
            *genre_minutes.entry("Other".to_string()).or_insert(0) += minutes;
        }
    }

    // Games with no metadata at all
    for (game_id, (mins, _, _)) in game_stats {
        if *mins > 0 && !genre_data.iter().any(|(id, _)| id == game_id) {
            *genre_minutes.entry("Other".to_string()).or_insert(0) += mins;
        }
    }

    let mut breakdown: Vec<RecapGenreEntry> = genre_minutes
        .into_iter()
        .map(|(genre, minutes)| {
            let percentage = if total_minutes > 0 {
                (minutes as f64 / total_minutes as f64) * 100.0
            } else {
                0.0
            };
            RecapGenreEntry {
                genre,
                minutes,
                percentage: (percentage * 10.0).round() / 10.0,
            }
        })
        .collect();

    breakdown.sort_by(|a, b| b.minutes.cmp(&a.minutes));
    breakdown.truncate(10); // Top 10 genres
    breakdown
}

/// Called once at app launch. Checks if a recap is due and generates it silently.
pub fn auto_generate_if_needed(db: &CacheDbHandle) {
    let now = Utc::now();
    let last_month = if now.month() == 1 {
        (now.year() - 1, 12u32)
    } else {
        (now.year(), now.month() - 1)
    };
    let period_key = format!("{}-{:02}", last_month.0, last_month.1);

    // Check if last month's recap already exists
    let exists = {
        let db_guard = match db.lock_or_err("DB") {
            Ok(g) => g,
            Err(e) => {
                tracing::warn!(error = %e, "Recap auto-gen: DB lock failed");
                return;
            }
        };
        db_guard.get_recap(&period_key).unwrap_or(None).is_some()
    };

    if !exists {
        tracing::info!(period_key = %period_key, "Auto-generating monthly recap");
        match generate_monthly_recap(db, last_month.0, last_month.1) {
            Ok(recap) => {
                if let Ok(g) = db.lock_or_err("DB") {
                    let _ = g.save_recap(&period_key, "monthly", &recap);
                }
                tracing::info!(period_key = %period_key, "Monthly recap auto-generated");
            }
            Err(e) => {
                tracing::warn!(period_key = %period_key, error = %e, "Failed to auto-generate monthly recap");
            }
        }
    }

    // If we're in January or February, also generate the previous year's annual recap
    if now.month() <= 2 {
        let year = now.year() - 1;
        let year_key = format!("{}", year);
        let year_exists = {
            let db_guard = match db.lock_or_err("DB") {
                Ok(g) => g,
                Err(_) => return,
            };
            db_guard.get_recap(&year_key).unwrap_or(None).is_some()
        };

        if !year_exists {
            tracing::info!(year_key = %year_key, "Auto-generating yearly recap");
            match generate_yearly_recap(db, year) {
                Ok(recap) => {
                    if let Ok(g) = db.lock_or_err("DB") {
                        let _ = g.save_recap(&year_key, "yearly", &recap);
                    }
                    tracing::info!(year_key = %year_key, "Yearly recap auto-generated");
                }
                Err(e) => {
                    tracing::warn!(year_key = %year_key, error = %e, "Failed to auto-generate yearly recap");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::cache_db::{CacheDb, CacheDbHandle};
    use std::sync::{Arc, Mutex};

    fn make_test_db_handle() -> CacheDbHandle {
        let dir = std::env::temp_dir().join(format!(
            "theroost_recap_test_{}_{:?}_{}",
            std::process::id(),
            std::thread::current().id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test.db");
        let db = CacheDb::new(&path).unwrap();
        Arc::new(Mutex::new(db))
    }

    /// Helper: register a game and insert a completed session.
    fn insert_session(
        db: &CacheDbHandle,
        game_name: &str,
        source_id: &str,
        start_time: i64,
        duration_minutes: u32,
    ) -> String {
        let guard = db.lock().unwrap();
        let game_id = guard.register_game("steam", source_id, game_name).unwrap();
        let session_id = guard.start_session(&game_id, start_time).unwrap();
        let end_time = start_time + (duration_minutes as i64) * 60;
        guard
            .close_session(session_id, end_time, duration_minutes)
            .unwrap();
        game_id
    }

    #[test]
    fn test_generate_monthly_recap_with_sessions() {
        let db = make_test_db_handle();

        // January 2025 timestamps
        // Jan 5, 2025 12:00 UTC
        let jan5 = chrono::NaiveDate::from_ymd_opt(2025, 1, 5)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        // Jan 15, 2025 18:00 UTC
        let jan15 = chrono::NaiveDate::from_ymd_opt(2025, 1, 15)
            .unwrap()
            .and_hms_opt(18, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        // Jan 20, 2025 10:00 UTC
        let jan20 = chrono::NaiveDate::from_ymd_opt(2025, 1, 20)
            .unwrap()
            .and_hms_opt(10, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();

        // Insert 3 sessions across 2 games in January 2025
        let game_a = insert_session(&db, "Alpha Game", "100", jan5, 60);
        let _game_b = insert_session(&db, "Beta Game", "200", jan15, 90);
        // Another session for game_a
        {
            let guard = db.lock().unwrap();
            let sid = guard.start_session(&game_a, jan20).unwrap();
            guard.close_session(sid, jan20 + 120 * 60, 120).unwrap();
        }

        let recap = generate_monthly_recap(&db, 2025, 1).unwrap();

        assert_eq!(recap.period_key, "2025-01");
        assert_eq!(recap.period_type, "monthly");
        assert_eq!(recap.version, 1);

        // 60 + 90 + 120 = 270 total minutes
        assert_eq!(recap.total_minutes, 270);
        assert_eq!(recap.total_sessions, 3);
        assert_eq!(recap.unique_games_played, 2);

        // avg = 270 / 3 = 90
        assert_eq!(recap.avg_session_minutes, 90);

        // Longest session is 120 minutes (game_a on jan20)
        assert_eq!(recap.longest_session_minutes, 120);
        assert_eq!(recap.longest_session_game_id, game_a);

        // Top game: game_a has 180 min (60+120), game_b has 90 min
        assert_eq!(recap.top_game.game_id, game_a);
        assert_eq!(recap.top_game.name, "Alpha Game");
        assert_eq!(recap.top_game.minutes, 180);
        assert_eq!(recap.top_game.sessions, 2);

        assert_eq!(recap.top_games.len(), 2);

        // No previous month data
        assert_eq!(recap.prev_period_minutes, 0);

        // monthly_playtime should be None for monthly recaps
        assert!(recap.monthly_playtime.is_none());
    }

    #[test]
    fn test_generate_monthly_recap_empty() {
        let db = make_test_db_handle();

        // Generate recap for a month with no sessions at all
        let recap = generate_monthly_recap(&db, 2025, 3).unwrap();

        assert_eq!(recap.period_key, "2025-03");
        assert_eq!(recap.period_type, "monthly");
        assert_eq!(recap.total_minutes, 0);
        assert_eq!(recap.total_sessions, 0);
        assert_eq!(recap.unique_games_played, 0);
        assert_eq!(recap.avg_session_minutes, 0);
        assert_eq!(recap.longest_session_minutes, 0);
        assert_eq!(recap.longest_streak_days, 0);
        assert_eq!(recap.top_game.name, "No games played");
        assert_eq!(recap.top_game.minutes, 0);
        assert!(recap.top_games.is_empty());
        assert!(recap.genre_breakdown.is_empty());
        assert!(recap.new_discoveries.is_empty());
        assert_eq!(recap.achievements_unlocked, 0);
        assert!(recap.notable_achievements.is_empty());
        assert!(recap.fun_comparisons.is_empty());
        assert!(recap.monthly_playtime.is_none());
    }
}
