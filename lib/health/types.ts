/**
 * lib/health/types.ts — Tipos compartilhados do Health Score Engine.
 *
 * O Engine é puro: recebe um `PlayerState` (snapshot do estado atual do aluno
 * em forma serializável) e devolve um `HealthScore`. Quem coleta o `PlayerState`
 * é `lib/health/collect.ts`; quem persiste o `HealthScore` é `lib/health/snapshot.ts`.
 */

export type HealthBand = "green" | "yellow" | "orange" | "red";

/** Acerto do aluno num bucket de spots (do diagnóstico ou retake). */
export interface SpotSummary {
  label: string;
  pct: number;        // 0..100 — % de acerto
  tier: number;       // 1..3
  passed: boolean;    // true se passou no bucket
  /** Mãos jogadas no bucket (necessário pro critério MIN_HANDS). */
  hands?: number;
}

/** Estado de um aluno num momento, agregado pelo collect.ts. */
export interface PlayerState {
  diagnosticId: string;
  /** Dia do ciclo (1..90+). Calculado a partir de created_at. */
  cycleDay: number;
  /** Spots do diagnóstico original. */
  diagnosticSpots: SpotSummary[];
  /** Spots do retake mais recente (se houver). */
  retakeSpots: SpotSummary[] | null;
  /** ROI baseline congelado no diagnóstico (ou null se SS não conectado). */
  roiBaseline: number | null;
  /** ROI dos últimos 30 dias do SharkScope (ou null). */
  roi30d: number | null;
  /** Tasks marcadas como feitas até hoje. */
  tasksChecked: number;
  /**
   * Tasks que o plano espera estarem feitas até `cycleDay` (cap em totalTasks).
   * Calculado pelo collect.ts somando tasks das fases atravessadas.
   */
  tasksExpected: number;
  /** Últimos N pulses (mais recente primeiro), N≤4. Vazio se Fase C ainda não rodou. */
  recentPulses: Array<"sad" | "meh" | "smile" | "grin">;
}

export interface HealthBreakdown {
  /** Quantos leaks fechados / total. */
  leaksClosed: number;
  leaksTotal: number;
  /** Componentes do Resultado. */
  leakScore: number | null;
  roiScore: number | null;
  resultado: number | null;
  /** Componentes da Conclusão. */
  tasksChecked: number;
  tasksExpected: number;
  conclusao: number | null;
  /** Sentimento. */
  pulsesUsed: number;
  sentimento: number | null;
  /** Pesos efetivamente aplicados (depois de redistribuição quando algo é null). */
  weights: { resultado: number; conclusao: number; sentimento: number };
}

export interface HealthScore {
  health: number;            // 0..100
  band: HealthBand;
  breakdown: HealthBreakdown;
}

/** Constantes da fórmula — ajustáveis sem mudança de schema. */
export const LEAK_CLOSED_ACCURACY = 0.85;
export const LEAK_CLOSED_MIN_HANDS = 10;
export const WEIGHT_RESULTADO = 0.8;
export const WEIGHT_CONCLUSAO = 0.1;
export const WEIGHT_SENTIMENTO = 0.1;
