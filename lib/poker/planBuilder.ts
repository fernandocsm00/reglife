// Transforms a raw DiagnosticSummary + onboarding answers into a
// fully-materialized 90-day SavedPlan with 3 phases.

import type { DiagnosticSummary } from "./leakAnalysis";
import type { LessonRef } from "./lessonCatalog";
import {
  nextAttemptMeta,
  type ProfitGoal,
  type PlanPhase,
  type PlanPhaseTask,
  type SavedPlan,
  type StudyTime,
} from "./planStorage";

interface BuildPlanInput {
  summary: DiagnosticSummary;
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  previous: SavedPlan | null;
  stoppedEarly?: boolean;
  spotsPlayed?: number;
  spotsFailed?: number;
  volumeTargetWeekly?: number;
}

export const STUDY_TIME_LABELS: Record<StudyTime, string> = {
  ate15: "Até 15h de estudo por semana",
  ate40: "Até 40h de estudo por semana",
  mais40: "Mais de 40h de estudo por semana",
};

export const PROFIT_GOAL_LABELS: Record<ProfitGoal, string> = {
  usd1k: "U$ 1.000 em 12 meses",
  usd10k: "U$ 10.000 em 12 meses",
  usd50k: "U$ 50.000 em 12 meses",
  usd100k: "U$ 100.000 em 12 meses",
};

/** Texto motivacional curto para usar no plano */
export const PROFIT_GOAL_ADVICE: Record<ProfitGoal, string> = {
  usd1k:
    "Com essa meta, foque em construir fundamentos sólidos e consistência. Domine os spots básicos de Tier 1, estude com disciplina e aumente o volume gradualmente. É o primeiro passo pra criar uma base rentável.",
  usd10k:
    "Para U$ 10K/ano você precisa dominar todos os spots de Tier 1 e 2, jogar pelo menos 100-200 torneios/mês e manter uma taxa de ROI saudável. O plano abaixo vai te preparar pra isso.",
  usd50k:
    "Essa meta exige domínio completo de Tier 2, volume alto (+300 torneios/mês) e um edge consistente nos fields regulares. O plano foca em eliminar seus leaks mais caros pra maximizar seu ROI.",
  usd100k:
    "U$ 100K/ano é nível profissional de elite. Você precisa de Tier 3 sólido, volume intenso e BRM impecável. O plano vai atacar cada fraqueza cirurgicamente pra te colocar nesse patamar.",
};

const STUDY_TASKS: Record<StudyTime, Record<PlanPhase["id"], string[]>> = {
  ate15: {
    fase1: [
      "Assistir 2 aulas por semana das recomendadas abaixo",
      "Rodar 100 mãos por semana no simulador do trainer afetado",
      "Anotar 5 mãos da sua sessão real e revisar no fim da semana",
    ],
    fase2: [
      "Assistir 2 aulas por semana das recomendadas",
      "Rodar 100 mãos por semana focando os leaks 2 e 3",
      "Postar 1 dúvida no canal #plano-de-90-dias",
    ],
    fase3: [
      "Jogar 2 sessões reais por semana com foco nos leaks corrigidos",
      "Fazer 1 review semanal comparando antes vs depois",
      "Refazer o nivelamento ao final do ciclo",
    ],
  },
  ate40: {
    fase1: [
      "Assistir 4 aulas por semana das recomendadas abaixo",
      "Rodar 200 mãos por semana no simulador do trainer afetado",
      "Fazer 2 reviews semanais (5 mãos cada) com journaling",
    ],
    fase2: [
      "Assistir 3 aulas por semana das recomendadas",
      "Rodar 200 mãos por semana focando os leaks 2 e 3",
      "Buscar sparring semanal com outro aluno da reglife",
    ],
    fase3: [
      "Jogar 3+ sessões reais por semana aplicando o que estudou",
      "Fazer 2 reviews semanais comparando antes vs depois",
      "Refazer o nivelamento e postar evolução na comunidade",
    ],
  },
  mais40: {
    fase1: [
      "Assistir 6 aulas por semana das recomendadas abaixo",
      "Rodar 400 mãos por semana no simulador do trainer afetado",
      "Fazer 3 reviews semanais com journaling detalhado",
    ],
    fase2: [
      "Assistir 4 aulas por semana das recomendadas",
      "Rodar 400 mãos por semana focando os leaks 2 e 3",
      "Liderar 1 sparring semanal com outro aluno da reglife",
    ],
    fase3: [
      "Jogar 4+ sessões reais por semana no seu volume alvo",
      "Fazer 3 reviews semanais comparando antes vs depois",
      "Refazer o nivelamento e mentorar 1 aluno novo na comunidade",
    ],
  },
};

function studyTasks(
  studyTime: StudyTime,
  phaseId: PlanPhase["id"]
): PlanPhaseTask[] {
  return STUDY_TASKS[studyTime][phaseId].map((text, i) => ({
    id: `${phaseId}-task-${i}`,
    text,
  }));
}

function uniqueLessons(lessons: LessonRef[]): LessonRef[] {
  const seen = new Set<string>();
  const out: LessonRef[] = [];
  for (const l of lessons) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  return out;
}

export function buildPlan({
  summary,
  playerName,
  email,
  phone,
  studyTime,
  profitGoal,
  previous,
  stoppedEarly = false,
  spotsPlayed = 0,
  spotsFailed = 0,
  volumeTargetWeekly,
}: BuildPlanInput): SavedPlan {
  const sortedLeaks = summary.leaks;

  const phase1Lessons = uniqueLessons(sortedLeaks[0]?.lessons ?? []).slice(0, 4);

  const phase2Lessons = uniqueLessons(
    [sortedLeaks[1], sortedLeaks[2]]
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .flatMap((l) => l.lessons)
  ).slice(0, 4);

  const phase3Lessons = uniqueLessons(
    sortedLeaks.slice(3).flatMap((l) => l.lessons)
  ).slice(0, 3);

  const phases: PlanPhase[] = [
    {
      id: "fase1",
      title: "Fundamentos",
      rangeLabel: "Dias 1-30",
      focus: sortedLeaks[0]
        ? `Corrigir o leak nº1: ${sortedLeaks[0].action} ${sortedLeaks[0].position} ${sortedLeaks[0].stackBand}. Esse é o ponto que mais te custa fichas hoje.`
        : "Reforçar fundamentos de RFI e C-Bet com as aulas base da reglife.",
      tasks: studyTasks(studyTime, "fase1"),
      lessons: phase1Lessons,
    },
    {
      id: "fase2",
      title: "Aplicação",
      rangeLabel: "Dias 31-60",
      focus: sortedLeaks[1]
        ? "Atacar leaks 2 e 3 e começar a revisar mãos próprias com método."
        : "Aplicar o que aprendeu em sessões reais e revisar mãos próprias.",
      tasks: studyTasks(studyTime, "fase2"),
      lessons: phase2Lessons,
    },
    {
      id: "fase3",
      title: "Integração",
      rangeLabel: "Dias 61-90",
      focus:
        "Voltar à mesa real, medir sua evolução e refazer o nivelamento ao final do ciclo. É aqui que você compara o jogador de 90 dias atrás com quem você virou.",
      tasks: studyTasks(studyTime, "fase3"),
      lessons: phase3Lessons,
    },
  ];

  const meta = nextAttemptMeta(previous);

  return {
    version: 1,
    id: `plan-${Date.now()}`,
    createdAt: Date.now(),
    playerName,
    email,
    phone,
    studyTime,
    profitGoal,
    volumeTargetWeekly: volumeTargetWeekly ?? previous?.volumeTargetWeekly,
    playerTier: summary.playerTier,
    playerTierLabel: summary.playerTierLabel,
    accuracyPct: summary.accuracyPct,
    totalCorrect: summary.totalCorrect,
    totalErrors: summary.totalErrors,
    totalDrills: summary.totalDrills,
    stoppedEarly,
    spotsPlayed,
    spotsFailed,
    byTrainer: summary.byTrainer,
    leaks: summary.leaks,
    phases,
    progress: {
      checkedLessonUrls: [],
      checkedTaskIds: [],
    },
    attempts: meta.attempts,
    lockedUntil: meta.lockedUntil,
  };
}
