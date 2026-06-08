# Monthly Scoreboard Health Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um 4º card "Score" no `MonthlyScoreboard` em `/meu-plano` mostrando o Health Score do aluno contra meta 75+ hardcoded.

**Architecture:** Lib pura `buildMonthlyScoreboard` ganha parâmetro `healthScore` e retorna `score: { goal, current }` no `ScoreboardData`. Endpoint `/api/plan/scoreboard/[diagnosticId]` ganha 4º SELECT em `player_health_snapshots` (mesma tolerância a erro do SharkScope). Componente `MonthlyScoreboard.tsx` ganha `ScoreCard` inline (mesmo padrão do `VolumeCard` existente) e grid passa de 3 → 4 colunas em desktop.

**Tech Stack:** Next.js App Router (TS), Supabase service-role server-side, Tailwind. Sem framework de testes — validação via `tsc`/`lint`/`build` + smoke `tsx` na lib pura + visual no dev.

**Spec base:** `docs/superpowers/specs/2026-06-02-monthly-scoreboard-health-score-design.md` (commit `1599855`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/monthlyScoreboard.ts` | **Modify** | Adicionar `score: { goal, current }` ao `ScoreboardData`. `buildMonthlyScoreboard` aceita `healthScore: number \| null` e retorna `score`. Const interna `SCORE_GOAL = 75`. |
| `app/api/plan/scoreboard/[diagnosticId]/route.ts` | **Modify** | Acrescentar 4º SELECT em `player_health_snapshots`. Extrair `healthScore` com mesma tolerância a erro usada para `sharkscope_monthly_stats`. Passar `healthScore` pra `buildMonthlyScoreboard`. |
| `components/trainer/MonthlyScoreboard.tsx` | **Modify** | Subcomponente `ScoreCard` inline. Grid passa de `sm:grid-cols-3` pra `sm:grid-cols-4`, mobile passa de `grid-cols-1` pra `grid-cols-2`. Score primeiro no JSX (antes de Spots/Volume/Mãos). |

Nenhum arquivo criado. Nenhum schema change. `HealthScoreBlock` em `/admin/resultado/[id]` inalterado.

## Sequência das tasks

1. **Task 1** — Lib pura: tipo + parâmetro + retorno do `score`.
2. **Task 2** — Endpoint: 4º SELECT + extração + passagem pra lib.
3. **Task 3** — Componente: `ScoreCard` inline + grid 4 colunas + ordem dos cards.
4. **Task 4** — Sanity check final.

Cada task termina com `tsc --noEmit` verde e um commit.

---

## Task 1 — Lib pura `buildMonthlyScoreboard` ganha `healthScore`

**Files:**
- Modify: `lib/poker/monthlyScoreboard.ts` (interface `ScoreboardData`, assinatura e body de `buildMonthlyScoreboard`)

**Por quê:** Lib pura é o ponto certo pra ancorar a regra do score (meta 75, current pass-through). Endpoint e componente passam a só transportar o valor.

- [ ] **Step 1: Adicionar `score` ao `ScoreboardData`**

Editar `lib/poker/monthlyScoreboard.ts`. A interface `ScoreboardData` atualmente tem 4 blocos. Acrescentar `score` antes de `spotProgress`:

```ts
export interface ScoreboardData {
  month: MonthMeta;
  spots: { goal: number; completed: number };
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
  hands: { goal: number; current: number | null; pending: boolean };
  score: { goal: number; current: number | null };
  spotProgress: SpotProgressEntry[];
}
```

- [ ] **Step 2: Adicionar const `SCORE_GOAL`**

Logo acima da função `buildMonthlyScoreboard` (depois dos helpers `startOfMonthUTCIso` / `startOfNextMonthUTCIso`), inserir:

```ts
/** Meta hardcoded do Health Score na v1. Vira configurável em spec futuro. */
const SCORE_GOAL = 75;
```

- [ ] **Step 3: Adicionar `healthScore` à assinatura e body**

Editar a assinatura de `buildMonthlyScoreboard` (linha ~101). De:

```ts
export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  nowIso?: string;
}): ScoreboardData {
  const { plan, trainingRows, volumeTargetWeekly, monthlyEntries, hasSharkscope } = args;
```

Para:

```ts
export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  healthScore: number | null;
  nowIso?: string;
}): ScoreboardData {
  const { plan, trainingRows, volumeTargetWeekly, monthlyEntries, hasSharkscope, healthScore } = args;
```

E no objeto retornado (linha ~155), acrescentar o campo `score` ANTES de `spotProgress`:

```ts
  return {
    month,
    spots: { goal: 3, completed: spotsCompletedThisMonth },
    volume: { goal: volumeGoal, current: monthlyEntries, hasSharkscope },
    hands: { goal: handsGoal, current: null, pending: true },
    score: { goal: SCORE_GOAL, current: healthScore },
    spotProgress,
  };
}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: erros em `app/api/plan/scoreboard/[diagnosticId]/route.ts` (callsite não passa `healthScore` ainda) — isso é esperado e a próxima task resolve. Se tiver outros erros fora desse arquivo, debugar.

Pra confirmar que o único erro é no callsite do endpoint:

```bash
npx tsc --noEmit 2>&1 | grep -v "app/api/plan/scoreboard"
```

Expected: zero output (ou apenas linhas vazias).

- [ ] **Step 5: Smoke `tsx`**

Criar `./tmp-smoke-mscoreboard-health.ts` na raiz do repo:

```ts
import { buildMonthlyScoreboard } from "./lib/poker/monthlyScoreboard";

const plan: any = {
  leaks: [
    { id: "RFI-BTN-40", label: "RFI do BTN em 40bb", pct: 60 },
  ],
};

const NOW = "2026-06-15T12:00:00Z";

// [1] healthScore null
const r1 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: null, nowIso: NOW,
});
console.log("[1]", JSON.stringify(r1.score));
// Esperado: {"goal":75,"current":null}

// [2] healthScore 0
const r2 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: 0, nowIso: NOW,
});
console.log("[2]", JSON.stringify(r2.score));
// Esperado: {"goal":75,"current":0}

// [3] healthScore 65
const r3 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: 65, nowIso: NOW,
});
console.log("[3]", JSON.stringify(r3.score));
// Esperado: {"goal":75,"current":65}

// [4] healthScore 75
const r4 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: 75, nowIso: NOW,
});
console.log("[4]", JSON.stringify(r4.score));
// Esperado: {"goal":75,"current":75}

// [5] healthScore 90
const r5 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: 90, nowIso: NOW,
});
console.log("[5]", JSON.stringify(r5.score));
// Esperado: {"goal":75,"current":90}

// [6] healthScore 100
const r6 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: null, monthlyEntries: null,
  hasSharkscope: false, healthScore: 100, nowIso: NOW,
});
console.log("[6]", JSON.stringify(r6.score));
// Esperado: {"goal":75,"current":100}

// [7] outros campos seguem intactos quando healthScore presente
const r7 = buildMonthlyScoreboard({
  plan, trainingRows: [], volumeTargetWeekly: 100, monthlyEntries: 50,
  hasSharkscope: true, healthScore: 80, nowIso: NOW,
});
console.log("[7] month=", JSON.stringify(r7.month));
// Esperado: {"year":2026,"month":6,"label":"junho"}
console.log("[7] spots=", JSON.stringify(r7.spots));
// Esperado: {"goal":3,"completed":0}
console.log("[7] volume=", JSON.stringify(r7.volume));
// Esperado: {"goal":400,"current":50,"hasSharkscope":true}
console.log("[7] hands=", JSON.stringify(r7.hands));
// Esperado: {"goal":50,"current":null,"pending":true}
console.log("[7] score=", JSON.stringify(r7.score));
// Esperado: {"goal":75,"current":80}
```

Run: `npx tsx ./tmp-smoke-mscoreboard-health.ts`
Expected: 12 linhas de output batendo exatamente os comentários `// Esperado`.

Se algum diverge, debug e refazer.

DELETE `tmp-smoke-mscoreboard-health.ts` antes do commit.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/poker/monthlyScoreboard.ts`
Expected: zero warnings/errors. Em particular, `SCORE_GOAL` não é dead code (usado no return).

- [ ] **Step 7: Commit**

```bash
git add lib/poker/monthlyScoreboard.ts
git commit -m "$(cat <<'EOF'
feat(plan): buildMonthlyScoreboard aceita healthScore e retorna score

ScoreboardData ganha bloco score: { goal, current }. Lib pura recebe
healthScore por parametro (pass-through). Const interna SCORE_GOAL=75
guarda a meta hardcoded da v1 (vira configuravel em spec futuro).
Callsite do endpoint sera atualizada na Task 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Endpoint adiciona 4º SELECT em `player_health_snapshots`

**Files:**
- Modify: `app/api/plan/scoreboard/[diagnosticId]/route.ts` (Promise.all + extração + chamada de `buildMonthlyScoreboard`)

**Por quê:** Endpoint passa a alimentar o `healthScore` da lib. Erro do health select segue a mesma postura tolerante usada para SharkScope (loga warn + null, não bloqueia).

- [ ] **Step 1: Acrescentar 4º SELECT ao `Promise.all`**

Editar `app/api/plan/scoreboard/[diagnosticId]/route.ts`. O bloco atual (linhas 49-70) é:

```ts
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
```

Substituir por:

```ts
  let diagRes, trainingRes, sharkRes, healthRes;
  try {
    [diagRes, trainingRes, sharkRes, healthRes] = await Promise.all([
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
      supabase
        .from("player_health_snapshots")
        .select("health")
        .eq("diagnostic_id", diagId)
        .order("day", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  } catch (err) {
    console.warn("[plan/scoreboard] fetch threw", err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
```

- [ ] **Step 2: Logar erro do health (mesmo padrão do SharkScope)**

Logo após o bloco que loga `sharkRes.error` (linhas 84-87 originais), inserir simetricamente o log para `healthRes`. O bloco atual:

```ts
  // SharkScope mensal: erro NÃO bloqueia — apenas loga e segue com null.
  if (sharkRes.error) {
    console.warn("[plan/scoreboard] sharkscope monthly", sharkRes.error.message);
  }
```

Acrescentar logo abaixo:

```ts
  // Health snapshot: erro NÃO bloqueia — apenas loga e segue com null.
  // Aluno sem snapshot (cron diário 06h UTC ainda não rodou) também cai aqui.
  if (healthRes.error) {
    console.warn("[plan/scoreboard] health select", healthRes.error.message);
  }
```

- [ ] **Step 3: Extrair `healthScore` antes da chamada de `buildMonthlyScoreboard`**

O bloco atual (linhas 117-124) é:

```ts
  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const monthlyEntries =
    sharkRes.error || !sharkRes.data ? null : (sharkRes.data.entries ?? null);

  const volumeTargetWeekly =
    typeof savedPlan.volumeTargetWeekly === "number"
      ? savedPlan.volumeTargetWeekly
      : null;
```

Substituir por:

```ts
  const rows = (trainingRes.data ?? []) as TrainingRow[];
  const monthlyEntries =
    sharkRes.error || !sharkRes.data ? null : (sharkRes.data.entries ?? null);
  const healthScore =
    healthRes.error || !healthRes.data ? null : (healthRes.data.health ?? null);

  const volumeTargetWeekly =
    typeof savedPlan.volumeTargetWeekly === "number"
      ? savedPlan.volumeTargetWeekly
      : null;
```

- [ ] **Step 4: Passar `healthScore` pra `buildMonthlyScoreboard`**

O bloco atual (linhas 127-135 aprox):

```ts
  // Guard defensivo: saved_plan jsonb pode vir malformado.
  let data;
  try {
    data = buildMonthlyScoreboard({
      plan: savedPlan,
      trainingRows: rows,
      volumeTargetWeekly,
      monthlyEntries,
      hasSharkscope,
```

Acrescentar `healthScore` como nova linha do objeto (depois de `hasSharkscope`):

```ts
  // Guard defensivo: saved_plan jsonb pode vir malformado.
  let data;
  try {
    data = buildMonthlyScoreboard({
      plan: savedPlan,
      trainingRows: rows,
      volumeTargetWeekly,
      monthlyEntries,
      hasSharkscope,
      healthScore,
```

(Apenas adicionar `      healthScore,` como nova linha — o resto do objeto e o `});` que fecha permanecem.)

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Os erros que apareceram no fim da Task 1 (callsite faltando `healthScore`) agora resolvem.

- [ ] **Step 6: Lint**

Run: `npx eslint app/api/plan/scoreboard/[diagnosticId]/route.ts`
Expected: zero warnings/errors.

- [ ] **Step 7: Smoke via `curl` (opcional)**

Pode pular se não quiser subir o dev — a sanity final cobre.

Subir `npm run dev` em outro terminal. Sem cookie de sessão deve retornar 401:

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/plan/scoreboard/00000000-0000-0000-0000-000000000000 | tail -3
```

Expected: corpo com `{"error":"Sessão inválida ou expirada"}` e HTTP 401.

- [ ] **Step 8: Commit**

```bash
git add app/api/plan/scoreboard/[diagnosticId]/route.ts
git commit -m "$(cat <<'EOF'
feat(plan): endpoint scoreboard inclui health snapshot

4o SELECT em player_health_snapshots (ordered day DESC, limit 1).
Erro do health select NAO bloqueia o response — segue mesma postura
tolerante do sharkscope_monthly_stats: loga warn e vira null. Aluno
sem snapshot (cron diario 06h UTC ainda nao rodou) tambem cai aqui.
healthScore passado pra buildMonthlyScoreboard, que monta score na
resposta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Componente `MonthlyScoreboard` ganha `ScoreCard` + grid 4 colunas

**Files:**
- Modify: `components/trainer/MonthlyScoreboard.tsx` (grid em `ReadyView` + novo `ScoreCard` inline)

**Por quê:** UI consome o `score` que agora vem no payload e renderiza como 4º card no mesmo padrão dos outros.

- [ ] **Step 1: Adicionar `ScoreCard` inline ao final do arquivo**

Editar `components/trainer/MonthlyScoreboard.tsx`. Localizar o subcomponente `VolumeCard` (começa em linha ~216). Logo APÓS o fim do `VolumeCard`, inserir o novo subcomponente:

```tsx
function ScoreCard({
  score,
}: {
  score: { goal: number; current: number | null };
}) {
  if (score.current === null) {
    return (
      <GoalCard
        icon="❤️"
        label="Score"
        value={`— / ${score.goal}`}
        sub="calculando"
        accent="neutral"
      />
    );
  }
  const accent: "emerald" | "amber" | "neutral" =
    score.current >= score.goal
      ? "emerald"
      : score.current > 0
        ? "amber"
        : "neutral";
  const sub =
    score.current >= score.goal ? "acima da meta" : "abaixo da meta";
  return (
    <GoalCard
      icon="❤️"
      label="Score"
      value={`${score.current} / ${score.goal}`}
      sub={sub}
      accent={accent}
    />
  );
}
```

- [ ] **Step 2: Trocar grid de 3 → 4 colunas e inserir `<ScoreCard>` como primeiro card**

Localizar o bloco `<div className="mt-3 grid ...">` dentro de `ReadyView` (linha ~139). Atualmente:

```tsx
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GoalCard
          icon="🎯"
          label="Spots"
          value={`${data.spots.completed} / ${data.spots.goal}`}
          sub={
            data.spots.goal > 0
              ? `${Math.min(100, Math.round((data.spots.completed / data.spots.goal) * 100))}%`
              : "—"
          }
          accent={
            data.spots.goal === 0
              ? "neutral"
              : data.spots.completed >= data.spots.goal
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
```

Substituir por (mudanças: `grid-cols-1` → `grid-cols-2`, `sm:grid-cols-3` → `sm:grid-cols-4`, adicionar `<ScoreCard>` como PRIMEIRO filho):

```tsx
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCard score={data.score} />
        <GoalCard
          icon="🎯"
          label="Spots"
          value={`${data.spots.completed} / ${data.spots.goal}`}
          sub={
            data.spots.goal > 0
              ? `${Math.min(100, Math.round((data.spots.completed / data.spots.goal) * 100))}%`
              : "—"
          }
          accent={
            data.spots.goal === 0
              ? "neutral"
              : data.spots.completed >= data.spots.goal
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
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Lint**

Run: `npx eslint components/trainer/MonthlyScoreboard.tsx`
Expected: zero warnings/errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa, nova rota `ƒ /api/plan/scoreboard/[diagnosticId]` segue registrada.

- [ ] **Step 6: Commit**

```bash
git add components/trainer/MonthlyScoreboard.tsx
git commit -m "$(cat <<'EOF'
feat(plan): ScoreCard como 4o card no MonthlyScoreboard

Subcomponente ScoreCard inline (mesmo padrao do VolumeCard). Mostra
current/75 com cor por status (emerald >=75, amber 0<x<75, neutral
0/null). Sem snapshot vira '— / 75' + sub 'calculando'. Grid passa
de 3 pra 4 colunas em desktop (sm:grid-cols-4), 2 colunas em mobile.
Score primeiro na ordem visual — abre o placar com o sinal geral.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Sanity check final

**Files:** nenhum.

**Por quê:** Confirmar cobertura dos critérios de aceite com a feature no ar.

- [ ] **Step 1: tsc + build no HEAD**

Run: `npx tsc --noEmit && echo "TSC OK" && npm run build 2>&1 | tail -8`
Expected: `TSC OK` + build completa com rotas listadas.

- [ ] **Step 2: Smoke no dev**

Run: `npm run dev`
Esperado: dev server em http://localhost:3000.

- [ ] **Step 3: Aluno com score abaixo da meta**

Abrir `/meu-plano` autenticado como aluno com `player_health_snapshots.health` < 75 (ex.: 65). Conferir:

- [ ] Card "Score" aparece como PRIMEIRO card do grid no MonthlyScoreboard.
- [ ] Valor mostra `"65 / 75"` (ou o valor real do snapshot).
- [ ] Cor do valor: **amber** (`text-amber-300`).
- [ ] Sub mostra `"abaixo da meta"`.
- [ ] Ícone `❤️` visível.
- [ ] Total de 4 cards no grid (Score, Spots, Volume, Mãos), nessa ordem.

- [ ] **Step 4: Aluno com score acima ou igual à meta**

Abrir `/meu-plano` de outro aluno com `health` ≥ 75. Conferir:

- [ ] Cor do valor: **emerald** (`text-emerald-400`).
- [ ] Sub mostra `"acima da meta"`.

- [ ] **Step 5: Aluno sem snapshot ainda**

Abrir `/meu-plano` de aluno recém-onboarded (sem linhas em `player_health_snapshots`). Conferir:

- [ ] Valor mostra `"— / 75"`.
- [ ] Cor do valor: **neutral** (`text-neutral-200`).
- [ ] Sub mostra `"calculando"`.

- [ ] **Step 6: Responsividade do grid**

Redimensionar a janela do browser ou usar DevTools responsive mode:

- [ ] Em desktop (≥640px): 4 colunas lado a lado.
- [ ] Em mobile (<640px): 2 colunas (2 linhas de 2 cards cada).

- [ ] **Step 7: Endpoint payload**

DevTools → Network → recarregar `/meu-plano` → encontrar request pra `/api/plan/scoreboard/...` → ver Response JSON:

- [ ] Contém `score: { goal: 75, current: <number|null> }`.
- [ ] Outros campos (`month`, `spots`, `volume`, `hands`, `spotProgress`) intactos.

- [ ] **Step 8: HealthScoreBlock inalterado**

Abrir `/admin/resultado/[id]` autenticado como admin. Conferir:

- [ ] `HealthScoreBlock` segue mostrando o mesmo Health Score com 3 pílulas (Resultado / Conclusão / Sentimento) e sparkline 7 dias.

- [ ] **Step 9: Critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-monthly-scoreboard-health-score-design.md` seção "Critérios de aceite". Marcar mentalmente cada item contra os smoke tests acima:

- [ ] Endpoint responde com `score: { goal: 75, current: number | null }`.
- [ ] `score.current` reflete `health` do snapshot mais recente.
- [ ] Aluno sem snapshot → `null`.
- [ ] Erro no health select não bloqueia (validado pelo padrão SharkScope).
- [ ] `buildMonthlyScoreboard` aceita `healthScore` (validado pelo smoke `tsx` da Task 1).
- [ ] 4 cards na ordem Score → Spots → Volume → Mãos.
- [ ] Cores: emerald ≥75, amber 0<x<75, neutral 0/null.
- [ ] `— / 75` + "calculando" pro null state.
- [ ] Grid responsivo: 4 cols desktop, 2 cols mobile.
- [ ] `HealthScoreBlock` admin inalterado.
- [ ] `tsc` e `lint` passam.

- [ ] **Step 10: Reportar pronto**

Sem ação de código. Reportar: feature completa, 3 commits no branch `onboarding-ev`, smoke ok, pronto pra `finishing-a-development-branch`.

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério do spec mapeia em uma task.

- "Endpoint 200 com `score`" → Task 2 Step 4 (chamada de `buildMonthlyScoreboard`).
- "Reflete `health` do snapshot mais recente" → Task 2 Step 1 (SELECT ordered `day DESC` limit 1) + Step 3 (extração).
- "Sem snapshot → null" → Task 2 Step 3 (`healthRes.error || !healthRes.data ? null : ...`).
- "Erro health não bloqueia" → Task 2 Step 2 (log) + Step 3 (null fallback).
- "Lib aceita `healthScore`" → Task 1 Step 3.
- "4 cards na ordem Score → Spots → Volume → Mãos" → Task 3 Step 2.
- "Cores emerald/amber/neutral" → Task 3 Step 1 (`ScoreCard` body).
- "`— / 75` + 'calculando'" → Task 3 Step 1 (branch `score.current === null`).
- "Grid 4/2" → Task 3 Step 2 (`grid-cols-2 sm:grid-cols-4`).
- "HealthScoreBlock admin inalterado" → garantido por não tocar `/admin/resultado/[id]` ou `HealthScoreBlock.tsx`.
- "Cron diário continua" → garantido por não tocar `app/api/cron/*` ou `lib/health/*`.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código mostram código completo. Step 7 da Task 2 é "opcional" mas com comando exato.

**3. Type consistency:**
- `score: { goal: number; current: number | null }` consistente em `ScoreboardData` (Task 1) e `ScoreCard` props (Task 3).
- `healthScore: number | null` consistente entre args do `buildMonthlyScoreboard` (Task 1) e variable extraída no endpoint (Task 2).
- `SCORE_GOAL = 75` const interna, não exportada — confirmado em Task 1 Step 2 e usado em Step 3.
- `accent: "emerald" | "amber" | "neutral"` tipo já existente no `GoalCard` — reusado no `ScoreCard`.
