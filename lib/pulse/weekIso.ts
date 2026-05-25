/**
 * lib/pulse/weekIso.ts — Computa a semana ISO 8601 (formato "YYYY-Www").
 *
 * Usamos a semana ISO porque é estável internacionalmente e tem boundary
 * previsível (segunda-feira). O cron de pulse roda domingo 12h UTC e usa
 * `weekIsoNow()` no momento da execução pra rotular a semana que está
 * acabando.
 *
 * Função pura. Sem timezone do aluno nesta fase — UTC é suficiente.
 */

/** ISO week number (1..53) pra uma data UTC. */
function isoWeekNumber(date: Date): number {
  // Algoritmo padrão: clone, ajusta pra quinta-feira da mesma semana, conta
  // semanas desde a primeira quinta-feira do ano.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** Ano ISO da data (pode diferir do `getUTCFullYear` em fronteira de ano). */
function isoWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  return d.getUTCFullYear();
}

/** "2026-W21" pra qualquer Date (UTC). */
export function weekIsoOf(date: Date): string {
  const year = isoWeekYear(date);
  const week = isoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** "2026-W21" pra agora (UTC). */
export function weekIsoNow(): string {
  return weekIsoOf(new Date());
}
