/**
 * middleware.ts — HTTP Basic Auth nativo do browser pro /admin.
 *
 * Protege:
 *  - /admin/**            (UI do admin)
 *  - GET /api/results     (endpoint que o admin usa pra listar leads)
 *
 * Não protege:
 *  - POST /api/results    (usado pelo lead ao terminar o teste)
 *  - qualquer outra rota
 *
 * Credenciais via env (Easypanel → Environment):
 *  - ADMIN_USER     (default "admin")
 *  - ADMIN_PASSWORD (default cai pro ADMIN_SECRET antigo, e por último "reglife2024")
 */

import { NextRequest, NextResponse } from "next/server";

const REALM = 'Basic realm="reg.life admin", charset="UTF-8"';

function unauthorized(): NextResponse {
  return new NextResponse("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

function isAuthorized(authHeader: string | null): boolean {
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

  const expectedUser = process.env.ADMIN_USER ?? "admin";
  const expectedPass =
    process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SECRET ?? "reglife2024";

  return user === expectedUser && pass === expectedPass;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  const isAdminPage = pathname.startsWith("/admin");
  // /api/results — só protege GET (lista admin). POST é o submit do teste.
  const isAdminApiList = pathname === "/api/results" && method === "GET";

  if (!isAdminPage && !isAdminApiList) {
    return NextResponse.next();
  }

  if (isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return unauthorized();
}

// matcher decide quais rotas o middleware roda em cima.
// Nota: o matcher é estático — a checagem fina (incluindo o método HTTP) é
// feita dentro de `middleware()`.
export const config = {
  matcher: ["/admin/:path*", "/admin", "/api/results"],
};
