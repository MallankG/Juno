# Your Assistant: a personal AI that learns from you

A personal assistant built with [eve](https://eve.dev) for the eve Builder Challenge.
It reads your calendar and mail, tells you what matters today, proposes calendar events
for you to approve, and gets to know you over time: it remembers facts you share, learns
from what you accept and reject, and reviews each night to update its picture of you.
You can talk to it by voice in the browser.

## What it does

| Feature | How |
| --- | --- |
| Morning brief with a motivational quote | Scheduled run at 07:00 reads calendar, Gmail and Slack, writes the brief, and saves it |
| Calendar proposals | Suggests events from mail and Slack; creates one only after you approve that call |
| Long-term memory | [Supermemory](https://supermemory.ai): extracts facts from each exchange, recalls them next time, supports forget |
| Learning loop | Logs accepted, rejected and corrected suggestions; a nightly review corrects and forgets facts in Supermemory |
| "What do you know about me?" | Searches Supermemory and lists what it holds |
| Voice | Browser page in `voice/` using built-in speech recognition and speech synthesis |

## Architecture

```
agent/
  agent.ts                 model (Claude Haiku 5.5, cheapest good option)
  instructions.md          personality and rules (approval before writes, no secrets)
  memory/supermemory.ts    facts about the user (Supermemory provider)
  memory/learning.ts       local log: exchanges, feedback, briefs (JSON file)
  lib/learning-memory.ts   provider implementation for the local log
  lib/scope.ts             who owns memory; scheduled runs map to the owner
  tools/                   Google Calendar (read + create with approval), Gmail (read), Slack (read)
  schedules/               morning-brief (07:00) and nightly-consolidation (02:30)
  channels/eve.ts          HTTP API with CORS, used by the voice page
voice/index.html           voice and text client (no build step)
```

Key design points:

- **Approval before writes.** `create_calendar_event` uses `approval: always()`, so eve pauses and asks you every time.
- **Read-only mail and Slack.** The agent never sends or deletes messages.
- **Learning without fine-tuning.** Nothing is retrained. Memory is updated: Supermemory holds facts, and the nightly review rewrites them from your feedback and corrections.
- **Cost control.** Recall is done by Supermemory (no profile injected every turn), the cheapest Claude model is the default, and the learning log is a local file.

## Run it locally (free apart from model usage)

Requirements: Node.js 24 or newer.

```bash
npm install
cp .env.example .env        # fill in the keys you have; see below
npx eve dev                 # starts the agent on http://localhost:2000
```

In another terminal, serve the voice page:

```bash
npx --yes serve voice -l 8080   # or: python3 -m http.server 8080 --directory voice
```

Open http://localhost:8080. Press **Talk** (Chrome, Edge or Safari) or type. Set the agent URL under
*Connection settings* if it is not `http://localhost:2000`.

To run the morning brief now, without waiting for 07:00:

```bash
curl -X POST "http://localhost:2000/eve/v1/dev/schedules/morning-brief"
```

## Connect the services (all free)

**Model.** Use an AI Gateway key (`AI_GATEWAY_API_KEY`) or switch `agent/agent.ts` to the
eve Anthropic helper and set `ANTHROPIC_API_KEY`. Haiku 5.5 keeps usage cheap for a personal assistant.

**Supermemory.** Create a free account at https://console.supermemory.ai/keys and set
`SUPERMEMORY_API_KEY`. The free plan includes $5 of credits each month, which covers many
days of personal use.

**Connect Google (Calendar and Gmail).**
1. In Google Cloud Console, create a project, enable the Google Calendar API and Gmail API, and create an OAuth client (type: Desktop app).
2. Add these scopes: `calendar.readonly`, `calendar.events`, `gmail.readonly`.
3. Run an OAuth consent flow once (for example with the [OAuth Playground](https://developers.google.com/oauthplayground), using your own client ID and secret) to get a refresh token.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`.

Google Cloud is free for these APIs at personal scale. While the OAuth app is in *Testing*, add yourself as a test user.

**Slack (optional).** Create a free Slack app with a bot token, scopes `channels:history` and `channels:read`,
invite the bot to the channels you want, and set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_IDS` (comma-separated IDs).

Anything you leave unset is reported as "not connected" and skipped, so the agent still runs.

## Deploy on Vercel (free Hobby plan)

1. Push this repo to GitHub and import it in Vercel. Install the Vercel CLI if you prefer: `npx vercel`.
2. In the Vercel dashboard, open **Storage → Create → Blob**, choose a **private** store, and connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`.
3. Add the other keys from `.env.example` under **Settings → Environment Variables** (model key, `SUPERMEMORY_API_KEY`, Google, Slack).
4. Deploy with `npx eve deploy` (or push to the connected branch).
5. The schedules run on Vercel Schedules. Hobby plans allow them at most every 15 minutes; these two run once a day.

Vercel's default auth protects the API. To use the voice page against a deployment, add your own auth in `agent/channels/eve.ts` first, then point the page's *Connection settings* at the deployed URL.

## Free-tier and cost notes

| Piece | Cost |
| --- | --- |
| eve, Node.js, this repo | Free (open source) |
| Google Calendar, Gmail APIs | Free at personal scale |
| Slack bot | Free |
| Supermemory | Free plan: $5 of credits a month |
| Voice (speech recognition and synthesis) | Free, built into the browser |
| Model (Claude Haiku 5.5) | Pay per token; a typical day is a few cents. Check your provider's current pricing |
| Hosting | Local: free. Vercel Hobby is free for personal use, with schedules limited to once per 15 minutes |
| Storage | Vercel Blob has a free tier; one small JSON file per user is far below it |

## Limits and honest notes

- **Storage.** The learning log is a JSON file under `.eve-data/` locally, and a private Vercel Blob store when deployed (see *Deploy* below). Writes are last-write-wins, which is fine for one person's assistant.
- **Model cost.** Every chat turn and scheduled run calls the model. Keep schedules to one or two a day.
- **Shared HTTP auth.** The default auth allows local development requests only. Add your own auth in `agent/channels/eve.ts` before exposing the agent to others.
- **Memory is sensitive.** Supermemory stores extracted facts about you. Review its data settings and use the forget tool for anything you do not want kept.
- **Not a substitute for judgment.** The agent proposes; you decide. It does not send mail or change anything without your approval.
