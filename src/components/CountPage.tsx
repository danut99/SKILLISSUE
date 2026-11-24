import { BonusGameReaction } from './BonusGameReaction';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { dayNumber } from '../lib/daily';
import { countDots, dotCount, COUNT_FLASH_MS, COUNT_ANSWER_MS, COUNT_ROUNDS, COUNT_TRIES } from '../lib/countRules';
import { loadCountDay, saveCount, type CountDay } from '../lib/count';
import { useUi, toast } from '../lib/ui';
import { copyText } from '../lib/scoring';
import { siteUrl } from '../config';
import { Countdown } from './Countdown';
import { CountLeaderboard } from './CountLeaderboard';

type Phase = 'ready' | 'get-ready' | 'flash' | 'answer' | 'feedback' | 'result';
export function CountPage({ date }: { date: string }) {
  const owner = useAuth(s => s.userId), status = useAuth(s => s.status);
  return <CountSession key={`${date}:${owner}:${status}`} date={date} />;
}
function CountSession({ date }: { date: string }) {
  const [day, setDay] = useState<CountDay | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(0);
  const [guess, setGuess] = useState('');
  const [answers, setAnswers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const id = useRef<string | null>(null), starting = useRef(false), alive = useRef(true);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const input = useRef<HTMLInputElement>(null);
  const deadline = useRef(0);
  const [seconds, setSeconds] = useState(10);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const load = () => { if (phaseRef.current !== 'ready' && phaseRef.current !== 'result') return; void loadCountDay(date).then(d => { if (active) { setDay(d); setError(''); } }).catch(e => { if (active) setError(e.message); }); };
    load();
    const storage = (e: StorageEvent) => { if (e.key?.startsWith('skillissue:count:')) load(); };
    window.addEventListener('focus', load); window.addEventListener('storage', storage);
    return () => { active = false; window.removeEventListener('focus', load); window.removeEventListener('storage', storage); };
  }, [date, reload]);
  async function begin() {
    if (starting.current || !day || day.attempts.length >= COUNT_TRIES) return;
    starting.current = true; setBusy(true); setError('');
    id.current ??= crypto.randomUUID();
    try {
      const d = await saveCount(date, id.current);
      if (!alive.current) return;
      const reserved = d.attempts.find(a => a.id === id.current);
      if (!reserved || reserved.answers) throw new Error('This attempt is already used. Reload your tries.');
      setDay(d); setRound(0); setAnswers([]); setGuess(''); setPhase('get-ready');
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not start.'); }
    finally { starting.current = false; if (alive.current) setBusy(false); }
  }
  function answer(value: number) {
    if (phaseRef.current !== 'answer') return;
    if (performance.now() >= deadline.current) value = -1;
    phaseRef.current = 'feedback';
    setAnswers(a => [...a, value]); setPhase('feedback');
  }
  useEffect(() => {
    if (phase === 'answer') { deadline.current = performance.now() + COUNT_ANSWER_MS; input.current?.focus(); }
    const delay = phase === 'get-ready' ? 800 : phase === 'flash' ? COUNT_FLASH_MS : phase === 'feedback' && round < COUNT_ROUNDS - 1 ? 1300 : null;
    if (delay !== null) {
      const start = performance.now();
      const timer = window.setTimeout(() => {
        // A hidden/backgrounded flash is forfeited rather than shown for seconds.
        if (phase === 'flash' && (document.hidden || performance.now() - start > COUNT_FLASH_MS + 400)) {
          setAnswers(a => [...a, -1]); setPhase('feedback');
        } else if (phase === 'get-ready') setPhase('flash');
        else if (phase === 'flash') { setSeconds(10); setPhase('answer'); }
        else { setRound(r => r + 1); setGuess(''); setPhase('get-ready'); }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [phase, round]);
  useEffect(() => {
    if (phase !== 'answer') return;
    const tick = window.setInterval(() => {
      const left = Math.max(0, deadline.current - performance.now()); setSeconds(Math.ceil(left / 1000));
      if (!left) answer(-1);
    }, 100);
    return () => clearInterval(tick);
  }, [phase]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden && phaseRef.current === 'flash') { phaseRef.current = 'feedback'; setAnswers(a => [...a, -1]); setPhase('feedback'); }
      else if (document.hidden && phaseRef.current === 'answer') answer(-1);
    };
    document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const finish = useCallback(async () => {
    if (starting.current || !id.current || answers.length !== COUNT_ROUNDS) return;
    starting.current = true; setBusy(true); setError('');
    try { const d = await saveCount(date, id.current, answers); if (alive.current) { setDay(d); setPhase('result'); useUi.getState().refreshBoards(); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { starting.current = false; if (alive.current) setBusy(false); }
  }, [answers, date]);
  useEffect(() => {
    if (phase !== 'feedback' || round !== COUNT_ROUNDS - 1 || answers.length !== COUNT_ROUNDS) return;
    // Show the last answer briefly, then save without another tap.
    const timer = window.setTimeout(() => { void finish(); }, 1300);
    return () => clearTimeout(timer);
  }, [phase, round, answers.length, finish]);
  const active = phase !== 'ready' && phase !== 'result';
  const left = Math.max(0, COUNT_TRIES - (day?.attempts.length ?? 0));
  const best = day?.attempts.reduce((s, a) => Math.max(s, a.score), 0) ?? 0;
  const result = day?.attempts.at(-1);
  const correct = dotCount(date, round), previous = answers[round];
  const dots = countDots(date, round);
  return <section className="screen count-page balance-page">
    <header className="balance-heading"><div><p className="balance-day">Daily perception #{dayNumber(date)}</p><h1>COUNT FAST</h1><p>Start small. Count more each round.</p></div>
      {day && <div className="balance-daily-progress"><p>{left} tries left</p><small>Best today {best} / 100</small></div>}
    </header>
    <div className="count-layout">
      <div className="card px-box count-play">
        <p className="count-round">{active ? `Round ${round + 1} / ${COUNT_ROUNDS}` : 'Five rounds. Trust your eyes.'}</p>
        <div className="count-field">
          {(phase === 'flash' || phase === 'feedback') ? <svg viewBox="0 0 400 400" role="img" aria-label={phase === 'flash' ? 'Count the dots' : `${correct} dots revealed`}>
            {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="11" fill="currentColor" />)}
          </svg> : <div className="count-message">
            <strong>{phase === 'get-ready' ? 'Ready?' : phase === 'answer' ? '?' : phase === 'result' ? `${result?.score ?? 0}/100` : '● ● ●'}</strong>
            {phase === 'result' ? <BonusGameReaction mode="count" score={result?.score ?? 0} seed={`${date}:${result?.id ?? ''}`} /> : <span>{phase === 'get-ready' ? 'Watch the middle.' : phase === 'answer' ? 'How many did you see?' : `Dots appear for ${COUNT_FLASH_MS / 1000} seconds.`}</span>}
          </div>}
        </div>
        <div className="count-controls" aria-live="polite">
          {phase === 'ready' && <button className="btn btn-primary" disabled={!day || busy || left === 0} onClick={() => void begin()}>{busy ? 'Starting...' : 'Start · uses one try'}</button>}
          {phase === 'answer' && <form onSubmit={e => { e.preventDefault(); const n = Number(guess); if (guess !== '' && Number.isInteger(n) && n >= 0 && n <= 50) answer(n); }}>
            <label htmlFor="count-answer">Your count · {seconds}s left</label>
            <div><input id="count-answer" ref={input} inputMode="numeric" type="number" min="0" max="50" step="1" required value={guess} onChange={e => setGuess(e.target.value)} autoComplete="off" /><button className="btn btn-primary">Confirm</button></div>
          </form>}
          {phase === 'feedback' && <><p>{previous === -1 ? 'Missed the round.' : previous === correct ? 'Exactly right!' : `You guessed ${previous}.`} There were <b>{correct}</b> dots.</p>
            {round === COUNT_ROUNDS - 1 && (error
              ? <button className="btn btn-primary" disabled={busy} onClick={() => void finish()}>{busy ? 'Saving...' : 'Retry saving'}</button>
              : <p role="status">{busy ? 'Saving your result...' : 'Finishing your last round...'}</p>)}</>}
          {phase === 'result' && <><p>Best today: {best}/100</p><button className="btn btn-primary" disabled={!left} onClick={() => { id.current = null; setPhase('ready'); }}>Play again ({left} left)</button>
            <button className="btn btn-ghost" onClick={() => void copyText(`COUNT FAST: ${result?.score ?? 0}/100. How sharp are your eyes? ${siteUrl()}#count`).then(ok => toast(ok ? 'Result copied!' : 'Could not copy.'))}>Copy result</button></>}
          {day && !left && !active && <p>New daily challenge in <Countdown />.</p>}
          {error && <p role="alert" className="party-error">{error}</p>}
          {!day && !error && <p role="status">Loading your daily tries...</p>}
          {error && phase === 'ready' && <button className="btn btn-ghost" onClick={() => setReload(r => r + 1)}>Reload tries</button>}
        </div>
      </div>
      <aside><div className="card px-box count-help"><h2>Quick eyes. Honest guesses.</h2><p>Count the dots before they disappear, then enter your answer. Each round gives you 10 seconds to answer.</p><p>Exact count: 20 points. Each dot off: −5 points, down to zero. Five rounds, up to 100 points.</p><p>Five tries per UTC day. Starting, leaving, or refreshing uses a try. Switching tabs during a flash or answer skips that round.</p><p>Same dots for everyone today. Separate from Draw/Cut/Brake totals and Party.</p>{day?.source === 'local' && <p className="balance-note">Progress saved on this device.</p>}</div><CountLeaderboard date={date} /></aside>
    </div>
  </section>;
}
