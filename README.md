# ReachInbox Email Scheduler

A production-style email scheduler with a dashboard. Express + BullMQ + Redis + PostgreSQL on the backend, React + Tailwind on the frontend. Emails are sent through Ethereal (fake SMTP), indexed in Elasticsearch for search, and Slack is notified when an hourly sending limit is hit.

```
reachinbox-scheduler/
├── docker-compose.yml        Postgres 16, Redis 7 (AOF on), Elasticsearch 8
├── samples/leads.csv         sample lead list for the compose screen
├── backend/                  Express API + BullMQ worker (TypeScript)
│   ├── prisma/               schema + migrations
│   └── src/
│       ├── server.ts         API entry point (also mounts Bull Board)
│       ├── worker.ts         BullMQ worker entry point
│       ├── config/env.ts     zod-validated configuration
│       ├── queue/            queue definition, Bull Board
│       ├── workers/          job processor (claim -> rate limit -> send)
│       ├── services/         scheduler, rate limiter, mailer, senders, slack, search
│       ├── routes/           auth, campaigns, emails, slack, health/config
│       ├── middleware/       session auth, error handler
│       └── scripts/          ES reindex, 1000-email load test
└── frontend/                 React 18 + Vite + Tailwind
    └── src/
        ├── api/              typed fetch client, endpoints, response types
        ├── components/ui/    Button, Field (Input/FormRow), Modal, Avatar, EmptyState, ...
        ├── components/       layout (Sidebar/UserMenu/PageHeader), emails (list, chips, body), compose (recipients, editor, send later)
        ├── context/          AuthContext
        ├── hooks/            useQuery (fetch + polling), usePopover, useDebounce
        └── pages/            Login, Dashboard, EmailDetail, Compose
```

## 1. Running locally

### Prerequisites

- Node.js 20+ (tested with Node 24)
- Docker (for Postgres, Redis and Elasticsearch), or your own instances of each

### Infrastructure

```bash
docker compose up -d
```

Redis runs with `appendonly yes` so delayed jobs survive a Redis restart, and with `maxmemory-policy noeviction` (BullMQ requires it).

The containers are published on **non-default host ports**: Postgres on `5433`, Redis on `6380`, Elasticsearch on `9200`. Many dev machines already run Postgres or Redis on the default ports, including inside WSL, where they are silently forwarded to `127.0.0.1` on Windows. The app would then talk to the wrong server without any error. The URLs in `.env.example` use `127.0.0.1` and these ports.

### Backend

```bash
cd backend
cp .env.example .env          # then fill in the values (see section 2)
npm install
npx prisma migrate deploy     # creates the tables
npm run dev                   # starts API (:4000) and worker together
```

You can also run them as separate processes, which is how you would deploy them:

```bash
npm run dev:api
npm run dev:worker            # start as many of these as you like
```

Production build: `npm run build && npm run start:api` / `npm run start:worker`.

- API: http://localhost:4000/api
- Health check: http://localhost:4000/api/health
- **Bull Board (live queue dashboard): http://localhost:4000/admin/queues**, also proxied at http://localhost:5173/admin/queues

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` and `/admin` to the backend, so the session cookie is first-party and no CORS setup is needed in development.

### Production (one server, Docker)

`docker-compose.prod.yml` runs the whole stack on a single Linux server: Postgres, Redis (AOF), Elasticsearch, the API, the worker, and **Caddy**. Caddy serves the built frontend, forwards `/api` and `/admin` to the API on the same domain, and gets a Let's Encrypt HTTPS certificate automatically. Only ports 80 and 443 are exposed; the databases are reachable only inside Docker. The API applies database migrations on start, and the worker waits for it.

Requirements: a server with **4 GB RAM** (Elasticsearch alone takes about 1 GB), Docker installed, a domain whose DNS A record points at the server, and outbound port 587 open (Ethereal SMTP).

```bash
git clone <this repo> && cd <repo>
cp .env.production.example .env.production   # fill in DOMAIN, secrets, OAuth keys
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Then, in the OAuth consoles:

- **Google:** add `https://<DOMAIN>/api/auth/google/callback` as a redirect URI and `https://<DOMAIN>` as a JavaScript origin. Publish the app (Audience → Publish) so anyone can sign in, not just listed test users. The `openid email profile` scopes need no Google review.
- **Slack:** add `https://<DOMAIN>/api/slack/callback` as a redirect URL. To let other workspaces connect, enable Manage Distribution → Activate Public Distribution. No ngrok is needed in production.

Update after a `git pull` with the same `up -d --build` command. Delayed jobs and data live in Docker volumes and survive rebuilds and reboots.

## 2. Configuration

Everything is read from `backend/.env` and validated with zod at boot (`src/config/env.ts`). Nothing below is hard-coded.

### Ethereal Email

You don't need to set anything. On first boot the API calls `nodemailer.createTestAccount()` `ETHEREAL_SENDER_COUNT` times (default 3) and **stores the accounts in the `Sender` table**, so the same mailboxes are reused after restarts. Recipients in a campaign are assigned to senders round-robin.

To use your own Ethereal accounts (https://ethereal.email/create), set:

```
ETHEREAL_SENDERS=[{"name":"Alice","user":"alice.x@ethereal.email","pass":"..."}]
```

Every sent email stores its Ethereal preview URL. Open a sent email, click "to …" to expand the details, and follow **Open delivered message** to see it in Ethereal.

### Google OAuth (login)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
3. Put the values in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Flow: `/api/auth/google` → Google consent (with a CSRF `state` cookie) → callback exchanges the code, fetches the OpenID profile, upserts the user, sets an httpOnly JWT session cookie and redirects to `/dashboard`.

### Slack OAuth (rate-limit notifications)

1. https://api.slack.com/apps → **Create New App** → From scratch.
2. **OAuth & Permissions** → add the bot scope `incoming-webhook`.
3. Slack only accepts **HTTPS** redirect URLs, so expose the backend through a tunnel, e.g. `ngrok http 4000`, and add `https://<tunnel-host>/api/slack/callback` as the redirect URL.
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI=https://<tunnel-host>/api/slack/callback`.

Open the user card in the sidebar and click **Connect Slack**, choose a channel, and you get redirected back. A confirmation message is posted right away. The same menu then shows **Slack: #channel**, where you can **send a test message** or **disconnect**.

### Throughput and limits

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_SEND_INTERVAL_MS` | `2000` | Minimum gap between two sends, across all workers |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hourly cap per sender mailbox |
| `MAX_EMAILS_PER_HOUR` | `0` (off) | Optional global hourly cap across all senders |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Window length; lower it (e.g. `60000`) to demo window rollover |
| `JOB_ATTEMPTS` | `3` | SMTP attempts before an email is marked FAILED (exponential backoff from 10s) |

The campaign's own **Hourly limit** (set in the compose form) applies on top of these.

## 3. Architecture

```
 React dashboard ──HTTP──► Express API ──► Postgres (source of truth)
                               │  └──────► Elasticsearch (search index)
                               ▼
                         BullMQ queue "email-send" in Redis (delayed jobs)
                               │
                               ▼
               Worker(s): claim → hourly limit (Redis) → SMTP (Ethereal)
                               │                 └──► Slack webhook when a limit is hit
                               ▼
                          Postgres + ES status update
```

### How scheduling works

1. `POST /api/campaigns` validates the input, normalizes and de-duplicates recipients, and creates one `Campaign` plus one `Email` row per recipient with `scheduledAt = startAt + i × delayBetween` and `status = SCHEDULED`.
2. One **BullMQ delayed job** is enqueued per email (`delay = scheduledAt − now`), using `queue.addBulk` in chunks of 500.
3. **The job id is the email id.** BullMQ ignores an add with an existing job id, so the same email can never get two jobs.
4. When the delay expires BullMQ promotes the job and a worker processes it. No cron, polling loop or timer is involved.

### How persistence on restart is handled

- **Jobs live in Redis**, not in process memory. Delayed jobs simply wait in Redis while the API or worker is down. When the worker comes back, jobs whose time has passed run immediately and future ones run on time. Nothing is recreated from scratch.
- **Redis uses AOF** (`appendonly yes`), so even a Redis restart keeps the delayed set.
- **Crash mid-job:** BullMQ's stalled-job detection (`lockDuration` 60s) hands the active job to another worker.
- **Boot reconciliation** (`reconcilePendingEmails`): on startup the worker checks every SCHEDULED/DELAYED/PROCESSING row in Postgres and re-enqueues any email without a job. This covers a crash between the DB insert and the enqueue, or a Redis that lost its data. Because the job id is the email id, emails that already have a job are untouched.
- **Graceful shutdown:** on SIGINT/SIGTERM the worker waits for in-flight sends (`worker.close()`) before exiting.

### Idempotency: an email is sent at most once

1. Job id = email id, so there is at most one job per email.
2. Before sending, the worker **claims** the row with a conditional update:
   `UPDATE … SET status='PROCESSING' WHERE id=? AND (status IN ('SCHEDULED','DELAYED') OR (status='PROCESSING' AND lockedAt < now-2min))`.
   Only one worker can win. An email that is already SENT or FAILED is never claimed again, so a duplicate delivery of the job is a no-op.
3. If the row is PROCESSING with a fresh lock (another worker is on it, or a crashed worker's lock has not expired), the job is moved back to delayed until the lock goes stale. It is never dropped.
4. The SMTP `Message-ID` is derived from the email id (`<emailId@reachinbox-scheduler.local>`), so even in the rare crash-after-SMTP-before-DB-commit case, receiving servers can de-duplicate.

### How rate limiting and concurrency work

**Concurrency.** `WORKER_CONCURRENCY` jobs run in parallel per worker process, and you can run any number of worker processes. Parallel safety comes from the DB claim (above) and atomic Redis counters (below). No step relies on in-memory state.

**Minimum delay between sends: 2 seconds (`MIN_SEND_INTERVAL_MS=2000`), global across all workers.** Each send claims the next free "send slot" in Redis through an atomic Lua script: `slot = max(now, lastSlot + 2s)`. The worker waits until its slot, then sends. If the next free slot is more than `max(10s, interval × concurrency)` away (many workers), the job is moved to delayed until then and its hourly quota is returned. The per-campaign "delay between emails" from the compose form is applied on top, as staggered `scheduledAt` times.

*Why not BullMQ's built-in `limiter`?* I started with it, but the load test showed the problem: the limiter charges **every job start**, including jobs that only get rescheduled because they hit an hourly limit. With a backlog of 1000 emails, rescheduling ran at 1 per interval and blocked on-time emails behind it for many minutes. With the send slot, only emails that actually go out are paced. The same backlog was rescheduled in about 5 seconds (see the verified results below).

**Hourly limits use Redis counters, enforced atomically.**

- Counters are keyed by window: `rl:sender:<senderId>:<windowIndex>`, `rl:campaign:<campaignId>:<windowIndex>` and optionally `rl:global:<windowIndex>`, where `windowIndex = floor(now / RATE_LIMIT_WINDOW_MS)`. Keys expire after 2 windows.
- A single **Lua script** checks every applicable counter and, only if all are below their limits, increments all of them. Check-and-increment is one atomic step in Redis, so two workers can never both take the last slot.
- If the SMTP send fails, the slot is given back (the counters are decremented).

**When a limit is reached, nothing is dropped or failed:**

1. The job is **not failed**. It calls `job.moveToDelayed(runAt)` and throws BullMQ's `DelayedError`, so it goes back to the delayed set without consuming a retry attempt. The row becomes `DELAYED` (shown as "Rate limited" in the UI) with the new `scheduledAt`, and its `deferrals` counter is incremented.
2. `runAt` comes from a **reservation**: a second Lua script finds the first future window that still has fewer than `limit` reservations for the limit that blocked the email, and takes the next position in it. Positions are spread evenly across the window (`windowStart + position × window/limit`).
   - **Order is preserved:** reservations are handed out in processing order, which follows the original schedule.
   - **No thundering herd:** a backlog of 1000 emails on a sender limited to 50/hour is spread over the next 20 windows in one pass. The alternative is all 950 waking at the next hour, 50 sending, and 900 being pushed back again every hour.
3. **Slack** is notified the moment a counter *reaches* its limit (the send that makes it `count == limit`), and again when a job is first blocked, de-duplicated per (user, limit, window) with a Redis `SET NX` so many workers produce one message.

### Behavior with 1000+ emails scheduled at the same time

- **Scheduling:** rows are inserted with `createMany` in chunks of 1000 and jobs with `addBulk` in chunks of 500. ES indexing runs after the response and never blocks it. `npm run load-test -- 1000 100` schedules 1000 emails 10 seconds from now for the first user.
- **Sending:** BullMQ promotes all due jobs. Jobs over an hourly limit are rescheduled immediately, without waiting for a send slot. The rest send one every 2 seconds (about 1800/hour maximum) across all workers, and `WORKER_CONCURRENCY` bounds parallel jobs per worker.
- **Limits:** with 3 senders at 50/hour each and a campaign limit of 100, the first 100 send in the first window. Each further job is blocked once and reserved into a later window, so the campaign drains at 100/hour in the original order. Bull Board shows them in the Delayed tab with their new timestamps.

### Slack connect/disconnect behavior

- The integration (webhook URL, channel, team, token) is stored per user in `SlackIntegration`.
- The worker reads it from the DB **on every notification** (no cache). Connecting or disconnecting therefore takes effect immediately, with no restart or redeploy.
- Not connected: the notifier returns silently. Rate limiting works exactly the same, and nothing crashes.
- Webhook revoked (Slack returns 403/404/410): the stale integration is deleted, so the UI shows **Connect Slack** again.
- Disconnect also calls Slack's `auth.revoke` on a best-effort basis.

### Search (Elasticsearch)

- Every email is indexed into the `emails` index (`toEmail`, `subject`, `body`, `status`, dates, sender). Re-indexing happens on creation and on every status change (sent, failed, deferred).
- `GET /api/emails?type=scheduled|sent&q=...` runs a `multi_match` (`bool_prefix`, so typing a partial word works) filtered by user and status. The dashboard search box uses it, and the UI shows "via Elasticsearch" when results come from ES.
- Postgres is the source of truth. If ES is down, indexing failures are logged and search falls back to a Postgres `ILIKE` query. `npm run es:reindex` rebuilds the index from the DB.

## 4. API reference

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth/google` → `/api/auth/google/callback` | Google OAuth login |
| GET | `/api/auth/me` | Current user + Slack status |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/campaigns` | Schedule emails `{subject, body (HTML), recipients[], startAt, delayBetweenSeconds, hourlyLimit?, senderId?}` |
| GET | `/api/campaigns` | Recent campaigns |
| GET | `/api/emails?type=scheduled\|sent&q=&status=&page=&pageSize=` | List / search / filter emails |
| GET | `/api/emails/stats` | Counts per tab and per status |
| GET | `/api/emails/:id` | One email |
| PATCH | `/api/emails/:id` | Star / unstar `{starred}` |
| DELETE | `/api/emails/:id` | Delete; for a pending email this cancels the send (409 if it is being sent right now) |
| GET | `/api/slack/connect` → `/api/slack/callback` | Slack OAuth |
| POST | `/api/slack/test` | Send a test Slack message |
| DELETE | `/api/slack` | Disconnect Slack |
| GET | `/api/config` | Senders and effective limits |
| GET | `/api/health` | DB / Redis / ES status |
| GET | `/admin/queues` | Bull Board (optional basic auth via `BULL_BOARD_USER` / `BULL_BOARD_PASS`) |

Example (with a session cookie from the browser):

```bash
curl -X POST http://localhost:4000/api/campaigns \
  -H 'Content-Type: application/json' -b 'session=<cookie>' \
  -d '{"subject":"Hi","body":"Hello there","recipients":["a@example.com","b@example.com"],
       "startAt":"2026-10-23T10:00:00Z","delayBetweenSeconds":5,"hourlyLimit":50}'
```

## 5. Features implemented

### Backend

| Requirement | Implementation |
| --- | --- |
| Accept scheduling requests | `POST /api/campaigns`, zod-validated, recipients de-duplicated |
| Relational storage | PostgreSQL via Prisma (`User`, `Campaign`, `Email`, `Sender`, `SlackIntegration`) |
| Scheduler without cron | BullMQ delayed jobs, one per email, `jobId = emailId` |
| Multiple senders | Ethereal accounts in the DB, round-robin per campaign |
| Persistence across restarts | Jobs in Redis (AOF), stalled-job recovery, boot reconciliation from Postgres |
| No duplicates | Unique job id + conditional DB claim + deterministic Message-ID |
| Configurable concurrency | `WORKER_CONCURRENCY`, horizontally scalable worker processes |
| Minimum delay between sends | Redis "send slot" (atomic Lua), global across workers, `MIN_SEND_INTERVAL_MS` (2s) |
| Hourly limits | Atomic Lua over Redis counters, per sender + per campaign + optional global |
| Limit reached | Reschedule into the next window with free capacity, order preserved, never failed |
| Elasticsearch search | Indexed on create and on status change, `multi_match` search with Postgres fallback |
| Live queue dashboard | Bull Board at `/admin/queues` |
| Slack on limit hit | Real OAuth v2 (`incoming-webhook`), per-user storage, live webhook post, connect/disconnect without redeploy |

### Frontend

| Requirement | Implementation |
| --- | --- |
The UI follows the Figma screens: login card, inbox with sidebar, email detail, and compose with the Send Later popover.

| Requirement | Implementation |
| --- | --- |
| Google login | Real OAuth through the backend; redirects to `/dashboard` |
| User info + logout | Sidebar user card (as in the design) with avatar, name and email; its dropdown holds Connect Slack / Slack settings and Logout |
| Scheduled / Sent | Sidebar "Core" nav with live counts (polling every 5s) |
| List | `To:` recipient, status chip (orange time chip for scheduled, amber for rate limited, grey "Sent", red "Failed"), subject + body preview, sent time, star. Search (Elasticsearch), status filter, refresh, pagination |
| Email detail | Subject header, star, delete (cancels a scheduled email), sender line, recipient with expandable delivery details (attempts, deferrals, errors, Ethereal link), sandboxed HTML body |
| Compose | From (one sender or rotate across all), To chips with typing/paste and **Upload List** (CSV/TXT, shows detected count, "+N" chip), Subject, Delay between 2 emails, Hourly Limit, rich-text body with toolbar, clock button opening **Send Later** (date picker + Tomorrow presets), Send / Send Later |
| UX | Skeleton loading rows, spinners, empty states, error state with retry, toasts, inline validation |
| Reusable components | `Button`/`IconButton`, `Input` (filled/line/box variants), `FormRow`, `Modal`, `Avatar`, `EmptyState`, `Pagination`, `PageHeader`, `StatusChip`, `StarButton`, `usePopover`, `useQuery` |

## Verified results

These were run end to end against the Docker stack, with real Ethereal SMTP. Test limits were `RATE_LIMIT_WINDOW_MS=60000`, `MAX_EMAILS_PER_HOUR_PER_SENDER=2` and `MIN_SEND_INTERVAL_MS=1000`, so behavior shows up within minutes.

| Scenario | Result |
| --- | --- |
| 9 emails, 3 senders, limit 2/sender/window | 6 sent about 1 s apart; 3 deferred to the next window start and sent right after it opened. Invalid and case-duplicate recipients were skipped. |
| Kill API + worker, restart the Redis container, restart after emails were overdue | 6/6 delayed jobs survived the Redis restart (AOF). Overdue emails were sent once each, immediately after restart. |
| Kill worker 45 s before 2 future emails, restart at once | Both held and sent at their due times, not early. |
| Redis data lost (jobs gone, rows still pending) | Boot reconciliation re-enqueued 6 missing jobs; each was sent once. |
| Duplicate jobs for an already-sent email (same and different job IDs) | Same ID: no-op. Different IDs: both skipped as "already SENT"; `attempts` stayed 1. |
| 1000 emails at the same moment, 2 worker processes | Scheduled in about 215 ms. 6 sent in the first window, 994 rescheduled in 5.5 s, spread exactly 6 per future window. Sends were about 1 s apart across both workers, with no re-deferrals. |
| Order of that backlog | 990 of 1000 emails land in their fair window, the other 10 one window off (parallel-job jitter). Emails are spaced at least 1 ms apart so equal times never tie: BullMQ breaks ties by job id, which here is a random UUID. |
| Fresh clone of the repo, production build, both workers hard-killed mid-backlog | Clean install and build; migration on an empty database; after restart every pending email still had its job (988 = 988), no email was sent twice, and the 2-per-sender cap held in every window. |
| Totals across all runs | Every email sent exactly once (`attempts = 1` on every row), 0 errors. |

## 6. Demo script

1. `docker compose up -d`, then `npm run dev` in `backend/` and in `frontend/`.
2. Log in with Google; the sidebar card shows your name, email and avatar.
3. Open the user card dropdown → **Connect Slack** and pick a channel. A confirmation message arrives.
4. Compose: **Upload List** with `samples/leads.csv` (5 emails detected), delay 5, hourly limit 3, write a body, click the clock and pick a time 1 minute from now, then **Send Later**.
5. The Scheduled tab lists them. Bull Board → Delayed shows the jobs.
6. **Restart scenario:** stop the backend (Ctrl+C) before the start time. Wait until the start time has passed, then start it again. The worker logs the reconciliation and sends the overdue emails, then the future ones on time. Each email is sent once.
7. Emails move to Sent with an Ethereal link. The 3rd send reaches the campaign limit: a Slack message arrives, and emails 4 and 5 show **Rate limited** with their new time in the next window. Set `RATE_LIMIT_WINDOW_MS=60000` to watch them go out a minute later. To demo the per-**sender** limit specifically, set `MAX_EMAILS_PER_HOUR_PER_SENDER=1` and use a high campaign limit: each sender's first send reaches its limit and triggers a Slack message naming that sender.
8. Optional load test: `npm run load-test -- 1000 100`, then watch Bull Board spacing (one send every 2 seconds) and the deferrals.

## 7. Assumptions, shortcuts and trade-offs

- **Fixed windows, not sliding ones.** Hourly windows are aligned to the clock (`floor(now/3600000)`). This is simple, cheap and exact under concurrency, but it allows up to 2 × limit within any rolling 60 minutes that spans a boundary. A sliding-window log (Redis ZSET) would remove this at the cost of more memory per sender.
- **Global minimum interval.** The 2-second spacing is per queue (all senders together), which is the simplest safe reading of "minimum delay between sends." Per-sender spacing would need a per-sender queue or BullMQ Pro groups.
- **Waiting for a send slot holds a worker slot.** A job sleeps up to about 10 seconds for its send slot while occupying one of the worker's concurrency slots. Jobs further out are moved back to delayed instead. That keeps the code simple, at the cost of some idle concurrency when many workers compete.
- **Delivery jitter of 1–3 s.** Times are when the job starts; the SMTP round trip to Ethereal adds a second or two before "sent" is recorded.
- **Reservations are best-effort.** A reserved window can still overflow if new campaigns are scheduled into it. In that case the job is simply rescheduled again, which is correct, just one extra hop.
- **At-least-once SMTP edge case.** If a worker dies after the SMTP server accepted a message but before the DB update, the email is retried after the 2-minute stale-lock timeout. This is inherent to SMTP, which has no transactional send. The deterministic Message-ID mitigates it.
- **Lua key names** in the reservation script are built dynamically. That is fine on a single Redis or a primary/replica setup, but Redis Cluster would need hash tags.
- **Rich text body** is produced by a small `contentEditable` editor using `document.execCommand`. It is deprecated, but still supported by all browsers and enough for the toolbar in the design. The server strips scripts and event handlers, sends the HTML plus a generated plain-text part, and the UI renders bodies in a script-less sandboxed iframe. There are no per-lead personalization variables.
- **Sessions** are stateless JWTs in an httpOnly cookie (7 days); logout clears the cookie. Tokens are not server-side revocable.
- **Bull Board** is open in development; set `BULL_BOARD_USER` / `BULL_BOARD_PASS` to protect it.
- **Figma deviations:**
  - The design shows user info in the sidebar card rather than a top header, so I followed the design; Logout and Slack live in that card's dropdown.
  - The email/password form on the login screen is visual only. The assignment requires Google OAuth, and the form tells the user to use Google.
  - The paperclip (attachments) and archive icons are not implemented. Attachments would need file storage and are outside the assignment's scope.
  - Without a time picked, **Send** queues the emails to start immediately. Picking a time in the clock popover turns the button into **Send Later**.
