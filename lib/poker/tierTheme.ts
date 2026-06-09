/**
 * Mapas de cor por tier (amber/orange/red).
 *
 * Originalmente embutidos em SpotCard.tsx; centralizados aqui pra reuso
 * em TierBadge (cor do tier do aluno) sem duplicação.
 *
 * Tailwind classes esperam Record<number, string> indexado pelo número
 * do tier. Consumidores devem aplicar fallback `?? TIER_*[1]` pra planos
 * antigos onde `tier` pode estar undefined.
 */

export const TIER_BORDER: Record<number, string> = {
  1: "border-amber-400/40",
  2: "border-orange-400/40",
  3: "border-red-400/40",
};

export const TIER_ACCENT_BG: Record<number, string> = {
  1: "bg-amber-400/5",
  2: "bg-orange-400/5",
  3: "bg-red-400/5",
};

export const TIER_FG: Record<number, string> = {
  1: "text-amber-300",
  2: "text-orange-300",
  3: "text-red-300",
};
