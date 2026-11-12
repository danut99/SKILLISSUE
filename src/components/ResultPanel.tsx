import { createTrackedChallenge, trackedChallengeUrl } from '../lib/trackedChallenges';
import { motion } from 'motion/react';
import { useState } from 'react';
import { MODE_INFO, MODES, REWARDED_ADS, type Mode } from '../config';
import { saveClip } from '../lib/clip';
import { useAuth } from '../lib/auth';
import { GuestProgressPrompt } from './GuestProgressPrompt';
import { NicknameControl } from './NicknameControl';
import { copyText, badgeFor, emojiRow, fmtResult, roastFor, shareText, toneFor } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, triesLeft, usePlayer, type Attempt } from '../lib/store';
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
  const ranks = useUi((s) => s.ranks);
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
    try {
      const challenge = await createTrackedChallenge(mode);
      const url = trackedChallengeUrl(location.href, challenge);
      useUi.getState().refreshBoards();
      toast(await copyText(url) ? 'Challenge link copied!' : 'Could not copy link. Open Friends to copy your challenge link.');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not create challenge.');
    } finally { setChallengeBusy(false); }
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

      <GuestProgressPrompt date={date} />

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
      {authStatus !== 'anon' && <NicknameControl date={date} />}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} mode={mode} snapshot={snapshot} attempt={shown} />
    </motion.div>
  );
}
