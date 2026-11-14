import { useState, type FormEvent } from 'react';
import { claimNickname } from '../lib/leaderboard';
import { cleanNickname, usePlayer } from '../lib/store';
import { toast, useUi } from '../lib/ui';
import { NICKNAME_RULES, validNickname } from '../lib/nickname';

export function NicknameControl({ date }: { date: string }) {
  const nickname = usePlayer(s => s.nickname);
  const setNickname = usePlayer(s => s.setNickname);
  const refreshBoards = useUi(s => s.refreshBoards);
  const [nick, setNick] = useState(nickname);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanNickname(nick);
    if (!validNickname(nick.trim())) return toast(NICKNAME_RULES);
    if (!clean) return toast('Pick a nickname first 🙃');
    if (clean === nickname) return setEditing(false);
    setBusy(true);
    try {
      const r = await claimNickname(date, clean);
      if (!r.ok) {
        toast(r.reason === 'invalid' ? NICKNAME_RULES : r.reason === 'taken' ? `"${clean}" is taken 😤 pick another` : 'Leaderboard hiccup. Try again 😵');
        return;
      }
      setNickname(r.nickname);
      setNick(r.nickname);
      setEditing(false);
      toast(`You're now ${r.nickname} 😎`);
      refreshBoards();
    } catch {
      toast('Leaderboard hiccup. Try again 😵');
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="nickname-control">
      {editing ? (
        <form className="nick-form" onSubmit={submit}>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value.slice(0, 15))}
            maxLength={15}
            placeholder="new nickname"
            aria-label="Nickname"
            autoComplete="nickname"
            enterKeyHint="done"
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '…' : 'save'}
          </button>
        </form>
      ) : (
        <div className="nick-status">
          playing as <b>{nickname}</b>{' '}
          <button className="link-btn" onClick={() => { setNick(nickname); setEditing(true); }}>
            change name
          </button>
        </div>
      )}
    </div>
  );
}
