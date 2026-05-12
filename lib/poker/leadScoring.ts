// lib/poker/leadScoring.ts — Lead scoring quiz: tipos, pontuação,
// categorização e mapeamento pros campos legacy do planBuilder.
//
// O quiz tem 6 perguntas. 5 são pontuadas (idade, tempo, objetivo, abi,
// volume) e somam até 25 pontos. A 6ª (banca) determina o "stake grade"
// recomendado em USD mas não entra no score.

import type { ProfitGoal, StudyTime } from "./planStorage";

// ---------------------------------------------------------------------------
// Tipos das opções de cada pergunta
// ---------------------------------------------------------------------------

export type IdadeAnswer = "18_24" | "25_34" | "35_44" | "45_54" | "55_plus";
export type TempoAnswer = "menos_1" | "1_2" | "2_3" | "3_5" | "mais_5";
export type ObjetivoAnswer =
  | "diversao"
  | "competitivo"
  | "renda_extra"
  | "profissional"
  | "ja_vive";
export type AbiAnswer = "nao_sei" | "lt_5" | "5_13" | "13_23" | "23_54" | "gt_54";
export type VolumeAnswer =
  | "nao_sei"
  | "lt_100"
  | "100_200"
  | "200_300"
  | "gt_300";
export type BancaAnswer =
  | "lt_875"
  | "876_2000"
  | "2001_3000"
  | "3001_5000"
  | "5001_7500"
  | "7501_10000"
  | "10001_15000"
  | "gt_15000";

export interface QuizAnswers {
  idade: IdadeAnswer;
  tempo: TempoAnswer;
  objetivo: ObjetivoAnswer;
  abi: AbiAnswer;
  volume: VolumeAnswer;
  banca: BancaAnswer;
}

export type LeadCategory = "frio" | "morno" | "quente" | "super_quente";

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
  super_quente: "Super Quente",
};

// ---------------------------------------------------------------------------
// Configuração de cada pergunta (label + opções + pontos)
// ---------------------------------------------------------------------------

export interface QuizOption<T extends string> {
  value: T;
  label: string;
  points: number;
}

export const IDADE_OPTIONS: QuizOption<IdadeAnswer>[] = [
  { value: "18_24", label: "18 a 24 anos", points: 3 },
  { value: "25_34", label: "25 a 34 anos", points: 5 },
  { value: "35_44", label: "35 a 44 anos", points: 4 },
  { value: "45_54", label: "45 a 54 anos", points: 2 },
  { value: "55_plus", label: "55 anos ou mais", points: 1 },
];

export const TEMPO_OPTIONS: QuizOption<TempoAnswer>[] = [
  { value: "menos_1", label: "Há menos de 1 ano", points: 1 },
  { value: "1_2", label: "Entre 1 e 2 anos", points: 2 },
  { value: "2_3", label: "Entre 2 e 3 anos", points: 3 },
  { value: "3_5", label: "Entre 3 e 5 anos", points: 4 },
  { value: "mais_5", label: "Há mais de 5 anos", points: 5 },
];

export const OBJETIVO_OPTIONS: QuizOption<ObjetivoAnswer>[] = [
  {
    value: "diversao",
    label: "Apenas me divertir, não me preocupo com resultado",
    points: 0,
  },
  {
    value: "competitivo",
    label: "Quero ser competitivo, mas não pretendo viver do jogo",
    points: 2,
  },
  {
    value: "renda_extra",
    label: "Ter renda extra, poder contar com os ganhos no jogo",
    points: 4,
  },
  {
    value: "profissional",
    label: "Ser profissional, ter o jogo como renda principal",
    points: 5,
  },
  {
    value: "ja_vive",
    label: "Já vivo do poker e quero escalar os limites",
    points: 3,
  },
];

export const ABI_OPTIONS: QuizOption<AbiAnswer>[] = [
  { value: "nao_sei", label: "Não sei", points: 0 },
  { value: "lt_5", label: "Menor que $5", points: 5 },
  { value: "5_13", label: "Entre $5 e $13", points: 5 },
  { value: "13_23", label: "Entre $13 e $23", points: 4 },
  { value: "23_54", label: "Entre $23 e $54", points: 3 },
  { value: "gt_54", label: "Maior que $54", points: 1 },
];

export const VOLUME_OPTIONS: QuizOption<VolumeAnswer>[] = [
  { value: "nao_sei", label: "Não sei", points: 0 },
  { value: "lt_100", label: "Menos de 100 torneios", points: 2 },
  { value: "100_200", label: "Entre 100 e 200 torneios", points: 3 },
  { value: "200_300", label: "Entre 200 e 300 torneios", points: 4 },
  { value: "gt_300", label: "Mais de 300 torneios", points: 5 },
];

export const BANCA_OPTIONS: QuizOption<BancaAnswer>[] = [
  { value: "lt_875", label: "Menor que $875", points: 0 },
  { value: "876_2000", label: "$876 a $2.000", points: 0 },
  { value: "2001_3000", label: "$2.001 a $3.000", points: 0 },
  { value: "3001_5000", label: "$3.001 a $5.000", points: 0 },
  { value: "5001_7500", label: "$5.001 a $7.500", points: 0 },
  { value: "7501_10000", label: "$7.501 a $10.000", points: 0 },
  { value: "10001_15000", label: "$10.001 a $15.000", points: 0 },
  { value: "gt_15000", label: "Maior que $15.000", points: 0 },
];

/**
 * Stake recomendada (grade USD) baseada na banca declarada. Não pontua,
 * só é usado pra orientar o aluno e pro admin saber em que stake o lead joga.
 */
export const BANCA_GRADE: Record<BancaAnswer, number> = {
  lt_875: 1,
  "876_2000": 2.5,
  "2001_3000": 4,
  "3001_5000": 7,
  "5001_7500": 10,
  "7501_10000": 13,
  "10001_15000": 19,
  gt_15000: 28,
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function pointsFor<T extends string>(
  options: QuizOption<T>[],
  value: T
): number {
  return options.find((o) => o.value === value)?.points ?? 0;
}

export function computeLeadScore(a: QuizAnswers): number {
  return (
    pointsFor(IDADE_OPTIONS, a.idade) +
    pointsFor(TEMPO_OPTIONS, a.tempo) +
    pointsFor(OBJETIVO_OPTIONS, a.objetivo) +
    pointsFor(ABI_OPTIONS, a.abi) +
    pointsFor(VOLUME_OPTIONS, a.volume)
  );
}

export function computeLeadCategory(score: number): LeadCategory {
  if (score >= 21) return "super_quente";
  if (score >= 13) return "quente";
  if (score >= 8) return "morno";
  return "frio";
}

export function computeStakeGrade(a: QuizAnswers): number {
  return BANCA_GRADE[a.banca];
}

// ---------------------------------------------------------------------------
// Mapeamento pros campos legacy do planBuilder
// ---------------------------------------------------------------------------

/**
 * Q3 (objetivo) → profit_goal. O plano antigo usa profit_goal pra escolher
 * a difuldade do plano e o texto motivacional na seção PROFIT_GOAL_ADVICE.
 */
export function objetivoToProfitGoal(objetivo: ObjetivoAnswer): ProfitGoal {
  switch (objetivo) {
    case "diversao":
    case "competitivo":
      return "usd1k";
    case "renda_extra":
      return "usd10k";
    case "ja_vive":
      return "usd50k";
    case "profissional":
      return "usd100k";
  }
}

/**
 * Q5 (volume mensal) → volume_target_weekly. Pega o limite superior do bucket
 * e divide por 4 (semanas/mês).
 */
export function volumeToWeeklyTarget(volume: VolumeAnswer): number {
  switch (volume) {
    case "nao_sei":
    case "lt_100":
      return 25; // ~100/mês
    case "100_200":
      return 50;
    case "200_300":
      return 75;
    case "gt_300":
      return 100;
  }
}

/**
 * Quiz não pergunta studyTime explicitamente. Default conservador.
 * (Pode ser refinado depois — ex.: derivar de Q5+Q3.)
 */
export function defaultStudyTime(): StudyTime {
  return "ate15";
}
