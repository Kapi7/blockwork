# TrainingPeaks Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the blockwork web app with a headless TrainingPeaks backend that pushes workouts, reads completed sessions, analyzes with Claude, and posts feedback as TP workout comments.

**Architecture:** Cloudflare Pages Functions (reuses the existing `blockwork` project) for webhook + cron handlers. A TP Bridge module logs into TrainingPeaks as the athlete via their internal web endpoints (no public athlete API exists). Claude API generates session/weekly/block feedback. All state in Cloudflare D1 (the existing `blockwork-db`).

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Cloudflare D1, Cloudflare Cron Triggers, Anthropic Claude API, `fetch` for TP HTTP calls (no Puppeteer — Workers runtime doesn't support it), Vitest for unit tests with mocked HTTP.

**Design doc:** `docs/plans/2026-04-05-trainingpeaks-integration-design.md`

---

## Prerequisites (already done)

- Cloudflare Pages project `blockwork` deployed
- Cloudflare D1 `blockwork-db` bound as `DB`
- Secrets set: `TP_USERNAME`, `TP_PASSWORD`, `ANTHROPIC_API_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`
- Strava integration wired (functions/api/strava-*.ts)
- Design doc approved and committed

---

## Phase 1: Research & Foundation

### Task 1: Research TrainingPeaks internal auth flow (SPIKE)

This is the highest-risk task. TP has no public athlete API — we need to understand how their web app authenticates and what endpoints it hits. Output of this task is a working `curl` sequence that logs in and fetches one workout. No code yet.

**Files:**
- Create: `docs/research/tp-endpoints.md`

**Step 1: Use browser DevTools to capture TP auth flow**

Open trainingpeaks.com in Chrome. Open DevTools → Network tab → Preserve log → Check "Fetch/XHR".
Log in as Kapi_7. Watch the network requests.
Identify:
- The login POST endpoint (URL, headers, body)
- The session cookie(s) set on success
- Any CSRF token requirement
- Any redirect chain

**Step 2: Find the "get workout" endpoint**

After login, navigate to your calendar. Click one completed workout. In Network tab, find the request that fetches workout detail. Capture:
- URL pattern (e.g., `/workouts/v4/{id}`)
- Required headers
- Response JSON shape (at minimum: date, distance, duration, HR, planned vs actual, comments)

**Step 3: Find the "create workout" endpoint**

Click "Add workout" → "Structured" → fill in a test workout for next Monday → save. Capture:
- POST URL
- Request body shape
- Required fields

**Step 4: Find the "post comment" endpoint**

On a completed workout, add a comment. Capture the POST URL and body.

**Step 5: Test with curl**

Replicate the login + get-workout flow with curl. Verify you can authenticate and fetch a workout from the command line using only the credentials.

**Step 6: Document findings**

Write `docs/research/tp-endpoints.md` with:
- Login flow (endpoint, headers, body, cookies returned)
- Get workout endpoint + response schema
- Create workout endpoint + request schema
- Post comment endpoint + request schema
- Any gotchas discovered (rate limits, CSRF, 2FA, cloudflare WAF)

**Step 7: Commit**

```bash
git add docs/research/tp-endpoints.md
git commit -m "docs: research TP internal endpoints"
```

**Decision point:** If the research shows TP uses anti-bot measures (e.g., Cloudflare WAF with challenge) that block `fetch` from Workers, we fall back to Plan B: Itay copies workouts manually, we only read via the iCal export feed.

---

### Task 2: Update D1 schema for TP integration

**Files:**
- Create: `migrations/002_tp_integration.sql`

**Step 1: Write the migration SQL**

```sql
-- Analyses: every Claude analysis logged
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,  -- 'session', 'weekly', 'block'
  workout_date TEXT,   -- YYYY-MM-DD, null for weekly/block
  workout_tp_id TEXT,  -- TP workout ID if session analysis
  input_json TEXT NOT NULL,  -- snapshot of what Claude received
  output_text TEXT NOT NULL, -- feedback Claude generated
  posted_to_tp INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analyses_workout_date ON analyses(workout_date);
CREATE INDEX IF NOT EXISTS idx_analyses_type ON analyses(type);

-- Sync log: last run of each job
CREATE TABLE IF NOT EXISTS sync_log (
  job_name TEXT PRIMARY KEY,
  last_run_at TEXT,
  status TEXT,  -- 'ok' | 'error'
  message TEXT
);

-- Errors: for debugging
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,  -- 'tp_bridge', 'claude', 'webhook', 'cron'
  message TEXT NOT NULL,
  stack TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_errors_source ON errors(source);
CREATE INDEX IF NOT EXISTS idx_errors_created ON errors(created_at);

-- TP session cache: store the authenticated session cookie so we don't log in every request
CREATE TABLE IF NOT EXISTS tp_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- single row
  cookie TEXT,
  expires_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Step 2: Apply the migration**

```bash
npx wrangler d1 execute blockwork-db --remote --file=migrations/002_tp_integration.sql
```

Expected: "✓ Executed N queries"

**Step 3: Verify tables exist**

```bash
npx wrangler d1 execute blockwork-db --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

Expected: list includes `analyses`, `sync_log`, `errors`, `tp_session`.

**Step 4: Commit**

```bash
git add migrations/002_tp_integration.sql
git commit -m "feat: add D1 schema for TP integration"
```

---

## Phase 2: TP Bridge

### Task 3: Set up Vitest for unit testing

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install Vitest**

```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

**Step 2: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

**Step 3: Add test script to package.json**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 4: Verify vitest runs (even with no tests)**

```bash
npm test
```

Expected: "No test files found" — that's fine, we have the runner working.

**Step 5: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

### Task 4: TP Bridge — auth module (TDD)

**Files:**
- Create: `functions/api/lib/tp-auth.ts`
- Create: `functions/api/lib/tp-auth.test.ts`

**Step 1: Write the failing test**

```typescript
// functions/api/lib/tp-auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loginToTP } from './tp-auth';

describe('loginToTP', () => {
  it('returns session cookie on successful login', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 200,
        headers: { 'set-cookie': 'TPAUTH=abc123; Path=/' },
      }));
    global.fetch = mockFetch;

    const result = await loginToTP('user@test.com', 'password');

    expect(result.cookie).toContain('TPAUTH=abc123');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('throws on invalid credentials', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response('Invalid credentials', { status: 401 })
    );

    await expect(loginToTP('bad', 'bad')).rejects.toThrow('TP login failed');
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
npm test -- functions/api/lib/tp-auth.test.ts
```

Expected: FAIL (module doesn't exist yet)

**Step 3: Implement minimal code to pass**

Use the findings from Task 1 research. Example shape:

```typescript
// functions/api/lib/tp-auth.ts
export interface TPSession {
  cookie: string;
  expiresAt: Date;
}

export async function loginToTP(username: string, password: string): Promise<TPSession> {
  // NOTE: exact URL and body shape comes from Task 1 research
  const res = await fetch('https://home.trainingpeaks.com/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ Username: username, Password: password }),
    redirect: 'manual',
  });

  if (res.status !== 200 && res.status !== 302) {
    throw new Error(`TP login failed: ${res.status}`);
  }

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('TP login failed: no session cookie returned');
  }

  return {
    cookie: setCookie,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
  };
}
```

**Step 4: Run test to verify pass**

```bash
npm test -- functions/api/lib/tp-auth.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add functions/api/lib/tp-auth.ts functions/api/lib/tp-auth.test.ts
git commit -m "feat: TP auth module with tests"
```

---

### Task 5: TP Bridge — session caching in D1

**Files:**
- Create: `functions/api/lib/tp-session.ts`
- Create: `functions/api/lib/tp-session.test.ts`

**Step 1: Write failing tests**

```typescript
// functions/api/lib/tp-session.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getOrRefreshSession } from './tp-session';

const mockDB = (currentRow: any) => ({
  prepare: () => ({
    bind: () => ({
      first: async () => currentRow,
      run: async () => ({}),
    }),
  }),
});

describe('getOrRefreshSession', () => {
  it('returns cached session if not expired', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const db = mockDB({ cookie: 'cached=1', expires_at: future });
    const result = await getOrRefreshSession(db as any, 'u', 'p');
    expect(result).toBe('cached=1');
  });

  it('refreshes session if expired', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const db = mockDB({ cookie: 'old=1', expires_at: past });
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response('', {
        status: 200,
        headers: { 'set-cookie': 'TPAUTH=fresh; Path=/' },
      })
    );
    const result = await getOrRefreshSession(db as any, 'u', 'p');
    expect(result).toContain('fresh');
  });
});
```

**Step 2: Run to verify fail**

```bash
npm test -- functions/api/lib/tp-session.test.ts
```

Expected: FAIL

**Step 3: Implement**

```typescript
// functions/api/lib/tp-session.ts
import { loginToTP } from './tp-auth';

export async function getOrRefreshSession(
  db: D1Database,
  username: string,
  password: string
): Promise<string> {
  const row = await db.prepare('SELECT cookie, expires_at FROM tp_session WHERE id = 1').first() as any;

  if (row && new Date(row.expires_at) > new Date()) {
    return row.cookie;
  }

  const session = await loginToTP(username, password);
  await db.prepare(
    'INSERT INTO tp_session (id, cookie, expires_at, updated_at) VALUES (1, ?, ?, datetime("now")) ON CONFLICT(id) DO UPDATE SET cookie = excluded.cookie, expires_at = excluded.expires_at, updated_at = excluded.updated_at'
  ).bind(session.cookie, session.expiresAt.toISOString()).run();

  return session.cookie;
}
```

**Step 4: Run tests to verify pass**

```bash
npm test -- functions/api/lib/tp-session.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add functions/api/lib/tp-session.ts functions/api/lib/tp-session.test.ts
git commit -m "feat: TP session caching in D1"
```

---

### Task 6: TP Bridge — read completed workout

**Files:**
- Create: `functions/api/lib/tp-read.ts`
- Create: `functions/api/lib/tp-read.test.ts`

**Step 1: Write failing tests**

```typescript
// functions/api/lib/tp-read.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readWorkout } from './tp-read';

describe('readWorkout', () => {
  it('parses TP workout JSON into our domain shape', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        workoutId: 12345,
        workoutDate: '2026-04-14T00:00:00',
        distance: 8000,
        duration: 2400,
        heartRateAverage: 145,
        description: 'Easy run',
        comment: 'Felt good',
        completed: true,
      }), { status: 200 })
    );

    const result = await readWorkout('session-cookie', 12345);

    expect(result).toMatchObject({
      id: 12345,
      date: '2026-04-14',
      distance: 8,  // km
      duration: 2400,
      avgHr: 145,
      comment: 'Felt good',
      completed: true,
    });
  });
});
```

**Step 2: Run to verify fail**

```bash
npm test -- functions/api/lib/tp-read.test.ts
```

Expected: FAIL

**Step 3: Implement (exact URL from research)**

```typescript
// functions/api/lib/tp-read.ts
export interface CompletedWorkout {
  id: number;
  date: string;
  distance: number; // km
  duration: number; // seconds
  avgHr: number;
  maxHr?: number;
  description: string;
  comment: string;
  completed: boolean;
}

export async function readWorkout(cookie: string, workoutId: number): Promise<CompletedWorkout> {
  const res = await fetch(`https://tpapi.trainingpeaks.com/fitness/v1/athletes/self/workouts/${workoutId}`, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) throw new Error(`TP read failed: ${res.status}`);

  const data = await res.json() as any;
  return {
    id: data.workoutId,
    date: data.workoutDate.slice(0, 10),
    distance: (data.distance || 0) / 1000,
    duration: data.duration || 0,
    avgHr: data.heartRateAverage || 0,
    maxHr: data.heartRateMaximum,
    description: data.description || '',
    comment: data.comment || '',
    completed: data.completed === true,
  };
}
```

**Step 4: Run tests**

```bash
npm test -- functions/api/lib/tp-read.test.ts
```

Expected: PASS

**Step 5: Add "list workouts for date range" function**

```typescript
// add to tp-read.ts
export async function listWorkouts(cookie: string, startDate: string, endDate: string): Promise<CompletedWorkout[]> {
  const res = await fetch(
    `https://tpapi.trainingpeaks.com/fitness/v1/athletes/self/workouts?startDate=${startDate}&endDate=${endDate}`,
    { headers: { Cookie: cookie } }
  );
  if (!res.ok) throw new Error(`TP list failed: ${res.status}`);
  const data = await res.json() as any[];
  return data.map((w) => ({
    id: w.workoutId,
    date: w.workoutDate.slice(0, 10),
    distance: (w.distance || 0) / 1000,
    duration: w.duration || 0,
    avgHr: w.heartRateAverage || 0,
    maxHr: w.heartRateMaximum,
    description: w.description || '',
    comment: w.comment || '',
    completed: w.completed === true,
  }));
}
```

Add a test for `listWorkouts` with a mocked array response. Run it.

**Step 6: Commit**

```bash
git add functions/api/lib/tp-read.ts functions/api/lib/tp-read.test.ts
git commit -m "feat: TP read workout + list workouts"
```

---

### Task 7: TP Bridge — write workout to calendar

**Files:**
- Create: `functions/api/lib/tp-write.ts`
- Create: `functions/api/lib/tp-write.test.ts`

Same TDD pattern: write failing test, run, implement, verify pass, commit.

**Key behavior to test:**
- Input: a structured workout `{ date, title, description, distancePlanned, durationPlanned, workoutType }`
- Makes POST to TP's create-workout endpoint with correctly-shaped body
- Returns the created workoutId

**Commit:**

```bash
git add functions/api/lib/tp-write.ts functions/api/lib/tp-write.test.ts
git commit -m "feat: TP write workout to calendar"
```

---

### Task 8: TP Bridge — post comment on workout

**Files:**
- Create: `functions/api/lib/tp-comment.ts`
- Create: `functions/api/lib/tp-comment.test.ts`

Same TDD pattern.

**Key behavior:**
- Prefix all comments with `"COACH K: "` automatically
- Returns success/failure

**Commit:**

```bash
git add functions/api/lib/tp-comment.ts functions/api/lib/tp-comment.test.ts
git commit -m "feat: TP post comment on workout"
```

---

### Task 9: End-to-end TP Bridge smoke test

**Files:**
- Create: `scripts/tp-smoke-test.ts`

This is NOT a unit test — it's a script that hits the real TP account once to verify the whole bridge works.

**Step 1: Write the smoke test script**

```typescript
// scripts/tp-smoke-test.ts
// Run with: TP_USERNAME=... TP_PASSWORD=... npx tsx scripts/tp-smoke-test.ts
import { loginToTP } from '../functions/api/lib/tp-auth';
import { listWorkouts } from '../functions/api/lib/tp-read';

async function main() {
  const username = process.env.TP_USERNAME!;
  const password = process.env.TP_PASSWORD!;

  console.log('1. Logging in...');
  const session = await loginToTP(username, password);
  console.log('   ✓ Got session cookie');

  console.log('2. Listing last 7 days of workouts...');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const workouts = await listWorkouts(session.cookie, weekAgo, today);
  console.log(`   ✓ Got ${workouts.length} workouts`);
  for (const w of workouts.slice(0, 5)) {
    console.log(`     - ${w.date} | ${w.description} | ${w.distance}km`);
  }

  console.log('\nSmoke test PASSED');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
```

**Step 2: Run against real TP account**

```bash
TP_USERNAME=Kapi_7 TP_PASSWORD=Kapi1988 npx tsx scripts/tp-smoke-test.ts
```

Expected: logs "Smoke test PASSED" and shows a handful of recent workouts.

**If it fails:** go back to Task 1 research, the endpoint shape is wrong.

**Step 3: Commit**

```bash
git add scripts/tp-smoke-test.ts
git commit -m "chore: TP Bridge smoke test script"
```

---

## Phase 3: Claude Analysis

### Task 10: Claude analysis — session feedback

**Files:**
- Create: `functions/api/lib/claude-analysis.ts`
- Create: `functions/api/lib/claude-analysis.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { analyzeSession } from './claude-analysis';

describe('analyzeSession', () => {
  it('calls Claude API with workout + context and returns feedback text', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        content: [{ text: 'Solid session. HR was controlled, pace was on target.' }],
      }), { status: 200 })
    );

    const result = await analyzeSession({
      apiKey: 'test-key',
      workout: {
        id: 1, date: '2026-04-14', distance: 8, duration: 2400,
        avgHr: 145, description: 'Easy run 8km', comment: 'Felt good', completed: true,
      },
      recentContext: [],
      currentBlock: null,
    });

    expect(result).toContain('Solid session');
  });
});
```

**Step 2: Run to verify fail**

**Step 3: Implement**

```typescript
// functions/api/lib/claude-analysis.ts
import type { CompletedWorkout } from './tp-read';

export interface AnalysisInput {
  apiKey: string;
  workout: CompletedWorkout;
  recentContext: CompletedWorkout[];
  currentBlock: any | null;
}

export async function analyzeSession(input: AnalysisInput): Promise<string> {
  const prompt = buildSessionPrompt(input);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status}`);
  const data = await res.json() as any;
  return data.content[0].text;
}

function buildSessionPrompt(input: AnalysisInput): string {
  const w = input.workout;
  return `You are Coach K. Give ~120 word feedback on this completed workout.

Workout: ${w.description}
Date: ${w.date}
Distance: ${w.distance}km
Duration: ${Math.round(w.duration/60)}min
Avg HR: ${w.avgHr}bpm
Athlete comment: ${w.comment || '(none)'}

Recent 14 days: ${input.recentContext.length} sessions, avg ${Math.round(input.recentContext.reduce((s,r)=>s+r.distance,0)/Math.max(input.recentContext.length,1))}km per run

Be specific. Reference the numbers. If something is off, say so. Keep it under 120 words.`;
}
```

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add functions/api/lib/claude-analysis.ts functions/api/lib/claude-analysis.test.ts
git commit -m "feat: Claude session analysis"
```

---

### Task 11: Claude analysis — weekly + block

**Files:**
- Modify: `functions/api/lib/claude-analysis.ts` — add `analyzeWeek()` and `analyzeBlock()`
- Modify: `functions/api/lib/claude-analysis.test.ts` — add tests for both

Same TDD pattern. Each gets its own prompt builder.

**Commit:**

```bash
git add functions/api/lib/claude-analysis.ts functions/api/lib/claude-analysis.test.ts
git commit -m "feat: Claude weekly and block analysis"
```

---

## Phase 4: Webhook & Cron

### Task 12: Strava webhook receiver

**Files:**
- Create: `functions/api/strava-webhook.ts`
- Create: `functions/api/strava-webhook.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { onRequestPost, onRequestGet } from './strava-webhook';

describe('strava-webhook', () => {
  it('responds to Strava verification challenge (GET)', async () => {
    const request = new Request('http://test/api/strava-webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=token');
    const context = {
      request,
      env: { STRAVA_VERIFY_TOKEN: 'token' },
    } as any;
    const res = await onRequestGet(context);
    const body = await res.json();
    expect(body).toEqual({ 'hub.challenge': 'abc' });
  });

  it('accepts event POST and queues analysis', async () => {
    const mockDB = {
      prepare: () => ({ bind: () => ({ run: async () => ({}) }) }),
    };
    const request = new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({
        aspect_type: 'create',
        object_type: 'activity',
        object_id: 12345,
        owner_id: 999,
      }),
    });
    const context = { request, env: { DB: mockDB } } as any;
    const res = await onRequestPost(context);
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run to verify fail**

**Step 3: Implement**

```typescript
// functions/api/strava-webhook.ts
interface Env {
  DB: D1Database;
  STRAVA_VERIFY_TOKEN: string;
  TP_USERNAME: string;
  TP_PASSWORD: string;
  ANTHROPIC_API_KEY: string;
}

// GET: Strava verification challenge
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === env.STRAVA_VERIFY_TOKEN) {
    return Response.json({ 'hub.challenge': challenge });
  }
  return new Response('Forbidden', { status: 403 });
};

// POST: new activity event
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const event = await request.json() as any;
  if (event.aspect_type !== 'create' || event.object_type !== 'activity') {
    return Response.json({ ignored: true });
  }

  // Log to sync_log
  await env.DB.prepare(
    'INSERT OR REPLACE INTO sync_log (job_name, last_run_at, status, message) VALUES (?, ?, ?, ?)'
  ).bind('strava_webhook', new Date().toISOString(), 'received', `activity ${event.object_id}`).run();

  // Trigger TP read + Claude analysis (async — don't wait)
  // For MVP, do inline. Later we move to queue.
  // ctx.waitUntil(processNewActivity(event, env));

  return Response.json({ ok: true });
};
```

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add functions/api/strava-webhook.ts functions/api/strava-webhook.test.ts
git commit -m "feat: Strava webhook receiver"
```

---

### Task 13: Wire webhook → TP read → Claude → TP comment (integration)

**Files:**
- Create: `functions/api/lib/process-session.ts`
- Create: `functions/api/lib/process-session.test.ts`
- Modify: `functions/api/strava-webhook.ts` — call `processSession` via `ctx.waitUntil`

**Step 1: Write failing test for processSession**

Test with mocked TP bridge + Claude API. Verify:
1. Session cookie fetched
2. Workout read from TP
3. Claude called with context
4. Comment posted to TP
5. Analysis logged to D1

**Step 2: Implement `processSession`**

```typescript
// functions/api/lib/process-session.ts
import { getOrRefreshSession } from './tp-session';
import { listWorkouts } from './tp-read';
import { analyzeSession } from './claude-analysis';
import { postComment } from './tp-comment';

export async function processSession(
  env: { DB: D1Database; TP_USERNAME: string; TP_PASSWORD: string; ANTHROPIC_API_KEY: string },
  activityDate: string
): Promise<void> {
  // Wait 3 min for TP to sync from Garmin (in Worker, use scheduled delay)
  // For Pages Function: rely on Strava being ~2 min behind TP typically

  const cookie = await getOrRefreshSession(env.DB, env.TP_USERNAME, env.TP_PASSWORD);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const workouts = await listWorkouts(cookie, weekAgo, today);

  const target = workouts.find(w => w.date === activityDate && w.completed);
  if (!target) return;

  // Skip if already analyzed
  const existing = await env.DB.prepare(
    'SELECT id FROM analyses WHERE type = ? AND workout_tp_id = ?'
  ).bind('session', String(target.id)).first();
  if (existing) return;

  const context = workouts.filter(w => w.id !== target.id);
  const feedback = await analyzeSession({
    apiKey: env.ANTHROPIC_API_KEY,
    workout: target,
    recentContext: context,
    currentBlock: null,
  });

  await postComment(cookie, target.id, feedback);

  await env.DB.prepare(
    'INSERT INTO analyses (type, workout_date, workout_tp_id, input_json, output_text, posted_to_tp) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind('session', target.date, String(target.id), JSON.stringify(target), feedback).run();
}
```

**Step 3: Modify strava-webhook.ts to call processSession**

```typescript
// in onRequestPost, replace the waitUntil comment with:
const activityDate = new Date().toISOString().slice(0, 10); // Strava event doesn't include date directly — derive from context
// Use ctx.waitUntil in Cloudflare Functions
(context as any).waitUntil?.(processSession(env, activityDate).catch(err => {
  // Log error to D1
}));
```

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add functions/api/lib/process-session.ts functions/api/lib/process-session.test.ts functions/api/strava-webhook.ts
git commit -m "feat: wire webhook to TP read + Claude + TP comment"
```

---

### Task 14: Register Strava webhook with Strava

**Files:**
- Create: `scripts/register-strava-webhook.ts`

**Step 1: Write the registration script**

```typescript
// scripts/register-strava-webhook.ts
// One-time script to tell Strava about our webhook URL.
// Run: npx tsx scripts/register-strava-webhook.ts
async function main() {
  const clientId = process.env.STRAVA_CLIENT_ID!;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET!;
  const verifyToken = process.env.STRAVA_VERIFY_TOKEN || 'blockwork-verify-token';
  const callbackUrl = 'https://blockwork-91h.pages.dev/api/strava-webhook';

  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });
  const data = await res.json();
  console.log('Registration result:', data);
}
main();
```

**Step 2: Set STRAVA_VERIFY_TOKEN secret**

```bash
echo "blockwork-verify-$(openssl rand -hex 8)" | npx wrangler pages secret put STRAVA_VERIFY_TOKEN --project-name blockwork
```

**Step 3: Deploy first so the webhook endpoint exists**

(Task 17 handles deployment)

**Step 4: Run the registration script**

```bash
STRAVA_CLIENT_ID=202546 STRAVA_CLIENT_SECRET=... STRAVA_VERIFY_TOKEN=... npx tsx scripts/register-strava-webhook.ts
```

Expected: `{ id: 12345 }` confirming subscription created.

**Step 5: Commit**

```bash
git add scripts/register-strava-webhook.ts
git commit -m "chore: Strava webhook registration script"
```

---

### Task 15: Cron — weekly review

**Files:**
- Create: `functions/api/cron-weekly.ts` (or add scheduled trigger via wrangler.toml)
- Modify: `wrangler.toml` to add cron trigger `0 5 * * 0` (Sundays 5am UTC = 7am Cyprus)

Note: Cloudflare Pages Functions don't support native cron. We use a scheduled Worker separately, OR use a GitHub Action that POSTs to a trigger endpoint. Simpler for MVP: GitHub Action.

**Step 1: Create GitHub Action**

```yaml
# .github/workflows/weekly-review.yml
name: Weekly Review
on:
  schedule:
    - cron: '0 5 * * 0'
  workflow_dispatch:
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://blockwork-91h.pages.dev/api/cron/weekly-review \
            -H "Authorization: Bearer ${{ secrets.CRON_TOKEN }}"
```

**Step 2: Create the endpoint**

```typescript
// functions/api/cron/weekly-review.ts
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_TOKEN}`) return new Response('Forbidden', { status: 403 });

  // Pull last 7 days from TP, call analyzeWeek, post comment on last workout of the week, log to D1
  // ... full implementation
  return Response.json({ ok: true });
};
```

**Step 3: Set CRON_TOKEN secret + GitHub secret**

```bash
TOKEN=$(openssl rand -hex 16)
echo "$TOKEN" | npx wrangler pages secret put CRON_TOKEN --project-name blockwork
gh secret set CRON_TOKEN -b "$TOKEN"
```

**Step 4: Test manually**

```bash
gh workflow run weekly-review.yml
gh run watch
```

Expected: run succeeds, analysis posted to TP.

**Step 5: Commit**

```bash
git add functions/api/cron/weekly-review.ts .github/workflows/weekly-review.yml
git commit -m "feat: weekly review cron via GitHub Actions"
```

---

### Task 16: Cron — block-end review + next block builder

**Files:**
- Create: `functions/api/cron/block-end.ts`
- Create: `.github/workflows/block-end.yml`

Runs daily. Checks if any block's `endDate === today - 2 days`. If yes:
1. Read all workouts of that block from TP
2. Call `analyzeBlock()` → block review
3. Call a `buildNextBlock()` function that uses Claude to generate the next block
4. Push next block workouts to TP via tp-write

**Commit:**

```bash
git add functions/api/cron/block-end.ts .github/workflows/block-end.yml
git commit -m "feat: block-end review and next block builder"
```

---

## Phase 5: Deploy & Verify

### Task 17: Deploy and smoke test the whole pipeline

**Files:**
- No new files

**Step 1: Build**

```bash
npm run build
```

Expected: success

**Step 2: Deploy via Cloudflare Pages**

Either push to main (auto-deploy via GitHub) or:
```bash
npx wrangler pages deploy dist --project-name blockwork
```

**Step 3: Verify endpoints are live**

```bash
curl https://blockwork-91h.pages.dev/api/strava-webhook?hub.mode=subscribe&hub.challenge=test&hub.verify_token=$STRAVA_VERIFY_TOKEN
```

Expected: `{"hub.challenge":"test"}`

**Step 4: Register Strava webhook**

Run the script from Task 14 once.

**Step 5: End-to-end test**

- Do a 10-min easy run
- Wait for Garmin to sync to Strava + TP (~3 min)
- Check TP: is the workout there?
- Check TP comments: is there a "COACH K: ..." comment?
- If not, check D1 `errors` table:
  ```bash
  npx wrangler d1 execute blockwork-db --remote --command="SELECT * FROM errors ORDER BY created_at DESC LIMIT 5"
  ```

**Step 6: Commit any fixes**

---

### Task 18: Decommission blockwork UI

**Files:**
- Modify: `src/pages/index.astro` → simple "Blockwork is now running in TrainingPeaks" page
- Delete: `src/pages/dashboard.astro`, `calendar.astro`, `blocks/`, `analytics.astro`, `races.astro`, `preferences.astro`
- Delete: `src/components/calendar/`
- Delete: `src/data/runs.json`, `src/data/blocks/`, etc.

**Step 1: Create placeholder landing page**

```astro
---
// src/pages/index.astro
---
<html>
  <body>
    <h1>Blockwork</h1>
    <p>Coaching now happens in TrainingPeaks. Open TP to see your workouts.</p>
  </body>
</html>
```

**Step 2: Delete the old pages and data files**

```bash
rm -rf src/pages/dashboard.astro src/pages/calendar.astro src/pages/blocks src/pages/analytics.astro src/pages/races.astro src/pages/preferences.astro
rm -rf src/components/calendar src/data/blocks src/data/runs.json src/data/races.json src/data/detailed-runs.json src/data/weekly-volumes.json src/data/fitness-summary.json src/data/training-load.json src/data/coach-context.json
```

**Step 3: Build + deploy**

```bash
npm run build
git add -A
git commit -m "chore: decommission blockwork UI, coaching lives in TP now"
git push
```

**Step 4: Verify the live site shows the placeholder**

---

## Summary checklist

- [ ] Task 1: Research TP endpoints (SPIKE)
- [ ] Task 2: D1 schema migration
- [ ] Task 3: Vitest setup
- [ ] Task 4: TP auth module
- [ ] Task 5: TP session caching
- [ ] Task 6: TP read workout
- [ ] Task 7: TP write workout
- [ ] Task 8: TP post comment
- [ ] Task 9: TP Bridge smoke test
- [ ] Task 10: Claude session analysis
- [ ] Task 11: Claude weekly + block analysis
- [ ] Task 12: Strava webhook receiver
- [ ] Task 13: Wire webhook → TP → Claude → comment
- [ ] Task 14: Register Strava webhook
- [ ] Task 15: Weekly review cron
- [ ] Task 16: Block-end cron + next block builder
- [ ] Task 17: Deploy and smoke test
- [ ] Task 18: Decommission UI

## Critical risk: Task 1

Task 1 is the linchpin. If TP's anti-bot measures (Cloudflare WAF, device fingerprinting, etc.) block our `fetch` from a Worker, the entire write-side automation fails. In that case, we pivot to:
- Read-only via TP iCal export (unofficial but works)
- Write workouts via manual copy from a generated blockwork page
- Still post Claude analysis to blockwork app, not TP comments

Do not proceed past Task 1 until it's proven working end-to-end with curl.
