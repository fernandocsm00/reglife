# Admin spot track — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar um bloco "Trilha de 30 dias" em `/admin/resultado/[id]` que mostra, por spot da trilha do aluno, o estado (locked/active/completed), mãos jogadas, % de acerto e última atividade — usando dados já persistidos em `reglife_diagnostic_results.saved_plan` e `spot_training_sessions`.

**Architecture:** Endpoint admin dedicado (`/api/admin/spot-track/[diagnosticId]`) lê o `saved_plan` + as linhas de treino em paralelo, delega a uma lib pura (`lib/poker/adminSpotTrack.ts`) que faz o merge com a ordem canônica de `buildSpotTrack`, e devolve um array enxuto. Componente React (`components/admin/AdminSpotTrack.tsx`) consome em **uma** chamada de rede, renderiza tabela densa, empty states explícitos e error state com retry.

**Tech Stack:** Next.js App Router (TS), Supabase service-role no server, Tailwind para UI, classes utility `rg-*` quando aplicável. Sem framework de testes (projeto só roda `tsc`, `lint`, `build`). Validação manual no dev server + `curl`.

**Spec base:** `docs/superpowers/specs/2026-06-02-admin-spot-track-design.md` (commit `5dadf00`).

---

## Decisões de implementação (divergências mínimas do spec)

1. **Campo `lessonTitle` → `spotLabel`.** O `SpotTrackEntry.label` (já em `lib/poker/spotTrack.ts`) é o "pretty label" do leak (ex.: `"Cbet do BTN em 40bb"`), que é mais útil pro EV do que o título da aula relacionada. Reusar evita import de `LESSON_CATALOG` no admin. Renomeio o campo na resposta para refletir o conteúdo verdadeiro.
2. **`index` 1-based na resposta.** `SpotTrackEntry.index` é 0-based no código atual; a lib pura faz `+ 1` ao montar a resposta (display 1-based, como o spec pede). Em Português isso vira "Spot 1 / 3".
3. **Middleware admin não cobre `[diagnosticId]`.** O matcher em `middleware.ts` lista `/api/admin/health` exato, deixando `/api/admin/health/<id>` sem gating. Bug pré-existente. Sigo o mesmo padrão (`/api/admin/spot-track/<id>` herda essa lacuna) por consistência e registro abaixo como follow-up. Tratar isso é um spec separado.

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/adminSpotTrack.ts` | **Create** | Lógica pura. Define tipos `AdminSpotEntry` / `TrainingRow`. Exporta `mergeTrackWithTraining(plan, rows)` e `formatRelative(iso, nowIso)`. Sem I/O. |
| `app/api/admin/spot-track/[diagnosticId]/route.ts` | **Create** | Endpoint `GET`. Faz 2 SELECTs em paralelo no Supabase service-role, decide precedência dos empty states, delega merge para a lib. Sem lógica de negócio aqui — só I/O e shape de resposta. |
| `components/admin/AdminSpotTrack.tsx` | **Create** | UI client component. Faz `fetch` único, renderiza loading / ready / 3× empty / error. Reusa estilo cinza-neutral dos siblings (`HealthScoreBlock`, `HealthTable`). |
| `app/admin/resultado/[id]/page.tsx` | **Modify** (linha ~96, dentro do `max-w-6xl` wrapper) | Adicionar `<AdminSpotTrack diagnosticId={row.id} />` logo abaixo do `<HealthScoreBlock>`. Uma linha real, mais wrapper de espaçamento. |

Nenhum schema change. Nenhuma alteração em rotas, componentes ou libs de aluno (`SpotTrack`, `SpotCard`, `SpotTrainingRow`, `/api/spot-training`).

## Sequência das tasks

1. **Task 1** — Lib pura (`adminSpotTrack.ts`). Base autocontida que tasks 2 e 3 vão importar.
2. **Task 2** — Endpoint. Consome a lib, expõe HTTP.
3. **Task 3** — Componente. Consome o endpoint, renderiza UI.
4. **Task 4** — Wire no `page.tsx`.
5. **Task 5** — Sanity check + smoke test final.

Cada task termina com `tsc --noEmit` verde e um commit.

---

## Task 1 — Lib pura `adminSpotTrack.ts`

**Files:**
- Create: `lib/poker/adminSpotTrack.ts`

**Por quê:** Centraliza o merge da ordem canônica do `buildSpotTrack(plan)` com as linhas de treino do banco. Função pura, sem fetch, fácil de raciocinar e de testar manualmente via `npx tsx` se necessário. `formatRelative` mora aqui para ficar perto da lógica de exibição da "última atividade" e poder ser reusada pelo componente sem trazê-lo pra orbit do server.

- [ ] **Step 1: Criar o arquivo com tipos e regras**

Criar `lib/poker/adminSpotTrack.ts` com este conteúdo exato:

```ts
/**
 * Lógica pura usada pelo endpoint admin /api/admin/spot-track/[diagnosticId].
 *
 * Recebe o SavedPlan persistido em reglife_diagnostic_results.saved_plan e as
 * linhas da tabela spot_training_sessions, faz o merge respeitando a ordem
 * canônica de buildSpotTrack, e devolve um array enxuto pronto pro front.
 *
 * Sem I/O. Todas as decisões de estado (locked/active/completed) ficam aqui
 * — endpoint e componente só repassam o resultado.
 */

import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildSpotTrack, type SpotTrackEntry } from "@/lib/poker/spotTrack";

export interface TrainingRow {
  leak_id: string;
  hands_played: number;
  hands_correct: number;
  completed_at: string | null;
  updated_at: string | null;
}

export interface AdminSpotEntry {
  /** 1-based para display. SpotTrackEntry.index é 0-based; somamos +1 aqui. */
  index: number;
  /** Total de spots na trilha — útil pra renderizar "Spot 1 / 3". */
  totalCount: number;
  /** Leak id (ex.: "cBet-BTN-40"). Null em filler slots (raros, mas possíveis). */
  leakId: string | null;
  /** Pretty label do leak (ex.: "Cbet do BTN em 40bb"). Vem direto do SpotTrackEntry.label. */
  spotLabel: string;
  /** Estado da gating sequencial. */
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  handsCorrect: number;
  /** Inteiro 0-100, null quando handsPlayed === 0. */
  accuracyPct: number | null;
  completedAt: string | null;
  lastActivityAt: string | null;
}

/**
 * Mescla a ordem canônica da trilha com as linhas de treino do banco.
 *
 * Regra de estado (idêntica à derivação client em components/trainer/SpotTrack.tsx):
 *   - Primeira entry com completed_at == null → "active".
 *   - Anteriores → "completed".
 *   - Posteriores → "locked".
 *   - Tudo completo → todos "completed".
 */
export function mergeTrackWithTraining(
  plan: SavedPlan,
  rows: TrainingRow[],
): AdminSpotEntry[] {
  const track: SpotTrackEntry[] = buildSpotTrack(plan);
  if (track.length === 0) return [];

  const byLeak = new Map<string, TrainingRow>();
  for (const row of rows) byLeak.set(row.leak_id, row);

  // Acha o primeiro spot ainda não-completo. Falta de linha conta como não-completo.
  let activeIdx = -1;
  for (let i = 0; i < track.length; i++) {
    const id = track[i].leakId;
    const row = id ? byLeak.get(id) : undefined;
    if (!row || row.completed_at == null) {
      activeIdx = i;
      break;
    }
  }
  // -1 significa que tudo está completo → "active" não existe.
  const effectiveActive = activeIdx === -1 ? track.length : activeIdx;

  return track.map((entry, i) => {
    const row = entry.leakId ? byLeak.get(entry.leakId) : undefined;
    const handsPlayed = row?.hands_played ?? 0;
    const handsCorrect = row?.hands_correct ?? 0;
    const accuracyPct =
      handsPlayed > 0 ? Math.round((handsCorrect / handsPlayed) * 100) : null;

    const state: AdminSpotEntry["state"] =
      i < effectiveActive ? "completed" : i === effectiveActive ? "active" : "locked";

    return {
      index: i + 1,
      totalCount: track.length,
      leakId: entry.leakId,
      spotLabel: entry.label,
      state,
      handsPlayed,
      handsCorrect,
      accuracyPct,
      completedAt: row?.completed_at ?? null,
      lastActivityAt: row?.updated_at ?? null,
    };
  });
}

/**
 * Formata um timestamp ISO em string relativa curta:
 *   - null/undefined → "—"
 *   - mesma data (UTC) do "agora" → "hoje"
 *   - 1..7 dias atrás → "{N}d"
 *   - 8..30 dias atrás → "{N}sem" (semanas arredondadas pra baixo, min 1)
 *   - >30 dias → "+1mês"
 *
 * UTC é suficiente — "hoje vs ontem" precision não muda o sinal pro EV.
 * Recebe `nowIso` opcional pra ser determinístico em testes manuais.
 */
export function formatRelative(
  iso: string | null | undefined,
  nowIso?: string,
): string {
  if (!iso) return "—";
  const now = nowIso ? new Date(nowIso) : new Date();
  const then = new Date(iso);
  if (isNaN(then.getTime())) return "—";

  const utcDayDiff =
    Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000) -
    Math.floor(Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate()) / 86_400_000);

  if (utcDayDiff <= 0) return "hoje";
  if (utcDayDiff <= 7) return `${utcDayDiff}d`;
  if (utcDayDiff <= 30) {
    const weeks = Math.max(1, Math.floor(utcDayDiff / 7));
    return `${weeks}sem`;
  }
  return "+1mês";
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero erros novos. Se aparecer `Cannot find module '@/lib/poker/spotTrack'`, conferir que `@/` está mapeado no `tsconfig.json` (já está — `paths: { "@/*": ["./*"] }`).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero novos erros no arquivo. Pré-existentes em outros arquivos são esperados (16 erros / 7 warnings espalhados pelo projeto — não tocar).

- [ ] **Step 4: Smoke manual via `tsx` (opcional, mas recomendado)**

Como o projeto não tem suite de testes, validar manualmente cobre os 8 casos do spec. Criar um script temporário em `/tmp/smoke-admin-spot-track.ts` e rodar:

```ts
// /tmp/smoke-admin-spot-track.ts — apaga depois de rodar
import { mergeTrackWithTraining, formatRelative } from "./lib/poker/adminSpotTrack";

// Fixture mínima de SavedPlan. Plan.leaks é o que buildSpotTrack consome.
// Os 3 ids são canônicos de slot 1, 2, 3 — buildSpotTrack vai preservar ordem.
const plan: any = {
  leaks: [
    { id: "RFI-BTN-40",  label: "RFI do BTN em 40bb",   pct: 60 },
    { id: "cBet-BTN-40", label: "Cbet do BTN em 40bb",  pct: 50 },
    { id: "vsRFI-BB-40", label: "BB vs RFI em 40bb",    pct: 70 },
  ],
};

const NOW = "2026-06-02T12:00:00Z";

// Caso 1: 0 treinos
console.log("[1]", JSON.stringify(mergeTrackWithTraining(plan, []).map(s => s.state)));
// Esperado: ["active","locked","locked"]

// Caso 2: primeiro completo
console.log("[2]", JSON.stringify(mergeTrackWithTraining(plan, [
  { leak_id: "RFI-BTN-40", hands_played: 50, hands_correct: 36,
    completed_at: "2026-05-28T10:00:00Z", updated_at: "2026-05-28T10:00:00Z" },
]).map(s => s.state)));
// Esperado: ["completed","active","locked"]

// Caso 3: tudo completo
console.log("[3]", JSON.stringify(mergeTrackWithTraining(plan, [
  { leak_id: "RFI-BTN-40",  hands_played: 50, hands_correct: 36, completed_at: "2026-05-28T10:00:00Z", updated_at: "2026-05-28T10:00:00Z" },
  { leak_id: "cBet-BTN-40", hands_played: 50, hands_correct: 38, completed_at: "2026-05-29T10:00:00Z", updated_at: "2026-05-29T10:00:00Z" },
  { leak_id: "vsRFI-BB-40", hands_played: 50, hands_correct: 40, completed_at: "2026-05-30T10:00:00Z", updated_at: "2026-05-30T10:00:00Z" },
]).map(s => s.state)));
// Esperado: ["completed","completed","completed"]

// Caso 4: plano sem leaks
console.log("[4]", JSON.stringify(mergeTrackWithTraining({ leaks: [] } as any, [])));
// Esperado: []

// Caso 5: arredondamento 18/11 = 61.11 → 61
console.log("[5]", mergeTrackWithTraining(plan, [
  { leak_id: "RFI-BTN-40", hands_played: 18, hands_correct: 11, completed_at: null, updated_at: NOW },
])[0].accuracyPct);
// Esperado: 61

// Caso 6: arredondamento 13/8 = 61.54 → 62
console.log("[6]", mergeTrackWithTraining(plan, [
  { leak_id: "RFI-BTN-40", hands_played: 13, hands_correct: 8, completed_at: null, updated_at: NOW },
])[0].accuracyPct);
// Esperado: 62

// Caso 7: linha existe mas hands_played === 0 (defensivo)
console.log("[7]", mergeTrackWithTraining(plan, [
  { leak_id: "RFI-BTN-40", hands_played: 0, hands_correct: 0, completed_at: null, updated_at: NOW },
])[0].accuracyPct);
// Esperado: null

// Caso 8: formatRelative
console.log("[F]", [
  formatRelative(null, NOW),                       // "—"
  formatRelative(NOW, NOW),                        // "hoje"
  formatRelative("2026-06-01T10:00:00Z", NOW),     // "1d"
  formatRelative("2026-05-30T10:00:00Z", NOW),     // "3d"
  formatRelative("2026-05-22T10:00:00Z", NOW),     // "1sem" (11 dias)
  formatRelative("2026-05-12T10:00:00Z", NOW),     // "2sem" (21 dias)
  formatRelative("2026-04-25T10:00:00Z", NOW),     // "+1mês" (38 dias)
].join(" | "));
// Esperado: — | hoje | 1d | 3d | 1sem | 2sem | +1mês
```

Run: `npx tsx /tmp/smoke-admin-spot-track.ts`
Expected: ver as 8 linhas com os valores esperados acima. Se algo divergir, ler o output, ajustar o código, repetir.

Se `tsx` não estiver disponível no projeto, pular este step e validar via curl no endpoint (Task 2).

Apagar `/tmp/smoke-admin-spot-track.ts` ao final — não vai pro repo.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/adminSpotTrack.ts
git commit -m "$(cat <<'EOF'
feat(admin): pure lib mergeTrackWithTraining + formatRelative

Função pura que mescla a ordem canônica de buildSpotTrack com as linhas
de spot_training_sessions e deriva o estado (locked/active/completed).
Inclui formatRelative para a coluna 'Última' do bloco do admin. Base
para o endpoint /api/admin/spot-track/[diagnosticId] e o componente
AdminSpotTrack. Sem I/O, sem dependências externas.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Endpoint `GET /api/admin/spot-track/[diagnosticId]`

**Files:**
- Create: `app/api/admin/spot-track/[diagnosticId]/route.ts`

**Por quê:** Camada de I/O isolada. Dois SELECTs em paralelo no Supabase service-role, decisão de empty state com precedência (`abandoned` > `no_saved_plan` > `elite_no_track`), shape final via lib pura da Task 1. Segue o estilo do sibling `app/api/admin/health/[diagnosticId]/route.ts` (assinatura `params: Promise<…>`, `export const dynamic = "force-dynamic"`, log via `console.warn` sem expor mensagens reais).

- [ ] **Step 1: Criar pasta + arquivo**

Criar `app/api/admin/spot-track/[diagnosticId]/route.ts` com este conteúdo:

```ts
/**
 * GET /api/admin/spot-track/[diagnosticId]
 *
 * Devolve a trilha de 30 dias do aluno com progresso de treino por spot,
 * usado pelo componente AdminSpotTrack em /admin/resultado/[id].
 *
 * Empty state com precedência:
 *   - abandoned       : spots_played === 0 (mesmo se saved_plan estiver setado)
 *   - no_saved_plan   : spots_played > 0 mas saved_plan IS NULL
 *   - elite_no_track  : saved_plan existe mas buildSpotTrack retorna []
 *
 * Auth: convencional dos siblings — service-role server-side. NOTA: o
 * matcher de middleware.ts cobre `/api/admin/health` exato mas não cobre
 * `[diagnosticId]`. Esta rota herda a mesma lacuna por consistência com
 * o sibling /api/admin/health/[diagnosticId]; tratamento global vira spec
 * separado.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  mergeTrackWithTraining,
  type TrainingRow,
} from "@/lib/poker/adminSpotTrack";

export const dynamic = "force-dynamic";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

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

  // Duas leituras em paralelo: o registro do diagnóstico e as linhas de treino.
  // Promise.all aceita a falha cedo — o catch global devolve 500.
  let diagRes, trainingRes;
  try {
    [diagRes, trainingRes] = await Promise.all([
      supabase
        .from("reglife_diagnostic_results")
        .select("saved_plan, spots_played")
        .eq("id", diagnosticId)
        .maybeSingle(),
      supabase
        .from("spot_training_sessions")
        .select("leak_id, hands_played, hands_correct, completed_at, updated_at")
        .eq("diagnostic_id", diagnosticId),
    ]);
  } catch (err) {
    console.warn("[admin/spot-track] fetch threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (diagRes.error) {
    console.warn("[admin/spot-track] diag select", diagRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  if (!diagRes.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { saved_plan: savedPlan, spots_played: spotsPlayed } = diagRes.data as {
    saved_plan: SavedPlan | null;
    spots_played: number | null;
  };

  // Precedência dos empty states.
  if ((spotsPlayed ?? 0) === 0) {
    return NextResponse.json({ hasTrack: false, reason: "abandoned" as EmptyReason });
  }
  if (!savedPlan) {
    return NextResponse.json({ hasTrack: false, reason: "no_saved_plan" as EmptyReason });
  }

  if (trainingRes.error) {
    console.warn("[admin/spot-track] training select", trainingRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const spots = mergeTrackWithTraining(savedPlan, rows);

  if (spots.length === 0) {
    return NextResponse.json({ hasTrack: false, reason: "elite_no_track" as EmptyReason });
  }

  return NextResponse.json({ hasTrack: true, spots });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero erros novos.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero novos erros no arquivo recém-criado.

- [ ] **Step 4: Smoke test no dev (curl)**

Subir o dev server num terminal: `npm run dev` (porta 3000 por padrão).

Em outro terminal, testar os 4 caminhos. Substituir `<UUID>` por um id real da `reglife_diagnostic_results` correspondente. O endpoint não passa pelo middleware do `/admin` (mesma situação do sibling), então `curl` direto funciona.

```bash
# Happy path: aluno com trilha e algum treino
curl -s http://localhost:3000/api/admin/spot-track/<UUID_COM_PLANO> | jq

# Aluno que abandonou (spots_played = 0)
curl -s http://localhost:3000/api/admin/spot-track/<UUID_ABANDONADO> | jq
# Esperado: { "hasTrack": false, "reason": "abandoned" }

# ID inexistente
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/admin/spot-track/00000000-0000-0000-0000-000000000000 | tail -3
# Esperado: { "error": "not found" } + HTTP 404

# ID malformado (sem [diagnosticId] na URL)
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/admin/spot-track/ | tail -3
# Esperado: o roteador do Next devolve 404 antes do handler — OK
```

Se nenhum dos UUIDs reais estiver à mão, pular pra Step 5 (commit) e validar no smoke final da Task 5. O tsc + lint já dão confiança que o handler não vai quebrar em runtime trivialmente.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/spot-track/[diagnosticId]/route.ts
git commit -m "$(cat <<'EOF'
feat(admin): endpoint GET /api/admin/spot-track/[diagnosticId]

Devolve a trilha do aluno + progresso de treino por spot. Duas leituras
em paralelo (saved_plan + spot_training_sessions), decisão dos empty
states com precedência (abandoned > no_saved_plan > elite_no_track),
shape final via lib pura mergeTrackWithTraining. Segue o estilo do
sibling /api/admin/health/[diagnosticId]; herda a mesma lacuna de
middleware (matcher não cobre [diagnosticId]) — tratamento global vira
spec à parte.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Componente `AdminSpotTrack`

**Files:**
- Create: `components/admin/AdminSpotTrack.tsx`

**Por quê:** Cliente isolado, faz UM fetch, renderiza 4 estados (loading / ready / 3× empty / error). Reusa o estilo cinza-neutral dos siblings em `components/admin/HealthTable.tsx` e `components/trainer/HealthScoreBlock.tsx`. Sem reusar `SpotCard` do aluno — a UI do admin é tabela densa, não cards verticais.

- [ ] **Step 1: Criar componente**

Criar `components/admin/AdminSpotTrack.tsx`:

```tsx
"use client";

/**
 * AdminSpotTrack — bloco "Trilha de 30 dias" em /admin/resultado/[id].
 *
 * Fetch único de GET /api/admin/spot-track/[diagnosticId]. Renderiza:
 *   - tabela densa por spot (success)
 *   - 3 empty states (abandoned, no_saved_plan, elite_no_track)
 *   - loading / error com retry
 */

import { useCallback, useEffect, useState } from "react";
import {
  formatRelative,
  type AdminSpotEntry,
} from "@/lib/poker/adminSpotTrack";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

type Response =
  | { hasTrack: true; spots: AdminSpotEntry[] }
  | { hasTrack: false; reason: EmptyReason };

type State =
  | { kind: "loading" }
  | { kind: "ready"; spots: AdminSpotEntry[] }
  | { kind: "empty"; reason: EmptyReason }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
}

const EMPTY_MESSAGE: Record<EmptyReason, string> = {
  abandoned:      "Aluno não jogou nenhum spot.",
  no_saved_plan:  "Aluno não chegou a gerar plano (abandonou o quiz).",
  elite_no_track: "Aluno passou em todos os spots do diagnóstico — sem trilha.",
};

const STATE_LABEL: Record<AdminSpotEntry["state"], string> = {
  completed: "Concl.",
  active:    "Ativo",
  locked:    "Bloq.",
};

const STATE_DOT: Record<AdminSpotEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-yellow-400",
  locked:    "bg-neutral-600",
};

export function AdminSpotTrack({ diagnosticId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/admin/spot-track/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasTrack) setState({ kind: "ready", spots: data.spots });
        else setState({ kind: "empty", reason: data.reason });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[AdminSpotTrack] fetch", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Trilha de 30 dias
      </p>

      {state.kind === "loading" && (
        <p className="mt-3 text-sm text-neutral-500">Carregando trilha…</p>
      )}

      {state.kind === "empty" && (
        <p className="mt-3 text-xs text-neutral-500">{EMPTY_MESSAGE[state.reason]}</p>
      )}

      {state.kind === "error" && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm text-neutral-400">Não foi possível carregar a trilha.</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-neutral-500">
              <tr className="border-b border-neutral-800">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Spot</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">Mãos</th>
                <th className="px-2 py-2 text-left">%</th>
                <th className="px-2 py-2 text-left">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {state.spots.map((s) => (
                <tr key={`${s.index}-${s.leakId ?? "empty"}`}>
                  <td className="px-2 py-2 text-neutral-600 tabular-nums">{s.index}</td>
                  <td className="px-2 py-2 text-neutral-200">{s.spotLabel}</td>
                  <td className="px-2 py-2 text-neutral-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[s.state]}`} />
                      {STATE_LABEL[s.state]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-neutral-400 tabular-nums">
                    {s.handsPlayed}/50
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {s.accuracyPct === null ? (
                      <span className="text-neutral-600">—</span>
                    ) : s.accuracyPct >= 70 ? (
                      <span className="text-emerald-400">{s.accuracyPct}%</span>
                    ) : (
                      <span className="text-amber-400">{s.accuracyPct}%</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {formatRelative(s.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero erros novos.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: zero novos erros no arquivo. Se reclamar de `@typescript-eslint/no-explicit-any`, conferir que nada no arquivo usa `any` — não deveria.

- [ ] **Step 4: Commit (componente isolado, sem wire ainda)**

```bash
git add components/admin/AdminSpotTrack.tsx
git commit -m "$(cat <<'EOF'
feat(admin): AdminSpotTrack component

Bloco 'Trilha de 30 dias' isolado: fetch único de /api/admin/spot-track,
4 estados (loading / ready / empty x3 / error com retry). Tabela densa
com estado por bolinha colorida, % colorido por threshold de 70%, mãos
sobre 50 e última atividade via formatRelative. Não wireado ainda — a
edição em /admin/resultado/[id]/page.tsx é a próxima task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Wire em `/admin/resultado/[id]/page.tsx`

**Files:**
- Modify: `app/admin/resultado/[id]/page.tsx` (linhas 1-10 dos imports, linha ~96 do wrapper do HealthScoreBlock)

**Por quê:** Última peça — instanciar o componente abaixo do `HealthScoreBlock`. Mudança cirúrgica.

- [ ] **Step 1: Adicionar import**

Editar `app/admin/resultado/[id]/page.tsx`. Logo após o import do `HealthScoreBlock` (linha 7 atual: `import { HealthScoreBlock } from "@/components/trainer/HealthScoreBlock";`), adicionar:

```tsx
import { AdminSpotTrack } from "@/components/admin/AdminSpotTrack";
```

- [ ] **Step 2: Inserir o componente no JSX**

Localizar o bloco atual (linhas 95-97):

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
</div>
```

Substituir por:

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6 space-y-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
  <AdminSpotTrack diagnosticId={row.id} />
</div>
```

Detalhe: troquei `pt-6` puro por `pt-6 space-y-6` pra dar respiro entre os dois cards. Sem outras mudanças no arquivo.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero erros novos.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: zero novos erros no arquivo. (`useState`/`useEffect` já estão importados na página; nada novo.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa, 19+ rotas geradas. Confirma que o componente importa e compila no contexto da página.

- [ ] **Step 6: Commit**

```bash
git add app/admin/resultado/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): wire AdminSpotTrack abaixo do HealthScoreBlock

Bloco 'Trilha de 30 dias' aparece em /admin/resultado/[id] logo abaixo
do Health Score, dentro do mesmo wrapper de max-w-6xl. Sem outras
mudanças na página.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar os critérios de aceite do spec com a feature completa rodando.

- [ ] **Step 1: Smoke test no dev**

Subir `npm run dev`. Logar no `/admin` (Basic Auth via `ADMIN_USER` / `ADMIN_PASSWORD`).

- [ ] **Step 2: Caso "completo" — aluno com trilha e treino**

Abrir `/admin/resultado/<id_de_um_aluno_que_treinou>`. Conferir visualmente:

- [ ] Bloco "TRILHA DE 30 DIAS" aparece logo abaixo do Health Score.
- [ ] Linhas estão ordenadas (#1, #2, #3…).
- [ ] Pelo menos um spot tem estado `Ativo` ou `Concl.` se o aluno treinou.
- [ ] `%` aparece verde quando `>=70`, âmbar em caso contrário, `—` quando `0/50`.
- [ ] Coluna "Última" mostra valores plausíveis (`hoje`, `2d`, `1sem`, etc.).

- [ ] **Step 3: Caso "abandonou"**

Abrir `/admin/resultado/<id_de_aluno_abandonado>` (spots_played = 0). Conferir:

- [ ] Bloco mostra "Aluno não jogou nenhum spot." — sem tabela.

- [ ] **Step 4: Caso "Elite"**

Abrir `/admin/resultado/<id_de_elite>` (passou em todos os spots). Conferir:

- [ ] Bloco mostra "Aluno passou em todos os spots do diagnóstico — sem trilha."

- [ ] **Step 5: Caso "erro de rede"**

No DevTools, simular network failure (aba Network → "Offline"), e dar reload da página. Conferir:

- [ ] Card mostra "Não foi possível carregar a trilha." + botão "Tentar de novo".
- [ ] Clicar em "Tentar de novo" com network restaurado recarrega corretamente.

- [ ] **Step 6: Checar critérios de aceite do spec item a item**

Reler `docs/superpowers/specs/2026-06-02-admin-spot-track-design.md` seção "Critérios de aceite". Marcar mentalmente cada um contra o estado atual:

- [ ] `GET /api/admin/spot-track/{id}` 200 com `hasTrack: true` e `spots` ordenado.
- [ ] `abandoned` quando `spots_played === 0`.
- [ ] `no_saved_plan` quando `spots_played > 0` e `saved_plan IS NULL`.
- [ ] `elite_no_track` quando `saved_plan` existe mas `buildSpotTrack` retorna `[]`.
- [ ] 404 quando diagnóstico não existe.
- [ ] Derivação de estado: primeiro `completed_at == null` → `active`; anteriores → `completed`; posteriores → `locked`.
- [ ] `accuracyPct` inteiro arredondado / `null` se `handsPlayed === 0`.
- [ ] Bloco visível abaixo do `HealthScoreBlock`.
- [ ] 4 estados renderizados (loading / 3× empty / success / error).
- [ ] `formatRelative` cobre `hoje | {N}d | {N}sem | +1mês | —`.
- [ ] `/api/spot-training`, `SpotTrack`, `SpotCard`, `HealthScoreBlock` inalterados.

- [ ] **Step 7: Reportar pronto pra review**

Sem ação de código. Reportar: feature completa, 4 commits no branch `onboarding-ev`, smoke test ok, pronto pra finalização (`finishing-a-development-branch`).

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério de aceite do spec mapeia em alguma task.

- "200 com `hasTrack: true` e array ordenado" → Task 2 Step 1 (handler) + Task 1 Step 1 (lib pura ordena via buildSpotTrack).
- "`abandoned` quando `spots_played === 0`" → Task 2 Step 1, bloco precedente da decisão de empty.
- "`no_saved_plan`" → Task 2 Step 1, bloco posterior.
- "`elite_no_track`" → Task 2 Step 1, depois do merge.
- "404 quando não existe" → Task 2 Step 1, `if (!diagRes.data)`.
- "Derivação de estado" → Task 1 Step 1, função `mergeTrackWithTraining`.
- "`accuracyPct` arredondado / null" → Task 1 Step 1, dentro do `.map`.
- "Bloco abaixo do HealthScoreBlock" → Task 4 Step 2.
- "4 estados" → Task 3 Step 1.
- "`formatRelative` 5 buckets" → Task 1 Step 1, função `formatRelative`.
- "siblings inalterados" → garantido por não tocar nenhum desses arquivos em nenhuma task.

**2. Placeholder scan:** sem TBD/TODO. Os "se algo divergir, ajustar" em Step 4 da Task 1 são instrução procedural, não vagueza. Todos os steps de código têm o código completo.

**3. Type consistency:** `AdminSpotEntry`, `TrainingRow`, `EmptyReason`, `State` definidos uma vez na Task 1 / Task 2 / Task 3 e consumidos consistentemente. `mergeTrackWithTraining(plan, rows)` mesma assinatura em todas as referências. `spotLabel` (não `lessonTitle`) é o nome final em todo o stack — divergência do spec registrada na seção "Decisões de implementação" no topo.

**4. Divergência consciente do spec:** o spec usa `lessonTitle` no contrato; o plano usa `spotLabel` (com justificativa) — tudo registrado no topo do plano e refletido nos 3 arquivos novos. Não é gap de cobertura.
