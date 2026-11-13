import type { Mode } from '../config';
import { useEffect, useRef, useState } from 'react';
import { createDrawGame } from '../games/drawGame';
import { createBrakeGame } from '../games/brakeGame';
import { createCutGame } from '../games/cutGame';
import { banner, paper, text } from '../games/canvas';
import { C, W, type AttemptResult, type Game, type GameApi } from '../games/types';
import { partyRound, submitPartyResult } from '../lib/party';
import { toast } from '../lib/ui';
import { GameCanvas } from './GameCanvas';

type SavedRound = { started: true; result?: AttemptResult };
const memory = new Map<string, SavedRound>();
function read(key: string): SavedRound | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as SavedRound | null; } catch { return memory.get(key) ?? null; }
}
function write(key: string, data: SavedRound) {
  memory.set(key, data);
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* current tab still protects against replay */ }
}

export function PartyRound({ token, match, round, roundCount, gameVersion, selectedGames, userId, end, offset, receivedScore, onRefresh, reveal, secondsLeft, finishedPlayers, totalPlayers }: {
  roundCount: number; gameVersion: number; selectedGames?: Mode[];
  token: string; match: number; round: number; userId: string; end: number; offset: number;
  receivedScore: number | null | undefined; onRefresh: () => void;
  reveal: boolean; secondsLeft: number; finishedPlayers: number; totalPlayers: number;
}) {
  const gamesKey = selectedGames?.join(',') ?? '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const clockOffset = useRef(offset);
  const [initialScore] = useState(receivedScore);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [sync, setSync] = useState(initialScore != null ? 'Score received' : '');
  const key = `skillissue:party:${userId}:${token}:${match}:${round}`;
  useEffect(() => { clockOffset.current = offset; }, [offset]);

  useEffect(() => {
    const rule = partyRound(round, gameVersion, gamesKey ? gamesKey.split(',') as Mode[] : undefined);
    let finished = false;
    let finalResult: AttemptResult | null = null;
    let game: Game | null = null;
    const showSaved = (score: number, title: string) => {
      gameRef.current = { render(c) { paper(c); text(c, title, W / 2, 180, { size: 28, color: C.cyan }); banner(c, `${score.toFixed(1)} pts`, 'Waiting for the round reveal', C.yellow, 1000); } };
    };
    const finish = (value: AttemptResult) => {
      if (finished) return;
      finished = true;
      finalResult = value;
      if (value.detail.timedOut) game?.destroy?.();
      write(key, { started: true, result: value });
      setResult(value);
    };
    const saved = read(key);
    if (initialScore != null) {
      showSaved(initialScore, 'RESULT RECEIVED');
      return;
    }
    if (saved) {
      const recovered = saved.result ?? { score: 0, detail: { fail: true }, display: 'ROUND LEFT' };
      showSaved(recovered.score, saved.result ? 'RESULT RECOVERED' : 'ROUND LEFT');
      finish(recovered);
      return;
    }
    const startFrame = requestAnimationFrame(() => { if (!finished) write(key, { started: true }); });
    const now = () => Date.now() + clockOffset.current;
    const timedOut = () => finish({ score: 0, detail: { fail: true, timedOut: true }, display: 'TIME UP' });
    const check = () => { if (!finished && now() >= end) timedOut(); return !finished; };
    const api: GameApi = { date: `party:${token}:${match}:${round}`, finish, startClip: () => {}, cancelClip: () => {}, toast };
    game = rule.mode === 'draw' ? createDrawGame(api, { shape: rule.shape }) : rule.mode === 'cut' ? createCutGame(api, { complexity: rule.complexity }) : createBrakeGame(api, undefined, { objective: rule.objective });
    const activeGame = game;
    gameRef.current = {
      down(p, e) { if (check()) activeGame.down?.(p, e); },
      move(p, e) { if (check()) activeGame.move?.(p, e); },
      up(p, e) { if (check()) activeGame.up?.(p, e); },
      key(e) { if (check()) activeGame.key?.(e); },
      update(time) { if (check()) activeGame.update?.(time); },
      render(c, time) {
        activeGame.render(c, time);
        if (finished) {
          if (finalResult?.detail.timedOut) banner(c, 'TIME UP', 'Next round is a fresh start.', C.red, 1000);
          return;
        }
        const seconds = Math.max(0, (end - now()) / 1000);
        text(c, `${seconds.toFixed(1)}s`, W / 2, 565, { size: 34, color: seconds <= 2 ? C.red : C.cyan, outline: 4 });
        c.fillStyle = C.line; c.fillRect(40, 595, W - 80, 6);
        c.fillStyle = seconds <= 2 ? C.red : C.cyan; c.fillRect(40, 595, (W - 80) * Math.min(1, seconds / rule.seconds), 6);
      },
    };
    const timer = setInterval(check, 50);
    return () => { cancelAnimationFrame(startFrame); clearInterval(timer); finished = true; activeGame.destroy?.(); gameRef.current = null; };
  }, [token, match, round, gameVersion, gamesKey, key, end, initialScore]);

  useEffect(() => {
    if (!result) return;
    let alive = true;
    let inFlight = false;
    let complete = false;
    const send = async () => {
      if (!alive || inFlight || complete) return;
      inFlight = true;
      setSync('Sending score...');
      try {
        await submitPartyResult(token, match, round, result);
        complete = true;
        if (alive) { setSync('Score received'); onRefresh(); }
      } catch (cause) {
        if (alive) setSync(cause instanceof Error ? cause.message : 'Could not send score.');
        if (Date.now() + clockOffset.current > end + 2000) complete = true;
      } finally { inFlight = false; }
    };
    void send();
    const timer = setInterval(() => void send(), 650);
    return () => { alive = false; clearInterval(timer); };
  }, [result, token, match, round, end, onRefresh]);

  const completed = result !== null || initialScore != null;
  const score = result?.score ?? initialScore ?? 0;
  const saved = sync === 'Score received' || initialScore != null;
  const savingError = sync !== '' && sync !== 'Sending score...' && sync !== 'Score received';
  return <div className="party-playfield">
    <div className="party-canvas-shell">
      <GameCanvas gameRef={gameRef} canvasRef={canvasRef} date="party" label={`PARTY - ROUND ${round + 1}`} />
      {completed && <div className="party-completion" role="status" aria-live="polite">
        <div className="party-completion-title">{result?.detail.timedOut ? "Time's up" : 'Round complete!'}</div>
        <b>{score.toFixed(1)} <small>pts</small></b>
        <span className={savingError ? 'party-sync-error' : ''}>{savingError ? sync : saved ? 'Score saved' : 'Saving your score...'}</span>
        <div className="party-waiting-label">{reveal ? 'Results revealed' : 'Waiting for players'}{!reveal && <span className="waiting-dots" aria-hidden="true">...</span>}</div>
        <small>{reveal ? `${round === roundCount - 1 ? 'Final podium' : 'Next round'} in ${Math.max(0, Math.ceil(secondsLeft))}s` : `${finishedPlayers}/${totalPlayers} finished - reveals when all finish or in ${Math.max(0, Math.ceil(secondsLeft))}s`}</small>
      </div>}
    </div>
  </div>;
}
