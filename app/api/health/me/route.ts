/**
 * GET /api/health/me?diag=<id>
 *
 * Devolve o snapshot mais recente de player_health_snapshots pro aluno
 * dono do cookie de diag.
 *
 * Auth: requireDiagSession — só o aluno dono pode ler seu próprio HS.
 *
 * Se ainda não houve cron pra esse aluno, devolve `snapshot: null` (UI
 * mostra empty state).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDiagSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[api/health/me] SUPABASE env vars missing");
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const diagParam = req.nextUrl.searchParams.get("diag");
  const session = await requireDiagSession(diagParam);
  if (!session.ok) return session.response;

  const supabase = service();
  const { data, error } = await supabase
    .from("player_health_snapshots")
    .select("day, health, band, breakdown")
    .eq("diagnostic_id", session.diagId)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ snapshot: null });
  }

  return NextResponse.json({
    snapshot: {
      day: data.day,
      health: Number(data.health),
      band: data.band,
      breakdown: data.breakdown ?? null,
    },
  });
}
