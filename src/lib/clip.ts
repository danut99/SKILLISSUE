import { sfx } from './audio';
import { CLIP_GAMEPLAY_MS, CLIP_HOLD_MS, createClipPainter, type ClipMode, type ClipOptions, type ClipResult } from './clipScenes';

/** Where the action sits inside the recorded video (ms), so compilations can cut straight to it. */
export interface ClipTiming { markMs: number; gameplayEndMs: number }
export interface RecordedClip { blob: Blob; ext: string; timing: ClipTiming }
/** Draws the game without its HUD (timer, prompts, companions) in 360×640 stage units. */
export type CleanRender = (c: CanvasRenderingContext2D, now: number) => void;
type Painter = ReturnType<typeof createClipPainter>;
type ClipSession = { rec: MediaRecorder; chunks: Blob[]; mime: string; stream: MediaStream; frame: number; timer: ReturnType<typeof setTimeout>; painter: Painter; startedAt: number; markMs: number; finishing: boolean; stopped: boolean; draw: () => void };
export function pickClipMime(){return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))??'';}
/** Records the game full screen as a short TikTok-style clip with its sound. */
class ClipRecorder {
 private session:ClipSession|null=null;
 get supported(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';}
 private elapsed(session:ClipSession){return Math.min(performance.now()-session.startedAt,CLIP_GAMEPLAY_MS);}
 /** `clean` renders the game without HUD for the video; otherwise the on-screen canvas is used as-is. */
 start(source:HTMLCanvasElement, mode:ClipMode='draw', options:ClipOptions={}, clean?:CleanRender, seed=0){
  if(!this.supported)return;
  this.cancel();
  try{
   let frameSource=source;
   let renderClean=()=>{};
   if(clean){
    const stage=document.createElement('canvas');stage.width=720;stage.height=1280;
    const g=stage.getContext('2d')!;
    renderClean=()=>{g.setTransform(2,0,0,2,0,0);clean(g,performance.now());};
    frameSource=stage;
   }
   const painter=createClipPainter(frameSource,mode,options,seed);
   const draw=()=>{renderClean();painter.paint();};
   draw();
   const stream=painter.canvas.captureStream(30);sfx.ensure();
   sfx.dest?.stream.getAudioTracks().forEach(track=>stream.addTrack(track.clone()));
   const mime=pickClipMime();
   const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:5_000_000}:undefined);
   const session:ClipSession={rec,chunks:[],mime,stream,frame:0,timer:0 as unknown as ReturnType<typeof setTimeout>,painter,startedAt:performance.now(),markMs:-1,finishing:false,stopped:false,draw};
   this.session=session;
   rec.ondataavailable=event=>{if(event.data.size)session.chunks.push(event.data);};
   rec.start();
   // Match the capture rate instead of painting at the display's 60–120 Hz.
   let lastPaint=performance.now();
   const loop=(now:number)=>{
    if(session.stopped)return;
    if(now-lastPaint>=1000/30){draw();lastPaint=now-(now-lastPaint)%(1000/30);}
    session.frame=requestAnimationFrame(loop);
   };
   session.frame=requestAnimationFrame(loop);
   // Pause rather than discard the result if an attempt lasts longer than 8s.
   session.timer=setTimeout(()=>{if(rec.state==='recording'&&!session.finishing&&session.markMs<0)rec.pause();},CLIP_GAMEPLAY_MS);
  }catch(error){console.warn('Clip recording unavailable',error);this.cancel();}
 }
 /** The moment of truth: swap the challenge line for the result and reaction. */
 reveal(result:ClipResult){
  const session=this.session;if(!session||session.markMs>=0)return;
  if(session.rec.state==='paused')session.rec.resume();
  session.markMs=this.elapsed(session);
  session.painter.reveal(result);
 }
 /** Keeps recording the result for a moment, then ends the clip. */
 stop(result?:ClipResult):Promise<RecordedClip|null>{
  const session=this.session;if(!session)return Promise.resolve(null);
  this.session=null;session.finishing=true;clearTimeout(session.timer);
  if(result){if(session.markMs<0)session.markMs=this.elapsed(session);session.painter.reveal(result);}
  const hold=result?CLIP_HOLD_MS:0;
  const timing:ClipTiming={markMs:session.markMs<0?this.elapsed(session):session.markMs,gameplayEndMs:this.elapsed(session)+hold};
  return new Promise(resolve=>{
   let settled=false;
   const done=(value:RecordedClip|null)=>{if(settled)return;settled=true;session.stopped=true;cancelAnimationFrame(session.frame);clearTimeout(session.timer);session.stream.getTracks().forEach(track=>track.stop());resolve(value);};
   session.rec.onstop=()=>{const type=(session.mime||'video/webm').split(';')[0];const blob=new Blob(session.chunks,{type});done(blob.size?{blob,ext:type.includes('mp4')?'mp4':'webm',timing}:null);};
   session.rec.onerror=()=>done(null);
   if(session.rec.state==='paused')session.rec.resume();
   session.timer=setTimeout(()=>{if(session.rec.state==='inactive')done(null);else session.rec.stop();},hold);
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
