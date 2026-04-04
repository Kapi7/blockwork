import { useState } from 'react';
import type { MatchedDay, SlimRun } from '../../lib/types';
import { CalendarDay } from './CalendarDay';
import { SessionModal } from './SessionModal';

interface Props {
  weeks: MatchedDay[][];
  today: string;
  detailedByDate?: Record<string, any>;
}

const PHASE_COLORS: Record<string, string> = {
  recovery: '#4ecdc4', base: '#26de81', speed: '#ff4757', taper: '#ffa502', race: '#ffd32a',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Calendar({ weeks, today, detailedByDate = {} }: Props) {
  const [selectedDay, setSelectedDay] = useState<MatchedDay | null>(null);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-8 gap-1 mb-1">
        <div className="text-[10px] text-[#4a5568] p-2 font-semibold uppercase tracking-wider">Week</div>
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-[10px] text-[#4a5568] font-semibold uppercase tracking-wider p-2 text-center">{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-1">
        {weeks.map((week, wi) => {
          const weekPhase = week.find((d) => d.phase)?.phase;
          const weekBlock = week.find((d) => d.blockName)?.blockName;
          const phaseColor = PHASE_COLORS[weekPhase || ''] || '#636e72';

          const plannedKm = week.reduce((sum, d) => sum + (d.session?.planned.distance || 0), 0);
          const actualKm = week.reduce((sum, d) => {
            return sum + d.activities.filter((a: SlimRun) => a.sport === 'run').reduce((s: number, a: SlimRun) => s + a.dist, 0);
          }, 0);
          const totalKm = week.reduce((sum, d) => sum + d.activities.reduce((s: number, a: SlimRun) => s + a.dist, 0), 0);

          const weekDate = week[0]?.date;
          const weekLabel = weekDate ? new Date(weekDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

          return (
            <div key={wi} className="grid grid-cols-8 gap-1">
              {/* Week label */}
              <div className="rounded-xl bg-[#12121e]/60 p-2 flex flex-col justify-between border-l-2" style={{ borderColor: phaseColor }}>
                <div>
                  <div className="text-[10px] font-mono text-[#4a5568]">{weekLabel}</div>
                  {weekBlock && <div className="text-[10px] text-[#8892a4] mt-0.5 truncate">{weekBlock}</div>}
                </div>
                <div className="mt-1">
                  {totalKm > 0 && (
                    <div className="text-[10px] font-mono font-semibold" style={{ color: phaseColor }}>
                      {Math.round(totalKm)}km
                    </div>
                  )}
                  {plannedKm > 0 && (
                    <div className="text-[9px] font-mono text-[#4a5568]">
                      /{Math.round(plannedKm)}
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
          detailed={detailedByDate[selectedDay.date] || null}
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
