/**
 * Lógica pura usada pelo endpoint admin /api/admin/pulses/[diagnosticId].
 *
 * Recebe linhas cruas da tabela pulse_responses e devolve um array enxuto
 * pronto pra UI da timeline: filtra valores fora dos enums, mapeia
 * snake_case → camelCase, e ordena por createdAt ASC (cronológico
 * esquerda→direita na tira).
 *
 * Schema tem CHECK em emoji/source — a lib NÃO confia nisso pra defender
 * contra schema drift, dumps de teste e bugs upstream.
 */

export type PulseEmoji = "sad" | "meh" | "smile" | "grin";
export type PulseSource = "in_app" | "whatsapp" | "email" | "link";

export interface PulseRow {
  week_iso: string;
  emoji: string;
  source: string;
  created_at: string;
}

export interface PulseEntry {
  weekIso: string;
  emoji: PulseEmoji;
  source: PulseSource;
  createdAt: string;
}

const VALID_EMOJI: ReadonlySet<string> = new Set([
  "sad",
  "meh",
  "smile",
  "grin",
]);

const VALID_SOURCE: ReadonlySet<string> = new Set([
  "in_app",
  "whatsapp",
  "email",
  "link",
]);

/**
 * Filtra rows com enum inválido, mapeia campos, ordena ASC por createdAt.
 *
 * Ordenação é estável: rows com mesmo createdAt preservam ordem original.
 */
export function buildPulseTimeline(rows: PulseRow[]): PulseEntry[] {
  const out: PulseEntry[] = [];
  for (const row of rows) {
    if (!VALID_EMOJI.has(row.emoji)) continue;
    if (!VALID_SOURCE.has(row.source)) continue;
    out.push({
      weekIso: row.week_iso,
      emoji: row.emoji as PulseEmoji,
      source: row.source as PulseSource,
      createdAt: row.created_at,
    });
  }
  // sort estável em JS moderno — preserva ordem original em empates
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}
