import type { Pt } from './geometry';
import { clamp } from './geometry';

type Command = ['M'|'L',number,number] | ['Q',number,number,number,number] | ['C',number,number,number,number,number,number];
function outline(commands:Command[]):Pt[]{
 const result:Pt[]=[];let from:Pt={x:0,y:0};
 for(const cmd of commands){
  if(cmd[0]==='M'||cmd[0]==='L'){from={x:cmd[1],y:cmd[2]};result.push(from);continue;}
  const start=from;
  for(let i=1;i<=12;i++){
   const t=i/12,u=1-t;
   if(cmd[0]==='Q')from={x:u*u*start.x+2*u*t*cmd[1]+t*t*cmd[3],y:u*u*start.y+2*u*t*cmd[2]+t*t*cmd[4]};
   else if(cmd[0]==='C')from={x:u*u*u*start.x+3*u*u*t*cmd[1]+3*u*t*t*cmd[3]+t*t*t*cmd[5],y:u*u*u*start.y+3*u*u*t*cmd[2]+3*u*t*t*cmd[4]+t*t*t*cmd[6]};
   result.push(from);
  }
 }
 // The renderer closes the last edge. Do not leave a duplicate terminal vertex.
 if(result.length>1&&Math.hypot(result[0].x-from.x,result[0].y-from.y)<.001)result.pop();
 return result;
}
export type CutMood='smug'|'sleepy'|'nervous'|'suspicious'|'happy'|'angry'|'surprised'|'goofy';
export interface CutCharacter { name:string; color:string; dark:string; mood:CutMood; pattern:'spots'|'veins'|'shine'|'none'; poly:Pt[] }
const polygon=(points:number[][])=>points.map(([x,y])=>({x,y}));
export const CUT_CHARACTERS:CutCharacter[]=[
 {name:'Jelly Belly',color:'#ff8499',dark:'#9c3459',mood:'smug',pattern:'shine',poly:outline([
  ['M',-120,-25],['C',-122,-110,-8,-137,79,-85],['C',135,-52,143,31,82,82],['C',27,126,-5,54,-62,69],['C',-116,83,-144,35,-120,-25],
 ])},
 {name:'Cheese Suspect',color:'#ffcf56',dark:'#a66a28',mood:'suspicious',pattern:'spots',poly:outline([
  ['M',-111,92],['L',-78,-114],['Q',-65,-127,-47,-115],['L',142,41],['L',126,93],['Q',3,116,-111,92],
 ])},
 {name:'Mushy Business',color:'#c5a0ff',dark:'#67439c',mood:'sleepy',pattern:'spots',poly:outline([
  ['M',-137,4],['Q',-110,-111,8,-119],['Q',122,-116,144,8],['Q',106,20,51,12],['L',61,102],['Q',12,128,-38,100],['L',-29,13],['Q',-102,25,-137,4],
 ])},
 {name:'Cod Complex',color:'#61dccc',dark:'#217b85',mood:'nervous',pattern:'shine',poly:outline([
  ['M',146,0],['Q',103,-95,-1,-83],['Q',-80,-82,-119,-16],['L',-169,-73],['L',-155,67],['L',-113,21],['Q',-55,110,50,77],['Q',128,65,146,0],
 ])},
 {name:'Leaf Me Alone',color:'#9ddd78',dark:'#41773d',mood:'angry',pattern:'veins',poly:outline([
  ['M',-144,109],['Q',-155,-75,-24,-111],['Q',78,-142,148,-110],['Q',135,58,-24,102],['Q',-80,119,-144,109],
 ])},
 {name:'Watt A Disaster',color:'#ffe56a',dark:'#9c6f25',mood:'surprised',pattern:'shine',poly:polygon([[-25,-145],[111,-145],[10,-25],[98,-25],[-91,146],[-35,20],[-125,20]])},
 {name:'Pear Pressure',color:'#b4e66b',dark:'#667e27',mood:'goofy',pattern:'spots',poly:outline([
  ['M',-28,-136],['Q',5,-151,38,-120],['Q',51,-74,39,-44],['C',63,-6,139,23,128,84],['C',107,157,-116,144,-128,71],['Q',-133,11,-73,-37],['Q',-36,-72,-28,-136],
 ])},
 {name:'Gym Imbalance',color:'#80b9ff',dark:'#3b5b9a',mood:'smug',pattern:'shine',poly:outline([
  ['M',-159,-44],['Q',-116,-99,-54,-79],['Q',-20,-69,-13,-24],['L',69,-11],['Q',81,-57,116,-50],['Q',158,-45,159,1],['Q',166,59,116,65],['Q',77,66,66,25],['L',-12,13],['Q',-23,86,-90,91],['Q',-163,87,-170,24],['Q',-178,-10,-159,-44],
 ])},
 {name:'Crab Accountant',color:'#ff986a',dark:'#a84639',mood:'suspicious',pattern:'none',poly:polygon([
  [-102,-20],[-154,-70],[-166,-116],[-139,-101],[-121,-134],[-113,-79],[-69,-43],[-27,-71],[40,-65],[83,-31],[112,-75],[110,-126],[139,-98],[166,-107],[158,-51],[111,5],[143,38],[161,77],[107,50],[95,33],[77,57],[112,94],[119,121],[63,83],[28,72],[-33,77],[-77,105],[-115,115],[-89,70],[-106,49],[-148,67],[-167,60],[-128,20],
 ])},
 {name:'Tentacle Tax',color:'#dd94e5',dark:'#854291',mood:'happy',pattern:'spots',poly:outline([
  ['M',-105,9],['Q',-126,-106,-19,-128],['Q',107,-147,119,-12],['L',159,28],['L',143,51],['L',101,32],['L',118,117],['L',91,132],['L',52,59],['L',49,143],['L',20,145],['L',-5,59],['L',-45,131],['L',-73,124],['L',-48,45],['L',-118,98],['L',-143,79],['L',-85,27],['L',-158,45],['L',-166,17],['L',-105,9],
 ])},
];

export function cutCharacterIndex(complexity:number,partyShape?:string){
 if(partyShape){
  const shapes=['circle','square','triangle','diamond','hexagon','pentagon','oval','rectangle','heptagon','octagon','star','flower'];
  return Math.min(9,Math.max(0,shapes.indexOf(partyShape)));
 }
 return Math.max(0,Math.min(9,Math.floor(complexity)));
}

/** Same expression renderer is used for the game, previews and saved results. */
export function paintCutFace(c:CanvasRenderingContext2D,center:Pt,scale:number,mood:CutMood,pointer:Pt,scared=false,sliced=false){
 const s=clamp(scale,.45,1.2);const {x,y}=center;
 c.save();c.lineCap='round';c.lineWidth=2*s;c.strokeStyle='#142039';
 for(const side of [-1,1]){
  const ex=x+side*14*s,ey=y-8*s;
  c.save();c.beginPath();c.ellipse(ex,ey,(scared?10:9)*s,(scared?12:11)*s,0,0,Math.PI*2);c.fillStyle='#fffdf5';c.fill();c.stroke();c.clip();
  const angle=Math.atan2(pointer.y-ey,pointer.x-ex);
  c.fillStyle='#142039';c.beginPath();c.arc(ex+Math.cos(angle)*3*s,ey+Math.sin(angle)*3*s,(sliced?2.5:4)*s,0,Math.PI*2);c.fill();
  c.fillStyle='#fff';c.fillRect(ex-1*s,ey-5*s,2*s,2*s);
  if(!scared&&!sliced&&(mood==='sleepy'||mood==='smug')){c.fillStyle='#142039';c.fillRect(ex-12*s,ey-14*s,24*s,12*s);}
  c.restore();
  if(!scared&&!sliced&&(mood==='angry'||mood==='suspicious')){
   c.lineWidth=3*s;c.beginPath();c.moveTo(ex-8*s,ey-16*s+(side<0?-3:3)*s);c.lineTo(ex+8*s,ey-16*s+(side<0?3:-3)*s);c.stroke();
  }
 }
 c.fillStyle='#142039';c.lineWidth=2.6*s;c.beginPath();
 if(scared||sliced||mood==='surprised'||mood==='nervous')c.ellipse(x,y+13*s,5*s,scared?8*s:6*s,0,0,Math.PI*2);
 else if(mood==='goofy'){c.moveTo(x-9*s,y+8*s);c.quadraticCurveTo(x,y+24*s,x+10*s,y+7*s);}
 else if(mood==='angry'||mood==='suspicious'){c.moveTo(x-7*s,y+16*s);c.quadraticCurveTo(x,y+10*s,x+8*s,y+16*s);}
 else c.arc(x,y+6*s,9*s,.12*Math.PI,.88*Math.PI);
 c.stroke();
 if(scared){c.fillStyle='#77dcff';c.beginPath();c.ellipse(x+32*s,y+2*s,3*s,6*s,-.25,0,Math.PI*2);c.fill();}
 if(mood==='happy'||mood==='smug'){c.fillStyle='#ff759b88';c.fillRect(x-27*s,y+5*s,8*s,4*s);c.fillRect(x+20*s,y+5*s,8*s,4*s);}
 c.restore();
}

export type HalfMood = 'shocked' | 'cry' | 'smug' | 'relieved' | 'love';

/** How a half reacts to the split: the small piece wails, the big one gloats; fair cuts make both happy. */
export function halfMood(score: number, isSmaller: boolean): Exclude<HalfMood, 'shocked'> {
 if (score >= 99) return 'love';
 if (score >= 90) return 'relieved';
 return isSmaller ? 'cry' : 'smug';
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
 c.beginPath();
 c.moveTo(x, y + r * .9);
 c.bezierCurveTo(x - r * 1.6, y - r * .2, x - r * .7, y - r * 1.3, x, y - r * .45);
 c.bezierCurveTo(x + r * .7, y - r * 1.3, x + r * 1.6, y - r * .2, x, y + r * .9);
 c.fill();
}

/** Face for one half after the cut. `t` = ms since the reaction started (drives tears/hearts). `look` = where the pupils point. */
export function paintHalfFace(c: CanvasRenderingContext2D, center: Pt, scale: number, mood: HalfMood, look: Pt, t: number) {
 const s = clamp(scale, .5, 1.3); const { x, y } = center;
 const ink = '#142039';
 c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; c.lineWidth = 2.4 * s;
 for (const side of [-1, 1]) {
  const ex = x + side * 14 * s, ey = y - 8 * s;
  if (mood === 'cry') {
   // squeezed-shut eyes + two streams of tears
   c.beginPath(); c.moveTo(ex - 8 * s, ey - 2 * s); c.lineTo(ex, ey + 3 * s); c.lineTo(ex + 8 * s, ey - 2 * s); c.stroke();
   c.fillStyle = '#77dcff';
   for (let i = 0; i < 3; i++) {
    const k = ((t / 420 + i / 3) % 1);
    c.beginPath(); c.ellipse(ex + side * 3 * s, ey + 6 * s + k * 34 * s, 3 * s, 5 * s, 0, 0, Math.PI * 2);
    c.globalAlpha = 1 - k * .7; c.fill(); c.globalAlpha = 1;
   }
  } else if (mood === 'relieved') {
   c.beginPath(); c.arc(ex, ey + 3 * s, 7 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  } else if (mood === 'love') {
   c.fillStyle = '#ff3d6e'; heart(c, ex, ey, 9 * s);
  } else {
   const shocked = mood === 'shocked';
   c.beginPath(); c.ellipse(ex, ey, (shocked ? 10 : 9) * s, (shocked ? 12 : 11) * s, 0, 0, Math.PI * 2);
   c.fillStyle = '#fffdf5'; c.fill(); c.stroke();
   c.save(); c.clip();
   const angle = Math.atan2(look.y - ey, look.x - ex);
   c.fillStyle = ink; c.beginPath(); c.arc(ex + Math.cos(angle) * 4 * s, ey + Math.sin(angle) * 4 * s, (shocked ? 2.5 : 4) * s, 0, Math.PI * 2); c.fill();
   if (mood === 'smug') { c.fillStyle = ink; c.fillRect(ex - 12 * s, ey - 14 * s, 24 * s, 11 * s); }
   c.restore();
   if (mood === 'smug') { c.beginPath(); c.moveTo(ex - 10 * s, ey - 3 * s); c.lineTo(ex + 10 * s, ey - 3 * s); c.stroke(); }
  }
 }
 c.fillStyle = ink; c.lineWidth = 2.6 * s; c.beginPath();
 if (mood === 'shocked') c.ellipse(x, y + 13 * s, 5 * s, 7 * s, 0, 0, Math.PI * 2);
 else if (mood === 'cry') { c.ellipse(x, y + 15 * s, 9 * s, 7 * s + Math.sin(t / 90) * 1.5 * s, 0, 0, Math.PI * 2); c.fill(); }
 else if (mood === 'smug') { c.moveTo(x - 9 * s, y + 12 * s); c.quadraticCurveTo(x + 2 * s, y + 18 * s, x + 11 * s, y + 7 * s); }
 else if (mood === 'relieved') c.arc(x, y + 8 * s, 7 * s, .15 * Math.PI, .85 * Math.PI);
 else { c.arc(x, y + 5 * s, 11 * s, .1 * Math.PI, .9 * Math.PI); c.closePath(); c.fill(); }
 c.stroke();
 if (mood === 'smug' || mood === 'love') { c.fillStyle = '#ff759b88'; c.fillRect(x - 27 * s, y + 5 * s, 8 * s, 4 * s); c.fillRect(x + 20 * s, y + 5 * s, 8 * s, 4 * s); }
 if (mood === 'relieved') { c.fillStyle = '#77dcff'; c.beginPath(); c.ellipse(x + 30 * s, y - 14 * s, 3 * s, 6 * s, -.25, 0, Math.PI * 2); c.fill(); }
 if (mood === 'love') {
  c.fillStyle = '#ff3d6e';
  for (let i = 0; i < 3; i++) {
   const k = ((t / 1400 + i / 3) % 1);
   c.globalAlpha = 1 - k; heart(c, x + (i - 1) * 22 * s + Math.sin(t / 300 + i) * 4 * s, y - 30 * s - k * 50 * s, 6 * s); c.globalAlpha = 1;
  }
 }
 c.restore();
}
