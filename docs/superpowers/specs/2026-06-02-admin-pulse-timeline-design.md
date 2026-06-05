# Spec — Timeline de pulses no admin

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/admin/resultado/[id]`
**Apelido interno:** entrega (c) — admin pulse timeline

## Problema

Hoje, em `/admin/resultado/[id]`, o EV (mentor humano) só vê o agregado `Sentimento` — uma pílula numérica no `HealthScoreBlock` que representa a média dos últimos 4 pulses. Não tem como ver:

- Qual emoji o aluno deu em cada semana específica.
- Tendência ao longo do tempo (estava `grin` por meses, caiu pra `sad` há 2 semanas — sinal forte de churn).
- Quando foi a última resposta (3 dias atrás? 5 semanas atrás?).
- De onde veio cada resposta (in_app, whatsapp, email, link).

Sem isso, o EV não consegue decidir se uma queda no Health Score é um soluço momentâneo ou um padrão merecendo intervenção.

## Escopo desta entrega

Adicionar um bloco **"Timeline de Pulses"** em `/admin/resultado/[id]`, logo abaixo do `<AdminSpotTrack>`. O bloco mostra todos os pulses do ciclo do aluno em uma tira horizontal de emojis, ordenada cronologicamente (esquerda → direita), com label da semana abaixo de cada emoji e um rodapé com "última resposta + source".

**Fora de escopo** (entram em specs posteriores se for o caso):

- Texto livre / comentário no pulse. Hoje é só emoji; manter assim. Adicionar campo exigiria migração + mudança no PulseCard do aluno + mudança em `/api/pulse`.
- Sparkline / gráfico numérico. Mantemos só o glyph emoji — é o que o EV precisa pra leitura rápida.
- Pulse-by-pulse drill-down (modal com timestamp exato, payload do token, etc).
- Notificar EV automaticamente em quedas (`grin → sad`).
- Exportar timeline pra CSV/PDF.

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Foco principal | Tendência ao longo do tempo (tira horizontal) |
| Janela | Todos os pulses do ciclo do aluno (sem corte) |
| Posição na página | Logo abaixo do `<AdminSpotTrack>` |
| Texto livre | NÃO — manter só emoji |
| Distinguir empty states | NÃO — diagnóstico inexistente = nunca respondeu (mesma resposta vazia) |
| Abordagem técnica | Endpoint admin + lib pura + componente |
| Schema change | Nenhum — `pulse_responses` da migração 012 já tem o que precisa |

## Arquitetura

Três peças novas + uma edição cirúrgica:

```
app/api/admin/pulses/[diagnosticId]/route.ts   ← endpoint REST (NOVO)
lib/poker/pulseTimeline.ts                     ← lógica pura (NOVO)
components/admin/PulseTimeline.tsx             ← UI (NOVO)
app/admin/resultado/[id]/page.tsx              ← Modify (adiciona <PulseTimeline /> abaixo do <AdminSpotTrack />)
```

**Sem schema change**, sem alteração em fluxo do aluno (`PulseCard`, `/api/pulse`, cron `weekly-pulse`), sem impacto no Health Score (`lib/health/collect.ts` continua lendo a tabela independentemente).

### Fluxo de dados

1. EV abre `/admin/resultado/[id]`.
2. `<PulseTimeline diagnosticId={row.id} />` renderiza abaixo do `<AdminSpotTrack>`.
3. Componente faz `GET /api/admin/pulses/[id]`.
4. Endpoint: 1 SELECT em `pulse_responses` filtrado por `diagnostic_id`, ordenado por `created_at ASC`.
5. Endpoint delega à lib pura `buildPulseTimeline(rows)` para filtrar valores fora do enum e fazer snake_case → camelCase.
6. Endpoint responde 200 com `{ hasPulses, totalCount, pulses }`.
7. Componente renderiza tira horizontal de emojis ou empty/loading/error.

## Contrato do endpoint

### `GET /api/admin/pulses/[diagnosticId]`

**Auth:** mesma convenção dos siblings (`/api/admin/health/[diagnosticId]`, `/api/admin/spot-track/[diagnosticId]`) — service-role server-side, gating do `/admin/*` herdado do middleware existente. Herda o mesmo gap pré-existente conhecido (matcher estático do middleware não cobre `[diagnosticId]`); tratamento global vira spec separado.

### Response 200 — success

```json
{
  "hasPulses": true,
  "totalCount": 8,
  "pulses": [
    { "weekIso": "2026-W21", "emoji": "grin",  "source": "in_app",   "createdAt": "2026-05-25T14:22:01Z" },
    { "weekIso": "2026-W22", "emoji": "smile", "source": "whatsapp", "createdAt": "2026-06-01T09:10:00Z" },
    { "weekIso": "2026-W28", "emoji": "sad",   "source": "in_app",   "createdAt": "2026-07-13T20:05:00Z" }
  ]
}
```

Campos:
- `totalCount`: `pulses.length` (campo de conveniência).
- `pulses`: ordenados por `createdAt` ASC (cronológico esquerda→direita).
- `emoji`: literal do enum `"sad" | "meh" | "smile" | "grin"`.
- `source`: literal `"in_app" | "whatsapp" | "email" | "link"`.
- `weekIso`: string no formato `"YYYY-Www"` (ex.: `"2026-W21"`).
- `createdAt`: ISO timestamptz.

### Response 200 — empty

```json
{ "hasPulses": false, "totalCount": 0, "pulses": [] }
```

Aluno nunca respondeu pulse, OU diagnóstico não existe. **Não distinguimos os dois casos** (decisão consciente — pulses são opcionais e ortogonais ao plano, distinguir não acrescenta valor pro EV).

### Erros

| Cenário | Status | Body |
|---|---|---|
| `diagnosticId` ausente/malformado | 400 | `{ "error": "diagnosticId required" }` |
| `SELECT` falhou | 500 | `{ "error": "db error" }` (mensagem real só no log) |
| `buildPulseTimeline` jogou (improvável — é pura) | 500 | idem |

**Sem 404.** Diferente dos outros endpoints admin desta página, aqui não checamos se o diagnóstico existe — o caminho `pulse_responses WHERE diagnostic_id = ?` é independente do registro pai. Diagnóstico inexistente devolve `hasPulses: false`, indistinguível de "nunca respondeu".

## Lógica pura — `lib/poker/pulseTimeline.ts`

```ts
export type PulseEmoji = "sad" | "meh" | "smile" | "grin";
export type PulseSource = "in_app" | "whatsapp" | "email" | "link";

export interface PulseRow {
  week_iso: string;
  emoji: string;      // validado dentro de buildPulseTimeline
  source: string;     // idem
  created_at: string;
}

export interface PulseEntry {
  weekIso: string;
  emoji: PulseEmoji;
  source: PulseSource;
  createdAt: string;
}

export function buildPulseTimeline(rows: PulseRow[]): PulseEntry[];
```

### Regras

1. Para cada row, valida `emoji` contra o set `["sad", "meh", "smile", "grin"]`. Inválidos são silenciosamente descartados.
2. Para cada row, valida `source` contra o set `["in_app", "whatsapp", "email", "link"]`. Inválidos descartados.
3. Mapeia `week_iso` → `weekIso`, `created_at` → `createdAt`.
4. Ordena por `createdAt` ASC (estável: rows com mesmo `createdAt` preservam ordem original).
5. Retorna `[]` quando `rows` vazio.

Embora o schema tenha `CHECK` para `emoji` e `source`, a lib defensivamente não confia na conexão — futura conexão direta com dump de teste, schema drift ou bug pode quebrar contrato sem que a lib se dê conta.

### Testes (`lib/poker/pulseTimeline.test.ts` ou smoke `tsx`)

| Caso | Cenário | Resultado esperado |
|---|---|---|
| 1 | 3 rows válidas, fora de ordem | Retorna 3 ordenadas ASC |
| 2 | 1 row com `emoji = "angry"` | Filtra; retorna sem aquela row |
| 3 | 1 row com `source = "telegram"` | Filtra; retorna sem aquela row |
| 4 | Array vazio | Retorna `[]` |
| 5 | 2 rows com mesmo `createdAt` | Mantém ambos; ordem original preservada |

## UI — `components/admin/PulseTimeline.tsx`

### Estado interno

```ts
type State =
  | { kind: "loading" }
  | { kind: "ready"; totalCount: number; pulses: PulseEntry[] }
  | { kind: "empty" }
  | { kind: "error" };
```

Mesmo padrão `reloadTick` dos siblings (`AdminSpotTrack`, `MonthlyScoreboard`) — fetch inline no `useEffect`, retry bumpa o contador.

### Container

```tsx
<section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 print:hidden">
```

Mesmo container dos siblings. `print:hidden` porque timeline é UI viva — não faz sentido no PDF do plano.

### Layout (ready)

```
TIMELINE DE PULSES                                  8 respostas

😄  😄  🙂  😄  🙂  😐  😐  😣
W21 W22 W23 W24 W25 W26 W27 W28

Última resposta: há 2 dias · in_app
```

**Header:**
- Eyebrow esquerda: `"TIMELINE DE PULSES"` (uppercase, `text-[11px] tracking-widest text-neutral-500`).
- Contador direita (`text-xs text-neutral-500`):
  - `0` → não cai aqui (rota empty).
  - `1` → `"1 resposta"`.
  - `>1` → `"{N} respostas"`.

**Tira de emojis (corpo):**
- `<ol>` com `flex gap-3 sm:gap-4 mt-3 overflow-x-auto`.
- Cada pulse vira `<li className="flex flex-col items-center min-w-[40px]">`:
  - **Glyph** (`text-2xl leading-none`): emoji mapeado.
  - **Label da semana** (`text-[10px] text-neutral-500 tabular-nums mt-1`): `shortWeek(weekIso)`.

**Rodapé (sub-info):**
- `<p className="mt-3 text-xs text-neutral-500">`: `"Última resposta: há {formatRelative(last.createdAt)} · {last.source}"`.
- Reusa `formatRelative` de `lib/poker/adminSpotTrack.ts` (já existe, já passou code review).
- `source` mostrado raw (`"in_app"`, `"whatsapp"`, etc.) — pequena consistência com a tabela. Sem tradução / sem ícone.

### Mapas de constantes (top do arquivo)

```ts
const EMOJI_GLYPH: Record<PulseEmoji, string> = {
  sad:   "😣",
  meh:   "😐",
  smile: "🙂",
  grin:  "😄",
};
```

### Helper `shortWeek`

Inline, file-private:

```ts
function shortWeek(iso: string): string {
  // "2026-W21" → "W21"; fallback ao iso bruto se formato inesperado.
  const parts = iso.split("-");
  const last = parts[parts.length - 1] ?? "";
  return /^W\d{1,2}$/.test(last) ? last : iso;
}
```

### Layout (empty)

```tsx
<>
  <p className="text-[11px] uppercase tracking-widest text-neutral-500">
    Timeline de pulses
  </p>
  <p className="mt-3 text-xs text-neutral-500">
    Aluno ainda não respondeu nenhum pulse.
  </p>
</>
```

### Layout (loading)

```tsx
<p className="text-sm text-neutral-500">Carregando timeline…</p>
```

### Layout (error)

```tsx
<div className="flex items-center gap-3">
  <p className="text-sm text-neutral-400">Não foi possível carregar a timeline.</p>
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
```

Mesmo padrão do `AdminSpotTrack.tsx`.

## Edição em `app/admin/resultado/[id]/page.tsx`

Adicionar `<PulseTimeline diagnosticId={row.id} />` logo abaixo do `<AdminSpotTrack>` existente, dentro do mesmo wrapper `space-y-6`:

```tsx
<div className="mx-auto max-w-6xl px-6 pt-6 space-y-6">
  <HealthScoreBlock diagnosticId={row.id} mode="admin" />
  <AdminSpotTrack diagnosticId={row.id} />
  <PulseTimeline diagnosticId={row.id} />
</div>
```

Sem outras mudanças no arquivo.

## Error handling (camada por camada)

| Camada | Cenário | Comportamento |
|---|---|---|
| Endpoint | `diagnosticId` ausente | 400 `{ error: "diagnosticId required" }` |
| Endpoint | `SELECT` falhou | log `console.warn("[admin/pulses] select", err.message)` + 500 |
| Endpoint | `buildPulseTimeline` jogou (improvável) | try/catch + log `[admin/pulses] build threw` + 500 |
| Endpoint | Zero rows (aluno nunca respondeu OU diag inexistente) | 200 `{ hasPulses: false, totalCount: 0, pulses: [] }` |
| `buildPulseTimeline` | rows com emoji/source inválido | Filtra silenciosamente |
| Componente | rede falhou ou `!r.ok` | renderiza erro + botão retry |
| Componente | shape inesperado | `console.error("[PulseTimeline]", err)` + renderiza erro |

## Testes

1. **`lib/poker/pulseTimeline.test.ts`** — 5 casos da tabela em "Testes" da lib. Se o projeto não tiver framework (não tem hoje), smoke `tsx` igual entregas anteriores (apaga script após validar).

2. **Smoke do endpoint via `curl` no dev:**
   - UUID com pulses → JSON com tira ordenada.
   - UUID sem pulses → `hasPulses: false`.
   - UUID malformado / vazio → 400.

3. **Smoke visual no `npm run dev`:**
   - Aluno com 8 pulses: tira renderiza, scroll horizontal funciona quando exceder.
   - Aluno com 0 pulses: empty state aparece.
   - DevTools network → Offline + reload: error + retry funciona.

## Performance & Risco

- **1 SELECT adicional por abertura de `/admin/resultado/[id]`**, indexado (PK composta `(diagnostic_id, week_iso)` cobre o filtro).
- **Sem impacto no fluxo do aluno** — não toca `/api/pulse`, `PulseCard`, cron `weekly-pulse`, `HealthScoreBlock` ou `lib/health/collect.ts`.
- **Sem regressão no Health Score** — leitura paralela; a lib `health/collect.ts` continua usando `pulse_responses` independentemente.
- **Schema imutável** — zero migração.

## Critérios de aceite

- [ ] `GET /api/admin/pulses/{id}` responde 200 com `{ hasPulses: true, totalCount, pulses: [] }` ordenado ASC quando existem rows.
- [ ] Empty 200 com `{ hasPulses: false, totalCount: 0, pulses: [] }` quando aluno nunca respondeu.
- [ ] 400 quando `diagnosticId` ausente.
- [ ] 500 quando `SELECT` ou `buildPulseTimeline` falham (com log).
- [ ] `buildPulseTimeline` filtra rows com `emoji` ou `source` fora dos enums.
- [ ] `buildPulseTimeline` ordena por `createdAt` ASC e mantém ordem estável em empates.
- [ ] Bloco "TIMELINE DE PULSES" aparece em `/admin/resultado/[id]` logo abaixo do `<AdminSpotTrack>`.
- [ ] Tira de emojis renderiza glyph mapeado + label `"W{n}"` em cada `<li>`.
- [ ] Contador no header (`"{N} respostas"` ou `"1 resposta"`).
- [ ] Rodapé com `"Última resposta: há {…} · {source}"` no estado ready.
- [ ] 4 estados (loading / ready / empty / error com retry).
- [ ] `print:hidden` no container.
- [ ] Nenhuma alteração em `/api/pulse`, `PulseCard`, cron `weekly-pulse`, `HealthScoreBlock` ou `lib/health/collect.ts`.
