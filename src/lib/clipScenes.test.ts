import {describe,it,expect} from 'vitest';
import {clipHook,clipTaunt,clipWebsite,CLIP_GAMEPLAY_MS,CLIP_RESULT_MS,CLIP_OUTRO_MS} from './clipScenes';
it('opens with a distinct, brief challenge for each game without spoiling its result',()=>{
 const hooks=(['draw','cut','brake'] as const).map(clipHook);
 expect(new Set(hooks.map(h=>h.title)).size).toBe(3);
 for(const hook of hooks){
  expect(hook.title.length).toBeLessThanOrEqual(24);
  expect(hook.prompt.length).toBeLessThanOrEqual(30);
 }
 expect(clipHook('cut').title).toContain('SPLIT');
 expect(clipHook('brake').title).toContain('BRAKE');
 expect(CLIP_RESULT_MS+CLIP_OUTRO_MS).toBe(3000);
});
describe('social video ending',()=>{
 it('keeps the planned export under fifteen seconds',()=>{
  expect(CLIP_GAMEPLAY_MS+CLIP_RESULT_MS+CLIP_OUTRO_MS).toBeLessThan(15000);
 });
 it('varies taunts and challenges at every score band',()=>{
  for(const score of [0,79.9,80,94.9,95,100]){
   const variants=[0,.25,.5,.99].map(choice=>clipTaunt(score,choice));
   expect(new Set(variants.map(v=>v.joke)).size).toBe(4);
   expect(variants.every(v=>v.challenge.length>0&&v.challenge.length<=32)).toBe(true);
  }
  expect(clipTaunt(0,0)).not.toEqual(clipTaunt(99,0));
 });
 it('prints a clean website without scheme or trailing slash',()=>{
  expect(clipWebsite('https://playskillissue.pages.dev/')).toBe('playskillissue.pages.dev');
  expect(clipWebsite('https://example.com/game/')).toBe('example.com/game');
 });
});

it('calls out the actual score before challenging the viewer',()=>{
 for(const score of [0,45.2,80.8,85,92,99.9,100]){
  for(const choice of [0,.25,.5,.99]){
   const message=clipTaunt(score,choice);
   expect(message.joke).toContain(`${score}/100`);
   expect(message.challenge.length).toBeGreaterThan(10);
  }
 }
});

it('uses distinct game-specific roast pools and driving-failure context',()=>{
 for(const score of [0,55,88,98]){
  const jokes=['draw','cut','brake'].map(mode=>clipTaunt(score,0,mode as 'draw'|'cut'|'brake').joke);
  expect(new Set(jokes).size).toBe(3);
 }
 expect(clipTaunt(0,0,'brake',{crashed:true}).joke).toContain('wall');
 expect(clipTaunt(0,0,'brake',{fail:true,objective:'parking'}).joke).toContain('parking bay');
 expect(clipTaunt(0,0,'brake',{fail:true,objective:'stop-line'}).joke).toContain('Red');
});
it('keeps each contextual challenge short enough for the ending',()=>{
 for(const mode of ['draw','cut','brake'] as const)for(const score of [0,50,88,98])for(const choice of [0,.25,.5,.99]){
  const message=clipTaunt(score,choice,mode);
  expect(message.challenge.length).toBeLessThanOrEqual(34);
 }
});
