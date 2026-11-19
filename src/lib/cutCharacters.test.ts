import { expect, it } from 'vitest';
import { halfMood } from './cutCharacters';

it('makes the halves react to how fair the cut was', () => {
  expect(halfMood(70, true)).toBe('cry');
  expect(halfMood(70, false)).toBe('smug');
  expect(halfMood(93, true)).toBe('relieved');
  expect(halfMood(99.5, false)).toBe('love');
});
