// services/CacheManager.gs — Wrapper around GAS CacheService
// Handles JSON serialization, TTL, namespacing, and safe over-size values.

const CacheManager = (() => {
  const NAMESPACE = 'newsy_';

  function _cache() {
    return CacheService.getScriptCache();
  }

  function _key(k) {
    return NAMESPACE + k;
  }

  // Returns parsed value or null on miss/error
  function get(key) {
    try {
      const raw = _cache().get(_key(key));
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // Stores value as JSON. Silently skips if value exceeds safe byte limit.
  function set(key, value, ttlSeconds) {
    try {
      const raw = JSON.stringify(value);
      if (raw.length > CONFIG.LIMITS.CACHE_VALUE_MAX_BYTES) return;
      _cache().put(_key(key), raw, ttlSeconds || 300);
    } catch (_) {
      // Cache failures are non-fatal
    }
  }

  function remove(key) {
    try { _cache().remove(_key(key)); } catch (_) {}
  }

  // Remove all keys matching a prefix (GAS doesn't support wildcard removal;
  // we track invalidation sets via PropertiesService for known prefixes).
  function removePrefix(prefix) {
    // Best-effort: just remove the specific well-known keys for this prefix.
    const knownSuffixes = ['list', 'data', 'stats', 'search'];
    const fullPrefix = _key(prefix);
    knownSuffixes.forEach((s) => {
      try { _cache().remove(fullPrefix + '_' + s); } catch (_) {}
    });
  }

  // Returns cached value, or computes + caches it.
  function getOrCompute(key, fn, ttlSeconds) {
    const cached = get(key);
    if (cached !== null) return cached;
    const result = fn();
    set(key, result, ttlSeconds);
    return result;
  }

  return { get, set, remove, removePrefix, getOrCompute };
})();
