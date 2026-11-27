# Juno: a personal assistant that learns from you

Juno is a personal assistant built with [eve](https://eve.dev). It runs on your phone like an app. It reads your calendar and mail, tells you what matters today, saves drafts of replies, adds the events you have approved, and gets to know you over time. You can talk to it out loud, and it can nudge you with notifications.

Several people can have their own accounts, each with their own memory, name, avatar and Google connection.

## What Juno does

| Feature | How it works |
| --- | --- |
| **Morning brief and quote** | 07:00 each day: calendar, unread mail and Slack, a short brief, one motivational quote. Saved in the app and sent as a notification. |
| **Mail triage with drafts** | Sorts unread mail and saves replies as **Gmail drafts**. Juno never sends mail. |
| **Calendar proposals** | Suggests events from mail and Slack; creates one only after you approve that call. |
| **Automatic calendar rules** | You approve a recurring rule once ("every Monday 09:00, standup, 30 min"). Juno then adds it every week, and you can remove it any time. |
| **Weekly review** | Sunday 18:00: what went well, what is coming up, three suggestions. |
| **Long-term memory** | [Supermemory](https://supermemory.ai) keeps facts about you and recalls them. A nightly review corrects facts from your feedback. |
| **Voice** | Speak to Juno and hear replies. [Deepgram](https://deepgram.com) does speech-to-text and text-to-speech. |
| **Notifications** | Web push to your phone when a brief or review is ready. |
| **Animated avatar with moods** | Juno is an animated face that blinks, follows your finger, thinks while it works and talks while it speaks. Every reply carries a mood (happy, excited, thinking, concerned, empathetic, proud, sleepy and more), and the face shows it. |
| **Celebrations** | Juno knows the day: Diwali, Christmas, Eid, Lunar New Year, Holi, Thanksgiving, Halloween and more, plus your birthday and the day you joined. It wears a festive accessory, plays confetti, fireworks, snow or hearts, and greets you. |
| **Name and look** | Rename Juno and pick one of six colours. Each person chooses their own. |
| **Accounts** | Sign up in the app (with an invite code if you set one). Each person has a separate memory and Google connection. Sign-in uses a token, so the browser never shows a password pop-up. |

## Architecture

```
agent/
  agent.ts                  model (Groq, gpt-oss-20b), workflow history kept
  lib/model.ts              the Groq model (OpenAI-compatible)
  lib/rate-limit.ts         per-person and daily limits
  instructions.md           Juno's personality and rules
  channels/
    eve.ts                  chat API: sign-in, per-person name and time zone
    voice.ts                /eve/v1/voice/transcribe and /speak (Deepgram)
    account.ts              accounts, settings, Google connect, push
    jobs.ts                 /eve/v1/jobs/run (called by the daily schedules)
    home.ts                 serves the phone app at /
  schedules/                07:00 brief, 06:30 calendar rules, 02:30 review, Sunday 18:00 weekly
  lib/
    accounts.ts             users, password hashing, sign-in, invite codes
    google.ts               each person's Google connection (OAuth)
    push.ts                 web push notifications
    jobs.ts                 the prompts for each job
    learning-memory.ts      each person's log: exchanges, feedback, briefs
    store.ts                durable documents (Vercel Blob or a local file)
  memory/                   Supermemory facts, and the learning log
  tools/                    calendar, Gmail (read and drafts), auto rules, Slack
web/                        phone app, built with Effect UI (@effect/ui) and Vite
  src/App.ts                sign-in or home, keeps the session token
  src/pages/AuthScreen.ts   sign in and create account
  src/pages/Home.ts         the assistant: avatar, voice, replies, approvals, settings
  src/components/Avatar.ts  Juno's animated face (moods, blinking, gaze, accessories)
  src/components/FxLayer.ts confetti, fireworks, snow and other celebrations
  public/                   manifest, service worker and icons
scripts/embed-web.mjs       embeds web/dist into the agent (run by npm run dev and build)
```

Key design points:

- **Approval before writes.** Creating a single calendar event asks you first. Creating an automatic rule asks you first. Juno never sends mail.
- **Separate memory for each person.** Each signed-in account is its own memory scope, so people never see each other's facts.
- **Read-only where it can be.** Calendar and mail reads don't change anything. Drafts are saved only in your Gmail drafts folder.
- **Cost control.** Recall is done by Supermemory, the cheapest good Claude model is the default, and most work happens once a day.

## Set it up

### 1. Requirements

Node.js 24 or newer.

### 2. Run it on your computer

```bash
npm install
cp .env.example .env        # fill in the keys you have
npm run dev                 # starts Juno at http://localhost:2000
```

Locally, requests don't need a password. Open http://localhost:2000 in a browser.

To try the morning brief now, without waiting:

```bash
curl -X POST "http://localhost:2000/eve/v1/dev/schedules/morning-brief"
```

### 3. Deploy it so your phone can reach it

Microphones and notifications only work over HTTPS, so deploy it. On Vercel's free Hobby plan:

1. Push this repo to GitHub and import it in Vercel.
2. In Vercel, add a **private** Blob store (**Storage → Create → Blob**) to the project. This sets `BLOB_READ_WRITE_TOKEN`.
3. Add the variables from `.env.example` under **Settings → Environment Variables**. Set `APP_URL` to your address, for example `https://juno.vercel.app`.
4. Deploy with `npx eve deploy`, or push to the connected branch.

### 4. Keys and services (all have free tiers)

| Service | What for | Set |
| --- | --- | --- |
| [Groq](https://console.groq.com/keys) | Juno's replies (free tier, `openai/gpt-oss-20b`) | `GROQ_API_KEY` (optional `GROQ_MODEL`) |
| [Supermemory](https://console.supermemory.ai/keys) | Long-term memory ($5/month free credit) | `SUPERMEMORY_API_KEY` |
| Invite code (optional) | Only people with the code can sign up | `INVITE_REQUIRED=on` and `INVITE_CODE` (any long phrase). Off by default. |
| `CRON_SECRET` | Lets scheduled jobs run | any long random string |
| [Deepgram](https://console.deepgram.com) | Voice ($200 free credit, no expiry) | `DEEPGRAM_API_KEY` |
| VAPID keys | Notifications (free) | run `npx web-push generate-vapid-keys`, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:you@example.com` |
| Google Cloud OAuth client | Calendar and Gmail (free) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Slack bot (optional) | Slack messages (free) | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_IDS` |

### 5. Connect Google (once, for the whole app)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Calendar API** and the **Gmail API**.
2. Under **OAuth consent screen**, choose *External*, add the scopes `calendar.readonly`, `calendar.events`, `gmail.readonly` and `gmail.compose`, and add each person's Google address as a **test user** while the app is in *Testing*.
3. Under **Credentials**, create an **OAuth client ID** of type *Web application*. Add this redirect URI: `<APP_URL>/eve/v1/google/callback` (for example `https://juno.vercel.app/eve/v1/google/callback`).
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Each person then connects their own account in **Settings → Connect Google**.

### 6. Install it on your phone

- **iPhone:** open the link in Safari, tap Share, then *Add to Home Screen*. Notifications work once it's installed this way (iOS 16.4 or later).
- **Android:** open the link in Chrome, then use the menu and *Install app*.

### How people get in

Share your address (for example https://juno-mallank.vercel.app). Each person opens it, taps **Create account**, picks a username and password (plus the invite code, if invites are on), and is signed in straight away. They then add it to their home screen as above. Invites are off by default, so anyone can sign up. To keep Juno private, set `INVITE_REQUIRED=on` and `INVITE_CODE`; set `INVITE_REQUIRED=off` to open it again without deleting the code.

Set `AUTH_SECRET` (any long random string) in production. It signs the sign-in tokens; changing it signs everyone out.

## Using Juno

- **Talk:** tap the mic, speak, then tap it again to send. Or tap the keyboard to type. Tap a suggestion for a quick start.
- **Moods and celebrations:** tap Juno to say hi. On a festival or your birthday, tap the banner to celebrate again. Turn spoken replies and seasonal effects on or off in Settings.
- **Name, look and birthday:** set them in Settings.
- **Time zone:** set it in Settings. Calendar events and the brief use it.
- **Automatic rules:** ask in chat, e.g. "add my team standup every Monday at 9 for 30 minutes". Juno asks you to approve the rule. Manage rules in Settings.
- **Notifications:** **Settings → Turn on notifications**, then *Send a test*.

## Rate limits

Juno limits how much can be used, to protect the free quotas and to stop abuse:

| Limit | Default | Setting |
| --- | --- | --- |
| Chat messages per person | 10 a minute, 200 a day | `RL_CHAT_PER_MINUTE`, `RL_CHAT_PER_DAY` |
| Voice (talk and speech) per person | 12 a minute | `RL_VOICE_PER_MINUTE` |
| Failed sign-ins per username | 10 per 15 minutes | `RL_SIGNIN_FAILS_15MIN` |
| Account creation per network address | 5 an hour | `RL_REGISTER_PER_HOUR` |
| Model turns across everyone (chat and daily jobs) | 900 a day | `RL_DAILY_TURNS_TOTAL` |

When a limit is hit, the app shows how long to wait. The daily total is the important one: it keeps everyone inside Groq's daily allowance. Counts reset at fixed times (minutes, hours, or midnight UTC).

**Groq's free tier is small.** Check your limits at https://console.groq.com/settings/limits. Tokens per minute matter most: a long brief with a calendar and mail can use several thousand tokens. If briefs fail with a rate-limit message, lower the number of people or move to a paid Groq plan.

## Scheduled jobs

Each job runs once for every person, as that person:

| When (New York time) | Job |
| --- | --- |
| 02:30 daily | Memory review: updates or forgets facts from your feedback |
| 06:30 daily | Adds this week's events from approved rules |
| 07:00 daily | Morning brief, mail triage drafts, notification |
| Sunday 18:00 | Weekly review, notification |

The times live in `agent/schedules/`. Change `timezone` there to move them.

## Costs

| Piece | Cost |
| --- | --- |
| eve, Node.js, this repo | Free (open source) |
| Google Calendar and Gmail APIs | Free at personal scale |
| Slack bot | Free |
| Supermemory | Free plan: $5 of credits a month |
| Deepgram voice | Free $200 credit, no expiry |
| Web push notifications | Free |
| Vercel Hobby and Blob | Free tier, personal use |
| Groq | Free tier with per-minute and per-day limits. Paid plans raise them |

## Privacy and limits

- **Who can see what.** Each person's memory, rules, Google token and notification subscriptions are kept on their account. The app only returns a person's own data to their own sign-in. Whoever controls the deployment's environment variables and storage can read everything stored, so protect those accounts with two-factor sign-in.
- **Stored data.** Accounts (with hashed passwords), Google refresh tokens and each person's briefs and feedback are stored in your private Blob store. Conversations are kept in the workflow store so the app can show earlier messages. Delete conversations you don't want kept.
- **Sent to services.** Your words and voice go to Deepgram and to the model provider. Mail and calendar content goes to the model provider when Juno reads it. Check their terms for anything sensitive.
- **Google.** Juno asks for the minimum scopes listed above. Disconnect at any time in Settings; you can also revoke access in your Google account.
- **Write conflicts.** Storage is last-write-wins. That's fine for a household, but two changes at the same instant can drop one.
- **Schedules.** Vercel Hobby runs schedules at most every 15 minutes. These run once a day.
- **Not a substitute for judgment.** Juno proposes, drafts, and asks. You decide.

## Repository name

The project is named **Juno** after the assistant. The GitHub repository is `juno`. If you fork it, rename the repo in its GitHub settings and update the `origin` remote.
