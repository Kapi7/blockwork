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

function formatPace(sec: number): string {
  if (!sec || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDist(km: number): string {
  return km.toFixed(1);
}

function formatTime(seconds: number): string {
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
  const typeColor = hasSession ? (TYPE_COLORS[day.session!.type] || '#747d8c') : 'transparent';
  const dayNum = new Date(day.date + 'T00:00:00').getDate();
  const matched = day.session?.actual;
  const missed = hasSession && isPast && !matched && day.session!.type !== 'rest';

  // Unplanned activities
  const extraActivities = !hasSession ? day.activities : [];

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border min-h-[110px] p-1.5 flex flex-col transition-all relative cursor-pointer group hover:bg-[#22223a] ${
        isToday ? 'border-[#00d4aa]/50 bg-[#00d4aa]/5 shadow-[0_0_12px_rgba(0,212,170,0.15)]' : 'border-[rgba(255,255,255,0.06)] bg-[#1a1a2e]/40'
      }`}
    >
      {/* Day number + type indicator */}
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-mono ${isToday ? 'text-[#00d4aa] font-bold' : 'text-[#556677]'}`}>
          {dayNum}
        </span>
        <div className="flex items-center gap-1">
          {/* Activity type icons for actual activities */}
          {day.activities.slice(0, 3).map((a, i) => (
            <span key={i} className="text-[10px]">{SPORT_ICONS[a.sport] || '\u2B50'}</span>
          ))}
          {hasSession && (
            <span className="w-2 h-2 rounded-full" style={{ background: typeColor }} />
          )}
        </div>
      </div>

      {/* Planned session */}
      {hasSession && (
        <div className="flex-1">
          <div className="text-xs font-medium leading-tight truncate" style={{ color: typeColor }}>
            {day.session!.planned.desc}
          </div>
          {day.session!.planned.distance > 0 && (
            <div className="text-xs text-[#556677] mt-0.5 font-mono">
              {day.session!.planned.distance}km
            </div>
          )}
          {day.session!.planned.pace && day.session!.type !== 'rest' && (
            <div className="text-[10px] text-[#556677] truncate">
              {day.session!.planned.pace}
            </div>
          )}
        </div>
      )}

      {/* Actual activity overlay */}
      {matched && (
        <div className="mt-auto pt-1 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[#2ed573]">{'\u2713'}</span>
            <span className="text-xs font-mono text-[#e8e8f0]">{formatDist(matched.dist)}km</span>
            <span className="text-[10px] font-mono text-[#8899aa]">{formatTime(matched.time)}</span>
          </div>
          <div className="text-[10px] font-mono text-[#8899aa]">
            {formatPace(matched.pace)}/km
            {matched.hr > 0 && ` \u2764 ${Math.round(matched.hr)}`}
          </div>
        </div>
      )}

      {/* Missed indicator */}
      {missed && (
        <div className="mt-auto">
          <span className="text-[10px] text-[#ff4757]/60">missed</span>
        </div>
      )}

      {/* Unplanned activities */}
      {extraActivities.length > 0 && (
        <div className="flex-1 flex flex-col justify-center">
          {extraActivities.slice(0, 2).map((a, i) => (
            <div key={i} className="text-xs flex items-center gap-1">
              <span className="text-[10px]">{SPORT_ICONS[a.sport] || '\u2B50'}</span>
              <span className="font-mono text-[#8899aa]">{formatDist(a.dist)}km</span>
              <span className="text-[#556677] text-[10px]">{formatTime(a.time)}</span>
            </div>
          ))}
          {extraActivities.length > 2 && (
            <span className="text-[10px] text-[#556677]">+{extraActivities.length - 2} more</span>
          )}
        </div>
      )}

      {/* Click hint */}
      <div className="absolute inset-0 rounded-lg border-2 border-[#00d4aa]/0 group-hover:border-[#00d4aa]/20 transition-colors pointer-events-none" />
    </div>
  );
}
