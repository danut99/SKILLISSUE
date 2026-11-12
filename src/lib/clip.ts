import { sfx } from './audio';

/** Records the game canvas (+ game audio) into a short vertical video for TikTok/Reels. */
class ClipRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = '';

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  private pickMime(): string {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  }

  start(canvas: HTMLCanvasElement) {
    if (!this.supported) return;
    this.cancel();
    try {
      const stream = canvas.captureStream(30);
      sfx.ensure();
      sfx.dest?.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      this.mime = this.pickMime();
      this.rec = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 4_000_000 } : undefined);
      this.chunks = [];
      this.rec.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.rec.start(250);
    } catch (e) {
      console.warn('Clip recording unavailable', e);
      this.rec = null;
    }
  }

  stop(): Promise<{ blob: Blob; ext: string } | null> {
    return new Promise((resolve) => {
      const r = this.rec;
      if (!r || r.state === 'inactive') return resolve(null);
      r.onstop = () => {
        const type = (this.mime || 'video/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type });
        this.rec = null;
        resolve(blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null);
      };
      r.stop();
    });
  }

  cancel() {
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null;
      try {
        this.rec.stop();
      } catch {
        /* ignore */
      }
    }
    this.rec = null;
  }
}

export const clipRecorder = new ClipRecorder();

/** Opens the native share sheet (→ TikTok on phones) or falls back to a download. */
export async function saveClip(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type });
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
