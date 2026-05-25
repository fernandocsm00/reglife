/**
 * lib/notify.ts — Fan-out de notificações do EV.
 *
 * Cria sempre uma notificação in-app (tabela `notifications`). Se a janela
 * de silêncio do aluno permitir e os canais externos estiverem habilitados,
 * dispara também via Discord webhook e/ou WhatsApp (Z-API/Evolution).
 *
 * Falhas em um canal não bloqueiam os outros — registramos `channels_sent`
 * com o que efetivamente saiu.
 */

import { createClient } from "@supabase/supabase-js";
import { generateEvVoice, type EvTrigger } from "@/lib/ev-voice";
import { whatsappAllowed, type Cadence } from "@/lib/triggers/cadenceRules";

export type NotificationKind =
  | "post_session"
  | "streak_risk"
  | "quest_assigned"
  | "quest_done"
  | "quest_expiring"
  | "drop_active"
  | "badge_unlocked"
  | "leak_alert"
  | "leak_closed"
  | "phase_transition"
  | "plan_delivered"
  | "daily_checkin"
  | "weekly_review"
  | "health_band_change"
  | "pulse_request";

export type Channel = "in_app" | "discord" | "whatsapp" | "email";

export interface SendNotificationArgs {
  diagnosticId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  /** Bypassa quiet hours (use só pra coisas urgentes/streak risk). */
  force?: boolean;
}

interface DiagPrefs {
  player_name: string;
  discord_webhook_url: string | null;
  whatsapp_phone: string | null;
  notify_channels: string[] | null;
  notify_quiet_start: number | null;
  notify_quiet_end: number | null;
  timezone: string | null;
  notify_cadence: string | null;
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Anti-spam: retorna true se o aluno já recebeu uma notificação desse kind
 * nas últimas N horas. Use antes de chamar sendEvNotification em loops
 * de cron pra evitar EV falando 2x do mesmo assunto.
 */
export async function hasNotificationRecently(
  diagnosticId: string,
  kind: NotificationKind,
  withinHours: number
): Promise<boolean> {
  const supabase = service();
  const cutoff = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("diagnostic_id", diagnosticId)
    .eq("kind", kind)
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Variante "narrativa" — gera o body com EV antes de mandar.
 * Use sempre que o body merecer narrativa (pós-sessão, fechamento, etc).
 * Para mensagens curtas/objetivas (drop_active, drop schedule), use
 * sendNotification direto.
 */
export async function sendEvNotification(args: {
  diagnosticId: string;
  kind: NotificationKind;
  trigger: EvTrigger;
  title: string;
  /** Fatos numéricos/categóricos que alimentam a narrativa. */
  facts: Record<string, unknown>;
  /** Body de fallback se OpenAI falhar — sai como notificação mesmo assim. */
  fallback: string;
  payload?: Record<string, unknown>;
  force?: boolean;
}): Promise<{ ok: boolean; channelsSent: Channel[]; body: string }> {
  const body = await generateEvVoice({
    diagnosticId: args.diagnosticId,
    trigger: args.trigger,
    facts: args.facts,
    fallback: args.fallback,
  });

  const res = await sendNotification({
    diagnosticId: args.diagnosticId,
    kind: args.kind,
    title: args.title,
    body,
    // Guarda a mensagem completa no payload pro chat do EV consumir depois
    payload: {
      ...(args.payload ?? {}),
      message: body,
      trigger: args.trigger,
    },
    force: args.force,
  });

  return { ...res, body };
}

export async function sendNotification(
  args: SendNotificationArgs
): Promise<{ ok: boolean; channelsSent: Channel[] }> {
  const supabase = service();

  const { data: prefs } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "player_name, discord_webhook_url, whatsapp_phone, notify_channels, notify_quiet_start, notify_quiet_end, timezone, notify_cadence"
    )
    .eq("id", args.diagnosticId)
    .single<DiagPrefs>();

  // Sempre registra in-app — base do feed.
  await supabase.from("notifications").insert({
    diagnostic_id: args.diagnosticId,
    kind: args.kind,
    title: args.title,
    body: args.body ?? null,
    payload: args.payload ?? null,
    channels_sent: ["in_app"],
  });

  const channelsSent: Channel[] = ["in_app"];
  const enabled = new Set<Channel>(
    (prefs?.notify_channels ?? ["in_app"]) as Channel[]
  );

  const inQuiet =
    !args.force &&
    isInQuietHours(
      prefs?.timezone ?? "America/Sao_Paulo",
      prefs?.notify_quiet_start ?? 23,
      prefs?.notify_quiet_end ?? 9
    );

  if (!inQuiet && enabled.has("discord") && prefs?.discord_webhook_url) {
    const ok = await sendDiscord(prefs.discord_webhook_url, args, prefs.player_name);
    if (ok) channelsSent.push("discord");
  }

  // Cadência do aluno modula WhatsApp por kind. Default = "ritmada" (mesmo
  // default do banco). Se for um kind/cadência sem WhatsApp permitido, pula.
  const cadence = ((prefs?.notify_cadence ?? "ritmada") as Cadence);
  if (
    !inQuiet &&
    enabled.has("whatsapp") &&
    prefs?.whatsapp_phone &&
    whatsappAllowed(args.kind, cadence)
  ) {
    const ok = await sendWhatsapp(prefs.whatsapp_phone, args, prefs.player_name);
    if (ok) channelsSent.push("whatsapp");
  }

  // Atualiza histórico de envio se foi além do in-app
  if (channelsSent.length > 1) {
    await supabase
      .from("notifications")
      .update({ channels_sent: channelsSent })
      .eq("diagnostic_id", args.diagnosticId)
      .eq("kind", args.kind)
      .eq("title", args.title)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  return { ok: true, channelsSent };
}

// ---------------------------------------------------------------------------
// Quiet hours (timezone-aware)
// ---------------------------------------------------------------------------

function isInQuietHours(timezone: string, start: number, end: number): boolean {
  // Pega a hora local do aluno usando Intl
  const localHourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(localHourStr, 10);
  if (Number.isNaN(hour)) return false;

  // Janela atravessa meia-noite (ex.: 23 → 9)
  if (start > end) return hour >= start || hour < end;
  // Janela mesma data (ex.: 13 → 17)
  return hour >= start && hour < end;
}

// ---------------------------------------------------------------------------
// Discord webhook
// ---------------------------------------------------------------------------

async function sendDiscord(
  webhookUrl: string,
  args: SendNotificationArgs,
  playerName: string
): Promise<boolean> {
  try {
    const colorByKind: Record<string, number> = {
      post_session: 0xfbbf24,
      streak_risk: 0xef4444,
      quest_done: 0x10b981,
      drop_active: 0xa855f7,
      badge_unlocked: 0xfbbf24,
      leak_alert: 0xf97316,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "EV",
        embeds: [
          {
            title: args.title,
            description: args.body ?? "",
            color: colorByKind[args.kind] ?? 0x9ca3af,
            footer: { text: `RegLife · ${playerName}` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// WhatsApp (Z-API / Evolution API)
// ---------------------------------------------------------------------------

async function sendWhatsapp(
  phone: string,
  args: SendNotificationArgs,
  playerName: string
): Promise<boolean> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token) {
    console.warn("[notify] WhatsApp não configurado, pulando.");
    return false;
  }
  try {
    const message = `*${args.title}*\n${args.body ?? ""}\n\n— EV (RegLife)`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // Formato genérico — ajustar conforme provider escolhido
        phone: phone.replace(/\D/g, ""),
        message,
        meta: { player: playerName, kind: args.kind },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Envia o PDF do plano pelo WhatsApp. Tenta como documento primeiro;
 * fallback é mensagem de texto com o link.
 *
 * Assume que o endpoint do WhatsApp (`WHATSAPP_API_URL`) é uma única URL
 * que lida tanto com texto quanto com documentos, discriminando pelo shape
 * do body — mesma convenção do `sendWhatsapp` já existente. Se o usuário
 * estiver no Z-API/Evolution com paths por ação (`/send-document`,
 * `/send-text`, etc.), ele deve configurar um proxy ou normalizar via
 * `WHATSAPP_API_URL` antes.
 *
 * Não passa pelo fluxo de quiet hours / canais — é entrega transacional
 * (one-shot, disparada quando o aluno acabou de pedir).
 */
export async function sendPlanReportWhatsapp(args: {
  phone: string;
  playerName: string;
  pdfUrl: string;
}): Promise<{ ok: boolean; mode: "document" | "text" | "skipped"; error?: string }> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token) {
    console.warn("[notify] WhatsApp não configurado, pulando envio de PDF.");
    return { ok: false, mode: "skipped", error: "not configured" };
  }
  const phone = args.phone.replace(/\D/g, "");
  if (!phone) {
    return { ok: false, mode: "skipped", error: "invalid phone" };
  }

  const caption = `Seu relatório Reglife 📎 — abre quando puder. — EV`;
  const fallbackText = `Oi ${args.playerName}, teu relatório Reglife tá pronto. Baixa aqui: ${args.pdfUrl}\n— EV`;

  // 1) tenta como documento (POST direto na URL base — body discrimina)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone,
        document: args.pdfUrl,
        fileName: "plano-reglife.pdf",
        caption,
        meta: { kind: "plan_pdf", player: args.playerName },
      }),
    });
    if (res.ok) return { ok: true, mode: "document" };
  } catch (err) {
    console.warn("[notify] WhatsApp document falhou, indo pro fallback texto", err);
  }

  // 2) fallback texto (também POST direto na URL base)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone,
        message: fallbackText,
        meta: { kind: "plan_pdf", player: args.playerName },
      }),
    });
    if (res.ok) return { ok: true, mode: "text" };
    return { ok: false, mode: "text", error: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: "text", error: msg };
  }
}
