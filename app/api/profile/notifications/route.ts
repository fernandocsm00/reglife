/**
 * /api/profile/notifications
 *
 * GET    ?userId=diag:<id>           → lista últimas 30 notificações
 * POST   { userId, settings }         → atualiza settings de canal
 * PATCH  { userId, ids, markRead }    → marca notificações como lidas
 *
 * Tudo via diagnostic_id (Fase 1 sem-auth).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseDiagId(userId: string | null): string | null {
  if (!userId) return null;
  return userId.startsWith("diag:") ? userId.slice("diag:".length) : null;
}

const ALLOWED_CHANNELS = new Set(["in_app", "discord", "whatsapp"]);

// ---------------------------------------------------------------------------
// GET — lista notificações + settings atuais
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const diagId = parseDiagId(req.nextUrl.searchParams.get("userId"));
  if (!diagId) {
    return NextResponse.json({ notifications: [], settings: null });
  }
  const supabase = service();

  const [notifsRes, settingsRes] = await Promise.allSettled([
    supabase
      .from("notifications")
      .select("id, kind, title, body, payload, created_at, read_at, channels_sent")
      .eq("diagnostic_id", diagId)
      .order("created_at", { ascending: false })
      .limit(30),

    supabase
      .from("reglife_diagnostic_results")
      .select(
        "discord_webhook_url, whatsapp_phone, notify_channels, notify_quiet_start, notify_quiet_end, timezone"
      )
      .eq("id", diagId)
      .single(),
  ]);

  const notifications =
    notifsRes.status === "fulfilled" ? notifsRes.value.data ?? [] : [];
  const settings =
    settingsRes.status === "fulfilled" ? settingsRes.value.data : null;

  return NextResponse.json({ notifications, settings });
}

// ---------------------------------------------------------------------------
// POST — atualiza settings de canal
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const diagId = parseDiagId(body.userId);
  if (!diagId) {
    return NextResponse.json({ error: "userId obrigatório (diag:<id>)" }, { status: 400 });
  }

  const settings = body.settings as {
    discord_webhook_url?: string | null;
    whatsapp_phone?: string | null;
    notify_channels?: string[];
    notify_quiet_start?: number;
    notify_quiet_end?: number;
    timezone?: string;
  };

  const update: Record<string, unknown> = {};
  if ("discord_webhook_url" in settings) {
    const v = settings.discord_webhook_url?.trim() || null;
    if (v && !v.startsWith("https://discord.com/api/webhooks/") &&
        !v.startsWith("https://discordapp.com/api/webhooks/")) {
      return NextResponse.json(
        { error: "URL inválida — use o webhook do Discord (https://discord.com/api/webhooks/...)" },
        { status: 400 }
      );
    }
    update.discord_webhook_url = v;
  }
  if ("whatsapp_phone" in settings) {
    const digits = (settings.whatsapp_phone ?? "").replace(/\D/g, "");
    update.whatsapp_phone = digits.length >= 10 ? digits : null;
  }
  if (Array.isArray(settings.notify_channels)) {
    const filtered = settings.notify_channels.filter((c) => ALLOWED_CHANNELS.has(c));
    if (!filtered.includes("in_app")) filtered.push("in_app"); // sempre on
    update.notify_channels = filtered;
  }
  if (typeof settings.notify_quiet_start === "number") {
    update.notify_quiet_start = clampHour(settings.notify_quiet_start);
  }
  if (typeof settings.notify_quiet_end === "number") {
    update.notify_quiet_end = clampHour(settings.notify_quiet_end);
  }
  if (typeof settings.timezone === "string" && settings.timezone) {
    update.timezone = settings.timezone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const supabase = service();
  const { error } = await supabase
    .from("reglife_diagnostic_results")
    .update(update)
    .eq("id", diagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// PATCH — marca notificações como lidas (ids específicos ou todas)
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const diagId = parseDiagId(body.userId);
  if (!diagId) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  const supabase = service();
  const ids = Array.isArray(body.ids) ? body.ids : null;

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("diagnostic_id", diagId)
    .is("read_at", null);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function clampHour(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(23, Math.round(v)));
}
