import { describe, expect, it } from 'vitest';
import { validNickname } from './nickname';

describe('nickname rules', () => {
  it('accepts generated names and supported separators', () => {
    for (const name of ['A', 'WobblyPotato42', 'Player 1', 'Alex_2', 'Alex-2', '123456789012345']) expect(validNickname(name)).toBe(true);
  });
  it('rejects domains, links, email addresses and hidden or unsupported characters', () => {
    for (const name of ['typing.org.uk', 'x.com', 'https://x.co', 'a@b.com', 'www．example', '<Alex>', 'Alex\n', 'Al\u200bex', '_Alex', '', '1234567890123456', 'Ａlex']) expect(validNickname(name)).toBe(false);
  });
});
