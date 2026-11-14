export const NICKNAME_RULES = 'Use 1–15 letters, numbers, spaces, _ or -. Start with a letter or number. No links or email addresses.';

export function validNickname(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,14}$/.test(name);
}
