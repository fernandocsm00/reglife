// lib/poker/leadScoring.ts — Quiz do onboarding (v3, Nivelamento Light).
//
// Perguntas e opções copiadas do doc "TST | pesquisa lead scoring". A ordem
// das opções importa: `answerRank` (posição da opção) é o que as regras de
// produto em lib/poker/productFit.ts comparam.
//
// Substitui o v1 (lead score 0–25 com tempo/volume e banca em 8 faixas).

import type { ProfitGoal, StudyTime } from "./planStorage";

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------

export type IdadeAnswer = "18_24" | "25_34" | "35_44" | "45_54" | "55_mais";
export type TempoJogoAnswer = "aprendendo" | "lt_1" | "1_3" | "3_5" | "gt_5";
export type ObjetivoAnswer =
  | "diversao"
  | "competir"
  | "renda_extra"
  | "profissional"
  | "ja_vive";
export type AbiAnswer = "nao_sei" | "lt_5" | "5_13" | "13_23" | "23_54" | "gt_54";
export type TorneiosMesAnswer = "nao_sei" | "lt_100" | "100_200" | "200_300" | "gt_300";
export type BancaAnswer =
  | "lt_875"
  | "875_2000"
  | "2001_5000"
  | "5001_10000"
  | "gt_10000";

export interface QuizAnswers {
  idade: IdadeAnswer;
  tempoJogo: TempoJogoAnswer;
  objetivo: ObjetivoAnswer;
  abi: AbiAnswer;
  torneiosMes: TorneiosMesAnswer;
  banca: BancaAnswer;
}

export type QuizKey = keyof QuizAnswers;

export interface QuizOption<T extends string> {
  value: T;
  label: string;
}

export interface QuizQuestion {
  key: QuizKey;
  title: string;
  sub?: string;
  options: readonly QuizOption<string>[];
}

// ---------------------------------------------------------------------------
// Opções (ordem = rank, do menor pro maior)
// ---------------------------------------------------------------------------

export const IDADE_OPTIONS: QuizOption<IdadeAnswer>[] = [
  { value: "18_24", label: "18 a 24 anos" },
  { value: "25_34", label: "25 a 34 anos" },
  { value: "35_44", label: "35 a 44 anos" },
  { value: "45_54", label: "45 a 54 anos" },
  { value: "55_mais", label: "55 anos ou mais" },
];

export const TEMPO_JOGO_OPTIONS: QuizOption<TempoJogoAnswer>[] = [
  { value: "aprendendo", label: "Estou aprendendo agora" },
  { value: "lt_1", label: "Há menos de 1 ano" },
  { value: "1_3", label: "Entre 1 e 3 anos" },
  { value: "3_5", label: "Entre 3 e 5 anos" },
  { value: "gt_5", label: "Há mais de 5 anos" },
];

export const OBJETIVO_OPTIONS: QuizOption<ObjetivoAnswer>[] = [
  { value: "diversao", label: "Diversão, não me preocupo com resultado" },
  { value: "competir", label: "Competir, mas não pretendo viver do jogo" },
  { value: "renda_extra", label: "Renda extra, poder contar com os ganhos no jogo" },
  { value: "profissional", label: "Ser profissional, ter o jogo como renda principal" },
  { value: "ja_vive", label: "Já vivo do poker e quero crescer na carreira" },
];

export const ABI_OPTIONS: QuizOption<AbiAnswer>[] = [
  { value: "nao_sei", label: "Não sei" },
  { value: "lt_5", label: "Abaixo de $5" },
  { value: "5_13", label: "Entre $5 e $13" },
  { value: "13_23", label: "Entre $13 e $23" },
  { value: "23_54", label: "Entre $23 e $54" },
  { value: "gt_54", label: "Acima de $54" },
];

export const TORNEIOS_MES_OPTIONS: QuizOption<TorneiosMesAnswer>[] = [
  { value: "nao_sei", label: "Não sei" },
  { value: "lt_100", label: "Menos de 100 torneios" },
  { value: "100_200", label: "Entre 100 e 200 torneios" },
  { value: "200_300", label: "Entre 200 e 300 torneios" },
  { value: "gt_300", label: "Mais de 300 torneios" },
];

export const BANCA_OPTIONS: QuizOption<BancaAnswer>[] = [
  { value: "lt_875", label: "Menor que $875" },
  { value: "875_2000", label: "$875 a $2.000" },
  { value: "2001_5000", label: "$2.001 a $5.000" },
  { value: "5001_10000", label: "$5.001 a $10.000" },
  { value: "gt_10000", label: "Maior que $10.000" },
];

/** Perguntas na ordem do form (uma tela cada, depois da identidade). */
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { key: "idade", title: "Qual é a sua idade?", options: IDADE_OPTIONS },
  { key: "tempoJogo", title: "Há quanto tempo você joga poker?", options: TEMPO_JOGO_OPTIONS },
  { key: "objetivo", title: "Qual é o seu objetivo no poker?", options: OBJETIVO_OPTIONS },
  {
    key: "abi",
    title:
      "Segundo o Sharkscope, qual é o seu ABI (buy-in médio) em dólares nos últimos 6 meses?",
    options: ABI_OPTIONS,
  },
  {
    key: "torneiosMes",
    title:
      "Segundo o Sharkscope, quantos torneios você joga por mês atualmente (pode ser a média dos últimos 6 meses)?",
    options: TORNEIOS_MES_OPTIONS,
  },
  {
    key: "banca",
    title: "Qual é a sua banca (em dólares) neste momento?",
    sub:
      "Lembre-se: sua banca (bankroll) não é apenas o que você tem nas suas contas de cada site hoje, mas todo o dinheiro que você tem disponível para o poker. Caso você tenha condições de depositar mais (mesmo que não faça isso agora), some esse valor ao que você já tem nos sites.",
    options: BANCA_OPTIONS,
  },
];

const OPTIONS_BY_KEY: Record<QuizKey, readonly QuizOption<string>[]> = {
  idade: IDADE_OPTIONS,
  tempoJogo: TEMPO_JOGO_OPTIONS,
  objetivo: OBJETIVO_OPTIONS,
  abi: ABI_OPTIONS,
  torneiosMes: TORNEIOS_MES_OPTIONS,
  banca: BANCA_OPTIONS,
};

/** Posição da opção na pergunta (0 = primeira). -1 quando inválida/ausente. */
export function answerRank(key: QuizKey, value: string | null | undefined): number {
  if (!value) return -1;
  return OPTIONS_BY_KEY[key].findIndex((o) => o.value === value);
}

/** Label human-readable da resposta, ou null se o valor não existe no quiz v3 (ex.: quiz v1). */
export function labelOf(key: QuizKey, value: string | null | undefined): string | null {
  if (!value) return null;
  return OPTIONS_BY_KEY[key].find((o) => o.value === value)?.label ?? null;
}

/**
 * Valida um payload vindo do cliente/banco. Retorna só as 6 chaves do quiz v3,
 * ou null se faltar alguma ou algum valor for desconhecido (ex.: quiz v1).
 */
export function parseQuizAnswers(raw: unknown): QuizAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(OPTIONS_BY_KEY) as QuizKey[]) {
    const v = r[key];
    if (typeof v !== "string" || answerRank(key, v) < 0) return null;
    out[key] = v;
  }
  return out as unknown as QuizAnswers;
}

// ---------------------------------------------------------------------------
// Derivações pro plano
// ---------------------------------------------------------------------------

/**
 * Stake recomendada (ABI USD) pela banca. Usa o piso de cada faixa na escala
 * interina anterior; todos os valores existem em GRADE_LINKS.
 */
export const BANCA_GRADE: Record<BancaAnswer, number> = {
  lt_875: 1,
  "875_2000": 2.5,
  "2001_5000": 4,
  "5001_10000": 10,
  gt_10000: 19,
};

export function computeStakeGrade(a: QuizAnswers): number {
  return BANCA_GRADE[a.banca];
}

/** Objetivo → profit_goal (mesmo mapa do v1; diversao cai em usd1k). */
export function objetivoToProfitGoal(objetivo: ObjetivoAnswer): ProfitGoal {
  switch (objetivo) {
    case "diversao":
    case "competir":
      return "usd1k";
    case "renda_extra":
      return "usd10k";
    case "ja_vive":
      return "usd50k";
    case "profissional":
      return "usd100k";
  }
}

/** Torneios/semana esperados = meio da faixa mensal ÷ 4. */
export const TORNEIOS_VOLUME_WEEKLY: Record<TorneiosMesAnswer, number> = {
  nao_sei: 25,
  lt_100: 20,
  "100_200": 38,
  "200_300": 63,
  gt_300: 88,
};

export function weeklyVolumeTarget(torneiosMes: TorneiosMesAnswer): number {
  return TORNEIOS_VOLUME_WEEKLY[torneiosMes];
}

/** Torneios/mês → studyTime (faixa de dedicação do plano). */
export function studyTimeFromTorneios(torneiosMes: TorneiosMesAnswer): StudyTime {
  switch (torneiosMes) {
    case "nao_sei":
    case "lt_100":
      return "ate15";
    case "100_200":
    case "200_300":
      return "ate40";
    case "gt_300":
      return "mais40";
  }
}
