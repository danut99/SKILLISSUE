import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
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
import { siteUrl, type Mode } from '../config';
import { copyText, shareText } from '../lib/scoring';
import { cardFileName, renderShareCard } from '../lib/shareCard';
import { toast, useUi } from '../lib/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  /** omit for the whole-day card */
  mode?: Mode;
  snapshot?: HTMLCanvasElement | null;
  /** the try that was just played (defaults to today's best) */
  attempt?: import('../lib/store').Attempt | null;
}

/** Share card preview + TikTok / Instagram (image via share sheet or download) + link-based socials. */
export function ShareModal({ open, onClose, date, mode, snapshot, attempt }: Props) {
  const ranks = useUi((s) => s.ranks);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rank = mode ? ranks[mode] : ranks.overall;
  const text = shareText(date, ranks, mode);
  const link = siteUrl();
  const short = text.split('\n').slice(0, -1).join('\n'); // without the URL (buttons add it)

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let objectUrl: string | null = null;
    renderShareCard({ date, mode, attempt, rank, snapshot })
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
  }, [open, date, mode, attempt, rank, snapshot]);

  const file = blob ? new File([blob], cardFileName(date, mode), { type: 'image/png' }) : null;
  const canShareFile = !!file && !!navigator.canShare?.({ files: [file] });

  function download() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = cardFileName(date, mode);
    a.click();
  }

  /** TikTok & Instagram have no web share links → native share sheet with the image, else download. */
  async function shareImage(app?: 'TikTok' | 'Instagram') {
    if (!file) return;
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
    toast((await copyText(text)) ? 'Text copied 📋' : "Couldn't copy 😵");
  }

  const size = 44;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="modal-box px-box share-box"
            role="dialog"
            aria-label="Share"
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" onClick={onClose} aria-label="Close">
              ×
            </button>
            <div className="eyebrow">share your shame</div>

            <div className="share-preview">{url ? <img src={url} alt="Your share card" /> : <div className="share-loading">drawing…</div>}</div>

            <div className="share-main">
              <button className="btn btn-pink" onClick={() => shareImage('TikTok')} disabled={!file}>
                TikTok
              </button>
              <button className="btn btn-insta" onClick={() => shareImage('Instagram')} disabled={!file}>
                Instagram
              </button>
              {canShareFile && (
                <button className="btn btn-primary" onClick={() => shareImage()} disabled={!file}>
                  more…
                </button>
              )}
            </div>

            <div className="share-socials">
              <FacebookShareButton url={link} hashtag="#skillissue" aria-label="Share on Facebook">
                <FacebookIcon size={size} />
              </FacebookShareButton>
              <XShareButton url={link} text={short} aria-label="Share on X">
                <XIcon size={size} />
              </XShareButton>
              <WhatsappShareButton url={link} message={short} separator={'\n'} aria-label="Share on WhatsApp">
                <WhatsappIcon size={size} />
              </WhatsappShareButton>
              <TelegramShareButton url={link} text={short} aria-label="Share on Telegram">
                <TelegramIcon size={size} />
              </TelegramShareButton>
              <ThreadsShareButton url={link} text={short} aria-label="Share on Threads">
                <ThreadsIcon size={size} />
              </ThreadsShareButton>
              <BlueskyShareButton url={link} text={short} aria-label="Share on Bluesky">
                <BlueskyIcon size={size} />
              </BlueskyShareButton>
              <RedditShareButton url={link} shareTitle={short.split('\n')[0]} aria-label="Share on Reddit">
                <RedditIcon size={size} />
              </RedditShareButton>
            </div>

            <div className="share-row">
              <button className="btn btn-ghost" onClick={download} disabled={!url}>
                save image
              </button>
              <button className="btn btn-ghost" onClick={copy}>
                copy text
              </button>
            </div>
            <p className="share-hint">TikTok &amp; Instagram: on your phone the card opens the share sheet. On a computer it downloads, then upload it in the app.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
