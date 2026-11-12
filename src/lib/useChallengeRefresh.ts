import { useEffect, useState } from 'react';

/** Poll only while visible; focus and completed scores also refresh responses. */
export function useChallengeRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRevision(n => n + 1); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return revision;
}

