import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeHref, routeToken, installNavigation } from './navigation';

afterEach(() => vi.unstubAllGlobals());

describe('path navigation and legacy compatibility', () => {
  it('keeps share challenge payloads when converting legacy routes', () => {
    expect(routeHref('cut/beat?date=2026-11-24&score=95&name=A')).toBe('/play/cut/beat?date=2026-11-24&score=95&name=A');
    expect(routeHref('friends/invite-token')).toBe('/friends/invite-token');
    expect(routeHref('party/room-token')).toBe('/party/room-token');
    expect(routeHref('levels/brake')).toBe('/levels/brake');
  });

  it('allows existing challenge and party parsers to read real paths', () => {
    vi.stubGlobal('location', { pathname: '/play/draw/duel/token', search: '?utm_source=friend' });
    expect(routeToken()).toBe('#draw/duel/token');
    vi.stubGlobal('location', { pathname: '/play/cut/beat', search: '?date=2026-11-24&score=95' });
    expect(routeToken()).toBe('#cut/beat?date=2026-11-24&score=95');
    vi.stubGlobal('location', { pathname: '/party/room-token', search: '' });
    expect(routeToken()).toBe('#party/room-token');
  });

  it('does not confuse similarly named paths or tracking queries with pages', () => {
    vi.stubGlobal('location', { pathname: '/leagues/', search: '?utm_source=share' });
    expect(routeToken()).toBe('#league');
    vi.stubGlobal('location', { pathname: '/leagues-not-a-page', search: '' });
    expect(routeToken()).toBe('');
  });

  it('leaves OAuth callback fragments intact', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { pathname: '/', hash: '#access_token=secret&refresh_token=secret', search: '' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    installNavigation();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
