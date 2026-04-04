import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const db = runtime?.env?.DB;
  const secret = runtime?.env?.SESSION_SECRET || 'blockwork-default-secret';
  const anthropicKey = runtime?.env?.ANTHROPIC_API_KEY;
  const user = getSession(request, secret);

  if (!user || user.role !== 'coach') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
  }

  const body = await request.json();
  const { athleteId } = body;

  if (!athleteId || !db) {
    return new Response(JSON.stringify({ error: 'Missing athleteId or DB' }), { status: 400 });
  }

  // Load athlete
  const athlete = await db.prepare('SELECT * FROM athletes WHERE id = ?').bind(athleteId).first();
  if (!athlete) {
    return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
  }

  const pbs = JSON.parse((athlete.pbs as string) || '{}');
  const goals = JSON.parse((athlete.goals as string) || '[]');
  const profile = JSON.parse((athlete.profile as string) || '{}');

  // Count existing blocks
  const blockCount = await db.prepare('SELECT COUNT(*) as cnt FROM blocks WHERE athlete_id = ?').bind(athleteId).first();
  const nextBlockNum = (blockCount?.cnt as number) || 0;

  const today = new Date().toISOString().slice(0, 10);

  // Build prompt for Claude
  const prompt = `You are Coach K, a pragmatic running/cycling coach using 80/20 polarized training with block periodization.

Generate a 2-3 week training block for this athlete:

**Athlete:** ${athlete.name}
**Sport:** ${athlete.sport}
**PBs:** 5K: ${pbs['5k'] || 'N/A'}, 10K: ${pbs['10k'] || 'N/A'}, HM: ${pbs['half'] || 'N/A'}, Marathon: ${pbs['marathon'] || 'N/A'}
**Goal:** ${goals[0]?.goal || 'General fitness'}
**Weekly volume:** ${profile.weeklyVolume || 'unknown'}km
**Experience:** ${profile.experience || 0} years
**Notes:** ${profile.notes || 'None'}
**Block number:** ${nextBlockNum} (${nextBlockNum === 0 ? 'first block - start with base/easy' : 'continuation'})
**Start date:** ${today}

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "name": "Block Name",
  "phase": "recovery|base|speed|taper|race",
  "startDate": "${today}",
  "endDate": "YYYY-MM-DD",
  "stimulus": "What this block develops",
  "goals": ["goal1", "goal2"],
  "successMetrics": [{"metric": "...", "target": "...", "actual": null, "hit": null}],
  "runVolume": "Xkm/week",
  "bikeVolume": "Xhrs/week",
  "sessions": [
    {"date": "YYYY-MM-DD", "type": "easy|key|steady|recovery|threshold|race|rest|bike|yoga|strength", "planned": {"desc": "...", "distance": 0, "pace": "...", "notes": "..."}}
  ]
}

Every day in the block must have a session (including rest days). Include a mix of run, bike, strength, yoga, and rest based on the athlete's sport and goals. Use 80/20 polarization.`;

  // Call Claude API
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    return new Response(JSON.stringify({ error: `Claude API error: ${err}` }), { status: 500 });
  }

  const claudeData = await claudeRes.json();
  const content = claudeData.content?.[0]?.text || '';

  // Parse the JSON response
  let plan;
  try {
    // Find JSON in response (in case Claude adds text around it)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    plan = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to parse AI plan', raw: content }), { status: 500 });
  }

  // Save block to D1
  const blockId = `block-${nextBlockNum}-${plan.phase || 'plan'}`;
  await db.prepare(
    `INSERT INTO blocks (id, athlete_id, name, number, phase, start_date, end_date, stimulus, goals, success_metrics, status, run_volume, bike_volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    blockId, athleteId, plan.name, nextBlockNum, plan.phase,
    plan.startDate, plan.endDate, plan.stimulus,
    JSON.stringify(plan.goals), JSON.stringify(plan.successMetrics),
    'upcoming', plan.runVolume, plan.bikeVolume
  ).run();

  // Save sessions
  if (plan.sessions) {
    for (const s of plan.sessions) {
      await db.prepare(
        `INSERT INTO sessions (block_id, athlete_id, date, type, planned_desc, planned_distance, planned_pace, planned_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        blockId, athleteId, s.date, s.type,
        s.planned?.desc || '', s.planned?.distance || 0,
        s.planned?.pace || '', s.planned?.notes || ''
      ).run();
    }
  }

  return new Response(JSON.stringify({ blockId, plan }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
