import { useEffect, useState } from 'react';

interface Props { active: 'play' | 'rankings' | 'progress' | null }

const tabs = [
  { id: 'play', href: '/', label: 'Play', path: 'M8 5v14l11-7z' },
  { id: 'rankings', href: '/leaderboards', label: 'Rankings', path: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v5m-4 3h8m-4-3v3' },
  { id: 'progress', href: '/profile', label: 'My progress', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21v-2a7 7 0 0 1 14 0v2' },
] as const;

export function MobileNav({ active }: Props) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editing = document.activeElement?.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
      // Ignore browser toolbar movement and pinch zoom; only hide for a keyboard.
      setKeyboardOpen(Boolean(editing && viewport.scale === 1 && window.innerHeight - viewport.height > 150));
    };
    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return <nav className="mobile-app-nav" aria-label="Main navigation" hidden={keyboardOpen}>
    {tabs.map(tab => <a key={tab.id} href={tab.href} aria-current={active === tab.id ? 'page' : undefined}>
      <span className="mobile-tab-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tab.path} /></svg></span>
      <span>{tab.label}</span>
    </a>)}
  </nav>;
}
