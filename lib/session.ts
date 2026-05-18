/**
 * lib/session.ts — cookie HttpOnly assinado ligando o navegador do lead ao
 * seu `diagnosticId`. Substitui o modelo antigo "diagnosticId na URL = posse",
 * que dava IDOR universal nas rotas /api/plan/*, /api/profile/notifications,
 * /api/manager/chat, etc.
 *
 * Como funciona:
 *  1. `/api/leads` POST cria o lead e chama `setDiagSessionCookie(diagId)`.
 *  2. As demais rotas chamam `requireDiagSession(declared)` — comparam o
 *     diagId no body/query com o que está no cookie assinado.
 *  3. Cookie é HttpOnly (não acessível por JS), Secure em prod, SameSite=Lax,
 *     com TTL de 90 dias.
 *
 * Formato do token: "<diagId>.<hmac-sha256-base64url>". HMAC sobre o diagId
 * com SESSION_SECRET. Comparação em tempo constante.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "rl_diag";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 dias

function getSecret(): string {
  // Em dev/build, sem SESSION_SECRET caímos pra um valor fixo. Em produção
  // a ausência é fatal — falamos isso explicitamente pra não rodar com
  // segredo previsível por engano.
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[session] SESSION_SECRET ausente ou muito curto (>=16 chars) em produção"
    );
  }
  return "dev-session-secret-DO-NOT-USE-IN-PROD-min-32-chars";
}

function sign(diagId: string): string {
  const mac = createHmac("sha256", getSecret()).update(diagId).digest();
  return Buffer.from(mac).toString("base64url");
}

function makeToken(diagId: string): string {
  return `${diagId}.${sign(diagId)}`;
}

/** Verifica assinatura e retorna o diagId, ou null se inválido. */
function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return null;
  const diagId = token.slice(0, sep);
  const provided = token.slice(sep + 1);
  let expected: string;
  try {
    expected = sign(diagId);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  try {
    const a = Buffer.from(provided, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return diagId;
}

/**
 * Set-Cookie no response atual (chamado dentro de uma Route Handler).
 * Use depois de criar/identificar um diagnosticId pertencente ao caller.
 */
export async function setDiagSessionCookie(diagId: string): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: makeToken(diagId),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Apaga o cookie (usado em logout / reset). */
export async function clearDiagSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Lê o diagId do cookie atual (sem validar nada além da assinatura). */
export async function getDiagSession(): Promise<string | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE_NAME)?.value);
}

/**
 * Aceita "<uuid>" ou "diag:<uuid>" e devolve o uuid puro. Retorna null se
 * o input não corresponder a esses formatos.
 */
export function normalizeDiagId(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const raw = input.startsWith("diag:") ? input.slice("diag:".length) : input;
  if (!/^[0-9a-f-]{32,36}$/i.test(raw)) return null;
  return raw;
}

/**
 * Resultado do `requireDiagSession`. Em caso de falha, traz uma Response
 * pronta pra retornar do handler.
 */
export type RequireSessionResult =
  | { ok: true; diagId: string }
  | { ok: false; response: Response };

/**
 * Valida que o caller tem cookie de sessão E que o diagId declarado (vindo
 * do body/query) bate com o que está no cookie.
 *
 * Uso típico:
 *   const ok = await requireDiagSession(body.diagnosticId);
 *   if (!ok.ok) return ok.response;
 *   const diagId = ok.diagId;
 */
export async function requireDiagSession(
  declared: string | null | undefined
): Promise<RequireSessionResult> {
  const sessionDiag = await getDiagSession();
  if (!sessionDiag) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  const declaredNorm = normalizeDiagId(declared);
  if (!declaredNorm) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "diagnosticId ausente ou inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  if (declaredNorm !== sessionDiag) {
    // Não revela qual é o diagId da sessão — só recusa.
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Sessão não corresponde ao recurso pedido" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return { ok: true, diagId: sessionDiag };
}
