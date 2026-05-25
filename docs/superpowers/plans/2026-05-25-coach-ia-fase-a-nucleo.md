# Coach IA — Fase A (Núcleo do Health Score) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir o Health Score do aluno (0.8·Resultado + 0.1·Conclusão + 0.1·Sentimento), detectar leak fechado e mudança de faixa via cron diário, plugar os triggers que faltam (`daily_checkin`, `weekly_review`, `leak_closed`, `health_band_change`) reaproveitando o fan-out já existente (`sendEvNotification`), e expor a saúde da turma no admin.

**Architecture:** Quatro camadas isoladas. Sensores já existem no banco. **Health Score Engine** é um módulo puro em `lib/health/` que recebe estado e devolve score (testável sem banco). Um **cron diário** (`app/api/cron/health-score/route.ts`) chama o engine para cada aluno ativo, persiste em `player_health_snapshots`, e detecta deltas (`leak_closed`, `health_band_change`) que disparam triggers via o `sendEvNotification` já existente. Os triggers temporais (`daily_checkin`, `weekly_review`) ganham handlers separados acoplados ao cron `daily-pulse` que já roda.

**Tech Stack:** Next.js 16 (App Router — versão com breaking changes, ler `node_modules/next/dist/docs/` antes de mexer em rota/API), TypeScript, Supabase (service role), OpenAI gpt-4o-mini (via `ev-voice`), `tsx` para scripts manuais de verificação (já em devDeps).

---

## Spec de referência

`docs/superpowers/specs/2026-05-25-coach-ia-cs-design.md` (commit `65f34ec`).

## Pré-condições do ambiente

- Branch `onboarding-ev` checked out.
- `.env.local` com: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`.
- Acesso ao Supabase SQL Editor (migração 012 é aplicada lá manualmente — convenção do repo).

## Realidade descoberta no código (que muda o spec)

O spec listou `post_session` e `leak_alert` como triggers "novos". Eles **já existem** em `app/api/cron/sharkscope-sync/route.ts` (linhas 117-185), disparando via `sendEvNotification`. Esta Fase A **não toca neles**. Eventuais ajustes (cadência, throttle) ficam para a Fase C.

## File Structure (Fase A)

**Cria:**

```
supabase/migrations/012_health_score.sql
lib/health/types.ts
lib/health/leakClosed.ts
lib/health/band.ts
lib/health/score.ts
lib/health/collect.ts
lib/health/snapshot.ts
lib/triggers/leakClosed.ts
lib/triggers/healthBandChange.ts
lib/triggers/dailyCheckin.ts
lib/triggers/weeklyReview.ts
app/api/cron/health-score/route.ts
app/api/admin/health/route.ts
components/admin/HealthTable.tsx
scripts/check-health-score.ts
```

**Modifica:**

```
lib/notify.ts              — adiciona kinds: leak_closed, health_band_change, daily_checkin, weekly_review
lib/ev-voice.ts            — adiciona triggers: leak_closed, health_band_change, daily_checkin, weekly_review (+ labels)
app/api/cron/daily-pulse/route.ts — chama dailyCheckin + weeklyReview por aluno
app/admin/page.tsx         — aba "Saúde"
```

**Convenção:**
Cada arquivo de `lib/health/` tem **uma** responsabilidade. Funções puras (sem I/O) ficam separadas das coletoras (com Supabase). Isso garante que `score.ts`, `band.ts` e `leakClosed.ts` rodam em `scripts/check-health-score.ts` sem precisar de banco — é a verificação que substitui testes unitários nesta fase.

---

### Task 1: Migração 012 (schema)

**Files:**
- Create: `supabase/migrations/012_health_score.sql`

- [ ] **Step 1.1: Escrever a migração**

```sql
-- ============================================================
-- RegLife — Migration 012: Health Score do aluno + pulse
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================

-- 1) Snapshot diário do Health Score
create table if not exists public.player_health_snapshots (
  diagnostic_id uuid not null
    references public.reglife_diagnostic_results(id) on delete cascade,
  day date not null,
  resultado    numeric(5,2),
  leak_score   numeric(5,2),
  roi_score    numeric(5,2),
  conclusao    numeric(5,2),
  sentimento   numeric(5,2),
  health       numeric(5,2) not null,
  band         text not null check (band in ('green','yellow','orange','red')),
  breakdown    jsonb,
  created_at   timestamptz not null default now(),
  primary key (diagnostic_id, day)
);
-- Index pensado pra query do admin (Task 15): "últimos 30 dias, latest por aluno".
-- Day liderando dá range scan eficiente; band é só secondary (tie-breaker raro).
create index if not exists player_health_snapshots_day_idx
  on public.player_health_snapshots (day desc, band);

-- 2) Pulse semanal (usado em Fase C — mas a tabela cabe na 012 pra evitar
--    migração só pra isso depois; nenhuma rota da Fase A grava nela ainda)
create table if not exists public.pulse_responses (
  diagnostic_id uuid not null
    references public.reglife_diagnostic_results(id) on delete cascade,
  week_iso     text not null,                 -- ex: "2026-W21"
  emoji        text not null check (emoji in ('sad','meh','smile','grin')),
  source       text not null check (source in ('in_app','whatsapp','email','link')),
  created_at   timestamptz not null default now(),
  primary key (diagnostic_id, week_iso)
);

-- 3) Colunas em reglife_diagnostic_results
alter table public.reglife_diagnostic_results
  add column if not exists notify_cadence text
    not null default 'ritmada'
    check (notify_cadence in ('leve','ritmada','intensa')),
  add column if not exists roi_baseline numeric(6,2),
  add column if not exists email_for_notify text;

-- 4) Lockdown anon — mesma postura de 010_lock_down_anon.sql.
--    Todo writer (cron health-score, snapshot.ts, /api/admin/health,
--    rotas futuras de pulse) usa service_role; anon/authenticated não
--    deve nunca tocar essas tabelas. RLS sem policy = nega tudo.
alter table public.player_health_snapshots enable row level security;
alter table public.pulse_responses          enable row level security;

revoke all on public.player_health_snapshots from anon, authenticated;
revoke all on public.pulse_responses          from anon, authenticated;
```

- [ ] **Step 1.2: Aplicar no Supabase SQL Editor**

Cole o conteúdo de `supabase/migrations/012_health_score.sql` no SQL Editor do projeto e rode. Verifique que rodou sem erro (espera "Success. No rows returned").

- [ ] **Step 1.3: Verificar schema**

Cole no SQL Editor:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'player_health_snapshots'
order by ordinal_position;
```

Esperado: 11 colunas (`diagnostic_id`, `day`, `resultado`, `leak_score`, `roi_score`, `conclusao`, `sentimento`, `health`, `band`, `breakdown`, `created_at`).

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/012_health_score.sql
git commit -m "feat(health): migration 012 — health_score snapshots + pulse_responses"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Create: `lib/health/types.ts`

- [ ] **Step 2.1: Escrever os tipos**

```ts
/**
 * lib/health/types.ts — Tipos compartilhados do Health Score Engine.
 *
 * O Engine é puro: recebe um `PlayerState` (snapshot do estado atual do aluno
 * em forma serializável) e devolve um `HealthScore`. Quem coleta o `PlayerState`
 * é `lib/health/collect.ts`; quem persiste o `HealthScore` é `lib/health/snapshot.ts`.
 */

export type HealthBand = "green" | "yellow" | "orange" | "red";

/** Acerto do aluno num bucket de spots (do diagnóstico ou retake). */
export interface SpotSummary {
  label: string;
  pct: number;        // 0..100 — % de acerto
  tier: number;       // 1..3
  passed: boolean;    // true se passou no bucket
  /** Mãos jogadas no bucket (necessário pro critério MIN_HANDS). */
  hands?: number;
}

/** Estado de um aluno num momento, agregado pelo collect.ts. */
export interface PlayerState {
  diagnosticId: string;
  /** Dia do ciclo (1..90+). Calculado a partir de created_at. */
  cycleDay: number;
  /** Spots do diagnóstico original. */
  diagnosticSpots: SpotSummary[];
  /** Spots do retake mais recente (se houver). */
  retakeSpots: SpotSummary[] | null;
  /** ROI baseline congelado no diagnóstico (ou null se SS não conectado). */
  roiBaseline: number | null;
  /** ROI dos últimos 30 dias do SharkScope (ou null). */
  roi30d: number | null;
  /** Tasks marcadas como feitas até hoje. */
  tasksChecked: number;
  /**
   * Tasks que o plano espera estarem feitas até `cycleDay` (cap em totalTasks).
   * Calculado pelo collect.ts somando tasks das fases atravessadas.
   */
  tasksExpected: number;
  /** Últimos N pulses (mais recente primeiro), N≤4. Vazio se Fase C ainda não rodou. */
  recentPulses: Array<"sad" | "meh" | "smile" | "grin">;
}

export interface HealthBreakdown {
  /** Quantos leaks fechados / total. */
  leaksClosed: number;
  leaksTotal: number;
  /** Componentes do Resultado. */
  leakScore: number | null;
  roiScore: number | null;
  resultado: number | null;
  /** Componentes da Conclusão. */
  tasksChecked: number;
  tasksExpected: number;
  conclusao: number | null;
  /** Sentimento. */
  pulsesUsed: number;
  sentimento: number | null;
  /** Pesos efetivamente aplicados (depois de redistribuição quando algo é null). */
  weights: { resultado: number; conclusao: number; sentimento: number };
}

export interface HealthScore {
  health: number;            // 0..100
  band: HealthBand;
  breakdown: HealthBreakdown;
}

/** Constantes da fórmula — ajustáveis sem mudança de schema. */
export const LEAK_CLOSED_ACCURACY = 0.85;
export const LEAK_CLOSED_MIN_HANDS = 10;
export const WEIGHT_RESULTADO = 0.8;
export const WEIGHT_CONCLUSAO = 0.1;
export const WEIGHT_SENTIMENTO = 0.1;
```

- [ ] **Step 2.2: Verificar typecheck**

```bash
npx tsc --noEmit
```

Esperado: 0 erros (o arquivo só declara tipos e constantes, não importa nada).

- [ ] **Step 2.3: Commit**

```bash
git add lib/health/types.ts
git commit -m "feat(health): tipos compartilhados do Health Score Engine"
```

---

### Task 3: Critério de leak fechado (lógica pura)

**Files:**
- Create: `lib/health/leakClosed.ts`

- [ ] **Step 3.1: Implementar**

```ts
/**
 * lib/health/leakClosed.ts — Decide se um leak foi fechado.
 *
 * Critério (espelhando o spec):
 *   - O bucket de spots aparece no diagnóstico original como "leak"
 *     (passed === false).
 *   - O retake mais recente tem o MESMO bucket com:
 *       pct >= LEAK_CLOSED_ACCURACY * 100  (≥ 85% por padrão)
 *       hands >= LEAK_CLOSED_MIN_HANDS     (≥ 10 mãos por padrão)
 *
 * Função pura: recebe arrays, devolve a lista de labels fechados.
 * Quem busca os arrays é `collect.ts`.
 */

import {
  LEAK_CLOSED_ACCURACY,
  LEAK_CLOSED_MIN_HANDS,
  type SpotSummary,
} from "./types";

export function leaksFromDiagnostic(spots: SpotSummary[]): SpotSummary[] {
  return spots.filter((s) => !s.passed);
}

export function isClosed(
  leak: SpotSummary,
  retakeSpots: SpotSummary[]
): boolean {
  const retake = retakeSpots.find((r) => r.label === leak.label);
  if (!retake) return false;
  if (retake.pct < LEAK_CLOSED_ACCURACY * 100) return false;
  if ((retake.hands ?? 0) < LEAK_CLOSED_MIN_HANDS) return false;
  return true;
}

export function closedLeaks(
  diagnosticSpots: SpotSummary[],
  retakeSpots: SpotSummary[] | null
): { closed: string[]; total: number } {
  const leaks = leaksFromDiagnostic(diagnosticSpots);
  if (!retakeSpots || retakeSpots.length === 0) {
    return { closed: [], total: leaks.length };
  }
  const closed = leaks.filter((l) => isClosed(l, retakeSpots)).map((l) => l.label);
  return { closed, total: leaks.length };
}
```

- [ ] **Step 3.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3.3: Commit**

```bash
git add lib/health/leakClosed.ts
git commit -m "feat(health): critério puro de leak fechado (≥85% acerto, ≥10 mãos)"
```

---

### Task 4: Mapeamento de banda (lógica pura)

**Files:**
- Create: `lib/health/band.ts`

- [ ] **Step 4.1: Implementar**

```ts
/**
 * lib/health/band.ts — Mapeia score 0-100 em banda de saúde.
 * Função pura. Fronteiras alinhadas com o spec (80/60/40).
 */

import type { HealthBand } from "./types";

export function bandFor(health: number): HealthBand {
  if (health >= 80) return "green";
  if (health >= 60) return "yellow";
  if (health >= 40) return "orange";
  return "red";
}

/** Label visual em pt-BR. */
export const BAND_LABEL: Record<HealthBand, string> = {
  green:  "Verde",
  yellow: "Amarelo",
  orange: "Laranja",
  red:    "Vermelho",
};
```

- [ ] **Step 4.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4.3: Commit**

```bash
git add lib/health/band.ts
git commit -m "feat(health): mapeamento score → banda (green/yellow/orange/red)"
```

---

### Task 5: Fórmula do Health Score (lógica pura)

**Files:**
- Create: `lib/health/score.ts`

- [ ] **Step 5.1: Implementar**

```ts
/**
 * lib/health/score.ts — Fórmula pura do Health Score.
 *
 * HealthScore = 0.8·Resultado + 0.1·Conclusão + 0.1·Sentimento
 *
 * Resultado:
 *   resultado = 0.7·leakScore + 0.3·roiScore
 *   leakScore = (fechados / total) × 100, ou null se total=0
 *   roiScore  = clip(50 + 10·ΔROI, 0, 100), ou null se sem SS
 *   Se roiScore=null → resultado = leakScore (peso 1.0 dentro do Resultado).
 *   Se leakScore=null e roiScore=null → resultado=null.
 *
 * Conclusão:
 *   conclusao = min(100, tasksChecked / tasksExpected × 100), null se expected=0
 *
 * Sentimento:
 *   média dos últimos 4 pulses (😣=0 / 😐=33 / 🙂=66 / 😄=100); null se vazio.
 *
 * Redistribuição de pesos:
 *   Os componentes null saem do somatório; os pesos restantes são renormalizados
 *   pra somar 1. Se todos forem null → health=0 e banda=red.
 */

import {
  WEIGHT_RESULTADO,
  WEIGHT_CONCLUSAO,
  WEIGHT_SENTIMENTO,
  type HealthBreakdown,
  type HealthScore,
  type PlayerState,
} from "./types";
import { closedLeaks } from "./leakClosed";
import { bandFor } from "./band";

const PULSE_VALUE: Record<"sad" | "meh" | "smile" | "grin", number> = {
  sad: 0, meh: 33, smile: 66, grin: 100,
};

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function calcLeakScore(closed: number, total: number): number | null {
  if (total <= 0) return null;
  return (closed / total) * 100;
}

function calcRoiScore(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null) return null;
  return clip(50 + 10 * (current - baseline), 0, 100);
}

function calcResultado(leakScore: number | null, roiScore: number | null): number | null {
  if (leakScore === null && roiScore === null) return null;
  if (roiScore === null) return leakScore;        // só leak vale
  if (leakScore === null) return roiScore;        // sem leaks identificados, só ROI
  return 0.7 * leakScore + 0.3 * roiScore;
}

function calcConclusao(checked: number, expected: number): number | null {
  if (expected <= 0) return null;
  return Math.min(100, (checked / expected) * 100);
}

function calcSentimento(recent: Array<"sad" | "meh" | "smile" | "grin">): number | null {
  if (recent.length === 0) return null;
  const slice = recent.slice(0, 4);
  const sum = slice.reduce((acc, e) => acc + PULSE_VALUE[e], 0);
  return sum / slice.length;
}

/**
 * Combina os componentes com pesos default e renormaliza ignorando nulls.
 * Retorna 0 se TODOS forem null (caso degenerado).
 */
function combine(
  resultado: number | null,
  conclusao: number | null,
  sentimento: number | null
): { health: number; weights: HealthBreakdown["weights"] } {
  const parts: Array<{ value: number; weight: number; key: "resultado" | "conclusao" | "sentimento" }> = [];
  if (resultado !== null) parts.push({ value: resultado, weight: WEIGHT_RESULTADO, key: "resultado" });
  if (conclusao !== null) parts.push({ value: conclusao, weight: WEIGHT_CONCLUSAO, key: "conclusao" });
  if (sentimento !== null) parts.push({ value: sentimento, weight: WEIGHT_SENTIMENTO, key: "sentimento" });

  const weights = { resultado: 0, conclusao: 0, sentimento: 0 };
  if (parts.length === 0) return { health: 0, weights };

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  let health = 0;
  for (const p of parts) {
    const w = p.weight / totalWeight;
    weights[p.key] = w;
    health += p.value * w;
  }
  return { health, weights };
}

export function computeHealth(state: PlayerState): HealthScore {
  const { closed, total } = closedLeaks(state.diagnosticSpots, state.retakeSpots);

  const leakScore = calcLeakScore(closed.length, total);
  const roiScore = calcRoiScore(state.roiBaseline, state.roi30d);
  const resultado = calcResultado(leakScore, roiScore);
  const conclusao = calcConclusao(state.tasksChecked, state.tasksExpected);
  const sentimento = calcSentimento(state.recentPulses);

  const { health, weights } = combine(resultado, conclusao, sentimento);
  const band = bandFor(health);

  const breakdown: HealthBreakdown = {
    leaksClosed: closed.length,
    leaksTotal: total,
    leakScore,
    roiScore,
    resultado,
    tasksChecked: state.tasksChecked,
    tasksExpected: state.tasksExpected,
    conclusao,
    pulsesUsed: state.recentPulses.slice(0, 4).length,
    sentimento,
    weights,
  };

  return {
    health: Number(health.toFixed(2)),
    band,
    breakdown,
  };
}
```

- [ ] **Step 5.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5.3: Commit**

```bash
git add lib/health/score.ts
git commit -m "feat(health): fórmula pura do Health Score (0.8·R + 0.1·C + 0.1·S)"
```

---

### Task 6: Script de verificação da fórmula

**Files:**
- Create: `scripts/check-health-score.ts`

- [ ] **Step 6.1: Escrever o script**

```ts
/**
 * scripts/check-health-score.ts — Verificação manual da fórmula.
 *
 * Rodar com: npx tsx scripts/check-health-score.ts
 *
 * Substitui testes unitários nesta fase (o repo não tem test runner instalado).
 * Cada bloco imprime PASS/FAIL e o cálculo. Se algum FAIL aparecer, abortar.
 */

import { computeHealth } from "../lib/health/score";
import type { PlayerState } from "../lib/health/types";

function assertNear(label: string, got: number, expected: number, tol = 0.5) {
  const diff = Math.abs(got - expected);
  const ok = diff <= tol;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${got.toFixed(2)}, expected ~${expected.toFixed(2)}`);
  if (!ok) process.exitCode = 1;
}

function assertEq<T>(label: string, got: T, expected: T) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${String(got)}, expected ${String(expected)}`);
  if (!ok) process.exitCode = 1;
}

function base(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    diagnosticId: "test",
    cycleDay: 30,
    diagnosticSpots: [
      { label: "RFI",  pct: 50, tier: 1, passed: false },
      { label: "Cbet", pct: 60, tier: 1, passed: false },
    ],
    retakeSpots: null,
    roiBaseline: null,
    roi30d: null,
    tasksChecked: 0,
    tasksExpected: 0,
    recentPulses: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
console.log("\n=== Caso 1: aluno cru (só leaks, sem SS, sem tasks, sem pulse)");
// 2 leaks, 0 fechados → leakScore=0 → resultado=0 → health=0 (banda red)
{
  const r = computeHealth(base());
  assertNear("health", r.health, 0);
  assertEq("band", r.band, "red");
  assertNear("leakScore", r.breakdown.leakScore ?? -1, 0);
}

console.log("\n=== Caso 2: aluno fechou 1 dos 2 leaks no retake");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 90, tier: 1, passed: true, hands: 12 },
      { label: "Cbet", pct: 70, tier: 1, passed: false, hands: 12 },
    ],
  }));
  // leakScore=50 → resultado=50 → health=50 (sem outros componentes, peso 1.0 em resultado) → orange
  assertNear("health", r.health, 50);
  assertEq("band", r.band, "orange");
  assertEq("leaksClosed", r.breakdown.leaksClosed, 1);
}

console.log("\n=== Caso 3: retake fechou ambos, ROI subiu 5% acima do baseline");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 90, tier: 1, passed: true, hands: 15 },
      { label: "Cbet", pct: 88, tier: 1, passed: true, hands: 15 },
    ],
    roiBaseline: 0,
    roi30d: 5,
  }));
  // leakScore=100 ; roiScore=clip(50+50,0,100)=100 → resultado=0.7·100+0.3·100=100
  // sem outros componentes → health=100 → green
  assertNear("health", r.health, 100);
  assertEq("band", r.band, "green");
}

console.log("\n=== Caso 4: critério MIN_HANDS bloqueia leak fechado");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 95, tier: 1, passed: true, hands: 5 },   // mãos < 10 → não fecha
      { label: "Cbet", pct: 95, tier: 1, passed: true, hands: 15 },  // fecha
    ],
  }));
  assertEq("leaksClosed", r.breakdown.leaksClosed, 1);
}

console.log("\n=== Caso 5: conclusão + sentimento com peso redistribuído (sem resultado computável)");
// diagnóstico SEM leaks (todos passed) → total=0 → leakScore=null → resultado=null
// 5/10 tasks → conclusao=50 ; pulses [smile, smile] → sentimento=66
// pesos redistribuem 0.1/(0.1+0.1)=0.5 cada → health = 0.5·50 + 0.5·66 = 58
{
  const r = computeHealth(base({
    diagnosticSpots: [
      { label: "RFI", pct: 90, tier: 1, passed: true },
    ],
    tasksChecked: 5,
    tasksExpected: 10,
    recentPulses: ["smile", "smile"],
  }));
  assertNear("health", r.health, 58);
  assertEq("band", r.band, "red"); // 58 < 60 → red
}

console.log("\n=== Caso 6: tudo null (não deveria acontecer, mas precisa ser robusto)");
{
  const r = computeHealth(base({
    diagnosticSpots: [{ label: "RFI", pct: 90, tier: 1, passed: true }],
    tasksExpected: 0,
  }));
  assertNear("health", r.health, 0);
  assertEq("band", r.band, "red");
}

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
```

- [ ] **Step 6.2: Rodar**

```bash
npx tsx scripts/check-health-score.ts
```

Esperado: 6 blocos, todos PASS, e a linha final `✓ Todos os checks passaram.`. Se algum FAIL, corrigir `score.ts` e re-rodar.

- [ ] **Step 6.3: Commit**

```bash
git add scripts/check-health-score.ts
git commit -m "test(health): script de verificação manual da fórmula (6 casos)"
```

---

### Task 7: Coletor de estado (I/O)

**Files:**
- Create: `lib/health/collect.ts`

- [ ] **Step 7.1: Implementar**

```ts
/**
 * lib/health/collect.ts — Coleta o PlayerState atual de um aluno.
 *
 * Faz Promise.allSettled das queries em paralelo. Falha em uma fonte
 * (ex: SharkScope) não impede o cálculo — o componente vira null e
 * o score.ts redistribui pesos.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PlayerState, SpotSummary } from "./types";

function service(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface DiagRow {
  id: string;
  created_at: string;
  spot_summaries: SpotSummary[] | null;
  sharkscope_summary: { avgRoi: number | null } | null;
  roi_baseline: number | null;
  previous_diagnostic_id: string | null;
}

interface PlanRow {
  data: {
    phases?: Array<{ tasks?: Array<unknown> }>;
    progress?: { checkedTaskIds?: string[] };
  } | null;
}

/** Busca o retake MAIS RECENTE deste lead — se o lead refez o diagnóstico,
 *  o id mais novo na cadeia previous_diagnostic_id é o retake atual. */
async function fetchMostRecentRetake(
  supabase: SupabaseClient,
  diagnosticId: string
): Promise<SpotSummary[] | null> {
  // O "retake" é a linha que aponta de volta pra este id via previous_diagnostic_id.
  const { data } = await supabase
    .from("reglife_diagnostic_results")
    .select("spot_summaries")
    .eq("previous_diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const spots = (data?.spot_summaries as SpotSummary[] | undefined) ?? null;
  return spots && spots.length > 0 ? spots : null;
}

function cycleDayFrom(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000) + 1);
}

/**
 * Soma tasks das fases atravessadas (cap em 3). O plano é serializado em
 * `plans.data.phases` no banco — mesma forma do FE.
 */
function tasksExpectedFor(plan: PlanRow["data"], cycleDay: number): number {
  if (!plan?.phases) return 0;
  // Fase 1 = dias 1..30, Fase 2 = 31..60, Fase 3 = 61..90
  const phasesPassed = cycleDay <= 30 ? 1 : cycleDay <= 60 ? 2 : 3;
  return plan.phases
    .slice(0, phasesPassed)
    .reduce((acc, p) => acc + (p.tasks?.length ?? 0), 0);
}

export async function collectPlayerState(diagnosticId: string): Promise<PlayerState> {
  const supabase = service();

  const [diagRes, planRes, retakeRes, pulsesRes] = await Promise.allSettled([
    supabase
      .from("reglife_diagnostic_results")
      .select("id, created_at, spot_summaries, sharkscope_summary, roi_baseline, previous_diagnostic_id")
      .eq("id", diagnosticId)
      .single<DiagRow>(),
    supabase
      .from("plans")
      .select("data")
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PlanRow>(),
    fetchMostRecentRetake(supabase, diagnosticId),
    supabase
      .from("pulse_responses")
      .select("emoji, created_at")
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const diag = diagRes.status === "fulfilled" ? diagRes.value.data : null;
  const plan = planRes.status === "fulfilled" ? planRes.value.data?.data ?? null : null;
  const retakeSpots = retakeRes.status === "fulfilled" ? retakeRes.value : null;
  const pulses = pulsesRes.status === "fulfilled" ? (pulsesRes.value.data ?? []) : [];

  if (!diag) {
    throw new Error(`[health/collect] diagnostic ${diagnosticId} não encontrado`);
  }

  const cycleDay = cycleDayFrom(diag.created_at);
  const diagnosticSpots = diag.spot_summaries ?? [];
  const tasksExpected = tasksExpectedFor(plan, cycleDay);
  const tasksChecked = Math.min(
    tasksExpected,
    (plan?.progress?.checkedTaskIds ?? []).length
  );

  return {
    diagnosticId: diag.id,
    cycleDay,
    diagnosticSpots,
    retakeSpots,
    roiBaseline: diag.roi_baseline,
    roi30d: diag.sharkscope_summary?.avgRoi ?? null,
    tasksChecked,
    tasksExpected,
    recentPulses: pulses.map((p) => p.emoji as PlayerState["recentPulses"][number]),
  };
}

/** Lista todos os alunos ativos (ciclo ≤ 120 dias) — usado pelo cron. */
export async function listActiveStudents(): Promise<string[]> {
  const supabase = service();
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("reglife_diagnostic_results")
    .select("id, created_at")
    .gte("created_at", cutoff);
  return (data ?? []).map((r) => r.id);
}
```

- [ ] **Step 7.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 7.3: Commit**

```bash
git add lib/health/collect.ts
git commit -m "feat(health): collect PlayerState (Promise.allSettled, falha-tolerante)"
```

---

### Task 8: Persistência + detecção de deltas

**Files:**
- Create: `lib/health/snapshot.ts`

- [ ] **Step 8.1: Implementar**

```ts
/**
 * lib/health/snapshot.ts — Persiste HealthScore do dia e devolve os deltas.
 *
 * Insere/atualiza 1 row em player_health_snapshots (PK: diagnostic_id + day).
 * Compara com o snapshot do dia anterior pra detectar:
 *   - band change  (ex: yellow → orange)
 *   - leaks fechados novos (delta de leaksClosed)
 *
 * Devolve um `SnapshotDiff` que o cron usa pra decidir quais triggers disparar.
 */

import { createClient } from "@supabase/supabase-js";
import type { HealthScore } from "./types";

export interface SnapshotDiff {
  /** Mudou de faixa? null no primeiro snapshot da história do aluno. */
  bandChange: { from: HealthScore["band"]; to: HealthScore["band"] } | null;
  /** Quantos leaks fecharam HOJE (≥1 → dispara trigger leak_closed). */
  newlyClosedCount: number;
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function today(): string {
  // Data no fuso UTC pra coincidir com o cron diário 06h local (ok mesmo
  // se o aluno for de fuso diferente — snapshot é por dia UTC).
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function persistSnapshot(
  diagnosticId: string,
  score: HealthScore
): Promise<SnapshotDiff> {
  const supabase = service();
  const day = today();

  // Pega o snapshot mais recente ANTES de inserir o de hoje
  const { data: prev } = await supabase
    .from("player_health_snapshots")
    .select("band, breakdown")
    .eq("diagnostic_id", diagnosticId)
    .lt("day", day)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle<{ band: HealthScore["band"]; breakdown: HealthScore["breakdown"] }>();

  // Upsert do snapshot de hoje
  const row = {
    diagnostic_id: diagnosticId,
    day,
    resultado: score.breakdown.resultado,
    leak_score: score.breakdown.leakScore,
    roi_score: score.breakdown.roiScore,
    conclusao: score.breakdown.conclusao,
    sentimento: score.breakdown.sentimento,
    health: score.health,
    band: score.band,
    breakdown: score.breakdown,
  };
  const { error } = await supabase
    .from("player_health_snapshots")
    .upsert(row, { onConflict: "diagnostic_id,day" });
  if (error) throw new Error(`[health/snapshot] upsert: ${error.message}`);

  // Diff
  const bandChange =
    prev && prev.band !== score.band ? { from: prev.band, to: score.band } : null;
  const newlyClosedCount =
    score.breakdown.leaksClosed - (prev?.breakdown?.leaksClosed ?? 0);

  return {
    bandChange,
    newlyClosedCount: Math.max(0, newlyClosedCount),
  };
}

export { yesterday }; // exportado pra testes futuros
```

- [ ] **Step 8.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 8.3: Commit**

```bash
git add lib/health/snapshot.ts
git commit -m "feat(health): persistência diária + diff (band change + leaks fechados)"
```

---

### Task 9: Estender NotificationKind + EvTrigger

**Files:**
- Modify: `lib/notify.ts` (linha 15-25)
- Modify: `lib/ev-voice.ts` (linha 36-46 + 199-211)

- [ ] **Step 9.1: Antes de mexer em rotas, ler a doc do Next 16**

```bash
ls node_modules/next/dist/docs/ 2>/dev/null | head
```

Se a pasta existir, ler o índice. Para esta task não tocamos em rota — só em `lib/`. Mas a leitura serve pra próximas tasks.

- [ ] **Step 9.2: Editar `lib/notify.ts`**

Localizar (linha ~15-25):
```ts
export type NotificationKind =
  | "post_session"
  | "streak_risk"
  | "quest_assigned"
  | "quest_done"
  | "quest_expiring"
  | "drop_active"
  | "badge_unlocked"
  | "leak_alert"
  | "phase_transition"
  | "plan_delivered";
```

Substituir por:
```ts
export type NotificationKind =
  | "post_session"
  | "streak_risk"
  | "quest_assigned"
  | "quest_done"
  | "quest_expiring"
  | "drop_active"
  | "badge_unlocked"
  | "leak_alert"
  | "leak_closed"
  | "phase_transition"
  | "plan_delivered"
  | "daily_checkin"
  | "weekly_review"
  | "health_band_change";
```

- [ ] **Step 9.3: Editar `lib/ev-voice.ts` (tipo EvTrigger, linha ~36)**

Substituir o bloco `export type EvTrigger = ...` por:

```ts
export type EvTrigger =
  | "post_session"
  | "monthly_close"
  | "quest_done"
  | "quest_assigned"
  | "badge_unlocked"
  | "drop_active"
  | "streak_risk"
  | "leak_alert"
  | "leak_closed"
  | "phase_transition"
  | "comeback"
  | "daily_checkin"
  | "weekly_review"
  | "health_band_change";
```

- [ ] **Step 9.4: Editar `lib/ev-voice.ts` (mapa `triggerHumanLabel`, linha ~199)**

Substituir o objeto `m` dentro de `triggerHumanLabel` por:

```ts
const m: Record<EvTrigger, string> = {
  post_session: "Pós-sessão — torneios novos detectados pelo SharkScope.",
  monthly_close: "Fechamento de mês — resumo do mês que acabou.",
  quest_done: "Aluno fechou a quest semanal.",
  quest_assigned: "Quest da semana foi criada agora.",
  badge_unlocked: "Aluno desbloqueou uma conquista.",
  drop_active: "Drop de XP 2x foi agendado.",
  streak_risk: "Streak em risco — aluno sumiu por mais de 36h.",
  leak_alert: "SharkScope mostra padrão consistente com leak do diagnóstico.",
  leak_closed: "Aluno fechou um leak — retake passou no critério (≥85% acerto, ≥10 mãos).",
  phase_transition: "Aluno mudou de fase do plano.",
  comeback: "Aluno voltou depois de >5 dias offline.",
  daily_checkin: "Check-in diário do EV (cobrança leve do plano da semana).",
  weekly_review: "Review de domingo — balanço da semana + foco da próxima.",
  health_band_change: "Health Score mudou de faixa (ex: amarelo → laranja).",
};
```

- [ ] **Step 9.5: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: 0 erros. Se houver, é porque algum lugar referencia o tipo de forma exaustiva — corrigir antes de continuar.

- [ ] **Step 9.6: Commit**

```bash
git add lib/notify.ts lib/ev-voice.ts
git commit -m "feat(notify): novos kinds e triggers (leak_closed, daily_checkin, weekly_review, health_band_change)"
```

---

### Task 10: Trigger `leak_closed`

**Files:**
- Create: `lib/triggers/leakClosed.ts`

- [ ] **Step 10.1: Implementar**

```ts
/**
 * lib/triggers/leakClosed.ts — Dispara notificação quando o aluno fecha
 * um (ou mais) leaks no retake. Chamado pelo cron de health-score.
 *
 * Throttle: 24h entre disparos do mesmo aluno (anti double-fire em
 * re-runs do cron). force=true ignora quiet hours porque é celebratório
 * e perde valor se atrasado.
 */

import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

export async function fireLeakClosed(args: {
  diagnosticId: string;
  newlyClosedCount: number;
  totalClosed: number;
  totalLeaks: number;
}): Promise<"fired" | "throttled" | "noop"> {
  if (args.newlyClosedCount <= 0) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "leak_closed", 24)) {
    return "throttled";
  }

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "leak_closed",
    trigger: "leak_closed",
    title: args.newlyClosedCount === 1
      ? "🎯 Leak fechado"
      : `🎯 ${args.newlyClosedCount} leaks fechados`,
    facts: {
      fechados_hoje: args.newlyClosedCount,
      total_fechados: args.totalClosed,
      total_leaks_originais: args.totalLeaks,
      progresso_de_fechamento: `${args.totalClosed}/${args.totalLeaks}`,
    },
    fallback:
      args.newlyClosedCount === 1
        ? `Você fechou 1 leak no retake (${args.totalClosed}/${args.totalLeaks}). Próximo alvo?`
        : `Você fechou ${args.newlyClosedCount} leaks no retake (${args.totalClosed}/${args.totalLeaks}). Próximo alvo?`,
    force: true,
  });

  return "fired";
}
```

- [ ] **Step 10.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 10.3: Commit**

```bash
git add lib/triggers/leakClosed.ts
git commit -m "feat(triggers): leak_closed — celebra leaks fechados no retake"
```

---

### Task 11: Trigger `health_band_change`

**Files:**
- Create: `lib/triggers/healthBandChange.ts`

- [ ] **Step 11.1: Implementar**

```ts
/**
 * lib/triggers/healthBandChange.ts — Dispara quando o Health Score muda
 * de faixa. Chamado pelo cron de health-score após detectar diff.
 *
 * Regras:
 *   - Sobe (red→orange, orange→yellow, yellow→green) → tom positivo, sem force.
 *   - Desce (green→yellow, yellow→orange, orange→red) → tom de check, force=true
 *     pra atravessar quiet hours quando vai pra laranja/vermelho (sinal de alerta).
 *   - Throttle: 48h (evita ping-pong de faixa).
 */

import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

type Band = "green" | "yellow" | "orange" | "red";

const ORDER: Band[] = ["red", "orange", "yellow", "green"];

function isImprovement(from: Band, to: Band): boolean {
  return ORDER.indexOf(to) > ORDER.indexOf(from);
}

export async function fireHealthBandChange(args: {
  diagnosticId: string;
  from: Band;
  to: Band;
  health: number;
}): Promise<"fired" | "throttled" | "noop"> {
  if (args.from === args.to) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "health_band_change", 48)) {
    return "throttled";
  }

  const improved = isImprovement(args.from, args.to);
  const forceWhenWorrying = !improved && (args.to === "orange" || args.to === "red");

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "health_band_change",
    trigger: "health_band_change",
    title: improved
      ? `📈 Saúde subiu pra ${args.to}`
      : `⚠️ Saúde caiu pra ${args.to}`,
    facts: {
      direcao: improved ? "subida" : "descida",
      faixa_anterior: args.from,
      faixa_nova: args.to,
      health_score_atual: args.health.toFixed(0),
    },
    fallback: improved
      ? `Seu indicador subiu de ${args.from} pra ${args.to} (HS ${args.health.toFixed(0)}). Mantém o que tá funcionando.`
      : `Indicador caiu de ${args.from} pra ${args.to} (HS ${args.health.toFixed(0)}). O que tá pesando?`,
    force: forceWhenWorrying,
  });

  return "fired";
}
```

- [ ] **Step 11.2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 11.3: Commit**

```bash
git add lib/triggers/healthBandChange.ts
git commit -m "feat(triggers): health_band_change — alerta quando faixa muda"
```

---

### Task 12: Cron de Health Score

**Files:**
- Create: `app/api/cron/health-score/route.ts`

- [ ] **Step 12.1: Ler doc do Next 16 pra rota cron**

```bash
ls node_modules/next/dist/docs/ 2>/dev/null
```

Se houver arquivo sobre route handlers / cron, ler antes de escrever. (Esta versão do Next.js tem breaking changes — `AGENTS.md` deixa isso explícito.)

- [ ] **Step 12.2: Implementar**

```ts
/**
 * GET /api/cron/health-score
 *
 * Cron diário (06h UTC, antes do daily-pulse das 21h UTC). Para cada aluno
 * ativo (ciclo ≤ 120d):
 *   1. Coleta PlayerState (lib/health/collect.ts)
 *   2. Calcula HealthScore (lib/health/score.ts)
 *   3. Persiste snapshot do dia + detecta diff (lib/health/snapshot.ts)
 *   4. Se newlyClosedCount ≥ 1 → fireLeakClosed
 *   5. Se bandChange ≠ null → fireHealthBandChange
 *
 * Falha em um aluno não bloqueia os outros — coleta erros num array
 * e devolve no JSON final pra investigação no log do Vercel.
 *
 * Auth: Bearer ${CRON_SECRET} (header) ou ?secret=... (query, só dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { collectPlayerState, listActiveStudents } from "@/lib/health/collect";
import { computeHealth } from "@/lib/health/score";
import { persistSnapshot } from "@/lib/health/snapshot";
import { fireLeakClosed } from "@/lib/triggers/leakClosed";
import { fireHealthBandChange } from "@/lib/triggers/healthBandChange";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Outcome {
  diagnosticId: string;
  ok: boolean;
  health?: number;
  band?: string;
  bandChanged?: string;
  leakClosed?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await listActiveStudents();
  const outcomes: Outcome[] = [];

  for (const id of ids) {
    try {
      const state = await collectPlayerState(id);
      const score = computeHealth(state);
      const diff = await persistSnapshot(id, score);

      let leakClosed = 0;
      if (diff.newlyClosedCount > 0) {
        const r = await fireLeakClosed({
          diagnosticId: id,
          newlyClosedCount: diff.newlyClosedCount,
          totalClosed: score.breakdown.leaksClosed,
          totalLeaks: score.breakdown.leaksTotal,
        });
        if (r === "fired") leakClosed = diff.newlyClosedCount;
      }

      let bandChanged: string | undefined;
      if (diff.bandChange) {
        const r = await fireHealthBandChange({
          diagnosticId: id,
          from: diff.bandChange.from,
          to: diff.bandChange.to,
          health: score.health,
        });
        if (r === "fired") {
          bandChanged = `${diff.bandChange.from}->${diff.bandChange.to}`;
        }
      }

      outcomes.push({
        diagnosticId: id,
        ok: true,
        health: score.health,
        band: score.band,
        bandChanged,
        leakClosed,
      });
    } catch (err) {
      console.error(`[cron/health-score] ${id}:`, err);
      outcomes.push({
        diagnosticId: id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: ids.length,
    succeeded: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    band_changes: outcomes.filter((o) => o.bandChanged).length,
    leaks_closed_fired: outcomes.filter((o) => (o.leakClosed ?? 0) > 0).length,
    failures: outcomes.filter((o) => !o.ok),
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}
```

- [ ] **Step 12.3: Build local**

```bash
npm run build
```

Esperado: build OK, sem erros de tipo. Se quebrar, ler a mensagem — o Next 16 pode ter mudado a assinatura de route handlers.

- [ ] **Step 12.4: Smoke local**

Subir `npm run dev` em outro terminal, depois:
```bash
curl -s "http://localhost:3000/api/cron/health-score?secret=$CRON_SECRET" | head -100
```
Esperado: JSON `{ ok: true, total: N, succeeded: N, ... }`. Se `total=0`, é porque o banco de dev não tem aluno com `created_at` nos últimos 120 dias — criar um e re-rodar, ou seguir confiando que a query funciona.

- [ ] **Step 12.5: Adicionar ao `vercel.json` se houver**

```bash
cat vercel.json 2>/dev/null
```

Se o arquivo existir e listar outros crons, adicionar:
```json
{ "path": "/api/cron/health-score", "schedule": "0 6 * * *" }
```
(Se não existir, registrar em CRON manual depois.)

- [ ] **Step 12.6: Commit**

```bash
git add app/api/cron/health-score/route.ts vercel.json 2>/dev/null
git commit -m "feat(cron): health-score diário com detecção de leak_closed + band_change"
```

---

### Task 13: Trigger `daily_checkin`

**Files:**
- Create: `lib/triggers/dailyCheckin.ts`
- Modify: `app/api/cron/daily-pulse/route.ts` (adicionar chamada por aluno)

- [ ] **Step 13.1: Implementar `lib/triggers/dailyCheckin.ts`**

```ts
/**
 * lib/triggers/dailyCheckin.ts — Check-in diário do EV (cobrança leve).
 *
 * Regras desta Fase A (cadência ainda não existe — Fase C plugará):
 *   - Roda em dia útil (seg-sex local).
 *   - Pula se aluno teve atividade nas últimas 18h (ele já tá no ritmo).
 *   - Pula se já mandou daily_checkin nas últimas 20h.
 *   - Não usa force — respeita quiet hours.
 */

import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** True se hoje (em UTC, suficiente pra escala atual) é seg-sex. */
function isWeekday(): boolean {
  const d = new Date().getUTCDay(); // 0=dom, 6=sab
  return d >= 1 && d <= 5;
}

async function lastActivityHours(diagnosticId: string): Promise<number | null> {
  const supabase = service();
  const { data } = await supabase
    .from("diagnostic_activity")
    .select("created_at")
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ts = new Date((data as { created_at: string }).created_at).getTime();
  return (Date.now() - ts) / 3_600_000;
}

export async function fireDailyCheckin(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
  tasksChecked: number;
  tasksExpected: number;
}): Promise<"fired" | "throttled" | "noop"> {
  if (!isWeekday()) return "noop";

  const hours = await lastActivityHours(args.diagnosticId);
  if (hours !== null && hours < 18) return "noop";

  if (await hasNotificationRecently(args.diagnosticId, "daily_checkin", 20)) {
    return "throttled";
  }

  const aderencia =
    args.tasksExpected > 0
      ? `${args.tasksChecked}/${args.tasksExpected}`
      : "ainda sem tasks";

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "daily_checkin",
    trigger: "daily_checkin",
    title: "Bate aqui rapidinho",
    facts: {
      dia_do_ciclo: args.cycleDay,
      fase_atual: args.currentPhase,
      aderencia_tasks: aderencia,
      horas_sem_atividade: hours !== null ? Math.round(hours) : "n/a",
    },
    fallback: `Dia ${args.cycleDay}/90 — ${args.currentPhase}. ${aderencia} tasks. O que falta pra fechar essa semana?`,
  });

  return "fired";
}
```

- [ ] **Step 13.2: Integrar no `daily-pulse`**

Abrir `app/api/cron/daily-pulse/route.ts`. Localizar o loop:
```ts
for (const row of (rows ?? []) as DiagRow[]) {
  const streakHandled = await maybeStreakRisk(row);
  ...
}
```

Adicionar uma chamada nova depois de `maybePhaseTransition`:

```ts
for (const row of (rows ?? []) as DiagRow[]) {
  const streakHandled = await maybeStreakRisk(row);
  if (streakHandled === "fired") stats.streak_risk += 1;
  else if (streakHandled === "throttled") stats.skipped += 1;

  const phaseHandled = await maybePhaseTransition(row);
  if (phaseHandled === "fired") stats.phase_transition += 1;
  else if (phaseHandled === "throttled") stats.skipped += 1;

  const checkinHandled = await maybeDailyCheckin(row);   // NOVO
  if (checkinHandled === "fired") stats.daily_checkin += 1;
  else if (checkinHandled === "throttled") stats.skipped += 1;

  const weeklyHandled = await maybeWeeklyReview(row);    // Task 14
  if (weeklyHandled === "fired") stats.weekly_review += 1;
  else if (weeklyHandled === "throttled") stats.skipped += 1;
}
```

E adicionar ao `stats`:
```ts
const stats = {
  total: rows?.length ?? 0,
  streak_risk: 0,
  phase_transition: 0,
  daily_checkin: 0,    // NOVO
  weekly_review: 0,    // NOVO
  skipped: 0,
};
```

Adicionar `maybeDailyCheckin` no fim do arquivo (entre `maybePhaseTransition` e `isAuthorized`):

```ts
// ---------------------------------------------------------------------------
// Daily check-in (seg-sex)
// ---------------------------------------------------------------------------
async function maybeDailyCheckin(
  row: DiagRow
): Promise<"fired" | "throttled" | "noop"> {
  // Coleta dados mínimos pro check-in (sem health-score; isso é trigger temporal)
  const cycleDay =
    Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000) + 1;
  const phase =
    cycleDay <= 30 ? "Fase 1 — Fundamentos"
    : cycleDay <= 60 ? "Fase 2 — Aplicação"
    : "Fase 3 — Integração";

  // Conta tasks marcadas vs esperadas (lookup leve, sem usar collect.ts)
  const supabase = service();
  const { data: plan } = await supabase
    .from("plans")
    .select("data")
    .eq("diagnostic_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const data = (plan?.data as { phases?: Array<{ tasks?: unknown[] }>; progress?: { checkedTaskIds?: string[] } } | null) ?? null;
  const phasesPassed = cycleDay <= 30 ? 1 : cycleDay <= 60 ? 2 : 3;
  const tasksExpected = (data?.phases ?? []).slice(0, phasesPassed)
    .reduce((acc, p) => acc + (p.tasks?.length ?? 0), 0);
  const tasksChecked = Math.min(tasksExpected, (data?.progress?.checkedTaskIds ?? []).length);

  return fireDailyCheckin({
    diagnosticId: row.id,
    playerName: row.player_name,
    cycleDay,
    currentPhase: phase,
    tasksChecked,
    tasksExpected,
  });
}
```

Adicionar o import no topo de `daily-pulse/route.ts`:
```ts
import { fireDailyCheckin } from "@/lib/triggers/dailyCheckin";
import { fireWeeklyReview } from "@/lib/triggers/weeklyReview";  // pré-importa pra Task 14
```

- [ ] **Step 13.3: Build local**

```bash
npm run build
```
(Vai dar erro porque `fireWeeklyReview` ainda não existe — adiar build até Task 14. **Não commitar com erro.** Comente o import de `fireWeeklyReview` + a chamada `maybeWeeklyReview` por enquanto, descomenta na Task 14.)

- [ ] **Step 13.4: Commit**

```bash
git add lib/triggers/dailyCheckin.ts app/api/cron/daily-pulse/route.ts
git commit -m "feat(triggers): daily_checkin — bate-papo de plano seg-sex"
```

---

### Task 14: Trigger `weekly_review`

**Files:**
- Create: `lib/triggers/weeklyReview.ts`
- Modify: `app/api/cron/daily-pulse/route.ts` (descomenta integração)

- [ ] **Step 14.1: Implementar `lib/triggers/weeklyReview.ts`**

```ts
/**
 * lib/triggers/weeklyReview.ts — Review de domingo do EV.
 *
 * Roda só DOMINGO (UTC; suficiente pra escala atual, refina na Fase C
 * com timezone do aluno). Faz um balanço numérico simples:
 *   - tasks marcadas na semana
 *   - dia do ciclo + fase atual
 *   - SharkScope summary (se houver)
 *
 * Throttle: 6 dias (não repete em re-runs do mesmo domingo).
 */

import { createClient } from "@supabase/supabase-js";
import { hasNotificationRecently, sendEvNotification } from "@/lib/notify";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

export async function fireWeeklyReview(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
}): Promise<"fired" | "throttled" | "noop"> {
  if (!isSunday()) return "noop";
  if (await hasNotificationRecently(args.diagnosticId, "weekly_review", 24 * 6)) {
    return "throttled";
  }

  const supabase = service();

  // Tasks marcadas nos últimos 7 dias (via diagnostic_activity)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count: tasksWeek } = await supabase
    .from("diagnostic_activity")
    .select("*", { count: "exact", head: true })
    .eq("diagnostic_id", args.diagnosticId)
    .eq("event_type", "task_checked")
    .gte("created_at", sevenDaysAgo);

  // SharkScope summary atual
  const { data: diag } = await supabase
    .from("reglife_diagnostic_results")
    .select("sharkscope_summary")
    .eq("id", args.diagnosticId)
    .single();
  const ss = (diag?.sharkscope_summary as { entries?: number; avgRoi?: number; itm?: number } | null) ?? null;

  await sendEvNotification({
    diagnosticId: args.diagnosticId,
    kind: "weekly_review",
    trigger: "weekly_review",
    title: "Domingo é review",
    facts: {
      dia_do_ciclo: args.cycleDay,
      fase: args.currentPhase,
      tasks_nesta_semana: tasksWeek ?? 0,
      sharkscope_torneios_acumulado: ss?.entries ?? "n/a",
      sharkscope_roi_acumulado: ss?.avgRoi != null ? `${ss.avgRoi.toFixed(1)}%` : "n/a",
    },
    fallback: `Semana fechou. ${tasksWeek ?? 0} tasks marcadas, dia ${args.cycleDay}/90. Onde foi o foco e onde travou?`,
  });

  return "fired";
}
```

- [ ] **Step 14.2: Descomentar integração no `daily-pulse`**

No `app/api/cron/daily-pulse/route.ts`, garantir que estes blocos estejam ativos:

```ts
// (no topo)
import { fireWeeklyReview } from "@/lib/triggers/weeklyReview";

// (no loop)
const weeklyHandled = await maybeWeeklyReview(row);
if (weeklyHandled === "fired") stats.weekly_review += 1;
else if (weeklyHandled === "throttled") stats.skipped += 1;
```

Adicionar `maybeWeeklyReview` no fim do arquivo:

```ts
// ---------------------------------------------------------------------------
// Weekly review (domingo)
// ---------------------------------------------------------------------------
async function maybeWeeklyReview(
  row: DiagRow
): Promise<"fired" | "throttled" | "noop"> {
  const cycleDay =
    Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000) + 1;
  const phase =
    cycleDay <= 30 ? "Fase 1 — Fundamentos"
    : cycleDay <= 60 ? "Fase 2 — Aplicação"
    : "Fase 3 — Integração";

  return fireWeeklyReview({
    diagnosticId: row.id,
    playerName: row.player_name,
    cycleDay,
    currentPhase: phase,
  });
}
```

- [ ] **Step 14.3: Build local**

```bash
npm run build
```
Esperado: build OK.

- [ ] **Step 14.4: Smoke local do daily-pulse**

```bash
curl -s "http://localhost:3000/api/cron/daily-pulse?secret=$CRON_SECRET" | head
```
Esperado: JSON com `daily_checkin` e `weekly_review` no payload (valores podem ser 0 dependendo do dia/condição).

- [ ] **Step 14.5: Commit**

```bash
git add lib/triggers/weeklyReview.ts app/api/cron/daily-pulse/route.ts
git commit -m "feat(triggers): weekly_review — review de domingo no daily-pulse"
```

---

### Task 15: Rota admin de saúde

**Files:**
- Create: `app/api/admin/health/route.ts`

- [ ] **Step 15.1: Implementar**

```ts
/**
 * GET /api/admin/health
 *
 * Lista o snapshot MAIS RECENTE de cada aluno + alguns metadados pra alimentar
 * a aba "Saúde" no admin. Devolve só o que a UI precisa — sem breakdown.
 *
 * Sem auth dedicado: o `/admin` hoje confia no `/api/results` que é protegido
 * por session no middleware (mesma convenção). Mantemos.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface Row {
  diagnostic_id: string;
  day: string;
  health: number;
  band: "green" | "yellow" | "orange" | "red";
  breakdown: { leaksClosed?: number; leaksTotal?: number } | null;
  reglife_diagnostic_results: {
    player_name: string;
    created_at: string;
  } | null;
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // PostgREST: distinct ON via order + limit emulado por subquery não é trivial.
  // Estratégia simples e correta: trazer os últimos 30 dias e dedup por
  // diagnostic_id no lado do JS (volume baixo, pesa pouco).
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("player_health_snapshots")
    .select("diagnostic_id, day, health, band, breakdown, reglife_diagnostic_results(player_name, created_at)")
    .gte("day", cutoff)
    .order("day", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latest = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!latest.has(r.diagnostic_id)) latest.set(r.diagnostic_id, r);
  }

  const out = Array.from(latest.values()).map((r) => ({
    diagnosticId: r.diagnostic_id,
    playerName: r.reglife_diagnostic_results?.player_name ?? "?",
    cycleDay: r.reglife_diagnostic_results?.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(r.reglife_diagnostic_results.created_at).getTime()) / 86_400_000) + 1)
      : null,
    day: r.day,
    health: Number(r.health),
    band: r.band,
    leaksClosed: r.breakdown?.leaksClosed ?? 0,
    leaksTotal: r.breakdown?.leaksTotal ?? 0,
  }));

  // Pior primeiro (red → orange → yellow → green)
  const orderRank: Record<string, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
  out.sort((a, b) => {
    const da = orderRank[a.band] - orderRank[b.band];
    return da !== 0 ? da : a.health - b.health;
  });

  // KPIs agregados
  const kpis = {
    total: out.length,
    by_band: {
      red: out.filter((r) => r.band === "red").length,
      orange: out.filter((r) => r.band === "orange").length,
      yellow: out.filter((r) => r.band === "yellow").length,
      green: out.filter((r) => r.band === "green").length,
    },
    avg_health: out.length > 0
      ? Number((out.reduce((s, r) => s + r.health, 0) / out.length).toFixed(1))
      : null,
  };

  return NextResponse.json({ kpis, rows: out });
}
```

- [ ] **Step 15.2: Build local**

```bash
npm run build
```
Esperado: OK. Se Next 16 reclamar de tipo `reglife_diagnostic_results` no select, simplificar a query: dois selects separados (snapshots + nomes) e join no JS.

- [ ] **Step 15.3: Smoke local**

```bash
curl -s "http://localhost:3000/api/admin/health" | head
```
Esperado: JSON `{ kpis: {...}, rows: [...] }`. Vazio é OK enquanto o cron da Task 12 não rodou no banco de dev.

- [ ] **Step 15.4: Commit**

```bash
git add app/api/admin/health/route.ts
git commit -m "feat(admin): rota /api/admin/health — KPIs + tabela ordenada por pior"
```

---

### Task 16: UI da aba "Saúde" no admin

**Files:**
- Create: `components/admin/HealthTable.tsx`
- Modify: `app/admin/page.tsx` (adiciona tabs e mostra HealthTable)

- [ ] **Step 16.1: Implementar `components/admin/HealthTable.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Band = "red" | "orange" | "yellow" | "green";

interface HealthRow {
  diagnosticId: string;
  playerName: string;
  cycleDay: number | null;
  day: string;
  health: number;
  band: Band;
  leaksClosed: number;
  leaksTotal: number;
}

interface Kpis {
  total: number;
  by_band: Record<Band, number>;
  avg_health: number | null;
}

const BAND_BG: Record<Band, string> = {
  red:    "bg-red-500/20    text-red-300",
  orange: "bg-orange-500/20 text-orange-300",
  yellow: "bg-yellow-500/20 text-yellow-300",
  green:  "bg-emerald-500/20 text-emerald-300",
};

const BAND_LABEL: Record<Band, string> = {
  red: "Vermelho", orange: "Laranja", yellow: "Amarelo", green: "Verde",
};

export function HealthTable() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bandFilter, setBandFilter] = useState<Band | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setRows(data.rows ?? []);
        setKpis(data.kpis ?? null);
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (bandFilter !== "all" && r.band !== bandFilter) return false;
    if (search && !r.playerName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <p className="text-sm text-zinc-400">Carregando saúde da turma…</p>;
  if (error)   return <p className="text-sm text-red-400">Erro: {error}</p>;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="HS médio" value={kpis.avg_health ?? "—"} />
          <Kpi label="Verde" value={kpis.by_band.green} className="text-emerald-400" />
          <Kpi label="Amarelo" value={kpis.by_band.yellow} className="text-yellow-400" />
          <Kpi label="Laranja" value={kpis.by_band.orange} className="text-orange-400" />
          <Kpi label="Vermelho" value={kpis.by_band.red} className="text-red-400" />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={bandFilter}
          onChange={(e) => setBandFilter(e.target.value as Band | "all")}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
        >
          <option value="all">Todas as faixas</option>
          <option value="red">Vermelho</option>
          <option value="orange">Laranja</option>
          <option value="yellow">Amarelo</option>
          <option value="green">Verde</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome…"
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm flex-1 max-w-xs"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 text-left">
            <tr>
              <th className="py-2">Aluno</th>
              <th className="py-2">HS</th>
              <th className="py-2">Faixa</th>
              <th className="py-2">Leaks</th>
              <th className="py-2">Ciclo</th>
              <th className="py-2">Atualizado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.diagnosticId} className="border-t border-zinc-800">
                <td className="py-2">{r.playerName}</td>
                <td className="py-2 font-mono">{r.health.toFixed(0)}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${BAND_BG[r.band]}`}>
                    {BAND_LABEL[r.band]}
                  </span>
                </td>
                <td className="py-2 font-mono">
                  {r.leaksClosed}/{r.leaksTotal}
                </td>
                <td className="py-2">{r.cycleDay ?? "—"}/90</td>
                <td className="py-2 text-zinc-500">{r.day}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/resultado/${r.diagnosticId}`}
                    className="text-emerald-400 hover:underline"
                  >
                    abrir →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500">
                  Sem alunos nessa faixa ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-semibold ${className}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 16.2: Adicionar aba no `app/admin/page.tsx`**

Localizar o início do componente `AdminPage` e adicionar um state `tab` no início da função:

```ts
const [tab, setTab] = useState<"leads" | "health">("leads");
```

Adicionar o import no topo:
```ts
import { HealthTable } from "@/components/admin/HealthTable";
```

Logo após o `<h1>` (procurar o Logo / título da página), inserir as abas:

```tsx
<div className="flex gap-2 border-b border-zinc-800 mb-6">
  <button
    onClick={() => setTab("leads")}
    className={`px-3 py-2 text-sm ${tab === "leads" ? "border-b-2 border-emerald-400 text-emerald-300" : "text-zinc-400"}`}
  >
    Leads
  </button>
  <button
    onClick={() => setTab("health")}
    className={`px-3 py-2 text-sm ${tab === "health" ? "border-b-2 border-emerald-400 text-emerald-300" : "text-zinc-400"}`}
  >
    Saúde da turma
  </button>
</div>

{tab === "health" ? (
  <HealthTable />
) : (
  /* todo o conteúdo de leads que já existia fica aqui dentro */
  <div>{/* … código existente preservado … */}</div>
)}
```

(Importante: **não apagar** o código de leads. Envelopar o existente no `else`.)

- [ ] **Step 16.3: Build local**

```bash
npm run build
```

- [ ] **Step 16.4: Smoke visual**

`npm run dev`, abrir `http://localhost:3000/admin`, clicar em "Saúde da turma". Esperado: a aba carrega, mostra "Sem alunos nessa faixa ainda" se o banco estiver vazio.

- [ ] **Step 16.5: Commit**

```bash
git add components/admin/HealthTable.tsx app/admin/page.tsx
git commit -m "feat(admin): aba Saúde da turma com KPIs, filtros e tabela"
```

---

### Task 17: Smoke end-to-end + push

**Files:** nenhum modificado — só verificação.

- [ ] **Step 17.1: Rodar cron de health-score local**

`npm run dev`, então:
```bash
curl -s "http://localhost:3000/api/cron/health-score?secret=$CRON_SECRET" | python -m json.tool 2>/dev/null || curl -s "http://localhost:3000/api/cron/health-score?secret=$CRON_SECRET"
```

Esperado: JSON com `succeeded` ≥ 1 (se houver aluno no banco). Erros listados em `failures` devem ser investigados (provavelmente faltam dados — `roi_baseline` null é normal nesta fase).

- [ ] **Step 17.2: Conferir snapshot no banco**

No SQL Editor:
```sql
select diagnostic_id, day, health, band, breakdown->>'leaksClosed' as fechados
from player_health_snapshots
order by day desc, health asc
limit 10;
```
Esperado: pelo menos 1 linha com `day = CURRENT_DATE`.

- [ ] **Step 17.3: Conferir UI**

`http://localhost:3000/admin` → aba "Saúde". KPIs preenchidos, tabela com pelo menos 1 linha, ordenada com pior banda no topo.

- [ ] **Step 17.4: Rodar `daily-pulse` local pra ver os novos triggers**

```bash
curl -s "http://localhost:3000/api/cron/daily-pulse?secret=$CRON_SECRET"
```
Esperado: JSON com `daily_checkin` e `weekly_review` no payload. Valor `0` é OK se não for seg-sex / domingo.

- [ ] **Step 17.5: Push**

```bash
git push origin onboarding-ev
```

- [ ] **Step 17.6: Verificação pós-deploy (Vercel)**

Após o deploy, no Vercel:
1. Adicionar `/api/cron/health-score` à lista de Cron Jobs com schedule `0 6 * * *` (se ainda não estiver em `vercel.json`).
2. Disparar manualmente via "Run" pra forçar o primeiro snapshot na prod.
3. Conferir que `player_health_snapshots` ganhou linhas em produção.

---

## Self-review (rodar quando todas as tasks estiverem concluídas)

**Cobertura vs. spec (Fase A):**
- [x] Tabela `player_health_snapshots` — Task 1
- [x] Tabela `pulse_responses` — Task 1 (criada nesta fase, usada na Fase C)
- [x] Colunas `notify_cadence`, `roi_baseline`, `email_for_notify` — Task 1
- [x] `lib/health/score.ts` + critério leak fechado + redistribuição de pesos — Tasks 2-6
- [x] `lib/health/collect.ts` + `snapshot.ts` — Tasks 7-8
- [x] Cron `health-score` — Task 12
- [x] Triggers `leak_closed`, `health_band_change` — Tasks 10, 11
- [x] Triggers `daily_checkin`, `weekly_review` — Tasks 13, 14
- [x] `NotificationKind` e `EvTrigger` estendidos — Task 9
- [x] Dashboard admin (KPIs + tabela ordenada) — Tasks 15, 16
- [ ] `badge_unlocked` ligado a evento real — **fora do escopo da Fase A**, fica para a Fase C (precisa achar onde XP/badge é desbloqueado no código atual).

**Itens NÃO entregues nesta fase (esperado, conforme spec):**
- Email sender (Resend) → Fase B
- Templates de email → Fase B
- Cadence settings UI (leve/ritmada/intensa) → Fase C
- Pulse semanal (envio + UI) → Fase C
- HS visível no `/meu-plano` pro aluno → Fase C
- Ajustes em `post_session`/`leak_alert` (eles já existem no sharkscope-sync) → Fase C

**Pontos de atenção:**
- O `daily_checkin` e `weekly_review` rodam em **dia UTC**, não no fuso do aluno. Aceitável pra Fase A; Fase C refina com `timezone` por aluno.
- O cron `health-score` roda às **06h UTC** (3h BRT). Fica bom pra alunos do Brasil acordando, mas avaliar mover pra 09h UTC se a maioria for fuso diferente.
- "Aluno ativo" = ciclo ≤ 120 dias. Após esse cutoff, o aluno some do health. Revisar quando alguém pedir.

---

## Próximas fases (placeholders)

- **Fase B — Email** ganha plano próprio em `docs/superpowers/plans/2026-XX-XX-coach-ia-fase-b-email.md` quando A entrar verde em produção (≥1 semana de operação sem erro no log do cron).
- **Fase C — Cadência + Pulse + UI do aluno + badge_unlocked** ganha plano próprio depois de B.
