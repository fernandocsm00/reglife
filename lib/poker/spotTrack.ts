// Decompõe o "Desafio 30d" antigo em duas peças:
//   - buildSpotTrack: 3 spots sequenciais derivados dos top leaks
//   - buildResources: links auxiliares (carreira, grade)
//
// challenge30d.ts não muda — segue usado pelo PDF antigo. Esta lib é o
// novo ponto de entrada usado por /meu-plano v2.

import type { SavedPlan } from "./planStorage";
import { topLeaks } from "@/lib/pdf/utils";
import {
  FIXED_LINKS,
  canonicalSlotForLeak,
  getGradeLink,
  getLessonUrlForLeak,
  hasInternalTrainer,
  slugForLeak,
} from "./spotLinks";

export interface SpotTrackEntry {
  /** Order index 0..N — used as display number (1, 2, 3). */
  index: number;
  /** Leak id (ex.: "cBet-BTN-40"). Null only when filling an empty slot. */
  leakId: string | null;
  /** Pretty label (ex.: "Cbet do BTN em 40bb"). */
  label: string;
  /** Diagnostic % from the leak (0..100). Null when no leak (filler slot). */
  pct: number | null;
  /** Lesson URL (course content). */
  lessonUrl: string;
  /** Internal trainer slug or null when leak goes Tier-3 / external only. */
  trainerSlug: string | null;
  /** Has an internal trainer? Mirrors trainerSlug !== null. */
  hasInternalTrainer: boolean;
}

export interface ResourceEntry {
  label: string;
  sublabel?: string;
  url: string;
  /** Used by UI for icon / accent. */
  kind: "career" | "grade" | "manager";
}

/**
 * Up to 3 spots, ordered by canonical study sequence (not by error severity).
 * - Empty / filler slots are NOT inserted — array length = real leak count.
 *   When plan has 0 leaks, returns [].
 */
export function buildSpotTrack(plan: SavedPlan): SpotTrackEntry[] {
  const leaks = [...topLeaks(plan, 3)].sort(
    (a, b) => canonicalSlotForLeak(a.id) - canonicalSlotForLeak(b.id)
  );

  return leaks.map((leak, i) => ({
    index: i,
    leakId: leak.id,
    label: leak.label,
    pct: leak.pct,
    lessonUrl: getLessonUrlForLeak(leak.id),
    trainerSlug: slugForLeak(leak.id),
    hasInternalTrainer: hasInternalTrainer(leak.id),
  }));
}

/**
 * Resources card list (career lesson + tournament grade).
 * Always 2 entries. Manager chat is NOT in this list — it has its own
 * dedicated card in PlanScreen.
 */
export function buildResources(plan: SavedPlan): ResourceEntry[] {
  return [
    {
      label: "Aula construção de carreira",
      sublabel: "Como o Yuri começaria hoje",
      url: FIXED_LINKS.careerLesson,
      kind: "career",
    },
    {
      label: "Grade de torneios",
      sublabel: plan.stakeGrade
        ? `Sua grade: ABI $${plan.stakeGrade}`
        : "Não precisa pensar, é só registrar",
      url: getGradeLink(plan.stakeGrade),
      kind: "grade",
    },
  ];
}

/**
 * Finds the index of the first entry in `track` that is NOT completed.
 *
 * `isCompleted(entry)` is provided by the caller — different consumers know
 * "completed" differently (boolean flag on client, completed_at timestamp on
 * server). Centralizing the loop keeps the gating rule consistent across
 * admin and student views.
 *
 * Returns the first not-completed index, or `track.length` if everything
 * is completed. Use the return value as `activeIdx` directly — anything
 * before is `completed`, the index itself is `active`, anything after is `locked`.
 */
export function findActiveSpotIndex(
  track: SpotTrackEntry[],
  isCompleted: (entry: SpotTrackEntry) => boolean,
): number {
  for (let i = 0; i < track.length; i++) {
    if (!isCompleted(track[i])) return i;
  }
  return track.length;
}
