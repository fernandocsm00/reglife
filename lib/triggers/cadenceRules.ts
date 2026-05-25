/**
 * lib/triggers/cadenceRules.ts — Decide quais canais sairem por (kind, cadência).
 *
 * A cadência é uma preferência por aluno (`reglife_diagnostic_results.notify_cadence`).
 * Esta tabela mapeia ALOJADAS a partir do spec da Fase C:
 *   - `in_app` sempre sai pra todos (feed do EV é fonte da verdade — não filtramos).
 *   - WhatsApp filtra conforme a tabela.
 *
 * Função pura. Sem I/O. Quem lê a cadência do aluno é `lib/notify.ts:sendNotification`.
 */

import type { NotificationKind } from "@/lib/notify";

export type Cadence = "leve" | "ritmada" | "intensa";

type Channel = "in_app" | "whatsapp";

/** Canais permitidos pra (kind, cadência). */
export const CADENCE_CHANNELS: Record<NotificationKind, Record<Cadence, ReadonlyArray<Channel>>> = {
  // Triggers de coaching (núcleo do EV)
  daily_checkin:       { leve: [],                    ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  weekly_review:       { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  post_session:        { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  streak_risk:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  pulse_request:       { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_alert:          { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_closed:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  health_band_change:  { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  phase_transition:    { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  plan_delivered:      { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },

  // Outros kinds: gamificação só in_app (não enche o WA do aluno leve nem ritmada)
  badge_unlocked:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_assigned:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_done:          { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_expiring:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  drop_active:         { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
};

/** True se WhatsApp pode sair pra esse (kind, cadência). */
export function whatsappAllowed(kind: NotificationKind, cadence: Cadence): boolean {
  const channels = CADENCE_CHANNELS[kind]?.[cadence];
  return channels?.includes("whatsapp") ?? false;
}

/** True se in_app pode sair pra esse (kind, cadência). Pra Fase C, in_app é
 *  filtrado APENAS pra daily_checkin no leve (que é []). Os outros casos
 *  sempre listam in_app. Função separada pra evolução futura. */
export function inAppAllowed(kind: NotificationKind, cadence: Cadence): boolean {
  const channels = CADENCE_CHANNELS[kind]?.[cadence];
  return channels?.includes("in_app") ?? true;
}
