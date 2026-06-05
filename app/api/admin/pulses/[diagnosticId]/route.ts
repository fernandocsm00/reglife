/**
 * GET /api/admin/pulses/[diagnosticId]
 *
 * Devolve a timeline de pulses semanais do aluno usada pelo componente
 * PulseTimeline em /admin/resultado/[id].
 *
 * Auth: convenção dos siblings — service-role server-side. NOTA: o
 * matcher de middleware.ts cobre /api/admin/health exato mas não cobre
 * [diagnosticId]. Esta rota herda a mesma lacuna por consistência com
 * /api/admin/health/[diagnosticId] e /api/admin/spot-track/[diagnosticId];
 * tratamento global vira spec separado.
 *
 * Sem 404: diagnóstico inexistente devolve { hasPulses: false } (mesmo
 * shape de "nunca respondeu"). Decisão consciente do spec — pulses são
 * ortogonais ao plano.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildPulseTimeline,
  type PulseRow,
} from "@/lib/poker/pulseTimeline";

export const dynamic = "force-dynamic";

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

  const { data, error } = await supabase
    .from("pulse_responses")
    .select("week_iso, emoji, source, created_at")
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[admin/pulses] select", error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (data ?? []) as PulseRow[];

  let pulses;
  try {
    pulses = buildPulseTimeline(rows);
  } catch (err) {
    console.warn("[admin/pulses] build threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({
    hasPulses: pulses.length > 0,
    totalCount: pulses.length,
    pulses,
  });
}
