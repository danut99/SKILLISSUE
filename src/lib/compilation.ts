import type { Mode } from '../config';
import { pickClipMime } from './clip';
import { clipReaction, drawOutlined, drawPill } from './clipScenes';
import type { StoredClip } from './creator';

const W = 720;
const H = 1280;
const END_MS = 1600;
/** Action kept before each try's moment of truth. */
const LEAD_IN_MS = 1800;

const GOAL: Record<Mode, string> = {
  cut: 'to cut this in half 🔪',
  draw: 'to draw it perfectly ✏️',
  brake: 'to stop perfectly 🚗',
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "5 tries to cut this in half": today's tries back to back, each trimmed to its
 * action + reveal, ending on the best one. Runs in real time (≈ the output length).
 */
export async function makeCompilation(clips: StoredClip[], mode: Mode, { onProgress }: { onProgress?: (progress: number) => void } = {}): Promise<{ blob: Blob; ext: string } | null> {
  if (!clips.length || typeof MediaRecorder === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const audio = new AudioContext();
  await audio.resume().catch(() => {});
  const out = audio.createMediaStreamDestination();
  const stream = canvas.captureStream(30);
  out.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const mime = pickClipMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const best = clips.reduce((a, b) => (b.score > a.score ? b : a));
  const title = `${clips.length} ${clips.length === 1 ? 'try' : 'tries'} ${GOAL[mode]}`;
  const estimate = END_MS + clips.reduce((sum, clip) => sum + Math.min(LEAD_IN_MS, clip.timing.markMs) + (clip.timing.gameplayEndMs - clip.timing.markMs), 0);
  let produced = 0;
  const report = (ms: number) => { produced += ms; onProgress?.(Math.min(0.99, produced / estimate)); };
  // Each clip already carries its own reveal; the counter sits where the clip's challenge line is.
  const overlay = (index: number) => drawPill(c, `${title} · ${index + 1}/${clips.length}`, 236, 40, 620);
  let last: HTMLVideoElement | null = null;

  rec.start();
  try {
    for (const [index, clip] of clips.entries()) {
      const video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'auto';
      video.src = URL.createObjectURL(clip.blob);
      const gain = audio.createGain();
      audio.createMediaElementSource(video).connect(gain).connect(out);
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(video.error);
          setTimeout(() => reject(new Error('clip load timeout')), 8000);
        });
        const from = Math.max(0, clip.timing.markMs - LEAD_IN_MS) / 1000;
        const to = Math.max(from + 0.5, clip.timing.gameplayEndMs / 1000);
        // Recorded clips often can't seek, so fast-forward silently to the action.
        if (from > 0.05) {
          rec.pause();
          gain.gain.value = 0;
          video.playbackRate = 8;
          await video.play().catch(() => { video.muted = true; return video.play(); });
          const skipStart = performance.now();
          while (video.currentTime < from && !video.ended && performance.now() - skipStart < 6000) await wait(10);
          video.pause();
          rec.resume();
        }
        gain.gain.value = 1;
        video.playbackRate = 1;
        await video.play().catch(() => { video.muted = true; return video.play(); });
        const segStart = performance.now();
        // Only show the counter before the reveal so it never covers the result.
        const revealAt = clip.timing.markMs / 1000;
        while (video.currentTime < to && !video.ended && performance.now() - segStart < 9000) {
          c.drawImage(video, 0, 0, W, H);
          if (video.currentTime < revealAt) overlay(index);
          await wait(1000 / 30);
        }
        video.pause();
        report(performance.now() - segStart);
        if (last) URL.revokeObjectURL(last.src);
        last = video;
      } catch (error) {
        console.warn('Skipping clip in compilation', error);
        if (rec.state === 'paused') rec.resume();
      }
    }

    // Final beat: the best try, big.
    const reaction = clipReaction(mode, { score: best.score, detail: {}, at: best.at });
    const endStart = performance.now();
    while (performance.now() - endStart < END_MS) {
      if (last) c.drawImage(last, 0, 0, W, H);
      c.fillStyle = 'rgba(5,10,20,.55)';
      c.fillRect(0, 0, W, H);
      drawOutlined(c, `BEST OF ${clips.length}`, 470, 56, '#ffffff');
      drawOutlined(c, best.label, 590, 96, reaction.color);
      drawOutlined(c, reaction.text, 710, 64, reaction.color);
      await wait(1000 / 30);
    }
    report(END_MS);
  } finally {
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      if (rec.state === 'inactive') resolve();
      else rec.stop();
    });
    stream.getTracks().forEach((track) => track.stop());
    void audio.close();
    if (last) URL.revokeObjectURL(last.src);
  }
  onProgress?.(1);
  const type = (mime || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type });
  return blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null;
}
