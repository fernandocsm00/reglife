// lib/poker/leadScoring.ts — Quiz do onboarding (v2): tipos das respostas e
// derivações pros campos do plano (profitGoal, stakeGrade, volume, studyTime).
//
// Onboarding v2: lead score (frio/morno/quente) REMOVIDO. Idade, Experiência,
// ABI e Volume (perguntas) removidas. Quiz pontuável-de-plano = objetivo + banca.
// Tempo (horas/telas) é capturado fora do QuizAnswers.

import type { ProfitGoal, StudyTime } from "./planStorage";

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------

export type ObjetivoAnswer =
  | "competitivo"
  | "renda_extra"
  | "profissional"
  | "ja_vive";

export type BancaAnswer =
  | "lt_875"
  | "875_1499"
  | "1500_2799"
  | "2800_4249"
  | "4250_5849"
  | "5850_7599"
  | "7600_9499"
  | "9500_11999"
  | "12000_15399"
  | "15400_20699"
  | "20700_26999"
  | "27000_33749"
  | "gte_33750";

export interface QuizAnswers {
  objetivo: ObjetivoAnswer;
  banca: BancaAnswer;
}

// ---------------------------------------------------------------------------
// Opções (value + label). Sem pontuação — lead score removido.
// ---------------------------------------------------------------------------

export interface QuizOption<T extends string> {
  value: T;
  label: string;
}

export interface NumberOption {
  value: number;
  label: string;
}

export const OBJETIVO_OPTIONS: QuizOption<ObjetivoAnswer>[] = [
  { value: "competitivo", label: "Quero ser competitivo, mas não pretendo viver do jogo" },
  { value: "renda_extra", label: "Ter renda extra, poder contar com os ganhos no jogo" },
  { value: "profissional", label: "Ser profissional, ter o jogo como renda principal" },
  { value: "ja_vive", label: "Já vivo do poker e quero escalar os limites" },
];

export const BANCA_OPTIONS: QuizOption<BancaAnswer>[] = [
  { value: "lt_875", label: "Menor que $875" },
  { value: "875_1499", label: "Entre $875 e $1.499" },
  { value: "1500_2799", label: "Entre $1.500 e $2.799" },
  { value: "2800_4249", label: "Entre $2.800 e $4.249" },
  { value: "4250_5849", label: "Entre $4.250 e $5.849" },
  { value: "5850_7599", label: "Entre $5.850 e $7.599" },
  { value: "7600_9499", label: "Entre $7.600 e $9.499" },
  { value: "9500_11999", label: "Entre $9.500 e $11.999" },
  { value: "12000_15399", label: "Entre $12.000 e $15.399" },
  { value: "15400_20699", label: "Entre $15.400 e $20.699" },
  { value: "20700_26999", label: "Entre $20.700 e $26.999" },
  { value: "27000_33749", label: "Entre $27.000 e $33.749" },
  { value: "gte_33750", label: "$33.750 ou mais" },
];

// Horas/semana: value = total; label mostra grind (5/6 do total, só display).
export const HOURS_OPTIONS: NumberOption[] = [
  { value: 6, label: "6h por semana · 5h de grind" },
  { value: 12, label: "12h por semana · 10h de grind" },
  { value: 18, label: "18h por semana · 15h de grind" },
  { value: 24, label: "24h por semana · 20h de grind" },
  { value: 30, label: "30h por semana · 25h de grind" },
  { value: 36, label: "36h por semana · 30h de grind" },
  { value: 42, label: "42h por semana · 35h de grind" },
  { value: 48, label: "48h por semana · 40h de grind" },
];

export const TABLES_OPTIONS: NumberOption[] = Array.from(
  { length: 10 },
  (_, i) => ({ value: i + 1, label: i + 1 === 1 ? "1 tela" : `${i + 1} telas` })
);

// Sites pros nicks (multi-site). `key` = chave no JSONB; `label` = nome exibido.
export const SHARKSCOPE_SITES = [
  { key: "pokerstars", label: "PokerStars" },
  { key: "ggpoker", label: "GGPoker" },
  { key: "partypoker", label: "PartyPoker" },
  { key: "p888", label: "888Poker" },
  { key: "wpn", label: "WPN" },
  { key: "ipoker", label: "iPoker" },
] as const;
export type SharkscopeSiteKey = (typeof SHARKSCOPE_SITES)[number]["key"];

// ---------------------------------------------------------------------------
// Stake grade (banca → ABI permitido). INTERINO na Fase 1.
// ---------------------------------------------------------------------------

/**
 * Stake recomendada (ABI USD) baseada na banca. INTERINO (Fase 1): mapeia as
 * 13 faixas pros valores da escala atual (1..28), monotônico. Fase 2 troca
 * pela escala real até $54 + teto técnico por tier.
 */
export const BANCA_GRADE: Record<BancaAnswer, number> = {
  lt_875: 1,
  "875_1499": 2.5,
  "1500_2799": 4,
  "2800_4249": 7,
  "4250_5849": 10,
  "5850_7599": 13,
  "7600_9499": 13,
  "9500_11999": 19,
  "12000_15399": 19,
  "15400_20699": 28,
  "20700_26999": 28,
  "27000_33749": 28,
  gte_33750: 28,
};

export function computeStakeGrade(a: QuizAnswers): number {
  return BANCA_GRADE[a.banca];
}

// ---------------------------------------------------------------------------
// Derivações pro plano
// ---------------------------------------------------------------------------

/** Objetivo → profit_goal (4 casos). */
export function objetivoToProfitGoal(objetivo: ObjetivoAnswer): ProfitGoal {
  switch (objetivo) {
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
 * Volume semanal esperado = horas × 0,5 × telas. Usa o TOTAL de horas (o
 * "grind" do label é só contexto). Mensal = ×4 (consumidores multiplicam).
 */
export function weeklyVolumeTarget(weeklyHours: number, tables: number): number {
  return Math.round(weeklyHours * 0.5 * tables);
}

/** Horas/semana → studyTime (faixa do plano). */
export function studyTimeFromHours(weeklyHours: number): StudyTime {
  if (weeklyHours <= 15) return "ate15";
  if (weeklyHours <= 40) return "ate40";
  return "mais40";
}
