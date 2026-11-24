import { useEffect, useMemo, useState } from 'react';
import { MODE_INFO, MODES, type Mode } from '../config';
import { saveClip } from '../lib/clip';
import { clipHook, clipWebsite } from '../lib/clipScenes';
import { makeCompilation } from '../lib/compilation';
import { calendar, captionVariants, creatorClipOptions, deleteCreatorClip, loadCreatorClips, planFor, seriesDay, useCreator, type StoredClip } from '../lib/creator';
import { dayNumber } from '../lib/daily';
import { copyText, fmtResult } from '../lib/scoring';
import { bestAttempt, modeDay, usePlayer } from '../lib/store';
import { toast } from '../lib/ui';
import { PixelIcon } from './PixelIcon';

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (date: string) => WEEKDAY.format(new Date(`${date}T00:00:00Z`));

/** Secret creator studio (#creator): daily content calendar, every try's clip, 5-tries videos, captions. */
export function CreatorPage({ date, onPlay }: { date: string; onPlay: (mode: Mode) => void }) {
  const creator = useCreator();
  if (!creator.enabled) {
    return (
      <section className="screen creator">
        <div className="card px-box creator-off">
          <h2>Creator studio</h2>
          <p>Tools for posting SKILLY videos: a daily content calendar, every try saved as a clip, "5 tries" videos and ready captions.</p>
          <p className="muted">Only turns on for this device. Players never see it.</p>
          <button className="btn btn-primary" onClick={() => creator.setEnabled(true)}>Turn on creator mode</button>
        </div>
      </section>
    );
  }
  return <Studio date={date} onPlay={onPlay} />;
}

function Studio({ date, onPlay }: { date: string; onPlay: (mode: Mode) => void }) {
  const creator = useCreator();
  const focusMode = () => planFor(date).mode;
  const days = usePlayer((s) => s.days);
  const plan = planFor(date);
  const [focus, setFocus] = useState<Mode>(plan.mode);
  const [clips, setClips] = useState<StoredClip[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => { void loadCreatorClips(date).then(setClips); }, [date, version]);

  const best = bestAttempt(modeDay(days, date, focus));
  const site = clipWebsite();
  const captions = captionVariants(focus, date, best ? fmtResult(focus, best) : null, site);

  return (
    <section className="screen creator">
      <header className="page-intro"><span className="eyebrow">MAKE SOMETHING WORTH SHARING</span><h1>Creator studio<span>.</span></h1><p>Record a try, pick your best moment, and give people a score to beat.</p></header>

      <div className="card px-box creator-today">
        <div className="eyebrow">today · #{dayNumber(date)} · {dayLabel(date)}</div>
        <h3><PixelIcon name={plan.mode} size={32} /> {MODE_INFO[plan.mode].name}: {plan.idea.title}</h3>
        <p>{plan.idea.how}</p>
        <div className="creator-row">
          <button className="btn btn-primary" onClick={() => onPlay(plan.mode)}>Play {MODE_INFO[plan.mode].name} & record</button>
          <label className="creator-check"><input type="checkbox" checked={!!creator.posted[date]} onChange={() => creator.togglePosted(date)} /> posted today</label>
        </div>
      </div>

      <div className="card px-box">
        <div className="creator-head">
          <h3>Captions</h3>
          <div className="creator-tabs" role="group" aria-label="Caption game">
            {MODES.map((m) => <button key={m} aria-pressed={focus === m} onClick={() => setFocus(m)}>{MODE_INFO[m].name}</button>)}
          </div>
        </div>
        {captions.map((caption, i) => (
          <div className="creator-caption" key={i}>
            <pre>{caption}</pre>
            <button className="btn btn-ghost" onClick={async () => toast(await copyText(caption) ? 'Caption copied 📋' : 'Could not copy')}>Copy</button>
          </div>
        ))}
      </div>

      <TodayClips date={date} clips={clips} onChange={() => setVersion((v) => v + 1)} />

      <div className="card px-box creator-settings">
        <h3>Recording</h3>
        <label className="creator-check"><input type="checkbox" checked={creator.clean} onChange={(e) => creator.setClean(e.target.checked)} /> Clean screen: hide ads, companions and leaderboards while playing</label>
        <label className="creator-check">
          <input type="checkbox" checked={!!creator.seriesStart} onChange={(e) => creator.setSeriesStart(e.target.checked ? date : null)} />
          Series line on clips{creator.seriesStart ? `: "Day ${seriesDay(creator.seriesStart, date)} of trying to…" (started ${creator.seriesStart})` : ''}
        </label>
        {creator.seriesStart && <button className="link-btn" onClick={() => creator.setSeriesStart(date)}>Restart series from day 1</button>}
        <label className="creator-field">
          Custom top line (replaces the series line and the default challenge; leave empty to use them)
          <input value={creator.hook} maxLength={40} placeholder="e.g. my mom vs me 😤" onChange={(e) => creator.setHook(e.target.value)} />
        </label>
        <p className="creator-video-note">New recordings use the Skilly wordmark, readable scores and a clear challenge. Existing saved clips keep their original design.</p><p className="muted">Your clips will open with: <b>"{creatorClipOptions(focusMode(), date).hook ?? clipHook(focusMode(), dayNumber(date))}"</b></p>
      </div>

      <CalendarList date={date} />

      <p className="footer-note"><button className="link-btn" onClick={() => creator.setEnabled(false)}>Turn off creator mode on this device</button></p>
    </section>
  );
}

function TodayClips({ date, clips, onChange }: { date: string; clips: StoredClip[]; onChange: () => void }) {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [progress, setProgress] = useState(0);
  const [compiled, setCompiled] = useState<{ mode: Mode; blob: Blob; ext: string } | null>(null);
  const site = clipWebsite();
  const urls = useMemo(() => new Map(clips.map((clip) => [clip, URL.createObjectURL(clip.blob)])), [clips]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  const compiledUrl = useMemo(() => (compiled ? URL.createObjectURL(compiled.blob) : null), [compiled]);
  useEffect(() => () => { if (compiledUrl) URL.revokeObjectURL(compiledUrl); }, [compiledUrl]);

  async function compile(mode: Mode, list: StoredClip[]) {
    setBusy(mode);
    setProgress(0);
    setCompiled(null);
    try {
      const video = await makeCompilation(list.slice(-5), mode, { onProgress: setProgress });
      if (video) setCompiled({ mode, ...video });
      else toast('Could not make the video on this browser 😵');
    } finally {
      setBusy(null);
    }
  }

  async function share(blob: Blob, ext: string, name: string, caption: string) {
    void copyText(caption);
    const result = await saveClip(blob, `${name}.${ext}`, caption);
    if (result !== 'cancelled') toast('Caption copied 📋 paste it in TikTok');
  }

  return (
    <div className="card px-box">
      <h3>Today's clips</h3>
      {!clips.length && <p className="muted">Play a game: every try is saved here automatically (kept for 3 days on this device).</p>}
      {MODES.map((mode) => {
        const list = clips.filter((clip) => clip.mode === mode);
        if (!list.length) return null;
        const best = list.reduce((a, b) => (b.score > a.score ? b : a));
        return (
          <div className="creator-game" key={mode}>
            <div className="creator-head">
              <b style={{ color: MODE_INFO[mode].color }}>{MODE_INFO[mode].name} · {list.length} {list.length === 1 ? 'try' : 'tries'}</b>
              {list.length >= 2 && (
                <button className="btn btn-primary" disabled={!!busy} onClick={() => void compile(mode, list)}>
                  {busy === mode ? `Making video… ${Math.round(progress * 100)}%` : `Make ${Math.min(5, list.length)}-tries video`}
                </button>
              )}
            </div>
            {busy === mode && <p className="muted">Keep this tab open: the video plays through once while it's being made.</p>}
            {compiled?.mode === mode && compiledUrl && (
              <div className="creator-compiled">
                <video src={compiledUrl} controls playsInline />
                <button className="btn btn-pink" onClick={() => void share(compiled.blob, compiled.ext, `skilly-${mode}-5-tries`, captionVariants(mode, date, best.label, site)[1])}>Share 5-tries video</button>
              </div>
            )}
            <div className="creator-clips">
              {list.map((clip, i) => (
                <div className={`creator-clip ${clip === best ? 'best' : ''}`} key={clip.id ?? clip.at}>
                  <video src={urls.get(clip)} controls playsInline preload="metadata" />
                  <span>#{i + 1} · {clip.label}{clip === best ? ' · best' : ''}</span>
                  <div className="creator-row">
                    <button className="btn btn-ghost" onClick={() => void share(clip.blob, clip.ext, `skilly-${mode}-${i + 1}`, captionVariants(mode, date, clip.label, site)[0])}>Share</button>
                    <button className="link-btn" onClick={async () => { if (clip.id !== undefined) await deleteCreatorClip(clip.id); onChange(); }}>delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarList({ date }: { date: string }) {
  const posted = useCreator((s) => s.posted);
  const togglePosted = useCreator((s) => s.togglePosted);
  return (
    <div className="card px-box">
      <h3>Content calendar</h3>
      <p className="muted">One post a day. Cut gets most days because it's the most popular game.</p>
      <ol className="creator-calendar">
        {calendar(date).map((day) => (
          <li key={day.date} className={`${day.date === date ? 'today' : ''} ${day.date < date ? 'past' : ''} ${posted[day.date] ? 'done' : ''}`}>
            <input type="checkbox" aria-label={`Posted on ${day.date}`} checked={!!posted[day.date]} onChange={() => togglePosted(day.date)} />
            <span className="cal-date">{dayLabel(day.date)}<small>#{day.day}</small></span>
            <PixelIcon name={day.mode} size={26} />
            <span className="cal-idea"><b>{day.idea.title}</b><small>{MODE_INFO[day.mode].name}</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
