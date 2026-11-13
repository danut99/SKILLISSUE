import { CLARITY_PROJECT_ID } from '../config';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

type ConsentState = 'granted' | 'denied';

/**
 * Loads Microsoft Clarity (https://clarity.microsoft.com) in production builds when
 * a project id is configured (see CLARITY_PROJECT_ID in config.ts). Starts cookieless (consent denied) until
 * setClarityConsent('granted') is called, e.g. from a future cookie banner.
 */
export function initClarity(projectId = CLARITY_PROJECT_ID): void {
  if (!projectId || import.meta.env.DEV || typeof window === 'undefined' || window.clarity) return;

  const clarity: ClarityFn = (...args) => {
    (clarity.q ??= []).push(args);
  };
  window.clarity = clarity;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);

  setClarityConsent('denied');
}

export function setClarityConsent(state: ConsentState): void {
  window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: state });
}

/** Custom event (Clarity → Filters → Custom events). No-op when Clarity isn't loaded. */
export function track(event: string): void {
  window.clarity?.('event', event);
}

/** Session tag (Clarity → Filters → Custom tags). Repeated calls add values. */
export function tag(key: string, value: string | string[]): void {
  window.clarity?.('set', key, value);
}

/**
 * Links sessions to a player. Clarity hashes `id` before storing it, and shows `name` in recordings
 * (Recordings → filter by "Custom user ID" or search the friendly name).
 */
export function identify(id: string, name: string): void {
  window.clarity?.('identify', id, undefined, undefined, name);
  tag('nickname', name);
}

/** Score band used to group sessions without one tag value per exact score. */
export const scoreBand = (score: number): string =>
  score >= 95 ? 'perfect' : score >= 80 ? 'great' : score >= 50 ? 'ok' : score > 0 ? 'bad' : 'fail';
