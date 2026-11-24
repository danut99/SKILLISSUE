import { describe, expect, it } from 'vitest';
import { validNickname } from './nickname';
import { NAME_ADJ, NAME_NOUN } from './store';

describe('nickname rules', () => {
  it('accepts generated names and supported separators', () => {
    for (const name of ['A', 'WobblyPotato42', 'Player 1', 'Alex_2', 'Alex-2', '123456789012345']) expect(validNickname(name)).toBe(true);
  });
  it('rejects domains, links, email addresses and hidden or unsupported characters', () => {
    for (const name of ['typing.org.uk', 'x.com', 'https://x.co', 'a@b.com', 'www．example', '<Alex>', 'Alex\n', 'Al\u200bex', '_Alex', '', '1234567890123456', 'Ａlex']) expect(validNickname(name)).toBe(false);
  });
  it('rejects offensive names, including glued, spaced and digit-swapped spellings', () => {
    for (const name of ['Adolf Hitler', 'xXHitlerXx', 'H1tl3r', 'HitIer', 'nazi_boy', 'Big Dick', 'K K K']) expect(validNickname(name)).toBe(false);
  });
  it('keeps harmless names that contain a whole-word-only term', () => {
    for (const name of ['Dickens', 'Scunthorpe', 'Cocktail', 'Sussex', 'Analyst', 'Spicy Goose', 'Raccoon']) expect(validNickname(name)).toBe(true);
  });
  it('never blocks an auto-assigned name', () => {
    for (const adj of NAME_ADJ) for (const noun of NAME_NOUN) for (let n = 10; n < 100; n++) expect(validNickname(`${adj}${noun}${n}`)).toBe(true);
    for (let n = 0; n < 1_000_000; n += 7) expect(validNickname(`Player${String(n).padStart(6, '0')}`)).toBe(true);
  });
});
