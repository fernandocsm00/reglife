/**
 * /p/[token] — página pública do pulse semanal.
 *
 * Server Component que faz fetch de /api/pulse?token=... e renderiza
 * 4 botões emoji. Após click, POST → mensagem "Anotado!".
 *
 * NÃO usa session cookie. Toda a auth é o HMAC no token.
 */

import { PulseLinkClient } from "./PulseLinkClient";

interface VerifyResult {
  diagnosticId?: string;
  weekIso?: string;
  alreadyVoted?: { emoji: string; source: string; at: string } | null;
  error?: string;
}

async function verify(token: string): Promise<VerifyResult> {
  // Em SSR, o fetch precisa de URL absoluta. Usamos NEXT_PUBLIC_SITE_URL ou
  // VERCEL_URL pra montar. Se nenhum estiver setado, cai pra localhost.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const res = await fetch(`${base}/api/pulse?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return { error: `http_${res.status}` };
  return (await res.json()) as VerifyResult;
}

export default async function PulseLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verify(token);

  if (result.error || !result.diagnosticId || !result.weekIso) {
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
      weekIso={result.weekIso}
      alreadyVoted={result.alreadyVoted ?? null}
    />
  );
}
