import { getSupabase } from './supabase';
import { isOnline, useAuth } from './auth';
import { isIos } from './install';

export const REMINDER_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() ?? '';
export const remindersConfigured = () => Boolean(REMINDER_PUBLIC_KEY);
export const reminderTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function reminderSupport(): 'supported' | 'install' | 'unsupported' {
  if (isIos() && !matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone) return 'install';
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported';
}
export function validReminderTime(time: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(time); }
export function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = await getSupabase();
  if (!client || !isOnline()) throw new Error('Connect online to manage your daily reminder.');
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error('Could not save the reminder. Please try again.');
  return data as T;
}
export interface ReminderPreference { reminder_time: string; timezone: string }
async function registration() {
  const worker = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return worker;
}
export async function loadDailyReminder(): Promise<ReminderPreference | null> {
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return null;
  return rpc('get_daily_reminder', { p_endpoint: subscription.endpoint });
}
// Call requestPermission directly from the button tap, before network/SW awaits.
export async function enableDailyReminder(time: string): Promise<void> {
  if (!validReminderTime(time)) throw new Error('Choose a valid reminder time.');
  if (!remindersConfigured() || reminderSupport() !== 'supported') throw new Error('Daily reminders are not available in this browser.');
  const owner = useAuth.getState().userId;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked. You can allow them in your browser settings.' : 'No reminder enabled. You can try again whenever you like.');
  if (useAuth.getState().userId !== owner) throw new Error('Your account changed. Please try again.');
  const worker = await registration();
  const existing = await worker.pushManager.getSubscription();
  const subscription = existing ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(REMINDER_PUBLIC_KEY) });
  try {
    if (useAuth.getState().userId !== owner) throw new Error('Your account changed. Please try again.');
    await rpc('save_daily_reminder', { p_subscription: subscription.toJSON(), p_time: time, p_timezone: reminderTimezone() });
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
}
export async function disableDailyReminder(): Promise<void> {
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return;
  // Remove server delivery first; keep the control retryable on network errors.
  await rpc('delete_daily_reminder', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
