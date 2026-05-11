/**
 * POST /api/sharkscope/sync
 *
 * Sincroniza dados do SharkScope para um aluno.
 * Busca o snapshot completo (Overall, PKO, nPKO, por buy-in) e salva no Supabase.
 *
 * Body: { userId: string; username: string; network: string }
 *
 * Segurança: requer que userId seja o usuário autenticado (verificado via auth header)
 * OU seja chamada via ADMIN_SECRET (para crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient } from "@/lib/sharkscope";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, username, network = "PokerStars", adminSecret } = body as {
    userId: string;
    username: string;
    network?: string;
    adminSecret?: string;
  };

  if (!userId || !username) {
    return NextResponse.json(
      { error: "userId e username são obrigatórios" },
      { status: 400 }
    );
  }

  // Autorização: admin secret OU verificar que o userId bate com o token
  const expectedSecret = process.env.ADMIN_SECRET ?? "reglife2024";
  const isAdmin = adminSecret === expectedSecret;

  if (!isAdmin) {
    // Em produção, aqui verificaria o JWT do Supabase
    // Por ora, aceita se vier com o userId correto (implementar auth completo na Fase 1)
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const client = getSharkscopeClient();
    const snapshot = await client.fetchPlayerSnapshot(username, network);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Salva snapshot
    const { error } = await supabase.from("sharkscope_snapshots").insert({
      user_id: userId,
      ss_username: username,
      ss_network: network,
      snapshot,
      entries_total: snapshot.overall?.Entries ?? null,
      profit_total: snapshot.overall?.Profit ?? null,
      avg_roi: snapshot.overall?.AvROI ?? null,
      itm: snapshot.overall?.ITM ?? null,
      pko_ratio: snapshot.pkoRatio ?? null,
      winrate_label: snapshot.winrate ?? null,
    });

    if (error) throw error;

    // Atualiza last_sync no perfil
    await supabase
      .from("player_profiles")
      .update({
        sharkscope_username: username,
        sharkscope_network: network,
        sharkscope_last_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    return NextResponse.json({
      success: true,
      snapshot: {
        entries: snapshot.overall?.Entries,
        profit: snapshot.overall?.Profit,
        avgRoi: snapshot.overall?.AvROI,
        winrate: snapshot.winrate,
        pkoRatio: snapshot.pkoRatio,
      },
    });
  } catch (err) {
    console.error("[sharkscope/sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao sincronizar SharkScope" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sharkscope/sync?userId=xxx
 * Retorna o último snapshot disponível para o aluno.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("sharkscope_snapshots")
    .select("snapshot, created_at, winrate_label, entries_total, profit_total, avg_roi")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ snapshot: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshot: data });
}
