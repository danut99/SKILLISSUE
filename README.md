# SKILL ISSUE 🫠

> 3 stupid daily tests. 5 tries each. Same challenge for everyone on Earth today.

A viral, TikTok-friendly daily mini-game site: **🎯 Draw** a perfect circle, **🔪 Cut** a blob 50/50, **🚗 BRAKE!** before the wall.
No login needed to play. Global daily leaderboard. Every try can be saved as a vertical video clip for TikTok.

This file is the **project handbook**. Read it first when picking the project up on another PC.

---

## 1. Quick start

```bash
cd skill-issue
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (geometry, daily seed, scoring)
npm run build      # type-check + production build → dist/
npm run lint       # oxlint
```

Works **immediately without a database**: it runs in "demo mode" (see §6).
To enable the real global leaderboard and accounts, follow §7.

---

## 2. How we got here (decisions & reasoning)

| Step | Decision | Why |
|---|---|---|
| Original idea | "Symmetry Check": draw a circle + cut a polygon 50/50 | Precision games are proven (neal.fun circle, Cutle, Eyeballing Game) |
| Problem | The mechanics already exist (Cutle, Bisecto, Hunch Daily, neal.fun) and "49.8%" is not fun to *watch* | TikTok needs a visible, dramatic fail |
| Added | 🚗 **BRAKE!** (stop as close to the wall as possible) | Instantly readable, real tension, funny crashes. Similar BRAKEPOINT exists only on game portals with levels and no daily/social layer |
| Format | **3 games on one site** (like NYT Games), **5 tries/day each**, best counts | Scarcity = frustration = come back tomorrow. More chances to be #1 at something |
| Differentiators | Daily seed for everyone, global Top 10 per game + "Grand Master", taunting roasts/badges, **video clip export**, rewarded ad for +1 try | The idea isn't new; the *format* is what makes it viral (Wordle lesson) |
| Name | **SKILL ISSUE** | Stupid, funny, TikTok slang |
| Stack | React + Vite + TypeScript (switched from a single vanilla HTML file) | Easier to grow, test and maintain |
| Look | Retro pixel style inspired by [krillion.io](https://krillion.io): VT323 font, navy `#050a14`, cyan `#4de3ff`, pink `#ff5d8f`, hard pixel shadows | "Stupid on purpose" but clean and readable on video |
| Identity | Anonymous by default + optional Google / email link (Krillion model) | Zero friction, but progress can follow you to other devices |
| Nicknames | Reserved (unique, case-insensitive) | Nobody can impersonate the #1 player |

---

## 3. The games

All games render on a **9:16 canvas** (logical 360×640, drawn at 2× = 720×1280) so recorded clips are TikTok-ready.
Daily content comes from a **UTC-date-seeded PRNG** (`xmur3` + `mulberry32`) → identical for every player worldwide.

### 🎯 Draw: Perfect Circle (`src/games/drawGame.ts`)
- Draw one stroke around the center dot. Auto-finishes after a full 360°.
- Trail color shows accuracy live (cyan = perfect → yellow → red), live % on top.
- **Score** (0–99.9): `100 × (1 − meanRadialDeviation × 4.5) − closureGap × 25` (`circleAccuracy` in `src/lib/geometry.ts`).
- Fails (score 0, counts as a try): too close to the dot, < 300° drawn ("That's not a circle 💀"), microscopic circle.
- Accidental taps (< 12 points) don't cost a try.

### 🔪 Cut 50/50 (`src/games/cutGame.ts`)
- Daily asymmetric 7–9 vertex blob (`dailyShape(date)`), random hue, **googly eyes** that look at your finger and get sliced.
- Drag one straight line. Exact areas via **Sutherland–Hodgman** half-plane clipping + **Shoelace** formula (works for concave shapes).
- Halves drift apart, percentages shown on each half, synthesized slice sound.
- **Score**: `100 − |pct − 50| × 4` (49.8/50.2 → 99.2).
- Missing the blob doesn't cost a try.
- After your last try: the **#1 player's cut** appears as a dashed gold line ("👑 #1's cut").

### 🚗 BRAKE! (`src/games/brakeGame.ts`)
- Daily road (☀️ dry / 🌧️ wet / 🧊 black ice), speed 55–100 km/h and wall distance (`brakeParams(date)`).
- Tap → 3-2-1-GO → car drives at constant speed → tap/Space to brake (constant deceleration).
- Physics is **analytic** and uses the exact event timestamp, not frame time, so precision isn't limited by FPS.
- Clean stop → camera **zooms into the gap** with a measuring arrow ("0.4 cm 😱"). Overshoot → 💥 crash, shake, debris, score 0.
- **Score**: `100 × e^(−gapCm / 200)` (1 cm ≈ 99.5, 10 cm ≈ 95, 1 m ≈ 61).

### Shared rules
- **5 tries per game per day**, best counts. +1 try per game via rewarded ad.
- Overall score = sum of best scores (0–300) → "Grand Master" leaderboard.
- Emoji per try: 🟩 ≥ 95, 🟨 ≥ 80, 🟥 below, 💥 fail/crash.
- Badges & roasts in `src/lib/scoring.ts` (e.g. "Laser-Guided Robot 🤖", "Blindfolded Potato 🥔", "Insurance Fraud 💥").
- New day at **00:00 UTC** (countdown on screen). Day number `#N` counts from `LAUNCH_DATE` in `src/config.ts`.

---

## 4. Viral & money features

| Feature | Where | How it works |
|---|---|---|
| **Share card + socials** | `lib/shareCard.ts`, `components/ShareModal.tsx` | "📤 share" draws a 1080×1920 PNG card (logo, test #, the actual game frame, result, roast, badge, emoji row, rank, "played by", "can you beat me? → link"). "Share my day" on home makes a 3-test summary card. Buttons: **TikTok / Instagram** (no web share links exist, so they open the phone's native share sheet with the image, or download + copy text on desktop), plus [react-share](https://github.com/nygardk/react-share) links for Facebook, X, WhatsApp, Telegram, Threads, Bluesky, Reddit; also save image / copy text. |
| **Share result** | `shareText()` in `scoring.ts` | Copies a Wordle-style text: `SKILL ISSUE #1 🫠 / 🎯 Draw: 96.2% 🟨🟩 (#4 today) / … / 🏆 287.4/300 · #12 worldwide / link` |
| **Save clip for TikTok** | `src/lib/clip.ts` | Each try is recorded from the canvas (`captureStream` + `MediaRecorder`, mp4 if supported else webm) **with the game sound**. The clip includes the result stamp, roast and `SKILL ISSUE #N` watermark. On phones it opens the native share sheet (→ TikTok/Instagram/WhatsApp); on desktop it downloads the file. 100% in-browser, no server. |
| **Bottom ad banner** | `src/components/AdBanner.tsx` | Fixed 320×50 slot, space reserved in CSS → zero layout shift. Instructions for AdSense/Adsterra in the file. |
| **Rewarded ad (+1 try)** | `src/components/RewardedAdModal.tsx` | **Disabled for now** (`REWARDED_ADS = false` in `config.ts`). Currently a 5-second placeholder. Replace with a real rewarded unit and call `onReward()` from its "reward granted" callback. |
| **Confetti** | `GameScreen.tsx` | On scores ≥ 95 (off in low-power mode). |
| **Streak rewards** | `CAR_SKINS` in `config.ts`, garage in ⚙️ | BRAKE! car skins unlock at 3/7/14/30-day best streak. |
| **Settings & stats** | `SettingsModal.tsx` | Low-power, colorblind (🟧🟦⬛ emoji + orange/blue palette), share-link toggle, my stats, garage. |
| **Privacy page** | `PrivacyPage.tsx` (`#privacy`) | Plain-language notice. Fill in contact email + ad/CMP provider before launch. |
| **Auto names & auto-save** | `randomName()` in `store.ts`, `ResultPanel.tsx` | Every player gets a silly random name on first visit (e.g. `WobblyPotato42`). Every try is saved to the leaderboard automatically, with no "Submit" step. Result card shows "✅ saved to today's top 10 #5" and "playing as X ✏️ change name". Online, the name is claimed on the server automatically (re-rolled if taken). |
| **"You" on the leaderboard** | `Leaderboard.tsx` | Your row is cyan with a pink marker and flashes when updated; "▶ you're #N today" under the table. |
| **Top bar** | `App.tsx` | ☰ menu (left) · small **SKILL ISSUE** logo linking home on every sub-page, like Krillion (home keeps the big logo) · 🔊 / ⚙️ (right). No "← home" buttons. |
| **☰ Menu** | `MenuModal.tsx` | Krillion-style tile menu; "soon" tiles tease upcoming features; TikTok + feedback links from `LINKS` in `config.ts`. |
| **My Skill Issue / FAQ** | `MePage.tsx` (`#me`), `FaqPage.tsx` (`#faq`) | Clean logbook in "My Krillion" style (dashed section labels, 4-cell stat strip, list rows, garage tiles with pixel cars): an always-visible **"keep your scores together."** box (Google / email), a friends invite link, stats, today, garage. Without Supabase the account buttons show "accounts aren't live yet". Plus the rules/scoring FAQ. |

---

## 5. Inspiration: what we took from krillion.io

[Krillion](https://krillion.io) ("the daily dive") is a solo-dev daily game with the exact model we want: free, daily, anonymous-first, ad-funded. Reviewed on 2026-11-12.

| Krillion feature | What it does | Us |
|---|---|---|
| Retro pixel look (VT323, navy `#050a14`, cyan/pink) | Strong, simple identity | ✅ done (our theme) |
| Daily number ("dive #120"), same for everyone | Shareable, comparable | ✅ `SKILL ISSUE #N` |
| **☰ Main menu**: modal with 2-column pixel tiles (Daily, Unlimited, Party, Archive, Packs, My Krillion, Friends, Settings, FAQ), current page in pink, link cards (Merch ↗, sister game ↗), footer tagline | One place for everything, very "app-like" | ✅ done: ☰ top-left → Today/Draw/Cut/Brake (with today's emoji row), My Skill Issue, Settings, FAQ, Privacy, Friends, plus **"soon"** tiles (Archive, Practice, Brake Battle), link cards (TikTok ↗, Feedback ↗), "it's a skill issue." |
| Collapsible **"▸ how to play"** with 5–6 short lowercase lines | Zero-friction onboarding | ✅ done (home + `#how`) |
| **Settings**: low-power mode, colorblind mode, "add link under shared results" toggle | Accessibility & performance on cheap phones | ✅ done (⚙️ top-right). Our share link defaults **ON** (virality), theirs OFF |
| **"My Krillion" logbook page**: account, stats (current/best streak, days played, best score), completed games, earned buddies | Retention, one history | ✅ done: **"My Skill Issue"** page (`#me`): account card, stats, today's results, garage |
| **FAQ page** | Answers scoring/rules questions | ✅ done (`#faq`) |
| **Wardrobe**: dive-buddy mascots unlocked at 5/14/30/45-day streaks | Streak rewards keep people coming back | ✅ done as a **garage**: BRAKE! car skins at 3/7/14/30-day streaks |
| Anonymous play + "Continue with Google" to sync devices | No friction, optional account | ✅ done (+ email magic link) |
| **Asks to merge this device's history when signing in** | No lost progress when logging in on a new device | ⏳ TODO (we currently warn that guest tries won't merge; needs a server `merge_guest` step) |
| **Privacy page** + footer links (privacy, FAQ, socials) | Required for ads/GDPR, builds trust | ✅ privacy (`#privacy`) + FAQ (`#faq`); social/feedback links in `LINKS` (`config.ts`) |
| **Cookie consent banner (CMP)**: consentmanager.net with Reject all / Settings / "Update Privacy Settings" link | **Legally required** in EU/UK for personalized ads; Google requires a certified CMP | ⏳ TODO before enabling ads (Google "Privacy & messaging" or consentmanager/Cookiebot) |
| Ads via Google Ad Manager (GPT) + Google Analytics | Monetization + metrics | ⏳ TODO (banner slot ready) |
| **One-time $5 unlock (Stripe Payment Link)** = removes ads site-wide + unlocks archive/unlimited; "Restore on another device" | Second revenue stream, no subscription | ⏳ TODO idea: "SKILL ISSUE+": no ads, unlimited practice mode, archive of past days |
| **Archive** (replay past days; replays don't extend streak) | Content for new players | ⏳ TODO (easy: the daily seed already supports any date) |
| **Unlimited / themed packs** | Endless play | ⏳ TODO (practice mode with random seed, not ranked) |
| **Friends leaderboard** via invite link | Social pressure, small groups | Implemented at `#friends`: invite previews, acceptance, removal, daily overall/per-game rankings. Apply the friends migration to enable it. |
| **Live multiplayer party mode** ("Puffer Party", live player count) | Huge engagement spike | 💡 later (e.g. live BRAKE! battle rooms via Supabase Realtime) |
| Mascot with personality ("a friend… blub!") | Brand, shareability | 💡 idea: our blob from Cut 50/50 as the mascot |
| OG image 1200×630, Google site verification | Nice link previews, SEO | ⏳ TODO |
| Merch, Instagram, subreddit; warns about **impersonator accounts** | Community | 💡 reserve @skillissue handles early (TikTok, IG, X) |
| Day resets at midnight **ET** | US-centric audience | We keep **00:00 UTC** (fair worldwide). Revisit if the audience is mostly US |

---

## 6. Player identity: how it works

### A) Today: no database connected → "demo mode"
Everything is stored in **this browser's `localStorage`** (`skillissue:v1`, `skillissue:mocklb`).
- A random `playerId` is created silently; the player just plays.
- Tries, nickname and streak are saved locally.
- Leaderboard = **demo board**: seeded fake bots + you, labelled "🧪 demo".
- Same browser later → everything still there. Other device / incognito / cleared data → new player, progress lost.
- Account card ("save progress") is **hidden** in this mode.

### B) Supabase connected, no account → "guest" (default for everyone)
- First visit → Supabase **anonymous sign-in** happens silently (no login screen). Session token stored in the browser.
- Every try is sent to the server (`record_attempt`). **The server counts tries**, so a 4th one is refused unless a bonus was granted.
- Every player gets a random silly name; it's claimed automatically (`set_nickname`, re-rolled if taken). Every try appears on the board automatically. "✏️ change name" renames (unique, "taken 😤" if not).
- Real global leaderboard (only players with a nickname are listed).
- Same browser later → same guest, state loaded from the server (`get_my_state`).
- Other device / cleared data → a *new* guest (old progress stays on the server but is unreachable). Hence →

### C) Supabase connected, with account (Google or email linked)
- After setting a nickname, players see **"🔒 save your progress"** with `continue with google` or `email → send link`.
- Linking **does not create a new player**: Google/email is attached to the *same* user id → nickname, scores, streak are kept.
- **New device**: open the site (silently a new guest) → press the **same buttons**:
  - Google already linked to a player → "that Google account already has a player, switch to it?" → logs in.
  - Email already registered → a login link is emailed.
  - Then nickname, today's tries, streak and leaderboard spot are loaded. The 3-try limit is shared across devices.
- **Sign out** → becomes a fresh anonymous guest; account data stays on the server.

| | Demo (now) | Guest | Account |
|---|---|---|---|
| Login needed | no | no | one tap (optional) |
| Real global leaderboard | ❌ | ✅ | ✅ |
| Reserved nickname | ❌ | ✅ | ✅ |
| 5 tries enforced by server | ❌ | ✅ | ✅ |
| Survives clearing browser data | ❌ | ❌ | ✅ |
| Continue on another device | ❌ | ❌ | ✅ |

Known limitation: guest tries made on a new device are **not merged** when you then log into an existing account (the UI warns before switching).

---

## 7. Connecting Supabase (real leaderboard + accounts)

**Status: Supabase is configured locally. Friends RPCs were detected on the live project on 2026-11-12.**

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql). The core game SQL is also in the comment at the top of `src/lib/leaderboard.ts`. Friends SQL is maintained in `schema.sql` and the migration below.
3. **Authentication → Providers / Sign In**: enable **Anonymous sign-ins**, **Email**, **Google** (needs a Google Cloud OAuth client), and **Manual linking**.
4. **Authentication → URL Configuration**: set Site URL and add your domains (and `http://localhost:5173`) to Redirect URLs.
5. `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys, copy the `sb_publishable_...` key). `.env` is git-ignored. Existing deployments can still use `VITE_SUPABASE_ANON_KEY` as a fallback. The publishable variable takes priority when both are set.
6. Restart `npm run dev`. The demo label disappears, and the account card shows up after a nickname is set.

### Database design (`supabase/schema.sql`)
| Object | Purpose |
|---|---|
| `profiles(id → auth.users, nickname)` | Unique case-insensitive nickname per player |
| `attempts` | Every try (user, UTC date, mode, score, detail). Enables server-side try limit and cross-device resume |
| `bonuses` | +1 try per mode/day (rewarded ad) |
| `daily_scores` | Best score per (user, day, mode) → leaderboards |
| `record_attempt(mode, score, detail)` | Validates input, **server decides the date**, enforces 3 (+bonus) tries, updates the best score |
| `grant_bonus(mode)` | Adds the +1 try |
| `set_nickname(name)` | Claims/renames; raises `nickname_taken` |
| `get_my_state()` | Nickname, today's tries, bonuses, played dates (streak) for a returning player |
| `get_leaderboard(mode)` | Today's Top 10 (+ your own row if outside) for `draw`/`cut`/`brake`/`overall`; never exposes user ids, only `is_me` |

Security: RLS is on for all tables. Players can only read their own rows, and **all writes go through the `SECURITY DEFINER` functions above**.

---

### Friends database update

For an existing database, run [`supabase/migrations/20261112000000_friends.sql`](supabase/migrations/20261112000000_friends.sql) in the Supabase SQL Editor. For a fresh database, `schema.sql` already includes it.

The migration adds `friends` and `friend_invites`, with row-level security and authenticated RPCs. Friendships are mutual and stored once per pair. Invite links expire after seven days and can be replaced. Opening a link shows a preview, and accepting it connects the players. Either player can remove the connection. Friends work for anonymous players too. Linking Google/email preserves the same player identity.

The `#friends` page shows the Top 10 friends plus your own rank, for overall or an individual game. Rankings include you and your direct friends, with Daily and All-time views.

### All-time leaderboard database update

For level rankings on an existing database, run [`supabase/migrations/20261114080000_level_leaderboard.sql`](supabase/migrations/20261114080000_level_leaderboard.sql) after the level records migrations. This adds the Levels tab for global and friends rankings. Players are ordered by total stars, levels cleared, then the sum of their best level scores. Overall covers all three games, including the five-level car ladder. Fresh databases include the function in `schema.sql`.

For an existing database, run [`supabase/migrations/20261112010000_all_time_leaderboard.sql`](supabase/migrations/20261112010000_all_time_leaderboard.sql) in the Supabase SQL Editor after the friends migration. Fresh databases include this function in `schema.sql`.

Daily and All-time are available on each leaderboard, including the mobile trophy panel and friends page. All-time adds the best score per game per UTC day from `daily_scores`. Overall sums all three games across all dates. Rankings return the top 10 plus the caller's row. Daily result-card ranks and the best-cut reveal continue to use today's board. Offline totals use the history saved on the device, which is now retained beyond one week.

## 8. Project structure

```
skill-issue/
├── index.html                 # meta/OG tags, root
├── .env.example               # Supabase keys + Clarity id template
├── supabase/schema.sql        # full DB setup (tables, RLS, RPC functions)
└── src/
    ├── config.ts              # Supabase placeholders, game name, LAUNCH_DATE, modes, colors
    ├── App.tsx                # hash routing (#draw/#cut/#brake/#me/#faq/#privacy), menu, day rollover, mute, toasts
    ├── index.css              # retro pixel theme
    ├── games/                 # pure canvas engines (no React)
    │   ├── types.ts           # Game interface, stage size, palette
    │   ├── canvas.ts          # drawing helpers (grid, scanlines, banner stamp, text)
    │   ├── drawGame.ts | cutGame.ts | brakeGame.ts | lockedGame.ts
    ├── components/            # React UI
    │   ├── Home.tsx           # game cards, total, Grand Master board, account card
    │   ├── GameScreen.tsx     # one attempt = one game instance; result timing; clip; ads
    │   ├── GameCanvas.tsx     # render loop + pointer/keyboard → game
    │   ├── ResultPanel.tsx    # score, badge, retry/ad/next, clip, share, nickname
    │   ├── MenuModal.tsx      # ☰ Krillion-style tile menu
    │   ├── SettingsModal.tsx  # settings toggles
    │   ├── MePage.tsx         # #me: account, stats, today, car garage
    │   ├── FaqPage.tsx        # #faq
    │   ├── PrivacyPage.tsx    # #privacy
    │   ├── Leaderboard.tsx | AccountCard.tsx | RewardedAdModal.tsx | AdBanner.tsx | Countdown.tsx
    └── lib/
        ├── store.ts           # zustand + localStorage (versioned + migrate): player, tries, streak, stats, settings, skin
        ├── auth.ts            # anonymous auth, Google/email linking, sign out, sync
        ├── supabase.ts        # lazy Supabase client (only loaded when configured)
        ├── leaderboard.ts     # SQL (comment) + record/claim/bonus/fetch + demo board
        ├── scoring.ts         # formatting, badges, roasts, emoji, share text
        ├── geometry.ts        # clipping, shoelace, centroid, circle accuracy
        ├── daily.ts           # seeded PRNG, UTC dates, countdown
        ├── audio.ts           # Web Audio synthesized SFX (slice, crash, screech, engine…)
        ├── clip.ts            # canvas+audio recorder, share/download
        └── ui.ts              # toasts, ranks, leaderboard refresh
```

Libraries: `react`, `zustand` (state), `motion` (UI animation), `canvas-confetti`, `react-share` (social share buttons), `@supabase/supabase-js` (lazy), `vitest`, `oxlint`.

---

## 9. Status & next steps

**Done & verified in the browser (demo mode):** all 3 games, scoring, results, nickname, per-game and overall leaderboards, tries/ad flow, share text, clip button, home/totals/streak, how-to-play, ☰ menu, My Skill Issue page, FAQ, desktop layout (games left · sticky leaderboard right, 4-column menu), settings (low-power / colorblind / share link), stats, garage, privacy page, storage migration. Type-check, tests and build all pass.

**Not done / not verified yet:**
- [x] Configure the Supabase project and apply the friends database update (live friends RPCs detected).
- [ ] Configure the Google OAuth client and email templates in Supabase.
- [ ] Test guest → link Google/email → new device login end-to-end.
- [ ] **Cookie consent (CMP)** before any ads/analytics in EU/UK (Google Privacy & messaging, consentmanager.net or Cookiebot) + "update privacy settings" link in the footer.
- [ ] Real ad network: banner (AdSense/Adsterra/Ad Manager) + rewarded unit in `RewardedAdModal`.
- [ ] Privacy page: real contact email, ad/CMP vendor names. Replace `LINKS` (TikTok handle, feedback email) in `config.ts`.
- [ ] Merge guest history on sign-in (ask first, like Krillion).
- [ ] Archive (replay past days, no streak) + unlimited practice mode (random seed, unranked).
- [x] Friends invite links, acceptance, removal and daily leaderboard. Friends RPCs detected on the configured live project after the migration was run.
- [ ] Optional one-time unlock "SKILL ISSUE+" (Stripe Payment Link): no ads + archive + unlimited, restorable via account.
- [x] Analytics: Microsoft Clarity (`src/lib/clarity.ts`). The project id is `CLARITY_PROJECT_ID` in `config.ts` (override with `VITE_CLARITY_PROJECT_ID`). It loads only in production builds and allows analytics cookies from the start (stable Clarity user per device). ⚠️ No consent banner yet, so this is not GDPR-compliant for EU/UK visitors. When a CMP is added, call `setClarityConsent('denied')` for players who refuse. Sessions are identified by player id + nickname (`identify`). Custom events: `page_<route>`, `home_card_<mode>`, `game_start_<mode>`, `game_finish_<mode>`, `game_<perfect|great|ok|bad|fail>_<mode>`, `game_retry_<mode>`, `out_of_tries_<mode>`, `next_game_<mode|home>`, `share_open_<mode|day>`, `share_<channel>_<mode|day>`, `clip_save_<mode>`, `challenge_friend_<mode>`, `ad_open_<mode>`, `bonus_try_<mode>`, `menu_<tile>`, `menu_open`, `settings_open`, `setting_<key>_<on|off>`, `leaderboard_open`, `sound_<on|off>`, `feedback_click`, `google_continue`, `google_switch`, `challenge_accept[_past]_<mode>`. Tags: `nickname`, `account`, `page`, `played`, `score_<mode>`.
- [ ] Reserve social handles early (TikTok/IG/X) to avoid impersonators.
- [ ] Domain + deploy (any static host: Vercel / Netlify / Cloudflare Pages → `npm run build`, serve `dist/`).
- [ ] OG share image (1200×630) for nice link previews.
- [ ] Test clip export on real iPhone/Android (MediaRecorder support varies; Safari records mp4).
- [ ] Balance tuning after real players (circle scoring factor 4.5, brake decay 200 cm, road params).
- [ ] Ideas: live multiplayer BRAKE! rooms, country flags on the board, blob mascot, more streak cosmetics (circle trail colors, blob hats).

**Known limitations:** client-side scores can still be faked by a determined cheater (the server validates range and try count, not the gameplay itself). Possible future fix: send raw input (cut line / stroke / brake time) and recompute the score server-side.


## Tracked score challenges

Run `supabase/migrations/20261112020000_score_challenges.sql` in Supabase SQL Editor on an existing project. Fresh installs include the same setup in `schema.sql`.

- Beat my score creates a database challenge from the sender's saved daily score. The target score is fixed at link creation.
- New links use `#cut/duel/<token>` (or draw/brake). Opening previews the challenge; Accept challenge records the recipient's consent.
- Daily scores automatically supply accepted players' results. Acceptance is idempotent and uses the existing daily attempts, without granting extra tries.
- Your challenges appears in Friends and on the homepage. It polls every 15 seconds while visible and refreshes on focus and score updates.
- **Past-day challenges** (`supabase/migrations/20261113000000_past_challenge_play.sql`): a link from an earlier day can still be accepted and played on that day's puzzle (5 tries, shared with any normal tries from that day). `record_challenge_attempt` saves the score under the challenge's `play_date`, so it never shows on today's daily board but counts in the all-time board and the challenge result. These replays don't count toward streaks. Expired banners link to "Play today's challenges".
- Anonymous sessions work; email linking preserves ownership. Older `/beat?` links remain local comparisons and cannot be retroactively tracked.
- Tables deny direct API access; authenticated RPCs enforce ownership and participant visibility. Link previews expose the sender's nickname and target score, and no other recipients.
- To verify against a live project: send a link from browser A; open it in a separate browser B; accept; check A's list; play in B; check both scores and winner in A. Repeat acceptance (no duplicates), open a past-day link (accept → that day's puzzle, score missing from today's daily board, present in all-time), and confirm a third account cannot list A's challenges.


## Party Mode (six-round Draw/Cut rooms)

Run `supabase/migrations/20261112030000_party_rooms.sql` in Supabase SQL Editor on an existing project. Fresh installs include it in `schema.sql`.

Menu -> Party -> Create party -> Copy invite. Players explicitly join and ready up; only the host starts the match with 2-8 ready players. A shared server start time gives everyone a five-second countdown, then six rounds:

| Round | Test | Time |
|---|---|---|
| 1 | Draw circle | 16s |
| 2 | Cut | 16s |
| 3 | Draw square | 16s |
| 4 | Cut, more vertices | 16s |
| 5 | Draw triangle | 16s |
| 6 | Cut, most vertices | 16s |

Each round gives every player 16 seconds, followed by six seconds for the reveal. Difficulty increases through shape changes, not shorter timers. One attempt each; results total up to 600, with tied totals sharing rank. Missing rounds score zero. Host can open a rematch lobby using the same invite; players ready again and new match seeds are used. Room links expire after 24 hours.

Party play never calls daily attempt/bonus APIs. The server enforces membership, host controls, capacity, match/round submission windows and one immutable score per player/round. Other players' scores are masked until the round deadline. Scores are still computed client-side, like the daily games; this is not a cheat-proof tournament system.

Clients poll once per second and estimate the server clock from request timing. They use an absolute round deadline (not a touch-start timer). Local attempt records prevent a refresh from granting another attempt; reloading an unfinished active round forfeits it. Lost score acknowledgements retry idempotently during the server's two-second delivery grace period. No Realtime configuration is required.

Live verification after applying SQL: use two separate browser sessions; join, ready, start, verify identical polygons and synchronized timers; submit, verify scores hidden until reveal; refresh an active attempt and verify no replay; miss a round and verify zero; verify six rounds and tied final standings; rematch and confirm readiness and scores reset. Also verify non-host start is rejected, ninth-player join is rejected, and old-match/late submissions are rejected.


Party timer update: after the party rooms migration, run `supabase/migrations/20261112040000_party_equal_round_times.sql` to use equal 16-second rounds. Apply between matches, then start a fresh match. The shared match schedule is 132 seconds plus the five-second initial countdown.


## Level mode (Draw, Cut, Car)

Apply `supabase/migrations/20261114000000_skill_levels.sql` in Supabase SQL Editor. The homepage cards offer Mode: Daily / Level. Level progress is separate from daily attempts and leaderboard scores; an online guest or linked account is required.

Each game has five levels. Every level grants three attempts. A score of 85+ advances immediately and grants three fresh attempts. Three unsuccessful attempts lock that level until 00:00 UTC, when its tries reset without losing cleared levels. Completing level 5 clears that game's ladder.

Draw progresses through circle, square, triangle, diamond, and hexagon. Cut adds vertices; shapes are seeded by level. Car uses seeded driving objectives and increases speed by level. Draw and Cut retain their existing daily-style 8s / 5s timers. Starting reserves a try on the server; refreshing or leaving forfeits it. Scores are client-calculated, as in daily play. Finish requests are idempotent and expire after two minutes; concurrent starts invalidate earlier unfinished attempts.

Live verification after SQL: fail three attempts, verify lock after reload; pass at 85+, verify next level immediately has three tries; verify Draw/Cut/Car progress independently; verify daily tries do not change; retry a finish request and confirm no double advance; verify email-linked account restores progress on another device; test UTC rollover and final ladder completion.


Party car rounds: apply supabase/migrations/20261114030000_party_brake_rounds.sql
after the Party social/round-count migrations. New matches rotate Draw, Cut, Brake,
with a shared room/match/round seed and 16 seconds per round. Car objectives cycle
through wall stops, parking, and stop lines. Party attempts never consume daily
tries. Existing matches retain their version-one Draw/Cut rotation, including
history; new rematches use version two. Apply the early-reveal migration as well
to skip unused play time once everyone has submitted.


Party game selection: apply supabase/migrations/20261114040000_party_game_selection.sql
after Party car rounds. Hosts can choose any nonempty subset of Draw/Cut/Brake
before creating a room and in the lobby. The server validates and normalizes the
selection, resets Ready status when it changes, and snapshots it when the match
starts. Guests, gameplay, previews, and historical match labels use that snapshot.

Level pass threshold update: run `supabase/migrations/20261114050000_level_pass_85.sql` to lower the passing score to 85 for Draw, Cut, and Car. Existing progress is preserved.


### Level stars and replays

Apply `supabase/migrations/20261114060000_level_stars_replays.sql` after the 85-point threshold migration. Scores of 85+, 90+, and 95+ earn one, two, and three stars. The best score/stars for each level are preserved; replays never lower them or move the highest unlocked level backward. The level picker supports replaying cleared levels even after completing the ladder.

Each individual level has three starts per UTC day, including the original clear and subsequent replays. Passing opens a new level with its own fresh budget; replaying does not reset an existing budget. A refresh or abandoned start still consumes a try. The migration backfills historical best scores and today's used starts. Daily competition attempts remain separate.

Live checks: clear at 85 then continue immediately; replay the cleared level at 95 and verify three stars; replay below 85 and verify those stars and the unlocked level stay; exhaust the replay budget and verify another unlocked level remains playable; reload and verify persistence; retry finish requests and verify no double advancement; test locked-level requests and UTC budget resets.


Level attempt update: run `supabase/migrations/20261114070000_five_level_attempts.sql` after the stars/replays migration. Each level now allows five attempts per UTC day, including replays. Existing used attempts, stars, and progress are preserved; players who used three attempts today receive two more.
