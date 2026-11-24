import {expect,it} from 'vitest';
import {clipCaption,clipHook,clipReaction,clipWebsite,clipScoreText} from './clipScenes';

it('opens with a short challenge that rotates by day',()=>{
 for(const mode of ['draw','cut','brake','balance'] as const)for(let seed=0;seed<4;seed++){
  const words=clipHook(mode,seed).split(' ').length;
  expect(words).toBeLessThanOrEqual(7);
 }
 expect(clipHook('cut',0)).not.toBe(clipHook('cut',1));
 expect(clipHook('cut',-3)).toBeTruthy();
});

it('reveals a one-word reaction that matches how close the cut was',()=>{
 const at=0;
 expect(clipReaction('cut',{score:99.6,detail:{},at}).text).toContain('PERFECT');
 expect(clipReaction('cut',{score:96,detail:{},at}).text).toContain('SO CLOSE');
 expect(clipReaction('cut',{score:70,detail:{},at}).text).toContain('ROBBERY');
 expect(clipReaction('cut',{score:20,detail:{},at}).text).toContain('CRIME');
 expect(clipReaction('brake',{score:0,detail:{crashed:true},at}).text).toContain('CRASHED');
});

it('prints a clean website without scheme or trailing slash',()=>{
 expect(clipWebsite('https://skilly.pages.dev/')).toBe('skilly.pages.dev');
 expect(clipWebsite('https://example.com/game/')).toBe('example.com/game');
});

it('writes a paste-ready caption with the daily hook, result, comment prompt and site',()=>{
 const caption=clipCaption('cut','49.2 / 50.8','skilly.pages.dev');
 expect(caption).toContain('Everyone on Earth got this exact blob today');
 expect(caption).toContain('49.2 / 50.8');
 expect(caption).toContain('Comment your score');
 expect(caption).toContain('skilly.pages.dev');
 expect(clipCaption('brake','2 cm','x.dev',false)).not.toContain('today');
});

// A cut split is a measurement, not the normalized precision score.
it('uses the normalized score in video result headings',()=>{
 expect(clipScoreText({score:98,detail:{a:49.5,b:50.5},at:0})).toBe('98.0 / 100');
 expect(clipScoreText({score:0,detail:{crashed:true},at:0})).toBe('0.0 / 100');
});
