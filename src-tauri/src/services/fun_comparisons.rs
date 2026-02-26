use crate::models::recap::RecapComparison;

struct KnownActivity {
    activity: &'static str,
    minutes: f64,
    emoji: &'static str,
    tier: u8,
}

const ACTIVITIES: &[KnownActivity] = &[
    // Tier 1: Quick activities (minutes)
    KnownActivity {
        activity: "cups of coffee brewed",
        minutes: 5.0,
        emoji: "\u{2615}",
        tier: 1,
    },
    KnownActivity {
        activity: "hard-boiled eggs cooked",
        minutes: 12.0,
        emoji: "\u{1F95A}",
        tier: 1,
    },
    KnownActivity {
        activity: "power naps",
        minutes: 20.0,
        emoji: "\u{1F4A4}",
        tier: 1,
    },
    KnownActivity {
        activity: "TED talks watched",
        minutes: 18.0,
        emoji: "\u{1F3A4}",
        tier: 1,
    },
    KnownActivity {
        activity: "sitcom episodes",
        minutes: 22.0,
        emoji: "\u{1F4FA}",
        tier: 1,
    },
    KnownActivity {
        activity: "yoga sessions",
        minutes: 30.0,
        emoji: "\u{1F9D8}",
        tier: 1,
    },
    KnownActivity {
        activity: "5K runs",
        minutes: 30.0,
        emoji: "\u{1F3C3}",
        tier: 1,
    },
    KnownActivity {
        activity: "loads of laundry",
        minutes: 45.0,
        emoji: "\u{1F9FA}",
        tier: 1,
    },
    KnownActivity {
        activity: "piano practice sessions",
        minutes: 45.0,
        emoji: "\u{1F3B9}",
        tier: 1,
    },
    KnownActivity {
        activity: "podcast episodes",
        minutes: 50.0,
        emoji: "\u{1F3A7}",
        tier: 1,
    },
    // Tier 2: Medium activities (hours)
    KnownActivity {
        activity: "soccer matches",
        minutes: 90.0,
        emoji: "\u{26BD}",
        tier: 2,
    },
    KnownActivity {
        activity: "feature films",
        minutes: 120.0,
        emoji: "\u{1F3AC}",
        tier: 2,
    },
    KnownActivity {
        activity: "rounds of golf",
        minutes: 240.0,
        emoji: "\u{26F3}",
        tier: 2,
    },
    KnownActivity {
        activity: "NBA games",
        minutes: 150.0,
        emoji: "\u{1F3C0}",
        tier: 2,
    },
    KnownActivity {
        activity: "Marvel movies",
        minutes: 150.0,
        emoji: "\u{1F9B8}",
        tier: 2,
    },
    KnownActivity {
        activity: "escape room attempts",
        minutes: 60.0,
        emoji: "\u{1F510}",
        tier: 2,
    },
    KnownActivity {
        activity: "museum visits",
        minutes: 120.0,
        emoji: "\u{1F3DB}",
        tier: 2,
    },
    KnownActivity {
        activity: "Monopoly games",
        minutes: 180.0,
        emoji: "\u{1F3B2}",
        tier: 2,
    },
    KnownActivity {
        activity: "Thanksgiving dinners cooked",
        minutes: 300.0,
        emoji: "\u{1F983}",
        tier: 2,
    },
    KnownActivity {
        activity: "spa days",
        minutes: 360.0,
        emoji: "\u{1F6C1}",
        tier: 2,
    },
    KnownActivity {
        activity: "skiing day trips",
        minutes: 420.0,
        emoji: "\u{26F7}",
        tier: 2,
    },
    KnownActivity {
        activity: "hikes up Half Dome",
        minutes: 600.0,
        emoji: "\u{26F0}",
        tier: 2,
    },
    KnownActivity {
        activity: "IKEA furniture assemblies",
        minutes: 180.0,
        emoji: "\u{1FA91}",
        tier: 2,
    },
    KnownActivity {
        activity: "full seasons of a sitcom",
        minutes: 440.0,
        emoji: "\u{1F4FA}",
        tier: 2,
    },
    // Tier 3: Long activities (days+)
    KnownActivity {
        activity: "flights from NYC to Tokyo",
        minutes: 840.0,
        emoji: "\u{2708}",
        tier: 3,
    },
    KnownActivity {
        activity: "flights from NYC to London",
        minutes: 420.0,
        emoji: "\u{1F1EC}\u{1F1E7}",
        tier: 3,
    },
    KnownActivity {
        activity: "road trips down Route 66",
        minutes: 2400.0,
        emoji: "\u{1F697}",
        tier: 3,
    },
    KnownActivity {
        activity: "full read-throughs of War and Peace",
        minutes: 3600.0,
        emoji: "\u{1F4D6}",
        tier: 3,
    },
    KnownActivity {
        activity: "binge-watches of Breaking Bad",
        minutes: 3720.0,
        emoji: "\u{2697}",
        tier: 3,
    },
    KnownActivity {
        activity: "binge-watches of The Office",
        minutes: 4400.0,
        emoji: "\u{1F4CB}",
        tier: 3,
    },
    KnownActivity {
        activity: "Appalachian Trail thru-hikes",
        minutes: 259200.0,
        emoji: "\u{1F6B6}",
        tier: 3,
    },
    KnownActivity {
        activity: "ascents of Mount Everest from base camp",
        minutes: 8640.0,
        emoji: "\u{1F3D4}",
        tier: 3,
    },
    KnownActivity {
        activity: "transatlantic sailing voyages",
        minutes: 20160.0,
        emoji: "\u{26F5}",
        tier: 3,
    },
    KnownActivity {
        activity: "full listens of every Beatles album",
        minutes: 630.0,
        emoji: "\u{1F3B5}",
        tier: 3,
    },
    KnownActivity {
        activity: "tours of every Smithsonian museum",
        minutes: 4800.0,
        emoji: "\u{1F3DB}",
        tier: 3,
    },
    KnownActivity {
        activity: "trips around the world by train",
        minutes: 30240.0,
        emoji: "\u{1F682}",
        tier: 3,
    },
    KnownActivity {
        activity: "scuba certifications",
        minutes: 1800.0,
        emoji: "\u{1F93F}",
        tier: 3,
    },
    KnownActivity {
        activity: "marathon training programs",
        minutes: 6000.0,
        emoji: "\u{1F3C5}",
        tier: 3,
    },
    KnownActivity {
        activity: "full rewatches of Lord of the Rings extended",
        minutes: 682.0,
        emoji: "\u{1F48D}",
        tier: 3,
    },
    KnownActivity {
        activity: "cross-country bike tours",
        minutes: 14400.0,
        emoji: "\u{1F6B4}",
        tier: 3,
    },
];

/// Pick 2-5 fun comparisons scaled to the given total playtime.
pub fn pick_comparisons(total_minutes: u32) -> Vec<RecapComparison> {
    if total_minutes == 0 {
        return Vec::new();
    }

    let total = total_minutes as f64;

    // Score each activity
    let mut scored: Vec<(usize, f64, f64)> = ACTIVITIES
        .iter()
        .enumerate()
        .filter_map(|(i, a)| {
            let count = total / a.minutes;
            if !(0.8..=999.0).contains(&count) {
                return None;
            }

            // Prefer counts in the 2-50 range with near-whole numbers
            let range_score = if (2.0..=50.0).contains(&count) {
                1.0
            } else if (1.0..2.0).contains(&count) || (50.0..200.0).contains(&count) {
                0.7
            } else {
                0.4
            };

            // Bonus for near-whole numbers
            let frac = count.fract();
            let whole_score = if !(0.15..=0.85).contains(&frac) {
                1.0
            } else {
                0.6
            };

            let score = range_score * whole_score;
            Some((i, score, count))
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Pick up to 2 from each tier, max 5 total
    let mut result = Vec::new();
    let mut tier_counts = [0u8; 4]; // index 1-3

    for (i, _score, count) in &scored {
        let tier = ACTIVITIES[*i].tier as usize;
        if tier_counts[tier] >= 2 {
            continue;
        }

        let display_count = if *count >= 10.0 {
            count.round()
        } else {
            (count * 10.0).round() / 10.0
        };

        result.push(RecapComparison {
            activity: ACTIVITIES[*i].activity.to_string(),
            count: display_count,
            emoji: ACTIVITIES[*i].emoji.to_string(),
        });
        tier_counts[tier] += 1;

        if result.len() >= 5 {
            break;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_playtime_returns_empty() {
        assert!(pick_comparisons(0).is_empty());
    }

    #[test]
    fn test_low_playtime_returns_results() {
        let comps = pick_comparisons(60); // 1 hour
        assert!(!comps.is_empty());
        assert!(comps.len() <= 5);
        for c in &comps {
            assert!(c.count > 0.0);
        }
    }

    #[test]
    fn test_medium_playtime() {
        let comps = pick_comparisons(600); // 10 hours
        assert!(comps.len() >= 2);
        assert!(comps.len() <= 5);
    }

    #[test]
    fn test_high_playtime() {
        let comps = pick_comparisons(10000); // ~167 hours
        assert!(comps.len() >= 2);
        assert!(comps.len() <= 5);
    }

    #[test]
    fn test_very_high_playtime() {
        let comps = pick_comparisons(100000); // ~1667 hours
        assert!(!comps.is_empty());
        assert!(comps.len() <= 5);
    }

    #[test]
    fn test_counts_are_reasonable() {
        let comps = pick_comparisons(1200); // 20 hours
        for c in &comps {
            assert!(c.count >= 0.8);
            assert!(c.count <= 999.0);
            assert!(!c.activity.is_empty());
            assert!(!c.emoji.is_empty());
        }
    }
}
