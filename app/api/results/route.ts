import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/results — save diagnostic result
export async function POST(req: NextRequest) {
  const body = await req.json();

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
  if (secret !== process.env.ADMIN_SECRET) {
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
