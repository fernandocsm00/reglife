/**
 * lib/rate-limit.ts — sliding-window rate-limiter in-memory.
 *
 * Cabe pra deploy single-container (Easypanel). Se for escalar horizontalmente,
 * trocar `store` por Upstash Redis com mesma API (`hit`/`peek`).
 *
 * Modelo: pra cada chave, guarda os timestamps das últimas N requests.
 * Quando chega uma nova:
 *   1. Remove timestamps mais antigos que `windowMs`.
 *   2. Se sobraram >= `limit`, bloqueia.
 *   3. Senão, adiciona o `now` e libera.
 *
 * Memória bounded por dois mecanismos:
 *   - Cada chave guarda no máximo `limit` timestamps (descartados naturalmente
 *     pelo sliding window).
 *   - Limpeza periódica (sweep) remove chaves cujo último timestamp está
 *     fora da janela. Roda em throttle, não em todo hit.
 */

import type { NextRequest } from "next/server";

interface Bucket {
  hits: number[]; // ms timestamps, sorted ascending
}

const store = new Map<string, Bucket>();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;
/** Remove chaves cujo timestamp mais recente é mais velho que a maior janela
 * vista. Em vez de rastrear a janela por chave, varremos com 1h (a maior
 * janela atual do app). Se algum dia tivermos janelas maiores, atualizar. */
const MAX_TRACKED_WINDOW_MS = 60 * 60 * 1000;

function maybeSweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last === undefined || now - last > MAX_TRACKED_WINDOW_MS) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Quantas requests sobram nessa janela (zero quando bloqueado). */
  remaining: number;
  /** Quando o cliente pode tentar de novo (ms epoch). */
  resetAt: number;
  /** Segundos até o cliente poder tentar de novo (pra Retry-After). */
  retryAfterSec: number;
}

/**
 * Registra uma tentativa e retorna se passou. Use uma vez por request.
 * `key` deve ser único por dimensão (ex: `"chat:diag:<id>"`, `"leads:ip:1.2.3.4"`).
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const bucket = store.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;

  // Descarta hits fora da janela. Como o array é ordenado, basta pular o prefixo.
  let firstValid = 0;
  while (firstValid < bucket.hits.length && bucket.hits[firstValid] <= cutoff) {
    firstValid++;
  }
  if (firstValid > 0) bucket.hits = bucket.hits.slice(firstValid);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const resetAt = oldest + windowMs;
    store.set(key, bucket); // mantém o bucket pro próximo check
    return {
      ok: false,
      remaining: 0,
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    resetAt: now + windowMs,
    retryAfterSec: 0,
  };
}

/**
 * Response 429 padronizada, com Retry-After e headers de telemetria.
 * Use direto: `if (!check.ok) return rateLimitResponse(check);`
 */
export function rateLimitResponse(check: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Muitas requisições. Tenta de novo daqui a pouco.",
      retryAfterSec: check.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(check.retryAfterSec),
        "X-RateLimit-Reset": String(Math.floor(check.resetAt / 1000)),
      },
    }
  );
}

/**
 * Extrai o IP do cliente respeitando proxies (Easypanel/Traefik/Vercel
 * setam x-forwarded-for). Cai pra "unknown" se nada estiver disponível —
 * conservador, prefere errar pra falso positivo de rate-limit do que
 * deixar passar.
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for pode ter múltiplos IPs (client, proxy1, proxy2). O
    // primeiro é o cliente original. Trim pra evitar "1.2.3.4 , 5.6.7.8".
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
