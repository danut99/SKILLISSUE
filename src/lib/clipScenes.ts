import { MODE_INFO, siteUrl, type Mode } from '../config';
import { FONT } from '../games/types';
import { fmtResult } from './scoring';
import { pixelArtUrl } from './pixelAssets';
import type { Attempt, Detail } from './store';

export const CLIP_GAMEPLAY_MS = 8000;
// Both phases show the same closing card. Three seconds keeps it readable
// without making players wait six seconds for an identical still frame.
export const CLIP_RESULT_MS = 1500;
export const CLIP_OUTRO_MS = 1500;
export type ClipMode = Mode | 'balance';
const CLIP_INFO = { ...MODE_INFO, balance: { title: 'Balance!', color: '#ffd23f' } };
export interface ClipResult { mode: ClipMode; attempt: Attempt }
/** Invite a prediction before the outcome; never spoil or invent a score. */
export function clipHook(mode: ClipMode) {
 return {
  balance: { title: 'WHERE WOULD YOU PUT IT?', prompt: 'Two friends. One support. Your call.' },
  draw: { title: 'ONE STROKE. NO UNDO.', prompt: 'Could you draw it better?' },
  cut: { title: 'CALL THE SPLIT.', prompt: '50/50 or absolute robbery?' },
  brake: { title: 'WHEN WOULD YOU BRAKE?', prompt: 'One tap. No second chances.' },
 }[mode];
}
const WIDTH=720, HEIGHT=1280;
function label(c:CanvasRenderingContext2D,value:string,y:number,size:number,color='#e8f1ff',width=540){
 c.font=`${size}px ${FONT}`;
 const measured=c.measureText(value).width;
 if(measured>width)c.font=`${size*width/measured}px ${FONT}`;
 c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(value,WIDTH/2,y);
}
export function clipWebsite(url=typeof document!=='undefined' ? document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? siteUrl() : siteUrl()) { try { const u=new URL(url);return u.host+(u.pathname==='/'?'':u.pathname.replace(/\/$/,'')); }catch{return url.replace(/^https?:\/\//,'').replace(/\/$/,'');} }
type Roast = readonly [string, string];
const GAME_ROASTS: Record<ClipMode, { great: Roast[]; good: Roast[]; bad: Roast[]; fail: Roast[] }> = {
 balance: {
  great: [['Gravity just hired you.', 'Balance better. Save their lunch.']],
  good: [['The plank is holding its breath.', 'Find the sweet spot.']],
  bad: [['Two friends. Zero trust left.', 'Balance better. Rescue lunch.']],
  fail: [['Gravity won the argument.', 'Your turn. Keep them level.']],
 },
 draw: {
  great: [
   ['Bro swallowed a compass.', 'Draw better. No tools.'],
   ['Tracing allegations incoming.', 'Outdraw them. Clear your name.'],
   ['Geometry is their whole personality.', 'Draw better. Ruin their day.'],
   ['Bro has a ruler for a spine.', 'Beat it. Freehand only.'],
  ],
  good: [
   ['The shape wants a second opinion.', 'Outdraw them. Settle this.'],
   ['Bro drew that and felt gifted.', 'Draw better. Humble them.'],
   ['Almost escaped potato territory.', 'Beat it. Rescue geometry.'],
   ['The art teacher said "interesting".', 'Draw better. Make it awkward.'],
  ],
  bad: [
   ['Bro drew a medical condition.', 'Draw better. Save the patient.'],
   ['That outline needs a lawyer.', 'Outdraw them. Clear its name.'],
   ['You lost a fight with a dot.', 'Beat it. Defend the species.'],
   ['Bro invented a new potato.', 'Draw better. End the harvest.'],
  ],
  fail: [
   ['The dot won. You lost.', 'Draw better. Avenge humanity.'],
   ['Your pencil would file for divorce.', 'Outdraw them. Save the pencil.'],
   ['Geometry just blocked your number.', 'Draw better. Get unblocked.'],
   ['Bro failed finger painting.', 'Beat it. Fingers are allowed.'],
  ],
 },
 cut: {
  great: [
   ['Bro brought a laser to pizza night.', 'Cut better. No lasers.'],
   ['The knife has a maths degree.', 'Outcut them. Humble the knife.'],
   ['Finally, a divorce settlement.', 'Split better. Pick a side.'],
   ['Bro weighs the birthday cake.', 'Cut better. Ruin their flex.'],
  ],
  good: [
   ['One sibling is still complaining.', 'Cut fairer. End the argument.'],
   ['Bro nearly understands sharing.', 'Outcut them. Teach sharing.'],
   ['The bigger half has a favourite.', 'Cut better. Expose the bias.'],
   ['Close enough to start a family feud.', 'Split better. Keep the peace.'],
  ],
  bad: [
   ['Bro split it like the rent.', 'Cut fairer. Send the invoice.'],
   ['One half pays child support.', 'Split better. Save the family.'],
   ['Never let this person cut cake.', 'Cut better. Save a birthday.'],
   ['Bro took "my half" personally.', 'Outcut them. Stop the robbery.'],
  ],
  fail: [
   ['The knife missed its only job.', 'Cut better. Employ the knife.'],
   ['Bro lost to a stationary blob.', 'Beat it. The blob cannot run.'],
   ['Your scissors want a new owner.', 'Cut better. Adopt them.'],
   ['The blob survived. Your ego did not.', 'Cut it. Finish the job.'],
  ],
 },
 brake: {
  great: [
   ['Bro parks with a microscope.', 'Stop closer. No microscope.'],
   ['The bumper is holding its breath.', 'Brake better. Make it nervous.'],
   ['Driving instructor just retired.', 'Outbrake them. Take the job.'],
   ['Bro measures gaps for a living.', 'Stop closer. Ruin their shift.'],
  ],
  good: [
   ['Bro wants a medal for braking.', 'Stop closer. Cancel the medal.'],
   ['Almost trusted with the car keys.', 'Brake better. Take the keys.'],
   ['The driving instructor still flinched.', 'Outbrake them. Calm the man.'],
   ['Bro stopped and expected applause.', 'Stop closer. Steal the clap.'],
  ],
  bad: [
   ['Bro left room for a supermarket.', 'Stop closer. Close the store.'],
   ['The destination needs another Uber.', 'Brake better. Actually arrive.'],
   ['Braked in a different postcode.', 'Stop closer. Same planet.'],
   ['That gap has its own landlord.', 'Outbrake them. Evict the gap.'],
  ],
  fail: [
   ['The brake pedal filed a complaint.', 'Brake better. Clear its name.'],
   ['Driving instructor left the chat.', 'Beat it. Bring them back.'],
   ['Your licence is a participation award.', 'Outbrake them. Earn yours.'],
   ['The keys are going back to mum.', 'Brake better. Get them back.'],
  ],
 },
};
export function clipTaunt(score:number, choice=Math.random(), mode:ClipMode='draw', detail:Detail={}) {
 let pool=GAME_ROASTS[mode][score>=95?'great':score>=85?'good':score>0?'bad':'fail'];
 if(mode==='brake'&&detail.crashed) pool=[
  ['The wall won the staring contest.', 'Brake better. Spare the wall.'],
  ['Bro used the wall as a brake.', 'Stop closer. Without the crash.'],
  ['Your bumper is now wall decor.', 'Outbrake them. Save a bumper.'],
  ['The wall did not consent to that hug.', 'Brake better. Respect the wall.'],
 ];
 else if(mode==='brake'&&detail.fail&&detail.objective==='parking') pool=[
  ['The parking bay is over THERE.', 'Park better. Inside the lines.'],
  ['Bro parked in the next episode.', 'Beat it. Find the actual bay.'],
  ['Even the parking lines gave up.', 'Park better. Give them hope.'],
  ['That is a parking suggestion.', 'Park better. Make it official.'],
 ];
 else if(mode==='brake'&&detail.fail&&detail.objective==='stop-line') pool=[
  ['Red was apparently a suggestion.', 'Brake better. Red means stop.'],
  ['Bro subscribed to traffic fines.', 'Stop in time. Cancel the plan.'],
  ['The stop line is behind you, genius.', 'Outbrake them. Stay behind it.'],
  ['Bro thinks STOP is a review score.', 'Brake better. Read the sign.'],
 ];
 const index=Math.min(pool.length-1,Math.max(0,Math.floor(choice*pool.length)));
 const value=score.toFixed(1).replace(/\.0$/,'');
 return {joke:`${value}/100. ${pool[index][0]}`,challenge:pool[index][1]};
}
export function createClipPainter(source:HTMLCanvasElement, gameplayMode:ClipMode='draw'){
 let resultSource=source;
 let taunt:ReturnType<typeof clipTaunt>|null=null;
 const freeze=()=>{const frozen=document.createElement('canvas');frozen.width=source.width;frozen.height=source.height;frozen.getContext('2d')!.drawImage(source,0,0);resultSource=frozen;};
 const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
 const c=canvas.getContext('2d')!;
 const demon=new Image();demon.src=pixelArtUrl('demon-192.png');
 const ready=demon.decode().catch(()=>{});
 const background=()=>{c.fillStyle='#050a14';c.fillRect(0,0,WIDTH,HEIGHT);c.strokeStyle='#122238';c.lineWidth=1;for(let x=0;x<WIDTH;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,HEIGHT);c.stroke();}for(let y=0;y<HEIGHT;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(WIDTH,y);c.stroke();}};
 const paint=(stage:'gameplay'|'result'|'outro',result?:ClipResult)=>{
  background();
  c.save();
  c.imageSmoothingEnabled=false;
  if(stage==='gameplay'){
   const hook=clipHook(gameplayMode);
   label(c,'SKILL ISSUE',110,28,'#7d93b8');
   label(c,hook.title,170,54,'#ffd23f',520);
   label(c,hook.prompt,220,32,'#e8f1ff',510);
   // Larger action, with room around it for TikTok's top, right and bottom UI.
   // Keep the entire game visible: cropping can hide a driving target or timer.
   c.strokeStyle=CLIP_INFO[gameplayMode].color;c.lineWidth=3;
   c.strokeRect(151,258,418,740);
   c.drawImage(source,153,260,414,736);
   label(c,clipWebsite(),1040,30,'#4de3ff',490);
   c.restore();
   return;
  }
  // Website stays visible in every frame, away from captions and the action rail.
  c.fillStyle='#102437';c.fillRect(96,112,528,64);
  c.strokeStyle='#4de3ff';c.lineWidth=2;c.strokeRect(96,112,528,64);
  label(c,clipWebsite(),145,39,'#4de3ff',490);
  label(c,'SKILL ISSUE',215,58,'#e8f1ff');
  if(!result){c.restore();return;}
  const {mode,attempt}=result;
  label(c,CLIP_INFO[mode].title.toUpperCase(),280,32,CLIP_INFO[mode].color);
  // One closing card: a single result, a clean central game crop, roast,
  // challenge and centered website. Both closing phases use this same layout.
  const primary=mode==='draw'||mode==='balance'?`${attempt.score.toFixed(1)} / 100`:fmtResult(mode,attempt);
  label(c,primary,345,mode==='draw'?86:76,'#ffd23f');
  if(mode!=='draw'&&mode!=='balance') label(c,`${attempt.score.toFixed(1)} / 100`,397,26,'#e8f1ff');
  const sx=resultSource.width/360,sy=resultSource.height/640;
  c.save();
  // Website, preview, reaction and CTA share the same 528px column.
  c.fillStyle='#08111e';c.fillRect(96,430,528,346);
  c.strokeStyle='#1b3050';c.lineWidth=2;c.strokeRect(96,430,528,346);
  // Exclude the in-game header, roast and companion bubble from the preview.
  const cropY=mode==='brake'?210:155;
  const cropHeight=mode==='brake'?340:365;
  // Contain the crop instead of squeezing every game into the same aspect ratio.
  const previewHeight=326,previewWidth=320*previewHeight/cropHeight;
  c.drawImage(resultSource,20*sx,cropY*sy,320*sx,cropHeight*sy,(WIDTH-previewWidth)/2,440,previewWidth,previewHeight);
  c.restore();
  taunt ??= clipTaunt(attempt.score,Math.random(),mode,attempt.detail);
  const joke=taunt.joke.replace(/^.*?\/100\.\s*/,'');
  c.imageSmoothingEnabled=false;
  c.fillStyle='#101d33';c.fillRect(96,800,528,144);
  c.strokeStyle='#ff5d8f';c.lineWidth=2;c.strokeRect(96,800,528,144);
  if(demon.complete&&demon.naturalWidth)c.drawImage(demon,108,824,96,96);
  c.strokeStyle='#ff5d8f55';c.beginPath();c.moveTo(214,818);c.lineTo(214,926);c.stroke();
  c.font=`30px ${FONT}`;c.textAlign='left';c.textBaseline='middle';c.fillStyle='#e8f1ff';
  const words=joke.split(' ');let line='';const lines:string[]=[];
  for(const word of words){const next=line?`${line} ${word}`:word;if(c.measureText(next).width>372&&line){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  const jokeY=lines.length>1?832:848;
  lines.slice(0,2).forEach((text,index)=>c.fillText(text,230,jokeY+index*32));
  c.font=`26px ${FONT}`;const challengeWidth=c.measureText(taunt.challenge).width;
  if(challengeWidth>372)c.font=`${26*372/challengeWidth}px ${FONT}`;
  c.fillStyle='#ffd23f';c.fillText(taunt.challenge,230,912);
  c.fillStyle='#ff5d8f';c.fillRect(96,968,528,56);
  label(c,'YOUR TURN. BEAT THIS.',996,39,'#050a14',488);
  c.restore();

 };
 return {canvas,paint,freeze,ready};
}
