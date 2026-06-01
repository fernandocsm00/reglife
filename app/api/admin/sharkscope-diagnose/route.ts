/**
 * GET /api/admin/sharkscope-diagnose?identifier=<id>&network=<network>
 *
 * Endpoint TEMPORÁRIO de diagnóstico. Testa o formato canônico de URL +
 * variantes plausíveis do "network" pra Player Group, batendo na API SharkScope
 * com o esquema de auth correto (Username + Password-hash em HEADERS).
 *
 * Sem auth dedicado (não está no matcher do middleware). Read-only.
 *
 * Deletar este arquivo quando confirmarmos que cron e admin sync funcionam.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FILTER_QUERY =
  "TournamentName!:Sat:,Freeroll;Class:SCHEDULED;Type:H,NL;Date:*";
const STATISTICS = "Entries,Profit,AvROI,ITM";

interface VariantResult {
  variant: string;
  url: string;
  status: number | null;
  ok: boolean;
  /** Amostra de até 400 chars do body — pra ver se a Shark devolve erro estruturado. */
  bodySample: string;
  hasPlayerGroup: boolean;
  hasPlayer: boolean;
  /** Detecta o `@success:false` interno (200 com erro de auth/quota/etc). */
  apiSuccess: boolean | null;
  apiErrorCode: string | null;
  apiErrorMsg: string | null;
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

  const apiName = process.env.SHARKSCOPE_API_NAME;
  const apiKey = process.env.SHARKSCOPE_API_KEY;
  const username = process.env.SHARKSCOPE_USERNAME;
  const password = process.env.SHARKSCOPE_PASSWORD;
  const missing = [
    ["SHARKSCOPE_API_NAME", apiName],
    ["SHARKSCOPE_API_KEY", apiKey],
    ["SHARKSCOPE_USERNAME", username],
    ["SHARKSCOPE_PASSWORD", password],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Faltam envs: ${missing.join(", ")}` },
      { status: 500 }
    );
  }

  const baseUrl = `https://www.sharkscope.com/api/${encodeURIComponent(apiName!)}`;
  const passwordHash = md5(md5(password!) + apiKey!);

  // Variantes a testar:
  //   - network como veio (player normal)
  //   - "player group" (forma canônica via PHP lib)
  //   - "PlayerGroup", "playerGroup" (variações de case que valem testar)
  const networkVariants = [network, "player group", "PlayerGroup", "playerGroup"];
  const idVariants = Array.from(
    new Set<string>([identifier, suffixUpper(identifier), suffixLower(identifier)])
  );

  const variants: Array<{ name: string; url: string }> = [];
  for (const net of networkVariants) {
    for (const id of idVariants) {
      const built = `${baseUrl}/networks/${encodeURIComponent(net)}/players/${encodeURIComponent(id)}/statistics/${STATISTICS}?filter=${encodeURIComponent(FILTER_QUERY)}`;
      variants.push({ name: `${net}/players/${id}`, url: built });
    }
  }

  const results: VariantResult[] = [];
  for (const v of variants) {
    try {
      const res = await fetch(v.url, {
        headers: {
          Accept: "application/json",
          Username: username!,
          Password: passwordHash,
        },
        next: { revalidate: 0 },
      });
      const text = await res.text();
      const apiInfo = parseApiSuccess(text);
      results.push({
        variant: v.name,
        url: v.url,
        status: res.status,
        ok: res.status === 200 && apiInfo.success === true,
        bodySample: text.slice(0, 400),
        hasPlayerGroup: text.includes("PlayerGroup"),
        hasPlayer: text.includes("Player"),
        apiSuccess: apiInfo.success,
        apiErrorCode: apiInfo.errorCode,
        apiErrorMsg: apiInfo.errorMsg,
      });
    } catch (err) {
      results.push({
        variant: v.name,
        url: v.url,
        status: null,
        ok: false,
        bodySample: err instanceof Error ? err.message : "fetch error",
        hasPlayerGroup: false,
        hasPlayer: false,
        apiSuccess: null,
        apiErrorCode: null,
        apiErrorMsg: null,
      });
    }
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

function parseApiSuccess(text: string): {
  success: boolean | null;
  errorCode: string | null;
  errorMsg: string | null;
} {
  try {
    const json = JSON.parse(text);
    const success = json?.Response?.["@success"];
    if (success === "true") return { success: true, errorCode: null, errorMsg: null };
    if (success === "false") {
      const err = json?.Response?.ErrorResponse?.Error;
      return {
        success: false,
        errorCode: err?.["@id"] ?? null,
        errorMsg: err?.["$"] ?? null,
      };
    }
    return { success: null, errorCode: null, errorMsg: null };
  } catch {
    return { success: null, errorCode: null, errorMsg: null };
  }
}

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function suffixUpper(id: string): string {
  return id.replace(/-([a-zA-Z]{2,4})$/, (_, tld) => `-${tld.toUpperCase()}`);
}

function suffixLower(id: string): string {
  return id.replace(/-([a-zA-Z]{2,4})$/, (_, tld) => `-${tld.toLowerCase()}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
