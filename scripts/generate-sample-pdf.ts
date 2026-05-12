// scripts/generate-sample-pdf.ts — Gera um PDF de amostra pra revisão visual.
// Uso: npx tsx scripts/generate-sample-pdf.ts
// Saída: ./sample-plan.pdf

import { writeFileSync } from "node:fs";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import type { SavedPlan } from "@/lib/poker/planStorage";

const samplePlan: SavedPlan = {
  version: 1,
  id: "sample-id",
  createdAt: Date.now(),
  playerName: "Fernando Reglife",
  email: "fernando@reglife.com.br",
  phone: "+5511999999999",
  studyTime: "ate40",
  profitGoal: "usd10k",
  volumeTargetWeekly: 80,
  playerTier: 2,
  playerTierLabel: "Reg de Reg",
  accuracyPct: 72,
  totalCorrect: 13,
  totalErrors: 5,
  totalDrills: 18,
  stoppedEarly: false,
  spotsPlayed: 18,
  spotsFailed: 2,
  byTrainer: [
    { label: "RFI · 15bb · BTN", correct: 2, total: 3, pct: 66 },
    { label: "RFI · 25bb · CO", correct: 3, total: 3, pct: 100 },
    { label: "Vs RFI · 15bb · HJ", correct: 1, total: 3, pct: 33 },
    { label: "Vs RFI · 50bb · BTN", correct: 2, total: 3, pct: 66 },
    { label: "Vs 3-bet · CO", correct: 3, total: 3, pct: 100 },
    { label: "C-Bet · BTN", correct: 2, total: 3, pct: 66 },
  ],
  leaks: [
    {
      id: "vsrfi-hj-15",
      action: "vsOpen",
      actionLabel: "Vs RFI",
      position: "HJ",
      stackBand: "15bb",
      errors: 2,
      total: 3,
      examples: [],
      recommendation:
        "Você está pagando demais com mão marginal contra UTG em short stack. Foco em folds disciplinados.",
      lessons: [],
    },
    {
      id: "rfi-btn-15",
      action: "RFI",
      actionLabel: "RFI",
      position: "BTN",
      stackBand: "15bb",
      errors: 1,
      total: 3,
      examples: [],
      recommendation:
        "Tá abrindo apertado demais no BTN com 15bb. Em short stack o BTN é uma das melhores posições — alarga o range.",
      lessons: [],
    },
    {
      id: "cbet-btn-100",
      action: "cBet",
      actionLabel: "C-Bet",
      position: "BTN",
      stackBand: "100bb",
      errors: 1,
      total: 3,
      examples: [],
      recommendation:
        "Em boards drawy você tá c-betando demais como blefe puro. Escolhe melhor as texturas.",
      lessons: [],
    },
  ],
  phases: [
    {
      id: "fase1",
      title: "Fase 1 · Fundamentos",
      rangeLabel: "Dias 0-30",
      focus: "Corrigir leaks de pré-flop short stack",
      tasks: [
        { id: "t1", text: "Estudar ranges de RFI por posição em 15bb" },
        { id: "t2", text: "Drill diário de 50 mãos no trainer (15-25bb)" },
        { id: "t3", text: "Revisar 3 sessões na semana usando filtro de short stack" },
      ],
      lessons: [],
    },
    {
      id: "fase2",
      title: "Fase 2 · Aplicação",
      rangeLabel: "Dias 30-60",
      focus: "Defesa de BB e jogo pós-flop em pots single-raised",
      tasks: [
        { id: "t4", text: "Aulas de defesa de BB por stack depth" },
        { id: "t5", text: "Drill de Vs C-Bet do BB no trainer" },
      ],
      lessons: [],
    },
    {
      id: "fase3",
      title: "Fase 3 · Integração",
      rangeLabel: "Dias 60-90",
      focus: "Spots avançados (3-bet pots, ICM, multiway)",
      tasks: [
        { id: "t6", text: "Aulas de pote tribetado e ICM básico" },
        { id: "t7", text: "Sessões longas (3+ horas) com review pelo SharkScope" },
      ],
      lessons: [],
    },
  ],
  progress: { checkedLessonUrls: [], checkedTaskIds: [] },
  attempts: 1,
};

async function main() {
  console.log("Gerando PDF de amostra...");
  const buffer = await generatePlanPdf(samplePlan);
  const out = "sample-plan.pdf";
  writeFileSync(out, buffer);
  console.log(`✓ Gerado: ${out} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
