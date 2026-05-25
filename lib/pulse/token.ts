/**
 * lib/pulse/token.ts — Sign/verify do token do pulse semanal.
 *
 * O token vai no link curto `https://reg.life/p/<token>` mandado pelo EV.
 * Formato: `<diagnosticId>~<weekIso>~<sig>` onde sig = primeiros 16 chars
 * da base64url de HMAC-SHA256(SESSION_SECRET, "<diagId>.<weekIso>").
 *
 * Reusamos SESSION_SECRET (mesmo segredo do cookie de diag). Mesmo nível
 * de confidencialidade; spec da Fase C aprovou a reutilização.
 *
 * Comparação em tempo constante. Função pura — sem I/O.
 */

import { createHmac } from "node:crypto";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[pulse/token] SESSION_SECRET ausente ou curto (<16) em produção");
  }
  return "dev-session-secret-DO-NOT-USE-IN-PROD-min-32-chars";
}

function signature(diagnosticId: string, weekIso: string): string {
  const payload = `${diagnosticId}.${weekIso}`;
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 16);
}

export function signPulseToken(diagnosticId: string, weekIso: string): string {
  return `${diagnosticId}~${weekIso}~${signature(diagnosticId, weekIso)}`;
}

export function verifyPulseToken(
  token: string
): { diagnosticId: string; weekIso: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split("~");
  if (parts.length !== 3) return null;
  const [diagnosticId, weekIso, sig] = parts;
  if (!diagnosticId || !weekIso || !sig) return null;
  // Sanity: diag deve parecer um uuid; weekIso deve parecer 2026-W21
  if (!/^[0-9a-f-]{32,36}$/i.test(diagnosticId)) return null;
  if (!/^\d{4}-W\d{2}$/.test(weekIso)) return null;
  const expected = signature(diagnosticId, weekIso);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { diagnosticId, weekIso } : null;
}
