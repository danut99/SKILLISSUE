import {effects, NO_UPGRADES, type UpgradeKey, type Upgrades} from './upgrades.ts'
export type UpgradeMetric = {key:'force'|'speed'|'grip'|'damping'|'air';before:number;after:number}
export function upgradeComparison(current:Upgrades,key:UpgradeKey):UpgradeMetric[] {
 const next={...current,[key]:current[key]+1},a=effects(current),b=effects(next)
 const keys:UpgradeMetric['key'][]=key==='engine'?['force','speed']:key==='tires'?['grip']:['damping','air']
 return keys.map(key=>({key,before:Math.round(a[key]/effects(NO_UPGRADES)[key]*100),after:Math.round(b[key]/effects(NO_UPGRADES)[key]*100)}))
}
