# Admin pulse timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um bloco "Timeline de Pulses" em `/admin/resultado/[id]` logo abaixo do `<AdminSpotTrack>` mostrando todos os pulses semanais do aluno como tira horizontal de emojis com label de semana e rodapé "última resposta + source".

**Architecture:** Endpoint admin dedicado (`/api/admin/pulses/[diagnosticId]`) faz 1 SELECT em `pulse_responses`, delega à lib pura `buildPulseTimeline` que filtra valores fora do enum e ordena. Componente client faz uma chamada e renderiza 4 estados (loading / ready / empty / error).

**Tech Stack:** Next.js App Router (TS), Supabase service-role, Tailwind. Sem framework de testes — validação via `tsc`/`lint`/`build` + smoke `tsx` na lib pura + `curl` no endpoint + visual no dev.

**Spec base:** `docs/superpowers/specs/2026-06-02-admin-pulse-timeline-design.md` (commit `8b4ff1a`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/pulseTimeline.ts` | **Create** | Tipos `PulseEmoji`, `PulseSource`, `PulseRow`, `PulseEntry`. Exporta `buildPulseTimeline(rows): PulseEntry[]` — filtra rows com emoji/source fora do enum, mapeia snake_case → camelCase, ordena por `createdAt` ASC. Sem I/O. |
| `app/api/admin/pulses/[diagnosticId]/route.ts` | **Create** | GET handler. 1 SELECT em `pulse_responses` (filtra `diagnostic_id`), delega à lib pura, retorna `{ hasPulses, totalCount, pulses }`. Sem 404 — diag inexistente = nunca respondeu. |
| `components/admin/PulseTimeline.tsx` | **Create** | UI client component. Fetch único, 4 estados, tira horizontal de emojis (`<ol>` + `<li>` com glyph + label da semana) + rodapé "última resposta · source" reusando `formatRelative` da entrega admin spot track. |
| `app/admin/resultado/[id]/page.tsx` | **Modify** (linha 8 import, linha 99 JSX) | Adicionar `<PulseTimeline diagnosticId={row.id} />` no wrapper `space-y-6` existente, abaixo do `<AdminSpotTrack>`. |

Nenhuma migração. Nenhum impacto em `/api/pulse`, `PulseCard`, cron `weekly-pulse`, `HealthScoreBlock`, `lib/health/collect.ts`.

## Sequência das tasks

1. **Task 1** — Lib pura.
2. **Task 2** — Endpoint.
3. **Task 3** — Componente.
4. **Task 4** — Wire em `page.tsx`.
5. **Task 5** — Sanity check.

Cada task termina com `tsc --noEmit` verde e um commit.

---

## Task 1 — Lib pura `pulseTimeline.ts`

**Files:**
- Create: `lib/poker/pulseTimeline.ts`

**Por quê:** Centraliza as decisões de filtro/ordenação numa função pura, fácil de raciocinar e validar via smoke `tsx`.

- [ ] **Step 1: Criar `lib/poker/pulseTimeline.ts`**

```ts
/**
 * Lógica pura usada pelo endpoint admin /api/admin/pulses/[diagnosticId].
 *
 * Recebe linhas cruas da tabela pulse_responses e devolve um array enxuto
 * pronto pra UI da timeline: filtra valores fora dos enums, mapeia
 * snake_case → camelCase, e ordena por createdAt ASC (cronológico
 * esquerda→direita na tira).
 *
 * Schema tem CHECK em emoji/source — a lib NÃO confia nisso pra defender
 * contra schema drift, dumps de teste e bugs upstream.
 */

export type PulseEmoji = "sad" | "meh" | "smile" | "grin";
export type PulseSource = "in_app" | "whatsapp" | "email" | "link";

export interface PulseRow {
  week_iso: string;
  emoji: string;
  source: string;
  created_at: string;
}

export interface PulseEntry {
  weekIso: string;
  emoji: PulseEmoji;
  source: PulseSource;
  createdAt: string;
}

const VALID_EMOJI: ReadonlySet<string> = new Set([
  "sad",
  "meh",
  "smile",
  "grin",
]);

const VALID_SOURCE: ReadonlySet<string> = new Set([
  "in_app",
  "whatsapp",
  "email",
  "link",
]);

/**
 * Filtra rows com enum inválido, mapeia campos, ordena ASC por createdAt.
 *
 * Ordenação é estável: rows com mesmo createdAt preservam ordem original.
 */
export function buildPulseTimeline(rows: PulseRow[]): PulseEntry[] {
  const out: PulseEntry[] = [];
  for (const row of rows) {
    if (!VALID_EMOJI.has(row.emoji)) continue;
    if (!VALID_SOURCE.has(row.source)) continue;
    out.push({
      weekIso: row.week_iso,
      emoji: row.emoji as PulseEmoji,
      source: row.source as PulseSource,
      createdAt: row.created_at,
    });
  }
  // sort estável em JS moderno — preserva ordem original em empates
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/poker/pulseTimeline.ts`
Expected: zero warnings/errors.

- [ ] **Step 4: Smoke manual via `tsx`**

Criar `./tmp-smoke-pulseTimeline.ts` na raiz do repo:

```ts
import { buildPulseTimeline } from "./lib/poker/pulseTimeline";

// Caso 1: 3 rows válidas, fora de ordem
const r1 = buildPulseTimeline([
  { week_iso: "2026-W22", emoji: "smile", source: "whatsapp", created_at: "2026-06-01T09:10:00Z" },
  { week_iso: "2026-W21", emoji: "grin",  source: "in_app",   created_at: "2026-05-25T14:22:01Z" },
  { week_iso: "2026-W28", emoji: "sad",   source: "in_app",   created_at: "2026-07-13T20:05:00Z" },
]);
console.log("[1] count=", r1.length, "order=", r1.map(p => p.weekIso).join(","));
// Esperado: count= 3 order= 2026-W21,2026-W22,2026-W28

// Caso 2: emoji inválido filtrado
const r2 = buildPulseTimeline([
  { week_iso: "2026-W22", emoji: "smile", source: "in_app", created_at: "2026-06-01T09:10:00Z" },
  { week_iso: "2026-W23", emoji: "angry", source: "in_app", created_at: "2026-06-08T09:10:00Z" },
]);
console.log("[2] count=", r2.length, "emojis=", r2.map(p => p.emoji).join(","));
// Esperado: count= 1 emojis= smile

// Caso 3: source inválido filtrado
const r3 = buildPulseTimeline([
  { week_iso: "2026-W22", emoji: "smile", source: "in_app",   created_at: "2026-06-01T09:10:00Z" },
  { week_iso: "2026-W23", emoji: "grin",  source: "telegram", created_at: "2026-06-08T09:10:00Z" },
]);
console.log("[3] count=", r3.length, "sources=", r3.map(p => p.source).join(","));
// Esperado: count= 1 sources= in_app

// Caso 4: array vazio
const r4 = buildPulseTimeline([]);
console.log("[4] count=", r4.length);
// Esperado: count= 0

// Caso 5: 2 rows com mesmo createdAt — ordem estável
const r5 = buildPulseTimeline([
  { week_iso: "2026-W22", emoji: "smile", source: "whatsapp", created_at: "2026-06-01T09:10:00Z" },
  { week_iso: "2026-W22b", emoji: "grin", source: "in_app",   created_at: "2026-06-01T09:10:00Z" },
]);
console.log("[5] order=", r5.map(p => p.weekIso).join(","));
// Esperado: order= 2026-W22,2026-W22b
```

Run: `npx tsx ./tmp-smoke-pulseTimeline.ts`
Expected: 5 linhas batendo exatamente os comentários `// Esperado`.

**DELETE o arquivo temporário antes do commit** — não vai pro repo:

Run: `rm tmp-smoke-pulseTimeline.ts` (ou `del` no PowerShell).

- [ ] **Step 5: Commit**

```bash
git add lib/poker/pulseTimeline.ts
git commit -m "$(cat <<'EOF'
feat(admin): pure lib buildPulseTimeline

Função pura que filtra linhas de pulse_responses contra os enums de
emoji/source, mapeia snake_case → camelCase, e ordena por createdAt
ASC. Defensiva contra schema drift. Base do endpoint
/api/admin/pulses/[diagnosticId] e do componente PulseTimeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Endpoint `GET /api/admin/pulses/[diagnosticId]`

**Files:**
- Create: `app/api/admin/pulses/[diagnosticId]/route.ts`

**Por quê:** Camada de I/O fina. 1 SELECT em `pulse_responses`, delega à lib pura, devolve o array. Sem 404 — diag inexistente = nunca respondeu (decisão do spec).

- [ ] **Step 1: Criar pasta + arquivo**

Criar `app/api/admin/pulses/[diagnosticId]/route.ts` com este conteúdo:

```ts
/**
 * GET /api/admin/pulses/[diagnosticId]
 *
 * Devolve a timeline de pulses semanais do aluno usada pelo componente
 * PulseTimeline em /admin/resultado/[id].
 *
 * Auth: convenção dos siblings — service-role server-side. NOTA: o
 * matcher de middleware.ts cobre /api/admin/health exato mas não cobre
 * [diagnosticId]. Esta rota herda a mesma lacuna por consistência com
 * /api/admin/health/[diagnosticId] e /api/admin/spot-track/[diagnosticId];
 * tratamento global vira spec separado.
 *
 * Sem 404: diagnóstico inexistente devolve { hasPulses: false } (mesmo
 * shape de "nunca respondeu"). Decisão consciente do spec — pulses são
 * ortogonais ao plano.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildPulseTimeline,
  type PulseRow,
} from "@/lib/poker/pulseTimeline";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> },
) {
  const { diagnosticId } = await ctx.params;

  if (!diagnosticId) {
    return NextResponse.json(
      { error: "diagnosticId required" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("pulse_responses")
    .select("week_iso, emoji, source, created_at")
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[admin/pulses] select", error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (data ?? []) as PulseRow[];

  let pulses;
  try {
    pulses = buildPulseTimeline(rows);
  } catch (err) {
    console.warn("[admin/pulses] build threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({
    hasPulses: pulses.length > 0,
    totalCount: pulses.length,
    pulses,
  });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint app/api/admin/pulses/[diagnosticId]/route.ts`
Expected: zero warnings/errors.

- [ ] **Step 4: Smoke via `curl` (opcional)**

Subir `npm run dev`. O endpoint cai pelo gate `/admin/*` do middleware (matcher estático não cobre `[diagnosticId]`, mas o componente vai chamar via mesma origem — herda o gap dos siblings). Para smoke direto, basta um curl:

```bash
curl -s http://localhost:3000/api/admin/pulses/00000000-0000-0000-0000-000000000000
```

Expected: `{"hasPulses":false,"totalCount":0,"pulses":[]}` (UUID válido formato mas sem rows = empty).

Smoke completo com UUID real fica na Task 5.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/pulses/[diagnosticId]/route.ts
git commit -m "$(cat <<'EOF'
feat(admin): endpoint GET /api/admin/pulses/[diagnosticId]

Devolve a timeline de pulses semanais do aluno. 1 SELECT em
pulse_responses (filtrado por diagnostic_id, ordenado por created_at
ASC), delega à lib pura buildPulseTimeline. Sem 404 — diag inexistente
ou aluno sem pulses devolvem mesmo empty {hasPulses:false}. Segue o
estilo dos siblings /api/admin/health/[diagnosticId] e
/api/admin/spot-track/[diagnosticId]; herda mesmo gap de middleware.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Componente `PulseTimeline`

**Files:**
- Create: `components/admin/PulseTimeline.tsx`

**Por quê:** UI cliente, 1 fetch, 4 estados. Mesmo padrão `reloadTick` dos siblings (`AdminSpotTrack`, `MonthlyScoreboard`) para evitar `react-hooks/set-state-in-effect`.

- [ ] **Step 1: Criar componente**

Criar `components/admin/PulseTimeline.tsx`:

```tsx
"use client";

/**
 * PulseTimeline — bloco "Timeline de Pulses" em /admin/resultado/[id].
 *
 * Fetch único em GET /api/admin/pulses/[diagnosticId]. Renderiza:
 *   - tira horizontal de emojis ordenada por createdAt ASC (ready)
 *   - rodapé com "última resposta · source"
 *   - empty / loading / error com retry
 */

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/poker/adminSpotTrack";
import type {
  PulseEmoji,
  PulseEntry,
} from "@/lib/poker/pulseTimeline";

type Response = {
  hasPulses: boolean;
  totalCount: number;
  pulses: PulseEntry[];
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; totalCount: number; pulses: PulseEntry[] }
  | { kind: "empty" }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
}

const EMOJI_GLYPH: Record<PulseEmoji, string> = {
  sad:   "😣",
  meh:   "😐",
  smile: "🙂",
  grin:  "😄",
};

/**
 * "2026-W21" → "W21". Fallback ao iso bruto se formato inesperado.
 */
function shortWeek(iso: string): string {
  const parts = iso.split("-");
  const last = parts[parts.length - 1] ?? "";
  return /^W\d{1,2}$/.test(last) ? last : iso;
}

export function PulseTimeline({ diagnosticId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/pulses/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasPulses) {
          setState({ kind: "ready", totalCount: data.totalCount, pulses: data.pulses });
        } else {
          setState({ kind: "empty" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[PulseTimeline]", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, reloadTick]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 print:hidden">
      {state.kind === "loading" && (
        <p className="text-sm text-neutral-500">Carregando timeline…</p>
      )}

      {state.kind === "empty" && (
        <>
          <p className="text-[11px] uppercase tracking-widest text-neutral-500">
            Timeline de pulses
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Aluno ainda não respondeu nenhum pulse.
          </p>
        </>
      )}

      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-400">
            Não foi possível carregar a timeline.
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              setReloadTick((n) => n + 1);
            }}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <ReadyView totalCount={state.totalCount} pulses={state.pulses} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente ready
// ---------------------------------------------------------------------------

function ReadyView({
  totalCount,
  pulses,
}: {
  totalCount: number;
  pulses: PulseEntry[];
}) {
  const last = pulses[pulses.length - 1];
  const counterLabel = totalCount === 1 ? "1 resposta" : `${totalCount} respostas`;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Timeline de pulses
        </p>
        <p className="text-xs text-neutral-500 tabular-nums">{counterLabel}</p>
      </div>

      <ol className="mt-3 flex gap-3 sm:gap-4 overflow-x-auto">
        {pulses.map((p) => (
          <li
            key={`${p.weekIso}-${p.createdAt}`}
            className="flex flex-col items-center min-w-[40px]"
            title={`${p.weekIso} · ${p.source} · ${p.createdAt}`}
          >
            <span className="text-2xl leading-none">{EMOJI_GLYPH[p.emoji]}</span>
            <span className="mt-1 text-[10px] text-neutral-500 tabular-nums">
              {shortWeek(p.weekIso)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-neutral-500">
        Última resposta: há {formatRelative(last.createdAt)} · {last.source}
      </p>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint components/admin/PulseTimeline.tsx`
Expected: zero warnings/errors. Em particular, `react-hooks/set-state-in-effect` NÃO deve disparar — o fetch é inline no `useEffect` (sem `useCallback` wrapper), e o setState dentro de `.then`/`.catch` está fora do corpo síncrono do effect.

- [ ] **Step 4: Commit (sem wire ainda)**

```bash
git add components/admin/PulseTimeline.tsx
git commit -m "$(cat <<'EOF'
feat(admin): PulseTimeline component

Cliente isolado: fetch único de /api/admin/pulses, 4 estados (loading /
ready / empty / error com retry). Tira horizontal de emojis (😣/😐/🙂/😄)
com label da semana (W21, W22...) e rodapé "última resposta · source"
reusando formatRelative da entrega admin spot track. Não wireado ainda
— a edição em /admin/resultado/[id]/page.tsx é a próxima task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Wire em `/admin/resultado/[id]/page.tsx`

**Files:**
- Modify: `app/admin/resultado/[id]/page.tsx` (linhas 1-10 dos imports, linha 99 do JSX)

**Por quê:** Última peça — instanciar o componente abaixo do `<AdminSpotTrack>` no wrapper existente. Mudança cirúrgica.

- [ ] **Step 1: Adicionar import**

Editar `app/admin/resultado/[id]/page.tsx`. Logo após o import do `AdminSpotTrack` (linha 8: `import { AdminSpotTrack } from "@/components/admin/AdminSpotTrack";`), adicionar:

```tsx
import { PulseTimeline } from "@/components/admin/PulseTimeline";
```

- [ ] **Step 2: Inserir o componente no JSX**

Localizar o bloco atual (linhas 96-99):

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6 space-y-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
  <AdminSpotTrack diagnosticId={row.id} />
</div>
```

Substituir por:

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6 space-y-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
  <AdminSpotTrack diagnosticId={row.id} />
  <PulseTimeline diagnosticId={row.id} />
</div>
```

Sem outras mudanças no arquivo.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: zero novos erros (pré-existentes em outros arquivos seguem).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa, nova rota `ƒ /api/admin/pulses/[diagnosticId]` registrada.

- [ ] **Step 6: Commit**

```bash
git add app/admin/resultado/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): wire PulseTimeline abaixo do AdminSpotTrack

Bloco 'Timeline de Pulses' aparece em /admin/resultado/[id] logo abaixo
do AdminSpotTrack, dentro do mesmo wrapper space-y-6. Sem outras
mudanças na página.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar os critérios de aceite do spec com a feature inteira no ar.

- [ ] **Step 1: Smoke no dev**

Run: `npm run dev`
Esperado: dev server rodando em http://localhost:3000.

- [ ] **Step 2: Caso "happy path" — aluno com pulses**

Abrir `/admin` (autenticar Basic Auth com `ADMIN_USER/ADMIN_PASSWORD`), navegar pra `/admin/resultado/<id_de_aluno_com_pulses>`. Conferir:

- [ ] Bloco "TIMELINE DE PULSES" aparece logo abaixo do AdminSpotTrack.
- [ ] Header esquerda mostra `TIMELINE DE PULSES`, direita mostra `"{N} respostas"` (ou `"1 resposta"`).
- [ ] Tira horizontal mostra emojis (😣/😐/🙂/😄) ordenados cronologicamente da esquerda pra direita.
- [ ] Cada emoji tem label `"W{n}"` abaixo (ex.: `W21`, `W22`).
- [ ] Rodapé mostra `"Última resposta: há {hoje|Xd|Xsem|+1mês} · {source}"`.
- [ ] Se a tira ultrapassa a largura, scroll horizontal funciona (`overflow-x-auto`).

- [ ] **Step 3: Caso "empty" — aluno sem pulses**

Abrir `/admin/resultado/<id_de_aluno_sem_pulses>`. Conferir:

- [ ] Bloco mostra eyebrow `"Timeline de pulses"` + texto `"Aluno ainda não respondeu nenhum pulse."`. Sem tira.

- [ ] **Step 4: Caso "erro de rede"**

DevTools → Network → Offline. Recarregar a página. Conferir:

- [ ] Bloco mostra `"Não foi possível carregar a timeline."` + botão `"Tentar de novo"`.
- [ ] Clicar em "Tentar de novo" com network restaurado recarrega corretamente.

- [ ] **Step 5: Conferir critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-admin-pulse-timeline-design.md` seção "Critérios de aceite". Bater mentalmente:

- [ ] `GET /api/admin/pulses/{id}` 200 com `hasPulses + totalCount + pulses[]` ordenado ASC.
- [ ] Empty 200 com `hasPulses: false, totalCount: 0, pulses: []`.
- [ ] 400 em `diagnosticId` ausente.
- [ ] 500 em erro de DB (com log `[admin/pulses]`).
- [ ] `buildPulseTimeline` filtra rows com emoji/source fora dos enums.
- [ ] `buildPulseTimeline` ordena por `createdAt` ASC.
- [ ] Bloco renderiza abaixo do AdminSpotTrack.
- [ ] Tira de emojis com glyph + label da semana.
- [ ] Contador no header.
- [ ] Rodapé com última resposta + source.
- [ ] 4 estados.
- [ ] `print:hidden`.
- [ ] Nenhuma alteração em `/api/pulse`, `PulseCard`, cron weekly-pulse, `HealthScoreBlock`, `lib/health/collect.ts`.

- [ ] **Step 6: Reportar pronto**

Sem ação de código. Reportar: feature completa, 4 commits no branch `onboarding-ev`, smoke ok, pronto pra finalização (`finishing-a-development-branch`).

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério do spec mapeia em alguma task.

- "200 + hasPulses + totalCount + pulses ASC" → Task 2 Step 1 (handler) + Task 1 Step 1 (lib).
- "Empty `hasPulses: false`" → Task 2 Step 1 (pulses.length === 0 → hasPulses: false).
- "400 sem id" → Task 2 Step 1.
- "500 em erro DB" → Task 2 Step 1, ambos blocos error.
- "Filtra emoji/source inválidos" → Task 1 Step 1 (`VALID_EMOJI` / `VALID_SOURCE`).
- "Ordena ASC" → Task 1 Step 1 (`localeCompare`).
- "Bloco abaixo do AdminSpotTrack" → Task 4 Step 2.
- "Tira de emojis + label" → Task 3 Step 1, `ReadyView` `<ol>`.
- "Contador no header" → Task 3 Step 1 (`counterLabel`).
- "Rodapé última + source" → Task 3 Step 1 (`<p>Última resposta…</p>`).
- "4 estados" → Task 3 Step 1.
- "print:hidden" → Task 3 Step 1 (className do `<section>`).
- "Não toca siblings" → garantido por não tocar esses arquivos.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código têm o código completo. Step 4 da Task 2 (curl smoke opcional) é instrução procedural com comando real, não vagueza.

**3. Type consistency:** `PulseEmoji`, `PulseSource`, `PulseRow`, `PulseEntry` definidos na Task 1, importados na Task 2 (`PulseRow`) e Task 3 (`PulseEmoji`, `PulseEntry`). `buildPulseTimeline(rows)` mesma assinatura em todas as referências. Response shape `{ hasPulses, totalCount, pulses }` consistente entre handler (Task 2) e componente (Task 3).
