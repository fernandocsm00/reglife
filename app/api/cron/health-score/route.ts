/**
 * GET /api/cron/health-score
 *
 * Cron diário (06h UTC, antes do daily-pulse das 21h UTC). Para cada aluno
 * ativo (ciclo ≤ 120d):
 *   1. Coleta PlayerState (lib/health/collect.ts)
 *   2. Calcula HealthScore (lib/health/score.ts)
 *   3. Persiste snapshot do dia + detecta diff (lib/health/snapshot.ts)
 *   4. Se newlyClosedCount ≥ 1 → fireLeakClosed
 *   5. Se bandChange ≠ null → fireHealthBandChange
 *
 * Falha em um aluno não bloqueia os outros — coleta erros num array
 * e devolve no JSON final pra investigação no log do Vercel.
 *
 * Auth: Bearer ${CRON_SECRET} (header) ou ?secret=... (query, só dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { collectPlayerState, listActiveStudents } from "@/lib/health/collect";
import { computeHealth } from "@/lib/health/score";
import { persistSnapshot } from "@/lib/health/snapshot";
import { fireLeakClosed } from "@/lib/triggers/leakClosed";
import { fireHealthBandChange } from "@/lib/triggers/healthBandChange";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Outcome {
  diagnosticId: string;
  ok: boolean;
  health?: number;
  band?: string;
  bandChanged?: string;
  leakClosed?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await listActiveStudents();
  const outcomes: Outcome[] = [];

  for (const id of ids) {
    try {
      const state = await collectPlayerState(id);
      const score = computeHealth(state);
      const diff = await persistSnapshot(id, score);

      let leakClosed = 0;
      if (diff.newlyClosedCount > 0) {
        const r = await fireLeakClosed({
          diagnosticId: id,
          newlyClosedCount: diff.newlyClosedCount,
          totalClosed: score.breakdown.leaksClosed,
          totalLeaks: score.breakdown.leaksTotal,
        });
        if (r === "fired") leakClosed = diff.newlyClosedCount;
      }

      let bandChanged: string | undefined;
      if (diff.bandChange) {
        const r = await fireHealthBandChange({
          diagnosticId: id,
          from: diff.bandChange.from,
          to: diff.bandChange.to,
          health: score.health,
        });
        if (r === "fired") {
          bandChanged = `${diff.bandChange.from}->${diff.bandChange.to}`;
        }
      }

      outcomes.push({
        diagnosticId: id,
        ok: true,
        health: score.health,
        band: score.band,
        bandChanged,
        leakClosed,
      });
    } catch (err) {
      console.error(`[cron/health-score] ${id}:`, err);
      outcomes.push({
        diagnosticId: id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: ids.length,
    succeeded: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    band_changes: outcomes.filter((o) => o.bandChanged).length,
    leaks_closed_fired: outcomes.filter((o) => (o.leakClosed ?? 0) > 0).length,
    failures: outcomes.filter((o) => !o.ok),
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
