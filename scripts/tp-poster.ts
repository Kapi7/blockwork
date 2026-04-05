/**
 * TP Poster — Playwright script that logs into TrainingPeaks using a
 * stored auth cookie, fetches George's pending tasks from the Cloudflare
 * API, and posts them via the TP web UI.
 *
 * Runs on GitHub Actions on a schedule and on Strava-webhook dispatch.
 *
 * ENV:
 *   BLOCKWORK_URL         — e.g. https://blockwork-91h.pages.dev
 *   SYNC_TOKEN            — shared secret for /api/george/tasks
 *   TP_AUTH_COOKIE        — long-lived Production_tpAuth cookie
 *   MODE                  — 'sync' (default: post pending comments) | 'block' (push a new block)
 *   BLOCK_START, BLOCK_NAME, BLOCK_FOCUS — for MODE=block
 */

import { chromium, type Page, type BrowserContext } from 'playwright';

const BLOCKWORK_URL = process.env.BLOCKWORK_URL || 'https://blockwork-91h.pages.dev';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const TP_AUTH_COOKIE = process.env.TP_AUTH_COOKIE || '';
const MODE = process.env.MODE || 'sync';

interface CommentTask {
  type: 'comment';
  workoutId: number;
  workoutDate: string;
  workoutTitle: string;
  reason: string;
  text: string;
}

interface BlockSession {
  date: string;
  title: string;
  workoutType: number;
  description: string;
  distancePlanned?: number;
  totalTimePlanned?: number;
  tssPlanned?: number;
}

function assertEnv() {
  const missing: string[] = [];
  if (!SYNC_TOKEN) missing.push('SYNC_TOKEN');
  if (!TP_AUTH_COOKIE) missing.push('TP_AUTH_COOKIE');
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/** Create a Playwright context with the TP auth cookie pre-loaded. */
async function openTP(): Promise<{ page: Page; context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies([
    {
      name: 'Production_tpAuth',
      value: TP_AUTH_COOKIE,
      domain: '.trainingpeaks.com',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  await page.goto('https://app.trainingpeaks.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Wait for app shell
  await page.waitForSelector('text=Itay Kapiloto', { timeout: 30_000 }).catch(() => {
    console.warn('Did not see athlete name — session may have expired');
  });

  return {
    page,
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

/** Fetch pending tasks from Cloudflare API. */
async function fetchTasks(): Promise<CommentTask[]> {
  const url = `${BLOCKWORK_URL}/api/george/tasks?token=${encodeURIComponent(SYNC_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tasks: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { tasks: CommentTask[]; taskCount: number };
  console.log(`Fetched ${data.taskCount} task(s) from George`);
  return data.tasks || [];
}

/**
 * Post a comment on a specific TP workout via the UI.
 * Navigates to the workout, opens the quickview, types comment, saves.
 */
async function postCommentOnWorkout(page: Page, task: CommentTask): Promise<boolean> {
  try {
    console.log(`  → Posting comment on workout ${task.workoutId} (${task.workoutDate} · ${task.workoutTitle})`);

    // Direct URL to workout via calendar: TP uses #calendar with workout selection
    // The cleanest way: navigate to the calendar for that week and click the workout
    const date = task.workoutDate;

    // TP has an individual workout URL pattern via sharedWorkoutInformationKey, but we don't have it.
    // Instead: navigate to calendar and open the workout by id via the app's internal routing.
    // The app supports deep-linking via #/workout/{id} — try that.
    await page.goto(`https://app.trainingpeaks.com/#calendar/${date}/workout/${task.workoutId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for the workout details panel
    await page.waitForTimeout(3000);

    // Try to find the comment input — it's usually a contenteditable or textarea in the details panel
    // Try several selectors
    const commentSelectors = [
      'textarea[placeholder*="omment" i]',
      'div[contenteditable="true"]',
      'textarea.comment',
      '[data-testid="comment-input"]',
      '[aria-label*="omment" i]',
    ];

    let input;
    for (const sel of commentSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        input = el;
        console.log(`    Found comment input: ${sel}`);
        break;
      }
    }

    if (!input) {
      console.error(`    No comment input found for workout ${task.workoutId} — UI may have changed`);
      // Screenshot for debugging
      await page.screenshot({ path: `/tmp/tp-no-input-${task.workoutId}.png` }).catch(() => {});
      return false;
    }

    await input.click();
    await input.fill(task.text);
    await page.waitForTimeout(500);

    // Find and click the Save/Post button for the comment
    const saveSelectors = [
      'button:has-text("Post")',
      'button:has-text("Save")',
      'button:has-text("Submit")',
      'button[type="submit"]',
    ];

    let saved = false;
    for (const sel of saveSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click();
        saved = true;
        console.log(`    Clicked save: ${sel}`);
        break;
      }
    }

    if (!saved) {
      // Fallback: Ctrl+Enter
      await page.keyboard.press('Control+Enter');
    }

    await page.waitForTimeout(2000);
    console.log(`    ✓ Comment posted`);
    return true;
  } catch (err: any) {
    console.error(`    ✗ Failed: ${err.message}`);
    return false;
  }
}

/** Mode: sync comments. */
async function runSync(page: Page) {
  const tasks = await fetchTasks();
  if (tasks.length === 0) {
    console.log('No tasks — George is up to date.');
    return;
  }

  let success = 0;
  let failed = 0;
  for (const task of tasks) {
    const ok = await postCommentOnWorkout(page, task);
    if (ok) success++;
    else failed++;
  }
  console.log(`\nSummary: ${success} posted, ${failed} failed`);
}

/** Fetch next block's sessions from Cloudflare API. */
async function fetchBlock(): Promise<BlockSession[]> {
  const start = process.env.BLOCK_START || '';
  const name = process.env.BLOCK_NAME || 'Next Block';
  const focus = process.env.BLOCK_FOCUS || 'Continue adaptation';
  const params = new URLSearchParams({ token: SYNC_TOKEN, name, focus });
  if (start) params.set('start', start);

  const res = await fetch(`${BLOCKWORK_URL}/api/george/block?${params}`);
  if (!res.ok) throw new Error(`Block fetch failed: ${res.status}`);
  const data = (await res.json()) as { sessions: BlockSession[]; blockName: string };
  console.log(`Got ${data.sessions.length} sessions for block: ${data.blockName}`);
  return data.sessions;
}

/** Mode: push a block of workouts. For MVP, log what we'd create. UI flow TODO. */
async function runBlock(page: Page) {
  const sessions = await fetchBlock();
  console.log('\nPlanned block sessions:');
  for (const s of sessions) {
    console.log(`  ${s.date} | type ${s.workoutType} | ${s.title}`);
    console.log(`    ${s.description.slice(0, 100).replace(/\n/g, ' ')}`);
  }
  console.log(`\nTotal: ${sessions.length} sessions to create.`);
  console.log('NOTE: UI workout creation is still being wired. Sessions above are what George would push.');
  // TODO: navigate calendar, click day, fill form, save. Iterate.
}

async function main() {
  assertEnv();
  console.log(`TP Poster — mode=${MODE}`);
  const { page, close } = await openTP();
  try {
    if (MODE === 'block') {
      await runBlock(page);
    } else {
      await runSync(page);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('TP Poster failed:', err);
  process.exit(1);
});
