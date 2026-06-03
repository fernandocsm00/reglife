# Spec — Trilha do aluno no admin

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/admin/resultado/[id]`
**Apelido interno:** entrega (a) — admin spot progress

## Problema

Hoje, em `/admin/resultado/[id]`, o EV (mentor humano) vê:
- O Health Score do aluno (com pílulas Resultado/Conclusão/Sentimento e sparkline de 7 dias).
- A grade de spots do **diagnóstico inicial** (passou/falhou, % por spot).
- A tabela mão-a-mão do **diagnóstico**.

Mas **não** vê o progresso do aluno na trilha de 30 dias: quais spots já foram completados, qual está ativo, quantas mãos foram treinadas em cada um, qual a % de acerto atual, nem quando o aluno treinou pela última vez. Toda essa informação já está persistida em `spot_training_sessions` — está sendo desperdiçada na visão do EV.

Sem isso, o EV não consegue responder perguntas básicas como "esse aluno parou de treinar?" ou "está travado no Spot 2 sem nem começar o 3?".

## Escopo desta entrega

Adicionar um bloco **Trilha de 30 dias** em `/admin/resultado/[id]`, logo abaixo do `HealthScoreBlock`. O bloco mostra a trilha completa do aluno (ordenada via `buildSpotTrack(saved_plan)`), com estado por spot (locked/active/completed), mãos jogadas, % de acerto, data de conclusão e "última atividade" relativa.

**Fora de escopo** (entram em specs posteriores):
- Detalhe mão-a-mão do treino (tabela `spot_training_hands` ainda não existe).
- Sparkline de evolução do % por spot ao longo do tempo.
- Histórico de pulses no admin (entrega (c)).
- Migrar plano do localStorage pro banco — não é necessário aqui porque o `saved_plan jsonb` já existe em `reglife_diagnostic_results` desde a migração 008.
- Notificações pro EV (tipo "aluno X parou de treinar há 5 dias").

## Decisões de design (já validadas)

1. **Granularidade:** somente resumo agregado por spot. Sem mão-a-mão, sem sparkline.
2. **Posicionamento:** bloco dedicado **logo abaixo do `HealthScoreBlock`**, antes do "Player card".
3. **Empty state:** **mostrado explicitamente** com mensagem específica (sem ocultar o bloco).
4. **Formato visual:** **tabela densa** — uma linha por spot.
5. **Campo "última atividade":** **incluído**, no formato "hoje/1d/5d/2sem/—".
6. **Fonte da trilha:** lida de `reglife_diagnostic_results.saved_plan` (já persistido). Não precisa de localStorage do admin.
7. **Abordagem técnica:** endpoint admin dedicado que monta a trilha server-side, faz **uma chamada de rede** do componente. Lógica de merge isolada em lib pura.

## Arquitetura

Três peças novas + uma edição:

```
app/api/admin/spot-track/[diagnosticId]/route.ts   ← endpoint REST (NOVO)
lib/poker/adminSpotTrack.ts                        ← lógica pura (NOVO)
components/admin/AdminSpotTrack.tsx                ← UI (NOVO)
app/admin/resultado/[id]/page.tsx                  ← +1 linha: monta <AdminSpotTrack diagnosticId={id} />
```

### Fluxo de dados

1. Admin abre `/admin/resultado/[id]`.
2. `<AdminSpotTrack diagnosticId={id} />` é renderizado abaixo do `<HealthScoreBlock />`.
3. Componente faz `GET /api/admin/spot-track/[id]`.
4. Endpoint executa em paralelo:
   - `SELECT saved_plan, spots_played FROM reglife_diagnostic_results WHERE id = $1`
   - `SELECT leak_id, hands_played, hands_correct, completed_at, updated_at FROM spot_training_sessions WHERE diagnostic_id = $1`
5. Endpoint chama `mergeTrackWithTraining(plan, rows)` da lib pura.
6. Endpoint responde 200 com `{ hasTrack, spots }` ou `{ hasTrack: false, reason }`.
7. Componente renderiza tabela densa, empty state ou erro.

## Contrato do endpoint

### `GET /api/admin/spot-track/[diagnosticId]`

**Auth/gating:** mesma convenção dos siblings (`/api/admin/health/[diagnosticId]`, `/api/results`) — usa `SUPABASE_SERVICE_ROLE_KEY` server-side, com gating do `/admin/*` herdado do middleware existente. **Não** usa `requireDiagSession` (esse é o gate do aluno).

### Response 200 — success

```json
{
  "hasTrack": true,
  "spots": [
    {
      "index": 1,
      "totalCount": 3,
      "leakId": "RFI-bb15-utg",
      "lessonTitle": "Apresentação dos Ranges e Sizes de abertura cEV",
      "state": "completed",
      "handsPlayed": 52,
      "handsCorrect": 39,
      "accuracyPct": 75,
      "completedAt": "2026-05-28T14:22:01Z",
      "lastActivityAt": "2026-05-28T14:22:01Z"
    },
    {
      "index": 2,
      "totalCount": 3,
      "leakId": "cBet-bb15-utg",
      "lessonTitle": "Polarização no turn",
      "state": "active",
      "handsPlayed": 18,
      "handsCorrect": 11,
      "accuracyPct": 61,
      "completedAt": null,
      "lastActivityAt": "2026-05-31T09:10:00Z"
    },
    {
      "index": 3,
      "totalCount": 3,
      "leakId": "vsOpen-bb15-utg",
      "lessonTitle": "Como decidir entre flat, 3bet ou fold",
      "state": "locked",
      "handsPlayed": 0,
      "handsCorrect": 0,
      "accuracyPct": null,
      "completedAt": null,
      "lastActivityAt": null
    }
  ]
}
```

Campos:
- `state`: `"locked" | "active" | "completed"`.
- `accuracyPct`: número inteiro arredondado, ou `null` se `handsPlayed === 0`.
- `completedAt`: ISO string ou `null`.
- `lastActivityAt`: ISO string ou `null` (nunca treinou esse spot).
- `lessonTitle`: pode ser `null` se o spot não tiver lesson conhecido no `LESSON_CATALOG`.

### Response 200 — empty

```json
{ "hasTrack": false, "reason": "no_saved_plan" }
```

Valores possíveis para `reason`:
- `"abandoned"` — `spots_played === 0`. **Tem precedência sobre `no_saved_plan`** (aluno abandonou antes de chegar a gerar plano).
- `"no_saved_plan"` — `spots_played > 0` mas `saved_plan IS NULL` (raro, mas possível em planos antigos antes da migração 008).
- `"elite_no_track"` — `saved_plan` existe mas `buildSpotTrack(plan)` retorna `[]` (aluno passou em todos os spots do diagnóstico → roteado pra `/reg-life-team`, sem trilha gerada).

### Erros

| Cenário | Status | Body |
|---|---|---|
| `diagnosticId` ausente/malformado | 400 | `{ "error": "diagnosticId required" }` |
| Diagnóstico não existe | 404 | `{ "error": "not found" }` |
| Qualquer falha de DB | 500 | `{ "error": "db error" }` (mensagem real só no log) |

## Lógica pura — `lib/poker/adminSpotTrack.ts`

Função única, sem I/O, fácil de testar:

```ts
import type { SavedPlan } from "@/lib/poker/planStorage";

export interface AdminSpotEntry {
  index: number;          // 1-based
  totalCount: number;     // total de spots na trilha
  leakId: string | null;  // null se o spot da trilha não tiver leakId atribuído
  lessonTitle: string | null;
  state: "locked" | "active" | "completed";
  handsPlayed: number;
  handsCorrect: number;
  accuracyPct: number | null;
  completedAt: string | null;
  lastActivityAt: string | null;
}

export interface TrainingRow {
  leak_id: string;
  hands_played: number;
  hands_correct: number;
  completed_at: string | null;
  updated_at: string | null;
}

export function mergeTrackWithTraining(
  plan: SavedPlan,
  rows: TrainingRow[],
): AdminSpotEntry[];
```

### Regras

1. Chama `buildSpotTrack(plan)` (já existe em `lib/poker/spotTrack.ts`) para obter ordem canônica e `leakId` de cada entry.
2. Indexa `rows` por `leak_id` em um `Map<string, TrainingRow>`.
3. Para cada entry da trilha:
   - Lookup do treino pelo `leakId`. Se não existir, trata como zeros: `handsPlayed=0`, `handsCorrect=0`, `completedAt=null`, `lastActivityAt=null`.
   - `accuracyPct = handsPlayed > 0 ? Math.round((handsCorrect / handsPlayed) * 100) : null`.
   - `lessonTitle` via mesma função `lessonMeta(leakId)` usada no `components/trainer/SpotTrack.tsx:35-43` — extrair pra `lib/poker/lessonCatalog` ou copiar a lógica (decidir no plano de implementação).
4. **Derivação do estado** (mesma regra do front em `components/trainer/SpotTrack.tsx:98-107`):
   - Encontrar `activeIdx` = índice da primeira entry com `completed_at == null` (qualquer falta de linha conta como não-completo).
   - Se `activeIdx === -1` (tudo completo), define `activeIdx = track.length`.
   - Para cada entry no índice `i`: `state = i < activeIdx ? "completed" : i === activeIdx ? "active" : "locked"`.

### Testes

Em `lib/poker/adminSpotTrack.test.ts` (Vitest ou framework escolhido no plano):

| Caso | Cenário | Resultado esperado |
|---|---|---|
| 1 | Trilha com 3 spots, 0 treinos | `[active, locked, locked]`, todos com zeros |
| 2 | Trilha com 3 spots, primeiro `completed_at` setado | `[completed, active, locked]` |
| 3 | Trilha com 3 spots, todos completos | `[completed, completed, completed]` |
| 4 | Plano sem spots (`buildSpotTrack` retorna `[]`) | `[]` |
| 5 | Arredondamento: 18 mãos, 11 corretas (61.11%) | `accuracyPct === 61` |
| 6 | Arredondamento: 13 mãos, 8 corretas (61.5%) | `accuracyPct === 62` |
| 7 | Linha existe com `hands_played === 0` (defensivo) | `accuracyPct === null` |
| 8 | `leakId === null` na entry da trilha | row lookup é skipped, treino fica zero |

## UI — `components/admin/AdminSpotTrack.tsx`

### Estado interno

```ts
type State =
  | { kind: "loading" }
  | { kind: "empty"; reason: "abandoned" | "no_saved_plan" | "elite_no_track" }
  | { kind: "ready"; spots: AdminSpotEntry[] }
  | { kind: "error" };
```

### Layout (success)

Card cinza-neutral, header "TRILHA DE 30 DIAS", tabela densa:

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRILHA DE 30 DIAS                                                   │
│                                                                     │
│ # │ Spot                    │ Estado     │ Mãos    │ %   │ Última  │
│───┼─────────────────────────┼────────────┼─────────┼─────┼─────────│
│ 1 │ RFI — Apresentação      │ ● Concl.   │ 52/50   │ 75% │ 5d      │
│ 2 │ cBet — Polarização      │ ● Ativo    │ 18/50   │ 61% │ 1d      │
│ 3 │ vsOpen — Decisão flat   │ ○ Bloq.    │ 0/50    │ —   │ —       │
└─────────────────────────────────────────────────────────────────────┘
```

Convenções:
- **Bolinha do estado:** `bg-emerald-500` (completed) / `bg-yellow-400` (active) / `bg-neutral-600` (locked). Texto do estado: `"Concl."` / `"Ativo"` / `"Bloq."`.
- **Mãos:** `{handsPlayed}/50`. O 50 é a meta de mãos do sistema (hardcoded em `isSpotComplete`). Não precisa ser configurável.
- **%:** `text-emerald-400` se `accuracyPct >= 70`, `text-amber-400` se `accuracyPct < 70 && handsPlayed > 0`, `—` (cinza) se `accuracyPct === null`.
- **Última:** helper `formatRelative(iso)` que devolve:
  - `null/undefined` → `"—"`
  - mesma data UTC que hoje → `"hoje"`
  - 1 a 7 dias → `"{N}d"`
  - 8 a 30 dias → `"{N}sem"` (semanas arredondadas pra baixo, min 1)
  - >30 dias → `"+1mês"`
- **Título do spot:** preferir `lessonTitle`, com fallback no `leakId` se `null`.

### Layout (empty)

Mesmo card cinza-neutral, mesmo header "TRILHA DE 30 DIAS". Corpo:

| `reason` | Mensagem |
|---|---|
| `abandoned` | "Aluno não jogou nenhum spot." |
| `no_saved_plan` | "Aluno não chegou a gerar plano (abandonou o quiz)." |
| `elite_no_track` | "Aluno passou em todos os spots do diagnóstico — sem trilha." |

Estilo da mensagem: igual ao empty state do `HealthScoreBlock` (`text-xs text-neutral-500`).

### Layout (loading)

Card com texto `"Carregando trilha…"` (`text-sm text-neutral-500`), consistente com o `HealthTable.tsx`.

### Layout (error)

Card com texto `"Não foi possível carregar a trilha."` + botão "Tentar de novo" que refaz o fetch. Log via `console.error` mas sem expor a mensagem ao EV.

## Edição em `app/admin/resultado/[id]/page.tsx`

Acrescentar `<AdminSpotTrack diagnosticId={row.id} />` logo abaixo do `<HealthScoreBlock>` existente (linha 96 hoje):

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
  <div className="mt-6">
    <AdminSpotTrack diagnosticId={row.id} />
  </div>
</div>
```

Sem outras mudanças no arquivo.

## Error handling (camada por camada)

| Camada | Cenário | Comportamento |
|---|---|---|
| Endpoint | `diagnosticId` ausente | 400 `{ error: "diagnosticId required" }` |
| Endpoint | `SELECT` da `reglife_diagnostic_results` falha | log `console.warn("[admin/spot-track]", err)`, 500 |
| Endpoint | Diagnóstico não existe | 404 `{ error: "not found" }` |
| Endpoint | `SELECT` da `spot_training_sessions` falha | log + 500 |
| Endpoint | `saved_plan IS NULL` + `spots_played > 0` | 200 `{ hasTrack: false, reason: "no_saved_plan" }` |
| Endpoint | `spots_played === 0` | 200 `{ hasTrack: false, reason: "abandoned" }` (precedência sobre `no_saved_plan`) |
| Endpoint | `buildSpotTrack` retorna `[]` | 200 `{ hasTrack: false, reason: "elite_no_track" }` |
| `mergeTrackWithTraining` | `rows` vazio | spots todos com zeros; primeiro `active`, demais `locked` |
| Componente | rede falhou | render de erro + botão "Tentar de novo" |
| Componente | resposta JSON malformada | render de erro, `console.error` |

## Testes

1. **`lib/poker/adminSpotTrack.test.ts`** — 8 casos da tabela na seção anterior. Usa fixtures mínimos de `SavedPlan` com 0-3 spots.
2. **`app/api/admin/spot-track/[diagnosticId]/route.test.ts`** — mocka o supabase client, valida:
   - `saved_plan IS NULL` + `spots_played > 0` → `no_saved_plan`.
   - `spots_played === 0` (mesmo com `saved_plan` setado) → `abandoned` tem precedência.
   - Linha não existe → 404.
   - Happy path: 2 spots na trilha + 1 linha de treino → resposta normalizada e ordenada.
3. **`components/admin/AdminSpotTrack.test.tsx`** — se o projeto comportar (a definir no plano): render dos 4 estados (loading / empty `abandoned` / success com 3 spots / error).

## Performance & Risco

- **2 SELECTs adicionais por abertura de `/admin/resultado/[id]`**, ambos indexados (id PK na primeira, `diagnostic_id` index na segunda). Custo negligenciável.
- **Sem impacto no fluxo do aluno:** nada em `/api/spot-training`, `SpotTrack` ou `SpotCard` muda.
- **Sem impacto no Health Score:** este endpoint lê `spot_training_sessions` independentemente.
- **Não toca em schema:** zero migração.

## Critérios de aceite

- [ ] `GET /api/admin/spot-track/{id}` responde 200 com `hasTrack: true` e array `spots` ordenado pra um aluno com trilha + treino.
- [ ] Endpoint responde 200 com `hasTrack: false, reason: "abandoned"` quando `spots_played === 0`.
- [ ] Endpoint responde 200 com `hasTrack: false, reason: "no_saved_plan"` quando há `spots_played > 0` mas `saved_plan IS NULL`.
- [ ] Endpoint responde 200 com `hasTrack: false, reason: "elite_no_track"` quando `saved_plan` existe mas a trilha está vazia.
- [ ] Endpoint responde 404 quando o diagnóstico não existe.
- [ ] `mergeTrackWithTraining` deriva o estado corretamente: primeiro `completed_at == null` → `active`; anteriores → `completed`; posteriores → `locked`.
- [ ] `accuracyPct` é inteiro arredondado quando `handsPlayed > 0`, `null` quando `handsPlayed === 0`.
- [ ] Em `/admin/resultado/[id]`, o bloco "TRILHA DE 30 DIAS" aparece logo abaixo do `HealthScoreBlock`.
- [ ] Estados loading / empty (3 reasons) / success / error rendem cada um seu layout.
- [ ] `formatRelative` retorna `"hoje" | "{N}d" | "{N}sem" | "+1mês" | "—"`.
- [ ] Nenhuma alteração em `/api/spot-training`, `SpotTrack`, `SpotCard`, `HealthScoreBlock`.
