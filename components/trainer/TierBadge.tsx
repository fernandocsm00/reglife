"use client";

/**
 * TierBadge — bloco destacado no topo de /meu-plano com o tier do aluno.
 *
 * Renderizado ANTES do título do plano. Cor por playerTier (amber/orange/red).
 * Sem sticky scroll — sai do viewport naturalmente.
 *
 * Mostra:
 * - eyebrow "🎯 VOCÊ É TIER N" (cor do tier)
 * - linha principal: playerTierLabel (ex: "Tier 2 · Intermediário")
 * - linha secundária: "{accuracyPct}% de acerto no diagnóstico"
 *
 * Fallbacks (planos persistidos em localStorage antes do field existir
 * no SavedPlan — runtime pode ter undefined apesar do tipo TS):
 * - playerTier ausente → Tier 1 (amber).
 * - playerTierLabel ausente → "Tier ?".
 * - accuracyPct ausente → linha secundária omite a parte do %.
 *
 * Usa <div> + <p> em vez de heading semântico pra evitar quebrar a ordem
 * h1 do título do plano (TierBadge renderiza ANTES do <h1>).
 */

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  TIER_BORDER,
  TIER_ACCENT_BG,
  TIER_FG,
} from "@/lib/poker/tierTheme";
import { getTierCopy } from "@/lib/poker/tierCopy";

interface Props {
  plan: SavedPlan;
}

export function TierBadge({ plan }: Props) {
  const tier = plan.playerTier ?? 1;
  const border = TIER_BORDER[tier] ?? TIER_BORDER[1];
  const bg = TIER_ACCENT_BG[tier] ?? TIER_ACCENT_BG[1];
  const fg = TIER_FG[tier] ?? TIER_FG[1];
  const copy = getTierCopy(tier);

  const label = plan.playerTierLabel ?? "Tier ?";
  const accuracy = plan.accuracyPct;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`rg-card border ${border} ${bg}`}
      style={{ padding: 20, borderRadius: "var(--rg-r-lg)", marginBottom: 16 }}
    >
      <p className={`rg-eyebrow ${fg}`}>{copy.badgeEyebrow}</p>
      <p className="rg-h3" style={{ marginTop: 6 }}>{label}</p>
      <p className="rg-caption" style={{ marginTop: 4 }}>
        {accuracy != null
          ? `${accuracy}% de acerto no diagnóstico`
          : "Resultado do diagnóstico não disponível"}
      </p>
    </motion.div>
  );
}
