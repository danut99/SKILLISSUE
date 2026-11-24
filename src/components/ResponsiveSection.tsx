import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Secondary content stays visible on desktop and opens on demand on phones. */
export function ResponsiveSection({ title, children, expanded = false }: { title: string; children: ReactNode; expanded?: boolean }) {
  const [open, setOpen] = useState(() => expanded || !matchMedia('(max-width: 899px)').matches);
  const summary = useRef<HTMLElement>(null);
  const clickTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (clickTop.current === null) return;
    const top = clickTop.current;
    const keepPosition = () => {
      if (!summary.current) return;
      const shift = summary.current.getBoundingClientRect().top - top;
      if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
    };
    keepPosition();
    // Chrome may apply scroll anchoring after the details element changes height.
    const frame = requestAnimationFrame(() => { keepPosition(); clickTop.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    const query = matchMedia('(max-width: 899px)');
    const change = () => setOpen(expanded || !query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [expanded]);
  return <details className="responsive-section" open={open}>
    <summary ref={summary} onClick={event => { event.preventDefault(); clickTop.current = event.currentTarget.getBoundingClientRect().top; setOpen(value => !value); }}>{title}</summary><div className="responsive-section-body">{children}</div>
  </details>;
}
