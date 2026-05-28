# `/meu-plano` v2 — Trilha de 3 Spots + Migração do Health Score — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformular `/meu-plano` em torno de uma trilha sequencial de 3 spots com gating automático pelo trainer (70% em 50 mãos), e mover o Health Score do aluno pro admin (bloco detalhado em `/admin/resultado/[id]`; a aba "Saúde da turma" em `/admin` já existe).

**Architecture:** A camada de dados ganha uma tabela `spot_training_sessions` para rastrear progresso por (diagnostic_id, leak_id). Uma API REST nova (`/api/spot-training`) recebe POSTs do trainer single-spot e devolve progresso + flag `unlockNext`. A página `/meu-plano` substitui a lista atual por `<SpotTrack>` (orquestrador) que renderiza 3 `<SpotCard>` em estados active/locked/completed. O TrainerScreen ganha um modo "single-spot" via prop. O `HealthScoreBlock` ganha prop `mode: "self" | "admin"`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand (já em uso), Supabase (PostgreSQL + `supabaseAdmin` server-side), motion/react para animações.

**⚠️ Branch:** TODO O TRABALHO deve ser feito no branch `onboarding-ev`. Confirme com `git branch --show-current` antes da primeira modificação.

**⚠️ Next.js peculiar:** Este projeto usa Next.js 16 com convenções que podem divergir do que você conhece. Antes de tocar qualquer route handler ou page, leia `node_modules/next/dist/docs/` para a área relevante (route handlers, dynamic routes, etc.). O arquivo `AGENTS.md` na raiz reforça isso.

**🧪 Estratégia de teste:** O projeto não tem framework de testes instalado. Para minimizar escopo, este plano usa três níveis de verificação:
1. **Libs puras (`lib/poker/*`)** → scripts de verificação em `scripts/check-*.ts` rodando com `tsx`. Assertion-style direto, sem framework.
2. **APIs** → smoke test via `curl` localmente após `pnpm dev` (ou `npm run dev`).
3. **UI** → verificação manual no dev server + `next build` deve passar (compilação + types).

---

## File Structure

### Arquivos NOVOS

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<timestamp>_spot_training_sessions.sql` | Migration da nova tabela |
| `lib/poker/spotTraining.ts` | Tipos + helpers puros (cálculo de % e gating) |
| `lib/poker/spotTrack.ts` | `buildSpotTrack(plan)` e `buildResources(plan)` — refator de `challenge30d.ts` |
| `app/api/spot-training/route.ts` | POST registra mão; GET lê progresso |
| `app/api/admin/health/[diagnosticId]/route.ts` | GET snapshot atual + histórico 7 dias |
| `app/trainer/spot/[leakId]/page.tsx` | Server component que monta `<TrainerScreen mode="single">` |
| `components/trainer/SpotCard.tsx` | Card individual (3 estados) |
| `components/trainer/SpotTrack.tsx` | Orquestrador da trilha — lê progresso e renderiza 3 cards |
| `components/trainer/ResourcesBlock.tsx` | Bloco "Recursos pra sua jornada" |
| `components/admin/HealthScoreDetail.tsx` | Bloco detalhado com sparkline pro admin |
| `scripts/check-spotTraining.ts` | Verificação das funções puras |
| `scripts/check-spotTrack.ts` | Verificação de `buildSpotTrack` / `buildResources` |

### Arquivos MODIFICADOS

| Arquivo | Mudança |
|---|---|
| `lib/poker/spotLinks.ts` | Adicionar `hasInternalTrainer(leakId): boolean` + helper `slugForLeak(leakId)` |
| `lib/poker/challenge30d.ts` | **Não modificar** — manter intacto. PDF e qualquer consumidor antigo continuam funcionando. Novo código importa de `lib/poker/spotTrack.ts`. |
| `lib/poker/types.ts` | Adicionar interface `SpotTrainingProgress` se necessário |
| `components/trainer/TrainerScreen.tsx` | Aceitar prop `singleSpotContext?: { diagnosticId, leakId }` e reportar mãos pro endpoint |
| `lib/poker/store.ts` | Adicionar callback opcional `onHandPlayed` em `loadConfig` (ou via novo método) — para reportar cada mão sem acoplar store ao HTTP |
| `components/trainer/PlanScreen.tsx` | Remover `HealthScoreBlock`; substituir lista atual por `<SpotTrack>` + `<ResourcesBlock>` |
| `components/trainer/HealthScoreBlock.tsx` | Adicionar prop `mode?: "self" \| "admin"` (default: `"self"`); modo admin chama nova rota e mostra sparkline |
| `app/admin/resultado/[id]/page.tsx` | Adicionar `<HealthScoreDetail diagnosticId={id} />` no topo |

### NÃO mudar (escopo fora)

- `app/admin/page.tsx` + `components/admin/HealthTable.tsx` — aba "Saúde da turma" já existe e funciona
- `lib/pdf/generatePlanPdf.tsx` — PDF continua usando estrutura antiga (challenge30d) por ora
- `lib/health/*` — infra de cálculo intacta
- Fluxo de diagnóstico (`/diagnostico`), leadScoring, EvHud, PulseCard

---

## Tasks

### Task 1: Confirmar branch e snapshot inicial

**Files:**
- Read-only

- [ ] **Step 1: Confirmar branch e working tree limpo**

Run: `git branch --show-current`
Expected: `onboarding-ev`

Run: `git status --short`
Expected: empty (sem mudanças não-commitadas exceto o plano em `docs/superpowers/plans/`)

- [ ] **Step 2: Tag de partida pra rollback fácil**

Run:
```bash
git tag pre-trilha-3-spots
```
Expected: tag criada localmente. Não precisa push.

- [ ] **Step 3: Confirmar que `next build` está verde antes de começar**

Run: `npm run build`
Expected: exit 0. Se falhar, parar e reportar — o problema não é do plano.

---

### Task 2: Migration `spot_training_sessions`

**Files:**
- Create: `supabase/migrations/20260528120000_spot_training_sessions.sql`

- [ ] **Step 1: Verificar formato dos migrations existentes**

Run: `ls supabase/migrations/ 2>/dev/null || ls migrations/ 2>/dev/null || echo "no migrations dir"`
Expected: lista de arquivos `.sql` com timestamp prefixado, OU "no migrations dir" (criamos do zero).

Se "no migrations dir": criar diretório `supabase/migrations/`. Se já existir um padrão diferente, **siga o padrão existente** (mesmo nome de pasta, mesmo formato de timestamp).

- [ ] **Step 2: Escrever o SQL da migration**

Create `supabase/migrations/20260528120000_spot_training_sessions.sql`:

```sql
-- Spot Training Sessions
-- Rastreia progresso acumulado por (diagnostic_id, leak_id) no trainer
-- single-spot, usado pelo gating da trilha de 3 spots em /meu-plano.

create table if not exists public.spot_training_sessions (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id text not null references public.diagnostics(id) on delete cascade,
  leak_id text not null,
  hands_played int not null default 0,
  hands_correct int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnostic_id, leak_id)
);

create index if not exists idx_spot_training_sessions_diagnostic
  on public.spot_training_sessions(diagnostic_id);

-- Trigger pra manter updated_at automático
create or replace function public.touch_spot_training_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_spot_training_touch on public.spot_training_sessions;
create trigger trg_spot_training_touch
  before update on public.spot_training_sessions
  for each row execute function public.touch_spot_training_updated_at();
```

- [ ] **Step 3: Aplicar migration**

Se o projeto usa Supabase CLI: `supabase db push` ou equivalente. Se aplica manualmente: copie o SQL e rode no dashboard do Supabase.

**Verificação:** rode no SQL editor do Supabase:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'spot_training_sessions';
```
Expected: 8 colunas (`id`, `diagnostic_id`, `leak_id`, `hands_played`, `hands_correct`, `completed_at`, `created_at`, `updated_at`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260528120000_spot_training_sessions.sql
git commit -m "feat(db): add spot_training_sessions table for spot-track gating"
```

---

### Task 3: Helper `hasInternalTrainer` em `spotLinks.ts`

**Files:**
- Modify: `lib/poker/spotLinks.ts`
- Create: `scripts/check-spotLinks.ts`

- [ ] **Step 1: Listar os spots internos disponíveis**

Run: `ls public/spots/*.json | sed 's|.*/||' | sed 's|\.json||'`
Expected: lista de slugs. Anote os prefixos por action (ex.: `reglife-rfi-...`, `reglife-cbet-...`).

- [ ] **Step 2: Escrever script de verificação ANTES da implementação**

Create `scripts/check-spotLinks.ts`:

```ts
// Verificação pura — roda com: npx tsx scripts/check-spotLinks.ts
import { hasInternalTrainer, slugForLeak } from "../lib/poker/spotLinks";

const cases: Array<{ leakId: string; hasTrainer: boolean; slugPrefix?: string }> = [
  { leakId: "RFI-BTN-15",       hasTrainer: true,  slugPrefix: "reglife-rfi" },
  { leakId: "cBet-BTN-40",      hasTrainer: true,  slugPrefix: "reglife-cbet" },
  { leakId: "vsOpen-BB-25",     hasTrainer: true },
  { leakId: "squeeze-CO-30",    hasTrainer: false }, // Tier 3 sem spot interno
  { leakId: "probeTurn-BB-20",  hasTrainer: false },
  { leakId: "delayCbet-BTN-25", hasTrainer: false },
];

let failed = 0;
for (const c of cases) {
  const got = hasInternalTrainer(c.leakId);
  if (got !== c.hasTrainer) {
    console.error(`FAIL: hasInternalTrainer(${c.leakId}) → ${got}, expected ${c.hasTrainer}`);
    failed++;
  }
}

// slugForLeak: deve devolver string não-vazia pra leaks com trainer; null caso contrário
for (const c of cases) {
  const slug = slugForLeak(c.leakId);
  if (c.hasTrainer && !slug) {
    console.error(`FAIL: slugForLeak(${c.leakId}) → null, expected non-null`);
    failed++;
  }
  if (!c.hasTrainer && slug) {
    console.error(`FAIL: slugForLeak(${c.leakId}) → ${slug}, expected null`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
} else {
  console.log("All spotLinks checks passed");
}
```

- [ ] **Step 3: Rodar o script — deve falhar**

Run: `npx tsx scripts/check-spotLinks.ts`
Expected: FAIL com "hasInternalTrainer is not a function" ou similar.

- [ ] **Step 4: Adicionar `hasInternalTrainer` e `slugForLeak` em `lib/poker/spotLinks.ts`**

Append ao final do arquivo `lib/poker/spotLinks.ts`:

```ts
/**
 * Mapa de leak action → slug do spot interno em /public/spots/.
 * Quando uma action não tem spot interno (ex.: Tier 3 — squeeze, probeTurn),
 * retorna null. Nesses casos a UI cai num fallback manual.
 *
 * Os slugs aqui são DEFAULTS por action. Se uma combinação específica precisa
 * cair em outro spot, adicione em LEAK_TO_SLUG_OVERRIDES.
 */
const ACTION_TO_SLUG: Partial<Record<string, string>> = {
  RFI:        "reglife-rfi",
  vsOpen:     "reglife-vs-rfi",
  vsBBISO:    "reglife-blind-war",
  blindWar:   "reglife-blind-war",
  cBet:       "reglife-cbet-flop-vs-bb",
  cbetTurn:   "reglife-cbet-turn",
  cbetRiver:  "reglife-cbet-river",
  vsCbet:     "reglife-vs-cbet",
  multiway:   "reglife-bb-multiway",
  vs3Bet:     "reglife-vs-3bet",
  // Tier 3 sem spots internos (intencionalmente ausentes):
  // squeeze, probeTurn, probeRiver, vsCheckRaise, delayCbet, pot3bet, cbetVsSb
};

const LEAK_TO_SLUG_OVERRIDES: Record<string, string> = {
  // Cbet do BTN em 40bb = Bet vs Missed
  "cBet-BTN-40": "reglife-cbet-flop-btn-missed",
};

/**
 * Retorna o slug do spot interno pra esse leak, ou null se não houver.
 * O slug aqui é o nome do arquivo em /public/spots/<slug>.json (sem extensão).
 *
 * IMPORTANTE: antes de retornar um slug, verifique se o arquivo existe
 * usando `loadSpotConfig`. Esta função é puramente um lookup — não toca disco.
 */
export function slugForLeak(leakId: string): string | null {
  if (LEAK_TO_SLUG_OVERRIDES[leakId]) return LEAK_TO_SLUG_OVERRIDES[leakId];
  const action = leakId.split("-")[0];
  return ACTION_TO_SLUG[action] ?? null;
}

/**
 * Quick check — esse leak tem um trainer interno jogável?
 * Pra Tier 3 (squeeze, probeTurn, etc.), false → UI mostra fallback manual.
 */
export function hasInternalTrainer(leakId: string): boolean {
  return slugForLeak(leakId) !== null;
}
```

- [ ] **Step 5: Rodar o script — deve passar**

Run: `npx tsx scripts/check-spotLinks.ts`
Expected: `All spotLinks checks passed`

- [ ] **Step 6: Confirmar slugs reais em `/public/spots/`**

Run: `ls public/spots/ | grep -E "(rfi|cbet-flop-vs-bb|vs-rfi|blind-war|vs-cbet|bb-multiway|vs-3bet|cbet-turn|cbet-river)"`

Expected: cada slug usado em `ACTION_TO_SLUG` aparece como `<slug>.json`. Se algum não existir, **ajuste o slug no mapa pra o arquivo real**. Re-rode o script.

- [ ] **Step 7: Commit**

```bash
git add lib/poker/spotLinks.ts scripts/check-spotLinks.ts
git commit -m "feat(poker): add hasInternalTrainer/slugForLeak to route leaks to internal trainer spots"
```

---

### Task 4: Lib pura `spotTraining.ts` — gating

**Files:**
- Create: `lib/poker/spotTraining.ts`
- Create: `scripts/check-spotTraining.ts`

- [ ] **Step 1: Escrever script de verificação**

Create `scripts/check-spotTraining.ts`:

```ts
import {
  computeProgress,
  isSpotComplete,
  THRESHOLD_PCT,
  THRESHOLD_HANDS,
  type SpotTrainingRow,
} from "../lib/poker/spotTraining";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// Threshold values
check("THRESHOLD_PCT", THRESHOLD_PCT, 0.70);
check("THRESHOLD_HANDS", THRESHOLD_HANDS, 50);

// Empty / null state
check("computeProgress(null)", computeProgress(null), {
  handsPlayed: 0,
  handsCorrect: 0,
  pct: 0,
  completed: false,
});

// Below threshold (in hands)
const row1: SpotTrainingRow = {
  hands_played: 30, hands_correct: 21, completed_at: null,
};
check("computeProgress(30/21)", computeProgress(row1), {
  handsPlayed: 30, handsCorrect: 21, pct: 0.70, completed: false,
});
check("isSpotComplete(30/21)", isSpotComplete(row1), false);

// At threshold (50 hands, 70%)
const row2: SpotTrainingRow = {
  hands_played: 50, hands_correct: 35, completed_at: null,
};
check("isSpotComplete(50/35)", isSpotComplete(row2), true);

// At hands but below %
const row3: SpotTrainingRow = {
  hands_played: 60, hands_correct: 35, completed_at: null,
};
check("isSpotComplete(60/35 = 58%)", isSpotComplete(row3), false);

// Already completed (persisted)
const row4: SpotTrainingRow = {
  hands_played: 50, hands_correct: 35, completed_at: "2026-05-28T10:00:00Z",
};
check("completed=true when completed_at set", computeProgress(row4).completed, true);

if (failed > 0) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("All spotTraining checks passed");
```

- [ ] **Step 2: Rodar — deve falhar (módulo não existe)**

Run: `npx tsx scripts/check-spotTraining.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Criar `lib/poker/spotTraining.ts`**

```ts
// Pure helpers for spot training progress and gating.
// No I/O — DB reads/writes live in the API route.

export const THRESHOLD_PCT = 0.70;
export const THRESHOLD_HANDS = 50;

/** Shape of a row in spot_training_sessions (subset we read). */
export interface SpotTrainingRow {
  hands_played: number;
  hands_correct: number;
  completed_at: string | null;
}

export interface SpotProgress {
  handsPlayed: number;
  handsCorrect: number;
  /** Accuracy 0..1; 0 when no hands played. */
  pct: number;
  /** True if persisted completed_at OR thresholds reached. */
  completed: boolean;
}

export function computeProgress(row: SpotTrainingRow | null): SpotProgress {
  if (!row) {
    return { handsPlayed: 0, handsCorrect: 0, pct: 0, completed: false };
  }
  const handsPlayed = row.hands_played ?? 0;
  const handsCorrect = row.hands_correct ?? 0;
  const pct = handsPlayed > 0 ? handsCorrect / handsPlayed : 0;
  const completed = row.completed_at !== null || isSpotComplete(row);
  return { handsPlayed, handsCorrect, pct, completed };
}

export function isSpotComplete(row: SpotTrainingRow): boolean {
  if (row.completed_at) return true;
  if (row.hands_played < THRESHOLD_HANDS) return false;
  const pct = row.hands_correct / row.hands_played;
  return pct >= THRESHOLD_PCT;
}
```

- [ ] **Step 4: Rodar o script — deve passar**

Run: `npx tsx scripts/check-spotTraining.ts`
Expected: `All spotTraining checks passed`

- [ ] **Step 5: Commit**

```bash
git add lib/poker/spotTraining.ts scripts/check-spotTraining.ts
git commit -m "feat(poker): add pure spot-training progress helpers with thresholds"
```

---

### Task 5: Refator `spotTrack.ts` — `buildSpotTrack` + `buildResources`

**Files:**
- Create: `lib/poker/spotTrack.ts`
- Create: `scripts/check-spotTrack.ts`

- [ ] **Step 1: Definir as interfaces e função em `lib/poker/spotTrack.ts`**

Create `lib/poker/spotTrack.ts`:

```ts
// Decompõe o "Desafio 30d" antigo em duas peças:
//   - buildSpotTrack: 3 spots sequenciais derivados dos top leaks
//   - buildResources: links auxiliares (carreira, grade, manager)
//
// challenge30d.ts não muda — segue usado pelo PDF antigo. Esta lib é o
// novo ponto de entrada usado por /meu-plano v2.

import type { SavedPlan } from "./planStorage";
import { topLeaks } from "@/lib/pdf/utils";
import {
  FIXED_LINKS,
  canonicalSlotForLeak,
  getGradeLink,
  getSpotLink,
  hasInternalTrainer,
  slugForLeak,
} from "./spotLinks";

export interface SpotTrackEntry {
  /** Order index 0..N — used as display number (1, 2, 3). */
  index: number;
  /** Leak id (ex.: "cBet-BTN-40"). Null only when filling an empty slot. */
  leakId: string | null;
  /** Pretty label (ex.: "Cbet do BTN em 40bb"). */
  label: string;
  /** Diagnostic % from the leak (0..100). Null when no leak (filler slot). */
  pct: number | null;
  /** Lesson URL (course content). */
  lessonUrl: string;
  /** Internal trainer slug or null when leak goes Tier-3 / external only. */
  trainerSlug: string | null;
  /** Has an internal trainer? Mirrors trainerSlug !== null. */
  hasInternalTrainer: boolean;
}

export interface ResourceEntry {
  label: string;
  sublabel?: string;
  url: string;
  /** Used by UI for icon / accent. */
  kind: "career" | "grade" | "manager";
}

/**
 * Up to 3 spots, ordered by canonical study sequence (not by error severity).
 * - Empty slots (aluno passou em quase tudo) are kept as filler entries
 *   with leakId = null so the UI can render the "trilha completa" state.
 */
export function buildSpotTrack(plan: SavedPlan): SpotTrackEntry[] {
  const leaks = [...topLeaks(plan, 3)].sort(
    (a, b) => canonicalSlotForLeak(a.id) - canonicalSlotForLeak(b.id)
  );

  return leaks.map((leak, i) => ({
    index: i,
    leakId: leak.id,
    label: leak.label,
    pct: leak.pct,
    lessonUrl: getSpotLink(leak.id),
    trainerSlug: slugForLeak(leak.id),
    hasInternalTrainer: hasInternalTrainer(leak.id),
  }));
}

/**
 * Resources card list (career lesson, tournament grade, manager chat).
 * Always 2 entries (career + grade). Manager chat is rendered separately
 * in PlanScreen because it already lives there as a distinct block.
 */
export function buildResources(plan: SavedPlan): ResourceEntry[] {
  return [
    {
      label: "Aula construção de carreira",
      sublabel: "Como o Yuri começaria hoje",
      url: FIXED_LINKS.careerLesson,
      kind: "career",
    },
    {
      label: "Grade de torneios",
      sublabel: plan.stakeGrade
        ? `Sua grade: ABI $${plan.stakeGrade}`
        : "Não precisa pensar, é só registrar",
      url: getGradeLink(plan.stakeGrade),
      kind: "grade",
    },
  ];
}
```

- [ ] **Step 2: Criar script de verificação**

Create `scripts/check-spotTrack.ts`:

```ts
import type { SavedPlan } from "../lib/poker/planStorage";
import { buildSpotTrack, buildResources } from "../lib/poker/spotTrack";

let failed = 0;
function expect(name: string, cond: boolean) {
  if (!cond) { console.error(`FAIL ${name}`); failed++; }
}

const planWith3Leaks: Partial<SavedPlan> = {
  leaks: [
    { id: "cBet-BTN-40", label: "Cbet do BTN em 40bb", pct: 35, lessons: [], severity: 10, actionLabel: "" } as any,
    { id: "RFI-BTN-15", label: "RFI do BTN 15bb", pct: 40, lessons: [], severity: 9, actionLabel: "" } as any,
    { id: "vsOpen-BB-25", label: "BB vs RFI 25bb", pct: 50, lessons: [], severity: 8, actionLabel: "" } as any,
  ],
  byTrainer: [],
  stakeGrade: 4,
};

const track = buildSpotTrack(planWith3Leaks as SavedPlan);
expect("track length 3", track.length === 3);
// Canonical order: RFI=1, cBet IP=2, vsOpen BB=5
expect("first is RFI", track[0].leakId === "RFI-BTN-15");
expect("second is cBet", track[1].leakId === "cBet-BTN-40");
expect("third is vsOpen-BB", track[2].leakId === "vsOpen-BB-25");
expect("all have internal trainer", track.every((t) => t.hasInternalTrainer === true));
expect("indexes 0..2", track[0].index === 0 && track[2].index === 2);

const planNoLeaks: Partial<SavedPlan> = { leaks: [], byTrainer: [], stakeGrade: undefined };
const emptyTrack = buildSpotTrack(planNoLeaks as SavedPlan);
expect("empty plan → empty track", emptyTrack.length === 0);

const resources = buildResources(planWith3Leaks as SavedPlan);
expect("2 resources", resources.length === 2);
expect("first is career", resources[0].kind === "career");
expect("grade sublabel has ABI", resources[1].sublabel?.includes("ABI") ?? false);

const resourcesNoStake = buildResources(planNoLeaks as SavedPlan);
expect("grade fallback when no stakeGrade",
  resourcesNoStake[1].sublabel === "Não precisa pensar, é só registrar");

if (failed > 0) { console.error(`${failed} failed`); process.exit(1); }
console.log("All spotTrack checks passed");
```

- [ ] **Step 3: Rodar — deve passar**

Run: `npx tsx scripts/check-spotTrack.ts`
Expected: `All spotTrack checks passed`

- [ ] **Step 4: Commit**

```bash
git add lib/poker/spotTrack.ts scripts/check-spotTrack.ts
git commit -m "feat(poker): add buildSpotTrack and buildResources (replaces challenge30d in v2)"
```

---

### Task 6: API `POST/GET /api/spot-training`

**Files:**
- Create: `app/api/spot-training/route.ts`

- [ ] **Step 1: Ler a doc local sobre route handlers**

Run: `ls node_modules/next/dist/docs/ 2>/dev/null | head -20`
Look for files about `route handlers`, `dynamic routes`. Read whatever is relevant before proceeding.

- [ ] **Step 2: Estudar uma rota existente similar (mesma assinatura, padrões locais)**

Run: `cat app/api/plan/progress/route.ts`
Examine: como autentica (gating), como lê body, como devolve JSON. **Imite o estilo.**

- [ ] **Step 3: Criar `app/api/spot-training/route.ts`**

```ts
/**
 * Spot training progress endpoint.
 *
 *   POST /api/spot-training
 *     body: { diagnosticId: string, leakId: string, correct: boolean }
 *     resp: { progress: SpotProgress, unlockedNow: boolean }
 *
 *   GET /api/spot-training?diagnosticId=...&leakId=...
 *     resp: { progress: SpotProgress }
 *
 * O `unlockedNow` é true APENAS na resposta da mão que cruzou o threshold
 * pela primeira vez (transição). Isso permite ao front disparar a animação
 * de "Spot N concluído" sem polling.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  computeProgress,
  isSpotComplete,
  type SpotTrainingRow,
} from "@/lib/poker/spotTraining";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { diagnosticId?: unknown; leakId?: unknown; correct?: unknown };
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }

  const diagnosticId = typeof body.diagnosticId === "string" ? body.diagnosticId : null;
  const leakId       = typeof body.leakId === "string" ? body.leakId : null;
  const correct      = typeof body.correct === "boolean" ? body.correct : null;

  if (!diagnosticId || !leakId || correct === null) {
    return bad("Missing diagnosticId, leakId or correct");
  }

  // Read current row (may be null)
  const existing = await readRow(diagnosticId, leakId);
  const wasComplete = existing ? isSpotComplete(existing) : false;

  const newHandsPlayed  = (existing?.hands_played ?? 0) + 1;
  const newHandsCorrect = (existing?.hands_correct ?? 0) + (correct ? 1 : 0);
  const newRow: SpotTrainingRow = {
    hands_played: newHandsPlayed,
    hands_correct: newHandsCorrect,
    completed_at: existing?.completed_at ?? null,
  };
  const nowComplete = isSpotComplete(newRow);
  const completedAt =
    existing?.completed_at ?? (nowComplete ? new Date().toISOString() : null);

  const { error } = await supabaseAdmin
    .from("spot_training_sessions")
    .upsert(
      {
        diagnostic_id: diagnosticId,
        leak_id: leakId,
        hands_played: newHandsPlayed,
        hands_correct: newHandsCorrect,
        completed_at: completedAt,
      },
      { onConflict: "diagnostic_id,leak_id" }
    );

  if (error) {
    console.error("[api/spot-training] upsert error:", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const progress = computeProgress({
    hands_played: newHandsPlayed,
    hands_correct: newHandsCorrect,
    completed_at: completedAt,
  });
  const unlockedNow = !wasComplete && nowComplete;

  return NextResponse.json({ progress, unlockedNow });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const diagnosticId = url.searchParams.get("diagnosticId");
  const leakId       = url.searchParams.get("leakId");
  if (!diagnosticId || !leakId) return bad("Missing diagnosticId or leakId");

  const row = await readRow(diagnosticId, leakId);
  return NextResponse.json({ progress: computeProgress(row) });
}

async function readRow(
  diagnosticId: string,
  leakId: string
): Promise<SpotTrainingRow | null> {
  const { data, error } = await supabaseAdmin
    .from("spot_training_sessions")
    .select("hands_played, hands_correct, completed_at")
    .eq("diagnostic_id", diagnosticId)
    .eq("leak_id", leakId)
    .maybeSingle<SpotTrainingRow>();
  if (error) {
    console.error("[api/spot-training] read error:", error);
    return null;
  }
  return data;
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
```

- [ ] **Step 4: Smoke test local via curl**

Run: `npm run dev` (em outro terminal — deixe rodando)

Run (PowerShell):
```powershell
$body = '{"diagnosticId":"TEST-FAKE-ID","leakId":"cBet-BTN-40","correct":true}'
curl.exe -X POST http://localhost:3000/api/spot-training -H "Content-Type: application/json" -d $body
```

Expected: 400 com `{"error":"..."}` (porque `TEST-FAKE-ID` viola foreign key) OU 500 com erro de FK.

**Importante:** este é o comportamento esperado. Estamos só validando que a rota está montada e roteando.

Agora teste com um diagnosticId real:
```powershell
# Pegue o id mais recente:
# No painel Supabase: SELECT id FROM diagnostics ORDER BY created_at DESC LIMIT 1;
# Substitua <REAL_ID> abaixo
$body = '{"diagnosticId":"<REAL_ID>","leakId":"cBet-BTN-40","correct":true}'
curl.exe -X POST http://localhost:3000/api/spot-training -H "Content-Type: application/json" -d $body
```

Expected:
```json
{ "progress": { "handsPlayed": 1, "handsCorrect": 1, "pct": 1, "completed": false }, "unlockedNow": false }
```

Run again 49 more times correct — or fake by directly seeding a row in Supabase com hands_played=49 hands_correct=34, depois 1 POST com correct=true. Expected: `unlockedNow: true`, `completed: true`.

Run o GET:
```powershell
curl.exe "http://localhost:3000/api/spot-training?diagnosticId=<REAL_ID>&leakId=cBet-BTN-40"
```
Expected: progresso atual.

- [ ] **Step 5: Limpar dados de teste**

No SQL editor do Supabase:
```sql
delete from spot_training_sessions where diagnostic_id = '<REAL_ID>';
```

- [ ] **Step 6: Commit**

```bash
git add app/api/spot-training/route.ts
git commit -m "feat(api): add POST/GET /api/spot-training with auto-gating on 70%/50 hands"
```

---

### Task 7: API `GET /api/admin/health/[diagnosticId]`

**Files:**
- Create: `app/api/admin/health/[diagnosticId]/route.ts`

- [ ] **Step 1: Estudar a rota admin existente**

Run: `cat app/admin/page.tsx | grep -i "fetch.*health" -A 2 -B 1`
Confirme que `HealthTable` chama `/api/admin/health`. Procure essa rota:

Run: `ls app/api/admin/health/`
Read: `app/api/admin/health/route.ts` se existir.

Note como ela autentica (provavelmente cookie de admin ou ausência de auth — siga o mesmo padrão na nova rota).

- [ ] **Step 2: Estudar shape de `health_snapshots`**

Run pelo Supabase SQL editor:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'health_snapshots';
```

Anote nomes exatos das colunas (`day`, `health`, `band`, `breakdown` esperados; pode haver `diagnostic_id`).

- [ ] **Step 3: Criar a rota**

Create `app/api/admin/health/[diagnosticId]/route.ts`:

```ts
/**
 * GET /api/admin/health/[diagnosticId]
 *
 * Devolve o snapshot do dia + histórico dos últimos 7 dias do health score
 * desse aluno, para uso na página /admin/resultado/[id].
 *
 * Auth: segue o mesmo padrão de /api/admin/health (a lista). Se aquela rota
 * não autentica (admin gated em outro lugar), esta também não autentica.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { HealthBand } from "@/lib/health/types";

export const dynamic = "force-dynamic";

interface SnapshotRow {
  day: string;
  health: number;
  band: HealthBand;
  breakdown: {
    resultado: number | null;
    conclusao: number | null;
    sentimento: number | null;
    leaksClosed?: number;
    leaksTotal?: number;
  } | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ diagnosticId: string }> }
) {
  const { diagnosticId } = await ctx.params;
  if (!diagnosticId) {
    return NextResponse.json({ error: "Missing diagnosticId" }, { status: 400 });
  }

  // Last 7 daily snapshots, newest first
  const { data, error } = await supabaseAdmin
    .from("health_snapshots")
    .select("day, health, band, breakdown")
    .eq("diagnostic_id", diagnosticId)
    .order("day", { ascending: false })
    .limit(7);

  if (error) {
    console.error("[api/admin/health/id] read error:", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const history = (data ?? []) as SnapshotRow[];
  const snapshot = history[0] ?? null;

  return NextResponse.json({
    snapshot,
    history: [...history].reverse(), // oldest → newest for sparkline
  });
}
```

**⚠️ Ajuste o nome da tabela e das colunas** se o passo 2 mostrou nomes diferentes (ex.: se a tabela for `health_score_snapshots`, ou se `breakdown` for `score_breakdown`).

- [ ] **Step 4: Smoke test**

Run (com dev server vivo):
```powershell
# Pegue o id do mais recente:
curl.exe "http://localhost:3000/api/admin/health/<REAL_DIAGNOSTIC_ID>"
```

Expected: `{ "snapshot": {...} | null, "history": [...] }`. Se nenhum cron rodou ainda nesse aluno, `snapshot: null` e `history: []` — isso é OK.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/health/[diagnosticId]/route.ts
git commit -m "feat(api): add /api/admin/health/[diagnosticId] for per-student health detail"
```

---

### Task 8: Adicionar modo single-spot ao `TrainerScreen`

**Files:**
- Modify: `components/trainer/TrainerScreen.tsx`
- Modify: `lib/poker/store.ts`

- [ ] **Step 1: Adicionar callback opcional no store**

Edit `lib/poker/store.ts`. Localizar a interface `DrillState` e adicionar:

```ts
// ... dentro de DrillState, após drillCompleted:
  /** Optional callback fired once per answered hand. Set via loadConfig. */
  onHandPlayed?: (args: { correct: boolean; handsPlayed: number; handsCorrect: number }) => void;
```

Modificar a assinatura de `loadConfig`:

```ts
  loadConfig: (
    raw: unknown,
    opts?: { onHandPlayed?: DrillState["onHandPlayed"] }
  ) => void;
```

No corpo de `loadConfig`, adicionar `opts?.onHandPlayed` ao `set({...})`:

```ts
    set({
      context,
      drill,
      errorMessage: "",
      totalHandsPlayed: 0,
      correctPlays: 0,
      hasPickedAnswer: false,
      drillCompleted: false,
      sequentialQueue: queue,
      sequentialCursor: 0,
      onHandPlayed: opts?.onHandPlayed,  // <— novo
    });
```

No `pickAnswer`, depois de calcular `newTotal` e `newCorrect`, adicionar:

```ts
    const cb = get().onHandPlayed;
    if (cb) cb({ correct, handsPlayed: newTotal, handsCorrect: newCorrect });
```

- [ ] **Step 2: Adicionar prop `singleSpotContext` em `TrainerScreen`**

Edit `components/trainer/TrainerScreen.tsx`. Modificar a interface `Props`:

```ts
interface Props {
  initialConfig: unknown;
  /** Quando presente, ativa modo single-spot: cada mão é reportada ao endpoint
   *  /api/spot-training, e ao bater o threshold redireciona pra /meu-plano. */
  singleSpotContext?: {
    diagnosticId: string;
    leakId: string;
  };
}
```

Modificar o componente:

```ts
export function TrainerScreen({ initialConfig, singleSpotContext }: Props) {
  // ... hooks existentes ...

  const router = useRouter(); // adicionar import: import { useRouter } from "next/navigation";

  useEffect(() => {
    if (!singleSpotContext) {
      loadConfig(initialConfig);
      return;
    }
    loadConfig(initialConfig, {
      onHandPlayed: async ({ correct }) => {
        try {
          const res = await fetch("/api/spot-training", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              diagnosticId: singleSpotContext.diagnosticId,
              leakId: singleSpotContext.leakId,
              correct,
            }),
          });
          const data = await res.json().catch(() => null);
          if (data?.unlockedNow) {
            // Pequeno delay pra animação de acerto/erro terminar
            setTimeout(() => router.push("/meu-plano?unlocked=1"), 1500);
          }
        } catch (err) {
          console.warn("[trainer] spot-training report failed:", err);
        }
      },
    });
  }, [initialConfig, loadConfig, singleSpotContext, router]);
```

Remover o `useEffect` antigo `useEffect(() => { loadConfig(initialConfig); }, [...])` — o novo o substitui.

- [ ] **Step 3: Confirmar que `next build` passa**

Run: `npm run build`
Expected: exit 0, sem erros de tipo.

- [ ] **Step 4: Confirmar que o fluxo de nivelamento NÃO quebrou**

Run: `npm run dev`. Abra `/diagnostico`, faça 2-3 spots. Verifique que continua funcionando como antes (não há `singleSpotContext`, segue o fluxo normal).

- [ ] **Step 5: Commit**

```bash
git add lib/poker/store.ts components/trainer/TrainerScreen.tsx
git commit -m "feat(trainer): add optional single-spot mode reporting hands to /api/spot-training"
```

---

### Task 9: Rota `/trainer/spot/[leakId]`

**Files:**
- Create: `app/trainer/spot/[leakId]/page.tsx`

- [ ] **Step 1: Estudar a rota existente `/trainer/[slug]`**

Run: `cat app/trainer/[slug]/page.tsx`
Veja como ela: lê params, carrega o JSON de `/public/spots/<slug>.json`, e passa pra `TrainerScreen`. **Imite a estrutura.**

- [ ] **Step 2: Criar `app/trainer/spot/[leakId]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { TrainerScreen } from "@/components/trainer/TrainerScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";
import { slugForLeak } from "@/lib/poker/spotLinks";

interface PageProps {
  params: Promise<{ leakId: string }>;
  searchParams: Promise<{ diag?: string }>;
}

export default async function SpotTrainerPage({ params, searchParams }: PageProps) {
  const { leakId } = await params;
  const { diag } = await searchParams;

  // Sem diagnosticId não dá pra reportar progresso — manda de volta pro plano
  if (!diag) redirect("/meu-plano");

  const slug = slugForLeak(leakId);
  if (!slug) notFound();

  const config = await loadSpotConfig(slug);
  if (!config) notFound();

  return (
    <TrainerScreen
      initialConfig={config}
      singleSpotContext={{ diagnosticId: diag, leakId }}
    />
  );
}
```

- [ ] **Step 3: Confirmar build + smoke**

Run: `npm run build`
Expected: passa.

Run: `npm run dev`, abra: `http://localhost:3000/trainer/spot/cBet-BTN-40?diag=<REAL_ID>`
Expected: TrainerScreen carrega com mãos do spot Cbet BTN. Joga uma mão — verifica no Supabase que `spot_training_sessions` teve `hands_played` incrementado.

Abra sem `?diag=`: `http://localhost:3000/trainer/spot/cBet-BTN-40`
Expected: redirect pra `/meu-plano`.

Abra com leak inválido: `http://localhost:3000/trainer/spot/squeeze-CO-30?diag=<REAL_ID>`
Expected: 404 (squeeze não tem trainer interno).

- [ ] **Step 4: Limpar a sessão de teste**

```sql
delete from spot_training_sessions where diagnostic_id = '<REAL_ID>';
```

- [ ] **Step 5: Commit**

```bash
git add app/trainer/spot/[leakId]/page.tsx
git commit -m "feat(trainer): add /trainer/spot/[leakId] route for single-spot training"
```

---

### Task 10: Componente `SpotCard`

**Files:**
- Create: `components/trainer/SpotCard.tsx`

- [ ] **Step 1: Criar o componente**

Create `components/trainer/SpotCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { SpotTrackEntry } from "@/lib/poker/spotTrack";
import type { SpotProgress } from "@/lib/poker/spotTraining";
import { THRESHOLD_HANDS, THRESHOLD_PCT } from "@/lib/poker/spotTraining";

type State = "active" | "locked" | "completed";

interface Props {
  entry: SpotTrackEntry;
  state: State;
  progress: SpotProgress;
  diagnosticId: string;
  /** Lesson title pulled from lessonCatalog or null when there is no match. */
  lessonTitle: string | null;
  /** 1-line synopsis. Null when there is no specific copy for this theme. */
  lessonBlurb: string | null;
  /** Total number of spots in the track (for "Spot N / 3"). */
  totalCount: number;
}

export function SpotCard({
  entry,
  state,
  progress,
  diagnosticId,
  lessonTitle,
  lessonBlurb,
  totalCount,
}: Props) {
  if (state === "locked") return <LockedCard entry={entry} totalCount={totalCount} />;
  if (state === "completed") return <CompletedCard entry={entry} progress={progress} totalCount={totalCount} />;

  // Active
  const pctDisplay  = Math.round(progress.pct * 100);
  const handsTarget = THRESHOLD_HANDS;
  const handsBarPct = Math.min(100, (progress.handsPlayed / handsTarget) * 100);
  const showAlmostThere =
    progress.handsPlayed >= THRESHOLD_HANDS && progress.pct < THRESHOLD_PCT;

  const trainerHref = entry.trainerSlug
    ? `/trainer/spot/${encodeURIComponent(entry.leakId ?? "")}?diag=${encodeURIComponent(diagnosticId)}`
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rg-card rg-card--accent"
      style={{ padding: 28, borderRadius: "var(--rg-r-xl)" }}
    >
      <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span className="rg-eyebrow">SPOT {entry.index + 1} / {totalCount}</span>
        {entry.pct !== null && (
          <span className="rg-eyebrow rg-eyebrow--pill" style={{ color: "var(--rg-danger)" }}>
            Diagnóstico: {entry.pct}%
          </span>
        )}
      </header>

      <h3 className="rg-h2" style={{ marginBottom: 18 }}>{entry.label}</h3>

      {/* Bloco 1 — Diagnóstico */}
      <section style={{ marginBottom: 20 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>Por que esse spot</p>
        <p className="rg-body-sm">
          {entry.pct !== null
            ? `Você acertou ${entry.pct}% no nivelamento. Esse é um dos seus leaks principais.`
            : "Recomendação a definir pelo seu Manager."}
        </p>
      </section>

      {/* Bloco 2 — Aula */}
      <section style={{ marginBottom: 20 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>O que você vai aprender</p>
        <a
          href={entry.lessonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rg-row"
          style={{ padding: "12px 14px" }}
        >
          <span>📺 {lessonTitle ?? "Aula recomendada"}</span>
          <span className="rg-row__arrow">→</span>
        </a>
        {lessonBlurb && (
          <p className="rg-caption" style={{ marginTop: 8 }}>{lessonBlurb}</p>
        )}
      </section>

      {/* Bloco 3 — Treino */}
      <section style={{ marginBottom: 12 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>Treine este spot</p>
        <p className="rg-caption" style={{ marginBottom: 12 }}>
          Meta: {Math.round(THRESHOLD_PCT * 100)}% de acerto em {THRESHOLD_HANDS} mãos
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div className="rg-progress" style={{ flex: 1 }}>
            <div className="rg-progress__bar" style={{ width: `${handsBarPct}%` }} />
          </div>
          <span className="rg-mono" style={{ fontSize: 12, color: "var(--rg-fg-subtle)" }}>
            {progress.handsPlayed}/{handsTarget} mãos · {pctDisplay}% acerto
          </span>
        </div>

        {showAlmostThere && (
          <p className="rg-caption" style={{ color: "var(--rg-warn)", marginBottom: 8 }}>
            Quase lá — continue até {Math.round(THRESHOLD_PCT * 100)}%
          </p>
        )}

        {trainerHref ? (
          <Link href={trainerHref} className="rg-btn rg-btn--primary rg-btn--lg">
            ▶ Treinar este spot
          </Link>
        ) : (
          <p className="rg-caption">
            Esse spot ainda não está no trainer interno. Estude a aula acima e fale com o EV Manager.
          </p>
        )}
      </section>

      <p className="rg-caption" style={{ marginTop: 12 }}>
        ✓ Critério: {Math.round(THRESHOLD_PCT * 100)}% em {THRESHOLD_HANDS} mãos → libera o próximo Spot
      </p>
    </motion.article>
  );
}

function LockedCard({ entry, totalCount }: { entry: SpotTrackEntry; totalCount: number }) {
  return (
    <article
      className="rg-card"
      style={{ padding: 20, borderRadius: "var(--rg-r-lg)", opacity: 0.55 }}
    >
      <div className="flex items-center justify-between">
        <span className="rg-eyebrow">SPOT {entry.index + 1} / {totalCount}</span>
        <span className="rg-meta">🔒 Bloqueado</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        Disponível após concluir o Spot {entry.index}
      </p>
    </article>
  );
}

function CompletedCard({
  entry,
  progress,
  totalCount,
}: {
  entry: SpotTrackEntry;
  progress: SpotProgress;
  totalCount: number;
}) {
  return (
    <article
      className="rg-card"
      style={{
        padding: 20,
        borderRadius: "var(--rg-r-lg)",
        borderColor: "var(--rg-success)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="rg-eyebrow" style={{ color: "var(--rg-success)" }}>
          SPOT {entry.index + 1} / {totalCount} · CONCLUÍDO
        </span>
        <span className="rg-meta" style={{ color: "var(--rg-success)" }}>✓</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        {progress.handsPlayed} mãos · {Math.round(progress.pct * 100)}% de acerto
      </p>
    </article>
  );
}
```

- [ ] **Step 2: Confirmar build**

Run: `npm run build`
Expected: passa. Se faltarem classes CSS (ex.: `rg-card--accent`), revise — todas devem existir no projeto (foram extraídas de `PlanScreen.tsx`).

- [ ] **Step 3: Commit**

```bash
git add components/trainer/SpotCard.tsx
git commit -m "feat(plan): add SpotCard component (active/locked/completed states)"
```

---

### Task 11: Componente `SpotTrack` (orquestrador)

**Files:**
- Create: `components/trainer/SpotTrack.tsx`

- [ ] **Step 1: Decidir como pegar título + blurb da aula**

A sinopse vem do `lessonCatalog`. Vamos criar uma função utilitária inline neste arquivo (puxar o primeiro lesson da action correspondente como título, e usar um mapa estático de blurbs por action).

- [ ] **Step 2: Criar `SpotTrack.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildSpotTrack } from "@/lib/poker/spotTrack";
import { computeProgress, type SpotProgress } from "@/lib/poker/spotTraining";
import { LESSON_CATALOG, type LessonAction } from "@/lib/poker/lessonCatalog";
import { SpotCard } from "./SpotCard";

interface Props {
  plan: SavedPlan;
}

const BLURB_BY_ACTION: Partial<Record<LessonAction, string>> = {
  RFI:        "Como abrir mãos pré-flop por posição e stack — ranges cEV e os erros mais caros.",
  cBet:       "Quando puxar pequena, grande ou checar — texturas dry vs. wet em SPR baixo.",
  vsOpen:     "Como decidir entre flat, 3bet ou fold ao enfrentar um RFI.",
  bbDefense:  "Defesa de BB pré-flop — quais mãos defender e quando 3betar.",
  blindWar:   "Dinâmica SB vs BB pré-flop — limpe walks e proteja seu BB.",
  vsCbet:     "Como reagir a c-bet do BB: check-raise, check-call e folds disciplinados.",
  cbetTurn:   "Polarização no turn — qual size e quando deixar para o river.",
  cbetRiver:  "Decisões de value e blefe no river após c-bet em IP.",
  multiway:   "Defesa de BB em pots multiway — equity, posição e plano de pós-flop.",
  vs3Bet:     "Flat ou 4bet contra uma 3bet — leitura de range e sizes.",
  cbetOOP:    "C-bet fora de posição — frequências por size e por interação de range.",
  playingIP:  "Jogando em posição: vs cbet IP + bet vs missed c-bet.",
};

function actionOf(leakId: string | null): LessonAction | null {
  if (!leakId) return null;
  return (leakId.split("-")[0] as LessonAction) ?? null;
}

function lessonMeta(leakId: string | null): { title: string | null; blurb: string | null } {
  const action = actionOf(leakId);
  if (!action) return { title: null, blurb: null };
  const first = LESSON_CATALOG.find((l) => l.tags.action === action);
  return {
    title: first?.title ?? null,
    blurb: BLURB_BY_ACTION[action] ?? null,
  };
}

export function SpotTrack({ plan }: Props) {
  const track = buildSpotTrack(plan);
  const diagnosticId = plan.diagnosticId ?? "";

  // Progresso por leakId. undefined = ainda carregando; null = sem dados.
  const [progressByLeak, setProgressByLeak] = useState<
    Record<string, SpotProgress | null | undefined>
  >({});

  useEffect(() => {
    if (!diagnosticId) return;
    let cancelled = false;

    async function fetchAll() {
      const updates: Record<string, SpotProgress | null> = {};
      for (const entry of track) {
        if (!entry.leakId) continue;
        try {
          const res = await fetch(
            `/api/spot-training?diagnosticId=${encodeURIComponent(diagnosticId)}&leakId=${encodeURIComponent(entry.leakId)}`
          );
          if (!res.ok) { updates[entry.leakId] = null; continue; }
          const data = await res.json();
          updates[entry.leakId] = data.progress ?? null;
        } catch {
          updates[entry.leakId] = null;
        }
      }
      if (!cancelled) setProgressByLeak(updates);
    }

    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosticId, track.map((t) => t.leakId).join(",")]);

  if (!diagnosticId || track.length === 0) {
    return (
      <div className="rg-card" style={{ padding: 22 }}>
        <h3 className="rg-h3">Sua trilha de 30 dias</h3>
        <p className="rg-body-sm" style={{ marginTop: 8 }}>
          Mandou bem no nivelamento — nenhum spot crítico identificado. Foque em volume e fale com o EV Manager pra próximos passos.
        </p>
      </div>
    );
  }

  // Determine which is the first non-completed → that's the active one.
  // Everything before active is completed; everything after is locked.
  let activeIdx = -1;
  for (let i = 0; i < track.length; i++) {
    const id = track[i].leakId;
    const p = id ? progressByLeak[id] : undefined;
    if (!p || !p.completed) { activeIdx = i; break; }
  }
  if (activeIdx === -1) activeIdx = track.length; // todos concluídos

  return (
    <section style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h3 className="rg-h3">Sua trilha de 30 dias</h3>
        <p className="rg-body-sm" style={{ marginTop: 4 }}>
          Conclua um spot por vez. Atingir {`${70}% em ${50} mãos`} libera o próximo.
        </p>
      </header>

      {track.map((entry, i) => {
        const id = entry.leakId;
        const p = id ? progressByLeak[id] : undefined;
        const progress: SpotProgress = p ?? computeProgress(null);

        const state: "active" | "locked" | "completed" =
          i < activeIdx ? "completed" : i === activeIdx ? "active" : "locked";

        const { title, blurb } = lessonMeta(id);

        return (
          <SpotCard
            key={`${entry.index}-${id ?? "empty"}`}
            entry={entry}
            state={state}
            progress={progress}
            diagnosticId={diagnosticId}
            lessonTitle={title}
            lessonBlurb={blurb}
            totalCount={track.length}
          />
        );
      })}
    </section>
  );
}
```

- [ ] **Step 3: Confirmar build**

Run: `npm run build`
Expected: passa.

- [ ] **Step 4: Commit**

```bash
git add components/trainer/SpotTrack.tsx
git commit -m "feat(plan): add SpotTrack orchestrator with sequential gating UI"
```

---

### Task 12: Componente `ResourcesBlock`

**Files:**
- Create: `components/trainer/ResourcesBlock.tsx`

- [ ] **Step 1: Criar componente**

Create `components/trainer/ResourcesBlock.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildResources } from "@/lib/poker/spotTrack";

interface Props { plan: SavedPlan; }

export function ResourcesBlock({ plan }: Props) {
  const items = buildResources(plan);
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{ marginTop: 40 }}
    >
      <p className="rg-eyebrow">Recursos pra sua jornada</p>
      <h3 className="rg-h3" style={{ marginTop: 6 }}>Apoio do plano</h3>
      <ul
        style={{
          margin: "12px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((item, i) => (
          <li key={i}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rg-row"
              style={{ padding: "14px 18px" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{item.label}</div>
                {item.sublabel && (
                  <div className="rg-caption" style={{ marginTop: 2 }}>{item.sublabel}</div>
                )}
              </div>
              <span className="rg-row__arrow">→</span>
            </a>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/trainer/ResourcesBlock.tsx
git commit -m "feat(plan): add ResourcesBlock for secondary jornada links"
```

---

### Task 13: Refatorar `PlanScreen.tsx`

**Files:**
- Modify: `components/trainer/PlanScreen.tsx`

- [ ] **Step 1: Remover import e uso do `HealthScoreBlock`**

Edit `components/trainer/PlanScreen.tsx`:

Remove import (linha ~10):
```ts
import { HealthScoreBlock } from "./HealthScoreBlock";
```

Remove o bloco JSX (linhas ~139-144):
```tsx
        {/* HealthScoreBlock — número 0-100 + barra + 3 pílulas */}
        {plan.diagnosticId && (
          <div style={{ marginBottom: 24 }}>
            <HealthScoreBlock diagnosticId={plan.diagnosticId} />
          </div>
        )}
```

- [ ] **Step 2: Remover import e uso de `buildChallenge30d`**

Remove (~linha 7):
```ts
import { buildChallenge30d } from "@/lib/poker/challenge30d";
```

Remove (~linha 22):
```ts
  const items = useMemo(() => buildChallenge30d(plan), [plan]);
```

- [ ] **Step 3: Adicionar imports novos**

```ts
import { SpotTrack } from "./SpotTrack";
import { ResourcesBlock } from "./ResourcesBlock";
```

- [ ] **Step 4: Substituir o bloco "Plano de Progressão" pela trilha**

Localize o bloco que começa com:
```tsx
        {/* Plano de Ação — 6 itens */}
        <motion.div ...>
          <p className="rg-eyebrow">Seus links</p>
          <h3 className="rg-h3" ...>Plano de Progressão</h3>
          ...
        </motion.div>

        <motion.ul ...>
          {items.map(...)}
        </motion.ul>
```

Substitua tudo isso por:

```tsx
        <SpotTrack plan={plan} />
        <ResourcesBlock plan={plan} />
```

- [ ] **Step 5: Confirmar build**

Run: `npm run build`
Expected: passa.

- [ ] **Step 6: Verificação visual**

Run: `npm run dev`. Abre `/meu-plano` com um diagnóstico que tem 3 leaks (peça pra criar um se necessário rodando `/diagnostico`).

Confira:
- Health Score NÃO aparece
- Trilha de 3 spots aparece, Spot 1 ativo, Spot 2 e 3 com cadeado
- Cada SpotCard mostra diagnóstico %, título da aula, blurb, botão "Treinar este spot"
- Embaixo: bloco "Recursos pra sua jornada" com Carreira + Grade
- Botão "Baixar PDF" continua funcionando (não tocamos no PDF)
- EvHud, PulseCard, EV Manager card, Footer — tudo intacto

- [ ] **Step 7: Commit**

```bash
git add components/trainer/PlanScreen.tsx
git commit -m "feat(plan): replace HealthScoreBlock + flat list with SpotTrack and ResourcesBlock"
```

---

### Task 14: `HealthScoreBlock` — adicionar prop `mode` + sparkline

**Files:**
- Modify: `components/trainer/HealthScoreBlock.tsx`

- [ ] **Step 1: Adicionar prop `mode` e branch de fetch**

Edit `components/trainer/HealthScoreBlock.tsx`. Modificar `Props`:

```ts
interface Props {
  diagnosticId: string | undefined;
  mode?: "self" | "admin";
}
```

Modificar a função:

```ts
export function HealthScoreBlock({ diagnosticId, mode = "self" }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);
  const [history, setHistory] = useState<Snapshot[]>([]);

  useEffect(() => {
    if (!diagnosticId) { setSnapshot(null); return; }
    let mounted = true;

    const url = mode === "admin"
      ? `/api/admin/health/${encodeURIComponent(diagnosticId)}`
      : `/api/health/me?diag=${encodeURIComponent(diagnosticId)}`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return;
        if (mode === "admin") {
          setSnapshot((data?.snapshot as Snapshot | null) ?? null);
          setHistory((data?.history as Snapshot[]) ?? []);
        } else {
          setSnapshot((data?.snapshot as Snapshot | null) ?? null);
        }
      })
      .catch(() => { if (mounted) setSnapshot(null); });

    return () => { mounted = false; };
  }, [diagnosticId, mode]);

  // ... loading / null states unchanged ...
```

No JSX, **antes do `</div>` de fechamento principal**, adicionar:

```tsx
      {mode === "admin" && history.length > 1 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">
            Últimos {history.length} dias
          </p>
          <Sparkline history={history} className="mt-1" />
        </div>
      )}
```

Adicionar o componente `Sparkline` no fim do arquivo:

```tsx
function Sparkline({ history, className = "" }: { history: Snapshot[]; className?: string }) {
  if (history.length < 2) return null;
  const w = 220;
  const h = 36;
  const min = Math.min(...history.map((s) => s.health));
  const max = Math.max(...history.map((s) => s.health));
  const range = Math.max(1, max - min);
  const points = history.map((s, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((s.health - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      width={w} height={h} className={className}
      role="img" aria-label={`Health Score dos últimos ${history.length} dias`}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={points.join(" ")}
        className="text-emerald-300"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Confirmar build**

Run: `npm run build`
Expected: passa.

- [ ] **Step 3: Commit**

```bash
git add components/trainer/HealthScoreBlock.tsx
git commit -m "feat(health): add mode prop to HealthScoreBlock + 7-day sparkline for admin"
```

---

### Task 15: Adicionar bloco de Health Score em `/admin/resultado/[id]`

**Files:**
- Modify: `app/admin/resultado/[id]/page.tsx`

- [ ] **Step 1: Localizar onde inserir**

Edit `app/admin/resultado/[id]/page.tsx`. Logo após o header (na linha onde acaba o `<div className="border-b border-neutral-800 ...">`), antes do conteúdo principal.

- [ ] **Step 2: Adicionar import**

```ts
import { HealthScoreBlock } from "@/components/trainer/HealthScoreBlock";
```

- [ ] **Step 3: Inserir o bloco**

Logo abaixo do header e antes do bloco de stats principais do aluno:

```tsx
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <HealthScoreBlock diagnosticId={row.id} mode="admin" />
      </div>
```

Ajuste a classe/largura pra casar com o layout existente da página.

- [ ] **Step 4: Confirmar build**

Run: `npm run build`
Expected: passa.

- [ ] **Step 5: Verificação visual**

Run: `npm run dev`. Abra `/admin/resultado/<id_real>` (use um id que tenha pelo menos 1 snapshot — pode forçar um cron rodando `/api/cron/health-score` se o env tiver `CRON_SECRET` setado, ou esperar o cron diário).

Confira:
- Bloco grande de Health Score aparece no topo
- Mostra número + barra + 3 pílulas + leaks fechados
- Se houver ≥ 2 dias de snapshot: sparkline aparece
- Se não houver snapshot: estado vazio "aparece aqui depois do primeiro cálculo" — OK

- [ ] **Step 6: Commit**

```bash
git add app/admin/resultado/[id]/page.tsx
git commit -m "feat(admin): show detailed Health Score block on /admin/resultado/[id]"
```

---

### Task 16: Verificação fim-a-fim + checklist do spec

**Files:**
- Read-only

- [ ] **Step 1: Build + lint final**

Run: `npm run build`
Expected: exit 0, sem warnings de tipo.

Run: `npm run lint`
Expected: exit 0 (ou só warnings que já existiam antes — verifique com `git stash; npm run lint` se desconfiar).

- [ ] **Step 2: Rodar todos os check scripts**

Run:
```bash
npx tsx scripts/check-spotLinks.ts
npx tsx scripts/check-spotTraining.ts
npx tsx scripts/check-spotTrack.ts
```
Expected: cada um imprime "All ... checks passed".

- [ ] **Step 3: Verificar critérios de sucesso do spec (§13 do design)**

Abrir `npm run dev` e validar manualmente:

- [ ] `/meu-plano` mostra trilha de 3 spots, não a lista de 6 itens
- [ ] Spot 2 e Spot 3 começam bloqueados (cadeado) na primeira vez
- [ ] `/trainer/spot/[leakId]?diag=<id>` sorteia apenas mãos do spot escolhido
- [ ] Após 50 mãos com ≥70% de acerto, o spot fecha e o próximo expande (testar diretamente seedando `spot_training_sessions` com 49/35 e jogando 1 mão correta)
- [ ] Aluno com 0 leaks vê estado especial "mandou bem no nivelamento" (testar criando um plano com `leaks: []`)
- [ ] `/meu-plano` NÃO mostra mais o Health Score
- [ ] `/admin` mostra aba "Saúde da turma" (já existia — confirme que não quebrou)
- [ ] `/admin/resultado/[id]` mostra bloco grande de Health Score com sparkline
- [ ] Carreira, Grade de torneios e Manager EV ainda existem em `/meu-plano`
- [ ] PDF do plano continua gerando sem erro (clique "Baixar plano em PDF")

- [ ] **Step 4: Limpar seeds de teste**

No Supabase:
```sql
delete from spot_training_sessions
where diagnostic_id in ('<id-de-teste-1>', '<id-de-teste-2>');
```

- [ ] **Step 5: Sumarizar a entrega**

Confirme com `git log onboarding-ev --oneline -20` que todos os commits da implementação estão presentes. Pré-pare um resumo de 3 linhas pro PR (ou mantenha local — usuário decide se vira PR).

---

## Self-Review (executado durante a escrita)

**Spec coverage:**
- §3 Estrutura — Task 13 (PlanScreen refactor) ✓
- §4 Anatomia do SpotCard — Task 10 ✓
- §5 Trainer isolado — Tasks 8 + 9 ✓
- §6 Critério e gating — Task 4 (thresholds) + Task 6 (server-side gating) ✓
- §7 Edge cases (sem leaks, placeholder, Tier 3) — Tasks 3, 11 ✓
- §8 Migração Health Score — Tasks 13, 14, 15 ✓
  - **Ajuste pós-spec:** Coluna na lista `/admin` já existe via aba "Saúde da turma". O spec mencionava "coluna na tabela" — na prática a aba separada cumpre o objetivo (triagem rápida por banda + filtro). **Não vou criar coluna duplicada.** Se o usuário insistir em ter no `/admin` principal, é uma task pós-merge.
- §9 Arquivos novos/modificados — todos cobertos ✓
- §10 Sinopse estática no `lessonCatalog` — Task 11 (`BLURB_BY_ACTION` inline em `SpotTrack.tsx`). Decisão de implementação: em vez de mexer no catálogo, mantive o mapa local — menos churn. ✓
- §11 Mini-histórico 7 dias — Task 14 ✓
- §12 Riscos — endereçados nas tasks (Tier 3 sem trainer cai em mensagem manual no SpotCard; leak placeholder mostra fallback)
- §13 Critérios — Task 16 ✓

**Placeholder scan:** todos os steps com código têm código real. Não há "implement later".

**Type consistency:**
- `SpotProgress` (lib/poker/spotTraining.ts) usado em SpotCard, SpotTrack, API. Mesma forma.
- `SpotTrackEntry` (lib/poker/spotTrack.ts) consumido em SpotCard e SpotTrack. OK.
- `singleSpotContext` em TrainerScreen tem o mesmo shape em ambos os lados (page + componente).
- `hasInternalTrainer` / `slugForLeak` definidos uma vez, usados consistentemente.

**Ajuste durante self-review:** Adicionei nota explícita no §8 sobre a aba "Saúde da turma" já existente.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-meu-plano-trilha-3-spots.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for keeping context clean across 16 tasks.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints for review.

**Which approach?**
