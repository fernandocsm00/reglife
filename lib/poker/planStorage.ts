// Persistent storage of the player's 90-day plan + retake cooldown logic.
// Lives entirely in localStorage for now. Designed to be backend-ready:
// the SavedPlan shape is a snapshot that can be POSTed as-is.

import type { LessonRef } from "./lessonCatalog";
import type { LeakBucket } from "./leakAnalysis";

export type StudyTime = "ate15" | "ate40" | "mais40";
export type ProfitGoal = "usd1k" | "usd10k" | "usd50k" | "usd100k";

/** @deprecated mantido só pra compatibilidade com planos v1 antigos */
export type StudyPace = StudyTime;

export interface PlanPhaseTask {
  id: string;
  text: string;
}

export interface PlanPhase {
  id: "fase1" | "fase2" | "fase3";
  title: string;
  rangeLabel: string; // "Dias 1-30"
  focus: string;
  tasks: PlanPhaseTask[];
  lessons: LessonRef[];
}

export interface SavedPlan {
  version: 1;
  id: string;
  createdAt: number;
  /** ID da linha em reglife_diagnostic_results (preenchido após POST). Usado pelo EV sem-auth. */
  diagnosticId?: string;
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  /** Meta semanal de torneios (EV usa pra cobrar volume). */
  volumeTargetWeekly?: number;

  // Tier assessment
  playerTier: number;
  playerTierLabel: string;

  // Snapshot of the diagnostic at creation time
  accuracyPct: number;
  totalCorrect: number;
  totalErrors: number;
  totalDrills: number;
  stoppedEarly: boolean; // true = 3 spots falharam e o diagnóstico encerrou cedo
  spotsPlayed: number;   // quantos spots foram jogados
  spotsFailed: number;   // quantos ficaram abaixo de 70%
  byTrainer: { label: string; correct: number; total: number; pct: number }[];
  leaks: LeakBucket[];

  // The 3 ciclos
  phases: PlanPhase[];

  // Player-tracked progress
  progress: {
    checkedLessonUrls: string[];
    checkedTaskIds: string[];
  };

  // Retake control
  attempts: number;
  lockedUntil?: number; // epoch ms
}

const STORAGE_KEY = "reglife.plan.v1";
export const RETAKE_COOLDOWN_DAYS = 0; // unlimited retakes — no cooldown

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function getStoredPlan(): SavedPlan | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPlan;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePlan(plan: SavedPlan): void {
  if (!isClient()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export function clearPlan(): void {
  if (!isClient()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function cooldownRemainingMs(plan: SavedPlan | null): number {
  if (!plan?.lockedUntil) return 0;
  return Math.max(0, plan.lockedUntil - Date.now());
}

export function isLocked(_plan: SavedPlan | null): boolean {
  return false; // unlimited retakes — never locked
}

export function formatCooldown(ms: number): string {
  if (ms <= 0) return "";
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return `${days} dia${days > 1 ? "s" : ""}${hours > 0 ? ` e ${hours}h` : ""}`;
  }
  return `${hours}h`;
}

/** 1-indexed: dia 1 no momento da criação. */
export function daysSinceCreation(plan: SavedPlan): number {
  const ms = Date.now() - plan.createdAt;
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

/** Incrementa o contador de tentativas sem nunca impor cooldown. */
export function nextAttemptMeta(previous: SavedPlan | null): {
  attempts: number;
  lockedUntil?: number;
} {
  return { attempts: (previous?.attempts ?? 0) + 1 };
}
