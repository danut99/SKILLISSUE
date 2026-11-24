import { useEffect, useId, useState } from 'react';
import { useAuth } from '../lib/auth';
import { track } from '../lib/clarity';
import { disableDailyReminder, enableDailyReminder, loadDailyReminder, remindersConfigured, reminderSupport, reminderTimezone } from '../lib/dailyReminders';

export function DailyReminder({ settings = false }: { settings?: boolean }) {
  const owner = useAuth(state => state.userId);
  const status = useAuth(state => state.status);
  const id = useId();
  const [time, setTime] = useState('19:00');
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const configured = remindersConfigured();
  const support = reminderSupport();
  const online = status === 'anon' || status === 'linked';
  useEffect(() => {
    let alive = true;
    setLoaded(false); setEnabled(false); setMessage('');
    if (!configured || support !== 'supported' || !online) return;
    loadDailyReminder().then(preference => {
      if (!alive) return;
      setEnabled(Boolean(preference));
      if (preference) setTime(preference.reminder_time.slice(0, 5));
      setLoaded(true);
    }).catch(() => { if (alive) { setLoaded(true); setMessage('Could not check the reminder. You can try saving it again.'); } });
    return () => { alive = false; };
  }, [owner, online, configured, support]);
  if (!configured || (!settings && enabled)) return null;
  const act = async (disable = false) => {
    setBusy(true); setMessage('');
    try {
      await (disable ? disableDailyReminder() : enableDailyReminder(time));
      if (useAuth.getState().userId !== owner) return;
      setEnabled(!disable);
      setMessage(disable ? 'Daily reminder turned off.' : `Daily reminder saved for ${time} (${reminderTimezone()}).`);
      track(disable ? 'daily_reminder_disabled' : 'daily_reminder_enabled');
    } catch (error) { if (useAuth.getState().userId === owner) setMessage(error instanceof Error ? error.message : 'Could not save reminder.'); }
    finally { setBusy(false); }
  };
  return <section className={`daily-reminder ${settings ? 'daily-reminder-settings' : 'daily-reminder-featured'}`} aria-labelledby={id}>
    <h2 id={id}>{settings ? 'Daily reminder' : 'Remind me to play tomorrow'}</h2>
    <p>One daily reminder at your chosen time. Skipped if you already played. No account needed.</p>
    {support === 'install' ? <p>On iPhone or iPad, use Share, then Add to Home Screen. Open Skilly from there to enable reminders.</p>
      : support === 'unsupported' ? <p>This browser does not support push reminders. Try a supported browser.</p>
      : !online ? <p>Connect online to set your reminder. Guests are welcome.</p>
      : <><label htmlFor={`${id}-time`}>Your local time <small>({reminderTimezone()})</small></label>
        <div className="daily-reminder-controls"><input id={`${id}-time`} type="time" value={time} onChange={event => setTime(event.target.value)} disabled={busy} required />
        <button className="btn btn-primary" disabled={busy || !loaded || !time} onClick={() => void act()}>{busy ? 'Saving...' : enabled ? 'Save time' : 'Remind me'}</button></div>
        {enabled && <button className="link-btn" disabled={busy} onClick={() => void act(true)}>Turn off daily reminder</button>}</>}

    <p role="status" className="daily-reminder-status">{message}</p>
  </section>;
}
