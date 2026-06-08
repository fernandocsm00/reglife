# Spec — Health Score como 4º card no MonthlyScoreboard

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/meu-plano` (componente `MonthlyScoreboard`)
**Apelido interno:** entrega B1 — score 75+ no placar

## Problema

A auditoria da reunião identificou que o aluno em `/meu-plano` não vê seu **Health Score**. A peça central pedida pelo Speaker A — "tipo, só meta, você tá com 65 Seu score, meta 75, 75+, que é o que a gente considerou ali do score bom" — é a única do placar mensal que ainda não foi implementada.

O sistema já tem:
- Tabela `player_health_snapshots` com health (0-100), band e breakdown — alimentada por cron diário 06h UTC.
- Endpoint `/api/health/me` que devolve snapshot do aluno.
- Componente `HealthScoreBlock` que renderiza score + 3 pílulas + sparkline.

Mas `HealthScoreBlock` é renderizado APENAS em `/admin/resultado/[id]` (mode=admin). No `/meu-plano` o aluno não tem acesso ao seu próprio score. A reunião deixa claro que essa é a peça mais visível pro aluno (referência de "como tô indo").

## Escopo desta entrega

Adicionar um 4º card "Score" no `MonthlyScoreboard` em `/meu-plano`, mostrando `current / 75` (ou `— / 75` quando ainda não há snapshot), com cor por status (emerald se ≥75, amber se 0<x<75, neutral se 0/null).

**Fora de escopo** (entram em specs posteriores):
- Breakdown completo (Resultado/Conclusão/Sentimento) — fica no HealthScoreBlock do admin.
- Sparkline de 7 dias — ditto.
- Link "ver detalhes" ou modal de expansão.
- Score do ranking entre alunos (descartado da reunião explicitamente).
- Cálculo dinâmico da meta (75 hardcoded por enquanto — decisão prévia).

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Posicionamento | 4º card no `MonthlyScoreboard` (mesmo grid) |
| Ordem | Score primeiro, depois Spots / Volume / Mãos |
| Meta | Hardcoded `75` |
| Formato do valor | `current / 75` (igual aos outros cards) |
| Sub | `"acima da meta"` / `"abaixo da meta"` / `"calculando"` |
| Cor | emerald se ≥75, amber se 0<x<75, neutral se 0/null |
| Sem snapshot | mostra card com `"— / 75"` + sub `"calculando"` |
| Fonte | endpoint `/api/plan/scoreboard` enriquecido (+1 SELECT em `player_health_snapshots`) |
| Schema change | nenhum |

## Arquitetura

3 modificações cirúrgicas em arquivos existentes, zero arquivo novo:

```
lib/poker/monthlyScoreboard.ts                  ← Modify: adicionar score ao ScoreboardData + parâmetro healthScore
app/api/plan/scoreboard/[diagnosticId]/route.ts ← Modify: +1 SELECT em player_health_snapshots
components/trainer/MonthlyScoreboard.tsx        ← Modify: 4º card no grid (3 → 4 colunas em desktop)
```

**Reuso forte:**
- Tabela `player_health_snapshots` já é fonte de verdade do Health Score (cron diário 06h UTC). Mesma tabela usada pelo `HealthScoreBlock` no admin.
- Subcomponente `ScoreCard` inline em `MonthlyScoreboard.tsx`, mesmo padrão do `VolumeCard` existente.
- `GoalCard` (helper já no arquivo) absorve a renderização.

### Fluxo de dados

1. Aluno abre `/meu-plano`.
2. `<MonthlyScoreboard diagnosticId={…}>` faz `GET /api/plan/scoreboard/[id]`.
3. Endpoint executa 4 SELECTs em paralelo (era 3):
   - `reglife_diagnostic_results.{saved_plan, spots_played, sharkscope_*}`
   - `spot_training_sessions.{leak_id, hands_played, hands_correct, completed_at, updated_at}`
   - `sharkscope_monthly_stats.entries` (ano/mês corrente)
   - **NOVO:** `player_health_snapshots.health` (filtrado por `diagnostic_id`, ordenado `day DESC`, `LIMIT 1`)
4. Endpoint chama `buildMonthlyScoreboard(args + healthScore)`.
5. Lib pura adiciona `score: { goal, current }` ao `ScoreboardData`.
6. Componente renderiza o 4º card com `<ScoreCard score={data.score} />`.

## Contrato do endpoint

### `GET /api/plan/scoreboard/[diagnosticId]` — resposta 200 success (acréscimo)

```json
{
  "hasScoreboard": true,
  "month": { ... },
  "spots":  { "goal": 3,  "completed": 1 },
  "volume": { "goal": 400, "current": 87, "hasSharkscope": true },
  "hands":  { "goal": 150, "current": null, "pending": true },
  "score":  { "goal": 75,  "current": 65 },
  "spotProgress": [ ... ]
}
```

**Novo campo `score`:**
- `goal`: literal `75`.
- `current`: número 0-100 do `health` no snapshot mais recente; ou `null` se não há snapshot, há erro de DB, ou o cron diário ainda não rodou.

Sem mudança no shape de empty state (`hasScoreboard: false` segue idêntico).

### Erros

| Cenário | Comportamento |
|---|---|
| `healthRes.error` | log `console.warn("[plan/scoreboard] health select", err.message)` + `healthScore = null`. **NÃO bloqueia** o response. |
| `!healthRes.data` | `healthScore = null` (caso normal — aluno novo ou cron ainda não rodou). |
| `healthRes.data.health` ausente/null | `healthScore = null`. |

Mesma postura tolerante usada para `sharkscope_monthly_stats`.

## Lógica pura — `lib/poker/monthlyScoreboard.ts`

**Adicionar ao `ScoreboardData`:**

```ts
export interface ScoreboardData {
  month: MonthMeta;
  spots: { goal: number; completed: number };
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
  hands: { goal: number; current: number | null; pending: boolean };
  score: { goal: number; current: number | null };   // NOVO
  spotProgress: SpotProgressEntry[];
}
```

**`buildMonthlyScoreboard` ganha 1 parâmetro:**

```ts
export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  healthScore: number | null;   // NOVO
  nowIso?: string;
}): ScoreboardData;
```

**Regras (uma linha cada):**
- `score.goal`: literal `75`.
- `score.current`: passa `healthScore` direto (pode ser `null`).

Sem nova função, sem helper, sem cálculo derivado. Só uma propriedade extra no objeto retornado.

### Constante exportada

```ts
/** Meta hardcoded do Health Score na v1. Vira configurável em spec futuro. */
const SCORE_GOAL = 75;
```

Mantida `const` interna (não exportada) — usada apenas dentro da lib. Se outro consumidor precisar dela depois, exportamos.

### Casos de teste (smoke `tsx`)

Acrescentar ao smoke `tsx` da lib (mesmo script temporário do padrão das entregas anteriores):

| # | `healthScore` input | `score.current` esperado |
|---|---|---|
| 1 | `null` | `null` |
| 2 | `0` | `0` |
| 3 | `65` | `65` |
| 4 | `75` | `75` |
| 5 | `90` | `90` |
| 6 | `100` | `100` |

E `score.goal` sempre `75` em todos os casos.

## Mudanças no endpoint

`app/api/plan/scoreboard/[diagnosticId]/route.ts`:

**Acrescentar 1 SELECT ao `Promise.all`:**

```ts
supabase
  .from("player_health_snapshots")
  .select("health")
  .eq("diagnostic_id", diagId)
  .order("day", { ascending: false })
  .limit(1)
  .maybeSingle()
```

**Extrair `healthScore` antes do `buildMonthlyScoreboard`:**

```ts
if (healthRes.error) {
  console.warn("[plan/scoreboard] health select", healthRes.error.message);
}
const healthScore =
  healthRes.error || !healthRes.data ? null : (healthRes.data.health ?? null);
```

**Passar pra `buildMonthlyScoreboard`:**

```ts
data = buildMonthlyScoreboard({
  plan: savedPlan,
  trainingRows: rows,
  volumeTargetWeekly,
  monthlyEntries,
  hasSharkscope,
  healthScore,    // NOVO
});
```

Sem mudança no contrato de empty states, sem mudança nos outros 3 SELECTs.

## UI — `MonthlyScoreboard.tsx`

### Grid: 3 → 4 colunas

```diff
- <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
+ <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
```

Mobile passa de 1 coluna para 2 colunas para não criar uma tira vertical longa.

### Ordem dos cards

```tsx
<ScoreCard score={data.score} />
<GoalCard icon="🎯" label="Spots"  ... />
<VolumeCard volume={data.volume} />
<GoalCard icon="🃏" label="Mãos"   ... />
```

Score primeiro — abre o placar com o sinal geral, depois os 3 detalhes ("o que executar este mês").

### Subcomponente `ScoreCard` inline

Mesmo padrão do `VolumeCard` existente em `MonthlyScoreboard.tsx`:

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

Convenção idêntica aos outros cards: `GoalCard` faz o render real.

### Estados especiais

| Estado | Display | Cor |
|---|---|---|
| `current === null` (sem snapshot ou erro) | `— / 75` + sub `calculando` | neutral |
| `current === 0` | `0 / 75` + sub `abaixo da meta` | neutral |
| `0 < current < 75` | `{current} / 75` + sub `abaixo da meta` | amber |
| `current >= 75` | `{current} / 75` + sub `acima da meta` | emerald |

## Error handling — camada por camada

Apenas mudanças incrementais sobre o handling existente.

| Camada | Cenário | Comportamento |
|---|---|---|
| Endpoint | `healthRes.error` | log warn + `healthScore = null`; segue normalmente |
| Endpoint | `!healthRes.data` | `healthScore = null` |
| Endpoint | shape inesperado em `healthRes.data` | `healthScore = data.health ?? null` (defensivo) |
| Lib pura | `healthScore = null` | `score: { goal: 75, current: null }` |
| Componente | `score.current === null` | render `ScoreCard` no estado "calculando" |

Sem mudança no `try/catch` global do Promise.all, sem mudança nos outros checks.

## Testes

1. **Smoke `tsx` da lib** — acrescenta 6 casos (tabela acima) ao script temporário, apaga após validar.
2. **Smoke do endpoint via `curl`** — opcional:
   - Aluno com snapshot → `score: { goal: 75, current: <number> }`.
   - Aluno sem snapshot → `score: { goal: 75, current: null }`.
3. **Smoke visual no `npm run dev`:**
   - Aluno com score 65 → card âmbar `"65 / 75"` + sub "abaixo da meta".
   - Aluno com score 80 → card emerald `"80 / 75"` + sub "acima da meta".
   - Aluno com score 0 → card neutro `"0 / 75"` + sub "abaixo da meta".
   - Aluno sem snapshot → card neutro `"— / 75"` + sub "calculando".
   - Grid: 4 colunas em desktop (≥640px), 2 colunas em mobile.

## Performance & Risco

- **+1 SELECT por abertura de `/meu-plano`**, indexado em `(diagnostic_id, day DESC)` (verificado em migração 012). Custo desprezível.
- **Sem impacto no admin**: `HealthScoreBlock` em `/admin/resultado/[id]` segue intacto, consumindo `/api/admin/health/[id]` (endpoint separado).
- **Sem impacto no cron**: `player_health_snapshots` segue alimentada pelo cron diário existente.
- **Sem regressão visual**: outros 3 cards e o mini-resumo dos spots inalterados; só o grid muda de 3 → 4 colunas em desktop.
- **Mobile narrow**: 2 colunas mantêm legibilidade até 320px.
- **`/api/health/me` não é tocado**: continua funcionando para outros consumidores (se houver no futuro).

## Critérios de aceite

- [ ] `GET /api/plan/scoreboard/{id}` 200 inclui `score: { goal: 75, current: number | null }` no payload.
- [ ] `score.current` reflete `health` do snapshot mais recente em `player_health_snapshots`.
- [ ] Aluno sem snapshot → `score.current: null`.
- [ ] Erro no health select NÃO bloqueia o response (log + null).
- [ ] `buildMonthlyScoreboard` aceita `healthScore` como parâmetro tipado `number | null`.
- [ ] Em `/meu-plano`, 4 cards aparecem no grid na ordem Score → Spots → Volume → Mãos.
- [ ] Card Score com `current >= 75` → cor emerald + sub `"acima da meta"`.
- [ ] Card Score com `0 < current < 75` → cor amber + sub `"abaixo da meta"`.
- [ ] Card Score com `current === 0` → cor neutral + sub `"abaixo da meta"`.
- [ ] Card Score com `current === null` → cor neutral, valor `"— / 75"`, sub `"calculando"`.
- [ ] Grid responsivo: 4 colunas em `sm:` (≥640px), 2 colunas no mobile.
- [ ] `HealthScoreBlock` em `/admin/resultado/[id]` inalterado.
- [ ] Cron diário 06h UTC continua alimentando `player_health_snapshots` sem mudança.
- [ ] `tsc --noEmit` e `npm run lint` passam.
