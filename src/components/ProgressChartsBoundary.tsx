import { Component, type ReactNode } from 'react';

/** Charts are optional: a failed chunk must never take down account access. */
export class ProgressChartsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="me-section" aria-label="Progress charts">
      <h2 className="me-label"><span>Your progress</span></h2>
      <div className="me-box" role="status">
        <h3>Charts couldn’t load.</h3>
        <p>Your account, scores and profile are still available. Reload to fetch the latest chart files.</p>
        <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload charts</button>
      </div>
    </section>;
  }
}
