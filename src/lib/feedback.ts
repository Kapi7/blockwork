import type { SessionFeedback } from './types';

const STORAGE_KEY = 'blockwork_feedback';

export function getAllFeedback(): SessionFeedback[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveFeedback(feedback: SessionFeedback): void {
  const all = getAllFeedback();
  // Replace if same date exists
  const idx = all.findIndex((f) => f.date === feedback.date);
  if (idx >= 0) {
    all[idx] = feedback;
  } else {
    all.push(feedback);
  }
  all.sort((a, b) => b.date.localeCompare(a.date));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getFeedbackForDate(date: string): SessionFeedback | null {
  return getAllFeedback().find((f) => f.date === date) ?? null;
}

export function deleteFeedback(date: string): void {
  const all = getAllFeedback().filter((f) => f.date !== date);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function exportFeedbackJSON(): string {
  return JSON.stringify(getAllFeedback(), null, 2);
}

export function clearAllFeedback(): void {
  localStorage.removeItem(STORAGE_KEY);
}
