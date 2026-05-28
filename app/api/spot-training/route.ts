/**
 * /api/spot-training
 *
 * POST: registra uma mão jogada no trainer single-spot. Atualiza contadores
 *       (hands_played / hands_correct), marca completed_at na transição
 *       incompleto→completo (>=50 mãos com >=70% acerto), e devolve o
 *       progresso atualizado + flag `unlockedNow` que dispara FX/notificação
 *       só na borda de desbloqueio.
 *
 * GET:  lê o progresso atual de um (diagnosticId, leakId). Devolve zeros se
 *       ainda não houve linha.
 *
 * Auth: ambos passam por requireDiagSession — o cookie HttpOnly tem que
 *       bater com o diagnosticId declarado. Evita IDOR onde alguém com o
 *       UUID na URL poderia ler/escrever progresso de outro aluno.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireDiagSession } from "@/lib/session";
import {
  computeProgress,
  isSpotComplete,
  type SpotTrainingRow,
} from "@/lib/poker/spotTraining";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST — registra uma mão jogada
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { diagnosticId, leakId, correct } = (body ?? {}) as {
    diagnosticId?: unknown;
    leakId?: unknown;
    correct?: unknown;
  };

  if (
    typeof diagnosticId !== "string" ||
    typeof leakId !== "string" ||
    typeof correct !== "boolean"
  ) {
    return NextResponse.json(
      { error: "diagnosticId, leakId e correct são obrigatórios" },
      { status: 400 }
    );
  }

  const auth = await requireDiagSession(diagnosticId);
  if (!auth.ok) return auth.response;
  const diagId = auth.diagId;

  // 1) Lê o estado atual
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("spot_training_sessions")
    .select("hands_played, hands_correct, completed_at")
    .eq("diagnostic_id", diagId)
    .eq("leak_id", leakId)
    .maybeSingle();

  if (readErr) {
    console.error("[api/spot-training] read error", readErr);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const existingRow: SpotTrainingRow | null = existing
    ? {
        hands_played: existing.hands_played ?? 0,
        hands_correct: existing.hands_correct ?? 0,
        completed_at: existing.completed_at ?? null,
      }
    : null;

  const wasComplete = existingRow ? isSpotComplete(existingRow) : false;

  const newHandsPlayed = (existingRow?.hands_played ?? 0) + 1;
  const newHandsCorrect = (existingRow?.hands_correct ?? 0) + (correct ? 1 : 0);

  const nowComplete = isSpotComplete({
    hands_played: newHandsPlayed,
    hands_correct: newHandsCorrect,
    completed_at: existingRow?.completed_at ?? null,
  });

  const completedAt =
    existingRow?.completed_at ??
    (nowComplete ? new Date().toISOString() : null);

  // 2) Upsert
  const { error: upsertErr } = await supabaseAdmin
    .from("spot_training_sessions")
    .upsert(
      {
        diagnostic_id: diagId,
        leak_id: leakId,
        hands_played: newHandsPlayed,
        hands_correct: newHandsCorrect,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "diagnostic_id,leak_id" }
    );

  if (upsertErr) {
    console.error("[api/spot-training] upsert error", upsertErr);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const progress = computeProgress({
    hands_played: newHandsPlayed,
    hands_correct: newHandsCorrect,
    completed_at: completedAt,
  });

  const unlockedNow = !wasComplete && nowComplete;

  return NextResponse.json({ progress, unlockedNow });
}

// ---------------------------------------------------------------------------
// GET — lê progresso atual
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const diagnosticId = req.nextUrl.searchParams.get("diagnosticId");
  const leakId = req.nextUrl.searchParams.get("leakId");

  if (!diagnosticId || !leakId) {
    return NextResponse.json(
      { error: "diagnosticId e leakId são obrigatórios" },
      { status: 400 }
    );
  }

  const auth = await requireDiagSession(diagnosticId);
  if (!auth.ok) return auth.response;
  const diagId = auth.diagId;

  const { data, error } = await supabaseAdmin
    .from("spot_training_sessions")
    .select("hands_played, hands_correct, completed_at")
    .eq("diagnostic_id", diagId)
    .eq("leak_id", leakId)
    .maybeSingle();

  if (error) {
    console.error("[api/spot-training] read error", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const row: SpotTrainingRow | null = data
    ? {
        hands_played: data.hands_played ?? 0,
        hands_correct: data.hands_correct ?? 0,
        completed_at: data.completed_at ?? null,
      }
    : null;

  return NextResponse.json({ progress: computeProgress(row) });
}
