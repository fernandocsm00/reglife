import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/results — save diagnostic result
export async function POST(req: NextRequest) {
  const body = await req.json();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[api/results] SUPABASE env vars not configured");
    return NextResponse.json({ error: "Server misconfigured: missing Supabase env vars" }, { status: 500 });
  }

  const ssUsername = typeof body.sharkscopeUsername === "string" && body.sharkscopeUsername.trim()
    ? body.sharkscopeUsername.trim()
    : null;
  const ssNetwork = ssUsername ? (body.sharkscopeNetwork ?? "PokerStars") : null;
  const volumeTarget =
    typeof body.volumeTargetWeekly === "number" && body.volumeTargetWeekly > 0
      ? Math.round(body.volumeTargetWeekly)
      : null;

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .insert([
      {
        player_name: body.playerName ?? "Jogador",
        email: body.email ?? null,
        phone: body.phone ?? null,
        study_time: body.studyTime ?? null,
        profit_goal: body.profitGoal ?? null,
        stopped_early: body.stoppedEarly ?? false,
        spots_played: body.spotsPlayed ?? 0,
        spots_failed: body.spotsFailed ?? 0,
        spot_summaries: body.spotSummaries ?? [],
        results: body.results ?? [],
        sharkscope_username: ssUsername,
        sharkscope_network: ssNetwork,
        volume_target_weekly: volumeTarget,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("[api/results] insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

// GET /api/results — list all (admin)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.ADMIN_SECRET ?? "reglife2024";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
