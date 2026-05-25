/**
 * middleware.ts — HTTP Basic Auth nativo do browser pro /admin.
 *
 * Protege:
 *  - /admin/**                          (UI do admin)
 *  - GET  /api/results                  (lista de leads — só admin)
 *  - POST /api/sharkscope/sync-diagnostic  (acionado pelo modal do /admin)
 *  - POST /api/sharkscope/sync             (idem)
 *
 * Não protege:
 *  - POST /api/results    (submit do lead no fim do teste — ver cookie de sessão)
 *  - demais rotas /api/*  (cada uma valida o cookie de sessão internamente)
 *
 * Credenciais via env:
 *  - ADMIN_USER     (obrigatório)
 *  - ADMIN_PASSWORD (obrigatório — sem fallback inseguro)
 *
 * Se ADMIN_USER/ADMIN_PASSWORD não estiverem setados, o middleware NEGA acesso
 * (fail-closed). Não deixamos default em produção pra não cair a senha antiga
 * num projeto novo onde alguém esquece de configurar.
 */

import { NextRequest, NextResponse } from "next/server";

const REALM = 'Basic realm="reg.life admin", charset="UTF-8"';

function unauthorized(): NextResponse {
  return new NextResponse("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

/** Comparação constante pra evitar timing leak da senha. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(authHeader: string | null): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // fail-closed

  if (!authHeader) return false;
  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  return safeEqual(user, expectedUser) && safeEqual(pass, expectedPass);
}

const ADMIN_API_PATHS = new Set([
  "/api/results",
  "/api/sharkscope/sync-diagnostic",
  "/api/sharkscope/sync",
  "/api/admin/health",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  const isAdminPage = pathname.startsWith("/admin");
  // /api/results — só protege GET (lista admin). POST é o submit do teste.
  const isResultsAdminGet = pathname === "/api/results" && method === "GET";
  // Endpoints sharkscope só são chamados a partir do modal do /admin, então
  // exigem Basic Auth do admin (qualquer método).
  const isAdminSharkscope =
    pathname === "/api/sharkscope/sync-diagnostic" ||
    pathname === "/api/sharkscope/sync";
  const isAdminHealth = pathname === "/api/admin/health";

  const gated = isAdminPage || isResultsAdminGet || isAdminSharkscope || isAdminHealth;
  if (!gated) return NextResponse.next();

  if (isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  // Pra paths em ADMIN_API_PATHS, retorna 401 sem WWW-Authenticate pra não
  // popup do browser num fetch — mas mantém pro /admin.
  if (ADMIN_API_PATHS.has(pathname)) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return unauthorized();
}

// matcher decide quais rotas o middleware roda em cima.
// Nota: o matcher é estático — a checagem fina (método + path exato) é
// feita dentro de `middleware()`.
export const config = {
  matcher: [
    "/admin/:path*",
    "/admin",
    "/api/results",
    "/api/sharkscope/sync-diagnostic",
    "/api/sharkscope/sync",
    "/api/admin/health",
  ],
};
