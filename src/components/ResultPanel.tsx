import { createTrackedChallenge, trackedChallengeUrl } from '../lib/trackedChallenges';
import { motion } from 'motion/react';
import { brakeFeedback } from '../lib/brakeChallenge';
import { useState } from 'react';
import { MODE_INFO, MODES, REWARDED_ADS, type Mode } from '../config';
import { saveClip } from '../lib/clip';
import { clipCaption, clipWebsite } from '../lib/clipScenes';
import { useAuth } from '../lib/auth';
import { GuestProgressPrompt } from './GuestProgressPrompt';
import { GuestAccountNudge } from './GuestAccountNudge';
import { NicknameControl } from './NicknameControl';
import { copyText, badgeFor, emojiRow, fmtResult, roastFor, toneFor } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, triesLeft, usePlayer, type Attempt } from '../lib/store';
import { toast, useUi } from '../lib/ui';
import { track } from '../lib/clarity';
import { Countdown } from './Countdown';
import { PixelIcon } from './PixelIcon';
import { ShareModal } from './ShareModal';

interface Props {
  mode: Mode;
  date: string;
  /** the attempt just played, or null when showing "best of today" on return or out of tries */
  last: Attempt | null;
  clip: { blob: Blob; ext: string } | null;
  snapshot: HTMLCanvasElement | null;
  onRetry: () => void;
  onWatchAd: () => void;
  onNext: (mode: Mode | null) => void;
  /** Replaying a past day's challenge: all-time only, no daily rank. */
  archived?: boolean;
}

export function ResultPanel({ mode, date, last, clip, snapshot, onRetry, onWatchAd, onNext, archived = false }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const days = usePlayer((s) => s.days);
  const todayRanks = useUi((s) => s.ranks);
  const ranks = archived ? {} : todayRanks;
  const authStatus = useAuth((s) => s.status);

  const md = modeDay(days, date, mode);
  const best = bestAttempt(md);
  const shown = last ?? best;
  const left = triesLeft(md);
  const next = MODES[MODES.indexOf(mode) + 1] ?? null;
  const tone = shown ? toneFor(shown.score) : 'bad';

  async function challengeFriend() {
    if (!best || challengeBusy) return;
    setChallengeBusy(true);
    track(`challenge_friend_${mode}`);
    try {
      const challenge = await createTrackedChallenge(mode);
      const url = trackedChallengeUrl(location.href, challenge);
      useUi.getState().refreshBoards();
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: 'Beat my score - Skilly', text: `Can you beat my ${MODE_INFO[mode].title} score?`, url }); return; }
        catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') return; }
      }
      toast(await copyText(url) ? 'Challenge link copied!' : 'Could not copy link. Open Friends to copy your challenge link.');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not create challenge.');
    } finally { setChallengeBusy(false); }
  }

  async function downloadClip() {
    if (!clip || !shown) return;
    track(`clip_save_${mode}`);
    const name = `skilly-${mode}-${fmtResult(mode, shown).replace(/[^\w.]+/g, '_')}.${clip.ext}`;
    const caption = clipCaption(mode, fmtResult(mode, shown), clipWebsite(), !archived);
    // Copy without awaiting so the share sheet still opens inside the tap's user gesture.
    const copied = navigator.clipboard?.writeText(caption).then(() => true, () => false) ?? Promise.resolve(false);
    const r = await saveClip(clip.blob, name, caption);
    if (r === 'cancelled') return;
    toast(await copied ? 'Clip ready 🎬 Caption copied, paste it in TikTok!' : 'Clip saved 🎬 Upload it to TikTok!');
  }

  return (
    <motion.div
      className="card px-box result-card"
      initial={{ opacity: 0, y: 24, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
    >
      <div className="r-top">
        <span className="pill">
          {MODE_INFO[mode].title}
        </span>
        <span className="pill">
          {last ? `try ${md.tries.length}/${maxTries(md)}` : archived ? date : 'best today'}
        </span>
      </div>

      <div className={`r-big r-big-${mode} ${tone}`}>{shown ? fmtResult(mode, shown) : '—'}</div>
      {shown && (mode === 'brake'
        ? <div className="r-sub brake-feedback"><b>{brakeFeedback(shown.score, shown.detail).title}</b><span>{brakeFeedback(shown.score, shown.detail).tip}</span></div>
        : <div className="r-sub">{roastFor(mode, shown)}</div>)}
      <div className="r-badge">{badgeFor(mode, best)}</div>
      <div className="r-best">
        {archived ? `best on ${date}` : 'best today'}: <b>{fmtResult(mode, best)}</b> <span className="emojis">{emojiRow(md)}</span>
        {ranks[mode] ? <> · rank <b>#{ranks[mode]}</b></> : null}
      </div>


      <div className="r-actions">
        {left > 0 ? (
          <button className="btn btn-primary result-retry" onClick={onRetry} aria-label={`Retry, ${left} ${left === 1 ? 'attempt' : 'attempts'} left`}>
            <span aria-hidden="true">&#8635;</span> Retry <span className="retry-count" aria-hidden="true">{left}</span>
          </button>
        ) : REWARDED_ADS && !archived && !md.bonus ? (
          <button className="btn btn-ad" onClick={onWatchAd}>
            watch ad → +1 try
          </button>
        ) : (
          <div className="out">
            {archived ? 'no tries left for that day' : <>no tries left · new day in <Countdown /></>}
          </div>
        )}
        <button className="btn btn-ghost result-next" onClick={() => { track(next ? `next_game_${next}` : 'next_game_home'); onNext(next); }} aria-label={next ? `Next: ${MODE_INFO[next].title}` : 'Back home'}>
          {next ? <><PixelIcon name={next} size={28} /><span>Next</span><span aria-hidden="true">&#8594;</span></> : 'Home'}
        </button>
      </div>
      {best && !archived && <button className="btn btn-primary challenge-cta" disabled={challengeBusy} onClick={() => void challengeFriend()}>{challengeBusy ? 'Creating link...' : 'Challenge a friend'} <span aria-hidden="true">&#8599;</span></button>}
      <div className="r-actions result-share-actions">
        {clip && (
          <button className="btn btn-pink" onClick={downloadClip}>
            Save video
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => { track(`share_open_${mode}`); setShareOpen(true); }}>
          Share result
        </button>
      </div>


      <a className="challenge-manage" href="#friends">Your challenges &amp; responses</a>
      <div className="saved-row">
        <span className="saved-ok">
          {archived
            ? 'counts in the all-time leaderboard only'
            : last && best && last.score < best.score
            ? `your best (${fmtResult(mode, best)}) stays on the board`
            : "saved to today's top 10"}
        </span>
        {ranks[mode] ? <span className="saved-rank">#{ranks[mode]}</span> : null}
      </div>
      <GuestProgressPrompt date={date} />
      {last && !archived && <GuestAccountNudge date={date} attemptAt={last.at} blocked={shareOpen || challengeBusy} />}
      {authStatus !== 'anon' && <NicknameControl date={date} />}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} mode={mode} snapshot={snapshot} attempt={shown} noRank={archived} />
    </motion.div>
  );
}
