import { ResponsiveSection } from './ResponsiveSection';
import { ScoreChallengeBanner } from './ScoreChallengeBanner';
import { createTimedGame } from '../games/timedGame';
import { savedResultCanvas } from '../lib/savedResult';
import confetti from 'canvas-confetti';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MODE_INFO, type Mode } from '../config';
import { createBrakeGame } from '../games/brakeGame';
import { createCutGame } from '../games/cutGame';
import { createDrawGame } from '../games/drawGame';
import { createLockedGame } from '../games/lockedGame';
import type { AttemptResult, Game, GameApi } from '../games/types';
import { clipRecorder } from '../lib/clip';
import { snapshotCanvas } from '../lib/shareCard';
import { grantBonusRemote, recordAttempt, syncAfterLimit, type Board } from '../lib/leaderboard';
import { recordChallengeAttempt } from '../lib/trackedChallenges';
import { emojiFor, fmtResult } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, triesLeft, usePlayer, type Attempt } from '../lib/store';
import { toast, useUi } from '../lib/ui';
import { scoreBand, tag, track } from '../lib/clarity';
import { GameCanvas } from './GameCanvas';
import { GameCompanions } from './GameCompanions';
import { Leaderboard } from './Leaderboard';
import { ResultPanel } from './ResultPanel';
import { RewardedAdModal } from './RewardedAdModal';

const FACTORY: Record<Mode, (api: GameApi) => Game> = {
  draw: createDrawGame,
  cut: createCutGame,
  brake: createBrakeGame,
};

/** Keep recording the result animation without delaying the result panel. */
const CLIP_RESULT_DURATION: Record<Mode, number> = { draw: 1500, cut: 1700, brake: 2300 };

interface Props {
  mode: Mode;
  date: string;
  onNavigate: (mode: Mode | null) => void;
}

/** A past day's accepted challenge being replayed (all-time only). */
export interface PastChallenge { token: string; date: string }

export function GameScreen({ mode, date, onNavigate }: Props) {
  const [past, setPast] = useState<PastChallenge | null>(null);
  const playDate = past?.date ?? date;
  const md = usePlayer((s) => modeDay(s.days, playDate, mode));
  const dots = [...md.tries.map(emojiFor), ...Array(Math.max(0, maxTries(md) - md.tries.length)).fill('⬜')].join('');
  const onPastChallenge = useCallback((next: PastChallenge | null) => {
    setPast(prev => prev?.token === next?.token && prev?.date === next?.date ? prev : next);
  }, []);

  return (
    <section className="screen">
      <div className="game-bar">
        <div className="game-title">
          {MODE_INFO[mode].title}
          {past && <small className="game-title-date"> · {past.date}</small>}
        </div>
        <div className="tries" aria-label="tries">
          {dots}
        </div>
      </div>
      <ScoreChallengeBanner mode={mode} date={date} onPastChallenge={onPastChallenge} />
      <GamePlay key={playDate} mode={mode} date={playDate} today={date} challengeToken={past?.token ?? null} onNavigate={onNavigate} />
    </section>
  );
}

interface PlayProps extends Props {
  /** Real UTC day; differs from `date` while replaying a past challenge. */
  today: string;
  challengeToken: string | null;
}

function GamePlay({ mode, date, today, challengeToken, onNavigate }: PlayProps) {
  const archived = challengeToken !== null && date !== today;
  const md = usePlayer((s) => modeDay(s.days, date, mode));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [panel, setPanel] = useState<{ last: Attempt | null } | null>(null);
  const [clip, setClip] = useState<{ blob: Blob; ext: string } | null>(null);
  const [snapshot, setSnapshot] = useState<HTMLCanvasElement | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  // a fresh game instance per attempt
  useEffect(() => {
    const store = usePlayer.getState();
    const current = modeDay(store.days, date, mode);
    let timer = 0;
    let disposed = false;
    let started = false;

    if (triesLeft(current) === 0) {
      const best = bestAttempt(current);
      const restored = best ? savedResultCanvas(mode, date, best) : null;
      gameRef.current = restored
        ? { render: c => c.drawImage(restored, 0, 0, 360, 640) }
        : createLockedGame(fmtResult(mode, best));
      if (restored) setSnapshot(restored);
      setPanel({ last: null });
      return;
    }

    const api: GameApi = {
      date,
      toast,
      startClip: () => {
        if (!started) {
          started = true;
          track(`game_start_${mode}`);
          tag('played', mode);
        }
        setPlaying(true);
        if (canvasRef.current) clipRecorder.start(canvasRef.current, mode);
      },
      cancelClip: () => {
        clipRecorder.cancel();
        setPlaying(false);
      },
      finish: (res: AttemptResult) => {
        const attempt: Attempt = { score: res.score, detail: res.detail, at: Date.now() };
        usePlayer.getState().addAttempt(date, mode, attempt, archived);
        const band = scoreBand(res.score);
        track(`game_finish_${mode}`);
        track(`game_${band}_${mode}`);
        tag(`score_${mode}`, band);
        if (triesLeft(modeDay(usePlayer.getState().days, date, mode)) === 0) track(`out_of_tries_${mode}`);
        setSnapshot(savedResultCanvas(mode, date, attempt));
        setPanel({ last: attempt });
        if (res.score >= 95 && !usePlayer.getState().settings.lowPower) confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ['#4de3ff', '#ff5d8f', '#ffd23f'] });
        (archived && challengeToken ? recordChallengeAttempt(challengeToken, attempt) : recordAttempt(date, mode, attempt))
          .then((r) => {
            if (r === 'no_tries_left') {
              toast(archived ? 'No tries left for that day 😵' : 'No tries left today (used on another device?) 😵');
              if (!archived) void syncAfterLimit();
            } else if (r === 'error') toast('Leaderboard hiccup 😵 score kept on this device');
            useUi.getState().refreshBoards();
          })
          .catch(() => toast('Leaderboard hiccup 😵'));
        timer = window.setTimeout(() => {
          const frozen = snapshotCanvas(canvasRef.current);
          if (frozen) setSnapshot(frozen);
          void clipRecorder.stop({ mode, attempt }).then(recorded => {
            if (!disposed) setClip(recorded);
          });
        }, CLIP_RESULT_DURATION[mode]);
      },
    };
    gameRef.current = createTimedGame(mode, FACTORY[mode], api);

    return () => {
      disposed = true;
      clearTimeout(timer);
      gameRef.current?.destroy?.();
      clipRecorder.cancel();
    };
  }, [attemptKey, mode, date, archived, challengeToken]);

  // Restore today's best when reopening, including scores loaded from the server.
  // A deliberate retry bypasses this summary and starts a fresh attempt.
  useEffect(() => {
    const best = bestAttempt(md);
    if (attemptKey !== 0 || playing || panel || !best) return;
    gameRef.current?.destroy?.();
    const restored = savedResultCanvas(mode, date, best);
    if (restored) {
      gameRef.current = { render: c => c.drawImage(restored, 0, 0, 360, 640) };
      setSnapshot(restored);
    } else {
      gameRef.current = createLockedGame(fmtResult(mode, best), triesLeft(md));
    }
    setPanel({ last: null });
  }, [md, mode, date, attemptKey, playing, panel]);

  useEffect(() => {
    if (!panel || !matchMedia('(max-width: 899px)').matches) return;
    const frame = requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: usePlayer.getState().settings.lowPower || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  const startNextTry = useCallback(() => {
    setPanel(null);
    setPlaying(false);
    setClip(null);
    setSnapshot(null);
    setAttemptKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const retry = useCallback(() => {
    track(`game_retry_${mode}`);
    startNextTry();
  }, [mode, startNextTry]);

  const reward = useCallback(() => {
    usePlayer.getState().grantBonus(date, mode);
    void grantBonusRemote(mode);
    toast('+1 try unlocked 🎉 Don’t waste it.');
    track(`bonus_try_${mode}`);
    startNextTry();
  }, [date, mode, startNextTry]);

  // cut: once you're out of tries, reveal the #1 player's line
  const onBoard = useCallback(
    (b: Board) => {
      if (archived || mode !== 'cut' || triesLeft(modeDay(usePlayer.getState().days, date, mode)) > 0) return;
      const top = b.rows[0];
      gameRef.current?.setGhost?.(top && !top.is_me && top.detail.line ? top.detail.line : null);
    },
    [archived, mode, date],
  );

  return (
    <>
      <div className={`with-board game-columns ${panel ? 'has-result' : 'is-playing'}`}>
      <div className="game-layout">
        <GameCanvas gameRef={gameRef} canvasRef={canvasRef} date={date} />
        <div className="side" ref={resultRef}>
          {panel && (
            <ResultPanel
              key={attemptKey}
              mode={mode}
              date={date}
              last={panel.last}
              clip={clip}
              snapshot={snapshot}
              onRetry={retry}
              archived={archived}
              onWatchAd={() => { track(`ad_open_${mode}`); setAdOpen(true); }}
              onNext={onNavigate}
            />
          )}
          {(panel || (!playing && triesLeft(md) > 0)) && (
            panel ? <GameCompanions key={`${mode}:${date}:${attemptKey}:${panel.last?.at ?? 'best'}`} mode={mode} date={date} score={(panel.last ?? bestAttempt(md))?.score} />
            : <ResponsiveSection title="How to play"><GameCompanions mode={mode} date={date} /></ResponsiveSection>
          )}

        </div>
      </div>
      <aside className="board-col">
        <ResponsiveSection title="Leaderboard"><Leaderboard mode={mode} date={today} title={`Global Top 10 · ${MODE_INFO[mode].name}`} onLoad={onBoard} /></ResponsiveSection>
      </aside>
      </div>
      <RewardedAdModal open={adOpen} onClose={() => setAdOpen(false)} onReward={reward} />
    </>
  );
}
