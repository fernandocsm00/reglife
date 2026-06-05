/**
 * GET /api/plan/scoreboard/[diagnosticId]
 *
 * Devolve o placar mensal do aluno em /meu-plano, montado pela lib pura
 * buildMonthlyScoreboard.
 *
 * Auth: requireDiagSession — mesmo padrão de /api/spot-training e
 * /api/health/me. IDOR-protected (cookie HttpOnly bate com diagnosticId).
 *
 * Empty state com precedência:
 *   - abandoned       : spots_played === 0
 *   - no_saved_plan   : spots_played > 0 mas saved_plan IS NULL
 *   - elite_no_track  : saved_plan existe mas buildSpotTrack retorna []
 *
 * Erro do SharkScope mensal NÃO bloqueia — vira monthlyEntries=null e o
 * UI mostra "Conecte SharkScope" / "sem dados do mês" conforme hasSharkscope.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDiagSession } from "@/lib/session";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { type TrainingRow } from "@/lib/poker/adminSpotTrack";
import { buildMonthlyScoreboard } from "@/lib/poker/monthlyScoreboard";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> },
) {
  const { diagnosticId } = await ctx.params;

  // Auth: helper devolve 400/401/403 prontos quando aplicável.
  const auth = await requireDiagSession(diagnosticId);
  if (!auth.ok) return auth.response;
  const diagId = auth.diagId;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Mês corrente UTC para filtrar sharkscope_monthly_stats.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1..12

  let diagRes, trainingRes, sharkRes;
  try {
    [diagRes, trainingRes, sharkRes] = await Promise.all([
      supabase
        .from("reglife_diagnostic_results")
        .select(
          "saved_plan, spots_played, sharkscope_username, sharkscope_playergroup_id",
        )
        .eq("id", diagId)
        .maybeSingle(),
      supabase
        .from("spot_training_sessions")
        .select("leak_id, hands_played, hands_correct, completed_at, updated_at")
        .eq("diagnostic_id", diagId),
      supabase
        .from("sharkscope_monthly_stats")
        .select("entries")
        .eq("diagnostic_id", diagId)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle(),
    ]);
  } catch (err) {
    console.warn("[plan/scoreboard] fetch threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (diagRes.error) {
    console.warn("[plan/scoreboard] diag select", diagRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  if (!diagRes.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // SharkScope mensal: erro NÃO bloqueia — apenas loga e segue com null.
  if (sharkRes.error) {
    console.warn("[plan/scoreboard] sharkscope monthly", sharkRes.error.message);
  }

  const {
    saved_plan: savedPlan,
    spots_played: spotsPlayed,
    sharkscope_username: ssUsername,
    sharkscope_playergroup_id: ssGroupId,
  } = diagRes.data as {
    saved_plan: SavedPlan | null;
    spots_played: number | null;
    sharkscope_username: string | null;
    sharkscope_playergroup_id: string | null;
  };

  const hasSharkscope = ssUsername !== null || ssGroupId !== null;

  // Empty-state precedence.
  if ((spotsPlayed ?? 0) === 0) {
    return NextResponse.json({ hasScoreboard: false, reason: "abandoned" });
  }
  if (!savedPlan) {
    return NextResponse.json({ hasScoreboard: false, reason: "no_saved_plan" });
  }

  // A partir daqui o merge depende de training rows — erro ali é 500.
  if (trainingRes.error) {
    console.warn("[plan/scoreboard] training select", trainingRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const monthlyEntries =
    sharkRes.error || !sharkRes.data ? null : (sharkRes.data.entries ?? null);

  const volumeTargetWeekly =
    typeof savedPlan.volumeTargetWeekly === "number"
      ? savedPlan.volumeTargetWeekly
      : null;

  // Guard defensivo: saved_plan jsonb pode vir malformado.
  let data;
  try {
    data = buildMonthlyScoreboard({
      plan: savedPlan,
      trainingRows: rows,
      volumeTargetWeekly,
      monthlyEntries,
      hasSharkscope,
    });
  } catch (err) {
    console.warn("[plan/scoreboard] build threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (data.spotProgress.length === 0) {
    return NextResponse.json({ hasScoreboard: false, reason: "elite_no_track" });
  }

  return NextResponse.json({ hasScoreboard: true, ...data });
}
