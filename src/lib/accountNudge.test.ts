import { describe, expect, it } from 'vitest';
import { accountNudgeDue } from './accountNudge';

describe('guest account invitation', () => {
  const today = '2026-11-15';
  it('waits for two attempts and excludes linked or unavailable accounts', () => {
    expect(accountNudgeDue('anon', 1, today, null, today)).toBe(false);
    expect(accountNudgeDue('anon', 2, today, null, today)).toBe(true);
    for (const status of ['linked', 'offline', 'connecting', 'error']) {
      expect(accountNudgeDue(status, 5, today, null, today)).toBe(false);
    }
  });
  it('stays hidden on the same UTC day and becomes eligible tomorrow', () => {
    expect(accountNudgeDue('anon', 5, today, today, today)).toBe(false);
    expect(accountNudgeDue('anon', 2, '2026-11-16', today, '2026-11-16')).toBe(true);
  });
  it('does not interrupt a replay of a previous day', () => {
    expect(accountNudgeDue('anon', 5, '2026-11-14', null, today)).toBe(false);
  });
});
