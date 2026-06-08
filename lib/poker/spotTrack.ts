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
  /** Tier do spot (1, 2, ou 3). Propagado de leak.tier. Default 1. */
  tier: number;
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
    tier: leak.tier ?? 1,
  }));
}

/**
 * Resources card list (career lesson only).
 * A grade tem seu próprio bloco (GradeCard) em PlanScreen — A7 da reforma.
 * Manager chat também não entra aqui (card dedicado em PlanScreen).
 *
 * `plan` é mantido na assinatura por compat com consumidores e porque
 * outros recursos futuros podem depender dele.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildResources(plan: SavedPlan): ResourceEntry[] {
  return [
    {
      label: "Aula construção de carreira",
      sublabel: "Como o Yuri começaria hoje",
      url: FIXED_LINKS.careerLesson,
      kind: "career",
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

/**
 * URL da grade de torneios para esse plano. Reusa getGradeLink.
 * Quando aluno não declarou banca (stakeGrade null), cai em
 * FIXED_LINKS.tournamentGrid (placeholder neutro).
 *
 * Encapsula getGradeLink pra que SpotCard (seção "Joga") e GradeCard
 * usem o mesmo ponto de verdade — evita import direto de spotLinks
 * em vários consumidores.
 */
export function getGradeUrl(plan: SavedPlan): string {
  return getGradeLink(plan.stakeGrade);
}
