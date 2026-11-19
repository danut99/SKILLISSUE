import { useState } from 'react';
import { track } from '../lib/clarity';
import { promptInstall, useInstallState } from '../lib/install';

/** "Add to home screen" card. Hidden when already installed or when the browser can't install. */
export function InstallButton() {
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  if (state === 'installed' || state === 'unavailable') return null;

  const onClick = () => {
    track(`pwa_button_${state}`);
    if (state === 'prompt') void promptInstall();
    else setHelp(true);
  };

  return (
    <>
      <button className="install-card px-box" onClick={onClick}>
        <span className="install-icon" aria-hidden="true">📲</span>
        <span className="install-copy">
          <b>Get the SKILL ISSUE app</b>
          <small>Free. No app store. Play from your home screen.</small>
        </span>
        <span className="btn btn-primary">Install</span>
      </button>
      {help && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={() => setHelp(false)}>
          <div className="modal-box px-box install-ios" onClick={(e) => e.stopPropagation()}>
            <h2 id="install-help-title">Get the app in 3 steps</h2>
            {state === 'inapp' ? (
              <ol>
                <li>Tap <b>⋯</b> (top or bottom corner of this screen).</li>
                <li>Choose <b>Open in browser</b> (Safari or Chrome).</li>
                <li>Tap this <b>Install</b> button again there.</li>
              </ol>
            ) : state === 'ios' ? (
              <ol>
                <li>Tap <b>Share</b> <span className="install-share" aria-hidden="true">⬆</span> in Safari.</li>
                <li>Scroll down and tap <b>Add to Home Screen</b> ➕.</li>
                <li>Tap <b>Add</b>. Done, SKILL ISSUE is on your phone.</li>
              </ol>
            ) : (
              <ol>
                <li>Open your browser menu <b>⋮</b>.</li>
                <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm. Done, SKILL ISSUE is on your phone.</li>
              </ol>
            )}
            <button className="btn btn-primary" onClick={() => setHelp(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
