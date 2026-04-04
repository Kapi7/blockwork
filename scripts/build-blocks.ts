/**
 * Coach K Block Builder
 *
 * Reads athlete preferences + fitness data, then builds an intelligent
 * 3-week training block. Preferences set the FRAMEWORK (available days,
 * constraints). The coach makes the decisions (what goes where, intensity
 * progression, recovery timing).
 *
 * Principles:
 * - 80/20: ~80% easy/moderate, ~20% hard
 * - Don't stack hard days back-to-back
 * - Pre-load easy day before long run
 * - Bike sessions vary: easy spin, Z2 endurance, threshold intervals
 * - Progressive overload across 3 weeks (build-build-recover)
 * - Strength supports running, doesn't drain for key sessions
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BLOCKWORK_URL || 'https://blockwork-91h.pages.dev';
const ATHLETE_EMAIL = process.env.ATHLETE_EMAIL || 'kapoosha@gmail.com';
const BLOCKS_DIR = path.join(process.cwd(), 'src', 'data', 'blocks');

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Preferences {
  schedule: string[];
  run_hours: number;
  bike_hours: number;
  max_long_run: number;
  max_long_ride: number;
  short_goal: string;
  long_goal: string;
  target_race: string;
  notes: string;
}

interface Session {
  date: string;
  type: string;
  planned: { desc: string; distance: number; pace: string; notes: string };
}

/**
 * The coach brain — builds a week of training given:
 * - preferences (the athlete's framework)
 * - weekNum (0=build, 1=build+, 2=absorb)
 * - weekContext (what happened last week, fatigue signals)
 */
function buildWeek(
  startDate: Date,
  prefs: Preferences,
  weekNum: number,
  blockPhase: string,
): Session[] {
  const sessions: Session[] = [];
  const isRecoveryWeek = weekNum === 2; // Week 3 is always absorb/deload
  const intensity = isRecoveryWeek ? 0.7 : 1 + weekNum * 0.1; // Progressive weeks 1-2, back off week 3

  // Key workout library — rotates through the block
  const keyWorkouts = getKeyWorkouts(blockPhase, prefs);
  let keyIdx = weekNum * 2; // 2 key workouts per week, offset by week

  for (let day = 0; day < 7; day++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + day);
    const dateStr = date.toISOString().slice(0, 10);
    const dayType = prefs.schedule[day] || 'rest';
    const dayName = DAY_NAMES[day];

    // Look at what's TOMORROW to decide today
    const tomorrowType = prefs.schedule[(day + 1) % 7] || 'rest';
    // Look at YESTERDAY
    const yesterdayType = day > 0 ? prefs.schedule[day - 1] : prefs.schedule[6];

    let session: Session;

    switch (dayType) {
      case 'key': {
        const workout = keyWorkouts[keyIdx % keyWorkouts.length];
        keyIdx++;
        if (isRecoveryWeek) {
          // Recovery week: key sessions become moderate
          session = {
            date: dateStr,
            type: 'steady',
            planned: {
              desc: 'Moderate run',
              distance: Math.round(workout.distance * 0.7),
              pace: '4:40-4:50/km',
              notes: `Recovery week — reduced from ${workout.desc}. Keep it comfortable.`,
            },
          };
        } else {
          session = {
            date: dateStr,
            type: 'key',
            planned: {
              desc: workout.desc,
              distance: workout.distance,
              pace: workout.pace,
              notes: workout.notes,
            },
          };
        }
        break;
      }

      case 'long_run': {
        const baseDist = Math.min(14 + weekNum * 2, prefs.max_long_run);
        const dist = isRecoveryWeek ? Math.round(baseDist * 0.65) : baseDist;
        session = {
          date: dateStr,
          type: 'steady',
          planned: {
            desc: isRecoveryWeek ? 'Easy long run' : 'Long run',
            distance: dist,
            pace: isRecoveryWeek ? '5:00-5:10/km' : '4:50-5:00/km',
            notes: isRecoveryWeek
              ? 'Recovery week. Keep it truly easy.'
              : weekNum > 0
                ? `Last 3km push to 4:40. Build endurance.`
                : 'First long run of block. Relaxed and steady.',
          },
        };
        break;
      }

      case 'long_ride': {
        // Not every "long ride" day is actually a long ride!
        // Coach decides based on context
        const rideSession = decideBikeSession(day, weekNum, isRecoveryWeek, prefs, tomorrowType, yesterdayType);
        session = { date: dateStr, ...rideSession };
        break;
      }

      case 'bike': {
        const rideSession = decideBikeSession(day, weekNum, isRecoveryWeek, prefs, tomorrowType, yesterdayType);
        session = { date: dateStr, ...rideSession };
        break;
      }

      case 'easy': {
        const dist = isRecoveryWeek ? 5 : Math.min(6 + weekNum, 10);
        // Day before long run = easy. Day after key = easy + possible strides
        const afterKey = yesterdayType === 'key';
        const beforeLong = tomorrowType === 'long_run' || tomorrowType === 'long_ride';
        const addStrides = !beforeLong && !isRecoveryWeek && weekNum > 0;

        session = {
          date: dateStr,
          type: 'easy',
          planned: {
            desc: addStrides ? 'Easy run + strides' : 'Easy run',
            distance: beforeLong ? Math.max(dist - 2, 5) : dist,
            pace: '5:10-5:20/km',
            notes: beforeLong
              ? 'Pre-long session. Keep short and easy.'
              : addStrides
                ? '+ 4-6x100m strides. Relaxed speed.'
                : afterKey ? 'Recovery from key session.' : '',
          },
        };
        break;
      }

      case 'strength': {
        const isLower = day < 3; // Early week = lower body, late week = upper
        session = {
          date: dateStr,
          type: 'strength',
          planned: {
            desc: isRecoveryWeek ? 'Light strength' : 'Strength',
            distance: 0,
            pace: isRecoveryWeek ? '30min' : '45min',
            notes: isRecoveryWeek
              ? 'Bodyweight only. Mobility focus.'
              : isLower
                ? 'Squats, lunges, single-leg deadlifts, core. Build running strength.'
                : 'Upper body, core, hip stability. Support posture for long runs.',
          },
        };
        break;
      }

      case 'yoga': {
        session = {
          date: dateStr,
          type: 'yoga',
          planned: {
            desc: 'Yoga / Mobility',
            distance: 0,
            pace: '30-40min',
            notes: 'Hips, hamstrings, calves. Active recovery.',
          },
        };
        break;
      }

      case 'rest': {
        session = {
          date: dateStr,
          type: 'rest',
          planned: {
            desc: 'Rest',
            distance: 0,
            pace: '',
            notes: 'Full rest. Add a recovery spin if legs feel good.',
          },
        };
        break;
      }

      case 'flexible': {
        session = {
          date: dateStr,
          type: 'recovery',
          planned: {
            desc: 'Flexible',
            distance: 5,
            pace: '5:30+/km',
            notes: 'Easy run, recovery ride, yoga — whatever your body needs today.',
          },
        };
        break;
      }

      default: {
        session = {
          date: dateStr,
          type: 'rest',
          planned: { desc: 'Rest', distance: 0, pace: '', notes: '' },
        };
      }
    }

    sessions.push(session);
  }

  return sessions;
}

/**
 * Decide what bike session to do — the coach doesn't just repeat "long ride".
 * Considers: what's around it, what week we're in, recovery needs.
 */
function decideBikeSession(
  dayIdx: number,
  weekNum: number,
  isRecovery: boolean,
  prefs: Preferences,
  tomorrowType: string,
  yesterdayType: string,
): { type: string; planned: { desc: string; distance: number; pace: string; notes: string } } {
  const beforeLongRun = tomorrowType === 'long_run';
  const afterKey = yesterdayType === 'key';
  const isWeekend = dayIdx >= 4; // Fri-Sun

  if (isRecovery) {
    return {
      type: 'bike',
      planned: {
        desc: 'Easy recovery ride',
        distance: 0,
        pace: '60min Z1-Z2',
        notes: 'Recovery week. Spin the legs. No pushing.',
      },
    };
  }

  if (beforeLongRun) {
    // Day before long run = easy spin to stay loose
    return {
      type: 'bike',
      planned: {
        desc: 'Pre-run easy spin',
        distance: 0,
        pace: '45-60min Z1-Z2',
        notes: 'Easy legs. Save energy for tomorrow\'s long run.',
      },
    };
  }

  if (afterKey) {
    // After a key workout = recovery ride
    return {
      type: 'bike',
      planned: {
        desc: 'Recovery ride',
        distance: 0,
        pace: '60min Z1',
        notes: 'Active recovery. Flush the legs from yesterday.',
      },
    };
  }

  if (isWeekend && !beforeLongRun) {
    // Weekend ride (not before long run) = endurance ride
    const hours = Math.min(2 + weekNum * 0.25, prefs.max_long_ride);
    // Alternate between steady Z2 and adding Z3 efforts
    if (weekNum % 2 === 0) {
      return {
        type: 'bike',
        planned: {
          desc: 'Endurance ride',
          distance: 0,
          pace: `${hours}hrs Z2`,
          notes: 'Steady aerobic. Keep HR in Z2. Build bike fitness.',
        },
      };
    } else {
      return {
        type: 'bike',
        planned: {
          desc: 'Endurance ride + efforts',
          distance: 0,
          pace: `${hours}hrs Z2 with Z3 surges`,
          notes: `${hours - 0.5}hrs Z2, last 30min include 4x3min Z3 efforts.`,
        },
      };
    }
  }

  // Midweek ride = moderate, 60-75min
  if (weekNum > 0 && dayIdx >= 2 && dayIdx <= 4) {
    // Alternate: some weeks do bike intervals
    return {
      type: 'bike',
      planned: {
        desc: weekNum === 1 ? 'Bike tempo intervals' : 'Moderate ride',
        distance: 0,
        pace: weekNum === 1 ? '75min with 4x5min Z4' : '60-75min Z2',
        notes: weekNum === 1
          ? 'WU 15min, 4x5min Z4 (3min easy between), CD. Build bike power.'
          : 'Steady aerobic effort.',
      },
    };
  }

  // Default: easy ride
  return {
    type: 'bike',
    planned: {
      desc: 'Easy ride',
      distance: 0,
      pace: '60min Z2',
      notes: '',
    },
  };
}

/**
 * Key workout library — specific to training phase and athlete goals.
 */
function getKeyWorkouts(phase: string, prefs: Preferences) {
  // For speed phase (targeting 5K sub 17:30 = ~3:30/km)
  if (phase === 'speed') {
    return [
      // Week 1
      { desc: 'Hill repeats', distance: 10, pace: 'Easy + 8x10sec hills', notes: '2km WU + 8x10sec steep uphill sprints (walk back recovery) + 4km CD. Builds power.' },
      { desc: 'Tempo cruise', distance: 12, pace: '4:15-4:25 work', notes: '2km WU + 3x1.5km @ 4:15-4:25 (90sec jog) + 2km CD. Find the rhythm.' },
      // Week 2
      { desc: '5K pace reps', distance: 10, pace: '3:28-3:35 work', notes: '2km WU + 5x1km @ 3:28-3:35 (2min jog) + 2km CD. Target race pace.' },
      { desc: 'Progression run', distance: 12, pace: '5:00 → 4:00', notes: 'Start at 5:00/km, drop 15sec/km every 2km. Finish hard.' },
      // Week 3 (absorb — replaced with moderate in buildWeek)
      { desc: 'Threshold blocks', distance: 12, pace: '3:55-4:05 work', notes: '2km WU + 2x2km @ threshold (3min jog) + 2km CD.' },
      { desc: 'Speed endurance', distance: 10, pace: '3:25-3:30 work', notes: '2km WU + 3x1.2km @ 5K pace (2.5min jog) + 2km CD.' },
    ];
  }

  // Base phase
  return [
    { desc: 'Hill sprints', distance: 10, pace: 'Easy + 8x10sec hills', notes: 'Neuromuscular activation. Walk back recovery.' },
    { desc: 'Tempo intro', distance: 11, pace: '4:25-4:35 work', notes: '2km WU + 3x1km @ 4:25-4:35 (2min jog) + 3km CD.' },
    { desc: 'Fartlek', distance: 10, pace: 'Mixed', notes: '2km WU + 8x(90sec hard/90sec easy) + 2km CD.' },
    { desc: 'Progression', distance: 10, pace: '5:10 → 4:20', notes: 'Ease into it. Last 2km should feel like tempo.' },
  ];
}

async function main() {
  console.log(`Fetching preferences for ${ATHLETE_EMAIL}...`);
  const res = await fetch(`${BASE_URL}/api/preferences?email=${encodeURIComponent(ATHLETE_EMAIL)}`);
  const data = await res.json() as any;

  if (!data.preferences) {
    console.error('No preferences found.');
    process.exit(1);
  }

  const prefs: Preferences = data.preferences;
  console.log('Schedule:', prefs.schedule.map((s, i) => `${DAY_NAMES[i]}=${s}`).join(', '));
  console.log(`Goals: ${prefs.short_goal} (5K), ${prefs.long_goal} (10K)`);
  console.log(`Hours: ${prefs.run_hours}hrs run, ${prefs.bike_hours}hrs bike`);
  if (prefs.notes) console.log(`Notes: ${prefs.notes}`);

  // Start next Monday
  const today = new Date();
  const daysUntilMon = (8 - today.getDay()) % 7 || 7;
  const blockStart = new Date(today);
  blockStart.setDate(today.getDate() + daysUntilMon);

  const BLOCK_WEEKS = 3;
  const blockPhase = 'speed'; // Current phase

  // Build 3 weeks: build → build+ → absorb
  const sessions: Session[] = [];
  for (let week = 0; week < BLOCK_WEEKS; week++) {
    const weekStart = new Date(blockStart);
    weekStart.setDate(blockStart.getDate() + week * 7);

    const weekLabel = week === 0 ? 'Build' : week === 1 ? 'Build+' : 'Absorb';
    console.log(`\nWeek ${week + 1} (${weekLabel}):`);

    const weekSessions = buildWeek(weekStart, prefs, week, blockPhase);
    for (const s of weekSessions) {
      console.log(`  ${s.date} ${DAY_NAMES[new Date(s.date + 'T00:00:00').getDay() === 0 ? 6 : new Date(s.date + 'T00:00:00').getDay() - 1]} | ${s.type.padEnd(8)} | ${s.planned.desc}`);
    }
    sessions.push(...weekSessions);
  }

  const endDate = new Date(blockStart);
  endDate.setDate(blockStart.getDate() + BLOCK_WEEKS * 7 - 1);

  const keyDays = prefs.schedule.map((s, i) => s === 'key' ? DAY_NAMES[i] : null).filter(Boolean);
  const longRunDay = DAY_NAMES[prefs.schedule.indexOf('long_run')] || 'N/A';

  const block = {
    id: `block-2-speed`,
    name: 'Speed Development',
    number: 2,
    phase: blockPhase,
    startDate: blockStart.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    stimulus: `5K speed block targeting ${prefs.short_goal}. Key workouts ${keyDays.join('+')}. Long run ${longRunDay}. ${prefs.notes ? 'Athlete note: ' + prefs.notes : ''}`,
    goals: [
      `5K target: ${prefs.short_goal}`,
      `10K target: ${prefs.long_goal}`,
      `Build long run to ${prefs.max_long_run}km`,
      `Week pattern: Build → Build+ → Absorb`,
      `Strength focus per athlete request`,
    ],
    successMetrics: [
      { metric: '5K pace reps', target: '1km @ 3:28-3:35 controlled', actual: null, hit: null },
      { metric: 'Long run', target: `Build to ${prefs.max_long_run}km`, actual: null, hit: null },
      { metric: 'Tempo', target: '4:15-4:25/km feels smooth', actual: null, hit: null },
      { metric: 'Recovery', target: 'Week 3 absorb feels restorative', actual: null, hit: null },
    ],
    sessions,
    status: 'upcoming',
    summary: null,
    runVolume: `~${Math.round(prefs.run_hours * 9)}km/week`,
    bikeVolume: `${prefs.bike_hours}hrs/week`,
  };

  fs.writeFileSync(path.join(BLOCKS_DIR, 'block-2-speed.json'), JSON.stringify(block, null, 2));
  console.log(`\nWritten block-2-speed.json: ${block.startDate} to ${block.endDate}`);
}

main().catch(console.error);
