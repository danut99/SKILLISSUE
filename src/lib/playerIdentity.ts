import { usePlayer } from './store';

type PlayerCache = Pick<ReturnType<typeof usePlayer.getState>, 'playerId' | 'nickname' | 'days' | 'streak' | 'lastDay' | 'bestStreak' | 'daysPlayed' | 'bestTotal' | 'carSkin'>;
function snapshot(): PlayerCache {
  const { playerId, nickname, days, streak, lastDay, bestStreak, daysPlayed, bestTotal, carSkin } = usePlayer.getState();
  return { playerId, nickname, days, streak, lastDay, bestStreak, daysPlayed, bestTotal, carSkin };
}

/** Never display one account's cached name or scores under another identity. */
export function bindPlayerIdentity(owner: string | null) {
  const current = usePlayer.getState();
  if (current.accountOwner === owner) return;
  const key = (id: string) => `skillissue:player-cache:${id}`;
  // Keep the previous cache for returning to that player. Unattributed legacy
  // data is backed up separately; it must not be assigned to a random new guest.
  try { localStorage.setItem(key(current.accountOwner ?? `local:${current.playerId}`), JSON.stringify(snapshot())); } catch { /* Storage may be unavailable. */ }
  let saved: PlayerCache | null = null;
  if (owner) {
    try {
      const data = JSON.parse(localStorage.getItem(key(owner)) ?? 'null');
      if (data && typeof data.nickname === 'string' && typeof data.playerId === 'string' && data.days && typeof data.days === 'object') saved = data;
    } catch { /* A missing/broken cache is rebuilt from the server. */ }
  }
  current.resetPlayer();
  usePlayer.setState({ ...(saved ?? {}), accountOwner: owner });
}
