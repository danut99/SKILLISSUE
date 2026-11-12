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
import { emojiFor, fmtResult } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, triesLeft, usePlayer, type Attempt } from '../lib/store';
import { toast, useUi } from '../lib/ui';
import { GameCanvas } from './GameCanvas';
import { Leaderboard } from './Leaderboard';
import { ResultPanel } from './ResultPanel';
import { RewardedAdModal } from './RewardedAdModal';

const FACTORY: Record<Mode, (api: GameApi) => Game> = {
  draw: createDrawGame,
  cut: createCutGame,
  brake: createBrakeGame,
};

/** How long the on-canvas result plays before the panel appears (and the clip stops). */
const RESULT_DELAY: Record<Mode, number> = { draw: 1500, cut: 1700, brake: 2300 };

interface Props {
  mode: Mode;
  date: string;
  onNavigate: (mode: Mode | null) => void;
}

export function GameScreen({ mode, date, onNavigate }: Props) {
  const md = usePlayer((s) => modeDay(s.days, date, mode));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [panel, setPanel] = useState<{ last: Attempt | null } | null>(null);
  const [clip, setClip] = useState<{ blob: Blob; ext: string } | null>(null);
  const [snapshot, setSnapshot] = useState<HTMLCanvasElement | null>(null);
  const [adOpen, setAdOpen] = useState(false);

  // a fresh game instance per attempt
  useEffect(() => {
    const store = usePlayer.getState();
    const current = modeDay(store.days, date, mode);
    let timer = 0;

    if (triesLeft(current) === 0) {
      gameRef.current = createLockedGame(fmtResult(mode, bestAttempt(current)));
      setPanel({ last: null });
      return;
    }

    const api: GameApi = {
      date,
      toast,
      startClip: () => canvasRef.current && clipRecorder.start(canvasRef.current),
      cancelClip: () => clipRecorder.cancel(),
      finish: (res: AttemptResult) => {
        const attempt: Attempt = { score: res.score, detail: res.detail, at: Date.now() };
        usePlayer.getState().addAttempt(date, mode, attempt);
        recordAttempt(date, mode, attempt)
          .then((r) => {
            if (r === 'no_tries_left') {
              toast('No tries left today (used on another device?) 😵');
              void syncAfterLimit();
            } else if (r === 'error') toast('Leaderboard hiccup 😵 score kept on this device');
            useUi.getState().refreshBoards();
          })
          .catch(() => toast('Leaderboard hiccup 😵'));
        timer = window.setTimeout(async () => {
          const recorded = await clipRecorder.stop();
          setClip(recorded);
          setSnapshot(snapshotCanvas(canvasRef.current));
          setPanel({ last: attempt });
          useUi.getState().refreshBoards();
          if (res.score >= 95 && !usePlayer.getState().settings.lowPower) confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ['#4de3ff', '#ff5d8f', '#ffd23f'] });
          if (matchMedia('(max-width: 899px)').matches) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, RESULT_DELAY[mode]);
      },
    };
    gameRef.current = FACTORY[mode](api);

    return () => {
      clearTimeout(timer);
      gameRef.current?.destroy?.();
      clipRecorder.cancel();
    };
  }, [attemptKey, mode, date]);

  const retry = useCallback(() => {
    setPanel(null);
    setClip(null);
    setAttemptKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const reward = useCallback(() => {
    usePlayer.getState().grantBonus(date, mode);
    void grantBonusRemote(mode);
    toast('+1 try unlocked 🎉 Don’t waste it.');
    retry();
  }, [date, mode, retry]);

  // cut: once you're out of tries, reveal the #1 player's line
  const onBoard = useCallback(
    (b: Board) => {
      if (mode !== 'cut' || triesLeft(modeDay(usePlayer.getState().days, date, mode)) > 0) return;
      const top = b.rows[0];
      gameRef.current?.setGhost?.(top && !top.is_me && top.detail.line ? top.detail.line : null);
    },
    [mode, date],
  );

  const dots = [...md.tries.map(emojiFor), ...Array(Math.max(0, maxTries(md) - md.tries.length)).fill('⬜')].join('');

  return (
    <section className="screen">
      <div className="game-bar">
        <div className="game-title">
          {MODE_INFO[mode].emoji} {MODE_INFO[mode].title}
        </div>
        <div className="tries" aria-label="tries">
          {dots}
        </div>
      </div>
      <div className="with-board">
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
              onWatchAd={() => setAdOpen(true)}
              onNext={onNavigate}
            />
          )}
          {!panel && <div className="card px-box hint-card">{MODE_INFO[mode].tagline}<br />3 tries. Best one counts. Same challenge for everyone today.</div>}
        </div>
      </div>
      <aside className="board-col">
        <Leaderboard mode={mode} date={date} title={`🌍 Today's Global Top 10 · ${MODE_INFO[mode].name}`} onLoad={onBoard} />
      </aside>
      </div>
      <RewardedAdModal open={adOpen} onClose={() => setAdOpen(false)} onReward={reward} />
    </section>
  );
}
