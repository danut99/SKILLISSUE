import { ResponsiveSection } from './ResponsiveSection';
import { ChallengeInbox } from './ChallengeInbox';
import { useEffect, useState } from 'react';
import { MODE_INFO, MODES, type BoardMode } from '../config';
import { useAuth } from '../lib/auth';
import {
  acceptFriendInvite, createFriendInvite, friendInviteUrl, getFriends, previewFriendInvite, removeFriend,
  type Friend, type FriendInvite, type InvitePreview,
} from '../lib/friends';
import { toast, useUi } from '../lib/ui';
import { Leaderboard } from './Leaderboard';

export function FriendsPage({ date, inviteToken }: { date: string; inviteToken: string | null }) {
  const { status, userId } = useAuth();
  return (
    <section className="screen me-page friends-page">
      <header className="me-hero">
        <h1>Friends</h1>
        <p className="me-sub">Invite your friends. Compare today's scores.</p>
      </header>
      {status === 'anon' || status === 'linked' ? (
        <FriendsContent key={userId} date={date} inviteToken={inviteToken} />
      ) : (
        <div className="me-box" role="status">
          <p>{status === 'connecting' ? 'Connecting...' : 'Friends need an online connection. Please try again shortly.'}</p>
          <a href="#me" className="btn btn-ghost">My account</a>
        </div>
      )}
    </section>
  );
}

function FriendsContent({ date, inviteToken }: { date: string; inviteToken: string | null }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<{ token: string; preview?: InvitePreview; error?: string } | null>(null);
  const [invite, setInvite] = useState<FriendInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<BoardMode>('overall');
  const version = useUi((s) => s.boardVersion);
  const preview = previewResult?.token === inviteToken ? previewResult : null;

  useEffect(() => {
    let active = true;
    getFriends().then((rows) => {
      if (active) { setFriends(rows); setError(null); }
    }).catch((cause: Error) => active && setError(cause.message));
    return () => { active = false; };
  }, [version]);

  useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    previewFriendInvite(inviteToken).then((data) => {
      if (active) setPreviewResult({ token: inviteToken, preview: data });
    }).catch((cause: Error) => active && setPreviewResult({ token: inviteToken, error: cause.message }));
    return () => { active = false; };
  }, [inviteToken, version]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  async function accept() {
    if (!inviteToken) return;
    const nickname = await acceptFriendInvite(inviteToken);
    location.hash = 'friends';
    useUi.getState().refreshBoards();
    toast(`You're now friends with ${nickname}.`);
  }

  async function makeInvite(reset = false) {
    const next = await createFriendInvite(reset);
    setInvite(next);
  }

  async function copyInvite() {
    if (!invite) return;
    await navigator.clipboard.writeText(friendInviteUrl(invite.token));
    toast('Invite link copied.');
  }

  async function remove(friend: Friend) {
    await removeFriend(friend.friend_id);
    setFriends((rows) => rows?.filter((row) => row.friend_id !== friend.friend_id) ?? null);
    useUi.getState().refreshBoards();
    toast(`${friend.nickname} removed.`);
  }

  return (
    <>
      {inviteToken && (
        <div className="me-box friend-invitation" role="status">
          {!preview ? <p>Loading invite...</p> : preview.error ? <p>{preview.error}</p> : preview.preview && (
            <>
              <h2>{preview.preview.is_me ? 'Your invite link' : `${preview.preview.nickname} invited you`}</h2>
              <p>{preview.preview.is_me ? 'Send this link to a friend.' : preview.preview.already_friends
                ? "You're already friends." : 'Become friends to compare your daily scores. They will appear on your leaderboard and you will appear on theirs.'}</p>
              {!preview.preview.is_me && !preview.preview.already_friends && (
                <button className="btn btn-primary" disabled={busy} onClick={() => void run(accept)}>Accept invite</button>
              )}
            </>
          )}
          <a className="friend-dismiss" href="#friends">Close invite</a>
        </div>
      )}

      <div className="friends-layout">
      <div className="friends-sidebar">
      <div className="me-box">
        <h2>Invite a friend</h2>
        <p>Anyone with your link can become your friend. Links expire after 7 days.</p>
        {invite ? (
          <>
            <label className="friend-link-label" htmlFor="friend-invite-link">Your invite link</label>
            <input id="friend-invite-link" className="friend-link" readOnly value={friendInviteUrl(invite.token)} onFocus={(event) => event.target.select()} />
            <p className="me-fine">Expires {new Date(invite.expires_at).toLocaleString()}.</p>
            <div className="r-actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => void run(copyInvite)}>Copy link</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void run(() => makeInvite(true))}>Replace link</button>
            </div>
          </>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => makeInvite())}>{busy ? 'Please wait...' : 'Get invite link'}</button>
        )}
        <p className="me-fine"><a href="#me">Save your account</a> to keep your friends across devices.</p>
      </div>

      <section className="me-section" aria-labelledby="friends-list-heading">
        <h2 id="friends-list-heading" className="me-label"><span>Your friends{friends ? ` (${friends.length})` : ''}</span></h2>
        {error ? (
          <div role="alert"><p>{error}</p><button className="btn btn-ghost" onClick={() => useUi.getState().refreshBoards()}>Try again</button></div>
        ) : friends === null ? <p role="status">Loading friends...</p> : friends.length === 0 ? (
          <p className="me-note">Your friends will appear here after they accept your invite, or you accept theirs.</p>
        ) : (
          <ul className="me-list friend-list">
            {friends.map((friend) => (
              <li key={friend.friend_id}>
                <span>{friend.nickname}</span>
                <button className="btn btn-ghost btn-sm" disabled={busy} aria-label={`Remove ${friend.nickname}`} onClick={() => void run(() => remove(friend))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="me-section" aria-label="Friends leaderboard">
        <label className="friend-board-filter" htmlFor="friend-board-mode">Friends leaderboard
          <select id="friend-board-mode" value={mode} onChange={(event) => setMode(event.target.value as BoardMode)}>
            <option value="overall">Overall</option>
            {MODES.map((game) => <option key={game} value={game}>{MODE_INFO[game].title}</option>)}
          </select>
        </label>
        <Leaderboard date={date} mode={mode} scope="friends" title="You + your friends" />
      </section>
      </div>
      <div className="friends-challenges"><ResponsiveSection title="Challenge history"><ChallengeInbox /></ResponsiveSection></div>
      </div>
    </>
  );
}
