/**
 * GET /api/cron/xp-drops
 *
 * Roda toda segunda 11h UTC (08h BRT). Sorteia uma janela aleatória de
 * 90min entre Quarta e Sexta da semana corrente (18h-22h hora local BR)
 * com multiplicador 2x. Cria 1 drop em xp_drops. Ao começar, dispara
 * notificação `drop_active` pra todos os alunos com canais habilitados.
 *
 * Nota: esse cron AGENDA o drop. A notificação no início da janela
 * acontece num cron separado horário (`xp-drops-announce`) — mas pra
 * simplificar, anunciamos imediatamente quando o cron de segunda roda
 * descrevendo a janela. Aluno vê o aviso e fica de olho.
 *
 * Idempotente por semana ISO.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Sao_Paulo";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { weekStart, weekEnd } = currentIsoWeek();

  // Já agendou drop essa semana?
  const { data: existing } = await supabase
    .from("xp_drops")
    .select("id, starts_at, ends_at")
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .limit(1)
    .maybeSingle();

  let drop = existing;
  if (!drop) {
    const window = pickRandomWindow(weekStart);
    const { data: inserted, error } = await supabase
      .from("xp_drops")
      .insert({
        starts_at: window.startsAt.toISOString(),
        ends_at: window.endsAt.toISOString(),
        multiplier: 2.0,
        description: "Drop de XP — toda task fechada na janela vale 2x",
      })
      .select("id, starts_at, ends_at")
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message ?? "falha ao criar drop" },
        { status: 500 }
      );
    }
    drop = inserted;
  }

  // Anuncia o drop pra cada aluno ativo
  const { data: rows } = await supabase
    .from("reglife_diagnostic_results")
    .select("id");

  let announced = 0;
  for (const r of rows ?? []) {
    const startsLocal = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(drop.starts_at));
    await sendNotification({
      diagnosticId: r.id,
      kind: "drop_active",
      title: "🎁 Drop de XP essa semana",
      body: `Janela de 2x XP em ${startsLocal} (90min). Toda task fechada nessa hora vale o dobro.`,
      payload: {
        starts_at: drop.starts_at,
        ends_at: drop.ends_at,
      },
    });
    announced++;
  }

  return NextResponse.json({
    ok: true,
    dropId: drop.id,
    starts_at: drop.starts_at,
    ends_at: drop.ends_at,
    announced,
  });
}

// ---------------------------------------------------------------------------
// Sorteio: dia entre Qua/Qui/Sex, hora 18-21h, duração 90min
// ---------------------------------------------------------------------------
function pickRandomWindow(weekStart: Date): { startsAt: Date; endsAt: Date } {
  // weekStart é segunda 00:00 UTC. Qua = +2 dias, Qui = +3, Sex = +4.
  const dayOffsets = [2, 3, 4];
  const offset = dayOffsets[Math.floor(Math.random() * dayOffsets.length)];
  // BRT é UTC-3. 18-21h BR = 21-00h UTC. Duração 90min cabe começando até 22:30 BR.
  // Sorteamos hora local BR entre 18 e 20:30.
  const hourBR = 18 + Math.floor(Math.random() * 3); // 18, 19 ou 20
  const minute = Math.random() < 0.5 ? 0 : 30;
  const hourUtc = hourBR + 3; // BRT → UTC

  const startsAt = new Date(weekStart);
  startsAt.setUTCDate(startsAt.getUTCDate() + offset);
  startsAt.setUTCHours(hourUtc, minute, 0, 0);

  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  return { startsAt, endsAt };
}

function currentIsoWeek(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - offsetToMonday
    )
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000 - 1);
  return { weekStart, weekEnd };
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
