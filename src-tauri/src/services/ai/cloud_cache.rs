use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::models::ai::ResolvedIntent;

const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes
const MAX_ENTRIES: usize = 100;

/// Simple in-memory LRU query cache for cloud AI results.
pub struct CloudQueryCache {
    entries: Mutex<HashMap<u64, CacheEntry>>,
}

struct CacheEntry {
    result: ResolvedIntent,
    created: Instant,
}

impl CloudQueryCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Look up a cached result for the given query. Returns None on miss or expiry.
    pub fn get(&self, query: &str) -> Option<ResolvedIntent> {
        let key = hash_query(query);
        let mut entries = self.entries.lock().ok()?;
        if let Some(entry) = entries.get(&key) {
            if entry.created.elapsed() < CACHE_TTL {
                return Some(entry.result.clone());
            }
            // Expired — remove it
            entries.remove(&key);
        }
        None
    }

    /// Store a result in the cache. Evicts oldest entry if at capacity.
    pub fn put(&self, query: &str, result: ResolvedIntent) {
        let key = hash_query(query);
        let mut entries = match self.entries.lock() {
            Ok(e) => e,
            Err(_) => return,
        };

        // Evict oldest entry if at capacity
        if entries.len() >= MAX_ENTRIES && !entries.contains_key(&key) {
            if let Some(&oldest_key) = entries
                .iter()
                .min_by_key(|(_, e)| e.created)
                .map(|(k, _)| k)
            {
                entries.remove(&oldest_key);
            }
        }

        entries.insert(
            key,
            CacheEntry {
                result,
                created: Instant::now(),
            },
        );
    }
}

/// FNV-1a hash of the normalized query string.
fn hash_query(query: &str) -> u64 {
    let normalized = query.to_lowercase();
    let trimmed = normalized.trim();
    let mut hasher = std::hash::DefaultHasher::new();
    trimmed.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::{IntentAction, ResolutionTier};

    fn make_intent(summary: &str) -> ResolvedIntent {
        ResolvedIntent {
            actions: vec![IntentAction {
                action_id: "nav:library".into(),
                game_id: None,
                description: "Go to library".into(),
            }],
            tier: ResolutionTier::CloudApi,
            confidence: 0.8,
            summary: summary.into(),
            original_query: "test".into(),
        }
    }

    #[test]
    fn test_cache_hit() {
        let cache = CloudQueryCache::new();
        let intent = make_intent("test result");
        cache.put("hello world", intent.clone());
        let result = cache.get("hello world");
        assert!(result.is_some());
        assert_eq!(result.unwrap().summary, "test result");
    }

    #[test]
    fn test_cache_miss() {
        let cache = CloudQueryCache::new();
        assert!(cache.get("nonexistent").is_none());
    }

    #[test]
    fn test_cache_case_insensitive() {
        let cache = CloudQueryCache::new();
        cache.put("Hello World", make_intent("hi"));
        assert!(cache.get("hello world").is_some());
        assert!(cache.get("HELLO WORLD").is_some());
    }

    #[test]
    fn test_cache_eviction_at_capacity() {
        let cache = CloudQueryCache::new();
        // Fill to capacity
        for i in 0..MAX_ENTRIES {
            cache.put(&format!("query {i}"), make_intent(&format!("result {i}")));
        }
        // Add one more — should evict oldest
        cache.put("overflow query", make_intent("overflow"));
        let entries = cache.entries.lock().unwrap();
        assert_eq!(entries.len(), MAX_ENTRIES);
    }
}
