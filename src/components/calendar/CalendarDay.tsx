import type { MatchedDay, SlimRun } from '../../lib/types';

const TYPE_COLORS: Record<string, string> = {
  key: '#f53b57', threshold: '#ff6b81', steady: '#ffb142', easy: '#0be881',
  recovery: '#34e7e4', race: '#ffd32a', rest: '#485460', bike: '#3498ff',
  yoga: '#a55eea', strength: '#ff9f43',
};

function SportIcon({ sport, size = 14 }: { sport: string; size?: number }) {
  const s = size;
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (sport === 'run') return (
    <svg {...props}><circle cx="12" cy="5" r="2"/><path d="M7 21l3-7 2.5 2.5L16 12"/><path d="M16 12l-1.5 5.5L10 21"/></svg>
  );
  if (sport === 'bike') return (
    <svg {...props}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h4l2 4h2"/><circle cx="12" cy="5" r="1.5"/></svg>
  );
  if (sport === 'yoga') return (
    <svg {...props}><circle cx="12" cy="4" r="2"/><path d="M12 6v6"/><path d="M8 18l4-6 4 6"/><path d="M6 12h12"/></svg>
  );
  if (sport === 'strength') return (
    <svg {...props}><path d="M6 8v8"/><path d="M18 8v8"/><path d="M4 10v4"/><path d="M20 10v4"/><path d="M6 12h12"/></svg>
  );
  if (sport === 'swim') return (
    <svg {...props}><path d="M2 16c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0"/><circle cx="12" cy="7" r="2"/><path d="M10 9l2 5 2-5"/></svg>
  );
  return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>;
}

function fmt(sec: number): string {
  if (!sec || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtSpeed(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '-';
  return `${(3600 / secPerKm).toFixed(1)}km/h`;
}

function fmtDist(km: number): string {
  return km.toFixed(1);
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

interface Props {
  day: MatchedDay;
  isToday: boolean;
  onClick: () => void;
}

export function CalendarDay({ day, isToday, onClick }: Props) {
  const hasSession = !!day.session;
  const isPast = day.date < new Date().toISOString().slice(0, 10);
  const typeColor = hasSession ? (TYPE_COLORS[day.session!.type] || '#485460') : 'transparent';
  const dayNum = new Date(day.date + 'T00:00:00').getDate();
  const matched = day.session?.actual;
  const missed = hasSession && isPast && !matched && day.session!.type !== 'rest';
  const extraActivities = !hasSession ? day.activities : [];

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border min-h-[110px] p-2 flex flex-col transition-all relative cursor-pointer group ${
        isToday
          ? 'border-[#00e5b0]/30 bg-[#00e5b0]/[0.03] shadow-[0_0_20px_rgba(0,229,176,0.08)]'
          : 'border-[rgba(255,255,255,0.04)] bg-[#0e0e1a]/40 hover:bg-[#0e0e1a]/80 hover:border-[rgba(255,255,255,0.06)]'
      }`}
    >
      {/* Day number + sport icons */}
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold ${isToday ? 'text-[#00e5b0]' : 'text-[#3d4350]'}`} style={{ fontFamily: "'DM Mono', monospace" }}>
          {dayNum}
        </span>
        <div className="flex items-center gap-0.5 text-[#7c8495]">
          {day.activities.slice(0, 3).map((a, i) => (
            <SportIcon key={i} sport={a.sport} size={11} />
          ))}
          {hasSession && (
            <span className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: typeColor }} />
          )}
        </div>
      </div>

      {/* Planned session */}
      {hasSession && (
        <div className="flex-1">
          <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: typeColor }}>
            {day.session!.planned.desc}
          </div>
          {day.session!.planned.distance > 0 && (
            <div className="text-[10px] text-[#3d4350] mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
              {day.session!.planned.distance}km
            </div>
          )}
          {day.session!.planned.pace && day.session!.type !== 'rest' && (
            <div className="text-[9px] text-[#3d4350] truncate">
              {day.session!.planned.pace}
            </div>
          )}
        </div>
      )}

      {/* Actual activity overlay */}
      {matched && (
        <div className="mt-auto pt-1 border-t border-[rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#0be881]">{'\u2713'}</span>
            <span className="text-[10px] font-semibold text-[#eef0f6]" style={{ fontFamily: "'DM Mono', monospace" }}>
              {fmtDist(matched.dist)}km
            </span>
            <span className="text-[9px] text-[#3d4350]" style={{ fontFamily: "'DM Mono', monospace" }}>
              {fmtTime(matched.time)}
            </span>
          </div>
          <div className="text-[9px] text-[#7c8495]" style={{ fontFamily: "'DM Mono', monospace" }}>
            {matched.sport === 'bike' ? fmtSpeed(matched.pace) : matched.sport === 'run' ? `${fmt(matched.pace)}/km` : ''}
            {matched.hr > 0 && ` \u2764\uFE0F ${Math.round(matched.hr)}`}
          </div>
        </div>
      )}

      {/* Missed */}
      {missed && (
        <div className="mt-auto">
          <span className="text-[9px] text-[#f53b57]/50 font-medium">missed</span>
        </div>
      )}

      {/* Unplanned activities */}
      {extraActivities.length > 0 && (
        <div className="flex-1 flex flex-col justify-center gap-0.5">
          {extraActivities.slice(0, 2).map((a, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className="text-[#7c8495]"><SportIcon sport={a.sport} size={10} /></span>
              <span className="font-semibold text-[#7c8495]" style={{ fontFamily: "'DM Mono', monospace" }}>
                {a.dist > 0 ? `${fmtDist(a.dist)}km` : fmtTime(a.time)}
              </span>
              <span className="text-[#3d4350]" style={{ fontFamily: "'DM Mono', monospace" }}>
                {a.sport === 'bike' ? fmtSpeed(a.pace) : a.sport === 'run' ? `${fmt(a.pace)}/km` : fmtTime(a.time)}
              </span>
            </div>
          ))}
          {extraActivities.length > 2 && (
            <span className="text-[9px] text-[#3d4350]">+{extraActivities.length - 2} more</span>
          )}
        </div>
      )}
    </div>
  );
}
