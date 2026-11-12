/**
 * Bottom banner — fixed 50px height is reserved in CSS, so ads never shift the layout.
 *
 * AdSense: add the loader script to index.html, then replace the placeholder with
 *   <ins className="adsbygoogle" style={{ display: 'inline-block', width: 320, height: 50 }}
 *        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" />
 * and call (window.adsbygoogle = window.adsbygoogle || []).push({}) in a useEffect.
 * Adsterra: inject their 320×50 snippet into this container the same way.
 */
export function AdBanner() {
  return (
    <aside className="ad-banner" aria-label="Advertisement">
      <div className="ad-slot">ad space · 320×50</div>
    </aside>
  );
}
