import { describe, expect, it } from 'vitest';
import { challengeInviteText } from './challengeInvite';

describe('personal challenge invitations', () => {
  it('uses the exact cut split instead of treating the precision score as a percentage split', () => {
    const text = challengeInviteText('cut', { score: 98, detail: { a: 49.5, b: 50.5 } });
    expect(text).toContain('49.5 / 50.5');
    expect(text).toContain('Can you get closer?');
    expect(text).not.toContain('98.0');
  });
  it('uses the frozen score for a drawing invitation', () => {
    expect(challengeInviteText('draw', { score: 94.2, detail: {} })).toBe("I scored 94.2/100 drawing today's shape. Can you beat me?");
  });
  it('uses a score comparison for all Brake objectives', () => {
    expect(challengeInviteText('brake', { score: 88.5, detail: { objective: 'parking' } })).toContain('88.5/100');
  });
});
