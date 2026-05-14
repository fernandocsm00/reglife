// lib/pdf/utils.ts — Extrai dados estruturados de um SavedPlan pra alimentar o PDF.

import type { SavedPlan } from "@/lib/poker/planStorage";

export interface SpotAccuracyEntry {
  label: string;
  pct: number;
  passed: boolean;
}

export interface LeakHighlight {
  /** Leak id no formato `${action}-${position}-${stackSize}` — usado por getSpotLink. */
  id: string;
  label: string;
  pct: number;
  narrative: string;
}

const STUDY_TIME_LABELS: Record<string, string> = {
  ate15: "Até 15h/semana",
  ate40: "Até 40h/semana",
  mais40: "Mais de 40h/semana",
};

const PROFIT_GOAL_LABELS: Record<string, string> = {
  usd1k: "USD 1k/mês",
  usd10k: "USD 10k/mês",
  usd50k: "USD 50k/mês",
  usd100k: "USD 100k/mês",
};

export function profileSummary(plan: SavedPlan) {
  return {
    studyTime: STUDY_TIME_LABELS[plan.studyTime] ?? "Não informado",
    profitGoal: PROFIT_GOAL_LABELS[plan.profitGoal] ?? "Não informado",
    volumeTarget: plan.volumeTargetWeekly
      ? `${plan.volumeTargetWeekly} torneios/semana`
      : null,
  };
}

export function buildAccuracyList(plan: SavedPlan): SpotAccuracyEntry[] {
  return plan.byTrainer.map((b) => ({
    label: b.label,
    pct: Math.round(b.pct),
    passed: b.pct >= 70,
  }));
}

export function topLeaks(plan: SavedPlan, n: number = 3): LeakHighlight[] {
  return [...plan.leaks]
    .sort((a, b) => {
      const accA = a.total > 0 ? (a.total - a.errors) / a.total : 1;
      const accB = b.total > 0 ? (b.total - b.errors) / b.total : 1;
      return accA - accB;
    })
    .slice(0, n)
    .map((leak) => {
      const accuracyPct =
        leak.total > 0
          ? Math.round(((leak.total - leak.errors) / leak.total) * 100)
          : 0;
      return {
        id: leak.id,
        label: `${leak.actionLabel} · ${leak.position} · ${leak.stackBand}`,
        pct: accuracyPct,
        narrative: leak.recommendation,
      };
    });
}

export function phaseHighlights(plan: SavedPlan): Array<{
  title: string;
  range: string;
  bullets: string[];
}> {
  return plan.phases.map((phase) => {
    const bullets = [phase.focus];
    const taskBullets = phase.tasks.slice(0, 2).map((t) => t.text);
    bullets.push(...taskBullets);
    return {
      title: phase.title,
      range: phase.rangeLabel,
      bullets: bullets.slice(0, 3),
    };
  });
}

export function coverHeadline(plan: SavedPlan) {
  return {
    tier: plan.playerTier,
    tierLabel: plan.playerTierLabel,
    accuracyPct: plan.accuracyPct,
    correctOfTotal: `${plan.totalCorrect} de ${plan.totalDrills}`,
  };
}
