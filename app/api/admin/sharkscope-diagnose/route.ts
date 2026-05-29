/**
 * GET /api/admin/sharkscope-diagnose?identifier=<id>&network=<network>
 *
 * Endpoint TEMPORÁRIO de diagnóstico. Recebe um identificador (que pode ser
 * tanto nick de player quanto nome de Player Group) e dispara várias variantes
 * de URL contra a API SharkScope, reportando status HTTP e amostra da resposta
 * de cada uma. Útil pra investigar quando a forma "canônica" devolve 404 mas
 * a entidade aparece no site.
 *
 * Sem auth dedicado (segue convenção do sibling /api/admin/health). Não tem
 * efeito colateral — só faz GETs read-only.
 *
 * Deletar este arquivo depois que descobrirmos qual variante funciona.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL = "https://www.sharkscope.com/api/iduy/networks";

// Filtros mínimos pra reduzir custo e ainda obrigar a API a resolver o sujeito
const FILTER_QUERY =
  "TournamentName!:Sat:,Freeroll;Class:SCHEDULED;Type:H,NL;Date:*";
const STATISTICS = "Entries,Profit,AvROI,ITM";

interface VariantResult {
  variant: string;
  url: string;
  status: number | null;
  ok: boolean;
  /** Amostra de até 400 chars do body — pra ver se a Shark devolve algum erro estruturado. */
  bodySample: string;
  /** Tem PlayerGroup ou Player na resposta? Heurística rápida. */
  hasPlayerGroup: boolean;
  hasPlayer: boolean;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const identifier = url.searchParams.get("identifier");
  const network = url.searchParams.get("network") ?? "PokerStars";

  if (!identifier) {
    return NextResponse.json(
      { error: "identifier obrigatório (?identifier=<nick-ou-group>)" },
      { status: 400 }
    );
  }

  const username = process.env.SHARKSCOPE_USERNAME;
  const password = process.env.SHARKSCOPE_PASSWORD;
  if (!username || !password) {
    return NextResponse.json(
      { error: "SHARKSCOPE_USERNAME/PASSWORD não configurados" },
      { status: 500 }
    );
  }

  // Lista de variantes a testar. Cada uma muda só o segmento de path.
  // Identificador é passado como-está e tb em variante uppercase do sufixo TLD.
  const idVariants = new Set<string>([identifier, suffixUpper(identifier), suffixLower(identifier)]);
  const pathSegments = ["players", "playergroups", "playerGroups", "playergroup", "groups"];

  const variants: Array<{ name: string; url: string }> = [];
  for (const id of idVariants) {
    for (const seg of pathSegments) {
      const built = buildUrl(network, seg, id, username, password);
      variants.push({
        name: `${seg}/${id}`,
        url: built,
      });
    }
  }

  const results: VariantResult[] = [];
  for (const v of variants) {
    try {
      const res = await fetch(v.url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });
      const text = await res.text();
      results.push({
        variant: v.name,
        url: redact(v.url),
        status: res.status,
        ok: res.status === 200,
        bodySample: text.slice(0, 400),
        hasPlayerGroup: text.includes("PlayerGroup"),
        hasPlayer: text.includes("Player"),
      });
    } catch (err) {
      results.push({
        variant: v.name,
        url: redact(v.url),
        status: null,
        ok: false,
        bodySample: err instanceof Error ? err.message : "fetch error",
        hasPlayerGroup: false,
        hasPlayer: false,
      });
    }
    // pequena pausa entre chamadas pra não estourar rate limit
    await sleep(300);
  }

  const successful = results.filter((r) => r.ok);
  const summary = {
    identifier,
    network,
    totalVariants: results.length,
    succeeded: successful.length,
    succeededNames: successful.map((r) => r.variant),
  };

  return NextResponse.json({ summary, results }, { status: 200 });
}

function buildUrl(
  network: string,
  segment: string,
  identifier: string,
  username: string,
  password: string
): string {
  const params = new URLSearchParams({
    Username: username,
    Password: password,
    filter: FILTER_QUERY,
  });
  return `${BASE_URL}/${network}/${segment}/${encodeURIComponent(identifier)}/statistics/${STATISTICS}?${params}`;
}

/** Substitui Username/Password da URL pra ficar seguro no body do response. */
function redact(url: string): string {
  return url
    .replace(/Username=[^&]+/, "Username=<redacted>")
    .replace(/Password=[^&]+/, "Password=<redacted>");
}

/** Se o id termina com sufixo -tld em qualquer case, devolve com TLD uppercase. */
function suffixUpper(id: string): string {
  return id.replace(/-([a-zA-Z]{2,4})$/, (_, tld) => `-${tld.toUpperCase()}`);
}

function suffixLower(id: string): string {
  return id.replace(/-([a-zA-Z]{2,4})$/, (_, tld) => `-${tld.toLowerCase()}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
