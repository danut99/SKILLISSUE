import { GAME_NAME } from '../config';

/**
 * Plain-language privacy notice. Required by ad networks (AdSense etc.) and GDPR.
 * Review it before launch and add your contact email + the ad/consent provider you pick.
 */
export function PrivacyPage() {
  return (
    <section className="screen home legal">
      <h1>privacy</h1>
      <p>
        {GAME_NAME} is a free daily game. You can play without an account, an email or a password. This page explains what we store.
      </p>

      <h2>on your device</h2>
      <p>
        Your browser's local storage keeps your tries, scores, nickname, streak, settings and a random player id. Clearing site data
        removes it.
      </p>

      <h2>on our server (when the leaderboard is enabled)</h2>
      <ul>
        <li>An anonymous player id, created automatically when you first play.</li>
        <li>Your tries and scores (with the date), your nickname, and bonus tries.</li>
        <li>
          If you choose "save your progress": your email address or your Google account id/email, only to log you in on other
          devices.
        </li>
      </ul>
      <p>Your nickname and daily scores are shown publicly on the leaderboards. Your id and email are never shown.</p>

      <h2>video clips</h2>
      <p>"Save clip" records the game area inside your browser. The video never leaves your device unless you share it yourself.</p>

      <h2>ads &amp; cookies</h2>
      <p>
        We show ads to keep the game free. Ad partners may use cookies or similar technologies. Where the law requires it (EU/UK),
        we ask for your consent first and you can change your choice at any time.
      </p>

      <h2>delete your data</h2>
      <p>Contact us and we'll delete your player and all its scores.</p>
      <p className="muted">contact: hello@YOUR-DOMAIN · last updated: {new Date(2026, 10, 12).toDateString()}</p>
    </section>
  );
}
