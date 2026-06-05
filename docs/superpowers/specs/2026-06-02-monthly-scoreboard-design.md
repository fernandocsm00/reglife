# Spec — Placar Mensal em /meu-plano

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/meu-plano` (substitui o EvHud)
**Apelido interno:** entrega placar / monthly scoreboard

## Problema

O EvHud atual em `/meu-plano` mostra sinais de **semana** (streak, XP semanal, volume semanal, quest semanal, Health Score). Esses sinais funcionavam quando a cadência primária do aluno era semanal. Hoje o EV trabalha com **metas mensais** (3 spots/mês, X jogos/mês, Y mãos treinadas/mês) e o placar precisa refletir isso pra que o aluno veja, em uma piscada, "estou em dia com o mês ou estou atrasado?".

Além disso, o aluno não vê hoje uma **visão consolidada da trilha** com mãos treinadas e % de acerto por spot — ele precisa rolar e abrir cada `SpotCard`.

## Escopo desta entrega

Substituir `<EvHud>` por `<MonthlyScoreboard>` em `/meu-plano`, mostrando:

1. **3 cards de meta mensal** (mês corrente, UTC 1º ao último dia):
   - **SPOTS**: spots concluídos esse mês / 3.
   - **VOLUME**: torneios jogados esse mês / (`volumeTargetWeekly × 4`).
   - **MÃOS**: placeholder "em breve" / (`length da trilha × 50`) — integração de mãos vem em spec separado.
2. **Mini-resumo da trilha**: uma linha por spot com bolinha de estado, mãos jogadas, % de acerto e mini-barra de progresso (`handsPlayed/50`).

**Fora de escopo** (entram em specs posteriores):
- Score do ranking entre alunos.
- Score reglifeSIM.
- Integração de mãos jogadas com plataforma externa (preparada como placeholder).
- Streak / XP / Quest semanal — saem dessa página (EvHud é deletado).
- Health Score visual no placar — já existe via `HealthScoreBlock` em outros pontos.

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Estratégia | Substituir EvHud inteiro |
| Meta SPOTS | Hardcoded `3` |
| Meta VOLUME | `volumeTargetWeekly × 4` |
| Meta MÃOS | `length(trilha) × 50` |
| Janela | Mês corrente (UTC, 1º ao último dia) |
| Fonte volume | `sharkscope_monthly_stats.entries` (year/month corrente) |
| Fonte mãos | `null` na v1 + placeholder "em breve" |
| Mini-resumo | Lista compacta dos 3 spots com mini-barra |
| Posicionamento | Mesmo slot do EvHud atual em `PlanScreen.tsx` |

## Arquitetura

Três peças novas + uma edição + uma deleção:

```
app/api/plan/scoreboard/[diagnosticId]/route.ts   ← endpoint REST (NOVO)
lib/poker/monthlyScoreboard.ts                    ← lógica pura (NOVO)
components/trainer/MonthlyScoreboard.tsx          ← UI (NOVO)
components/trainer/PlanScreen.tsx                 ← Modify (troca <EvHud> por <MonthlyScoreboard>)
components/trainer/EvHud.tsx                      ← DELETE
```

**Reuso forte:** `mergeTrackWithTraining(plan, rows)` da `lib/poker/adminSpotTrack.ts` (entrega "admin spot track") faz o trabalho de gating e shape do `spotProgress`. Zero código novo de gating sequencial — a regra já vive em `findActiveSpotIndex` de `lib/poker/spotTrack.ts`.

**Endpoint `/api/plan/progress`:** consumido APENAS pelo EvHud (verificado via grep). Pode ser deletado nesta entrega junto com `EvHud.tsx`. A entrega o trata como obsoleto — se restar algum consumidor externo descoberto no plano, fica vivo e só `EvHud.tsx` sai.

### Fluxo de dados

1. Aluno abre `/meu-plano`.
2. `<MonthlyScoreboard diagnosticId={plan.diagnosticId} />` renderiza no slot antes ocupado pelo `<EvHud>`.
3. Componente faz `GET /api/plan/scoreboard/[diagnosticId]`.
4. Endpoint:
   - Valida `requireDiagSession(diagnosticId)` (cookie HttpOnly bate com ID).
   - Faz 3 SELECTs em paralelo no Supabase service-role:
     - `reglife_diagnostic_results.saved_plan, spots_played` por id.
     - `spot_training_sessions.{leak_id, hands_played, hands_correct, completed_at, updated_at}` por diagnostic_id.
     - `sharkscope_monthly_stats.entries` por (diagnostic_id, year, month) corrente UTC.
   - Decide empty state (precedência abandoned > no_saved_plan > elite_no_track).
   - Delega para `buildMonthlyScoreboard(...)`.
5. Componente renderiza loading / ready / empty / error.

## Contrato do endpoint

### `GET /api/plan/scoreboard/[diagnosticId]`

**Auth:** `requireDiagSession(diagnosticId)` (mesma convenção de `/api/spot-training` e `/api/health/me`). 401 se cookie ausente ou divergente.

### Response 200 — success

```json
{
  "hasScoreboard": true,
  "month": { "year": 2026, "month": 6, "label": "junho" },
  "spots": { "goal": 3, "completed": 1 },
  "volume": { "goal": 400, "current": 87, "hasSharkscope": true },
  "hands": { "goal": 150, "current": null, "pending": true },
  "spotProgress": [
    {
      "index": 1,
      "leakId": "RFI-BTN-40",
      "spotLabel": "RFI do BTN em 40bb",
      "state": "completed",
      "handsPlayed": 52,
      "handsTarget": 50,
      "progressPct": 100,
      "accuracyPct": 75
    },
    {
      "index": 2,
      "leakId": "cBet-BTN-40",
      "spotLabel": "Cbet do BTN em 40bb",
      "state": "active",
      "handsPlayed": 18,
      "handsTarget": 50,
      "progressPct": 36,
      "accuracyPct": 61
    },
    {
      "index": 3,
      "leakId": "vsRFI-BB-40",
      "spotLabel": "BB vs RFI em 40bb",
      "state": "locked",
      "handsPlayed": 0,
      "handsTarget": 50,
      "progressPct": 0,
      "accuracyPct": null
    }
  ]
}
```

Campos:
- `month.year` / `month.month`: UTC do servidor no momento da request. `month.label`: nome em PT (`"janeiro"..."dezembro"`).
- `spots.goal`: literal `3`. `spots.completed`: count das rows em `spot_training_sessions` com `completed_at` dentro do mês corrente.
- `volume.goal`: `volumeTargetWeekly * 4` se `volumeTargetWeekly` for número positivo no `saved_plan.volumeTargetWeekly`; senão `null`.
- `volume.current`: `entries` do `sharkscope_monthly_stats` (year/month corrente). `null` se nenhuma linha.
- `volume.hasSharkscope`: `true` se aluno tem SharkScope conectado (`reglife_diagnostic_results.sharkscope_username IS NOT NULL` ou `sharkscope_playergroup_id IS NOT NULL`). Permite distinguir "sem dados do mês" de "não conectou ainda".
- `hands.goal`: `spotProgress.length * 50`. Zero se trilha vazia.
- `hands.current`: sempre `null` na v1.
- `hands.pending`: sempre `true` na v1 — flag de UI.
- `spotProgress`: array completo (locked + active + completed) — derivado de `mergeTrackWithTraining` + acréscimo de `handsTarget: 50` e `progressPct: min(100, round(handsPlayed/50 * 100))`.

### Response 200 — empty

```json
{ "hasScoreboard": false, "reason": "abandoned" | "no_saved_plan" | "elite_no_track" }
```

Mesma precedência da entrega admin spot track:
- `abandoned`: `spots_played === 0` (tem precedência).
- `no_saved_plan`: `spots_played > 0` mas `saved_plan IS NULL`.
- `elite_no_track`: `saved_plan` existe mas `buildSpotTrack` retorna `[]`.

### Erros

| Cenário | Status | Body |
|---|---|---|
| `diagnosticId` ausente | 400 | `{ "error": "diagnosticId required" }` |
| `requireDiagSession` falhou | 401 | (Response do helper) |
| Diagnóstico não existe | 404 | `{ "error": "not found" }` |
| `SELECT` em `reglife_diagnostic_results` falhou | 500 | `{ "error": "db error" }` + `console.warn` |
| `SELECT` em `spot_training_sessions` falhou (no merge path) | 500 | idem |
| `SELECT` em `sharkscope_monthly_stats` falhou | **continua** | log + `volume.current = null` |
| `buildMonthlyScoreboard` jogou (saved_plan malformado) | 500 | try/catch + log |

Erro do SharkScope mensal **não bloqueia** a resposta — vira `volume.current = null` e o UI mostra "Conecte SharkScope" / "sem dados do mês" conforme `hasSharkscope`.

## Lógica pura — `lib/poker/monthlyScoreboard.ts`

```ts
import type { SavedPlan } from "@/lib/poker/planStorage";
import { mergeTrackWithTraining, type TrainingRow } from "@/lib/poker/adminSpotTrack";

export interface MonthMeta {
  year: number;   // UTC
  month: number;  // 1..12
  label: string;  // "junho", "julho"...
}

export interface SpotProgressEntry {
  index: number;
  leakId: string | null;
  spotLabel: string;
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  handsTarget: number;  // sempre 50 na v1
  progressPct: number;  // min(100, round(handsPlayed/50 * 100))
  accuracyPct: number | null;
}

export interface ScoreboardData {
  month: MonthMeta;
  spots: { goal: number; completed: number };
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
  hands:  { goal: number; current: number | null; pending: boolean };
  spotProgress: SpotProgressEntry[];
}

export function buildMonthlyScoreboard(args: {
  plan: SavedPlan;
  trainingRows: TrainingRow[];
  volumeTargetWeekly: number | null;
  monthlyEntries: number | null;
  hasSharkscope: boolean;
  nowIso?: string;
}): ScoreboardData;
```

### Regras

1. **`month`**: deriva de `nowIso ?? new Date()` em UTC. `label` via tabela hardcoded `["janeiro", "fevereiro", ..., "dezembro"]`. `month.month` é 1-based.

2. **`spots.completed`**: filtra `trainingRows` por `completed_at != null && completed_at >= startOfMonthUTC && completed_at < startOfNextMonthUTC`. Count das rows resultantes.

3. **`volume.goal`**: `(volumeTargetWeekly != null && volumeTargetWeekly > 0) ? volumeTargetWeekly * 4 : null`.

4. **`volume.current`**: passa `monthlyEntries` direto. Pode ser `null`.

5. **`hands.goal`**: `spotProgress.length * 50` (após `mergeTrackWithTraining`). Zero se trilha vazia.

6. **`hands.current`**: sempre `null`.

7. **`hands.pending`**: sempre `true`.

8. **`spotProgress`**:
   - Resultado de `mergeTrackWithTraining(plan, trainingRows)`.
   - Mapeia cada `AdminSpotEntry` pra `SpotProgressEntry`:
     - Mantém `index`, `leakId`, `spotLabel`, `state`, `handsPlayed`, `accuracyPct`.
     - `handsTarget: 50`.
     - `progressPct: Math.min(100, Math.round((handsPlayed / handsTarget) * 100))`.

### Testes da lógica pura

| Caso | Cenário | Resultado esperado |
|---|---|---|
| 1 | Plano 3 spots, 0 treinos, `volumeTargetWeekly=100`, sem SS | `spots.completed=0`, `volume.goal=400`, `volume.current=null`, `volume.hasSharkscope=false`, `hands.goal=150`, `spotProgress[*].progressPct=0`, primeiro `state=active`, demais `locked` |
| 2 | 1 spot completo este mês (`completed_at` dentro de `[startOfMonth, startOfNextMonth)`) | `spots.completed=1`, `progressPct=100` no spot 1 |
| 3 | 1 spot completo no mês anterior | `spots.completed=0` (filtro exclui), spot ainda aparece em `spotProgress` com `state=completed` (gating não muda) |
| 4 | Plano sem leaks | `spotProgress=[]`, `hands.goal=0` |
| 5 | `volumeTargetWeekly=null` | `volume.goal=null` |
| 6 | `monthlyEntries=87`, `hasSharkscope=true` | `volume.current=87`, `volume.hasSharkscope=true` |
| 7 | Spot ativo com 33 mãos | `progressPct=66` |
| 8 | `nowIso="2026-06-15T12:00:00Z"` | `month.year=2026`, `month.month=6`, `month.label="junho"` |
| 9 | `handsPlayed=52` (acima da meta) | `progressPct=100` (clamped), `state=completed` se completed_at setado |

## UI — `components/trainer/MonthlyScoreboard.tsx`

### Estado interno

```ts
type State =
  | { kind: "loading" }
  | { kind: "ready"; data: ScoreboardData }
  | { kind: "empty"; reason: "abandoned" | "no_saved_plan" | "elite_no_track" }
  | { kind: "error" };
```

Mesma estratégia da entrega "admin spot track": `reloadTick` counter pra retry, fetch inline no `useEffect`, evita o pattern que dispara `react-hooks/set-state-in-effect`.

### Container

```
<section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:p-4 print:hidden">
```

Mesmo container do EvHud atual — preserva look-and-feel da página.

### Bloco A — 3 cards de meta

Header eyebrow (mesmo padrão `rg-eyebrow`):

```
METAS DO MÊS · JUNHO
```

3 cards lado a lado (grid):

| Card | Eyebrow | Valor grande | Sub |
|---|---|---|---|
| SPOTS | `🎯 SPOTS` | `{completed} / {goal}` (`1/3`) | `{Math.round(completed/goal*100)}%` |
| VOLUME | `⚡ VOLUME` | `{current} / {goal}` ou `— / —` se ambos nulos | `{Math.min(100, round(current/goal*100))}%` ou estados especiais |
| MÃOS | `🃏 MÃOS` | `— / {goal}` | `em breve` |

Estados especiais do VOLUME:
- `goal == null` → valor `— / —`, sub `"sem meta"`.
- `current == null && hasSharkscope == false` → valor `— / {goal}`, sub `"Conecte SharkScope"`.
- `current == null && hasSharkscope == true` → valor `0 / {goal}`, sub `"sem dados do mês"`.

Cores do valor grande:
- SPOTS: `text-emerald-400` se `completed >= goal`, `text-amber-300` se `0 < completed < goal`, `text-neutral-200` se `0`.
- VOLUME: mesmo critério usando `current` vs `goal`, ignorando estados especiais (que vão pra neutral).
- MÃOS: sempre `text-neutral-500`.

Tipografia: valor grande em `text-2xl font-bold tabular-nums`; sub em `text-[11px] text-neutral-500`.

### Bloco B — Mini-resumo dos spots

Separador `border-t border-neutral-800/60 mt-3 pt-3`. Eyebrow `EVOLUÇÃO POR SPOT`. Cada spot vira uma linha:

```
{index}. {spotLabel}              ● {STATE_LABEL}    {handsPlayed}/{handsTarget} · {accuracyPct}%
        [▓▓▓▓▓▓▓░░░░░░] {progressPct}%
```

Convenções:
- **#index**: `text-neutral-600 tabular-nums`.
- **`spotLabel`**: `text-neutral-200 truncate flex-1`.
- **Bolinha**: `h-1.5 w-1.5 rounded-full` com cor: `bg-emerald-500` / `bg-yellow-400` / `bg-neutral-600`.
- **Estado curto** (`Concl.` / `Ativo` / `Bloq.`): `text-neutral-300 text-xs`.
- **`{handsPlayed}/{handsTarget}`**: `text-neutral-400 tabular-nums`.
- **`· {accuracyPct}%`**: `text-emerald-400` se ≥70, `text-amber-400` se 1..69, `text-neutral-600` (`—`) se null.
- **Mini-barra**: 4px de altura, full-width abaixo do texto. Cor: `bg-emerald-500` completed, `bg-amber-400` active, `bg-neutral-700` locked. Espessura preenchida `style={{ width: \`${progressPct}%\` }}`.

### Empty / Loading / Error

- **Loading**: card único com texto `"Carregando seu placar…"` (`text-sm text-neutral-500`).
- **Empty**: mensagens:
  - `abandoned` → `"Você ainda não jogou nenhum spot."`
  - `no_saved_plan` → `"Plano ainda não gerado."`
  - `elite_no_track` → `"Sem trilha esse ciclo — fala com seu EV."`
- **Error**: `"Não foi possível carregar o placar."` + botão "Tentar de novo" que dispara `setReloadTick(n => n + 1)`.

### Print/PDF

Container leva `print:hidden` — placar é UI viva, fora do PDF.

## Edição em `components/trainer/PlanScreen.tsx`

Substituir o bloco atual (linhas ~138-146 em `PlanScreen.tsx`):

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

Por:

```tsx
{/* Placar Mensal — metas do mês + mini-resumo da trilha */}
{plan.diagnosticId && (
  <div style={{ marginBottom: 24 }}>
    <MonthlyScoreboard diagnosticId={plan.diagnosticId} />
  </div>
)}
```

Atualizar import: tira `EvHud`, adiciona `MonthlyScoreboard`.

## Deleção em `components/trainer/EvHud.tsx`

Após confirmar que `PlanScreen.tsx` é o único consumidor (já verificado), `git rm` no arquivo. Sem testes pra ajustar (não há suite). O endpoint `/api/plan/progress/route.ts` permanece (decisão de não tocar nele nesta entrega — se for órfão depois, vira spec próprio).

## Error handling (camada por camada)

| Camada | Cenário | Comportamento |
|---|---|---|
| Endpoint | `diagnosticId` ausente | 400 |
| Endpoint | `requireDiagSession` falhou | 401 (resposta do helper) |
| Endpoint | DB diag select falhou | log + 500 |
| Endpoint | Diagnóstico não existe | 404 |
| Endpoint | DB training select falhou (no merge path) | log + 500 |
| Endpoint | DB sharkscope monthly select falhou | log + segue com `monthlyEntries=null` |
| Endpoint | `spots_played === 0` | 200 `{hasScoreboard: false, reason: "abandoned"}` |
| Endpoint | `saved_plan IS NULL` (após spots_played check) | 200 `{hasScoreboard: false, reason: "no_saved_plan"}` |
| Endpoint | `mergeTrackWithTraining` retorna `[]` | 200 `{hasScoreboard: false, reason: "elite_no_track"}` |
| Endpoint | `buildMonthlyScoreboard` jogou (saved_plan malformado) | log + 500 |
| Componente | rede falhou ou `!r.ok` | render error + botão retry |
| Componente | shape inesperado | `console.error` + render error |

## Testes

1. **`lib/poker/monthlyScoreboard.test.ts`** — 9 casos da tabela. Sem framework de teste no projeto: smoke via script `tsx` (mesma estratégia da entrega "admin spot track"). Apaga script após validar.

2. **Smoke do endpoint** via `curl` no `npm run dev`:
   - Happy path com UUID real.
   - `spots_played=0` → `abandoned`.
   - Sem SharkScope → `volume.hasSharkscope=false`.

3. **Smoke visual** no `npm run dev`:
   - Aluno com 1 spot completo no mês: SPOTS amber `1/3`.
   - Aluno sem SharkScope: VOLUME `— / 400` + "Conecte SharkScope".
   - Aluno com trilha vazia: empty state.

## Risco / Performance

- **3 SELECTs por abertura de `/meu-plano`**, todos indexados. SharkScope query é idempotente sobre a tabela `sharkscope_monthly_stats` (PK composta provável: `diagnostic_id + year + month`).
- **Deletar EvHud**: zero risco — único consumidor é `PlanScreen.tsx`.
- **Mês UTC**: trade-off aceito. Aluno BR pode ver "virada do mês" 3h cedo (00h UTC = 21h BRT). Não é crítico pra v1.
- **`/api/plan/progress`**: fica vivo mesmo após `EvHud.tsx` sair. Se for confirmado órfão no plano (zero refs novos depois do `git rm` do EvHud), vira spec separado pra deletar.

## Critérios de aceite

- [ ] `GET /api/plan/scoreboard/{id}` responde 200 com `hasScoreboard: true` + os 4 blocos (`month`, `spots`, `volume`, `hands`, `spotProgress`) pra um aluno com trilha.
- [ ] Empty states (`abandoned`, `no_saved_plan`, `elite_no_track`) respeitam a precedência da entrega "admin spot track".
- [ ] 401 quando cookie de sessão não bate.
- [ ] 404 quando diagnóstico não existe.
- [ ] `volume.goal = volumeTargetWeekly * 4` quando o campo está presente; `null` caso contrário.
- [ ] `spots.completed` conta apenas rows com `completed_at` dentro do mês corrente UTC.
- [ ] `volume.hasSharkscope` reflete `sharkscope_username != null || sharkscope_playergroup_id != null` no `reglife_diagnostic_results`.
- [ ] Erro do SharkScope mensal NÃO bloqueia o response — vira `current: null`.
- [ ] `hands.current = null` e `hands.pending = true` na v1.
- [ ] Em `/meu-plano`, o `<EvHud>` sumiu (arquivo deletado) e `<MonthlyScoreboard>` aparece no mesmo slot.
- [ ] Componente renderiza 4 estados (loading / ready / 3× empty / error com retry).
- [ ] Mini-barra de progresso por spot mostra `progressPct` com cor por estado.
- [ ] `print:hidden` no container — placar fora do PDF.
