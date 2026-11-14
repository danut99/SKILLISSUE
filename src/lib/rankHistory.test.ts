import { describe, expect, it } from 'vitest';
import { rankCalendar, rankLevel } from './rankHistory';
describe('daily rank calendar', () => {
  it('uses rank tiers rather than scores or number of plays', () => {
    expect([1,2,3,4,10,11,999].map(rankLevel)).toEqual([4,3,3,2,2,1,1]);
  });
  it('includes leap day, empty days and stops at today', () => {
    const data = rankCalendar(2028,'2028-03-01',[{play_date:'2028-02-29',mode:'draw',rank:1,players:12,score:91}]);
    expect(data).toHaveLength(61);
    expect(data.at(-1)?.date).toBe('2028-03-01');
    expect(data.find(day => day.date === '2028-02-29')).toEqual({date:'2028-02-29',count:1,level:4});
    expect(data[0].level).toBe(0);
  });
  it('shows all days of an older year', () => {
    const data = rankCalendar(2026,'2027-03-02',[]);
    expect(data).toHaveLength(365);
    expect(data.at(-1)?.date).toBe('2026-12-31');
  });
});
