/**
 * Copy adaptada por tier do aluno.
 *
 * 3 campos por tier:
 * - badgeEyebrow: eyebrow do TierBadge ("🎯 VOCÊ É TIER N")
 * - planHeaderBlurb: linha extra de contexto motivacional no header de
 *   /meu-plano (logo abaixo do subtítulo informativo existente)
 * - scoreboardContext: linha de contexto curta no MonthlyScoreboard
 *   (logo abaixo do título "Metas do mês")
 *
 * Consumidores usam `getTierCopy(tier)` pra resolver com fallback Tier 1.
 */

export interface TierCopy {
  badgeEyebrow: string;
  planHeaderBlurb: string;
  scoreboardContext: string;
}

export const TIER_COPY: Record<number, TierCopy> = {
  1: {
    badgeEyebrow: "🎯 VOCÊ É TIER 1",
    planHeaderBlurb:
      "Foque em consistência. Domine os fundamentos antes de subir.",
    scoreboardContext:
      "Tier 1 é construção de base — disciplina semanal vale mais que ousadia.",
  },
  2: {
    badgeEyebrow: "🎯 VOCÊ É TIER 2",
    planHeaderBlurb:
      "Reg de Reg — refine os spots de alta frequência e elimine vazamentos caros.",
    scoreboardContext:
      "Tier 2 vive de detalhes. Cada % a mais de acerto vira ROI.",
  },
  3: {
    badgeEyebrow: "🎯 VOCÊ É TIER 3",
    planHeaderBlurb:
      "Você joga no topo. Cada decisão vale dinheiro grande — precisão acima de tudo.",
    scoreboardContext:
      "Tier 3 é território de elite. O placar abaixo te lembra do padrão que você precisa manter.",
  },
};

/**
 * Resolve copy do tier com fallback Tier 1 quando `tier` é undefined/null
 * (planos antigos) ou fora do range conhecido (1..3).
 */
export function getTierCopy(tier: number | null | undefined): TierCopy {
  return TIER_COPY[tier ?? 1] ?? TIER_COPY[1];
}
