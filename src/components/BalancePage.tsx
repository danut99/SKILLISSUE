import { BonusGameReaction } from './BonusGameReaction';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { balanceSetup, createBalanceGame } from '../games/balanceGame';
import type { Game } from '../games/types';
import { dayNumber } from '../lib/daily';
import { usePlayer } from '../lib/store';
import { useAuth } from '../lib/auth';
import { BALANCE_TRIES, loadBalanceDay, submitBalance, type BalanceDay, type BalanceAttempt } from '../lib/balance';
import { balanceCaption, balanceClipAttempt, balanceLink, renderBalanceCard, recordBalanceReplay } from '../lib/balanceShare';
import { clipRecorder, saveClip } from '../lib/clip';
import { snapshotCanvas } from '../lib/shareCard';
import { toast, useUi } from '../lib/ui';
import { BalanceLeaderboard } from './BalanceLeaderboard';
import { Countdown } from './Countdown';
import { GameCanvas } from './GameCanvas';
import { ShareModal } from './ShareModal';
import { AccountCard } from './AccountCard';
import { BalanceChallengeBanner } from './BalanceChallengeBanner';
import { challengeUrl } from '../lib/scoreChallenge';
import { copyText } from '../lib/scoring';

export function BalancePage({ date }: { date: string }) {
  const owner = useAuth(state => state.userId);
  const status = useAuth(state => state.status);
  const key = `${date}:${owner}:${status}`;
  const [state, setState] = useState<{ key: string; day?: BalanceDay; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const request = ++sequence.current;
      loadBalanceDay(date).then(day => {
        if (alive && sequence.current === request) setState({ key, day });
      }).catch(error => {
        if (alive && sequence.current === request) setState(previous => ({
          key, day: previous?.key === key ? previous.day : undefined,
          error: error instanceof Error ? error.message : 'Could not load your tries.',
        }));
      });
    };
    const onStorage = (event: StorageEvent) => { if (event.key?.startsWith('skillissue:balance:')) load(); };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('storage', onStorage);
    return () => { alive = false; window.removeEventListener('focus', load); window.removeEventListener('storage', onStorage); };
  }, [date, key, reload]);
  const day = state?.key === key ? state.day : undefined;
  const error = state?.key === key ? state.error : undefined;
  const left = BALANCE_TRIES - (day?.attempts.length ?? 0);
  const best = day?.attempts.reduce<BalanceAttempt | null>((best, value) => !best || value.score > best.score ? value : best, null);
  return <section className="screen balance-page">
    <header className="balance-heading">
      <div>
        <p className="balance-day">Daily balance #{dayNumber(date)}</p>
        <h1>BALANCE!</h1>
        <p>One plank. Two friends. Five tries.</p>
      </div>
      {day && <div className="balance-daily-progress">
        <p>{left} {left === 1 ? 'try' : 'tries'} left</p>
        <div className="balance-attempts" aria-label={`${day.attempts.length} of ${BALANCE_TRIES} tries used`}>
          {Array.from({ length: BALANCE_TRIES }, (_, index) => <span key={index}
            className={day.attempts[index] ? day.attempts[index].score >= 85 ? 'good' : 'used' : ''} />)}
        </div>
        {best && <small>Best today {best.score.toFixed(1)} / 100</small>}
      </div>}
    </header>
    {!day ? <div className="card px-box" role={error ? 'alert' : 'status'}>
      <p>{error ?? 'Loading your daily tries...'}</p>
      {error && <button className="btn" onClick={() => setReload(value => value + 1)}>Try again</button>}
    </div> : <BalanceRound key={`${key}:${attempt}`} date={date} day={day}
      initial={playing ? null : day.attempts.at(-1) ?? null}
      onSaved={saved => { ++sequence.current; setState({ key, day: saved }); useUi.getState().refreshBoards(); }}
      onReload={() => setReload(value => value + 1)}
      onRetry={() => { setPlaying(true); setAttempt(value => value + 1); }} />}
  </section>;
}

function BalanceRound({ date, day, initial, onRetry, onSaved, onReload }: {
  date: string; day: BalanceDay; initial: BalanceAttempt | null; onRetry: () => void;
  onSaved: (day: BalanceDay) => void; onReload: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const balanceRef = useRef<ReturnType<typeof createBalanceGame> | null>(null);
  const initialRef = useRef(initial);
  const [support, setSupport] = useState(initial?.support ?? 180);
  const supportRef = useRef(support);
  const [released, setReleased] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const committedRef = useRef(Boolean(initial));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<BalanceAttempt | null>(initial);
  const savedRef = useRef<BalanceAttempt | null>(initial);
  const attemptId = useRef(crypto.randomUUID());
  const [clip, setClip] = useState<{ blob: Blob; ext: string } | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<HTMLCanvasElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const alive = useRef(false);
  const replayController = useRef<AbortController | null>(null);
  const accountStatus = useAuth(state => state.status);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const lowPower = usePlayer(state => state.settings.lowPower);
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = lowPower || Boolean(prefersReducedMotion);
  const motionRef = useRef(reducedMotion);
  useEffect(() => { motionRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => {
    alive.current = true;
    const game = createBalanceGame(date, () => {
      const saved = savedRef.current;
      if (!saved) return;
      setResult(saved);
      setSnapshot(snapshotCanvas(canvasRef.current));
      setClipBusy(clipRecorder.supported);
      void clipRecorder.stop({ mode: 'balance', attempt: balanceClipAttempt(saved) }).then(value => {
        if (alive.current) { setClip(value); setClipBusy(false); }
      });
    }, value => { supportRef.current = value; setSupport(value); }, () => setReleased(true), () => motionRef.current, {
      savedSupport: initialRef.current?.support,
      canPlace: () => !savingRef.current,
    });
    balanceRef.current = game;
    gameRef.current = game;
    return () => { alive.current = false; replayController.current?.abort(); clipRecorder.cancel(); gameRef.current = null; balanceRef.current = null; };
  }, [date]);
  const left = Math.max(0, BALANCE_TRIES - day.attempts.length);
  const best = day.attempts.reduce<BalanceAttempt | null>((best, value) => !best || value.score > best.score ? value : best, null);
  const shown = result ?? (!released && left === 0 ? day.attempts.at(-1) ?? null : null);
  useEffect(() => {
    if (left === 0 && !released && !saving && shown) {
      gameRef.current = createBalanceGame(date, () => {}, undefined, undefined, () => motionRef.current, { savedSupport: shown.support });
    }
  }, [date, left, released, saving, shown]);
  const share = useMemo(() => shown ? {
    text: balanceCaption(date, shown.score), link: balanceLink(), filename: `skilly-balance-${date}-${shown.score.toFixed(1)}.png`,
    render: () => renderBalanceCard(date, shown, snapshot),
  } : undefined, [date, shown, snapshot]);
  async function release() {
    if (savingRef.current || committedRef.current || released || shown || left === 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const savedDay = await submitBalance(date, supportRef.current, attemptId.current);
      if (!alive.current) return;
      const saved = savedDay.attempts.find(value => value.id === attemptId.current);
      if (!saved) throw new Error('Could not confirm your score. Please try again.');
      savedRef.current = saved;
      committedRef.current = true;
      savingRef.current = false;
      balanceRef.current?.place(saved.support);
      onSaved(savedDay);
      if (canvasRef.current) clipRecorder.start(canvasRef.current, 'balance');
      balanceRef.current?.release();
    } catch (error) {
      if (alive.current) {
        setSaveError(error instanceof Error ? error.message : 'Could not save your score. Please try again.');
        onReload();
      }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }
  async function downloadVideo() {
    if (!shown || clipBusy) return;
    setClipBusy(true);
    try {
      replayController.current = new AbortController();
      const video = clip ?? await recordBalanceReplay(date, shown, replayController.current.signal);
      if (!alive.current) return;
      if (!video) { toast('Video recording is unavailable in this browser. You can share an image.'); return; }
      setClip(video);
      const outcome = await saveClip(video.blob, `skilly-balance-${date}-${shown.score.toFixed(1)}.${video.ext}`, balanceCaption(date, shown.score));
      if (outcome === 'downloaded') toast('Video saved. Ready to upload!');
    } catch { if (alive.current) toast('Could not create the video. Please try again.'); }
    finally { if (alive.current) setClipBusy(false); }
  }
  const difference = shown ? balanceSetup(date).center - shown.support : 0;
  const perfect = shown?.score === 100;
  const balanced = (shown?.score ?? 0) >= 85;
  async function challengeFriend() {
    if (!best || challengeBusy) return;
    setChallengeBusy(true);
    const url = challengeUrl(balanceLink(), 'balance', date, usePlayer.getState().nickname, balanceClipAttempt(best));
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: 'Beat my BALANCE! score', text: `Can you beat ${best.score.toFixed(1)} / 100?`, url }); return; }
        catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
      }
      toast(await copyText(url) ? 'Challenge link copied!' : 'Could not copy the challenge link. Please try again.');
    } finally { if (alive.current) setChallengeBusy(false); }
  }
  return <>
    <BalanceChallengeBanner date={date} score={best?.score ?? null} remaining={left} />
    <div className="balance-layout">
    <GameCanvas gameRef={gameRef} canvasRef={canvasRef} date={date} label={`BALANCE! #${dayNumber(date)}`} />
    <div className="balance-side">
      <div className="balance-play-panel">
      <div className="card px-box balance-controls">
        <div className="balance-result" role="status" aria-live="polite" aria-atomic="true">
          {shown ? <>
            <p className="balance-result-label">{perfect ? 'Perfect balance' : balanced ? 'Lunch saved' : 'Gravity wins'}</p>
            <h2 className={balanced ? 'balance-score balanced' : 'balance-score'}>{shown.score.toFixed(1)} <span>/ 100</span></h2>
            <BonusGameReaction mode="balance" score={shown.score} seed={`${date}:${shown.id}`} />
            <p>{perfect ? 'Steady hands. Happy friends.' : `The balance point was ${difference > 0 ? 'right' : 'left'} of your support.`}</p>
            {!perfect && <p className="balance-note">Off by {(shown.error / 300 * 100).toFixed(1)}% of the plank.</p>}
          </> : <>
            <h2>{released ? 'Hold your breath...' : 'Where would you put it?'}</h2>
            <p>{released ? 'Pip and Bob are trusting your judgment.' : 'Slide the yellow support underneath the plank, then let gravity decide.'}</p>
          </>}
        </div>
        {!shown && <>
          <label className="balance-slider-label" htmlFor="balance-support">Move the support</label>
          <input id="balance-support" type="range" min="40" max="320" step="0.5" value={support}
            aria-valuetext="Support position" disabled={released || saving || left === 0}
            onChange={event => balanceRef.current?.place(Number(event.target.value))} />
          <button className="btn btn-primary balance-release" disabled={released || saving || left === 0}
            onPointerUp={event => {
              if (event.pointerType !== 'touch') return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) void release();
            }} onClick={() => void release()}>{saving ? 'Saving...' : released ? 'Finding out...' : 'Let go'}</button>
        </>}
        {saveError && <p className="balance-save-error" role="alert">{saveError}</p>}
        {shown && <>
          {left > 0 ? <button className="btn btn-primary" onClick={onRetry}>Try again ({left} left)</button>
            : <p className="balance-out">All five tries used. New balance in <Countdown />.</p>}
          <div className="balance-actions balance-share-actions">
            <button className="btn" onClick={() => setShareOpen(true)}>Share result</button>
            {clipRecorder.supported && <button className="btn btn-pink" disabled={clipBusy} onClick={() => void downloadVideo()}>{clipBusy ? 'Preparing video...' : 'Save video'}</button>}
          </div>
          <button className="btn btn-primary" disabled={challengeBusy} onClick={() => void challengeFriend()}>{challengeBusy ? 'Opening challenge...' : 'Challenge a friend'}</button>
          {day.source === 'local' && <p className="balance-note">Saved on this device.</p>}
        </>}
      </div>
      {accountStatus === 'anon' && <div className="balance-account"><AccountCard compact /></div>}
      <details className="balance-help">
        <summary>How to find the balance</summary>
        <p>Bigger creatures weigh more. Move the support toward the heavier side. The plank adds weight in the middle, too.</p>
        <p>Drag the support on the board or use the slider. With the slider focused, use arrow keys for small adjustments.</p>
      </details>
      <p className="balance-round-note">Same setup for everyone. Five tries each day. Your best score counts. Resets at 00:00 UTC.</p>
      </div>
      <BalanceLeaderboard date={date} />
    </div>
    <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} custom={share} noRank />
  </div></>;
}
