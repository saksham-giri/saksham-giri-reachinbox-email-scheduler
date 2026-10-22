# ReachInbox Email Scheduler

A production-grade email scheduler with a dashboard. Express + BullMQ + Redis + PostgreSQL on the backend, React + Tailwind on the frontend, all in TypeScript. Emails are scheduled as BullMQ delayed jobs (no cron), sent through Ethereal (fake SMTP) from several senders, made searchable with Elasticsearch, and a Slack message is posted the moment an hourly sending limit is hit.

- **Live app:** https://reachinbox-saksham.duckdns.org (sign in with Google)
- **Demo video:** https://drive.google.com/file/d/1-98ZfcOqxpdcuTnIJpCc10dfSIyOZVH-/view?usp=sharing
- **Queue dashboard (Bull Board):** https://reachinbox-saksham.duckdns.org/admin/queues (credentials shared on request)

```
reachinbox-scheduler/
├── docker-compose.yml          local Postgres 16, Redis 7 (AOF on), Elasticsearch 8
├── docker-compose.prod.yml     the whole stack on one server, behind Caddy (HTTPS)
├── .env.production.example     production settings template
├── samples/leads.csv           12-address lead list for the compose screen
├── backend/                    Express API + BullMQ worker (TypeScript)
│   ├── Dockerfile              one image for both the API and the worker
│   ├── prisma/                 schema + migrations
│   └── src/
│       ├── server.ts           API entry point (also mounts Bull Board)
│       ├── worker.ts           BullMQ worker entry point
│       ├── config/env.ts       zod-validated configuration
│       ├── queue/              queue definition, Bull Board
│       ├── workers/            job processor: claim → hourly limit → send slot → send
│       ├── services/           scheduler, rate limiter, mailer, senders, slack, search
│       ├── routes/             auth, campaigns, emails, slack, health/config
│       ├── middleware/         session auth, error handler
│       └── scripts/            Elasticsearch reindex, 1000-email load test
└── frontend/                   React 18 + Vite + Tailwind
    ├── Dockerfile, Caddyfile   production build served by Caddy
    └── src/
        ├── api/                typed fetch client, endpoints, response types
        ├── components/ui/      Button, Field (Input/FormRow), Modal, Avatar, EmptyState, Pagination, Spinner
        ├── components/         layout (Sidebar, UserMenu, PageHeader), emails (list, chips, body), compose (recipients, editor, send later)
        ├── context/            AuthContext
        ├── hooks/              useQuery (fetch + polling), usePopover, useDebounce
        └── pages/              Login, Dashboard, EmailDetail, Compose
```

## 1. Running locally

### Prerequisites

- Node.js 20+ (tested with Node 24)
- Docker (for Postgres, Redis and Elasticsearch)

### Infrastructure

```bash
docker compose up -d
```

Redis runs with `appendonly yes`, so delayed jobs survive a Redis restart, and with `maxmemory-policy noeviction`, which BullMQ requires.

The containers use **non-default host ports**: Postgres `5433`, Redis `6380`, Elasticsearch `9200`. Many dev machines already run Postgres or Redis on the default ports (including inside WSL, which silently forwards them to `127.0.0.1` on Windows), and the app would then talk to the wrong server without any error. The URLs in `.env.example` use `127.0.0.1` and these ports.

### Backend (API and worker)

```bash
cd backend
cp .env.example .env          # fill in the values (section 2)
npm install
npx prisma migrate deploy     # creates the tables
npm run dev                   # starts the API (:4000) and the worker together
```

The API and the worker are separate processes. To run them separately, which is how they are deployed:

```bash
npm run dev:api
npm run dev:worker            # start as many workers as you like
```

Production build: `npm run build`, then `npm run start:api` and `npm run start:worker`.

- API: http://localhost:4000/api (health check: `/api/health`)
- **Bull Board (live queue dashboard): http://localhost:4000/admin/queues**, also at http://localhost:5173/admin/queues

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` and `/admin` to the backend, so the session cookie is first-party and no CORS setup is needed.

## 2. Configuration

Everything is read from `backend/.env` and validated with zod at boot (`src/config/env.ts`); the API refuses to start with a missing or invalid value. Nothing is hard-coded.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT`, `BACKEND_URL`, `FRONTEND_URL` | `4000`, `http://localhost:4000`, `http://localhost:5173` | Where the API and the frontend live (OAuth redirects use these) |
| `JWT_SECRET` | required | Signs session cookies and OAuth `state`; any long random string |
| `DATABASE_URL` | required | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6380` | Redis for BullMQ, counters and locks |
| `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX` | `http://127.0.0.1:9200`, `emails` | Search |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | required for login | Google OAuth client |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` | optional | Slack OAuth app; Connect Slack is disabled without them |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_SEND_INTERVAL_MS` | `2000` | **Minimum gap between two sends, across all workers (2 seconds)** |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hourly cap per sender mailbox |
| `MAX_EMAILS_PER_HOUR` | `0` (off) | Optional global hourly cap across all senders |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Window length; set `60000` to watch window rollover in a demo |
| `JOB_ATTEMPTS` | `3` | SMTP attempts before an email is marked FAILED (exponential backoff from 10 s) |
| `ETHEREAL_SENDER_COUNT` / `ETHEREAL_SENDERS` | `3` / unset | Sender pool (below) |
| `BULL_BOARD_USER`, `BULL_BOARD_PASS` | unset | Basic auth for Bull Board; always set them when the API is public |

A campaign's own **Hourly limit** from the compose form applies on top of the sender and global caps.

### Ethereal Email

Nothing to set up. On first boot the API creates `ETHEREAL_SENDER_COUNT` (default 3) Ethereal mailboxes through Ethereal's account API and **stores them in the `Sender` table**, so the same mailboxes are reused after restarts. Campaigns rotate recipients across all senders, or use the one picked in the From dropdown.

To use your own accounts from https://ethereal.email/create instead:

```
ETHEREAL_SENDERS=[{"name":"Alice","user":"alice.x@ethereal.email","pass":"..."}]
```

Every sent email stores its Ethereal preview URL: open a sent email, click "to …" to expand its details, and follow **Open delivered message**.

### Google OAuth (login)

1. Google Cloud Console → Google Auth Platform → **Clients** → create an OAuth client (Web application).
2. Authorized JavaScript origin `http://localhost:5173`; authorized redirect URI `http://localhost:4000/api/auth/google/callback`.
3. Put the values in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. While the app is in Testing mode, only accounts listed under **Audience → Test users** can sign in. Publish the app to open it to everyone; the `openid email profile` scopes need no Google review.

Flow: `/api/auth/google` → Google consent (with a CSRF `state` cookie) → the callback exchanges the code server-side, fetches the OpenID profile, upserts the user, sets an httpOnly JWT session cookie and redirects to `/dashboard`.

### Slack OAuth (rate-limit notifications)

1. https://api.slack.com/apps → **Create New App** → From scratch.
2. **OAuth & Permissions** → bot scope `incoming-webhook`. **Features → Incoming Webhooks** → On.
3. Slack accepts only **HTTPS** redirect URLs. Locally, expose the API through a tunnel (`ngrok http --url=<your-static-ngrok-domain> 4000`) and add `https://<that-domain>/api/slack/callback` as a redirect URL. In production, use `https://<your-domain>/api/slack/callback`; no tunnel is needed.
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI`.
5. To let other workspaces connect, **Manage Distribution → Activate Public Distribution**.

In the app, open the user card in the sidebar → **Connect Slack** → choose a channel → you're redirected back and a confirmation message is posted. The same menu then shows **Slack: #channel**, with **Send test message** and **Disconnect**.

## 3. Deployment (one server, Docker)

The live app runs this way on an Azure B2s VM (Ubuntu 24.04, 2 vCPU, 4 GB RAM) with a DuckDNS domain.

`docker-compose.prod.yml` runs the whole stack on one server: Postgres, Redis (AOF), Elasticsearch, the API, the worker, and **Caddy**. Caddy serves the built frontend, forwards `/api` and `/admin` to the API on the same domain, and obtains a Let's Encrypt certificate automatically. Only ports 80 and 443 are exposed; the databases are reachable only inside Docker. Start-up is ordered by health checks: Postgres and Elasticsearch first, then the API (which applies migrations), then the worker.

Requirements: about **4 GB RAM** (Elasticsearch alone takes about 1 GB), Docker, a domain whose DNS A record points at the server, and outbound port 587 open (Ethereal SMTP).

```bash
git clone <this repo> && cd <repo>
cp .env.production.example .env.production   # DOMAIN, secrets, OAuth keys, limits
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Then add `https://<DOMAIN>/api/auth/google/callback` (and the origin `https://<DOMAIN>`) to the Google client, and `https://<DOMAIN>/api/slack/callback` to the Slack app. To update after a `git pull`, run the same `up -d --build`; data and delayed jobs live in Docker volumes and survive rebuilds and reboots.

## 4. Architecture

```
 React dashboard ──HTTPS──► Express API ──► Postgres (source of truth)
                               │  └──────► Elasticsearch (search index)
                               ▼
                         BullMQ queue "email-send" in Redis (delayed jobs)
                               │
                               ▼
     Worker(s): claim row → hourly limits (Redis) → send slot (Redis) → SMTP (Ethereal)
                               │                         └──► Slack webhook when a limit is hit
                               ▼
                          Postgres + Elasticsearch status update
```

The API never sends email and the worker never serves HTTP. They meet only through Redis and Postgres, so either can restart, or run as several copies, without losing anything.

### How scheduling works

1. `POST /api/campaigns` validates the input, normalizes and de-duplicates recipients, sanitizes the HTML body, and creates one `Campaign` plus one `Email` row per recipient with status `SCHEDULED` and `scheduledAt = startAt + i × max(delay, 1 ms)`.
2. One **BullMQ delayed job** is enqueued per email (`delay = scheduledAt − now`), in bulk (`addBulk`, chunks of 500).
3. **The job id is the email id.** BullMQ ignores an add whose job id already exists, so an email can never get a second job.
4. When the delay expires, BullMQ promotes the job and a worker processes it. No cron, polling loop or per-email timer is involved.

The 1 ms minimum spacing matters: BullMQ orders jobs with equal run times by job id, which here is a random UUID, so a campaign with no delay would otherwise be released in random order.

### How persistence on restart is handled

- **Jobs live in Redis, not in process memory.** Delayed jobs wait in Redis while the API or worker is down. When the worker returns, overdue jobs run immediately (once each) and future ones run on time. Nothing restarts from scratch.
- **Redis uses AOF** (`appendonly yes`), so even a Redis restart keeps the delayed set.
- **Crash mid-job:** BullMQ's stalled-job detection (`lockDuration` 60 s) hands the active job to another worker.
- **Boot reconciliation** (`reconcilePendingEmails`): on start, the worker checks every pending row in Postgres and re-enqueues, in schedule order, any email that has no job. This covers a crash between the database insert and the enqueue, or a Redis that lost its data. Emails that still have a job are untouched.
- **Graceful shutdown:** on SIGINT/SIGTERM the worker waits for in-flight sends (`worker.close()`) before exiting.

### Idempotency: an email is never sent twice

1. Job id = email id: at most one job per email.
2. Before sending, the worker **claims** the row with a conditional update:
   `UPDATE … SET status='PROCESSING' WHERE id=? AND (status IN ('SCHEDULED','DELAYED') OR (status='PROCESSING' AND lockedAt < now − 2 min))`.
   Only one worker can win; an email that is already SENT or FAILED is never claimed again, so a duplicate delivery of a job is a no-op.
3. If the row is PROCESSING with a fresh lock, the job is moved back to delayed until the lock would be stale. It is never dropped.
4. The SMTP `Message-ID` is derived from the email id (`<emailId@reachinbox-scheduler.local>`), so even in the rare crash-after-SMTP-before-database-write case, receiving servers can de-duplicate.

### How rate limiting and concurrency work

**Concurrency.** `WORKER_CONCURRENCY` jobs run in parallel per worker process, and any number of worker processes can run. Parallel safety comes from the database claim (above) and atomic Redis operations (below); no rule relies on in-memory state.

**Minimum delay between sends: 2 seconds (`MIN_SEND_INTERVAL_MS=2000`), global across all workers.** Each send claims the next free **send slot** in Redis through an atomic Lua script: `slot = max(now, lastSlot + 2 s)`. The worker waits for its slot, then sends. If the next free slot is more than `max(10 s, interval × concurrency)` away (many workers competing), the job returns its hourly quota and is moved to delayed until then. The compose form's "delay between emails" is applied on top, as staggered `scheduledAt` times.

*Why not BullMQ's built-in `limiter`?* It was the first version. The load test showed that the limiter charges **every job start**, including jobs that are only being rescheduled because they hit an hourly limit: rescheduling a 1000-email backlog crawled at one per interval and blocked on-time emails for minutes. The send slot paces only emails that actually go out; the same backlog is rescheduled in about 5 seconds.

**Hourly limits: Redis counters, checked and incremented atomically.**

- Counters are keyed by window: `rl:sender:<senderId>:<window>`, `rl:campaign:<campaignId>:<window>`, and optionally `rl:global:<window>`, where `window = floor(now / RATE_LIMIT_WINDOW_MS)`. Keys expire after two windows.
- One **Lua script** checks every applicable counter and, only if all are under their limits, increments all of them. Redis runs a script atomically, so two workers can never both take the last slot.
- If the SMTP send fails, the counters are decremented: a send that didn't happen doesn't use up quota.

**When a limit is reached, nothing is dropped or failed:**

1. The job calls `job.moveToDelayed(runAt)` and throws BullMQ's `DelayedError`: it goes back to the delayed set without spending a retry attempt. The row becomes `DELAYED` ("Rate limited" in the UI) with its new `scheduledAt`, and its `deferrals` count goes up.
2. `runAt` comes from a **reservation**: a second Lua script finds the first future window with fewer than `limit` reservations for the limit that blocked the email, and takes the next position in it. Positions are spread evenly across the window.
   - **Order is preserved:** reservations are handed out in processing order, which follows the schedule. Measured: 990 of 1000 emails land in their fair window.
   - **No thundering herd:** a 1000-email backlog on a sender limited to 50/hour is placed across the next 20 windows in one pass, rather than 950 jobs waking every hour to send 50 and be pushed back again.
3. **Slack** is notified the moment a counter *reaches* its limit, and when a job is first blocked, de-duplicated per (user, limit, window) with a Redis `SET NX`, so many workers produce one message.

### Behavior with 1000+ emails scheduled at the same time

- **Scheduling:** rows are inserted with `createMany` (chunks of 1000) and jobs enqueued with `addBulk` (chunks of 500): about 0.2 s for 1000 emails. Search indexing runs after the response and never blocks it.
- **Sending:** when they fall due, emails over an hourly limit are rescheduled immediately without taking a send slot; the rest go out one every 2 seconds across all workers (at most about 1800 per hour).
- **Limits:** with 3 senders at 50/hour and a campaign limit of 100, the first 100 send in the first hour; every other email is reserved into a later hour, so the campaign drains at 100/hour in its original order. Bull Board shows them in Delayed with their new times.
- `npm run load-test -- 1000 100` schedules 1000 emails 10 seconds from now (for the first user in the database) to watch this happen.

### Slack connect and disconnect

- The integration (webhook URL, channel, team, token) is stored per user in `SlackIntegration`.
- The worker reads it from the database **on every notification**, with no cache, so connecting or disconnecting takes effect immediately, with no restart or redeploy.
- Not connected: the notification is skipped silently; rate limiting behaves exactly the same, and nothing crashes.
- Webhook revoked (Slack answers 403/404/410): the stale integration is deleted, so the UI shows **Connect Slack** again. Disconnect also calls Slack's `auth.revoke`.

### Search (Elasticsearch)

- Every email is indexed (recipient, subject, plain-text body, status, dates, sender) on creation and on every status change.
- `GET /api/emails?type=scheduled|sent&q=…` runs a `multi_match` (`bool_prefix`, so partial words match) filtered by user and status. The dashboard search box uses it and shows "via Elasticsearch" when results come from it.
- Postgres stays the source of truth: if Elasticsearch is down, indexing failures are logged and search falls back to a Postgres `ILIKE` query. `npm run es:reindex` rebuilds the index.

## 5. API reference

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth/google` → `/api/auth/google/callback` | Google OAuth login |
| GET | `/api/auth/me` | Current user + Slack status |
| POST | `/api/auth/logout` | Clear the session |
| POST | `/api/campaigns` | Schedule emails `{subject, body (HTML), recipients[], startAt, delayBetweenSeconds, hourlyLimit?, senderId?}` |
| GET | `/api/campaigns` | Recent campaigns |
| GET | `/api/emails?type=scheduled\|sent&q=&status=&page=&pageSize=` | List, search, filter emails |
| GET | `/api/emails/stats` | Counts per tab and per status |
| GET | `/api/emails/:id` | One email |
| PATCH | `/api/emails/:id` | Star / unstar `{starred}` |
| DELETE | `/api/emails/:id` | Delete; for a pending email this cancels the send (409 if it is being sent right now) |
| GET | `/api/slack/connect` → `/api/slack/callback` | Slack OAuth |
| POST | `/api/slack/test` | Send a test Slack message |
| DELETE | `/api/slack` | Disconnect Slack |
| GET | `/api/config` | Senders and effective limits |
| GET | `/api/health` | Postgres / Redis / Elasticsearch status |
| GET | `/admin/queues` | Bull Board (basic auth when `BULL_BOARD_USER` / `BULL_BOARD_PASS` are set) |

Example, with the session cookie from a logged-in browser:

```bash
curl -X POST http://localhost:4000/api/campaigns \
  -H 'Content-Type: application/json' -b 'session=<cookie>' \
  -d '{"subject":"Hi","body":"<p>Hello there</p>","recipients":["a@example.com","b@example.com"],
       "startAt":"2026-10-24T10:00:00Z","delayBetweenSeconds":5,"hourlyLimit":50}'
```

## 6. Features implemented

### Backend

| Requirement | Implementation |
| --- | --- |
| Accept scheduling requests via API | `POST /api/campaigns`, zod-validated; recipients de-duplicated, invalid ones reported |
| Relational storage | PostgreSQL via Prisma (`User`, `Campaign`, `Email`, `Sender`, `SlackIntegration`) |
| Scheduler without cron | BullMQ delayed jobs, one per email, `jobId = emailId` |
| Multiple senders via Ethereal | 3 Ethereal mailboxes stored in the database, round-robin per campaign or one chosen sender |
| Persistence across restarts | Jobs in Redis (AOF), stalled-job recovery, boot reconciliation from Postgres |
| No duplicates (idempotency) | Unique job id + conditional database claim + deterministic Message-ID |
| Configurable concurrency | `WORKER_CONCURRENCY`, any number of worker processes |
| Minimum delay between sends | Redis send slot (atomic Lua), global across workers: 2 s (`MIN_SEND_INTERVAL_MS`) |
| Hourly rate limit, safe across workers | Atomic Lua over Redis counters keyed by window + sender (+ campaign, + optional global) |
| Limit reached | Rescheduled into the next window with room, in order, never failed or dropped |
| Searchable with Elasticsearch | Indexed on creation and status change; `multi_match` search with a Postgres fallback |
| Live BullMQ dashboard | Bull Board at `/admin/queues` |
| Slack on rate-limit hit | Real OAuth v2 (`incoming-webhook`), per-user storage, live webhook post, connect/disconnect without redeploy, public distribution |
| Configuration | Every limit and secret from env, validated at boot |

### Frontend

The UI follows the Figma screens: login card, inbox with sidebar, email detail, and compose with the Send Later popover.

| Requirement | Implementation |
| --- | --- |
| Real Google login, redirect to dashboard | OAuth through the backend; lands on `/dashboard` |
| User's name, email, avatar + Logout | Sidebar user card (where the Figma places it); its dropdown holds Slack and Logout |
| Scheduled and Sent sections | Sidebar "Core" nav with live counts (refreshed every 5 s) |
| Compose New Email | Compose button → From (one sender or all), To chips with typing/paste and **Upload List** (CSV/TXT, shows the number of addresses detected), Subject, Delay between 2 emails, Hourly Limit, rich-text body, clock → **Send Later** (start time: date picker + presets), Send / Send Later |
| Scheduled list: email, subject, scheduled time, status | `To:` recipient, subject + preview, orange time chip (scheduled), "Rate limited · time" chip, "Sending" chip; search, status filter, pagination |
| Sent list: email, subject, sent time, status | `To:` recipient, subject + preview, "Sent" / "Failed" chip, sent time |
| Loading, empty and error states | Skeleton rows, spinners, empty state per tab, error state with Try again, toasts, inline validation |
| Email detail (from the Figma) | Sender, recipient, delivery details (attempts, deferrals, error, Ethereal link), sandboxed HTML body, star, delete / cancel |
| Reusable components, typed API | `Button`/`IconButton`, `Input` (filled/line/box), `FormRow`, `Modal`, `Avatar`, `EmptyState`, `Pagination`, `PageHeader`, `StatusChip`, `StarButton`; typed responses in `api/types.ts`; hooks `useQuery`, `usePopover` |

## 7. Verified results

Run end to end against real Redis, Postgres, Elasticsearch and Ethereal SMTP. Test limits: `RATE_LIMIT_WINDOW_MS=60000`, `MAX_EMAILS_PER_HOUR_PER_SENDER=2`, `MIN_SEND_INTERVAL_MS=1000`, so hourly behavior shows within minutes.

| Scenario | Result |
| --- | --- |
| 9 emails, 3 senders, limit 2 per sender per window | 6 sent about 1 s apart; 3 moved to the next window and sent when it opened. Invalid and case-duplicate recipients skipped. |
| Kill API + worker, restart Redis, restart after emails were overdue | 6 of 6 delayed jobs survived the Redis restart (AOF); overdue emails sent once each right after restart. |
| Kill the worker 45 s before 2 future emails, restart at once | Both held and sent at their due times, not early. |
| Redis data lost (jobs gone, rows still pending) | Reconciliation re-enqueued the 6 missing jobs; each sent once. |
| Duplicate jobs for an already-sent email | Same job id: ignored. New job ids: both skipped as "already SENT"; `attempts` stayed 1. |
| 1000 emails at the same moment, 2 worker processes | Scheduled in about 215 ms; 6 sent, 994 rescheduled in 5.5 s, exactly 6 per future window; sends about 1 s apart across both workers. |
| Order of that backlog | 990 of 1000 in their fair window, the other 10 one window off (parallel-job jitter). |
| Fresh clone, production build, both workers hard-killed mid-backlog | Clean install, migration on an empty database; after restart every pending email still had its job (988 = 988), nothing sent twice, the per-sender cap held in every window. |
| Production deployment | Scheduled over public HTTPS and sent through Ethereal from the server; Google login and Slack connect work on the live domain. |
| Totals across all runs | Every email sent exactly once (`attempts = 1` on every row), 0 errors. |

## 8. Demo video

Link: _add link here_. What it shows, in order:

1. Google login; name, email and avatar in the sidebar card. **Connect Slack** through Slack's real OAuth page (disconnect and reconnect from the same menu).
2. Compose → **Upload List** with `samples/leads.csv` (12 addresses detected) → subject, body, delay 5 s → Send Later 2 minutes ahead. The Scheduled list and Bull Board → Delayed show the 12 jobs.
3. **Restart scenario:** stop the API and worker before the send time, start them again, and the scheduled (future) emails still go out at their time, once each. Emails that fall due while the server is down go out immediately on restart.
4. **Rate limit** (with `RATE_LIMIT_WINDOW_MS=60000`, `MAX_EMAILS_PER_HOUR_PER_SENDER=2`): 6 emails send, the other 6 show "Rate limited" with their new time, and a **live Slack message** arrives the moment a sender hits its limit. The held emails go out in the following windows.
5. Sent list → an email's detail → the delivered message in Ethereal; search by part of an address (Elasticsearch).
6. The verified results above for the 1000-email case.

## 9. Assumptions, shortcuts and trade-offs

- **Fixed windows, not sliding ones.** Hourly windows are clock-aligned (`floor(now / 3600000)`): simple, cheap and exact under concurrency, but up to 2 × limit can go out within a rolling 60 minutes that spans a boundary. A sliding-window log (Redis sorted set) would remove this at the cost of memory per sender.
- **One global send interval.** The 2-second spacing is shared by all senders, the simplest safe reading of "minimum delay between sends". Per-sender spacing would use one slot key per sender.
- **Waiting for a send slot holds a worker slot.** A job sleeps up to about 10 s for its slot; jobs further out are moved back to delayed instead. Simple, at the cost of some idle concurrency when many workers compete.
- **Delivery jitter of 1–3 s.** Scheduled times are when a job starts; the SMTP round trip to Ethereal adds a second or two before "sent" is recorded.
- **Reservations are best-effort.** A reserved window can still fill up if new campaigns are scheduled into it; the job is then simply rescheduled again.
- **At-least-once at the SMTP boundary.** If a worker dies after the SMTP server accepted a message but before the database write, the email is retried after the 2-minute stale lock. SMTP has no transactions; the deterministic Message-ID lets receivers drop the copy.
- **Lua key names** in the reservation script are built dynamically: fine on a single Redis or primary/replica, but Redis Cluster would need hash tags.
- **Rich-text body** is a small `contentEditable` editor using `document.execCommand` (deprecated but supported everywhere, and enough for the design's toolbar). The server strips scripts and event handlers and sends HTML plus a plain-text part; the UI renders bodies in a script-less sandboxed iframe. No per-lead personalization variables.
- **Sessions** are stateless JWTs in an httpOnly cookie (7 days); logout clears the cookie, but tokens can't be revoked server-side before they expire.
- **Deployment** is a single VM: simple and close to the local setup, but no high availability. Bull Board is password-protected in production.
- **Figma deviations:**
  - The brief mentions a top header for user info; the Figma places it in the sidebar card, so the design was followed. Logout and Slack live in that card's dropdown.
  - The email/password form on the login screen is visual only (the brief requires Google OAuth) and tells the user to use Google.
  - The paperclip (attachments) and archive icons are not implemented; attachments would need file storage.
  - With no time picked, **Send** starts the campaign immediately; picking a time turns the button into **Send Later**.
