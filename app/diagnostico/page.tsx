import { notFound } from "next/navigation";
import { DiagnosticoScreen } from "@/components/trainer/DiagnosticoScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Ordem do percurso. Com early stop (3 spots reprovados) a maioria
// termina muito antes do final.
//
// Tier 1 (sequência Cbet segue Flop → Turn → River):
//   RFI(19) → Cbet Flop vs BB(11) → Cbet Turn vs BB(11) → Cbet River vs BB(11)
//   → Vs RFI(27) → Defesa de BB(14) → BW SB GAP(7) → BW SB vs ISO(6)
//   → BW BB vs Limp(15) → BW BB vs Raise(9) → Vs Cbet Flop BB(15)
// Tier 2:
//   Multiway(22) → Vs 3bet EP(16) → Vs 3bet BTN(10)
//   → Cbet vs BTN(15) → Vs Cbet Flop BTN(12) → Bet vs Missed BTN(6)
const TRAINER_SEQUENCE = [
  // Tier 1
  "reglife-rfi-prioridades",
  "reglife-cbet-flop-vs-bb",
  "reglife-cbet-turn-vs-bb",
  "reglife-cbet-river-vs-bb",
  "reglife-vs-rfi",
  "reglife-defesa-bb",
  "reglife-blind-war-sb-gap",
  "reglife-blind-war-sb-vs-iso",
  "reglife-blind-war-bb-vs-limp",
  "reglife-blind-war-bb-vs-raise",
  "reglife-vs-cbet-flop-bb",
  // Tier 2
  "reglife-multiway-bb",
  "reglife-vs-3bet-ep",
  "reglife-vs-3bet-btn",
  "reglife-cbet-vs-btn",
  "reglife-vs-cbet-flop-btn",
  "reglife-cbet-flop-btn-missed",
];

export default async function DiagnosticoPage() {
  const configs = await Promise.all(
    TRAINER_SEQUENCE.map((slug) => loadSpotConfig(slug))
  );

  if (configs.some((c) => !c)) {
    notFound();
  }

  return <DiagnosticoScreen initialConfigs={configs} />;
}
