/** One invitation per UTC game day, including across reloads and tabs. */
export const ACCOUNT_NUDGE_KEY = 'skillissue:extra-tries-nudge-day';
let memoryDay: string | null = null;

export function accountNudgeDue(status: string, attempts: number, date: string, lastShownDay: string | null, today: string): boolean {
  return status === 'anon' && attempts >= 5 && date === today && lastShownDay !== today;
}

export function lastAccountNudgeDay(): string | null {
  try { return localStorage.getItem(ACCOUNT_NUDGE_KEY) ?? memoryDay; }
  catch { return memoryDay; }
}

export function markAccountNudgeShown(date: string): void {
  memoryDay = date;
  try { localStorage.setItem(ACCOUNT_NUDGE_KEY, date); }
  catch { /* Keep the cooldown for this tab when storage is unavailable. */ }
}
