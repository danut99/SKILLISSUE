import { createTrackedChallenge, trackedChallengeUrl } from '../lib/trackedChallenges';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { MODE_INFO, MODES, REWARDED_ADS, type Mode } from '../config';
import { saveClip } from '../lib/clip';
import { claimNickname } from '../lib/leaderboard';
import { useAuth } from '../lib/auth';
import { AccountCard } from './AccountCard';
import { copyText, badgeFor, emojiRow, fmtResult, roastFor, shareText, toneFor } from '../lib/scoring';
import { bestAttempt, cleanNickname, maxTries, modeDay, triesLeft, usePlayer, type Attempt } from '../lib/store';
import { toast, useUi } from '../lib/ui';
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
}

export function ResultPanel({ mode, date, last, clip, snapshot, onRetry, onWatchAd, onNext }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const days = usePlayer((s) => s.days);
  const nickname = usePlayer((s) => s.nickname);
  const setNickname = usePlayer((s) => s.setNickname);
  const ranks = useUi((s) => s.ranks);
  const authStatus = useAuth((s) => s.status);
  const refreshBoards = useUi((s) => s.refreshBoards);
  const [nick, setNick] = useState(nickname);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const md = modeDay(days, date, mode);
  const best = bestAttempt(md);
  const shown = last ?? best;
  const left = triesLeft(md);
  const next = MODES[MODES.indexOf(mode) + 1] ?? null;
  const tone = shown ? toneFor(shown.score) : 'bad';

  async function challengeFriend() {
    if (!best || challengeBusy) return;
    setChallengeBusy(true);
    try {
      const challenge = await createTrackedChallenge(mode);
      const url = trackedChallengeUrl(location.href, challenge);
      const text = `${challenge.creator_name} scored ${fmtResult(mode, { score: challenge.creator_score, detail: challenge.creator_detail })} in ${MODE_INFO[mode].title}. Beat my score!`;
      useUi.getState().refreshBoards();
      if (navigator.share) {
        try { await navigator.share({ title: 'Beat my score - SKILL ISSUE', text, url }); return; }
        catch (error) { if ((error as Error).name === 'AbortError') return; }
      }
      toast(await copyText(`${text}\n${url}`) ? 'Challenge link copied! Track responses in Friends.' : 'Open Friends to copy your challenge link.');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not create challenge.');
    } finally { setChallengeBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanNickname(nick);
    if (!clean) return toast('Pick a nickname first 🙃');
    if (clean === nickname) return setEditing(false);
    setBusy(true);
    try {
      const r = await claimNickname(date, clean);
      if (!r.ok) {
        toast(r.reason === 'taken' ? `"${clean}" is taken 😤 pick another` : 'Leaderboard hiccup. Try again 😵');
        return;
      }
      setNickname(r.nickname);
      setNick(r.nickname);
      setEditing(false);
      toast(`You're now ${r.nickname} 😎`);
      refreshBoards();
    } catch {
      toast('Leaderboard hiccup. Try again 😵');
    } finally {
      setBusy(false);
    }
  }


  async function downloadClip() {
    if (!clip || !shown) return;
    const name = `skill-issue-${mode}-${fmtResult(mode, shown).replace(/[^\w.]+/g, '_')}.${clip.ext}`;
    const r = await saveClip(clip.blob, name, shareText(date, ranks, mode));
    if (r === 'downloaded') toast('Clip saved 🎬 Upload it to TikTok!');
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
          {last ? `try ${md.tries.length}/${maxTries(md)}` : 'best today'}
        </span>
      </div>

      <div className={`r-big r-big-${mode} ${tone}`}>{shown ? fmtResult(mode, shown) : '—'}</div>
      {shown && <div className="r-sub">{roastFor(mode, shown)}</div>}
      <div className="r-badge">{badgeFor(mode, best)}</div>
      <div className="r-best">
        best today: <b>{fmtResult(mode, best)}</b> <span className="emojis">{emojiRow(md)}</span>
        {ranks[mode] ? <> · rank <b>#{ranks[mode]}</b></> : null}
      </div>

      <div className="r-actions">
        {left > 0 ? (
          <button className="btn btn-primary result-retry" onClick={onRetry} aria-label={`Retry, ${left} ${left === 1 ? 'attempt' : 'attempts'} left`}>
            <span aria-hidden="true">&#8635;</span> Retry <span className="retry-count" aria-hidden="true">{left}</span>
          </button>
        ) : REWARDED_ADS && !md.bonus ? (
          <button className="btn btn-ad" onClick={onWatchAd}>
            watch ad → +1 try
          </button>
        ) : (
          <div className="out">
            no tries left · new day in <Countdown />
          </div>
        )}
        <button className="btn btn-ghost result-next" onClick={() => onNext(next)} aria-label={next ? `Next: ${MODE_INFO[next].title}` : 'Back home'}>
          {next ? <><PixelIcon name={next} size={28} /><span>Next</span><span aria-hidden="true">&#8594;</span></> : 'Home'}
        </button>
      </div>
      <div className="r-actions">
        {clip && (
          <button className="btn btn-pink" onClick={downloadClip}>
            save clip for TikTok
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setShareOpen(true)}>
          share result
        </button>
      </div>

      {best && <button className="btn btn-primary challenge-cta" disabled={challengeBusy} onClick={() => void challengeFriend()}>{challengeBusy ? 'Creating link...' : 'Beat my score'} <span aria-hidden="true">&#8599;</span></button>}
      <a className="challenge-manage" href="#friends">Your challenges &amp; responses</a>
      <div className="saved-row">
        <span className="saved-ok">
          {last && best && last.score < best.score
            ? `your best (${fmtResult(mode, best)}) stays on the board`
            : "saved to today's top 10"}
        </span>
        {ranks[mode] ? <span className="saved-rank">#{ranks[mode]}</span> : null}
      </div>
      {editing ? (
        <form className="nick-form" onSubmit={submit}>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value.slice(0, 15))}
            maxLength={15}
            placeholder="new nickname"
            aria-label="Nickname"
            autoComplete="nickname"
            enterKeyHint="done"
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '…' : 'save'}
          </button>
        </form>
      ) : (
        <div className="nick-status">
          playing as <b>{nickname}</b>{' '}
          <button className="link-btn" onClick={() => setEditing(true)}>
            change name
          </button>
        </div>
      )}
      {authStatus === 'anon' && <AccountCard compact />}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} mode={mode} snapshot={snapshot} attempt={shown} />
    </motion.div>
  );
}
