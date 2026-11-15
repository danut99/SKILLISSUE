import { describe, expect, it } from 'vitest';
import { DRIVING_TAUNTS, RESULT_TAUNTS, resultTaunt, tauntBand } from './resultTaunts';

describe('score-based result taunts',()=>{
 it.each([[0,'zero'],[0.1,'low'],[39.9,'low'],[40,'mid'],[69.9,'mid'],[70,'high'],[89.9,'high'],[90,'great'],[100,'great']] as const)('routes %s to %s',(score,band)=>expect(tauntBand(score)).toBe(band));
 it('has five distinct lines per band for every game',()=>{
  for(const mode of ['draw','cut','brake','balance','count'] as const)for(const lines of Object.values(RESULT_TAUNTS[mode])){
   expect(lines.length).toBeGreaterThanOrEqual(5);expect(new Set(lines).size).toBe(lines.length);
  }
 });
 it('prioritizes actual driving failures over score',()=>{
  expect(DRIVING_TAUNTS.crash).toContain(resultTaunt('brake',99,{crashed:true}));
  expect(DRIVING_TAUNTS.parking).toContain(resultTaunt('brake',0,{fail:true,objective:'parking'}));
  expect(DRIVING_TAUNTS.line).toContain(resultTaunt('brake',0,{fail:true,objective:'stop-line'}));
 });
 it('does not roast a successful parking attempt for hitting a wall',()=>{
  expect(DRIVING_TAUNTS.parkingGreat).toContain(resultTaunt('brake',99,{objective:'parking'}));
  expect(DRIVING_TAUNTS.parkingLow).toContain(resultTaunt('brake',30,{objective:'parking'}));
 });
 it('keeps selection stable across redraws and restored results',()=>{
  expect(resultTaunt('cut',56.7,{a:40,b:60})).toBe(resultTaunt('cut',56.7,{a:40,b:60}));
 });
 it('uses the bonus game score bands and preserves a restored attempt',()=>{
  for(const mode of ['balance','count'] as const){
   for(const score of [0,20,55,80,95])expect(RESULT_TAUNTS[mode][tauntBand(score)]).toContain(resultTaunt(mode,score,{},'attempt-1'));
   expect(resultTaunt(mode,55,{},'attempt-1')).toBe(resultTaunt(mode,55,{},'attempt-1'));
   const choices=new Set(Array.from({length:30},(_,i)=>resultTaunt(mode,55,{},`attempt-${i}`)));
   expect(choices.size).toBeGreaterThan(1);
  }
 });
 it('preserves the original result taunts',()=>{
  const lines=[...Object.values(RESULT_TAUNTS).flatMap(bands=>Object.values(bands).flat()),...Object.values(DRIVING_TAUNTS).flat()];
  for(const line of ['You drew that with confidence.',"A shape with personality. That's what we're calling it?",'Someone got the bigger half.','One half is definitely getting more dinner.',"It's a parking bay. Somehow you made it a suggestion.",'The traffic camera is getting your best angle.','The wall would like your insurance details.','You left enough room to park another car.'])expect(lines).toContain(line);
 });
});
