# TrainingPeaks Integration — Design

**Date:** 2026-04-05
**Status:** Approved, ready for implementation plan
**Author:** Coach K (Claude) + Itay

## Goal

Replace the blockwork web app with a pure TrainingPeaks-backed coaching system. Itay lives in TP. Claude works entirely in the background: writes workouts to TP, reads completed sessions, analyzes, and posts feedback as TP workout comments.

## Why this change

- TP Premium + Garmin sync already delivers workouts to Itay's watch natively
- TP has richer workout analysis than we'd ever build (TSS, PMC, HR zones, lap splits)
- One place to live — no app-switching
- Blockwork's coach feed became redundant once TP comments became the feedback channel

## Non-goals

- No user-facing UI — Itay only sees TP
- No multi-user support — single athlete (Itay)
- No replacement for TP's native analysis — we add coaching on top of TP, not instead of it

## Architecture

Four backend-only components on Cloudflare Workers + D1:

### 1. TP Bridge
Headless script that logs into TrainingPeaks as Itay using his credentials (stored as Cloudflare encrypted secrets). Implements three operations:
- `writeWorkout(date, structuredWorkout)` — posts a workout to his calendar
- `readCompletedWorkout(date)` — pulls completed workout data (planned vs actual, HR, laps, his comment)
- `postComment(workoutId, text)` — adds a comment to a workout, prefixed "COACH K:"

TP has no public athlete API. The bridge reverse-engineers TP's internal web endpoints (used by their own web app) via an authenticated session cookie. Fallback: if the script breaks due to TP changing their site, we detect via health check and alert.

### 2. Claude Analysis
Cloudflare Worker that calls the Claude API with three analysis modes:
- **Session**: one completed workout + 14-day context → ~150-word feedback
- **Weekly**: full week + previous 3 weeks → ~300-word summary
- **Block**: full block + baseline fitness → ~500-word block review + next block recommendation

### 3. Scheduled & Triggered Jobs
- **Session feedback** — triggered by Strava webhook when a new activity uploads. Function receives the ping, gives TP 2-3 minutes to sync, then pulls from TP and analyzes.
- **Weekly review** — Cloudflare cron, Sundays 07:00 Cyprus time
- **Block-end review** — Cloudflare cron, fires when `block.endDate === today`
- **Block builder** — fires 2 days before block end, generates next block based on how current block went, pushes to TP calendar

### 4. State Store (Cloudflare D1)
Minimal schema, single athlete:
- `blocks` — block definitions (current + history)
- `analyses` — every Claude analysis logged with timestamp, type, input, output
- `sync_log` — last run of each job, success/failure
- `errors` — failures for debugging

Secrets (Cloudflare Secret Store):
- `TP_EMAIL`, `TP_PASSWORD`
- `ANTHROPIC_API_KEY`
- `STRAVA_CLIENT_SECRET` (already set)

## Data flow

### Session feedback (happens after every workout)
```
Itay runs → Garmin → TP (auto-sync)
                    ↓
Strava webhook fires → Cloudflare Function receives ping
                    ↓
Function waits 3 min (TP needs time to process Garmin upload)
                    ↓
TP Bridge: read completed workout from TP by date
                    ↓
Claude: analyze workout vs plan + 14-day context + Itay's comment
                    ↓
TP Bridge: post "COACH K: [feedback]" comment on the workout
                    ↓
Itay sees it in TP mobile
```

### Block building (happens 2 days before block end)
```
Cron fires → reads current block + all completed sessions
          ↓
Claude: generate next block based on what Itay did vs planned
          ↓
TP Bridge: push all sessions of next block to TP calendar
          ↓
Comment on first workout of new block: "COACH K: New block starts. Here's the focus: ..."
```

### Weekly review (Sundays 07:00)
```
Cron fires → TP Bridge reads last 7 days
          ↓
Claude: weekly summary (volume, consistency, quality, trends, concerns)
          ↓
TP Bridge: post comment on the Sunday long ride (or last workout of week)
          ↓
Store in D1 analyses table for future context
```

## Error handling

- **TP login fails** — retry 3x with exponential backoff. If still failing, log to D1 errors table and send email to Itay via Resend (or just surface in next chat with Claude).
- **TP endpoint changed** — health check runs daily, attempts a known-good read. If it fails, alert email. Fallback: Itay manually triggers analysis from chat until fix deployed.
- **Claude API fails** — retry 3x. If still failing, post a short generic comment ("COACH K: Analysis delayed, will update soon") so Itay knows the system tried.
- **Strava webhook missed** — daily cron at 23:00 checks TP for any workouts today that haven't been analyzed yet, catches misses.

## Security

- Credentials in Cloudflare Secrets (encrypted at rest, never in logs)
- Worker has no public endpoints except Strava webhook (verified with Strava webhook secret)
- D1 only accessible from the Worker
- No frontend, no CORS surface, no auth tokens in browsers

## Testing

1. **Local**: `wrangler dev` with test credentials. Write one test workout for a far-future date. Verify it appears in TP.
2. **Read test**: mark one TP workout as done manually. Run the read function. Verify we pull correct data.
3. **Comment test**: post a test comment. Verify it appears in TP.
4. **End-to-end**: do a real short run, verify Strava webhook fires, feedback gets posted within 5 min.
5. **Cron test**: manually trigger the weekly review, verify it generates and posts correctly.

## Open questions / follow-ups

- **Alert email**: need to pick a service (Resend is simple, free tier enough). Can defer until we hit the first error.
- **Credential rotation**: we should set up a reminder to rotate TP password every 90 days.
- **Migration**: current blockwork app stays up for a few weeks as fallback. Once TP integration is proven stable, we decommission blockwork.

## What we're NOT doing (YAGNI)

- No blockwork UI (kill it)
- No multi-user
- No manual admin panel
- No Slack/Discord integrations
- No workout PDF exports
- No race results tracking UI (races show up naturally in TP as they happen)
