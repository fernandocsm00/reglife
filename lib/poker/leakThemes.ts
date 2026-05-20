// lib/poker/leakThemes.ts — Agrupa LeakBucket[] em temas estratégicos
// alinhados com as 3 fases do plano de 90 dias.
//
// Em vez de mostrar 10+ cards granulares (um por spot/stack), apresenta
// 3 temas grossos — cada um vira o foco de uma fase. Mais acionável,
// menos overwhelming.

import type { LeakBucket } from "./leakAnalysis";

export type ThemeId = "preflop" | "postflop_srp" | "advanced";

export interface LeakTheme {
  id: ThemeId;
  title: string;
  emoji: string;
  phaseLabel: string;
  totalErrors: number;
  totalAttempts: number;
  affectedCount: number;
  /** Spots afetados, ordenados do pior pro menos ruim (pra chips compactos). */
  affectedSpots: Array<{
    label: string; // "Vs C-Bet · BB · 30bb"
    accuracyPct: number;
    errors: number;
    total: number;
  }>;
  /** Frase estratégica/acionável apresentada pro aluno. */
  cta: string;
}

interface ThemeConfig {
  title: string;
  emoji: string;
  phaseLabel: string;
  ctaTemplate: (count: number) => string;
}

const THEMES: Record<ThemeId, ThemeConfig> = {
  preflop: {
    title: "Pré-flop precisa solidificar",
    emoji: "🎯",
    phaseLabel: "Foco da Fase 1 — Fundamentos",
    ctaTemplate: (n) =>
      n === 1
        ? "Você errou 1 spot pré-flop. Atacar essa base primeiro destrava o resto do plano. Começa pelas aulas de range da Fase 1."
        : `Você errou ${n} spots pré-flop. Atacar essa base primeiro destrava o resto do plano. Começa pelas aulas de range da Fase 1.`,
  },
  postflop_srp: {
    title: "Pós-flop em pots single-raised",
    emoji: "🎲",
    phaseLabel: "Foco da Fase 2 — Aplicação",
    ctaTemplate: (n) =>
      n === 1
        ? "1 spot pós-flop com problema. Trabalha texturas de board e seleção de c-bet/defesa nas aulas da Fase 2."
        : `${n} spots pós-flop precisam de atenção. Trabalha texturas de board e seleção de c-bet/defesa nas aulas da Fase 2.`,
  },
  advanced: {
    title: "Spots avançados",
    emoji: "🚀",
    phaseLabel: "Foco da Fase 3 — Integração",
    ctaTemplate: (n) =>
      n === 1
        ? "1 spot avançado em aberto. Trata como bônus depois que pré-flop e pós-flop básico estiverem sólidos."
        : `${n} spots avançados em aberto. Trata como bônus depois que pré-flop e pós-flop básico estiverem sólidos.`,
  },
};

/**
 * Mapeia `action` (RFI/cBet/etc) pro tema correspondente.
 * Retorna null se a action não bate em nenhum tema (não deveria acontecer,
 * mas o tipo nos protege caso surja uma action nova).
 */
function actionToTheme(action: string): ThemeId | null {
  switch (action) {
    case "RFI":
    case "vsOpen":
    case "vsBBISO":
    case "blindWar":
      return "preflop";
    case "cBet":
    case "vsCbet":
      return "postflop_srp";
    case "vs3Bet":
    case "multiway":
    case "cbetTurn":
    case "cbetRiver":
      return "advanced";
    default:
      return null;
  }
}

export function groupLeaksByTheme(leaks: LeakBucket[]): LeakTheme[] {
  const byTheme = new Map<ThemeId, LeakBucket[]>();

  for (const leak of leaks) {
    const theme = actionToTheme(leak.action);
    if (!theme) continue;
    const existing = byTheme.get(theme) ?? [];
    existing.push(leak);
    byTheme.set(theme, existing);
  }

  // Ordem fixa: pré-flop → pós-flop → avançado (mesma sequência das fases)
  const order: ThemeId[] = ["preflop", "postflop_srp", "advanced"];

  return order
    .filter((id) => byTheme.has(id))
    .map<LeakTheme>((id) => {
      const themeLeaks = byTheme.get(id)!;
      const config = THEMES[id];
      const totalErrors = themeLeaks.reduce((acc, l) => acc + l.errors, 0);
      const totalAttempts = themeLeaks.reduce((acc, l) => acc + l.total, 0);
      const affectedSpots = themeLeaks
        .map((l) => {
          const acc = l.total > 0 ? ((l.total - l.errors) / l.total) * 100 : 0;
          return {
            // 1 leak = 1 treino — label simplificado pra topic, sem
            // posição/stack (ambos são representativos, não definem
            // bucketing). Ver leakAnalysis.topicKey.
            label: l.actionLabel,
            accuracyPct: Math.round(acc),
            errors: l.errors,
            total: l.total,
          };
        })
        .sort((a, b) => a.accuracyPct - b.accuracyPct); // pior primeiro

      return {
        id,
        title: config.title,
        emoji: config.emoji,
        phaseLabel: config.phaseLabel,
        totalErrors,
        totalAttempts,
        affectedCount: themeLeaks.length,
        affectedSpots,
        cta: config.ctaTemplate(themeLeaks.length),
      };
    });
}
