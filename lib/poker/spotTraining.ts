// Pure helpers for spot training progress and gating.
// No I/O — DB reads/writes live in the API route.

export const THRESHOLD_PCT = 0.70;
export const THRESHOLD_HANDS = 50;

/** Shape of a row in spot_training_sessions (subset we read). */
export interface SpotTrainingRow {
  hands_played: number;
  hands_correct: number;
  completed_at: string | null;
}

export interface SpotProgress {
  handsPlayed: number;
  handsCorrect: number;
  /** Accuracy 0..1; 0 when no hands played. */
  pct: number;
  /** True if persisted completed_at OR thresholds reached. */
  completed: boolean;
}

export function computeProgress(row: SpotTrainingRow | null): SpotProgress {
  if (!row) {
    return { handsPlayed: 0, handsCorrect: 0, pct: 0, completed: false };
  }
  const handsPlayed = row.hands_played ?? 0;
  const handsCorrect = row.hands_correct ?? 0;
  const pct = handsPlayed > 0 ? handsCorrect / handsPlayed : 0;
  const completed = row.completed_at !== null || isSpotComplete(row);
  return { handsPlayed, handsCorrect, pct, completed };
}

export function isSpotComplete(row: SpotTrainingRow): boolean {
  if (row.completed_at) return true;
  if (row.hands_played < THRESHOLD_HANDS) return false;
  const pct = row.hands_correct / row.hands_played;
  return pct >= THRESHOLD_PCT;
}
