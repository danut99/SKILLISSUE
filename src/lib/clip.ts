import { sfx } from './audio';
import type { ClipMode } from './clipScenes';

import { CLIP_GAMEPLAY_MS, CLIP_RESULT_MS, CLIP_OUTRO_MS, createClipPainter, type ClipResult } from './clipScenes';

type ClipSession = { rec: MediaRecorder; chunks: Blob[]; mime: string; stream: MediaStream; frame: number; timer: ReturnType<typeof setTimeout>; paint: ReturnType<typeof createClipPainter>['paint']; freeze: () => void; finishing: boolean; stopped: boolean };
/** Composes a short vertical video with safe-area result and challenge scenes. */
class ClipRecorder {
 private session:ClipSession|null=null;
 get supported(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';}
 private pickMime(){return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))??'';}
 start(source:HTMLCanvasElement, mode:ClipMode='draw'){
  if(!this.supported)return;
  this.cancel();
  try{
   const painter=createClipPainter(source,mode);painter.paint('gameplay');
   const stream=painter.canvas.captureStream(30);sfx.ensure();
   sfx.dest?.stream.getAudioTracks().forEach(track=>stream.addTrack(track.clone()));
   const mime=this.pickMime();
   const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:4_000_000}:undefined);
   const session:ClipSession={rec,chunks:[],mime,stream,frame:0,timer:0 as unknown as ReturnType<typeof setTimeout>,paint:painter.paint,freeze:painter.freeze,finishing:false,stopped:false};
   this.session=session;
   rec.ondataavailable=event=>{if(event.data.size)session.chunks.push(event.data);};
   rec.start();
   // Match the capture rate instead of painting at the display's 60–120 Hz.
   let lastPaint=performance.now();
   const loop=(now:number)=>{if(session.stopped||session.finishing)return;if(now-lastPaint>=1000/30){painter.paint('gameplay');lastPaint=now-(now-lastPaint)%(1000/30);}session.frame=requestAnimationFrame(loop);};
   session.frame=requestAnimationFrame(loop);
   // Pause rather than discard the result if an attempt lasts longer than 8s.
   session.timer=setTimeout(()=>{if(rec.state==='recording'&&!session.finishing){rec.pause();cancelAnimationFrame(session.frame);}},CLIP_GAMEPLAY_MS);
  }catch(error){console.warn('Clip recording unavailable',error);this.cancel();}
 }
 stop(result?:ClipResult):Promise<{blob:Blob;ext:string}|null>{
  const session=this.session;if(!session)return Promise.resolve(null);
  this.session=null;session.finishing=true;clearTimeout(session.timer);cancelAnimationFrame(session.frame);
  return new Promise(resolve=>{
   let settled=false;
   const cleanup=()=>{session.stopped=true;cancelAnimationFrame(session.frame);clearTimeout(session.timer);session.stream.getTracks().forEach(track=>track.stop());};
   const done=(value:{blob:Blob;ext:string}|null)=>{if(settled)return;settled=true;cleanup();resolve(value);};
   session.rec.onstop=()=>{const type=(session.mime||'video/webm').split(';')[0];const blob=new Blob(session.chunks,{type});done(blob.size?{blob,ext:type.includes('mp4')?'mp4':'webm'}:null);};
   session.rec.onerror=()=>done(null);
   const end=()=>{if(session.rec.state==='inactive'){done(null);return;}session.rec.stop();};
   if(!result){end();return;}
   session.freeze();
   session.stream.getAudioTracks().forEach(track=>{track.enabled=false;});
   session.paint('result',result);
   if(session.rec.state==='paused')session.rec.resume();
   let lastClosingPaint=performance.now();
   const outro=()=>{
    if(session.stopped)return;
    // The closing card is static. Refresh occasionally for canvas capture and
    // late-loading artwork, rather than rebuilding it on every display frame.
    const now=performance.now();
    if(now-lastClosingPaint>=250){session.paint('result',result);lastClosingPaint=now;}
    session.frame=requestAnimationFrame(outro);
   };
   session.frame=requestAnimationFrame(outro);
   session.timer=setTimeout(end,CLIP_RESULT_MS+CLIP_OUTRO_MS);
  });
 }
 cancel(){
  const session=this.session;this.session=null;if(!session)return;
  session.stopped=true;clearTimeout(session.timer);cancelAnimationFrame(session.frame);
  session.rec.ondataavailable=null;session.rec.onstop=null;
  try{if(session.rec.state!=='inactive')session.rec.stop();}catch{/* already stopped */}
  session.stream.getTracks().forEach(track=>track.stop());
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
