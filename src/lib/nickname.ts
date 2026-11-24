export const NICKNAME_RULES = 'Use 1–15 letters, numbers, spaces, _ or -. Start with a letter or number. No links, email addresses or offensive names.';

// Keep both lists in sync with public.nickname_blocked() in
// supabase/migrations/20261124010000_nickname_blocklist.sql.
/** Blocked anywhere in the name, even when glued to other words ("xXHitlerXx"). */
export const BLOCKED_NICKNAME_PARTS = [
  'hitler', 'nazi', 'nigger', 'nigga', 'faggot', 'kkk', 'siegheil', 'whitepower', 'holocaust', 'auschwitz',
  'fuck', 'shit', 'retard', 'whore', 'slut', 'bitch', 'pedophile', 'paedophile', 'molest',
];
/** Blocked only as a whole word, because they also appear inside harmless names. */
export const BLOCKED_NICKNAME_WORDS = [
  'cunt', 'fag', 'kike', 'spic', 'chink', 'coon', 'gook', 'tranny', 'rape', 'rapist', 'pedo', 'porn', 'sex',
  'cock', 'dick', 'pussy', 'penis', 'anal', 'cum', 'heil',
];

/** Lowercase, undo common digit swaps (h1tl3r) and treat l/i alike (HitIer), letters only. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[013457l]/g, c => 'oieasti'['013457l'.indexOf(c)]).replace(/[^a-z]/g, '');
}

export function blockedNickname(name: string): boolean {
  const whole = compact(name);
  const words = name.split(/[ _-]+/).map(compact);
  return BLOCKED_NICKNAME_PARTS.some(part => whole.includes(compact(part)))
    || BLOCKED_NICKNAME_WORDS.some(word => words.includes(compact(word)));
}

export function validNickname(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,14}$/.test(name) && !blockedNickname(name);
}
