import {provingGroundRun} from './game/modes.ts'
import {describe,expect,it} from 'vitest'
import {buyUpgrade,upgradesFor,progress,recordRun,type Outcome} from './progress.ts'
import {ACTIVE_LEVELS,levelRun} from './game/modes.ts'
import {effects} from './game/upgrades.ts'
describe('garage economy',()=>{
 it('never persists rewards or records from a test drive',()=>{
  const before=structuredClone(progress)
  const reward=recordRun({run:provingGroundRun(),vehicleId:'trial',end:'finish',distance:190,time:10,stars:3,coins:100,eggs:0,eggsTotal:0,pulled:0,flips:0,braked:false})
  expect(reward.coins).toBe(0)
  expect(reward.best).toBe(false)
  expect(progress).toEqual(before)
 })
 it('pays first completion, new goals and full replays without farming checkpoints',()=>{
  const before=structuredClone(progress)
  try{
   progress.paidLevels={};progress.levels={};progress.coins=0
   const o:Outcome={run:levelRun(ACTIVE_LEVELS[0]),vehicleId:'a',end:'finish',distance:480,time:999,stars:0,coins:0,eggs:0,eggsTotal:0,pulled:0,flips:0,braked:false}
   expect(recordRun({...o,end:'stuck',resumed:true}).coins).toBe(0)
   expect(recordRun({...o,resumed:true}).coins).toBe(150)
   expect(recordRun({...o,resumed:true}).coins).toBe(0)
   expect(recordRun(o).coins).toBe(20)
   expect(recordRun({...o,stars:3,time:30}).coins).toBe(80)
   expect(recordRun({...o,stars:3,time:30,resumed:true}).coins).toBe(0)
  }finally{Object.assign(progress,before)}
 })
 it('buys three levels per vehicle, preserves edits and rejects unaffordable purchases',()=>{
  const before=structuredClone(progress)
  try{
   progress.vehicleUpgrades={};progress.upgrades={engine:0,tires:0,suspension:0,tank:0};progress.coins=99
   expect(buyUpgrade('engine','a')).toBe(false)
   progress.coins=1000
   expect(buyUpgrade('engine','a')).toBe(true)
   expect(progress.coins).toBe(900)
   expect(upgradesFor('a').engine).toBe(1)
   expect(upgradesFor('b').engine).toBe(0)
   expect(effects(upgradesFor('a')).force).toBeGreaterThan(effects(upgradesFor('b')).force)
   expect(buyUpgrade('engine','a')).toBe(true)
   expect(buyUpgrade('engine','a')).toBe(true)
   expect(buyUpgrade('engine','a')).toBe(false)
   expect(upgradesFor('a').engine).toBe(3)
   expect(buyUpgrade('tank','a')).toBe(false)
  }finally{Object.assign(progress,before)}
 })
})

