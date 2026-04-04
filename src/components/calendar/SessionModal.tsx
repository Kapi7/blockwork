import { useState, useEffect } from 'react';
import type { MatchedDay, SlimRun } from '../../lib/types';

const TYPE_COLORS: Record<string, string> = {
  key: '#f53b57', threshold: '#ff6b81', steady: '#ffb142', easy: '#0be881',
  recovery: '#34e7e4', race: '#ffd32a', rest: '#485460', bike: '#3498ff',
  yoga: '#a55eea', strength: '#ff9f43',
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

function speedToPace(speed: number): number {
  return speed > 0 ? 1000 / speed : 0;
}

interface FeedbackData {
  date: string; rpe: number; feeling: string; notes: string; timestamp: string;
}

function loadFeedback(date: string): FeedbackData | null {
  try {
    const all = JSON.parse(localStorage.getItem('blockwork_feedback') || '[]');
    return all.find((f: FeedbackData) => f.date === date) || null;
  } catch { return null; }
}

function saveFB(fb: FeedbackData) {
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
  detailed: any | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function SessionModal({ day, detailed, onClose, onPrev, onNext }: Props) {
  const session = day.session;
  const typeColor = session ? TYPE_COLORS[session.type] || '#636e72' : '#636e72';
  const allActivities = day.activities;
  const splits = detailed?.splits || [];

  const [rpe, setRpe] = useState(5);
  const [feeling, setFeeling] = useState('ok');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fb = loadFeedback(day.date);
    if (fb) { setRpe(fb.rpe); setFeeling(fb.feeling); setNotes(fb.notes); }
    else { setRpe(5); setFeeling('ok'); setNotes(''); }
    setSaved(false);
  }, [day.date]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  const handleSave = () => {
    saveFB({ date: day.date, rpe, feeling, notes, timestamp: new Date().toISOString() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const rpeColor = (v: number) => v <= 3 ? '#26de81' : v <= 5 ? '#7bed9f' : v <= 7 ? '#ffa502' : v <= 8 ? '#fd9644' : '#ff4757';
  const feelColors: Record<string, string> = { great: '#26de81', good: '#7bed9f', ok: '#ffa502', tired: '#fd9644', bad: '#ff4757' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-[#08080f] border border-[rgba(255,255,255,0.06)] rounded-3xl overflow-y-auto shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
        style={{ animation: 'modalIn 0.25s cubic-bezier(0.22,1,0.36,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#08080f]/95 backdrop-blur-xl border-b border-[rgba(255,255,255,0.05)] px-6 py-4 rounded-t-3xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <button onClick={onPrev} className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-[#8892a4] transition-colors">{'\u2190'}</button>
              <button onClick={onNext} className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-[#8892a4] transition-colors">{'\u2192'}</button>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-[#8892a4] transition-colors">{'\u2715'}</button>
          </div>
          <h2 className="text-lg font-bold">{fmtDate(day.date)}</h2>
          {session && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: typeColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: typeColor }}>{session.type}</span>
              {day.blockName && <span className="text-[10px] text-[#4a5568]">{'\u00B7'} {day.blockName}</span>}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* PLANNED */}
          {session && (
            <Section title="Planned">
              <div className="text-base font-semibold" style={{ color: typeColor }}>{session.planned.desc}</div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {session.planned.distance > 0 && <Stat label="Distance" value={`${session.planned.distance}km`} />}
                {session.planned.pace && <Stat label="Pace" value={session.planned.pace} />}
              </div>
              {session.planned.notes && (
                <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-sm text-[#8892a4]">
                  {session.planned.notes}
                </div>
              )}
            </Section>
          )}

          {/* ACTIVITIES */}
          {allActivities.map((act) => (
            <Section key={act.id} title={session ? 'Actual' : 'Activity'}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{SPORT_ICONS[act.sport] || '\u2B50'}</span>
                <div className="flex-1">
                  <div className="font-semibold">{act.name}</div>
                  <div className="text-xs text-[#4a5568] capitalize">{act.type}</div>
                </div>
                {session?.planned.distance && session.planned.distance > 0 && (
                  <DeltaBadge actual={act.dist} planned={session.planned.distance} unit="km" />
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <BigStat label="Distance" value={`${act.dist.toFixed(1)}`} unit="km" color="#00d4aa" />
                <BigStat label="Time" value={fmtTime(act.time)} />
                <BigStat label={act.sport === 'bike' ? 'Speed' : 'Pace'} value={act.sport === 'run' ? `${fmt(act.pace)}` : act.sport === 'bike' && act.pace > 0 ? `${(3600/act.pace).toFixed(1)}` : '-'} unit={act.sport === 'run' ? '/km' : act.sport === 'bike' ? 'km/h' : ''} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {act.hr > 0 && <BigStat label="Avg HR" value={`${Math.round(act.hr)}`} unit="bpm" color="#ff6b6b" />}
                {act.maxHr > 0 && <BigStat label="Max HR" value={`${Math.round(act.maxHr)}`} unit="bpm" />}
                {act.elev > 0 && <BigStat label="Elevation" value={`${Math.round(act.elev)}`} unit="m" />}
              </div>

              {/* Splits */}
              {splits.length > 1 && (
                <div className="mt-5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#4a5568] mb-3">Splits</h4>

                  {/* Visual pace bars */}
                  <div className="space-y-1 mb-4">
                    {splits.map((s: any, i: number) => {
                      const pace = speedToPace(s.average_speed);
                      const minPace = Math.min(...splits.map((sp: any) => speedToPace(sp.average_speed)).filter((p: number) => p > 0));
                      const maxPace = Math.max(...splits.map((sp: any) => speedToPace(sp.average_speed)));
                      const range = maxPace - minPace || 1;
                      const pct = 100 - ((pace - minPace) / range) * 60; // Faster = wider bar
                      const paceColor = pace < 250 ? '#ff4757' : pace < 300 ? '#ffa502' : '#26de81';
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#4a5568] w-5 text-right">{i + 1}</span>
                          <div className="flex-1 h-5 bg-white/[0.02] rounded-md overflow-hidden relative">
                            <div
                              className="h-full rounded-md flex items-center px-2"
                              style={{ width: `${Math.max(pct, 20)}%`, background: `${paceColor}20` }}
                            >
                              <span className="text-[10px] font-mono font-semibold" style={{ color: paceColor }}>{fmt(pace)}</span>
                            </div>
                          </div>
                          {s.average_heartrate > 0 && (
                            <span className="text-[10px] font-mono text-[#8892a4] w-8 text-right">{Math.round(s.average_heartrate)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Splits table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-[#4a5568] uppercase tracking-wider">
                          <th className="text-left pb-2 font-semibold">Km</th>
                          <th className="text-right pb-2 font-semibold">Pace</th>
                          <th className="text-right pb-2 font-semibold">HR</th>
                          <th className="text-right pb-2 font-semibold">Elev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {splits.map((s: any, i: number) => {
                          const pace = speedToPace(s.average_speed);
                          const paceColor = pace < 250 ? '#ff4757' : pace < 300 ? '#ffa502' : '#26de81';
                          return (
                            <tr key={i} className="border-t border-white/[0.03]">
                              <td className="py-1.5 font-mono text-[#8892a4]">{i + 1}</td>
                              <td className="py-1.5 text-right font-mono font-semibold" style={{ color: paceColor }}>{fmt(pace)}</td>
                              <td className="py-1.5 text-right font-mono text-[#8892a4]">{s.average_heartrate ? Math.round(s.average_heartrate) : '-'}</td>
                              <td className="py-1.5 text-right font-mono text-[#8892a4]">{s.elevation_difference ? `${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference)}m` : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Planned comparison */}
              {session && session.planned.distance > 0 && act.sport === 'run' && (
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#4a5568] mb-2">vs Planned</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/[0.02]">
                      <span className="text-[#4a5568]">Plan: </span>
                      <span className="font-mono text-[#8892a4]">{session.planned.distance}km {session.planned.pace}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.02]">
                      <span className="text-[#4a5568]">Actual: </span>
                      <span className="font-mono text-[#f0f0f8]">{act.dist.toFixed(1)}km {fmt(act.pace)}/km</span>
                    </div>
                  </div>
                </div>
              )}
            </Section>
          ))}

          {/* No activity warning */}
          {allActivities.length === 0 && day.date < new Date().toISOString().slice(0, 10) && session && session.type !== 'rest' && (
            <div className="rounded-2xl bg-[#ff4757]/5 border border-[#ff4757]/15 p-5 text-center">
              <div className="text-sm text-[#ff4757]/80">No activity recorded</div>
              <div className="text-xs text-[#4a5568] mt-1">This session was missed or not synced</div>
            </div>
          )}

          {/* FEEDBACK */}
          {(session || allActivities.length > 0) && (
            <Section title="Session Feedback">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#8892a4]">RPE</span>
                  <span className="font-mono text-base font-bold" style={{ color: rpeColor(rpe) }}>{rpe}</span>
                </div>
                <input type="range" min="1" max="10" value={rpe} onChange={(e) => setRpe(parseInt(e.target.value))}
                  className="w-full accent-[#00d4aa] h-1.5" />
                <div className="flex justify-between text-[9px] text-[#4a5568] mt-0.5">
                  <span>Easy</span><span>Moderate</span><span>Max effort</span>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-xs text-[#8892a4] block mb-2">How did you feel?</span>
                <div className="flex gap-1.5">
                  {(['great', 'good', 'ok', 'tired', 'bad'] as const).map((f) => (
                    <button key={f} onClick={() => setFeeling(f)}
                      className={`flex-1 py-2 rounded-xl border text-[11px] font-medium transition-all ${
                        feeling === f
                          ? 'border-[#00d4aa]/40 bg-[#00d4aa]/8 text-[#00d4aa]'
                          : 'border-white/[0.04] text-[#8892a4] hover:bg-white/[0.03]'
                      }`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Session notes..." rows={2}
                className="w-full bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3 text-sm text-[#f0f0f8] placeholder-[#4a5568] focus:border-[#00d4aa]/40 focus:outline-none resize-none mb-3" />

              <button onClick={handleSave}
                className="w-full py-2.5 rounded-xl bg-[#00d4aa] text-[#0a0a12] font-semibold text-sm hover:shadow-[0_0_20px_rgba(0,212,170,0.3)] transition-all">
                {saved ? '\u2713 Saved!' : 'Save Feedback'}
              </button>
            </Section>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { transform: scale(0.95) translateY(10px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#12121e] border border-white/[0.04] p-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#4a5568] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function BigStat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-mono font-bold mt-0.5" style={color ? { color } : {}}>
        {value}
        {unit && <span className="text-[10px] text-[#4a5568] font-normal ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-[#4a5568] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}

function DeltaBadge({ actual, planned, unit }: { actual: number; planned: number; unit: string }) {
  const delta = actual - planned;
  const color = Math.abs(delta) < 0.5 ? '#26de81' : delta > 0 ? '#ffa502' : '#ff4757';
  return (
    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full font-semibold" style={{ background: `${color}12`, color }}>
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}{unit}
    </span>
  );
}
