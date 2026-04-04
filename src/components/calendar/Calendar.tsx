import { useState } from 'react';
import type { MatchedDay, SlimRun, Session } from '../../lib/types';
import { CalendarDay } from './CalendarDay';
import { SessionModal } from './SessionModal';

interface Props {
  weeks: MatchedDay[][];
  today: string;
}

const PHASE_COLORS: Record<string, string> = {
  recovery: '#70a1ff', base: '#2ed573', speed: '#ff4757', taper: '#ffa502', race: '#eccc68',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Calendar({ weeks, today }: Props) {
  const [selectedDay, setSelectedDay] = useState<MatchedDay | null>(null);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-8 gap-1 mb-1">
        <div className="text-xs text-[#8899aa] p-2">Week</div>
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-xs text-[#8899aa] font-medium p-2 text-center">{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-1">
        {weeks.map((week, wi) => {
          const weekPhase = week.find((d) => d.phase)?.phase;
          const weekBlock = week.find((d) => d.blockName)?.blockName;
          const phaseColor = PHASE_COLORS[weekPhase || ''] || '#747d8c';

          const plannedKm = week.reduce((sum, d) => sum + (d.session?.planned.distance || 0), 0);
          const actualKm = week.reduce((sum, d) => {
            return sum + d.activities.filter((a: SlimRun) => a.sport === 'run').reduce((s: number, a: SlimRun) => s + a.dist, 0);
          }, 0);

          const weekDate = week[0]?.date;
          const weekLabel = weekDate ? new Date(weekDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

          return (
            <div key={wi} className="grid grid-cols-8 gap-1">
              {/* Week label */}
              <div className="rounded-lg bg-[#1a1a2e]/50 p-2 flex flex-col justify-between border-l-2" style={{ borderColor: phaseColor }}>
                <div>
                  <div className="text-xs font-mono text-[#556677]">{weekLabel}</div>
                  {weekBlock && <div className="text-xs text-[#8899aa] mt-0.5 truncate">{weekBlock}</div>}
                </div>
                <div className="mt-1">
                  {plannedKm > 0 && (
                    <div className="text-xs font-mono">
                      <span style={{ color: actualKm >= plannedKm * 0.8 ? '#2ed573' : actualKm > 0 ? '#ffa502' : '#556677' }}>
                        {Math.round(actualKm)}
                      </span>
                      <span className="text-[#556677]">/{Math.round(plannedKm)}km</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Day cells */}
              {week.map((day) => (
                <CalendarDay
                  key={day.date}
                  day={day}
                  isToday={day.date === today}
                  onClick={() => setSelectedDay(day)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Session Modal */}
      {selectedDay && (
        <SessionModal
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
          onPrev={() => {
            const allDays = weeks.flat();
            const idx = allDays.findIndex((d) => d.date === selectedDay.date);
            if (idx > 0) setSelectedDay(allDays[idx - 1]);
          }}
          onNext={() => {
            const allDays = weeks.flat();
            const idx = allDays.findIndex((d) => d.date === selectedDay.date);
            if (idx < allDays.length - 1) setSelectedDay(allDays[idx + 1]);
          }}
        />
      )}
    </div>
  );
}
