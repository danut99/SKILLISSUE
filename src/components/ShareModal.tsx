import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BlueskyIcon,
  BlueskyShareButton,
  FacebookIcon,
  FacebookShareButton,
  RedditIcon,
  RedditShareButton,
  TelegramIcon,
  TelegramShareButton,
  ThreadsIcon,
  ThreadsShareButton,
  WhatsappIcon,
  WhatsappShareButton,
  XIcon,
  XShareButton,
} from 'react-share';
import { MODE_INFO, siteUrl, type Mode } from '../config';
import { copyText, fmtResult, shareText } from '../lib/scoring';
import { bestAttempt, modeDay, usePlayer } from '../lib/store';
import { challengeUrl } from '../lib/scoreChallenge';
import { cardFileName, renderShareCard } from '../lib/shareCard';
import { toast, useUi } from '../lib/ui';
import { track } from '../lib/clarity';

export interface CustomShare {
  text: string;
  link: string;
  filename: string;
  render: () => Promise<Blob>;
}

interface Props {
  custom?: CustomShare;
  open: boolean;
  onClose: () => void;
  date: string;
  /** omit for the whole-day card */
  mode?: Mode;
  snapshot?: HTMLCanvasElement | null;
  /** the try that was just played (defaults to today's best) */
  attempt?: import('../lib/store').Attempt | null;
  /** past-day challenge replays have no daily rank */
  noRank?: boolean;
}

/** Share card preview + TikTok / Instagram (image via share sheet or download) + link-based socials. */
export function ShareModal({ open, onClose, date, mode, snapshot, attempt, noRank = false, custom }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const liveRanks = useUi((s) => s.ranks);
  const ranks = noRank ? {} : liveRanks;
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rank = mode ? ranks[mode] : ranks.overall;
  const days = usePlayer(state => state.days);
  const nickname = usePlayer(state => state.nickname);
  const shareLink = usePlayer(state => state.settings.shareLink);
  const target = mode ? attempt ?? bestAttempt(modeDay(days, date, mode)) : null;
  const link = custom?.link ?? (mode && target ? challengeUrl(siteUrl(), mode, date, nickname, target) : siteUrl());
  const singleResult = mode && target ? `SKILLY ${MODE_INFO[mode].name}: ${target.score.toFixed(1)} / 100\n${fmtResult(mode, target)} · ${date}\nCan you beat this score?${shareLink ? `\n${link}` : ''}` : null;
  const text = custom?.text ?? singleResult ?? shareText(date, ranks, mode);
  const filename = custom?.filename ?? cardFileName(date, mode);
  const short = text.split('\n').filter(line => line !== link).join('\n'); // buttons add the URL

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let objectUrl: string | null = null;
    (custom ? custom.render() : renderShareCard({ date, mode, attempt, rank, snapshot }))
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch(() => toast("Couldn't draw the card 😵"));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlob(null);
      setUrl(null);
    };
  }, [open, date, mode, attempt, rank, snapshot, custom]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [open, onClose]);

  const file = blob ? new File([blob], filename, { type: 'image/png' }) : null;
  const canShareFile = !!file && !!navigator.canShare?.({ files: [file] });

  const shared = (channel: string) => track(`share_${channel}_${mode ?? 'day'}`);

  function download() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  /** TikTok & Instagram have no web share links → native share sheet with the image, else download. */
  async function shareImage(app?: 'TikTok' | 'Instagram') {
    if (!file) return;
    shared(app?.toLowerCase() ?? 'native');
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    download();
    await copyText(text);
    toast(app ? `Card saved + text copied. Open ${app} and upload it 📲` : 'Card saved + text copied 📋');
  }

  async function copy() {
    shared('copy_text');
    toast((await copyText(text)) ? 'Text copied 📋' : "Couldn't copy 😵");
  }

  const size = 36;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="modal-box px-box share-box"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="close-x" onClick={onClose} aria-label="Close">&times;</button>
            <header className="share-header">
              <div className="eyebrow">CHALLENGE YOUR FRIENDS</div>
              <h2 id="share-title">Can they beat you?</h2>
              <p>Your score. Their next challenge.</p>
            </header>
            <div className="share-preview">{url ? <img src={url} alt="Your result card, ready to share" /> : <div className="share-loading" role="status">Creating your card?</div>}</div>
            <button className="btn btn-primary share-native" onClick={() => void shareImage()} disabled={!file}>{!file ? 'Creating card?' : canShareFile ? 'Share result' : 'Download result'}</button>
            <div className="share-row">
              <button className="btn btn-ghost" onClick={copy}>Copy caption</button>
              <button className="btn btn-ghost" onClick={() => { shared('copy_link'); void copyText(link).then(ok => toast(ok ? 'Link copied!' : 'Could not copy link.')); }}>Copy link</button>
            </div>
            <details className="share-options">
              <summary>More sharing options</summary>
              <div className="share-options-body">
            <div className="share-main">
              <button className="btn btn-pink" onClick={() => shareImage('TikTok')} disabled={!file}>
                TikTok
              </button>
              <button className="btn btn-insta" onClick={() => shareImage('Instagram')} disabled={!file}>
                Instagram
              </button>
            </div>

            <div className="share-socials">
              <FacebookShareButton beforeOnClick={() => shared('facebook')} url={link} hashtag="#skilly" aria-label="Share on Facebook">
                <FacebookIcon size={size} />
              </FacebookShareButton>
              <XShareButton beforeOnClick={() => shared('x')} url={link} text={short} aria-label="Share on X">
                <XIcon size={size} />
              </XShareButton>
              <WhatsappShareButton beforeOnClick={() => shared('whatsapp')} url={link} message={short} separator={'\n'} aria-label="Share on WhatsApp">
                <WhatsappIcon size={size} />
              </WhatsappShareButton>
              <TelegramShareButton beforeOnClick={() => shared('telegram')} url={link} text={short} aria-label="Share on Telegram">
                <TelegramIcon size={size} />
              </TelegramShareButton>
              <ThreadsShareButton beforeOnClick={() => shared('threads')} url={link} text={short} aria-label="Share on Threads">
                <ThreadsIcon size={size} />
              </ThreadsShareButton>
              <BlueskyShareButton beforeOnClick={() => shared('bluesky')} url={link} text={short} aria-label="Share on Bluesky">
                <BlueskyIcon size={size} />
              </BlueskyShareButton>
              <RedditShareButton beforeOnClick={() => shared('reddit')} url={link} shareTitle={short.split('\n')[0]} aria-label="Share on Reddit">
                <RedditIcon size={size} />
              </RedditShareButton>
            </div>

              </div>
            </details>
            <p className="share-hint">{canShareFile ? 'Share the card to your favorite app.' : 'For Instagram or TikTok, download your card and upload it in the app.'}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
