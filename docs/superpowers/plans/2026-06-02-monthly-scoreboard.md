# Placar Mensal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `EvHud` (placar semanal: streak/XP/volume/quest/HS) por `MonthlyScoreboard` (3 cards de meta mensal — spots/volume/mãos — + mini-resumo dos spots com mini-barras) em `/meu-plano`.

**Architecture:** Endpoint admin/aluno dedicado (`GET /api/plan/scoreboard/[diagnosticId]`, gated por `requireDiagSession`) faz 3 SELECTs paralelos (saved_plan + spot_training_sessions + sharkscope_monthly_stats) e delega a uma lib pura `buildMonthlyScoreboard` que reusa `mergeTrackWithTraining` da entrega admin spot track. Componente client faz uma fetch e renderiza 4 estados. `EvHud.tsx` deletado (consumidor único é `PlanScreen.tsx`).

**Tech Stack:** Next.js App Router (TS), Supabase service-role server-side, Tailwind. Sem framework de testes (só `tsc`/`lint`/`build`). Validação via smoke `tsx` na lib pura + `curl` no endpoint + visual no dev.

**Spec base:** `docs/superpowers/specs/2026-06-02-monthly-scoreboard-design.md` (commit `bb05dba`).

---

## Decisões de implementação (divergências do spec / detalhes)

1. **`hasSharkscope` deriva de `sharkscope_username != null || sharkscope_playergroup_id != null`** — campos já existentes em `reglife_diagnostic_results`. Lidos no mesmo SELECT que traz `saved_plan` e `spots_played`.
2. **`saved_plan.volumeTargetWeekly`**: o campo vive dentro do JSON (`SavedPlan.volumeTargetWeekly?: number`). Lido depois do parse de `saved_plan`.
3. **Não deletar `/api/plan/progress` nesta entrega.** Mesmo sendo provavelmente órfão pós-deleção do EvHud, virificar isso vira spec separado. Reduz superfície deste PR.
4. **Smoke automatizado da lib via `tsx`**, igual à entrega "admin spot track". Apaga o script após validar.

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/monthlyScoreboard.ts` | **Create** | Tipos `ScoreboardData`, `MonthMeta`, `SpotProgressEntry`. Exporta `buildMonthlyScoreboard(args)` e `monthLabelPT(month)`. Reusa `mergeTrackWithTraining` da entrega anterior. Sem I/O. |
| `app/api/plan/scoreboard/[diagnosticId]/route.ts` | **Create** | GET handler. `requireDiagSession`, 3 SELECTs paralelos (diag + training + sharkscope mensal), precedência de empty states, delega à lib. Erro SharkScope não bloqueia. |
| `components/trainer/MonthlyScoreboard.tsx` | **Create** | UI client component. Fetch único, 4 estados (loading / ready / empty x3 / error), 3 cards de meta + mini-resumo dos spots com barras. |
| `components/trainer/PlanScreen.tsx` | **Modify** | Troca import + JSX: `EvHud` → `MonthlyScoreboard`. Remove `fallbackVolumeTarget` prop. |
| `components/trainer/EvHud.tsx` | **Delete** | Consumidor único era `PlanScreen.tsx` (confirmado por grep). |

## Sequência das tasks

1. **Task 1** — Lib pura. Base autocontida que Tasks 2 e 3 importam.
2. **Task 2** — Endpoint. Consome lib + valida sessão + faz I/O.
3. **Task 3** — Componente. Consome endpoint, renderiza UI.
4. **Task 4** — Wire em `PlanScreen.tsx` + delete `EvHud.tsx`.
5. **Task 5** — Sanity check final.

---

## Task 1 — Lib pura `monthlyScoreboard.ts`

**Files:**
- Create: `lib/poker/monthlyScoreboard.ts`

**Por quê:** Centraliza a derivação do shape do placar. Recebe inputs como parâmetros (sem I/O) para ficar fácil de raciocinar e testar manualmente. Reusa `mergeTrackWithTraining` — não duplica regra de gating.

- [ ] **Step 1: Criar `lib/poker/monthlyScoreboard.ts`**

```ts
/**
 * Lógica pura do placar mensal usado em /meu-plano.
 *
 * Recebe SavedPlan + linhas de spot_training_sessions + entries do mês corrente
 * no sharkscope_monthly_stats. Devolve um ScoreboardData pronto pro front.
 *
 * Reusa mergeTrackWithTraining da entrega admin spot track — gating é o mesmo.
 */

import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  mergeTrackWithTraining,
  type TrainingRow,
} from "@/lib/poker/adminSpotTrack";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface MonthMeta {
  /** Ano UTC. */
  year: number;
  /** Mês 1..12. */
  month: number;
  /** Nome em português ("junho", "julho", ...). */
  label: string;
}

export interface SpotProgressEntry {
  /** 1-based para display. */
  index: number;
  /** Null em filler slots. */
  leakId: string | null;
  /** Pretty label do leak (ex.: "Cbet do BTN em 40bb"). */
  spotLabel: string;
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  /** Sempre 50 na v1 (constante do sistema). */
  handsTarget: number;
  /** Math.min(100, round(handsPlayed/handsTarget * 100)). */
  progressPct: number;
  /** Inteiro 0-100 ou null quando handsPlayed === 0. */
  accuracyPct: number | null;
}

export interface ScoreboardData {
  month: MonthMeta;
  spots: { goal: number; completed: number };
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
  hands: { goal: number; current: number | null; pending: boolean };
  spotProgress: SpotProgressEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_LABEL_PT: Record<number, string> = {
  1: "janeiro",   2: "fevereiro", 3: "março",   4: "abril",
  5: "maio",      6: "junho",     7: "julho",   8: "agosto",
  9: "setembro", 10: "outubro",  11: "novembro", 12: "dezembro",
};

/**
 * Devolve o nome do mês em PT. Aceita 1..12; fora disso retorna string vazia.
 * Exposto para reuso eventual em outros pontos.
 */
export function monthLabelPT(month: number): string {
  return MONTH_LABEL_PT[month] ?? "";
}

const MS_PER_DAY = 86_400_000;

/** Start-of-month UTC em ISO. */
function startOfMonthUTCIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

/** Start-of-next-month UTC em ISO. */
function startOfNextMonthUTCIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString();
}

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------

/**
 * Monta o objeto que vai pro front.
 *
 * - `trainingRows`: TODAS as linhas do aluno (sem filtro de mês). A lib filtra
 *   por mês corrente UTC para calcular `spots.completed`. `mergeTrackWithTraining`
 *   continua usando o dataset completo para gating.
 * - `monthlyEntries`: passado direto, pode ser null.
 * - `volumeTargetWeekly`: do SavedPlan.volumeTargetWeekly. null ou ≤0 → goal=null.
 * - `nowIso`: opcional, determinístico para smoke tests.
 */
export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  nowIso?: string;
}): ScoreboardData {
  const { plan, trainingRows, volumeTargetWeekly, monthlyEntries, hasSharkscope } = args;
  const now = args.nowIso ? new Date(args.nowIso) : new Date();

  // ----- month --------------------------------------------------------------
  const month: MonthMeta = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    label: monthLabelPT(now.getUTCMonth() + 1),
  };

  // ----- spots.completed (filtra por mês corrente UTC) ----------------------
  const startThis = startOfMonthUTCIso(now);
  const startNext = startOfNextMonthUTCIso(now);
  const spotsCompletedThisMonth = trainingRows.filter((row) => {
    if (!row.completed_at) return false;
    return row.completed_at >= startThis && row.completed_at < startNext;
  }).length;

  // ----- volume.goal --------------------------------------------------------
  const volumeGoal =
    volumeTargetWeekly !== null && volumeTargetWeekly > 0
      ? volumeTargetWeekly * 4
      : null;

  // ----- spotProgress (reusa mergeTrackWithTraining) ------------------------
  const merged = mergeTrackWithTraining(plan, trainingRows);
  const spotProgress: SpotProgressEntry[] = merged.map((entry) => {
    const handsTarget = 50;
    const progressPct =
      handsTarget > 0
        ? Math.min(100, Math.round((entry.handsPlayed / handsTarget) * 100))
        : 0;
    return {
      index: entry.index,
      leakId: entry.leakId,
      spotLabel: entry.spotLabel,
      state: entry.state,
      handsPlayed: entry.handsPlayed,
      handsTarget,
      progressPct,
      accuracyPct: entry.accuracyPct,
    };
  });

  // ----- hands.goal (depende do tamanho da trilha) --------------------------
  const handsGoal = spotProgress.length * 50;

  return {
    month,
    spots: { goal: 3, completed: spotsCompletedThisMonth },
    volume: { goal: volumeGoal, current: monthlyEntries, hasSharkscope },
    hands: { goal: handsGoal, current: null, pending: true },
    spotProgress,
  };
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Se reclamar de `mergeTrackWithTraining` import, confirmar que `lib/poker/adminSpotTrack.ts` exporta os símbolos.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/poker/monthlyScoreboard.ts`
Expected: zero warnings/errors. Pré-existentes em outros arquivos não são desta task.

- [ ] **Step 4: Smoke manual via `tsx`**

Criar `./tmp-smoke-monthlyScoreboard.ts` na raiz do repo com:

```ts
import { buildMonthlyScoreboard, monthLabelPT } from "./lib/poker/monthlyScoreboard";

const plan: any = {
  leaks: [
    { id: "RFI-BTN-40",  label: "RFI do BTN em 40bb",   pct: 60 },
    { id: "cBet-BTN-40", label: "Cbet do BTN em 40bb",  pct: 50 },
    { id: "vsRFI-BB-40", label: "BB vs RFI em 40bb",    pct: 70 },
  ],
};

const NOW = "2026-06-15T12:00:00Z";

// [1] 3 spots, 0 treinos, sem SS, volumeTargetWeekly=100
const r1 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: 100, monthlyEntries: null,
  hasSharkscope: false, nowIso: NOW,
});
console.log("[1] month=", JSON.stringify(r1.month));
// month={"year":2026,"month":6,"label":"junho"}
console.log("[1] spots=", JSON.stringify(r1.spots));
// spots={"goal":3,"completed":0}
console.log("[1] volume=", JSON.stringify(r1.volume));
// volume={"goal":400,"current":null,"hasSharkscope":false}
console.log("[1] hands=", JSON.stringify(r1.hands));
// hands={"goal":150,"current":null,"pending":true}
console.log("[1] states=", JSON.stringify(r1.spotProgress.map(s => s.state)));
// states=["active","locked","locked"]
console.log("[1] progressPct=", JSON.stringify(r1.spotProgress.map(s => s.progressPct)));
// progressPct=[0,0,0]

// [2] 1 spot completo este mês
const r2 = buildMonthlyScoreboard({
  plan,
  trainingRows: [{
    leak_id: "RFI-BTN-40", hands_played: 52, hands_correct: 39,
    completed_at: "2026-06-10T10:00:00Z", updated_at: "2026-06-10T10:00:00Z",
  }],
  volumeTargetWeekly: 100, monthlyEntries: 87, hasSharkscope: true,
  nowIso: NOW,
});
console.log("[2] spots=", JSON.stringify(r2.spots));
// spots={"goal":3,"completed":1}
console.log("[2] volume=", JSON.stringify(r2.volume));
// volume={"goal":400,"current":87,"hasSharkscope":true}
console.log("[2] spot1=", JSON.stringify(r2.spotProgress[0]));
// state=completed, progressPct=100, accuracyPct=75

// [3] 1 spot completo no mês PASSADO (não conta no `spots.completed`)
const r3 = buildMonthlyScoreboard({
  plan,
  trainingRows: [{
    leak_id: "RFI-BTN-40", hands_played: 52, hands_correct: 39,
    completed_at: "2026-05-10T10:00:00Z", updated_at: "2026-05-10T10:00:00Z",
  }],
  volumeTargetWeekly: 100, monthlyEntries: null, hasSharkscope: false,
  nowIso: NOW,
});
console.log("[3] spots=", JSON.stringify(r3.spots));
// spots={"goal":3,"completed":0}
console.log("[3] spot1state=", r3.spotProgress[0].state);
// completed (gating não muda — só o filtro de mês)

// [4] Plano sem leaks
const r4 = buildMonthlyScoreboard({
  plan: { leaks: [] } as any, trainingRows: [],
  volumeTargetWeekly: 100, monthlyEntries: null, hasSharkscope: false,
  nowIso: NOW,
});
console.log("[4] spotProgress=", JSON.stringify(r4.spotProgress));
// []
console.log("[4] hands=", JSON.stringify(r4.hands));
// hands={"goal":0,"current":null,"pending":true}

// [5] volumeTargetWeekly null
const r5 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, nowIso: NOW,
});
console.log("[5] volume=", JSON.stringify(r5.volume));
// volume={"goal":null,"current":null,"hasSharkscope":false}

// [7] Spot ativo com 33 mãos (progressPct = 66)
const r7 = buildMonthlyScoreboard({
  plan,
  trainingRows: [{
    leak_id: "RFI-BTN-40", hands_played: 33, hands_correct: 20,
    completed_at: null, updated_at: NOW,
  }],
  volumeTargetWeekly: 100, monthlyEntries: null, hasSharkscope: false,
  nowIso: NOW,
});
console.log("[7] progressPct=", r7.spotProgress[0].progressPct);
// 66

// [9] Spot com 60 mãos (progressPct clamped a 100)
const r9 = buildMonthlyScoreboard({
  plan,
  trainingRows: [{
    leak_id: "RFI-BTN-40", hands_played: 60, hands_correct: 45,
    completed_at: "2026-06-12T10:00:00Z", updated_at: "2026-06-12T10:00:00Z",
  }],
  volumeTargetWeekly: 100, monthlyEntries: null, hasSharkscope: false,
  nowIso: NOW,
});
console.log("[9] progressPct=", r9.spotProgress[0].progressPct);
// 100

// monthLabelPT smoke
console.log("[L]", monthLabelPT(1), monthLabelPT(6), monthLabelPT(12), JSON.stringify(monthLabelPT(13)));
// janeiro junho dezembro ""
```

Run: `npx tsx ./tmp-smoke-monthlyScoreboard.ts`
Expected: 9 grupos de output batendo os comentários `// ...` exatamente.

Se o output divergir, debugar o código e repetir. Quando passar, **deletar o arquivo temporário** antes do commit:

Run: `rm tmp-smoke-monthlyScoreboard.ts` (ou `del` no PowerShell).

- [ ] **Step 5: Commit**

```bash
git add lib/poker/monthlyScoreboard.ts
git commit -m "$(cat <<'EOF'
feat(plan): pure lib buildMonthlyScoreboard

Função pura que monta o shape do placar mensal a partir do SavedPlan
+ linhas de spot_training_sessions + monthlyEntries do SharkScope.
Reusa mergeTrackWithTraining da entrega admin spot track. Sem I/O.
Filtra spots concluídos pelo mês corrente UTC; respeita
volumeTargetWeekly null e trilha vazia.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Endpoint `GET /api/plan/scoreboard/[diagnosticId]`

**Files:**
- Create: `app/api/plan/scoreboard/[diagnosticId]/route.ts`

**Por quê:** Camada de I/O fina. Faz auth de aluno (`requireDiagSession`), 3 SELECTs em paralelo, decide empty states com precedência, delega merge à lib pura.

- [ ] **Step 1: Criar pasta + arquivo**

Criar `app/api/plan/scoreboard/[diagnosticId]/route.ts`:

```ts
/**
 * GET /api/plan/scoreboard/[diagnosticId]
 *
 * Devolve o placar mensal do aluno em /meu-plano, montado pela lib pura
 * buildMonthlyScoreboard.
 *
 * Auth: requireDiagSession — mesmo padrão de /api/spot-training e
 * /api/health/me. IDOR-protected (cookie HttpOnly bate com diagnosticId).
 *
 * Empty state com precedência:
 *   - abandoned       : spots_played === 0
 *   - no_saved_plan   : spots_played > 0 mas saved_plan IS NULL
 *   - elite_no_track  : saved_plan existe mas buildSpotTrack retorna []
 *
 * Erro do SharkScope mensal NÃO bloqueia — vira monthlyEntries=null e o
 * UI mostra "Conecte SharkScope" / "sem dados do mês" conforme hasSharkscope.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDiagSession } from "@/lib/session";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { type TrainingRow } from "@/lib/poker/adminSpotTrack";
import { buildMonthlyScoreboard } from "@/lib/poker/monthlyScoreboard";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> },
) {
  const { diagnosticId } = await ctx.params;

  // Auth: helper devolve 400/401/403 prontos quando aplicável.
  const auth = await requireDiagSession(diagnosticId);
  if (!auth.ok) return auth.response;
  const diagId = auth.diagId;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Mês corrente UTC para filtrar sharkscope_monthly_stats.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1..12

  let diagRes, trainingRes, sharkRes;
  try {
    [diagRes, trainingRes, sharkRes] = await Promise.all([
      supabase
        .from("reglife_diagnostic_results")
        .select(
          "saved_plan, spots_played, sharkscope_username, sharkscope_playergroup_id",
        )
        .eq("id", diagId)
        .maybeSingle(),
      supabase
        .from("spot_training_sessions")
        .select("leak_id, hands_played, hands_correct, completed_at, updated_at")
        .eq("diagnostic_id", diagId),
      supabase
        .from("sharkscope_monthly_stats")
        .select("entries")
        .eq("diagnostic_id", diagId)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle(),
    ]);
  } catch (err) {
    console.warn("[plan/scoreboard] fetch threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (diagRes.error) {
    console.warn("[plan/scoreboard] diag select", diagRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  if (!diagRes.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // SharkScope mensal: erro NÃO bloqueia — apenas loga e segue com null.
  if (sharkRes.error) {
    console.warn("[plan/scoreboard] sharkscope monthly", sharkRes.error.message);
  }

  const {
    saved_plan: savedPlan,
    spots_played: spotsPlayed,
    sharkscope_username: ssUsername,
    sharkscope_playergroup_id: ssGroupId,
  } = diagRes.data as {
    saved_plan: SavedPlan | null;
    spots_played: number | null;
    sharkscope_username: string | null;
    sharkscope_playergroup_id: string | null;
  };

  const hasSharkscope = ssUsername !== null || ssGroupId !== null;

  // Empty-state precedence.
  if ((spotsPlayed ?? 0) === 0) {
    return NextResponse.json({ hasScoreboard: false, reason: "abandoned" });
  }
  if (!savedPlan) {
    return NextResponse.json({ hasScoreboard: false, reason: "no_saved_plan" });
  }

  // A partir daqui o merge depende de training rows — erro ali é 500.
  if (trainingRes.error) {
    console.warn("[plan/scoreboard] training select", trainingRes.error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const monthlyEntries =
    sharkRes.error || !sharkRes.data ? null : (sharkRes.data.entries ?? null);

  const volumeTargetWeekly =
    typeof savedPlan.volumeTargetWeekly === "number"
      ? savedPlan.volumeTargetWeekly
      : null;

  // Guard defensivo: saved_plan jsonb pode vir malformado.
  let data;
  try {
    data = buildMonthlyScoreboard({
      plan: savedPlan,
      trainingRows: rows,
      volumeTargetWeekly,
      monthlyEntries,
      hasSharkscope,
    });
  } catch (err) {
    console.warn("[plan/scoreboard] build threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (data.spotProgress.length === 0) {
    return NextResponse.json({ hasScoreboard: false, reason: "elite_no_track" });
  }

  return NextResponse.json({ hasScoreboard: true, ...data });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint app/api/plan/scoreboard/[diagnosticId]/route.ts`
Expected: zero warnings/errors.

- [ ] **Step 4: Smoke via curl (opcional — pode pular pra Task 5)**

Subir `npm run dev` em outro terminal.

Como o endpoint exige cookie de sessão, o `curl` simples sem cookie deve retornar 401. Validar isso:

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/plan/scoreboard/00000000-0000-0000-0000-000000000000 | tail -3
```
Expected: corpo com `{"error":"Sessão inválida ou expirada"}` e `HTTP 401`.

Validação completa (com cookie real) fica no smoke final da Task 5.

- [ ] **Step 5: Commit**

```bash
git add app/api/plan/scoreboard/[diagnosticId]/route.ts
git commit -m "$(cat <<'EOF'
feat(plan): endpoint GET /api/plan/scoreboard/[diagnosticId]

Devolve o placar mensal pro /meu-plano. 3 SELECTs paralelos
(saved_plan + spot_training_sessions + sharkscope_monthly_stats do mês
corrente UTC). Auth por requireDiagSession. Precedência de empty states
abandoned > no_saved_plan > elite_no_track. Erro SharkScope mensal não
bloqueia — vira monthlyEntries=null. Guard defensivo em torno de
buildMonthlyScoreboard.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Componente `MonthlyScoreboard`

**Files:**
- Create: `components/trainer/MonthlyScoreboard.tsx`

**Por quê:** UI cliente, 1 fetch, 4 estados. Mesmo padrão `reloadTick` da entrega "admin spot track" para evitar o lint rule `react-hooks/set-state-in-effect`.

- [ ] **Step 1: Criar componente**

Criar `components/trainer/MonthlyScoreboard.tsx`:

```tsx
"use client";

/**
 * MonthlyScoreboard — placar mensal em /meu-plano (substitui EvHud).
 *
 * Fetch único em GET /api/plan/scoreboard/[diagnosticId]. Renderiza:
 *   - 3 cards de meta (spots / volume / mãos) com cores por progresso
 *   - mini-resumo dos spots com mini-barra de progresso por linha
 *   - 3 empty states + loading + error com retry
 */

import { useEffect, useState } from "react";
import type {
  ScoreboardData,
  SpotProgressEntry,
} from "@/lib/poker/monthlyScoreboard";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

type Response =
  | ({ hasScoreboard: true } & ScoreboardData)
  | { hasScoreboard: false; reason: EmptyReason };

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: ScoreboardData }
  | { kind: "empty"; reason: EmptyReason }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
}

const EMPTY_MESSAGE: Record<EmptyReason, string> = {
  abandoned:      "Você ainda não jogou nenhum spot.",
  no_saved_plan:  "Plano ainda não gerado.",
  elite_no_track: "Sem trilha esse ciclo — fala com seu EV.",
};

const STATE_LABEL: Record<SpotProgressEntry["state"], string> = {
  completed: "Concl.",
  active:    "Ativo",
  locked:    "Bloq.",
};

const STATE_DOT: Record<SpotProgressEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-yellow-400",
  locked:    "bg-neutral-600",
};

const STATE_BAR: Record<SpotProgressEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-amber-400",
  locked:    "bg-neutral-700",
};

export function MonthlyScoreboard({ diagnosticId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan/scoreboard/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasScoreboard) {
          setState({
            kind: "ready",
            data: {
              month: data.month,
              spots: data.spots,
              volume: data.volume,
              hands: data.hands,
              spotProgress: data.spotProgress,
            },
          });
        } else {
          setState({ kind: "empty", reason: data.reason });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[MonthlyScoreboard] fetch", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, reloadTick]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:p-4 print:hidden">
      {state.kind === "loading" && (
        <p className="text-sm text-neutral-500">Carregando seu placar…</p>
      )}

      {state.kind === "empty" && (
        <>
          <p className="text-[11px] uppercase tracking-widest text-neutral-500">
            Placar mensal
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {EMPTY_MESSAGE[state.reason]}
          </p>
        </>
      )}

      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-400">
            Não foi possível carregar o placar.
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

      {state.kind === "ready" && <ReadyView data={state.data} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes do estado ready
// ---------------------------------------------------------------------------

function ReadyView({ data }: { data: ScoreboardData }) {
  const monthLabel = data.month.label.toUpperCase();
  return (
    <>
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Metas do mês · {monthLabel}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GoalCard
          icon="🎯"
          label="Spots"
          value={`${data.spots.completed} / ${data.spots.goal}`}
          sub={`${Math.min(100, Math.round((data.spots.completed / data.spots.goal) * 100))}%`}
          accent={
            data.spots.completed >= data.spots.goal
              ? "emerald"
              : data.spots.completed > 0
                ? "amber"
                : "neutral"
          }
        />
        <VolumeCard volume={data.volume} />
        <GoalCard
          icon="🃏"
          label="Mãos"
          value={`— / ${data.hands.goal}`}
          sub="em breve"
          accent="neutral"
        />
      </div>

      <div className="mt-3 border-t border-neutral-800/60 pt-3">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Evolução por spot
        </p>
        <ul className="mt-2 space-y-3">
          {data.spotProgress.map((s) => (
            <SpotRow key={`${s.index}-${s.leakId ?? "empty"}`} s={s} />
          ))}
        </ul>
      </div>
    </>
  );
}

function GoalCard({
  icon, label, value, sub, accent,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  accent: "emerald" | "amber" | "neutral";
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
        ? "text-amber-300"
        : "text-neutral-200";
  return (
    <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      <div className="text-[11px] text-neutral-500 truncate" title={sub}>
        {sub}
      </div>
    </div>
  );
}

function VolumeCard({
  volume,
}: {
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
}) {
  // 3 estados especiais antes de cair no card padrão.
  if (volume.goal === null) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value="— / —"
        sub="sem meta"
        accent="neutral"
      />
    );
  }
  if (volume.current === null && !volume.hasSharkscope) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value={`— / ${volume.goal}`}
        sub="Conecte SharkScope"
        accent="neutral"
      />
    );
  }
  if (volume.current === null) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value={`0 / ${volume.goal}`}
        sub="sem dados do mês"
        accent="neutral"
      />
    );
  }
  const pct = Math.min(100, Math.round((volume.current / volume.goal) * 100));
  const accent: "emerald" | "amber" | "neutral" =
    volume.current >= volume.goal
      ? "emerald"
      : volume.current > 0
        ? "amber"
        : "neutral";
  return (
    <GoalCard
      icon="⚡"
      label="Volume"
      value={`${volume.current} / ${volume.goal}`}
      sub={`${pct}%`}
      accent={accent}
    />
  );
}

function SpotRow({ s }: { s: SpotProgressEntry }) {
  const accuracyColor =
    s.accuracyPct === null
      ? "text-neutral-600"
      : s.accuracyPct >= 70
        ? "text-emerald-400"
        : "text-amber-400";
  const accuracyText =
    s.accuracyPct === null ? "—" : `${s.accuracyPct}%`;
  return (
    <li>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-600 tabular-nums w-5">{s.index}.</span>
        <span className="flex-1 truncate text-neutral-200">{s.spotLabel}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[s.state]}`} />
          {STATE_LABEL[s.state]}
        </span>
        <span className="text-neutral-400 tabular-nums text-xs">
          {s.handsPlayed}/{s.handsTarget}
        </span>
        <span className={`tabular-nums text-xs ${accuracyColor}`}>
          · {accuracyText}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${STATE_BAR[s.state]}`}
          style={{ width: `${s.progressPct}%` }}
        />
      </div>
    </li>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint components/trainer/MonthlyScoreboard.tsx`
Expected: zero warnings/errors.

- [ ] **Step 4: Commit (sem wire ainda)**

```bash
git add components/trainer/MonthlyScoreboard.tsx
git commit -m "$(cat <<'EOF'
feat(plan): MonthlyScoreboard component

Cliente isolado: fetch único de /api/plan/scoreboard, 4 estados
(loading / ready / empty x3 / error com retry). 3 cards de meta
(spots/volume/mãos) com cores por progresso. Volume tem 3 sub-states
(sem meta / Conecte SharkScope / sem dados do mês) antes do padrão.
Mini-resumo dos spots com mini-barra por linha. Não wireado ainda.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Wire em `PlanScreen.tsx` + delete `EvHud.tsx`

**Files:**
- Modify: `components/trainer/PlanScreen.tsx` (linhas 12 do import e 177-185 do JSX)
- Delete: `components/trainer/EvHud.tsx`

**Por quê:** Última peça de UI. Substituir `<EvHud …>` por `<MonthlyScoreboard …>` e remover o arquivo agora órfão.

- [ ] **Step 1: Trocar o import**

Editar `components/trainer/PlanScreen.tsx` linha 12. Trocar:

```ts
import { EvHud } from "./EvHud";
```

por:

```ts
import { MonthlyScoreboard } from "./MonthlyScoreboard";
```

- [ ] **Step 2: Trocar o JSX do bloco**

Editar `components/trainer/PlanScreen.tsx` linhas 177-185 (bloco atual):

```tsx
{/* EvHud — Streak / XP / Volume / Quest */}
{plan.diagnosticId && (
  <div style={{ marginBottom: 24 }}>
    <EvHud
      diagnosticId={plan.diagnosticId}
      fallbackVolumeTarget={plan.volumeTargetWeekly ?? null}
    />
  </div>
)}
```

Substituir por:

```tsx
{/* Placar Mensal — metas do mês + mini-resumo da trilha */}
{plan.diagnosticId && (
  <div style={{ marginBottom: 24 }}>
    <MonthlyScoreboard diagnosticId={plan.diagnosticId} />
  </div>
)}
```

- [ ] **Step 3: Deletar `EvHud.tsx`**

Run: `git rm components/trainer/EvHud.tsx`

Expected: arquivo some do filesystem e fica staged como deletion.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Se reclamar de algum import resolvendo pro EvHud, sinal de que outro consumidor existe — recuperar via `git restore`, investigar e ajustar antes de seguir.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: zero novos erros. Pré-existentes em outros arquivos seguem.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build completa. Confirma que `MonthlyScoreboard` está acessível e que nada quebrou.

- [ ] **Step 7: Commit**

```bash
git add components/trainer/PlanScreen.tsx components/trainer/EvHud.tsx
git commit -m "$(cat <<'EOF'
feat(plan): substitui EvHud por MonthlyScoreboard em /meu-plano

Troca o placar semanal (streak/XP/volume/quest/HS) pelo placar mensal
(metas do mês + mini-resumo da trilha). EvHud.tsx removido — único
consumidor era PlanScreen.tsx. /api/plan/progress segue vivo nessa
entrega; eventual deleção vira spec separado.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Sanity check final

**Files:** nenhum.

**Por quê:** Cobrir os critérios de aceite com a feature inteira no ar.

- [ ] **Step 1: Subir dev**

Run: `npm run dev`
Esperado: dev server rodando em http://localhost:3000.

- [ ] **Step 2: Caso "happy path" — aluno com trilha e algum treino**

Abrir `/meu-plano` autenticado como aluno que tem `saved_plan` e alguma linha em `spot_training_sessions`. Conferir:

- [ ] Bloco "METAS DO MÊS · {MES}" aparece no slot antes ocupado pelo EvHud.
- [ ] 3 cards lado a lado (em desktop). SPOTS, VOLUME, MÃOS.
- [ ] Card SPOTS mostra `{completed}/3` com cor coerente (amber se 0<x<3, emerald se ≥3, neutro se 0).
- [ ] Card MÃOS mostra `— / {goal}` e sub `em breve`.
- [ ] Card VOLUME mostra valor conforme cenário (ver Step 3/4).
- [ ] Bloco "EVOLUÇÃO POR SPOT" abaixo, com 3 linhas, cada uma com bolinha + estado + `X/50` + accuracy + mini-barra.

- [ ] **Step 3: Caso "sem SharkScope"**

Abrir `/meu-plano` de aluno sem `sharkscope_username` nem `sharkscope_playergroup_id`. Conferir:

- [ ] Card VOLUME mostra `— / {goal}` com sub `Conecte SharkScope`.

- [ ] **Step 4: Caso "com SharkScope mas sem dados do mês"**

Abrir aluno com SharkScope conectado mas SEM linha em `sharkscope_monthly_stats` pro mês corrente. Conferir:

- [ ] Card VOLUME mostra `0 / {goal}` com sub `sem dados do mês`.

- [ ] **Step 5: Caso "abandonou"**

Abrir aluno com `spots_played = 0`. Conferir:

- [ ] Bloco mostra "Placar mensal" + texto "Você ainda não jogou nenhum spot." Sem cards de meta.

- [ ] **Step 6: Caso "Elite"** (passou em todos os spots — saved_plan existe mas trilha vazia)

Conferir:

- [ ] Bloco mostra "Placar mensal" + texto "Sem trilha esse ciclo — fala com seu EV."

- [ ] **Step 7: Caso erro de rede**

No DevTools → Network → Offline. Recarregar `/meu-plano`. Conferir:

- [ ] Bloco mostra "Não foi possível carregar o placar." + botão "Tentar de novo".
- [ ] Clicar em "Tentar de novo" com network restaurado recarrega corretamente.

- [ ] **Step 8: Checar critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-monthly-scoreboard-design.md` seção "Critérios de aceite". Marcar mentalmente:

- [ ] `hasScoreboard: true` + 4 blocos no happy path.
- [ ] Empty states com precedência.
- [ ] 401 quando cookie não bate (sem cookie → cai antes de chegar nos handlers).
- [ ] 404 quando diagnóstico não existe.
- [ ] `volume.goal = volumeTargetWeekly * 4` quando o campo existe.
- [ ] `spots.completed` conta só rows com `completed_at` no mês corrente UTC.
- [ ] `volume.hasSharkscope` reflete `sharkscope_username OR sharkscope_playergroup_id`.
- [ ] Erro SharkScope mensal não bloqueia.
- [ ] `hands.current = null` e `hands.pending = true`.
- [ ] EvHud sumiu (`git status` mostra deletion no commit).
- [ ] 4 estados renderizados.
- [ ] Mini-barra de progresso por spot com cor por estado.
- [ ] `print:hidden` no container do placar.

- [ ] **Step 9: Reportar pronto**

Sem ação de código. Reportar: feature completa, 4 commits no branch `onboarding-ev`, smoke ok, pronto pra finalização (`finishing-a-development-branch`).

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:**

- "200 + hasScoreboard:true + 4 blocos" → Task 2 Step 1 (handler) + Task 1 (lib).
- "abandoned > no_saved_plan > elite_no_track" → Task 2 Step 1, ordem das checagens.
- "401 sem cookie" → Task 2 Step 1, `requireDiagSession`.
- "404 não existe" → Task 2 Step 1, `if (!diagRes.data)`.
- "volume.goal = volumeTargetWeekly * 4" → Task 1 Step 1, lib pura.
- "spots.completed filtrado por mês UTC" → Task 1 Step 1, `spotsCompletedThisMonth`.
- "hasSharkscope reflete username || playergroup" → Task 2 Step 1, dentro do handler.
- "Erro SharkScope não bloqueia" → Task 2 Step 1, log mas segue.
- "hands.current = null e pending = true" → Task 1 Step 1, hardcoded.
- "EvHud sumiu" → Task 4 Step 3.
- "4 estados componente" → Task 3 Step 1.
- "Mini-barra por spot" → Task 3 Step 1, `SpotRow`.
- "print:hidden" → Task 3 Step 1, container.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código têm o código completo.

**3. Type consistency:** `ScoreboardData`, `SpotProgressEntry`, `MonthMeta` definidos na Task 1, importados na Task 2 (`TrainingRow`) e Task 3 (`ScoreboardData`, `SpotProgressEntry`). `EmptyReason` aparece em Task 2 (resposta) e Task 3 (component) com os mesmos 3 strings. Endpoint usa `hasScoreboard` (não `hasTrack` — esse foi da entrega "admin spot track").

**4. Endpoint shape com `...data`:** o handler responde `{ hasScoreboard: true, ...data }` onde `data` é o output da lib. Isso espalha `month`, `spots`, `volume`, `hands`, `spotProgress` no top-level — o componente espera essa forma e Type `Response` na Task 3 reflete `{ hasScoreboard: true } & ScoreboardData`.
