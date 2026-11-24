import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), ios: false, owner: 'guest', permission: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), getSubscription: vi.fn(), register: vi.fn() }));
vi.mock('./auth', () => ({ isOnline: () => true, useAuth: { getState: () => ({ userId: mocks.owner }) } }));
vi.mock('./install', () => ({ isIos: () => mocks.ios }));
vi.mock('./supabase', () => ({ getSupabase: async () => ({ rpc: mocks.rpc }) }));

beforeEach(() => {
 vi.resetModules(); vi.clearAllMocks(); mocks.ios = false; mocks.owner = 'guest';
 vi.stubEnv('VITE_WEB_PUSH_PUBLIC_KEY', 'BA');
 mocks.rpc.mockResolvedValue({ data: null, error: null });
 mocks.permission.mockResolvedValue('granted');
 const subscription = { endpoint: 'https://fcm.googleapis.com/push/test', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/push/test', keys: { auth: 'auth', p256dh: 'key' } }), unsubscribe: mocks.unsubscribe };
 mocks.subscribe.mockResolvedValue(subscription); mocks.unsubscribe.mockResolvedValue(true); mocks.getSubscription.mockResolvedValue(null);
 const worker = { pushManager: { subscribe: mocks.subscribe, getSubscription: mocks.getSubscription } };
 mocks.register.mockResolvedValue(worker);
 vi.stubGlobal('navigator', { serviceWorker: { register: mocks.register, ready: Promise.resolve(worker) } });
 vi.stubGlobal('window', { isSecureContext: true, PushManager: {}, Notification: {} });
 vi.stubGlobal('Notification', { permission: 'default', requestPermission: mocks.permission });
 vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('daily-only browser reminders', () => {
 it('requires valid local hours and minutes', async () => {
  const { validReminderTime } = await import('./dailyReminders');
  for (const time of ['00:00', '19:00', '23:59']) expect(validReminderTime(time)).toBe(true);
  for (const time of ['', '24:00', '19:60', '7:00']) expect(validReminderTime(time)).toBe(false);
 });
 it('does not request permission when loading the current preference', async () => {
  await (await import('./dailyReminders')).loadDailyReminder();
  expect(mocks.permission).not.toHaveBeenCalled(); expect(mocks.subscribe).not.toHaveBeenCalled();
 });
 it('opens permission from the enable action and saves the chosen time', async () => {
  const { enableDailyReminder } = await import('./dailyReminders');
  const pending = enableDailyReminder('19:30');
  expect(mocks.permission).toHaveBeenCalledOnce();
  await pending;
  expect(mocks.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  expect(mocks.rpc).toHaveBeenCalledWith('save_daily_reminder', expect.objectContaining({ p_time: '19:30', p_timezone: expect.any(String) }));
 });
 it('does not subscribe or save after permission is denied', async () => {
  mocks.permission.mockResolvedValue('denied');
  await expect((await import('./dailyReminders')).enableDailyReminder('19:00')).rejects.toThrow('blocked');
  expect(mocks.subscribe).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('cleans up a newly created subscription when saving fails', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect((await import('./dailyReminders')).enableDailyReminder('19:00')).rejects.toThrow();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
 });
 it('keeps disabling retryable if the server cannot remove the subscription', async () => {
  mocks.getSubscription.mockResolvedValue({ endpoint: 'https://fcm.googleapis.com/push/test', unsubscribe: mocks.unsubscribe });
  mocks.rpc.mockResolvedValue({ error: {} });
  await expect((await import('./dailyReminders')).disableDailyReminder()).rejects.toThrow();
  expect(mocks.unsubscribe).not.toHaveBeenCalled();
 });
 it('shows Home Screen installation guidance for iOS', async () => {
  mocks.ios = true;
  expect((await import('./dailyReminders')).reminderSupport()).toBe('install');
  expect(mocks.permission).not.toHaveBeenCalled();
 });
 it('rejects a subscription attempt if accounts switch during permission', async () => {
  mocks.permission.mockImplementation(async () => { mocks.owner = 'different'; return 'granted'; });
  await expect((await import('./dailyReminders')).enableDailyReminder('19:00')).rejects.toThrow('account changed');
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
