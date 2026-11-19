import { useSyncExternalStore } from 'react';
import { track } from './clarity';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone/iPad Safari has no install prompt; players must use Share → Add to Home Screen. */
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Call once at startup: registers the service worker and catches the browser's install prompt for later. */
export function initInstall(): void {
  if (typeof window === 'undefined') return;
  installed = isStandalone();
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    track('pwa_installed');
    emit();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

/** TikTok / Instagram / Facebook in-app browsers can't install; players must open the site in Safari/Chrome first. */
export const isInAppBrowser = () => /TikTok|musical_ly|Bytedance|Instagram|FBAN|FBAV|FB_IAB/i.test(navigator.userAgent);

const isPhone = () => matchMedia('(pointer: coarse)').matches;

type InstallState = 'installed' | 'prompt' | 'inapp' | 'ios' | 'manual' | 'unavailable';

const snapshot = (): InstallState =>
  installed ? 'installed'
    : deferred ? 'prompt'
    : isInAppBrowser() ? 'inapp'
    : isIos() ? 'ios'
    : isPhone() ? 'manual'
    : 'unavailable';

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => 'unavailable',
  );
}

/** Shows the native install prompt (Android/desktop Chrome, Edge…). */
export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const event = deferred;
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  track(`pwa_prompt_${outcome}`);
}
