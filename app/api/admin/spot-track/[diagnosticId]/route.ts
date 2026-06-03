/**
 * GET /api/admin/spot-track/[diagnosticId]
 *
 * Devolve a trilha de 30 dias do aluno com progresso de treino por spot,
 * usado pelo componente AdminSpotTrack em /admin/resultado/[id].
 *
 * Empty state com precedência:
 *   - abandoned       : spots_played === 0 (mesmo se saved_plan estiver setado)
 *   - no_saved_plan   : spots_played > 0 mas saved_plan IS NULL
 *   - elite_no_track  : saved_plan existe mas buildSpotTrack retorna []
 *
 * Auth: convencional dos siblings — service-role server-side. NOTA: o
 * matcher de middleware.ts cobre `/api/admin/health` exato mas não cobre
 * `[diagnosticId]`. Esta rota herda a mesma lacuna por consistência com
 * o sibling /api/admin/health/[diagnosticId]; tratamento global vira spec
 * separado.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  mergeTrackWithTraining,
  type TrainingRow,
} from "@/lib/poker/adminSpotTrack";

export const dynamic = "force-dynamic";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> },
) {
  const { diagnosticId } = await ctx.params;

  if (!diagnosticId) {
    return NextResponse.json(
      { error: "diagnosticId required" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Duas leituras em paralelo: o registro do diagnóstico e as linhas de treino.
  // Promise.all aceita a falha cedo — o catch global devolve 500.
  let diagRes, trainingRes;
  try {
    [diagRes, trainingRes] = await Promise.all([
      supabase
        .from("reglife_diagnostic_results")
        .select("saved_plan, spots_played")
        .eq("id", diagnosticId)
        .maybeSingle(),
      supabase
        .from("spot_training_sessions")
        .select("leak_id, hands_played, hands_correct, completed_at, updated_at")
        .eq("diagnostic_id", diagnosticId),
    ]);
  } catch (err) {
    console.warn("[admin/spot-track] fetch threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (diagRes.error) {
    console.warn("[admin/spot-track] diag select", diagRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  if (!diagRes.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { saved_plan: savedPlan, spots_played: spotsPlayed } = diagRes.data as {
    saved_plan: SavedPlan | null;
    spots_played: number | null;
  };

  // Precedência dos empty states.
  if ((spotsPlayed ?? 0) === 0) {
    return NextResponse.json({ hasTrack: false, reason: "abandoned" as EmptyReason });
  }
  if (!savedPlan) {
    return NextResponse.json({ hasTrack: false, reason: "no_saved_plan" as EmptyReason });
  }

  if (trainingRes.error) {
    console.warn("[admin/spot-track] training select", trainingRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const spots = mergeTrackWithTraining(savedPlan, rows);

  if (spots.length === 0) {
    return NextResponse.json({ hasTrack: false, reason: "elite_no_track" as EmptyReason });
  }

  return NextResponse.json({ hasTrack: true, spots });
}
