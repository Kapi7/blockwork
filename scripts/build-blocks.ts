/**
 * Reads athlete preferences from D1 API and generates training blocks.
 * Run weekly or on-demand to rebuild blocks based on current preferences + fitness.
 *
 * Usage: BLOCKWORK_URL=https://blockwork-91h.pages.dev npx tsx scripts/build-blocks.ts
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BLOCKWORK_URL || 'https://blockwork-91h.pages.dev';
const ATHLETE_EMAIL = process.env.ATHLETE_EMAIL || 'kapoosha@gmail.com';
const BLOCKS_DIR = path.join(process.cwd(), 'src', 'data', 'blocks');

interface Preferences {
  schedule: string[]; // Mon-Sun: easy, key, long_run, long_ride, bike, strength, yoga, rest, flexible
  run_hours: number;
  bike_hours: number;
  max_long_run: number;
  max_long_ride: number;
  short_goal: string;
  long_goal: string;
  target_race: string;
  notes: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SESSION_TEMPLATES: Record<string, (weekNum: number, prefs: Preferences) => any> = {
  easy: (w, p) => ({
    type: 'easy',
    planned: {
      desc: w === 0 ? 'Easy run' : `Easy run${w > 1 ? ' + strides' : ''}`,
      distance: Math.min(6 + w, 10),
      pace: '5:10-5:20/km',
      notes: w > 1 ? '+ 4-6x100m strides' : '',
    },
  }),
  key: (w, p) => {
    const workouts = [
      { desc: 'Hill sprints', distance: 10, pace: 'Easy + 8x10sec hills', notes: '2km WU + 8x10sec steep hill sprints (walk back) + CD' },
      { desc: 'Tempo intervals', distance: 12, pace: '4:15-4:25 work', notes: '2km WU + 3x1km @ 4:15-4:25 (2min jog) + 3km CD' },
      { desc: 'Fartlek', distance: 10, pace: 'Mixed', notes: '2km WU + 8x(90sec hard/90sec easy) + 2km CD' },
      { desc: 'Threshold', distance: 12, pace: '3:55-4:05 work', notes: '2km WU + 2x2km @ threshold (3min jog) + CD' },
      { desc: '5K pace reps', distance: 10, pace: '3:30-3:40 work', notes: '2km WU + 5x1km @ 5K pace (2min jog) + CD' },
      { desc: 'Progression run', distance: 12, pace: '5:00 → 4:10', notes: 'Start easy, drop 15sec/km every 3km' },
    ];
    const idx = w % workouts.length;
    return { type: 'key', planned: workouts[idx] };
  },
  long_run: (w, p) => ({
    type: 'steady',
    planned: {
      desc: 'Long run',
      distance: Math.min(14 + w * 2, p.max_long_run),
      pace: '4:50-5:05/km',
      notes: w > 1 ? 'Last 3km push to 4:40' : 'Keep it relaxed. Negative split.',
    },
  }),
  long_ride: (w, p) => ({
    type: 'bike',
    planned: {
      desc: 'Long ride',
      distance: 0,
      pace: `${Math.min(2 + w * 0.25, p.max_long_ride)}hrs Z2`,
      notes: w > 1 ? 'Can push Z3 last 30min' : 'Steady. Enjoy it.',
    },
  }),
  bike: (w, p) => ({
    type: 'bike',
    planned: {
      desc: 'Easy ride',
      distance: 0,
      pace: '60-75min Z2',
      notes: '',
    },
  }),
  strength: (w, p) => ({
    type: 'strength',
    planned: {
      desc: 'Strength',
      distance: 0,
      pace: '45min',
      notes: w % 2 === 0 ? 'Lower body: squats, lunges, deadlifts, core' : 'Upper body + core focus',
    },
  }),
  yoga: (w, p) => ({
    type: 'yoga',
    planned: {
      desc: 'Yoga / Mobility',
      distance: 0,
      pace: '30-40min',
      notes: 'Hips, hamstrings, calves',
    },
  }),
  rest: (w, p) => ({
    type: 'rest',
    planned: {
      desc: 'Rest',
      distance: 0,
      pace: '',
      notes: 'Full rest. Recovery ride OK if legs feel good.',
    },
  }),
  flexible: (w, p) => ({
    type: 'recovery',
    planned: {
      desc: 'Recovery / Flexible',
      distance: 5,
      pace: '5:30+/km',
      notes: 'Easy run, recovery ride, yoga — whatever feels right.',
    },
  }),
};

async function main() {
  // Fetch preferences
  console.log(`Fetching preferences for ${ATHLETE_EMAIL}...`);
  const res = await fetch(`${BASE_URL}/api/preferences?email=${encodeURIComponent(ATHLETE_EMAIL)}`);
  const data = await res.json() as any;

  if (!data.preferences) {
    console.error('No preferences found. Save preferences in the app first.');
    process.exit(1);
  }

  const prefs: Preferences = data.preferences;
  console.log('Schedule:', prefs.schedule.map((s, i) => `${DAY_NAMES[i]}=${s}`).join(', '));
  console.log(`Goals: short=${prefs.short_goal}, long=${prefs.long_goal}`);
  console.log(`Availability: ${prefs.run_hours}hrs run, ${prefs.bike_hours}hrs bike`);
  console.log(`Notes: ${prefs.notes}`);

  // Generate base block
  const today = new Date();
  // Start next Monday
  const daysUntilMon = (8 - today.getDay()) % 7 || 7;
  const blockStart = new Date(today);
  blockStart.setDate(today.getDate() + daysUntilMon);

  const BLOCK_WEEKS = 3;
  const sessions: any[] = [];

  for (let week = 0; week < BLOCK_WEEKS; week++) {
    for (let day = 0; day < 7; day++) {
      const sessionDate = new Date(blockStart);
      sessionDate.setDate(blockStart.getDate() + week * 7 + day);
      const dateStr = sessionDate.toISOString().slice(0, 10);
      const sessionType = prefs.schedule[day] || 'rest';

      const template = SESSION_TEMPLATES[sessionType] || SESSION_TEMPLATES.rest;
      const session = template(week, prefs);

      sessions.push({
        date: dateStr,
        ...session,
      });
    }
  }

  const endDate = new Date(blockStart);
  endDate.setDate(blockStart.getDate() + BLOCK_WEEKS * 7 - 1);

  const block = {
    id: `block-generated-${blockStart.toISOString().slice(0, 10)}`,
    name: 'Speed Development',
    number: 2,
    phase: 'speed',
    startDate: blockStart.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    stimulus: `Speed block targeting ${prefs.short_goal} 5K. ${prefs.notes ? 'Note: ' + prefs.notes : ''}`,
    goals: [
      `Target: ${prefs.short_goal} (5K)`,
      `Long-term: ${prefs.long_goal} (10K)`,
      `2 key workouts/week (${DAY_NAMES[prefs.schedule.indexOf('key')]} + ${DAY_NAMES[prefs.schedule.lastIndexOf('key')]})`,
      `Long run ${DAY_NAMES[prefs.schedule.indexOf('long_run')]}, Long ride ${DAY_NAMES[prefs.schedule.indexOf('long_ride')]}`,
      `${prefs.run_hours}hrs running + ${prefs.bike_hours}hrs cycling per week`,
    ],
    successMetrics: [
      { metric: '5K pace reps', target: `1km @ 3:28-3:32 with HR < 178`, actual: null, hit: null },
      { metric: 'Weekly volume', target: `${Math.round(prefs.run_hours * 10)}+ km`, actual: null, hit: null },
      { metric: 'Long run build', target: `Up to ${prefs.max_long_run}km`, actual: null, hit: null },
      { metric: 'Tempo comfort', target: `4:15-4:25/km feels controlled`, actual: null, hit: null },
    ],
    sessions,
    status: 'upcoming',
    summary: null,
    runVolume: `~${Math.round(prefs.run_hours * 10)}km/week`,
    bikeVolume: `${prefs.bike_hours}hrs/week`,
  };

  const filename = `block-2-speed.json`;
  fs.writeFileSync(path.join(BLOCKS_DIR, filename), JSON.stringify(block, null, 2));
  console.log(`\nGenerated: ${filename}`);
  console.log(`  ${block.startDate} to ${block.endDate} (${BLOCK_WEEKS} weeks)`);
  console.log(`  ${sessions.length} sessions`);
  console.log(`  Goals: ${block.goals.join(', ')}`);
}

main().catch(console.error);
