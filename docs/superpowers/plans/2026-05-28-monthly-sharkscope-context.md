# Monthly SharkScope no contexto do EV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao EV uma visão de 3 meses do desempenho na SharkScope (mês corrente + 2 anteriores fechados), com refresh semanal do mês corrente, sem bombar a API e sem inventar números quando o dado não vier.

**Architecture:** Novo cron semanal (segunda 09h UTC) faz upsert do mês corrente em `sharkscope_monthly_stats` (tabela que já existe e é alimentada pelo cron mensal com o mês fechado). O builder de contexto do EV passa a ler as últimas 3 linhas dessa tabela e injetar um bloco "ÚLTIMOS MESES" no system prompt. Persona ganha uma orientação curta pra não inventar quando o bloco não vier.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + service_role), Vercel cron, `tsx` para scripts de check.

**⚠️ Branch:** TODO O TRABALHO deve ser feito no branch `onboarding-ev`. Confirme com `git branch --show-current` antes da primeira modificação.

**⚠️ Next.js peculiar:** Este projeto usa Next.js 16 com convenções que podem divergir do padrão. Antes de tocar route handlers, espelhe-se em `app/api/cron/monthly-sharkscope/route.ts` (que é o irmão direto do que vamos criar).

**🧪 Estratégia de teste:** Pure libs (formatadores) ganham scripts `tsx` de verificação. APIs ganham smoke test via build + análise do bundle (sem dev server). Persona/context são verificados via leitura + diff.

---

## File Structure

### Arquivos NOVOS

| Arquivo | Responsabilidade |
|---|---|
| `app/api/cron/weekly-sharkscope/route.ts` | Cron semanal — upsert do mês corrente em `sharkscope_monthly_stats` |
| `scripts/check-monthlyHistoryToText.ts` | Verificação pura do formatador |

### Arquivos MODIFICADOS

| Arquivo | Mudança |
|---|---|
| `lib/sharkscope.ts` | Exportar `MonthlyStatsRow` + função `monthlyHistoryToText` |
| `lib/manager/context.ts` | Estender `PlayerContext` com `monthlyHistory`; popular nos dois builders |
| `lib/manager/persona.ts` | Renderizar bloco "ÚLTIMOS MESES" + linha extra em `buildBasePersona` |
| `vercel.json` | Adicionar entrada de cron `0 9 * * 1` |

### NÃO mudar (fora de escopo)

- `sharkscope_monthly_stats` (tabela já existe — zero migration)
- `lib/manager/persona.ts` outras funções (`buildTriggerInstruction`, `buildWelcomeMessage`, etc.)
- `/meu-plano` UI — visão mensal é só pelo chat por enquanto
- `app/api/cron/monthly-sharkscope/route.ts` — continua igual (dia 1, mês anterior fechado)

---

## Tasks

### Task 1: Baseline + branch

**Files:** read-only

- [ ] **Step 1: Confirmar branch e working tree limpo**

```bash
git branch --show-current
git status --short
```

Expected: `onboarding-ev` e working tree limpo (ignorando arquivos non-tracked normais).

- [ ] **Step 2: Confirmar baseline build verde**

```bash
npm run build 2>&1 | tail -5
```

Expected: exit 0. Output termina com a lista de rotas (`/api/cron/...` etc.) e a legenda de `○ (Static)` / `ƒ (Dynamic)`.

Se falhar: parar e reportar — não é problema do plano.

- [ ] **Step 3: Tag de rollback**

```bash
git tag pre-monthly-sharkscope-context
```

Expected: tag criada localmente (não dá push).

---

### Task 2: Type + formatter em `lib/sharkscope.ts`

**Files:**
- Modify: `lib/sharkscope.ts` (append ao final, antes do `getSharkscopeClient`)
- Create: `scripts/check-monthlyHistoryToText.ts`

- [ ] **Step 1: Criar script de verificação ANTES da implementação**

Create `scripts/check-monthlyHistoryToText.ts`:

```ts
// Verificação pura — roda com: npx tsx scripts/check-monthlyHistoryToText.ts
import {
  monthlyHistoryToText,
  type MonthlyStatsRow,
} from "../lib/sharkscope";

let failed = 0;
function expect(name: string, cond: boolean, debug?: unknown) {
  if (!cond) {
    console.error(`FAIL ${name}`, debug !== undefined ? `→ ${JSON.stringify(debug)}` : "");
    failed++;
  }
}

// --- Caso 1: 3 meses, mês corrente em andamento (maio/2026) ---
const rows3: MonthlyStatsRow[] = [
  { year: 2026, month: 5, entries: 142, profit: 340,  avg_roi: 8.2,  itm: 14.1, final_tables: 3 },
  { year: 2026, month: 4, entries: 287, profit: -120, avg_roi: -3.4, itm: 11.8, final_tables: 6 },
  { year: 2026, month: 3, entries: 198, profit: 520,  avg_roi: 12.1, itm: 15.6, final_tables: 5 },
];
const out3 = monthlyHistoryToText(rows3, { currentYear: 2026, currentMonth: 5 });

expect("inclui cabeçalho", out3.includes("=== ÚLTIMOS MESES (SharkScope) ==="), out3);
expect("inclui Maio/2026 com sufixo (em andamento)", out3.includes("Maio/2026 (em andamento)"), out3);
expect("inclui Abril/2026 sem sufixo (em andamento)", out3.includes("Abril/2026:") && !out3.includes("Abril/2026 (em andamento)"), out3);
expect("inclui Março/2026 sem sufixo", out3.includes("Março/2026:") && !out3.includes("Março/2026 (em andamento)"), out3);
expect("formata profit positivo com +", out3.includes("+$340"), out3);
expect("formata profit negativo com -", out3.includes("-$120"), out3);
expect("formata ROI positivo com +", out3.includes("+8.2%"), out3);
expect("formata ROI negativo com -", out3.includes("-3.4%"), out3);
expect("inclui ITM", out3.includes("14.1%"), out3);

// --- Caso 2: lista vazia → string vazia ---
const outEmpty = monthlyHistoryToText([], { currentYear: 2026, currentMonth: 5 });
expect("lista vazia devolve string vazia", outEmpty === "", outEmpty);

// --- Caso 3: 1 mês só, sem opts (sem marcação "em andamento") ---
const rows1: MonthlyStatsRow[] = [
  { year: 2026, month: 4, entries: 80, profit: 0, avg_roi: 0, itm: 10, final_tables: 0 },
];
const out1 = monthlyHistoryToText(rows1);
expect("1 mês sem opts: aparece linha do mês", out1.includes("Abril/2026:"), out1);
expect("1 mês sem opts: NÃO aparece (em andamento)", !out1.includes("(em andamento)"), out1);

// --- Caso 4: aluno sem volume no mês corrente → 0 torneios (não 'N/A') ---
const rowsZero: MonthlyStatsRow[] = [
  { year: 2026, month: 5, entries: 0, profit: 0, avg_roi: null, itm: null, final_tables: null },
];
const outZero = monthlyHistoryToText(rowsZero, { currentYear: 2026, currentMonth: 5 });
expect("entries=0 mostra '0 torneios'", outZero.includes("0 torneios"), outZero);
expect("entries=0 NÃO mostra 'N/A torneios'", !outZero.includes("N/A torneios"), outZero);
expect("entries=0 do mês corrente mantém '(em andamento)'", outZero.includes("(em andamento)"), outZero);

// --- Caso 5: avg_roi null → 'N/A' no ROI (não bloqueia render) ---
const rowsNullRoi: MonthlyStatsRow[] = [
  { year: 2026, month: 4, entries: 50, profit: 100, avg_roi: null, itm: null, final_tables: null },
];
const outNullRoi = monthlyHistoryToText(rowsNullRoi);
expect("avg_roi null: linha aparece", outNullRoi.includes("Abril/2026:"), outNullRoi);
expect("avg_roi null: ROI mostra N/A", outNullRoi.includes("ROI N/A"), outNullRoi);

// --- Caso 6: meses pt-BR corretos ---
const monthsMap: Array<[number, string]> = [
  [1, "Janeiro"], [2, "Fevereiro"], [3, "Março"], [4, "Abril"],
  [5, "Maio"], [6, "Junho"], [7, "Julho"], [8, "Agosto"],
  [9, "Setembro"], [10, "Outubro"], [11, "Novembro"], [12, "Dezembro"],
];
for (const [m, label] of monthsMap) {
  const r: MonthlyStatsRow[] = [
    { year: 2026, month: m, entries: 10, profit: 0, avg_roi: 0, itm: 0, final_tables: 0 },
  ];
  const o = monthlyHistoryToText(r);
  expect(`mês ${m} → '${label}'`, o.includes(`${label}/2026`), o);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All monthlyHistoryToText checks passed");
```

- [ ] **Step 2: Rodar o script — deve falhar**

```bash
npx tsx scripts/check-monthlyHistoryToText.ts
```

Expected: erro do tipo "has no exported member 'monthlyHistoryToText'" (ou "MonthlyStatsRow").

- [ ] **Step 3: Adicionar tipo + função em `lib/sharkscope.ts`**

Append ao final do arquivo, **antes** da linha `// --- Singleton helper para uso server-side ---` (ou em qualquer lugar do export-block — só não pode quebrar o helper existente):

```ts
// ---------------------------------------------------------------------------
// Histórico mensal (3 meses) injetado no contexto do EV
// ---------------------------------------------------------------------------

/**
 * Forma mínima usada pelo EV. Mapeia 1-pra-1 às colunas de
 * sharkscope_monthly_stats que o formatador consome. Outras colunas
 * (avg_stake, total_roi, etc.) existem na tabela mas não entram no
 * prompt — mantém o contexto curto.
 */
export interface MonthlyStatsRow {
  year: number;
  month: number;
  entries: number | null;
  profit: number | null;
  avg_roi: number | null;
  itm: number | null;
  final_tables: number | null;
}

const MONTH_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Renderiza até 3 meses em texto pra injetar no system prompt do EV.
 * Devolve "" quando `rows.length === 0` — o caller deve filtrar.
 *
 * Regras:
 *  - Ordem preservada (caller envia mais recente → mais antigo)
 *  - Mês `(currentYear, currentMonth)` ganha sufixo "(em andamento)"
 *  - entries null/undefined renderiza como "0 torneios"
 *  - profit/avg_roi/itm usam os formatadores existentes (formatProfit,
 *    formatROI, formatITM); null/undefined viram "N/A"
 */
export function monthlyHistoryToText(
  rows: MonthlyStatsRow[],
  opts?: { currentYear: number; currentMonth: number }
): string {
  if (rows.length === 0) return "";
  const lines: string[] = ["=== ÚLTIMOS MESES (SharkScope) ==="];
  for (const r of rows) {
    const label = `${MONTH_PT[r.month - 1] ?? String(r.month)}/${r.year}`;
    const inProgress =
      opts != null && r.year === opts.currentYear && r.month === opts.currentMonth;
    const head = inProgress ? `${label} (em andamento)` : label;
    const entriesStr = `${r.entries ?? 0} torneios`;
    const profitStr = `profit ${formatProfit(r.profit ?? undefined)}`;
    const roiStr = `ROI ${formatROI(r.avg_roi ?? undefined)}`;
    const itmStr = `ITM ${formatITM(r.itm ?? undefined)}`;
    lines.push(`${head}: ${entriesStr} | ${profitStr} | ${roiStr} | ${itmStr}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Rodar o script — deve passar**

```bash
npx tsx scripts/check-monthlyHistoryToText.ts
```

Expected: `All monthlyHistoryToText checks passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/sharkscope.ts scripts/check-monthlyHistoryToText.ts
git commit -m "feat(sharkscope): add MonthlyStatsRow type and monthlyHistoryToText formatter

Renderiza até 3 meses pra injetar no system prompt do EV. Mês corrente
ganha sufixo '(em andamento)'. Aluno sem volume vira '0 torneios' (não
'N/A torneios'). Check script cobre 6 cenários: 3 meses com em-andamento,
lista vazia, 1 mês sem opts, entries=0, avg_roi=null, e todos os 12 meses
pt-BR."
```

---

### Task 3: Estender `PlayerContext` + popular nos builders

**Files:**
- Modify: `lib/manager/context.ts`

- [ ] **Step 1: Adicionar import de `MonthlyStatsRow`**

No topo de `lib/manager/context.ts`, junto com o import existente de `@/lib/sharkscope`:

```ts
import { snapshotToText, type PlayerSnapshot, type MonthlyStatsRow } from "@/lib/sharkscope";
```

(Substituir a linha existente `import { snapshotToText, type PlayerSnapshot } from "@/lib/sharkscope";` por essa.)

- [ ] **Step 2: Adicionar `monthlyHistory` na interface `PlayerContext`**

Localizar o bloco da interface (deve estar entre as linhas ~31-68). Adicionar o campo logo após `lastSnapshot: PlayerSnapshot | null;` e antes do bloco de "Histórico de conversa":

```ts
  // Histórico mensal SharkScope (até 3, mais recente primeiro)
  monthlyHistory: MonthlyStatsRow[];
```

A interface deve ficar assim no trecho relevante:

```ts
  // SharkScope
  sharkscopeText: string | null;
  lastSnapshot: PlayerSnapshot | null;

  // Histórico mensal SharkScope (até 3, mais recente primeiro)
  monthlyHistory: MonthlyStatsRow[];

  // Histórico de conversa
  recentMessages: RecentMessage[];
```

- [ ] **Step 3: Popular em `buildPlayerContext` (modo com-auth)**

Esse caminho não é usado em produção atual. Manter como `[]` com comentário explícito. No retorno final do `buildPlayerContext`, adicionar logo após `lastSnapshot,`:

```ts
    // monthlyHistory: o modo com-auth ainda não está mapeado pra
    // sharkscope_monthly_stats (a tabela usa diagnostic_id; precisamos
    // resolver via plan → diag_id antes). Fora do escopo desta entrega.
    monthlyHistory: [],
```

- [ ] **Step 4: Popular em `buildPlayerContextFromDiagnostic` (modo sem-auth, o usado em prod)**

Dentro de `buildPlayerContextFromDiagnostic`, **após** a query do `row` que já existe (`const { data: row } = await supabase.from("reglife_diagnostic_results")...`) e **antes** da computação do `sharkscopeText`, adicionar:

```ts
  // 3 últimos meses (mais recente primeiro). Inclui mês corrente quando
  // o cron weekly-sharkscope tiver rodado pelo menos uma vez.
  const monthlyRes = await supabase
    .from("sharkscope_monthly_stats")
    .select("year, month, entries, profit, avg_roi, itm, final_tables")
    .eq("diagnostic_id", diagnosticId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(3);
  const monthlyHistory = (monthlyRes.data ?? []) as MonthlyStatsRow[];
```

E no objeto de retorno final, adicionar (mantendo a vírgula correta — logo após `lastSnapshot,`):

```ts
    lastSnapshot,
    monthlyHistory,
    recentMessages,
```

- [ ] **Step 5: Build pra confirmar tipos**

```bash
npm run build 2>&1 | tail -5
```

Expected: exit 0, sem erros de tipo.

Se reclamar de `MonthlyStatsRow` não exportado: voltar à Task 2 e conferir o export.

- [ ] **Step 6: Commit**

```bash
git add lib/manager/context.ts
git commit -m "feat(manager): extend PlayerContext with monthlyHistory from sharkscope_monthly_stats

buildPlayerContextFromDiagnostic agora carrega as 3 últimas linhas da
tabela (mês corrente + 2 fechados). buildPlayerContext (modo com-auth)
fica com [] por enquanto — mapeamento user_id → diagnostic_id não está
no escopo desta entrega.
"
```

---

### Task 4: Render do bloco em `lib/manager/persona.ts`

**Files:**
- Modify: `lib/manager/persona.ts`

- [ ] **Step 1: Adicionar import de `monthlyHistoryToText`**

No topo de `lib/manager/persona.ts`, adicionar:

```ts
import { monthlyHistoryToText } from "@/lib/sharkscope";
```

(Pode ficar imediatamente após o import existente `import type { PlayerContext } from "./context";`.)

- [ ] **Step 2: Adicionar 1 linha em `buildBasePersona`**

Localizar a função `buildBasePersona`. No final da seção `METODOLOGIA REGLIFE (que você domina):` — ou seja, depois do bullet `- SharkScope: ROI > +5% = vencedor; ...` — adicionar uma nova linha:

```
- Quando o aluno perguntar sobre ROI/profit/desempenho do mês, use os dados de "ÚLTIMOS MESES" abaixo. Se o bloco não vier, diga claramente que a sync semanal da Shark ainda não rodou — NÃO invente número.
```

A string template inteira fica assim no trecho relevante (preserve indentação e fechamento da template string ` `):

```ts
METODOLOGIA REGLIFE (que você domina):
- Tier 1: RFI, C-Bet flop vs BB, Vs RFI, Blind War, Vs C-Bet BB — fundamentos do jogo MTT
- Tier 2: Multiway, Vs 3-bet, C-Bet Turn/River, C-Bet vs BTN, Vs C-Bet BTN — intermediário
- Tier 3: Squeeze, Probe Turn/River, Vs Check-Raise, Delay C-Bet, Pote 3-Bet — avançado
- O plano de 90 dias tem 3 fases: Fundamentos (1-30), Aplicação (31-60), Integração (61-90)
- Early stop no diagnóstico = 3 spots com < 70% de acerto = foco redobrado nos fundamentos
- SharkScope: ROI > +5% = vencedor; -5% a +5% = breakeven; < -5% = perdendo
- Quando o aluno perguntar sobre ROI/profit/desempenho do mês, use os dados de "ÚLTIMOS MESES" abaixo. Se o bloco não vier, diga claramente que a sync semanal da Shark ainda não rodou — NÃO invente número.
`;
```

- [ ] **Step 3: Injetar bloco `monthlyHistoryToText` em `buildContextBlock`**

Localizar o `if (ctx.sharkscopeText) ... else ... "SharkScope: não conectado ainda."` (deve estar entre as linhas ~101-106). Logo **depois** desse if/else, adicionar:

```ts
  // Histórico mensal — só aparece quando há linhas em sharkscope_monthly_stats
  if (ctx.monthlyHistory.length > 0) {
    const now = new Date();
    const monthlyText = monthlyHistoryToText(ctx.monthlyHistory, {
      currentYear: now.getUTCFullYear(),
      currentMonth: now.getUTCMonth() + 1,
    });
    if (monthlyText) lines.push("\n" + monthlyText);
  }
```

O trecho fica assim no contexto:

```ts
  // SharkScope (se disponível)
  if (ctx.sharkscopeText) {
    lines.push("\n" + ctx.sharkscopeText);
  } else {
    lines.push("\nSharkScope: não conectado ainda.");
  }

  // Histórico mensal — só aparece quando há linhas em sharkscope_monthly_stats
  if (ctx.monthlyHistory.length > 0) {
    const now = new Date();
    const monthlyText = monthlyHistoryToText(ctx.monthlyHistory, {
      currentYear: now.getUTCFullYear(),
      currentMonth: now.getUTCMonth() + 1,
    });
    if (monthlyText) lines.push("\n" + monthlyText);
  }

  // Últimas mensagens (contexto de conversa)
```

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/manager/persona.ts
git commit -m "feat(manager): inject monthlyHistory block in system prompt + persona guidance

buildContextBlock renderiza 'ÚLTIMOS MESES' logo após o bloco SharkScope
cumulativo quando ctx.monthlyHistory tem ao menos 1 entrada. buildBasePersona
ganha 1 linha orientando o EV a não inventar número se o bloco não vier.
"
```

---

### Task 5: Cron semanal `/api/cron/weekly-sharkscope`

**Files:**
- Create: `app/api/cron/weekly-sharkscope/route.ts`

- [ ] **Step 1: Estudar a rota irmã**

```bash
cat app/api/cron/monthly-sharkscope/route.ts
```

Observar: o cron mensal lê alunos com `sharkscope_username` OU `playergroup_id` not-null, chama `client.fetchMonthlyStats(subject, network, year, month)`, e faz upsert com `onConflict: "diagnostic_id,year,month"`. A diferença que vamos implementar é só: sem flexibilidade de query (sempre mês corrente UTC), sem notificação.

- [ ] **Step 2: Criar `app/api/cron/weekly-sharkscope/route.ts`**

Conteúdo exato:

```ts
/**
 * GET /api/cron/weekly-sharkscope
 *
 * Roda às segundas 09h UTC. Pra cada aluno com SharkScope conectado
 * (player ou playergroup), busca as stats do MÊS CORRENTE usando o
 * filtro Date: e faz upsert em sharkscope_monthly_stats.
 *
 * Idempotente por (diagnostic_id, year, month) — re-rodar atualiza
 * a linha do mês corrente. Quando o mês fechar (dia 1, ~05h UTC), o
 * cron mensal sobrescreve com os dados finais e notifica o aluno.
 *
 * Este cron NÃO dispara notificação — é refresh silencioso pra alimentar
 * o contexto do EV (3 últimos meses no system prompt).
 *
 * Auth: Bearer ${CRON_SECRET} ou ?secret=... (dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSharkscopeClient, type SharkscopeSubject } from "@/lib/sharkscope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DiagRow {
  id: string;
  sharkscope_username: string | null;
  sharkscope_network: string | null;
  sharkscope_playergroup_id: string | null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const { data: rows, error } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "id, sharkscope_username, sharkscope_network, sharkscope_playergroup_id"
    )
    .or("sharkscope_username.not.is.null,sharkscope_playergroup_id.not.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const client = getSharkscopeClient();
  const results: { id: string; ok: boolean; reason?: string }[] = [];

  for (const row of (rows ?? []) as DiagRow[]) {
    const network = row.sharkscope_network ?? "PokerStars";
    const useGroup = !!row.sharkscope_playergroup_id;
    const subject: SharkscopeSubject = useGroup
      ? { kind: "playergroup", identifier: row.sharkscope_playergroup_id! }
      : { kind: "player", identifier: row.sharkscope_username! };

    try {
      const stats = await client.fetchMonthlyStats(subject, network, year, month);
      if (!stats) {
        results.push({ id: row.id, ok: false, reason: "no stats returned" });
        continue;
      }

      const payload = {
        diagnostic_id: row.id,
        year,
        month,
        source: useGroup ? "playergroup" : "player",
        subject_value: subject.identifier,
        network,
        entries: stats.Entries ?? null,
        count_sessions: stats.Count ?? null,
        avg_stake: stats.AvStake ?? null,
        profit: stats.Profit ?? null,
        avg_roi: stats.AvROI ?? null,
        total_roi: stats.TotalROI ?? null,
        itm: stats.ITM ?? null,
        avg_entrants: stats.AvEntrants ?? null,
        final_tables: stats.FinalTables ?? null,
        re_entries: stats.ReEntries ?? null,
        raw: stats,
      };

      const { error: upErr } = await supabase
        .from("sharkscope_monthly_stats")
        .upsert(payload, { onConflict: "diagnostic_id,year,month" });

      if (upErr) throw upErr;

      results.push({ id: row.id, ok: true });
    } catch (err) {
      console.error(`[cron/weekly-sharkscope] ${row.id}:`, err);
      results.push({
        id: row.id,
        ok: false,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    year,
    month,
    total: rows?.length ?? 0,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    failures: results.filter((r) => !r.ok),
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

- [ ] **Step 3: Build pra confirmar rota é reconhecida**

```bash
npm run build 2>&1 | tail -10
```

Expected: a lista de rotas inclui `ƒ /api/cron/weekly-sharkscope`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/cron/weekly-sharkscope/route.ts"
git commit -m "feat(cron): add /api/cron/weekly-sharkscope refreshing current-month stats

Roda às segundas 09h UTC. Pra cada aluno com Shark linkado, faz upsert
do mês corrente em sharkscope_monthly_stats (mesmo schema do cron
mensal, sem notificação). Auth via CRON_SECRET. Idempotente.
"
```

---

### Task 6: Agendar cron no `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Ler estado atual**

```bash
cat vercel.json
```

Confirmar formato: tem um array `crons` com objetos `{ path, schedule }`.

- [ ] **Step 2: Adicionar entrada do weekly-sharkscope**

Editar `vercel.json` adicionando um objeto no array `crons` (ordem importa pouco — convenção é seguir a ordem alfabética por path, ou agrupar relacionados). Adicionar logo **após** a entrada de `/api/cron/sharkscope-sync` pra ficar perto do irmão:

Antes:
```json
    {
      "path": "/api/cron/sharkscope-sync",
      "schedule": "0 8 * * *"
    },
```

Depois (inserir nova entrada logo abaixo):
```json
    {
      "path": "/api/cron/sharkscope-sync",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/weekly-sharkscope",
      "schedule": "0 9 * * 1"
    },
```

- [ ] **Step 3: Validar JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf-8'))" && echo "vercel.json OK"
```

Expected: `vercel.json OK` (sem stack trace).

- [ ] **Step 4: Build final**

```bash
npm run build 2>&1 | tail -8
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add vercel.json
git commit -m "chore(cron): schedule weekly-sharkscope at Monday 09h UTC

Cron semanal refresca o mês corrente em sharkscope_monthly_stats pra
alimentar o contexto do EV (3 últimos meses no system prompt). Sem
notificação — só refresh silencioso.
"
```

---

### Task 7: Verificação fim-a-fim

**Files:** read-only

- [ ] **Step 1: Build verde**

```bash
npm run build 2>&1 | tail -8
```

Expected: exit 0; output mostra `ƒ /api/cron/weekly-sharkscope` na lista de rotas.

- [ ] **Step 2: Check script verde**

```bash
npx tsx scripts/check-monthlyHistoryToText.ts
```

Expected: `All monthlyHistoryToText checks passed`.

- [ ] **Step 3: Inspeção visual do system prompt (opcional — só se ambiente local tiver env vars)**

Pula se não tiver Supabase configurado localmente. Caso contrário, rodar:

```bash
node -e "
  const { buildPlayerContextFromDiagnostic } = require('./.next/server/chunks/...');
  // (Skip — só inspecionar manualmente em /manager no dev se quiser confirmar)
"
```

Alternativa rápida: rodar `npm run dev`, abrir `/manager` com um aluno que tem dados de `sharkscope_monthly_stats`, mandar "como tá meu mês?" e ver se EV cita números específicos. NÃO obrigatório pra fechar a Task — build verde já valida tipo/sintaxe.

- [ ] **Step 4: Commits revisados**

```bash
git log --oneline pre-monthly-sharkscope-context..HEAD
```

Expected: 5 commits (Task 2, 3, 4, 5, 6). Cada um focado em uma camada.

- [ ] **Step 5: Critérios de sucesso (manual, no Vercel/Supabase)**

Esses passos exigem o ambiente real e ficam **fora** desta task automatizada — anote pro deploy:

- [ ] Cron `weekly-sharkscope` aparece na lista de cron jobs do Vercel após o próximo deploy
- [ ] Rodar manualmente via `GET /api/cron/weekly-sharkscope?secret=<CRON_SECRET>` (ou Bearer) devolve `{ ok: true, succeeded, failed }`
- [ ] Após o run, `sharkscope_monthly_stats` ganha linha pro mês corrente
- [ ] EV no `/manager` responde com dados específicos quando aluno pergunta sobre ROI/mês/profit
- [ ] EV continua respondendo "não conectado" para aluno sem `sharkscope_username` (regressão)

---

## Self-Review

**Spec coverage** (cada §X do spec mapeada pra uma task):
- §5.1 cron `/api/cron/weekly-sharkscope` → Task 5 ✓
- §5.2 entry em `vercel.json` → Task 6 ✓
- §5.3 `MonthlyStatsRow` + `monthlyHistoryToText` em `lib/sharkscope.ts` → Task 2 ✓
- §5.4 `PlayerContext.monthlyHistory` + 2 builders → Task 3 ✓
- §5.5 render em `buildContextBlock` + linha em `buildBasePersona` → Task 4 ✓
- §6 edge cases → cobertos no check script (Task 2) + comentários no código
- §7 out of scope — não há tasks pra eles, ok
- §8 plano de teste → Task 7 (manual no deploy + npm run build + check scripts)
- §9 critérios de sucesso → Task 7 step 5

**Placeholder scan:** nenhum "TODO/TBD" no plano. A nota de §5.4.3 sobre o modo com-auth é uma decisão documentada (não placeholder) e instruída como `[]` literal na Task 3 step 3.

**Type consistency:**
- `MonthlyStatsRow` definida em Task 2 e usada em Task 3, 4 — mesma forma
- `monthlyHistoryToText(rows, opts?)` definida em Task 2, consumida em Task 4 com `{ currentYear, currentMonth }` — assinatura bate
- `ctx.monthlyHistory` adicionada em Task 3, lida em Task 4 — campo bate

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-monthly-sharkscope-context.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Plano enxuto (7 tasks) — em ~15min sai.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints.

**Which approach?**
