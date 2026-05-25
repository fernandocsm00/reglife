/**
 * /p/[token] — página pública do pulse semanal.
 *
 * Server Component que valida o HMAC do token e busca o estado direto
 * do Supabase (sem self-fetch em /api/pulse, que é anti-padrão em SSR
 * no Vercel). O HMAC já autentica o request — não precisa de cookie.
 */

import { createClient } from "@supabase/supabase-js";
import { verifyPulseToken } from "@/lib/pulse/token";
import { PulseLinkClient } from "./PulseLinkClient";

export const metadata = {
  title: "Pulse · Reglife",
  robots: "noindex",
};

interface PageState {
  ok: boolean;
  diagnosticId?: string;
  weekIso?: string;
  alreadyVoted?: { emoji: string; source: string; at: string } | null;
}

async function loadState(token: string): Promise<PageState> {
  const parsed = verifyPulseToken(token);
  if (!parsed) return { ok: false };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[p/[token]] SUPABASE env vars missing");
    return { ok: false };
  }
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("pulse_responses")
    .select("emoji, source, created_at")
    .eq("diagnostic_id", parsed.diagnosticId)
    .eq("week_iso", parsed.weekIso)
    .maybeSingle();

  return {
    ok: true,
    diagnosticId: parsed.diagnosticId,
    weekIso: parsed.weekIso,
    alreadyVoted: data
      ? { emoji: data.emoji as string, source: data.source as string, at: data.created_at as string }
      : null,
  };
}

export default async function PulseLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await loadState(token);

  if (!state.ok || !state.diagnosticId || !state.weekIso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold">Link inválido ou expirado</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Esse link não funciona. Abre o app pra responder direto no /meu-plano.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PulseLinkClient
      token={token}
      weekIso={state.weekIso}
      alreadyVoted={state.alreadyVoted ?? null}
    />
  );
}
