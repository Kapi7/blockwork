# TrainingPeaks Internal API — Research Findings

**Date:** 2026-04-05
**Method:** Playwright browser capture + curl verification
**Athlete ID:** 3030673 (Kapi_7)

## Auth Strategy (VERIFIED WORKING)

TP uses a 2-step auth flow:

1. **Session cookie** — `Production_tpAuth` (domain `.trainingpeaks.com`, HttpOnly, long-lived). Set after a successful login on `home.trainingpeaks.com/login`.
2. **Short-lived bearer token** — Obtained by calling `GET https://tpapi.trainingpeaks.com/users/v3/token` with the session cookie. Returns a 1-hour access token plus a refresh_token (but refresh_token flow is NOT externally exposed — see below).

### Critical finding: Login is gated by invisible reCAPTCHA v3

Direct POST to `home.trainingpeaks.com/login` with username/password from curl returns "invalid credentials" because TP expects a valid reCAPTCHA v3 token in the form submission. Headless curl can't solve this.

**Workaround:** Drive a real browser (Playwright) once to log in and capture the `Production_tpAuth` cookie. Store the cookie as a Cloudflare secret. Use that cookie to request fresh bearer tokens on demand.

The `Production_tpAuth` cookie appears to have a long TTL (weeks/months). When it expires, re-run the Playwright login script locally to get a new one.

The `refresh_token` returned in the token response does NOT work as a standalone OAuth2 refresh:
- `POST /oauth/token` → 404
- `POST /users/v3/token` with `grant_type=refresh_token` → 401
- `PUT /users/v3/token` with JSON body → 401

Only the `Production_tpAuth` cookie unlocks fresh bearer tokens.

## Verified Endpoints

Base: `https://tpapi.trainingpeaks.com`

### Auth

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/users/v3/token` | Cookie: Production_tpAuth | `{success, token: {access_token, expires_in, refresh_token, ...}}` |
| GET | `/users/v3/user` | Bearer | User profile |
| GET | `/users/v1/user/accessrights` | Bearer | Access rights |

### Workouts

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/fitness/v6/athletes/{athleteId}/workouts/{startDate}/{endDate}` | Bearer | Array of workout summaries |
| GET | `/fitness/v6/athletes/{athleteId}/workouts/{workoutId}/details` | Bearer | Detailed workout with zones, splits, attachments |
| GET | `/fitness/v6/workouttypes` | Bearer | Workout type catalog |

Dates in YYYY-MM-DD format.

### Events (Races/Goals)

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/fitness/v6/athletes/{athleteId}/events/{start}/{end}` | Bearer | Events (races, A/B/C priority) |
| GET | `/fitness/v6/athletes/{athleteId}/events/focusevent` | Bearer | Primary focus event |

### Metrics

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/metrics/v3/athletes/{athleteId}/consolidatedtimedmetrics/{start}/{end}` | Bearer | PMC chart data (CTL/ATL/TSB) |
| POST | `/fitness/v1/athletes/{athleteId}/reporting/performancedata/{start}/{end}` | Bearer | Performance reports |
| GET | `/personalrecord/v2/athletes/{athleteId}/results/{activityType}` | Bearer | Personal records |

### Athlete Settings

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/fitness/v1/athletes/{athleteId}/settings` | Bearer | Athlete preferences |
| GET | `/fitness/v1/athletes/{athleteId}/equipment` | Bearer | Bikes, shoes |
| GET | `/fitness/v1/athletes/{athleteId}/defaultZones` | Bearer | HR/power zones |
| GET | `/fitness/v1/athletes/{athleteId}/availability/{start}/{end}` | Bearer | Availability calendar |

### Plans

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/plans/v1/athletes/{athleteId}/appliedplans/{date}` | Bearer | Applied training plans |

## Workout Summary Shape (verified)

```json
{
  "workoutId": 3640602741,
  "athleteId": 3030673,
  "title": "Running",
  "workoutTypeValueId": 3,
  "workoutDay": "2026-03-22T00:00:00",
  "startTime": "2026-03-22T06:52:16",
  "completed": null,
  "description": null,
  "userTags": "Running",
  "coachComments": null,
  "workoutComments": [],
  "distance": 1453.42,          // meters
  "distancePlanned": null,
  "totalTime": 0.15065,         // hours
  "totalTimePlanned": null,
  "heartRateMinimum": 74,
  "heartRateMaximum": 127,
  "heartRateAverage": 115,
  "calories": 104,
  "tssActual": 5.79,
  "tssPlanned": null,
  "if": 0.603,
  "ifPlanned": null,
  "velocityAverage": 2.68,      // m/s
  "velocityMaximum": 4.28,
  "normalizedSpeedActual": 2.68,
  "elevationGain": 6,
  "cadenceAverage": 153,
  "cadenceMaximum": 174,
  "rpe": null,
  "feeling": null,
  "structure": null,             // structured workout JSON if planned
  "complianceDurationPercent": null,
  "complianceDistancePercent": null,
  "complianceTssPercent": null
}
```

## Workout Types (`workoutTypeValueId`)

Key values seen:
- `3` = Running (confirmed for Running activity)
- TODO: map full list via `/fitness/v6/workouttypes`

## Still Unknown (Not Yet Verified)

- **POST comment on workout** — endpoint unknown. Guessed `/fitness/v6/athletes/{id}/workouts/{wid}/comments` returns 404. Need to capture real POST via browser UI.
- **Create workout** — endpoint unknown. Need to capture real POST via browser UI.
- **Update workout** (to modify plans)
- **Delete workout**

## Production_tpAuth Cookie

Full sample captured (1600+ chars). Opaque base64-ish string. Contains full user session context. Treat as equivalent to a password for security purposes.

## Next Steps

The read side is fully working. To proceed we need either:

1. **Finish capturing write/comment endpoints** via more browser interaction (add a comment, create a workout, capture the POST) — fragile, time-consuming.

2. **Pivot to read-only + email/feedback digest** — use the working read flow to pull data daily, analyze with Claude, deliver feedback via email or a minimal blockwork coach feed. Skip writing to TP entirely.

3. **Hybrid** — read automated, write via Playwright running on GitHub Actions (has Chromium, can execute login + form posts).
