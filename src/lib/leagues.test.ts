import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), ensureNickname: vi.fn() }));
vi.mock('./auth', () => ({ useAuth: vi.fn() }));
vi.mock('./leaderboard', () => ({ ensureNickname: mocks.ensureNickname }));
vi.mock('./supabase', () => ({ getSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
import { fetchLeague } from './leagues';

beforeEach(() => { vi.clearAllMocks(); });

it('viewing the league never creates a profile for a guest', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'nickname_required' } });
  expect(await fetchLeague()).toMatchObject({ joined: false });
  expect(mocks.ensureNickname).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith('get_my_league', { p_join: false });
});

it('an explicit join claims the nickname first', async () => {
  mocks.rpc.mockResolvedValue({ data: { joined: true, week: '2026-11-16', ends_at: '' }, error: null });
  await fetchLeague(true);
  expect(mocks.ensureNickname).toHaveBeenCalledOnce();
});
