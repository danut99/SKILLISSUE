import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';

export function PartyStats() {
  const [stats, setStats] = useState<{ parties: number; games: number } | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const sb = await getSupabase();
        if (!sb) return;
        const { data, error } = await sb.rpc('get_party_stats');
        if (error || !data || !active) return;
        const parties = Number(data.parties_created);
        const games = Number(data.games_played);
        if (Number.isFinite(parties) && parties >= 0 && Number.isFinite(games) && games >= 0) setStats({ parties, games });
      } catch { /* Keep the card usable if activity totals are unavailable. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  if (!stats) return null;
  return <div className="home-party-stats" aria-label="Party activity">
    <span><b>{stats.parties.toLocaleString()}</b> parties created</span>
    <span><b>{stats.games.toLocaleString()}</b> games played</span>
  </div>;
}
