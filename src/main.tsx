import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { identify, initClarity, tag } from './lib/clarity';
import { useAuth } from './lib/auth';
import { usePlayer } from './lib/store';
import { initInstall } from './lib/install';

initClarity();
initInstall();

// Re-identify whenever the nickname or the logged-in account changes (Supabase id wins over the local id).
let lastIdentity = '';
const syncIdentity = () => {
  const { playerId, nickname } = usePlayer.getState();
  const { userId, status } = useAuth.getState();
  const id = userId ?? playerId;
  if (`${id}|${nickname}|${status}` === lastIdentity) return;
  lastIdentity = `${id}|${nickname}|${status}`;
  identify(id, nickname);
  tag('account', status);
};
syncIdentity();
usePlayer.subscribe(syncIdentity);
useAuth.subscribe(syncIdentity);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
