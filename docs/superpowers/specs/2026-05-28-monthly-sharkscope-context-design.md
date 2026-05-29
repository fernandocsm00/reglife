# Design — Visão mensal SharkScope no contexto do EV

**Data:** 2026-05-28
**Branch:** `onboarding-ev`
**Status:** Aprovado para implementação

---

## 1. Problema

Quando o aluno pergunta ao EV "como tá meu ROI do mês?", a resposta atual é genérica/defensiva ("ainda não temos dados suficientes…") mesmo quando há SharkScope linkado e cron diário rodando. Causas:

1. O builder de contexto (`buildPlayerContextFromDiagnostic`) só lê `sharkscope_snapshot` cumulativo (vida toda) — não tem recorte mensal.
2. A tabela `sharkscope_monthly_stats` já existe e é populada pelo cron mensal (`/api/cron/monthly-sharkscope`), mas só com o mês **anterior fechado**. O mês **corrente** nunca é refrescado.
3. O EV não lê `sharkscope_monthly_stats` em momento algum.

Resultado: o EV não tem dados mensais frescos no system prompt e responde como se não soubesse.

## 2. Objetivo

Dar ao EV uma visão de 3 meses (mês corrente + 2 anteriores fechados) sem bombar a SharkScope API, usando refresh semanal.

## 3. Decisões fechadas no brainstorm

| Decisão | Valor |
|---|---|
| Recorte temporal | Mês corrente + 2 meses anteriores fechados (3 linhas no máximo) |
| Frequência de refresh do mês corrente | 1×/semana, segunda 09h UTC |
| Como o EV usa | Sempre no contexto (system prompt). Sem tool-calling, sem detecção de intent. |
| Storage | Reuso da tabela `sharkscope_monthly_stats` (upsert por `diagnostic_id, year, month`) |
| Notificações | Cron semanal **não** dispara notificação. Só o cron mensal (fechamento) notifica. |
| On-demand refresh | Não. Aluno pergunta → EV responde com o que está em cache. |

## 4. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│ vercel.json crons                                           │
│  • 0 9 * * 1   → /api/cron/weekly-sharkscope    (NOVO)      │
│  • 0 6 1 * *   → /api/cron/monthly-sharkscope   (existente) │
│  • 0 8 * * *   → /api/cron/sharkscope-sync      (existente) │
└────────────────┬────────────────────────────────────────────┘
                 │ upsert mês corrente (semanal) /
                 │ mês anterior fechado (mensal)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Tabela: sharkscope_monthly_stats                            │
│ chave: (diagnostic_id, year, month)                         │
│ campos: entries, profit, avg_roi, itm, final_tables, ...   │
└────────────────┬────────────────────────────────────────────┘
                 │ SELECT … ORDER BY year, month DESC LIMIT 3
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/manager/context.ts                                      │
│ buildPlayerContextFromDiagnostic                            │
│   + monthlyHistory: MonthlyStatsRow[]                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/manager/persona.ts → buildContextBlock                  │
│   inserts block "ÚLTIMOS MESES (SharkScope)" no system      │
│   prompt logo após o bloco SharkScope cumulativo            │
└─────────────────────────────────────────────────────────────┘
```

## 5. Mudanças concretas por arquivo

### 5.1 Novo cron `app/api/cron/weekly-sharkscope/route.ts`

Estrutura espelhada em `app/api/cron/monthly-sharkscope/route.ts` com duas diferenças:

1. Sem flexibilidade de `year`/`month` por query — **sempre** o mês corrente (UTC)
2. **Não** envia `sendEvNotification` — é refresh silencioso

Comportamento:
- Auth via `CRON_SECRET` Bearer (mesmo padrão)
- `export const dynamic = "force-dynamic"`
- `export const maxDuration = 300`
- Lê todos os `reglife_diagnostic_results` com `sharkscope_username` OU `sharkscope_playergroup_id` não-null
- Para cada: chama `client.fetchMonthlyStats(subject, network, year, month)` onde `year`/`month` = `new Date()` UTC
- Upsert na `sharkscope_monthly_stats` com `onConflict: "diagnostic_id,year,month"` usando o mesmo `payload` do cron mensal
- Devolve resumo `{ ok, year, month, total, succeeded, failed, failures[] }`

### 5.2 `vercel.json`

Adicionar:
```json
{
  "path": "/api/cron/weekly-sharkscope",
  "schedule": "0 9 * * 1"
}
```

### 5.3 `lib/sharkscope.ts`

Adicionar tipo público:
```ts
export interface MonthlyStatsRow {
  year: number;
  month: number;
  entries: number | null;
  profit: number | null;
  avg_roi: number | null;
  itm: number | null;
  final_tables: number | null;
}
```

Adicionar função:
```ts
export function monthlyHistoryToText(
  rows: MonthlyStatsRow[],
  opts?: { currentYear: number; currentMonth: number }
): string
```

Output:
```
=== ÚLTIMOS MESES (SharkScope) ===
Maio/2026 (em andamento): 142 torneios | profit +$340 | ROI +8.2% | ITM 14.1%
Abril/2026: 287 torneios | profit -$120 | ROI -3.4% | ITM 11.8%
Março/2026: 198 torneios | profit +$520 | ROI +12.1% | ITM 15.6%
```

Regras de formatação:
- Linhas ordenadas mais recente → mais antigo (mesma ordem da query)
- A linha cujo `(year, month)` == `(currentYear, currentMonth)` recebe sufixo `(em andamento)`
- `entries` faltando → mostra `0 torneios` (não "N/A") — alunos com Shark linkado mas sem volume no mês
- `profit`: `formatProfit` (já existe em `lib/sharkscope.ts:462`)
- `avg_roi`: `formatROI` (já existe)
- `itm`: `formatITM` (já existe)
- Se `rows.length === 0` → devolve string vazia (chamador filtra)

### 5.4 `lib/manager/context.ts`

#### 5.4.1 Estender `PlayerContext`

```ts
export interface PlayerContext {
  // ... existente ...

  // Histórico mensal SharkScope (até 3 entradas, mais recente primeiro)
  monthlyHistory: MonthlyStatsRow[];
}
```

Importar `MonthlyStatsRow` de `@/lib/sharkscope`.

#### 5.4.2 Popular em `buildPlayerContextFromDiagnostic`

Adicionar query (em paralelo às demais via `Promise.allSettled` ou separada — qualquer dos dois é OK, segue padrão local):

```ts
const monthlyRes = await supabase
  .from("sharkscope_monthly_stats")
  .select("year, month, entries, profit, avg_roi, itm, final_tables")
  .eq("diagnostic_id", diagnosticId)
  .order("year", { ascending: false })
  .order("month", { ascending: false })
  .limit(3);

const monthlyHistory = (monthlyRes.data ?? []) as MonthlyStatsRow[];
```

Adicionar `monthlyHistory` no objeto de retorno.

#### 5.4.3 Popular em `buildPlayerContext` (modo com-auth)

Mesma query, mas a chave de filtro depende de como `user_id` mapeia pra `diagnostic_id` no schema com auth. Se a tabela `sharkscope_monthly_stats` tiver `user_id` direto, usar essa coluna; caso contrário, derivar via plan. **Decisão de implementação:** se o caminho com-auth não estiver claramente mapeado pelo schema existente, popular como `[]` neste arquivo (modo com-auth não é o usado em produção atual) e abrir TODO no commit. Não bloquear a entrega da fase 1 (sem-auth) por isso.

### 5.5 `lib/manager/persona.ts`

#### 5.5.1 Renderizar bloco em `buildContextBlock`

Logo após o bloco SharkScope cumulativo (após o `if (ctx.sharkscopeText) ... else ... "SharkScope: não conectado ainda."`), adicionar:

```ts
if (ctx.monthlyHistory.length > 0) {
  const now = new Date();
  const monthlyText = monthlyHistoryToText(ctx.monthlyHistory, {
    currentYear: now.getUTCFullYear(),
    currentMonth: now.getUTCMonth() + 1,
  });
  if (monthlyText) lines.push("\n" + monthlyText);
}
```

Importar `monthlyHistoryToText` de `@/lib/sharkscope`.

#### 5.5.2 Linha curta no `buildBasePersona`

Adicionar ao final da seção "METODOLOGIA REGLIFE":

```
- Quando o aluno perguntar sobre ROI/profit/desempenho do mês, use os dados de "ÚLTIMOS MESES" acima. Se a tabela não vier, diga claramente que a sync da Shark ainda não rodou esta semana — não invente número.
```

## 6. Edge cases (exaustivo)

| Caso | Comportamento esperado |
|---|---|
| Aluno sem Shark linkado | `monthlyHistory: []` → bloco não aparece → comportamento atual preservado |
| Aluno com Shark linkado mas sem volume no mês corrente | Linha mostra `0 torneios` (não "N/A") — EV vê e pode cobrar ação |
| Sync semanal falhou silenciosamente | Linha do mês corrente fica desatualizada (não removida). EV continua respondendo com último dado disponível. Tolerável. |
| Virada de mês entre cron mensal e semanal | Idempotência via upsert: o cron mensal sobrescreve o mês corrente quando ele fecha (dia 1, ~05h UTC). Sem race. |
| 3 meses sem nenhum dado fechado (aluno novo) | Pode ter só 1 ou 2 linhas — `limit(3)` natural. Output mostra só o que tem. |
| Aluno bloqueado na Shark (privacy) | `fetchMonthlyStats` devolve `null` (já tratado no client). O cron pula esse aluno (`reason: "no stats returned"`) e linha não é alterada. |
| Dado parcial (entries OK, avg_roi null) | Formatadores existentes (`formatROI`) já retornam "N/A" graciosamente. Linha aparece com "ROI N/A". EV é orientado a não inventar. |

## 7. Out of scope (intencionalmente)

- **Tool-calling do OpenAI** — rejeitado por complexidade
- **Detecção de intent por palavras-chave** — rejeitado: "sempre no contexto" é mais simples e robusto
- **Cache lazy on-demand** — rejeitado: usuário escolheu cron semanal puro
- **Notificação proativa "olha aqui seu ROI da semana"** — rejeitado: cron semanal é refresh silencioso. Notificações ficam no cron mensal (fechamento).
- **UI no `/meu-plano` mostrando esses 3 meses** — fora do escopo. EV resolve via chat. Se quiser depois, é spec próprio.

## 8. Plano de teste

- [ ] Cron semanal roda manualmente: `GET /api/cron/weekly-sharkscope?secret=<CRON_SECRET>` devolve `{ ok: true, succeeded, failed }` no JSON
- [ ] Verificar no Supabase que `sharkscope_monthly_stats` tem linha pro mês corrente após o run
- [ ] Re-rodar o cron → upsert preserva idempotência (não duplica linha)
- [ ] Em `/manager` (ou rota usada pelo chat) perguntar "como tá meu ROI esse mês?" → EV responde com dados específicos (número, mês, comparativo)
- [ ] Em aluno sem `sharkscope_username` → EV continua respondendo "SharkScope não conectado" (regressão)
- [ ] `npm run build` verde
- [ ] Inspeção do system prompt gerado (log dev) confirma bloco "ÚLTIMOS MESES" presente quando há dados

## 9. Critérios de sucesso

- [ ] Cron `weekly-sharkscope` agendado em `vercel.json`
- [ ] Endpoint responde 200 com `CRON_SECRET` válido e 401 sem
- [ ] `sharkscope_monthly_stats` recebe upsert do mês corrente
- [ ] EV no `/manager` responde com dados mensais frescos quando o aluno pergunta
- [ ] Persona orientada a não inventar quando dado ausente
- [ ] PDF, /meu-plano, /admin não regridem
