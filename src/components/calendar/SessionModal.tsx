import { useState, useEffect } from 'react';
import type { MatchedDay, SlimRun } from '../../lib/types';

const TYPE_COLORS: Record<string, string> = {
  key: '#ff4757', threshold: '#ff6348', steady: '#ffa502', easy: '#2ed573',
  recovery: '#70a1ff', race: '#eccc68', rest: '#747d8c', bike: '#45aaf2',
  yoga: '#a55eea', strength: '#ff6348',
};

const SPORT_ICONS: Record<string, string> = {
  run: '\u{1F3C3}', bike: '\u{1F6B4}', swim: '\u{1F3CA}',
  yoga: '\u{1F9D8}', strength: '\u{1F4AA}', hike: '\u26F0\uFE0F', other: '\u2B50',
};

function fmt(sec: number): string {
  if (!sec || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

interface FeedbackData {
  date: string;
  rpe: number;
  feeling: string;
  notes: string;
  timestamp: string;
}

function loadFeedback(date: string): FeedbackData | null {
  try {
    const all = JSON.parse(localStorage.getItem('blockwork_feedback') || '[]');
    return all.find((f: FeedbackData) => f.date === date) || null;
  } catch { return null; }
}

function saveFeedbackToStorage(fb: FeedbackData) {
  try {
    const all = JSON.parse(localStorage.getItem('blockwork_feedback') || '[]');
    const idx = all.findIndex((f: FeedbackData) => f.date === fb.date);
    if (idx >= 0) all[idx] = fb; else all.push(fb);
    all.sort((a: FeedbackData, b: FeedbackData) => b.date.localeCompare(a.date));
    localStorage.setItem('blockwork_feedback', JSON.stringify(all));
  } catch {}
}

interface Props {
  day: MatchedDay;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function SessionModal({ day, onClose, onPrev, onNext }: Props) {
  const session = day.session;
  const typeColor = session ? TYPE_COLORS[session.type] || '#747d8c' : '#747d8c';
  const matched = session?.actual;
  const allActivities = day.activities;

  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [rpe, setRpe] = useState(5);
  const [feeling, setFeeling] = useState('ok');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fb = loadFeedback(day.date);
    if (fb) {
      setFeedback(fb);
      setRpe(fb.rpe);
      setFeeling(fb.feeling);
      setNotes(fb.notes);
    } else {
      setFeedback(null);
      setRpe(5);
      setFeeling('ok');
      setNotes('');
    }
    setSaved(false);
  }, [day.date]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  const handleSaveFeedback = () => {
    const fb: FeedbackData = { date: day.date, rpe, feeling, notes, timestamp: new Date().toISOString() };
    saveFeedbackToStorage(fb);
    setFeedback(fb);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const rpeColor = (v: number) => v <= 3 ? '#2ed573' : v <= 5 ? '#7bed9f' : v <= 7 ? '#ffa502' : v <= 8 ? '#ff6348' : '#ff4757';
  const feelColors: Record<string, string> = { great: '#2ed573', good: '#7bed9f', ok: '#ffa502', tired: '#ff6348', bad: '#ff4757' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg h-full bg-[#0f0f17] border-l border-[rgba(255,255,255,0.06)] overflow-y-auto animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0f0f17]/95 backdrop-blur-sm border-b border-[rgba(255,255,255,0.06)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onPrev} className="p-1 text-[#8899aa] hover:text-[#e8e8f0] transition-colors">{'\u2190'}</button>
              <button onClick={onNext} className="p-1 text-[#8899aa] hover:text-[#e8e8f0] transition-colors">{'\u2192'}</button>
            </div>
            <button onClick={onClose} className="p-1 text-[#8899aa] hover:text-[#e8e8f0] transition-colors text-lg">{'\u2715'}</button>
          </div>
          <h2 className="text-lg font-bold mt-2">{fmtDate(day.date)}</h2>
          {session && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full" style={{ background: typeColor }} />
              <span className="text-sm font-medium" style={{ color: typeColor }}>{session.type}</span>
              {day.blockName && <span className="text-xs text-[#556677]">{'\u00B7'} {day.blockName}</span>}
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* PLANNED SECTION */}
          {session && (
            <div className="rounded-xl bg-[#1a1a2e] border border-[rgba(255,255,255,0.06)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#556677] mb-3">Planned</h3>
              <div className="text-lg font-semibold" style={{ color: typeColor }}>{session.planned.desc}</div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {session.planned.distance > 0 && (
                  <div>
                    <div className="text-xs text-[#556677]">Distance</div>
                    <div className="text-sm font-mono">{session.planned.distance}km</div>
                  </div>
                )}
                {session.planned.pace && (
                  <div>
                    <div className="text-xs text-[#556677]">Pace</div>
                    <div className="text-sm font-mono">{session.planned.pace}</div>
                  </div>
                )}
              </div>
              {session.planned.notes && (
                <div className="mt-3 p-2 rounded-lg bg-[#0f0f17]/50 text-sm text-[#8899aa]">
                  {session.planned.notes}
                </div>
              )}
            </div>
          )}

          {/* ACTUAL ACTIVITIES SECTION */}
          {allActivities.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#556677]">
                {session ? 'Actual' : 'Activities'}
              </h3>

              {allActivities.map((act) => (
                <ActivityCard key={act.id} activity={act} planned={session?.planned} />
              ))}
            </div>
          )}

          {/* No activity */}
          {allActivities.length === 0 && day.date < new Date().toISOString().slice(0, 10) && session && session.type !== 'rest' && (
            <div className="rounded-xl bg-[#ff4757]/5 border border-[#ff4757]/20 p-4 text-center">
              <div className="text-sm text-[#ff4757]/80">No activity recorded</div>
              <div className="text-xs text-[#556677] mt-1">This session was missed or not synced</div>
            </div>
          )}

          {/* FEEDBACK SECTION */}
          {(session || allActivities.length > 0) && (
            <div className="rounded-xl bg-[#1a1a2e] border border-[rgba(255,255,255,0.06)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#556677] mb-3">
                Session Feedback
                {feedback && <span className="text-[#2ed573] ml-2">{'\u2713'} logged</span>}
              </h3>

              {/* RPE */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#8899aa]">RPE</span>
                  <span className="font-mono text-sm font-bold" style={{ color: rpeColor(rpe) }}>{rpe}</span>
                </div>
                <input
                  type="range" min="1" max="10" value={rpe}
                  onChange={(e) => setRpe(parseInt(e.target.value))}
                  className="w-full accent-[#00d4aa]"
                />
              </div>

              {/* Feeling */}
              <div className="mb-3">
                <span className="text-xs text-[#8899aa] block mb-1.5">How did you feel?</span>
                <div className="flex gap-1.5">
                  {['great', 'good', 'ok', 'tired', 'bad'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFeeling(f)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                        feeling === f
                          ? 'border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]'
                          : 'border-[rgba(255,255,255,0.06)] text-[#8899aa] hover:bg-[#22223a]'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Session notes..."
                rows={2}
                className="w-full bg-[#0f0f17] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:border-[#00d4aa] focus:outline-none resize-none mb-2"
              />

              <button
                onClick={handleSaveFeedback}
                className="w-full py-2 rounded-lg bg-[#00d4aa] text-[#0f0f17] font-semibold text-sm hover:bg-[#00b894] transition-colors"
              >
                {saved ? '\u2713 Saved!' : feedback ? 'Update Feedback' : 'Save Feedback'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Activity detail card - Strava-like analysis
function ActivityCard({ activity, planned }: { activity: SlimRun; planned?: { desc: string; distance: number; pace: string; notes: string } | undefined }) {
  const icon = SPORT_ICONS[activity.sport] || '\u2B50';

  // Compare with planned
  const distDelta = planned?.distance ? activity.dist - planned.distance : null;

  return (
    <div className="rounded-xl bg-[#1a1a2e] border border-[rgba(255,255,255,0.06)] p-4">
      {/* Activity header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-sm font-medium text-[#e8e8f0]">{activity.name}</div>
            <div className="text-xs text-[#556677] capitalize">{activity.type}</div>
          </div>
        </div>
        {distDelta !== null && (
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
            Math.abs(distDelta) < 0.5 ? 'text-[#2ed573] bg-[#2ed573]/10' :
            distDelta > 0 ? 'text-[#ffa502] bg-[#ffa502]/10' : 'text-[#ff4757] bg-[#ff4757]/10'
          }`}>
            {distDelta > 0 ? '+' : ''}{distDelta.toFixed(1)}km
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatBlock label="Distance" value={`${activity.dist.toFixed(1)}km`} />
        <StatBlock label="Time" value={fmtTime(activity.time)} />
        <StatBlock label="Pace" value={activity.sport === 'run' ? `${fmt(activity.pace)}/km` : '-'} />
        {activity.hr > 0 && <StatBlock label="Avg HR" value={`${Math.round(activity.hr)}`} unit="bpm" color="#ff6348" />}
        {activity.maxHr > 0 && <StatBlock label="Max HR" value={`${Math.round(activity.maxHr)}`} unit="bpm" />}
        {activity.elev > 0 && <StatBlock label="Elevation" value={`${Math.round(activity.elev)}`} unit="m" />}
      </div>

      {/* Pace comparison */}
      {planned && planned.distance > 0 && activity.sport === 'run' && (
        <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
          <div className="text-xs text-[#556677] mb-1">vs Planned</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#556677]">Plan: </span>
              <span className="font-mono text-[#8899aa]">{planned.distance}km {planned.pace}</span>
            </div>
            <div>
              <span className="text-[#556677]">Actual: </span>
              <span className="font-mono text-[#e8e8f0]">{activity.dist.toFixed(1)}km {fmt(activity.pace)}/km</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] text-[#556677] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-medium" style={color ? { color } : {}}>
        {value}
        {unit && <span className="text-[10px] text-[#556677] ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
