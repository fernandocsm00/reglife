import { notFound } from "next/navigation";
import { DiagnosticoScreen } from "@/components/trainer/DiagnosticoScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Ordem do percurso: Tier 1 (123 mãos) → Tier 2 (59 mãos) = 182 total
// Com early stop (3 spots reprovados) a maioria termina muito antes.
//
// Tier 1: RFI(19) → Cbet(11) → Vs RFI(41) → BW SB GAP(7) → BW SB vs ISO(6)
//         → BW BB vs Limp(15) → BW BB vs Raise(9) → Vs Cbet BB(15)
// Tier 2: Multiway(22) → Vs 3bet EP(16) → Vs 3bet BTN(10) → Cbet Turn(11)
const TRAINER_SEQUENCE = [
  // Tier 1
  "reglife-rfi-prioridades",
  "reglife-cbet-flop-vs-bb",
  "reglife-vs-rfi",
  "reglife-blind-war-sb-gap",
  "reglife-blind-war-sb-vs-iso",
  "reglife-blind-war-bb-vs-limp",
  "reglife-blind-war-bb-vs-raise",
  "reglife-vs-cbet-flop-bb",
  // Tier 2
  "reglife-multiway-bb",
  "reglife-vs-3bet-ep",
  "reglife-vs-3bet-btn",
  "reglife-cbet-turn-vs-bb",
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
