import { useEffect, useRef, useState } from 'react';
import { MODE_INFO, MODES, type BoardMode } from '../config';
import { Leaderboard } from './Leaderboard';

export function MobileLeaderboard({ date, initialMode, onClose }: {
  date: string;
  initialMode: BoardMode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    const desktop = matchMedia('(min-width: 900px)');
    const onResize = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener('change', onResize);
    return () => desktop.removeEventListener('change', onResize);
  }, [onClose]);

  return <dialog ref={dialogRef} className="leaderboard-dialog px-box" aria-labelledby="mobile-board-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="mobile-board-header">
      <h2 id="mobile-board-title">Leaderboards</h2>
      <button className="menu-x" aria-label="Close leaderboard" onClick={onClose} autoFocus>×</button>
    </header>
    <label className="mobile-board-filter" htmlFor="mobile-board-mode">Challenge
      <select id="mobile-board-mode" value={mode} onChange={event => setMode(event.target.value as BoardMode)}>
        <option value="overall">Overall</option>
        {MODES.map(game => <option key={game} value={game}>{MODE_INFO[game].name}</option>)}
      </select>
    </label>
    <Leaderboard mode={mode} date={date} title={mode === 'overall' ? 'Top Tryhards' : MODE_INFO[mode].name} />
  </dialog>;
}
