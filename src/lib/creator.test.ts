import { beforeEach, expect, it } from 'vitest';
import { calendar, captionVariants, creatorClipOptions, planFor, useCreator } from './creator';

beforeEach(() => useCreator.setState({ enabled: true, clean: false, seriesStart: null, hook: '', posted: {}, format: 'classic' }));

it('keeps Classic as default, guessing exclusive to Cut, and challenge endings for all games', () => {
  expect(creatorClipOptions('cut', '2026-11-24')).toEqual({});
  useCreator.getState().setFormat('guess-cut');
  expect(creatorClipOptions('cut', '2026-11-24')).toEqual({ format: 'guess-cut' });
  expect(creatorClipOptions('draw', '2026-11-24')).toEqual({});
  expect(creatorClipOptions('brake', '2026-11-24')).toEqual({});
  useCreator.getState().setFormat('beat-score');
  expect(creatorClipOptions('cut', '2026-11-24')).toEqual({ format: 'beat-score' });
  expect(creatorClipOptions('draw', '2026-11-24')).toEqual({ format: 'beat-score' });
  expect(creatorClipOptions('brake', '2026-11-24')).toEqual({ format: 'beat-score' });
  useCreator.getState().setFormat('classic');
  expect(creatorClipOptions('cut', '2026-11-24')).toEqual({});
});

it('plans one post a day, favouring Cut, with varied ideas', () => {
  const days = calendar('2026-11-19', 0, 13);
  expect(days).toHaveLength(14);
  expect(days[0].date).toBe('2026-11-19');
  const cut = days.filter((d) => d.mode === 'cut').length;
  expect(cut).toBe(12);
  expect(new Set(days.slice(0, 7).map((d) => d.idea.key)).size).toBe(7);
  expect(planFor('2026-11-19')).toEqual(days[0]);
});

it('uses the custom hook, else the series day, on creator clips only', () => {
  useCreator.setState({ seriesStart: '2026-11-10' });
  expect(creatorClipOptions('cut', '2026-11-19').hook).toBe('Day 10 of trying to cut this blob 50/50');
  useCreator.setState({ hook: 'my mom vs me' });
  expect(creatorClipOptions('cut', '2026-11-19').hook).toBe('my mom vs me');
  useCreator.setState({ enabled: false });
  expect(creatorClipOptions('cut', '2026-11-19')).toEqual({});
});

it('offers three different captions with the score, comment prompt and site', () => {
  const captions = captionVariants('cut', '2026-11-19', '49.2 / 50.8', 'skillissue.lol');
  expect(new Set(captions).size).toBe(3);
  for (const caption of captions) {
    expect(caption).toContain('49.2 / 50.8');
    expect(caption).toContain('skillissue.lol');
  }
});
