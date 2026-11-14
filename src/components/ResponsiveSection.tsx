import { useEffect, useState, type ReactNode } from 'react';

/** Secondary content stays visible on desktop and opens on demand on phones. */
export function ResponsiveSection({ title, children, expanded = false }: { title: string; children: ReactNode; expanded?: boolean }) {
  const [open, setOpen] = useState(() => expanded || !matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 899px)');
    const change = () => setOpen(expanded || !query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [expanded]);
  return <details className="responsive-section" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}>{title}</summary><div className="responsive-section-body">{children}</div>
  </details>;
}
