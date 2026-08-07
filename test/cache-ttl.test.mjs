import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheManager } from '../dist/cache/cache-manager.js';

// Regression: the flat 24h TTL was incompatible with the 24h `today` window.
//
// Observed live — a `linkedin|today` row written 22h earlier held 127 jobs, all of which
// passed the 24h cut when cached and NONE of which passed it 22h later. The row was still
// "valid" by TTL, so it was served instead of re-scraped and `--today` collapsed to 3
// results across every source. A cache entry must not outlive the freshness of its own
// contents.
test('a today-window row may not be served for anywhere near the window length', () => {
  const ttl = cacheManager.effectiveTtlHours('today');
  assert.ok(ttl < 24, `today TTL must be well under the 24h window, got ${ttl}h`);
  assert.ok(ttl <= 24 * 0.05 + 1e-9, `today TTL must stay within 5% of the window, got ${ttl}h`);
});

test('TTL scales with the window so longer windows still cache usefully', () => {
  const today = cacheManager.effectiveTtlHours('today');
  const week = cacheManager.effectiveTtlHours('week');
  const month = cacheManager.effectiveTtlHours('month');
  assert.ok(today < week, 'week may be cached longer than today');
  assert.ok(week < month, 'month may be cached longer than week');
});

test('TTL never exceeds the configured global ceiling', () => {
  for (const w of ['today', 'week', 'month', undefined]) {
    assert.ok(cacheManager.effectiveTtlHours(w) <= 24, `window=${w} exceeded the 24h ceiling`);
  }
});

// The decay that motivated the cap: with the old flat TTL a row could consume ~92% of the
// window before expiring, leaving almost nothing inside it.
test('the served age consumes only a small fraction of the freshness window', () => {
  const windowHours = { today: 24, week: 24 * 7, month: 24 * 30 };
  for (const [w, hours] of Object.entries(windowHours)) {
    const consumed = cacheManager.effectiveTtlHours(w) / hours;
    assert.ok(consumed <= 0.05 + 1e-9, `window=${w} let a row consume ${(consumed * 100).toFixed(0)}% of it`);
  }
});
