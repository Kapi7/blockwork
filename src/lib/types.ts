export interface Run {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date_local: string;
  average_heartrate: number;
  max_heartrate: number;
  average_speed: number;
  suffer_score: number;
}

export interface SlimRun {
  id: number;
  name: string;
  dist: number; // km
  time: number; // seconds
  date: string; // YYYY-MM-DD
  pace: number; // seconds per km
  hr: number;
  maxHr: number;
  elev: number;
  type: string; // 'Run' | 'Ride' | 'VirtualRide'
}

export interface MatchedDay {
  date: string;
  session: Session | null;
  activities: SlimRun[];
  blockId: string | null;
  blockName: string | null;
  phase: string | null;
}

export interface WeeklyVolume {
  week: string; // YYYY-Www
  km: number;
  runs: number;
  avgPace: number;
  avgHr: number;
  longRun: number;
}

export interface Race {
  date: string;
  name: string;
  distance: number;
  time: number;
  pace: number;
  hr: number;
  maxHr: number;
  category: 'marathon' | 'half' | '10k' | '5k' | 'other';
}

export interface FitnessSummary {
  volume7d: number;
  volume28d: number;
  runs7d: number;
  runs28d: number;
  avgPace28d: number;
  avgHr28d: number;
  lastRun: string;
  lastUpdated: string;
}

export interface PlannedSession {
  desc: string;
  distance: number;
  pace: string;
  notes: string;
}

export interface SessionFeedback {
  date: string;
  rpe: number;
  feeling: 'great' | 'good' | 'ok' | 'tired' | 'bad';
  notes: string;
  timestamp: string;
}

export interface Session {
  date: string;
  type: 'key' | 'easy' | 'steady' | 'recovery' | 'threshold' | 'race' | 'rest' | 'bike';
  planned: PlannedSession;
  actual?: SlimRun | null;
  feedback?: SessionFeedback | null;
}

export interface SuccessMetric {
  metric: string;
  target: string;
  actual: string | null;
  hit: boolean | null;
}

export interface Block {
  id: string;
  name: string;
  number: number;
  phase: 'recovery' | 'base' | 'speed' | 'taper' | 'race';
  startDate: string;
  endDate: string;
  stimulus: string;
  goals: string[];
  successMetrics: SuccessMetric[];
  sessions: Session[];
  status: 'active' | 'completed' | 'upcoming';
  summary: string | null;
  runVolume: string;
  bikeVolume: string;
}

export interface Meta {
  currentPhase: string;
  currentBlockId: string;
  athleteName: string;
  goals: { priority: number; goal: string; target: string; timeline: string }[];
  targetRaces: { date: string; race: string; goal: string; role: string }[];
  lastUpdated: string;
}

export const TYPE_COLORS: Record<string, string> = {
  key: '#ff4757',
  threshold: '#ff6348',
  steady: '#ffa502',
  easy: '#2ed573',
  recovery: '#70a1ff',
  race: '#eccc68',
  rest: '#747d8c',
  bike: '#45aaf2',
};

export const PHASE_COLORS: Record<string, string> = {
  recovery: '#70a1ff',
  base: '#2ed573',
  speed: '#ff4757',
  taper: '#ffa502',
  race: '#eccc68',
};
