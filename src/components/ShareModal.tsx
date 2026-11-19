import { ResponsiveSection } from './ResponsiveSection';
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
  const liveRanks = useUi((s) => s.ranks);
  const ranks = noRank ? {} : liveRanks;
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rank = mode ? ranks[mode] : ranks.overall;
  const text = custom?.text ?? shareText(date, ranks, mode);
  const link = custom?.link ?? siteUrl();
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

            <button className="btn btn-primary share-native" onClick={() => void shareImage()} disabled={!file}>{canShareFile ? 'Share result' : 'Save image'}</button>
            <ResponsiveSection title="More sharing options">
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

            <button className="btn btn-ghost wide" onClick={copy}>Copy caption</button>
            </ResponsiveSection>
            <div className="share-row">
              <button className="btn btn-ghost" onClick={() => { shared('save_image'); download(); }} disabled={!url}>
                save image
              </button>
              <button className="btn btn-ghost" onClick={() => { shared('copy_link'); void copyText(link).then(ok => toast(ok ? 'Link copied!' : 'Could not copy link.')); }}>
                Copy link
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
