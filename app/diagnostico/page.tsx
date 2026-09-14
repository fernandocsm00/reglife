import { notFound } from "next/navigation";
import { DiagnosticoScreen } from "@/components/trainer/DiagnosticoScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Ordem do percurso = Nivelamento Light (190 mãos). Com early stop
// (3 spots reprovados) a maioria termina muito antes do final.
// Mãos: scripts/nivelamento-light.data.ts (sync + check em scripts/).
//
// Tier 1 (115):
//   RFI(15) → Cbet Flop vs BB(10) → Cbet Turn+River vs BB(20)
//   → Vs RFI(20) → Defesa de BB(10) → BW SB GAP(7) → BW SB vs ISO(5)
//   → BW BB vs Limp(8) → BW BB vs Raise(5) → Vs Cbet Flop BB(15)
// Tier 2 (75):
//   Multiway(20) → Vs 3bet EP(15) → Vs 3bet BTN(10)
//   → Cbet vs BTN(15) → Vs Cbet Flop BTN(10) → Bet vs Missed BTN(5)
const TRAINER_SEQUENCE = [
  // Tier 1
  "reglife-rfi-prioridades",
  "reglife-cbet-flop-vs-bb",
  "reglife-cbet-turn-river-vs-bb",
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
