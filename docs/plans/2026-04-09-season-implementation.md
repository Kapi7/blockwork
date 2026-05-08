# Season Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite training-plan.ts BLOCKS array to match the approved season design (5 blocks, Mon-Sun pattern, 5K TT Jul 5, 10K TT Jul 26), then push all blocks to TP and clean up orphans.

**Architecture:** Single file rewrite of `functions/api/lib/training-plan.ts`. Add ~8 new structures, rewrite all 5 blocks' session arrays from scratch using the design doc as the source of truth. Then deploy via git push + GitHub Actions workflows.

**Tech Stack:** TypeScript (Cloudflare Pages Functions), TrainingPeaks API, GitHub Actions

---

### Task 1: Add new structures for Block 3 and Block 4

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (STRUCTURES object, lines 349-610)

**Step 1:** Add these 8 new structures before the closing `};` of STRUCTURES (after `tt5k`):

```typescript
// 3km time trial (race simulation) — WU, 3km race effort, CD
tt3k: runStructure([
  singleStep('Warm up + drills', 900, 65, 80, 'warmUp'),
  distStep('3km RACE', 3000, 108, 115, 'active'),
  singleStep('Cool down', 600, 55, 70, 'coolDown'),
]),

// 10km long run with 3km @ 5K pace finish
longRun10km5kFinish: runStructure([
  distStep('Easy', 7000, 70, 76, 'active'),
  distStep('5K pace finish', 3000, 105, 110, 'active'),
]),

// Race-week opener: 4km easy + 2×200m at race pace
raceWeekOpener: runStructure([
  distStep('Easy jog', 4000, 65, 75, 'warmUp'),
  repeatSetDist(2, 200, 107, 112, 200, 50, 60),
]),

// Speed combo: 4×400m @ 78sec + 4×200m @ 37sec
speedCombo400200: runStructure([
  singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
  repeatSetDist(4, 400, 112, 118, 200, 50, 60),
  singleStep('Recovery jog', 180, 55, 65, 'rest'),
  repeatSetDist(4, 200, 115, 125, 200, 45, 55),
  singleStep('Cool down', 600, 65, 75, 'coolDown'),
]),

// 3×2km tempo @ 10K pace (3:45-3:50/km = 90-93% threshold)
tempo3x2km: runStructure([
  singleStep('Warm up', 720, 65, 75, 'warmUp'),
  repeatSetDist(3, 2000, 90, 94, 400, 55, 65),
  singleStep('Cool down', 600, 65, 75, 'coolDown'),
]),

// 4×2km tempo @ 10K race pace (3:36-3:40/km = 93-96% threshold)
tempo4x2km: runStructure([
  singleStep('Warm up', 720, 65, 75, 'warmUp'),
  repeatSetDist(4, 2000, 93, 97, 400, 55, 65),
  singleStep('Cool down', 600, 65, 75, 'coolDown'),
]),

// 14km long run with last 4km @ 10K pace (~3:50/km = 90%)
longRun14km10kFinish: runStructure([
  distStep('Easy', 10000, 70, 76, 'active'),
  distStep('10K pace finish', 4000, 88, 94, 'active'),
]),

// 10K time trial — WU, race, CD
tt10k: runStructure([
  singleStep('Warm up + openers', 900, 65, 85, 'warmUp'),
  distStep('10K RACE', 10000, 93, 100, 'active'),
  singleStep('Cool down', 600, 55, 70, 'coolDown'),
]),
```

**Step 2:** Verify no syntax errors — search for duplicate structure names.

**Step 3:** Commit.

```bash
git add functions/api/lib/training-plan.ts
git commit -m "feat: add 8 new structures for Block 3+4 (race sim, 10K tempo, speed combos)"
```

---

### Task 2: Rewrite Block 0 (no change, just verify)

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (BLOCKS array)

**Step 1:** Verify Block 0 sessions are unchanged. Block 0 stays exactly as-is (9 sessions, Apr 6-13). No edits needed.

**Step 2:** No commit needed.

---

### Task 3: Rewrite Block 1 — Build the Engine (Apr 14 - May 11)

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (BLOCKS array — replace the current bridge-1 AND block-2-base entries with ONE new block)

**Step 1:** Delete the current `bridge-1` block (number 1) and `block-2-base` block (number 2) entirely from the BLOCKS array.

**Step 2:** Insert the new Block 1 with ALL 28 sessions (4 weeks × 7 days) exactly as specified in the design doc. Use these exact dates and structures:

Block metadata:
```typescript
{
  id: 'block-1-base',
  number: 1,
  name: 'Build the Engine',
  phase: 'base',
  startDate: '2026-04-14',
  endDate: '2026-05-11',
  stimulus: 'Rebuild aerobic base. Hills for power. Bike for volume. 3 weeks build + 1 week recovery.',
  goals: [...],
  successMetrics: [...],
  weekPattern: 'Mon easy bike | Tue KEY1 | Wed gym | Thu KEY2/bike | Fri easy bike | Sat long run | Sun long ride',
  restrictions: [...],
  sessions: [
    // Week 1: Apr 14-20 (bridge/intro)
    // Week 2: Apr 21-27 (first KEYs)
    // Week 3: Apr 28 - May 4 (push)
    // Week 4: May 5-11 (recovery + block test)
  ],
}
```

Session dates/titles/structures from design doc (copy exactly):

**Week 1 (Apr 14-20):**
- Apr 14 Mon: Easy bike Z2 (easyBike60)
- Apr 15 Tue: Easy run + strides 7km (easyRunStrides7km)
- Apr 16 Wed: Gym — Strength (no structure)
- Apr 17 Thu: Bike 90s on/off (bikeOnOff90)
- Apr 18 Fri: Easy run 6km (easyRun6km)
- Apr 19 Sat: Easy run + strides 8km (easyRun8km) — NOTE: no structure for 8km+strides, use easyRunStrides9km or easyRun8km
- Apr 20 Sun: Long ride Z2 2hrs (longRide120Bridge)

**Week 2 (Apr 21-27):**
- Apr 21 Mon: Easy bike Z2 (easyBike60)
- Apr 22 Tue: KEY 1 — Hill repeats 6×200m (hillRepeats6x200)
- Apr 23 Wed: Gym — Strength (no structure)
- Apr 24 Thu: KEY 2 — Fartlek (fartlek8x90)
- Apr 25 Fri: Easy bike (easyBike60)
- Apr 26 Sat: Long run 14km negative split (longRun14kmProgressive)
- Apr 27 Sun: Long ride Z2 2.5hrs (longRide150)

**Week 3 (Apr 28 - May 4):**
- Apr 28 Mon: Easy bike Z2 (easyBike60)
- Apr 29 Tue: KEY 1 — Track 6×400m (track6x400)
- Apr 30 Wed: Gym — Strength (no structure)
- May 1 Thu: KEY 2 — Tempo 3×1.5km (tempo3x1500)
- May 2 Fri: Easy bike (easyBike60)
- May 3 Sat: Long run 16km progressive (longRun16kmProgressive)
- May 4 Sun: Long ride + hills 2.75hrs (longRide165Hills)

**Week 4 (May 5-11):**
- May 5 Mon: Easy bike Z1 (easyBike45)
- May 6 Tue: Easy run + strides 7km (easyRunStrides7km)
- May 7 Wed: Gym lighter (no structure)
- May 8 Thu: Bike 90s on/off (bikeOnOff90)
- May 9 Fri: Yoga (no structure)
- May 10 Sat: Long run 18km block test (longRun18kmTest)
- May 11 Sun: Easy recovery ride (recoveryRide60)

**Step 3:** Commit.

```bash
git commit -m "feat: Block 1 — Build the Engine (Apr 14 - May 11, 4 weeks)"
```

---

### Task 4: Rewrite Block 2 — Hunt the 5K (May 12 - Jun 8)

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (BLOCKS array — replace current block-3-speed1)

**Step 1:** Delete the current `block-3-speed1` block entirely.

**Step 2:** Insert new Block 2 with ALL 28 sessions from design doc weeks 5-8.

Block metadata:
```typescript
{
  id: 'block-2-speed',
  number: 2,
  name: 'Hunt the 5K',
  phase: 'speed',
  startDate: '2026-05-12',
  endDate: '2026-06-08',
  ...
}
```

Sessions from design doc weeks 5-8 (May 12 - Jun 8). Every date Mon-Sun, correct structures.

**Step 3:** Commit.

```bash
git commit -m "feat: Block 2 — Hunt the 5K (May 12 - Jun 8, 4 weeks)"
```

---

### Task 5: Rewrite Block 3 — Sharpen the Blade (Jun 9 - Jul 6)

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (BLOCKS array — replace current block-4-speed2)

**Step 1:** Delete the current `block-4-speed2` block entirely.

**Step 2:** Insert new Block 3 with ALL 28 sessions from design doc weeks 9-12. Uses new structures: tt3k, longRun10km5kFinish, raceWeekOpener, speedCombo400200, tt5k.

Block metadata:
```typescript
{
  id: 'block-3-sharpen',
  number: 3,
  name: 'Sharpen the Blade',
  phase: 'speed',
  startDate: '2026-06-09',
  endDate: '2026-07-06',
  ...
}
```

**Step 3:** Commit.

```bash
git commit -m "feat: Block 3 — Sharpen the Blade + 5K TT Jul 5 (Jun 9 - Jul 6)"
```

---

### Task 6: Add Block 4 — 10K Campaign (Jul 7 - Jul 26)

**Files:**
- Modify: `functions/api/lib/training-plan.ts` (BLOCKS array — add new block at end)

**Step 1:** Add Block 4 with all sessions from design doc weeks 13-15. Uses new structures: tempo3x2km, tempo4x2km, longRun14km10kFinish, tt10k.

Block metadata:
```typescript
{
  id: 'block-4-10k',
  number: 4,
  name: '10K Campaign',
  phase: 'speed',
  startDate: '2026-07-07',
  endDate: '2026-07-26',
  ...
}
```

**Note:** Week 15 only has 6 days (Jul 21-26, Mon-Sat). No Sunday session after the 10K TT.

**Step 2:** Commit.

```bash
git commit -m "feat: Block 4 — 10K Campaign + 10K TT Jul 26 (Jul 7-26)"
```

---

### Task 7: Validate all dates and session counts

**Step 1:** Run a validation script to check:
- Every block's sessions fall within startDate-endDate
- No duplicate dates within a block (except intentional AM/PM)
- Every session has the correct day-of-week (Mon=KEY bike/rest, Tue=KEY1 run, etc.)
- Session count per block: Block 0=9, Block 1=28, Block 2=28, Block 3=28, Block 4≈20
- All referenced structure names exist in STRUCTURES
- No orphaned blocks in the array

**Step 2:** Fix any issues found.

**Step 3:** Commit fixes if any.

---

### Task 8: Push to git and deploy

**Step 1:** Push all commits.

```bash
git push
```

**Step 2:** Wait 60 seconds for Cloudflare Pages deploy.

---

### Task 9: Clean up ALL old workouts in TP (Apr 14 onwards)

**Step 1:** Run cleanup to delete ALL planned workouts from Apr 14 to Jul 31 (nuke everything, we'll recreate from scratch):

```bash
gh workflow run george-cleanup.yml -f from=2026-04-14 -f to=2026-07-31 -f limit=30
```

Repeat until deletedCount=0 (may need 3-4 runs).

**Step 2:** Verify TP calendar is clean (only completed workouts remain).

---

### Task 10: Push all blocks to TP

**Step 1:** Push each block using update-plan with appropriate chunking:

```bash
# Block 1 (28 sessions, needs 2 chunks)
gh workflow run george-update.yml -f block=1 -f limit=20 -f offset=0
gh workflow run george-update.yml -f block=1 -f limit=20 -f offset=20

# Block 2 (28 sessions, needs 2 chunks)
gh workflow run george-update.yml -f block=2 -f limit=20 -f offset=0
gh workflow run george-update.yml -f block=2 -f limit=20 -f offset=20

# Block 3 (28 sessions, needs 2 chunks)
gh workflow run george-update.yml -f block=3 -f limit=20 -f offset=0
gh workflow run george-update.yml -f block=3 -f limit=20 -f offset=20

# Block 4 (~20 sessions, 1 chunk)
gh workflow run george-update.yml -f block=4 -f limit=20 -f offset=0
```

**Step 2:** Verify each run shows 0 errors.

**Step 3:** Check TP calendar visually — every week should show exactly 7 sessions (Mon-Sun), correct pattern.

---

### Task 11: Final validation in TP

**Step 1:** Spot-check 3 weeks in TP:
- Week 2 (Apr 21-27): Should show Mon bike, Tue hill repeats, Wed gym, Thu fartlek, Fri bike, Sat 14km, Sun long ride
- Week 5 (May 12-18): Should show Mon bike, Tue 5×1km, Wed gym, Thu tempo+sharpeners, Fri bike, Sat 14km tempo finish, Sun long ride
- Week 12 (Jun 30 - Jul 6): Should show Mon rest, Tue strides, Wed yoga, Thu opener, Fri rest, Sat 5K TT, Sun recovery ride

**Step 2:** Commit design doc update if any final tweaks were made.
