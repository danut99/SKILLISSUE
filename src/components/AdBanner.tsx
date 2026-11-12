/** Sponsor placeholder; replace with paid placements when available. */
export function AdBanner() {
  return (
    <aside className="ad-banner" aria-label="Sponsor space available">
      <div className="sponsor-marquee">
        <div className="sponsor-track">
          {[0, 1].map(copy => (
            <div className="sponsor-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
              <span className="sponsor-tile"><b>YOUR LOGO HERE</b><small>this could be your spot</small></span>
              <span className="sponsor-tile pink"><b>SPONSOR THE CHAOS</b><small>questionable skills. great exposure.</small></span>
              <span className="sponsor-tile gold"><b>YOUR BRAND. OUR FAILS.</b><small>sponsor space available</small></span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
