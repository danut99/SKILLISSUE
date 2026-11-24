import { GuestAccountNudge } from './GuestAccountNudge';
import { AccountCard } from './AccountCard';
import { DailyProgress } from './DailyProgress';
import { dailyMilestone, dailyProgress, nextDailyGame, isNewPersonalBest } from '../lib/engagement';
import { recordResultView, recordAccountPrompt } from '../lib/engagementTracking';
import { createTrackedChallenge, trackedChallengeUrl } from '../lib/trackedChallenges';
import { motion } from 'motion/react';
import { brakeFeedback } from '../lib/brakeChallenge';
import { useEffect, useRef, useState } from 'react';
import { challengeInviteText } from '../lib/challengeInvite';
import type { TrackedChallenge } from '../lib/trackedChallenges';
import { MODE_INFO, REWARDED_ADS, type Mode } from '../config';
import { saveClip } from '../lib/clip';
import { clipCaption, clipWebsite } from '../lib/clipScenes';
import { useAuth } from '../lib/auth';
import { ResponsiveSection } from './ResponsiveSection';
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
  const [sharingDay, setSharingDay] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const challengeRequest = useRef(false);
  const [preparedChallenge, setPreparedChallenge] = useState<TrackedChallenge | null>(null);
  const [challengeFallback, setChallengeFallback] = useState(false);
  const days = usePlayer((s) => s.days);
  const todayRanks = useUi((s) => s.ranks);
  const ranks = archived ? {} : todayRanks;
  const authStatus = useAuth((s) => s.status);

  const md = modeDay(days, date, mode);
  const best = bestAttempt(md);
  const shown = last ?? best;
  const left = triesLeft(md);
  const progress = dailyProgress(days, date);
  const next = archived ? null : nextDailyGame(days, date, mode);
  const milestone = archived ? null : dailyMilestone(days, date, mode, last);
  const streak = usePlayer(state => state.streak);
  const tone = shown ? toneFor(shown.score) : 'bad';
  const improvement = milestone?.improvement ?? 0;
  const personalRecord = !archived && isNewPersonalBest(days, date, mode, last);
  const achievementOffer = authStatus === 'anon' && !archived && left > 0 && last && (personalRecord || last.score >= 95);
  const achievementTitle = personalRecord ? `New personal best: ${last!.score.toFixed(1)} / 100.` : `Great score: ${last?.score.toFixed(1)} / 100.`;
  const accountTitle = archived ? 'Keep your challenge progress.' : progress.complete ? 'Your daily three are complete. Keep them.' : best && best.score > 0 ? `Save today’s ${best.score.toFixed(1)}-point best.` : 'Save your first day of progress.';
  const accountCopy = archived ? 'Keep your scores and unlocks across devices with a free account.' : streak > 1 ? `Keep your ${streak}-day streak and scores across devices.` : 'Save your score and keep your new daily streak across devices.';
  const canShareDay = progress.complete && !archived;

  useEffect(() => {
    if (shown && !archived) recordResultView(mode, date, shown.at);
  }, [mode, date, shown?.at, archived]);

  async function challengeFriend() {
    if (!best || challengeRequest.current) return;
    challengeRequest.current = true;
    setChallengeBusy(true);
    track(`challenge_friend_${mode}`);
    track('funnel_challenge_clicked');
    try {
      const challenge = preparedChallenge ?? await createTrackedChallenge(mode);
      if (!preparedChallenge) track('funnel_challenge_link_created');
      setPreparedChallenge(challenge);
      const url = trackedChallengeUrl(location.href, challenge);
      const text = challengeInviteText(mode, { score: challenge.creator_score, detail: challenge.creator_detail });
      useUi.getState().refreshBoards();
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try {
          await navigator.share({ title: 'Beat my score - Skilly', text, url });
          track('funnel_challenge_share_completed');
          setChallengeFallback(false);
          return;
        } catch (cause) {
          if ((cause as Error)?.name === 'AbortError') { track('funnel_challenge_share_cancelled'); return; }
          // Some phones require a second tap after the network request to open sharing.
          setChallengeFallback(true);
        }
      }
      if (await copyText(`${text}\n${url}`)) {
        track('funnel_challenge_copied');
        toast('Challenge and invitation copied. Send them to a friend!');
      } else {
        setChallengeFallback(true);
        toast('Your link is ready. Tap Share challenge or copy the link below.');
      }
    } catch (cause) {
      track('funnel_challenge_create_failed');
      toast(cause instanceof Error ? cause.message : 'Could not create challenge.');
    } finally { challengeRequest.current = false; setChallengeBusy(false); }
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
          {MODE_INFO[mode].name}
        </span>
        <span className="pill">
          {last ? `try ${md.tries.length}/${maxTries(md)}` : archived ? date : 'best today'}
        </span>
      </div>

      <div className="result-score-label">{mode === 'cut' ? 'Precision score' : mode === 'draw' ? 'Drawing accuracy' : 'Driving score'}</div>
      <div className={`r-big r-big-${mode} ${tone}`}><span>{shown ? shown.score.toFixed(1) : '\u2014'}</span><small>/ 100</small></div>
      {milestone && <div className={`result-record result-milestone ${milestone.kind}`} role="status"><b>{milestone.kind === 'first' ? 'Your first score today. Nice start.' : 'New best today. Look at you.'}</b>{milestone.kind === 'improved' && <span>{improvement < .01 ? 'A little closer than your previous best.' : `+${improvement.toFixed(improvement < .05 ? 2 : 1)} points over your previous best.`}</span>}</div>}
      {shown && <div className="result-measure"><span>{mode === 'cut' ? 'Your split' : mode === 'draw' ? 'Your shape' : 'Your stop'}</span><strong>{fmtResult(mode, shown)}</strong></div>}
      {!archived && <a className="game-rank-link" href={`/leaderboards?game=${mode}`}>{ranks[mode] ? `You're #${ranks[mode]} today` : 'See today\u2019s scores'}<span>View rankings <span aria-hidden="true">&#8594;</span></span></a>}
      <div className="r-actions">
        {left > 0 ? (
          <button className={`btn ${next ? 'btn-ghost' : 'btn-primary'} result-retry`} onClick={onRetry} aria-label={`Retry, ${left} ${left === 1 ? 'attempt' : 'attempts'} left`}>
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
        <button className={`btn ${next ? 'btn-primary' : 'btn-ghost'} result-next`} onClick={() => { track(next ? `next_game_${next}` : 'next_game_home'); onNext(next); }} aria-label={next ? `Play ${MODE_INFO[next].name}` : 'See daily total'}>
          {next ? <><PixelIcon name={next} size={28} /><span>Play {MODE_INFO[next].name}</span></> : 'Daily total'}
        </button>
      </div>
      <p className="result-progress-summary">{archived ? 'Past challenge. All-time score only.' : progress.complete ? 'All three played. Your best scores make today’s total.' : `${progress.played.length} of 3 daily games played. ${progress.remaining.length} to go.`}</p>
      {achievementOffer && <div className="result-save result-achievement-save"><div><b>{achievementTitle}</b><p>Keep your scores and personal records across devices with a free account.</p></div><a className="btn btn-ghost" href="/profile" onClick={() => recordAccountPrompt(personalRecord ? 'personal-best-result' : 'great-score-result')}>Save my progress</a></div>}
      {best && !archived && <div className="result-challenge-invite">
        <button className="btn btn-ghost result-challenge-button" disabled={challengeBusy} onClick={() => void challengeFriend()}>{challengeBusy ? 'Creating challenge?' : challengeFallback ? 'Share challenge' : 'Challenge a friend'}</button>
        <p>Can they beat your <strong>{(preparedChallenge?.creator_score ?? best.score).toFixed(1)} / 100</strong>?</p>
        {challengeFallback && preparedChallenge && <label className="challenge-link-fallback">Your challenge link<input aria-label="Your challenge link" readOnly value={trackedChallengeUrl(location.href, preparedChallenge)} onFocus={event => event.currentTarget.select()} /></label>}
      </div>}
      {!archived && authStatus === 'anon' && left === 0 && <div className="extra-tries-offer"><b>Want 3 more tries?</b><p>Continue with Google for 8 tries per daily game, every day. Your current scores stay saved.</p><AccountCard compact source="extra-tries-result" /></div>}
      {last && !archived && <GuestAccountNudge date={date} mode={mode} attemptAt={last.at} blocked={shareOpen || challengeBusy} />}
      <div className="result-secondary"><ResponsiveSection title="Details, sharing & progress">
      {shown && (mode === 'brake'
        ? <div className="r-sub brake-feedback"><b>{brakeFeedback(shown.score, shown.detail).title}</b><span>{brakeFeedback(shown.score, shown.detail).tip}</span></div>
        : <div className="r-sub">{roastFor(mode, shown)}</div>)}
      <div className="r-badge">{badgeFor(mode, best)}</div>
      <div className="r-best">
        {archived ? `best on ${date}` : 'best today'}: <b>{fmtResult(mode, best)}</b> <span className="emojis">{emojiRow(md)}</span>
        {ranks[mode] ? <> · rank <b>#{ranks[mode]}</b></> : null}
      </div>


      {!archived && <DailyProgress date={date} current={mode} onPlay={onNext} showAccount={!achievementOffer && left > 0} />}
      <div className="result-sharing">
        <button className="btn btn-primary result-sharing-main" onClick={() => { setSharingDay(false); track(`share_open_${mode}`); setShareOpen(true); }}>
          Share this result <span aria-hidden="true">&#8599;</span>
        </button>
        <div className="result-sharing-options">
      {canShareDay && <button className="btn btn-ghost" onClick={() => { setSharingDay(true); track('share_open_day'); setShareOpen(true); }}>Share daily total</button>}
        {clip && (
          <button className="btn btn-pink" onClick={downloadClip}>
            Save video
          </button>
        )}
        </div>
        <a className="challenge-manage" href="/friends">View your challenges <span aria-hidden="true">&#8594;</span></a>
      </div>


      <div className="saved-row">
        <span className="saved-ok">
          {archived
            ? 'counts in the all-time leaderboard only'
            : last && best && last.score < best.score
            ? `your best (${fmtResult(mode, best)}) stays on the board`
            : "Your best score counts."}
        </span>
        {ranks[mode] ? <span className="saved-rank">#{ranks[mode]}</span> : null}
      </div>
      {authStatus === 'anon' && !achievementOffer && left > 0 && (!progress.complete || archived) && <div className="result-save"><div><b>{accountTitle}</b><p>{accountCopy}</p></div><a className="btn btn-ghost" href="/profile" onClick={() => recordAccountPrompt('result-achievement')}>Save my score &amp; streak</a></div>}
      {authStatus !== 'anon' && <NicknameControl date={date} />}
      </ResponsiveSection></div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} mode={sharingDay ? undefined : mode} snapshot={sharingDay ? null : snapshot} attempt={sharingDay ? null : shown} noRank={archived} />
    </motion.div>
  );
}
