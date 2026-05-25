/**
 * GET /api/cron/weekly-pulse
 *
 * Cron domingo 12h UTC. Para cada aluno ativo (ciclo ≤120d):
 *   - Idempotência: pula se já há pulse_responses ou notification pulse_request
 *     da semana corrente.
 *   - Cria notification kind=pulse_request com payload.token (link curto).
 *   - sendEvNotification cuida da narrativa via EV-voice; canal de WA
 *     respeita cadenceRules (leve = só in_app).
 *
 * Auth: Bearer ${CRON_SECRET} (header) ou ?secret=... (dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listActiveStudents } from "@/lib/health/collect";
import { sendEvNotification, hasNotificationRecently } from "@/lib/notify";
import { signPulseToken } from "@/lib/pulse/token";
import { weekIsoNow } from "@/lib/pulse/weekIso";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Outcome {
  diagnosticId: string;
  ok: boolean;
  status?: "fired" | "skipped_already_voted" | "skipped_already_sent";
  error?: string;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[cron/weekly-pulse] SUPABASE env vars missing");
  return createClient(url, key);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = service();
  const ids = await listActiveStudents();
  const weekIso = weekIsoNow();
  const outcomes: Outcome[] = [];

  for (const id of ids) {
    try {
      // 1) Já votou nessa semana?
      const { data: existingVote } = await supabase
        .from("pulse_responses")
        .select("emoji")
        .eq("diagnostic_id", id)
        .eq("week_iso", weekIso)
        .maybeSingle();
      if (existingVote) {
        outcomes.push({ diagnosticId: id, ok: true, status: "skipped_already_voted" });
        continue;
      }

      // 2) Já mandamos pulse_request essa semana (idempotência em re-runs)?
      const recentlySent = await hasNotificationRecently(id, "pulse_request", 24 * 6);
      if (recentlySent) {
        outcomes.push({ diagnosticId: id, ok: true, status: "skipped_already_sent" });
        continue;
      }

      const token = signPulseToken(id, weekIso);
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://reg.life");
      const link = `${baseUrl}/p/${token}`;

      await sendEvNotification({
        diagnosticId: id,
        kind: "pulse_request",
        trigger: "pulse_request",
        title: "Como foi sua semana?",
        facts: {
          semana_iso: weekIso,
          link_pulse: link,
        },
        fallback: `Bate aqui em um emoji: ${link}`,
        payload: { token, weekIso, link },
      });

      outcomes.push({ diagnosticId: id, ok: true, status: "fired" });
    } catch (err) {
      console.error(`[cron/weekly-pulse] ${id}:`, err);
      outcomes.push({
        diagnosticId: id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    weekIso,
    total: ids.length,
    fired: outcomes.filter((o) => o.status === "fired").length,
    skipped_voted: outcomes.filter((o) => o.status === "skipped_already_voted").length,
    skipped_sent: outcomes.filter((o) => o.status === "skipped_already_sent").length,
    failed: outcomes.filter((o) => !o.ok).length,
    failures: outcomes.filter((o) => !o.ok),
  });
}
