import { notFound } from "next/navigation";
import { DiagnosticoScreen } from "@/components/trainer/DiagnosticoScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Ordem do percurso Tier 1 completo (123 mãos):
// RFI(19) → Cbet(11) → Vs RFI(41) → Blind War SB GAP(7) → SB vs ISO(6)
// → BB vs Limp(15) → BB vs Raise(9) → Vs Cbet Flop BB(15)
const TRAINER_SEQUENCE = [
  "reglife-rfi-prioridades",
  "reglife-cbet-flop-vs-bb",
  "reglife-vs-rfi",
  "reglife-blind-war-sb-gap",
  "reglife-blind-war-sb-vs-iso",
  "reglife-blind-war-bb-vs-limp",
  "reglife-blind-war-bb-vs-raise",
  "reglife-vs-cbet-flop-bb",
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
