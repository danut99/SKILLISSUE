/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
 const listeners: Record<string, (event: any) => void> = {};
 const showNotification = vi.fn().mockResolvedValue(undefined);
 const openWindow = vi.fn().mockResolvedValue(undefined);
 const clients = { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow };
 runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, self: { addEventListener: (type: string, listener: (event: any) => void) => { listeners[type] = listener; }, registration: { showNotification }, location: { origin: 'https://skilly.pages.dev' }, clients } });
 return { listeners, showNotification, clients };
}
describe('daily reminder service worker', () => {
 it('only displays the daily reminder and ignores unrecognized categories', async () => {
  const w = worker(); const waitUntil = vi.fn();
  w.listeners.push({ data: { json: () => ({ type: 'friend-challenge' }) }, waitUntil });
  expect(w.showNotification).not.toHaveBeenCalled();
  w.listeners.push({ data: { json: () => ({ type: 'daily-reminder', title: 'untrusted' }) }, waitUntil });
  expect(w.showNotification).toHaveBeenCalledWith("Today's shapes are ready", expect.objectContaining({ tag: 'skilly-daily', data: { type: 'daily-reminder' } }));
 });
 it('opens the fixed home destination instead of a URL supplied by push data', async () => {
  const w = worker(); let pending: Promise<unknown> = Promise.resolve();
  const close = vi.fn();
  w.listeners.notificationclick({ notification: { data: { type: 'daily-reminder', url: 'https://untrusted.example' }, close }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  expect(close).toHaveBeenCalledOnce();
  expect(w.clients.openWindow).toHaveBeenCalledWith('https://skilly.pages.dev/?utm_source=daily_reminder');
 });
});
