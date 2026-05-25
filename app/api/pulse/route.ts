/**
 * /api/pulse — Vote do pulse semanal.
 *
 * GET ?token=...  → valida HMAC, retorna { diagnosticId, weekIso, alreadyVoted }.
 *                   Usado por /p/[token] no SSR pra renderizar a página.
 *
 * POST { token, vote, source } → valida HMAC + upsert em pulse_responses.
 *                   PK (diagnostic_id, week_iso) garante anti-double.
 *                   `source` ∈ ("in_app", "link"). "email" e "whatsapp" estão
 *                   reservados pra Fases futuras (Fase B email, Fase C+1 webhook).
 *
 * Rate-limit por token (10/h) — defende contra brute-force no HMAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPulseToken } from "@/lib/pulse/token";
import { clientIp, hit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Emoji = "sad" | "meh" | "smile" | "grin";
type Source = "in_app" | "link";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[api/pulse] SUPABASE env vars missing");
  }
  return createClient(url, key);
}

function isValidEmoji(v: unknown): v is Emoji {
  return v === "sad" || v === "meh" || v === "smile" || v === "grin";
}
function isValidSource(v: unknown): v is Source {
  return v === "in_app" || v === "link";
}

// ---------------------------------------------------------------------------
// GET — usado pela página /p/[token] no SSR
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Rate-limit defensivo por IP (200/h é generoso pra SSR + retries)
  const ip = clientIp(req);
  const ipCheck = hit(`pulse:get:ip:${ip}`, 200, 60 * 60 * 1000);
  if (!ipCheck.ok) return rateLimitResponse(ipCheck);

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const parsed = verifyPulseToken(token);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = service();
  const { data } = await supabase
    .from("pulse_responses")
    .select("emoji, source, created_at")
    .eq("diagnostic_id", parsed.diagnosticId)
    .eq("week_iso", parsed.weekIso)
    .maybeSingle();

  return NextResponse.json({
    diagnosticId: parsed.diagnosticId,
    weekIso: parsed.weekIso,
    alreadyVoted: data
      ? { emoji: data.emoji as Emoji, source: data.source as string, at: data.created_at }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST — registra voto
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 10 POSTs/h por IP — alguém legítimo posta 1x; brute-force precisa de muito mais
  const ipCheck = hit(`pulse:post:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!ipCheck.ok) return rateLimitResponse(ipCheck);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token, vote, source } = (body ?? {}) as {
    token?: string;
    vote?: string;
    source?: string;
  };

  if (!token || !vote || !source) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const parsed = verifyPulseToken(token);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (!isValidEmoji(vote)) {
    return NextResponse.json({ error: "invalid_vote" }, { status: 400 });
  }
  if (!isValidSource(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }

  // Rate-limit por token (defende contra brute-force do HMAC)
  const tokenCheck = hit(`pulse:post:token:${token}`, 10, 60 * 60 * 1000);
  if (!tokenCheck.ok) return rateLimitResponse(tokenCheck);

  const supabase = service();
  const { error } = await supabase.from("pulse_responses").upsert(
    {
      diagnostic_id: parsed.diagnosticId,
      week_iso: parsed.weekIso,
      emoji: vote,
      source,
    },
    { onConflict: "diagnostic_id,week_iso" }
  );

  if (error) {
    console.error("[api/pulse] upsert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
