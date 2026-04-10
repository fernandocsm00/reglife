import { notFound } from "next/navigation";
import { DiagnosticoScreen } from "@/components/trainer/DiagnosticoScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Ordem do percurso: RFI → C-Bet → Vs RFI  (Tier 1 completo)
const TRAINER_SEQUENCE = [
  "reglife-rfi-prioridades",
  "reglife-cbet-flop-vs-bb",
  "reglife-vs-rfi",
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
