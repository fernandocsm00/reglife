# Coach IA — Fase C (Cadência + Pulse + UI do Health Score) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aluno escolhe cadência (leve/ritmada/intensa) no onboarding, responde pulse semanal (in-app ou link curto via WhatsApp), e vê seu Health Score em dois lugares no `/meu-plano` (bloco grande + 5º stat no EvHud).

**Architecture:** Três sub-sistemas independentes que compartilham `lib/notify.ts` (estendido com `pulse_request` kind + filtro de cadência) e a tabela `pulse_responses` (já criada pela migração 012). HMAC token assina link curto do WA. Endpoint `/api/health/me` lê snapshot pro cliente; rota `/api/pulse` valida HMAC e grava voto.

**Tech Stack:** Next.js 16 (App Router — versão com breaking changes, ler `node_modules/next/dist/docs/` antes de mexer em route handler), TypeScript, Supabase (service-role no cron, anon+cookie no cliente), Node `crypto.createHmac` para token do pulse, `tsx` para scripts de verificação.

---

## Spec de referência

`docs/superpowers/specs/2026-05-25-coach-ia-fase-c-design.md` (commit `56544be`).

## Pré-condições do ambiente

- Branch `onboarding-ev` checked out, working tree limpo.
- Migração 012 já aplicada no Supabase (Fase A) — disponíveis: `pulse_responses` table e coluna `reglife_diagnostic_results.notify_cadence`.
- `.env.local` com: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `SESSION_SECRET` (≥16 chars). Não precisamos de `PULSE_SECRET` separado — o token reusa `SESSION_SECRET`.

## Realidade descoberta no código

- `OnboardingForm.tsx` tem `TOTAL_STEPS = 7` e usa `autoAdvance(setter, next)` onde `next` pode ser número ou `"submit"`. O `finalSubmit(bancaValue)` aceita `BancaAnswer` mas NÃO usa o `phone` capturado no step 1 como `whatsappPhone` (hardcoda `null`). Vamos preservar esse comportamento existente (não correr atrás de outro bug) e só adicionar o campo de cadência no novo step 8.
- `/api/leads` lê `body.notifyChannels` e `body.whatsappPhone` mas não persiste o phone do step 1. Mantemos. Adicionamos só `notify_cadence`.
- `EvHud` usa `grid-cols-2 sm:grid-cols-4`. Vai virar `grid-cols-2 sm:grid-cols-5` no Task 14.
- `PlanScreen.tsx` importa `EvHud` na linha 9. O `HealthScoreBlock` entra ali junto, renderizado acima.
- `requireDiagSession(declared)` em `lib/session.ts` é o padrão: cookie `rl_diag` HttpOnly assinado com `SESSION_SECRET`, valida que `declared === sessionDiag`.
- `NotificationKind` (Fase A T9) tem 14 valores. Precisa ganhar **`pulse_request`** como 15º.
- `EvTrigger` em `ev-voice.ts` tem 14 valores também. Adicionar **`pulse_request`**.
- `app/api/cron/health-score/route.ts` (Fase A T12) é o template canônico de cron route handler pro Next 16.

## File Structure (Fase C)

**Cria (10):**

```
lib/triggers/cadenceRules.ts                  — tabela trigger×cadência (pura)
lib/pulse/token.ts                            — sign/verify HMAC (puro)
lib/pulse/weekIso.ts                          — week_iso atual (puro)
app/api/cron/weekly-pulse/route.ts            — cron domingo 12h UTC
app/api/pulse/route.ts                        — GET (validate) + POST (vote)
app/p/[token]/page.tsx                        — Server Component da página do link
app/api/health/me/route.ts                    — endpoint pra UI do aluno
components/trainer/PulseCard.tsx              — card 4-emoji no /meu-plano
components/trainer/HealthScoreBlock.tsx       — bloco grande no /meu-plano
scripts/check-cadence-rules.ts                — verificador da matriz
scripts/check-pulse-token.ts                  — verificador do HMAC
```

**Modifica (6):**

```
lib/notify.ts                          — adiciona pulse_request kind + filtro whatsappAllowed
lib/ev-voice.ts                        — adiciona pulse_request trigger + label
lib/triggers/dailyCheckin.ts           — early-return se cadence === "leve"
components/trainer/EvHud.tsx           — 5º stat (HS) + grid-cols-5
components/trainer/PlanScreen.tsx      — renderiza <HealthScoreBlock> e <PulseCard>
components/trainer/OnboardingForm.tsx  — step 8 (cadência) + OnboardingData
app/api/leads/route.ts                 — persiste body.notifyCadence
vercel.json                            — adiciona cron weekly-pulse
```

**Convenção:**

- `lib/triggers/cadenceRules.ts`, `lib/pulse/token.ts`, `lib/pulse/weekIso.ts` são **puros** (sem I/O); testáveis via `scripts/check-*.ts`.
- Rotas seguem o template de `app/api/cron/health-score/route.ts` (Fase A): `NextRequest`/`NextResponse`, `export const dynamic = "force-dynamic"`, `isAuthorized(req)` pro cron, `requireDiagSession` pras rotas do aluno.
- `cadenceRules.ts` exporta `whatsappAllowed(kind, cadence)` consumido pelo `notify.ts`.

---

### Task 1: Estender `NotificationKind` + `EvTrigger` com `pulse_request`

**Files:**
- Modify: `lib/notify.ts` (NotificationKind type union)
- Modify: `lib/ev-voice.ts` (EvTrigger type union + triggerHumanLabel map)

- [ ] **Step 1.1: Editar `lib/notify.ts` (NotificationKind, linha ~15-29)**

Localizar (a Fase A deixou 14 valores):
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

Adicionar `| "pulse_request"` ao final:

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
  | "health_band_change"
  | "pulse_request";
```

- [ ] **Step 1.2: Editar `lib/ev-voice.ts` (EvTrigger type union)**

Localizar:
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

Adicionar `| "pulse_request"` ao final:

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
  | "health_band_change"
  | "pulse_request";
```

- [ ] **Step 1.3: Editar `lib/ev-voice.ts` (triggerHumanLabel `m` object)**

Adicionar dentro do `m` map (depois de `health_band_change`):

```ts
  pulse_request: "Pulse semanal — pergunta de 1-tap sobre como o aluno se sentiu na semana.",
```

- [ ] **Step 1.4: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: 0 erros. (Se houver erro de exaustividade em algum switch, é porque o pattern existente em outro arquivo verifica todos os kinds — vai precisar adicionar `pulse_request` lá também. **Reportar com path:linha** antes de mudar.)

- [ ] **Step 1.5: Commit**

```bash
git add lib/notify.ts lib/ev-voice.ts
git commit -m "feat(notify): novo kind/trigger pulse_request (Fase C)"
```

---

### Task 2: `lib/triggers/cadenceRules.ts` (matriz pura)

**Files:**
- Create: `lib/triggers/cadenceRules.ts`

- [ ] **Step 2.1: Escrever**

```ts
/**
 * lib/triggers/cadenceRules.ts — Decide quais canais sairem por (kind, cadência).
 *
 * A cadência é uma preferência por aluno (`reglife_diagnostic_results.notify_cadence`).
 * Esta tabela mapeia ALOJADAS a partir do spec da Fase C:
 *   - `in_app` sempre sai pra todos (feed do EV é fonte da verdade — não filtramos).
 *   - WhatsApp filtra conforme a tabela.
 *
 * Função pura. Sem I/O. Quem lê a cadência do aluno é `lib/notify.ts:sendNotification`.
 */

import type { NotificationKind } from "@/lib/notify";

export type Cadence = "leve" | "ritmada" | "intensa";

type Channel = "in_app" | "whatsapp";

/** Canais permitidos pra (kind, cadência). */
export const CADENCE_CHANNELS: Record<NotificationKind, Record<Cadence, ReadonlyArray<Channel>>> = {
  // Triggers de coaching (núcleo do EV)
  daily_checkin:       { leve: [],                    ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  weekly_review:       { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  post_session:        { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  streak_risk:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  pulse_request:       { leve: ["in_app"],            ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_alert:          { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_closed:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  health_band_change:  { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  phase_transition:    { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  plan_delivered:      { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },

  // Outros kinds: gamificação só in_app (não enche o WA do aluno leve nem ritmada)
  badge_unlocked:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_assigned:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_done:          { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  quest_expiring:      { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
  drop_active:         { leve: ["in_app"],            ritmada: ["in_app"],            intensa: ["in_app"] },
};

/** True se WhatsApp pode sair pra esse (kind, cadência). */
export function whatsappAllowed(kind: NotificationKind, cadence: Cadence): boolean {
  const channels = CADENCE_CHANNELS[kind]?.[cadence];
  return channels?.includes("whatsapp") ?? false;
}

/** True se in_app pode sair pra esse (kind, cadência). Pra Fase C, in_app é
 *  filtrado APENAS pra daily_checkin no leve (que é []). Os outros casos
 *  sempre listam in_app. Função separada pra evolução futura. */
export function inAppAllowed(kind: NotificationKind, cadence: Cadence): boolean {
  const channels = CADENCE_CHANNELS[kind]?.[cadence];
  return channels?.includes("in_app") ?? true;
}
```

- [ ] **Step 2.2: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: 0 erros. Se houver "Property '<kind>' is missing in type", quer dizer que a Task 1 não incluiu `pulse_request` em algum dos pontos esperados — re-verificar Task 1.

- [ ] **Step 2.3: Commit**

```bash
git add lib/triggers/cadenceRules.ts
git commit -m "feat(triggers): matriz trigger×cadência (whatsappAllowed/inAppAllowed)"
```

---

### Task 3: Verificador da matriz de cadência

**Files:**
- Create: `scripts/check-cadence-rules.ts`

- [ ] **Step 3.1: Escrever**

```ts
/**
 * scripts/check-cadence-rules.ts — Verifica que a matriz de cadência
 * casa com a tabela aprovada no spec da Fase C.
 *
 * Rodar com: npx tsx scripts/check-cadence-rules.ts
 */

import { whatsappAllowed, inAppAllowed } from "../lib/triggers/cadenceRules";

function assert(label: string, got: boolean, expected: boolean) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${got}, expected ${expected}`);
  if (!ok) process.exitCode = 1;
}

// daily_checkin: leve=❌ tudo, ritmada/intensa = in_app+WA
console.log("\n=== daily_checkin");
assert("leve  → wa",     whatsappAllowed("daily_checkin", "leve"),     false);
assert("leve  → in_app", inAppAllowed   ("daily_checkin", "leve"),     false);
assert("ritmada → wa",   whatsappAllowed("daily_checkin", "ritmada"),  true);
assert("intensa → wa",   whatsappAllowed("daily_checkin", "intensa"),  true);

// weekly_review: leve=só in_app, ritmada/intensa = in_app+WA
console.log("\n=== weekly_review");
assert("leve  → wa",     whatsappAllowed("weekly_review", "leve"),     false);
assert("leve  → in_app", inAppAllowed   ("weekly_review", "leve"),     true);
assert("ritmada → wa",   whatsappAllowed("weekly_review", "ritmada"),  true);

// pulse_request: leve=só in_app, ritmada/intensa = in_app+WA
console.log("\n=== pulse_request");
assert("leve  → wa",     whatsappAllowed("pulse_request", "leve"),     false);
assert("ritmada → wa",   whatsappAllowed("pulse_request", "ritmada"),  true);

// streak_risk: sempre in_app+WA (todos)
console.log("\n=== streak_risk");
assert("leve  → wa",     whatsappAllowed("streak_risk",   "leve"),     true);
assert("ritmada → wa",   whatsappAllowed("streak_risk",   "ritmada"),  true);
assert("intensa → wa",   whatsappAllowed("streak_risk",   "intensa"),  true);

// leak_alert / leak_closed / health_band_change / phase_transition / plan_delivered: sempre WA
console.log("\n=== sempre-WA triggers");
assert("leak_alert leve → wa",        whatsappAllowed("leak_alert",       "leve"),    true);
assert("leak_closed leve → wa",       whatsappAllowed("leak_closed",      "leve"),    true);
assert("health_band_change leve → wa",whatsappAllowed("health_band_change","leve"),   true);
assert("phase_transition leve → wa",  whatsappAllowed("phase_transition", "leve"),    true);
assert("plan_delivered leve → wa",    whatsappAllowed("plan_delivered",   "leve"),    true);

// Gamificação: nunca WA
console.log("\n=== gamificação (nunca WA)");
assert("badge_unlocked ritmada → wa", whatsappAllowed("badge_unlocked",   "ritmada"), false);
assert("quest_done ritmada → wa",     whatsappAllowed("quest_done",       "ritmada"), false);
assert("drop_active intensa → wa",    whatsappAllowed("drop_active",      "intensa"), false);

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir cadenceRules.ts antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
```

- [ ] **Step 3.2: Rodar**

```bash
npx tsx scripts/check-cadence-rules.ts
```

Esperado: todas as linhas PASS e `✓ Todos os checks passaram.` no fim. Se FAIL, **abortar** e revisar `cadenceRules.ts` (NÃO modificar os asserts).

- [ ] **Step 3.3: Commit**

```bash
git add scripts/check-cadence-rules.ts
git commit -m "test(cadence): script de verificação da matriz trigger×cadência"
```

---

### Task 4: Filtro de cadência em `lib/notify.ts`

**Files:**
- Modify: `lib/notify.ts` (função `sendNotification`, ler `notify_cadence` + filtrar canais)

- [ ] **Step 4.1: Editar imports**

No topo de `lib/notify.ts`, adicionar (logo após o import de `generateEvVoice`):

```ts
import { whatsappAllowed, type Cadence } from "@/lib/triggers/cadenceRules";
```

- [ ] **Step 4.2: Adicionar `notify_cadence` ao `DiagPrefs`**

Localizar a interface `DiagPrefs` (~linha 39-47). Adicionar `notify_cadence: string | null`:

```ts
interface DiagPrefs {
  player_name: string;
  discord_webhook_url: string | null;
  whatsapp_phone: string | null;
  notify_channels: string[] | null;
  notify_quiet_start: number | null;
  notify_quiet_end: number | null;
  timezone: string | null;
  notify_cadence: string | null;
}
```

- [ ] **Step 4.3: Editar a query do prefs em `sendNotification`**

Localizar (~linha 130-136):
```ts
  const { data: prefs } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "player_name, discord_webhook_url, whatsapp_phone, notify_channels, notify_quiet_start, notify_quiet_end, timezone"
    )
    .eq("id", args.diagnosticId)
    .single<DiagPrefs>();
```

Adicionar `notify_cadence` à lista do select:

```ts
  const { data: prefs } = await supabase
    .from("reglife_diagnostic_results")
    .select(
      "player_name, discord_webhook_url, whatsapp_phone, notify_channels, notify_quiet_start, notify_quiet_end, timezone, notify_cadence"
    )
    .eq("id", args.diagnosticId)
    .single<DiagPrefs>();
```

- [ ] **Step 4.4: Adicionar filtro de cadência ao WhatsApp**

Localizar (~linha 166):
```ts
  if (!inQuiet && enabled.has("whatsapp") && prefs?.whatsapp_phone) {
    const ok = await sendWhatsapp(prefs.whatsapp_phone, args, prefs.player_name);
    if (ok) channelsSent.push("whatsapp");
  }
```

Trocar por (adicionando o check de cadência):

```ts
  // Cadência do aluno modula WhatsApp por kind. Default = "ritmada" (mesmo
  // default do banco). Se for um kind/cadência sem WhatsApp permitido, pula.
  const cadence = ((prefs?.notify_cadence ?? "ritmada") as Cadence);
  if (
    !inQuiet &&
    enabled.has("whatsapp") &&
    prefs?.whatsapp_phone &&
    whatsappAllowed(args.kind, cadence)
  ) {
    const ok = await sendWhatsapp(prefs.whatsapp_phone, args, prefs.player_name);
    if (ok) channelsSent.push("whatsapp");
  }
```

- [ ] **Step 4.5: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4.6: Commit**

```bash
git add lib/notify.ts
git commit -m "feat(notify): filtra WhatsApp por (kind × cadência) do aluno"
```

---

### Task 5: Early-return de `fireDailyCheckin` no leve

**Files:**
- Modify: `lib/triggers/dailyCheckin.ts` (adicionar guarda antes do check de dia útil)

Contexto: A matriz da Task 2 já garante que WhatsApp não sai pra `daily_checkin` no leve. Mas `sendEvNotification` ainda criaria o registro `in_app`. O spec aprovou: **no leve, daily_checkin não dispara nem in-app**. Esta task adiciona a guarda no handler.

- [ ] **Step 5.1: Editar imports**

No topo de `lib/triggers/dailyCheckin.ts`, adicionar:

```ts
import { type Cadence } from "@/lib/triggers/cadenceRules";
```

- [ ] **Step 5.2: Estender `fireDailyCheckin` args com `cadence`**

Localizar a assinatura de `fireDailyCheckin`:

```ts
export async function fireDailyCheckin(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
  tasksChecked: number;
  tasksExpected: number;
}): Promise<"fired" | "throttled" | "noop"> {
```

Adicionar `cadence`:

```ts
export async function fireDailyCheckin(args: {
  diagnosticId: string;
  playerName: string;
  cycleDay: number;
  currentPhase: string;
  tasksChecked: number;
  tasksExpected: number;
  cadence: Cadence;
}): Promise<"fired" | "throttled" | "noop"> {
```

- [ ] **Step 5.3: Adicionar guarda no início do corpo**

Logo no início (antes do `if (!isWeekday())`):

```ts
  // Leve não recebe daily_checkin (nem in_app). Spec da Fase C decidiu.
  if (args.cadence === "leve") return "noop";

  if (!isWeekday()) return "noop";
```

- [ ] **Step 5.4: Atualizar o caller em `daily-pulse/route.ts`**

Localizar a função `maybeDailyCheckin` em `app/api/cron/daily-pulse/route.ts`. Hoje ela passa 6 campos. Precisa:
1. Ler `notify_cadence` da diagRow.
2. Passar como `cadence` pra `fireDailyCheckin`.

Localizar:
```ts
  return fireDailyCheckin({
    diagnosticId: row.id,
    playerName: row.player_name,
    cycleDay,
    currentPhase: phase,
    tasksChecked: 0,
    tasksExpected: 0,
  });
```

Trocar por:
```ts
  return fireDailyCheckin({
    diagnosticId: row.id,
    playerName: row.player_name,
    cycleDay,
    currentPhase: phase,
    tasksChecked: 0,
    tasksExpected: 0,
    cadence: (row.notify_cadence ?? "ritmada") as Cadence,
  });
```

Também na interface `DiagRow` no topo do mesmo arquivo, adicionar:
```ts
  notify_cadence: string | null;
```

E no `select` da query principal:
```ts
.select("id, player_name, created_at, notify_cadence")
```

E adicionar o import no topo do `daily-pulse/route.ts`:
```ts
import { type Cadence } from "@/lib/triggers/cadenceRules";
```

- [ ] **Step 5.5: Build local**

```bash
npm run build
```

Esperado: sucesso (compila daily-pulse + dailyCheckin com a nova assinatura).

- [ ] **Step 5.6: Commit**

```bash
git add lib/triggers/dailyCheckin.ts app/api/cron/daily-pulse/route.ts
git commit -m "feat(triggers): dailyCheckin respeita cadência leve (early-noop)"
```

---

### Task 6: `lib/pulse/token.ts` + `lib/pulse/weekIso.ts` (puros)

**Files:**
- Create: `lib/pulse/token.ts`
- Create: `lib/pulse/weekIso.ts`

- [ ] **Step 6.1: Escrever `lib/pulse/token.ts`**

```ts
/**
 * lib/pulse/token.ts — Sign/verify do token do pulse semanal.
 *
 * O token vai no link curto `https://reg.life/p/<token>` mandado pelo EV.
 * Formato: `<diagnosticId>~<weekIso>~<sig>` onde sig = primeiros 16 chars
 * da base64url de HMAC-SHA256(SESSION_SECRET, "<diagId>.<weekIso>").
 *
 * Reusamos SESSION_SECRET (mesmo segredo do cookie de diag). Mesmo nível
 * de confidencialidade; spec da Fase C aprovou a reutilização.
 *
 * Comparação em tempo constante. Função pura — sem I/O.
 */

import { createHmac } from "node:crypto";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[pulse/token] SESSION_SECRET ausente ou curto (<16) em produção");
  }
  return "dev-session-secret-DO-NOT-USE-IN-PROD-min-32-chars";
}

function signature(diagnosticId: string, weekIso: string): string {
  const payload = `${diagnosticId}.${weekIso}`;
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 16);
}

export function signPulseToken(diagnosticId: string, weekIso: string): string {
  return `${diagnosticId}~${weekIso}~${signature(diagnosticId, weekIso)}`;
}

export function verifyPulseToken(
  token: string
): { diagnosticId: string; weekIso: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split("~");
  if (parts.length !== 3) return null;
  const [diagnosticId, weekIso, sig] = parts;
  if (!diagnosticId || !weekIso || !sig) return null;
  // Sanity: diag deve parecer um uuid; weekIso deve parecer 2026-W21
  if (!/^[0-9a-f-]{32,36}$/i.test(diagnosticId)) return null;
  if (!/^\d{4}-W\d{2}$/.test(weekIso)) return null;
  const expected = signature(diagnosticId, weekIso);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { diagnosticId, weekIso } : null;
}
```

- [ ] **Step 6.2: Escrever `lib/pulse/weekIso.ts`**

```ts
/**
 * lib/pulse/weekIso.ts — Computa a semana ISO 8601 (formato "YYYY-Www").
 *
 * Usamos a semana ISO porque é estável internacionalmente e tem boundary
 * previsível (segunda-feira). O cron de pulse roda domingo 12h UTC e usa
 * `weekIsoNow()` no momento da execução pra rotular a semana que está
 * acabando.
 *
 * Função pura. Sem timezone do aluno nesta fase — UTC é suficiente.
 */

/** ISO week number (1..53) pra uma data UTC. */
function isoWeekNumber(date: Date): number {
  // Algoritmo padrão: clone, ajusta pra quinta-feira da mesma semana, conta
  // semanas desde a primeira quinta-feira do ano.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** Ano ISO da data (pode diferir do `getUTCFullYear` em fronteira de ano). */
function isoWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  return d.getUTCFullYear();
}

/** "2026-W21" pra qualquer Date (UTC). */
export function weekIsoOf(date: Date): string {
  const year = isoWeekYear(date);
  const week = isoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** "2026-W21" pra agora (UTC). */
export function weekIsoNow(): string {
  return weekIsoOf(new Date());
}
```

- [ ] **Step 6.3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6.4: Commit**

```bash
git add lib/pulse/token.ts lib/pulse/weekIso.ts
git commit -m "feat(pulse): token HMAC + helper de week ISO"
```

---

### Task 7: Verificador do token + week ISO

**Files:**
- Create: `scripts/check-pulse-token.ts`

- [ ] **Step 7.1: Escrever**

```ts
/**
 * scripts/check-pulse-token.ts — Verifica sign/verify roundtrip e adversários.
 *
 * Rodar com: SESSION_SECRET=test-secret-32-chars-min-1234 npx tsx scripts/check-pulse-token.ts
 *
 * (Sem env var, o módulo usa o default dev — funciona pro teste local.)
 */

import { signPulseToken, verifyPulseToken } from "../lib/pulse/token";
import { weekIsoOf } from "../lib/pulse/weekIso";

function assertEq<T>(label: string, got: T, expected: T) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${String(got)}, expected ${String(expected)}`);
  if (!ok) process.exitCode = 1;
}

function assertDeep(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  if (!ok) process.exitCode = 1;
}

console.log("\n=== Caso 1: roundtrip sign → verify");
const diag = "11111111-2222-3333-4444-555555555555";
const week = "2026-W21";
const token = signPulseToken(diag, week);
console.log(`  token: ${token}`);
assertDeep("verify", verifyPulseToken(token), { diagnosticId: diag, weekIso: week });

console.log("\n=== Caso 2: token truncado (manipulado)");
assertEq("truncado", verifyPulseToken(token.slice(0, token.length - 1)), null);

console.log("\n=== Caso 3: troca a semana sem re-assinar");
const forged = `${diag}~2026-W22~${token.split("~")[2]}`;
assertEq("semana alterada", verifyPulseToken(forged), null);

console.log("\n=== Caso 4: diag mal formatado");
assertEq("diag-curto", verifyPulseToken(`abc~2026-W21~deadbeef`), null);

console.log("\n=== Caso 5: weekIso mal formatado");
assertEq("week-curto", verifyPulseToken(`${diag}~2026-21~deadbeef`), null);

console.log("\n=== Caso 6: empty");
assertEq("vazio", verifyPulseToken(""), null);

console.log("\n=== Caso 7: weekIsoOf");
// 2026-01-01 (quinta) cai na semana 1 do ISO 2026
assertEq("2026-01-01", weekIsoOf(new Date("2026-01-01T12:00:00Z")), "2026-W01");
// 2026-12-31 cai na quinta da W53 (ISO 2026 tem 53 semanas)
assertEq("2026-12-31", weekIsoOf(new Date("2026-12-31T12:00:00Z")), "2026-W53");
// 2025-12-29 (segunda) já é W01 de 2026
assertEq("2025-12-29 (border)", weekIsoOf(new Date("2025-12-29T12:00:00Z")), "2026-W01");

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
```

- [ ] **Step 7.2: Rodar**

```bash
npx tsx scripts/check-pulse-token.ts
```

Esperado: 7 blocos PASS + `✓ Todos os checks passaram.`. Se algum FAIL, **abortar** e revisar `token.ts` ou `weekIso.ts`.

- [ ] **Step 7.3: Commit**

```bash
git add scripts/check-pulse-token.ts
git commit -m "test(pulse): verificador do token HMAC e do week ISO"
```

---

### Task 8: `/api/pulse` (GET + POST)

**Files:**
- Create: `app/api/pulse/route.ts`

- [ ] **Step 8.1: Ler template do Next 16**

```bash
ls node_modules/next/dist/docs/ 2>/dev/null | head
```

Se houver guia de route handler, ler. Caso contrário, seguir o template canônico de `app/api/cron/health-score/route.ts` (Fase A T12).

- [ ] **Step 8.2: Escrever `app/api/pulse/route.ts`**

```ts
/**
 * /api/pulse — Vote do pulse semanal.
 *
 * GET ?token=...  → valida HMAC, retorna { diagnosticId, weekIso, alreadyVoted }.
 *                   Usado por /p/[token] no SSR pra renderizar a página.
 *
 * POST { token, vote, source } → valida HMAC + upsert em pulse_responses.
 *                   PK (diagnostic_id, week_iso) garante anti-double.
 *                   `source` ∈ ("in_app", "link"). "email" e "whatsapp" estão
 *                   reservados pra Fases futuras (Fase B email, Fase C+1 webhook).
 *
 * Rate-limit por token (10/h) — defende contra brute-force no HMAC.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPulseToken } from "@/lib/pulse/token";
import { clientIp, hit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Emoji = "sad" | "meh" | "smile" | "grin";
type Source = "in_app" | "link";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[api/pulse] SUPABASE env vars missing");
  }
  return createClient(url, key);
}

function isValidEmoji(v: unknown): v is Emoji {
  return v === "sad" || v === "meh" || v === "smile" || v === "grin";
}
function isValidSource(v: unknown): v is Source {
  return v === "in_app" || v === "link";
}

// ---------------------------------------------------------------------------
// GET — usado pela página /p/[token] no SSR
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Rate-limit defensivo por IP (200/h é generoso pra SSR + retries)
  const ip = clientIp(req);
  const ipCheck = hit(`pulse:get:ip:${ip}`, 200, 60 * 60 * 1000);
  if (!ipCheck.ok) return rateLimitResponse(ipCheck);

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const parsed = verifyPulseToken(token);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = service();
  const { data } = await supabase
    .from("pulse_responses")
    .select("emoji, source, created_at")
    .eq("diagnostic_id", parsed.diagnosticId)
    .eq("week_iso", parsed.weekIso)
    .maybeSingle();

  return NextResponse.json({
    diagnosticId: parsed.diagnosticId,
    weekIso: parsed.weekIso,
    alreadyVoted: data
      ? { emoji: data.emoji as Emoji, source: data.source as string, at: data.created_at }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST — registra voto
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 10 POSTs/h por IP — alguém legítimo posta 1x; brute-force precisa de muito mais
  const ipCheck = hit(`pulse:post:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!ipCheck.ok) return rateLimitResponse(ipCheck);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token, vote, source } = (body ?? {}) as {
    token?: string;
    vote?: string;
    source?: string;
  };

  if (!token || !vote || !source) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const parsed = verifyPulseToken(token);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (!isValidEmoji(vote)) {
    return NextResponse.json({ error: "invalid_vote" }, { status: 400 });
  }
  if (!isValidSource(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }

  // Rate-limit por token (defende contra brute-force do HMAC)
  const tokenCheck = hit(`pulse:post:token:${token}`, 10, 60 * 60 * 1000);
  if (!tokenCheck.ok) return rateLimitResponse(tokenCheck);

  const supabase = service();
  const { error } = await supabase.from("pulse_responses").upsert(
    {
      diagnostic_id: parsed.diagnosticId,
      week_iso: parsed.weekIso,
      emoji: vote,
      source,
    },
    { onConflict: "diagnostic_id,week_iso" }
  );

  if (error) {
    console.error("[api/pulse] upsert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8.3: Build local**

```bash
npm run build
```

Esperado: sucesso, com a rota `ƒ /api/pulse` listada.

- [ ] **Step 8.4: Smoke local (opcional, depende de SESSION_SECRET ser idêntico no .env e shell)**

`npm run dev` em outro terminal, depois:

```bash
# Esse token vai falhar verify (não foi assinado com seu SESSION_SECRET):
curl -s "http://localhost:3000/api/pulse?token=abc~2026-W21~deadbeefdeadbeef"
# Esperado: {"error":"invalid_token"}
```

- [ ] **Step 8.5: Commit**

```bash
git add app/api/pulse/route.ts
git commit -m "feat(pulse): rota /api/pulse — GET valida, POST upsert com anti-double"
```

---

### Task 9: Página `/p/[token]`

**Files:**
- Create: `app/p/[token]/page.tsx`

- [ ] **Step 9.1: Escrever**

```tsx
/**
 * /p/[token] — página pública do pulse semanal.
 *
 * Server Component que faz fetch de /api/pulse?token=... e renderiza
 * 4 botões emoji. Após click, POST → mensagem "Anotado!".
 *
 * NÃO usa session cookie. Toda a auth é o HMAC no token.
 */

import { PulseLinkClient } from "./PulseLinkClient";

interface VerifyResult {
  diagnosticId?: string;
  weekIso?: string;
  alreadyVoted?: { emoji: string; source: string; at: string } | null;
  error?: string;
}

async function verify(token: string): Promise<VerifyResult> {
  // Em SSR, o fetch precisa de URL absoluta. Usamos NEXT_PUBLIC_SITE_URL ou
  // VERCEL_URL pra montar. Se nenhum estiver setado, cai pra localhost.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const res = await fetch(`${base}/api/pulse?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return { error: `http_${res.status}` };
  return (await res.json()) as VerifyResult;
}

export default async function PulseLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verify(token);

  if (result.error || !result.diagnosticId || !result.weekIso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold">Link inválido ou expirado</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Esse link não funciona. Abre o app pra responder direto no /meu-plano.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PulseLinkClient
      token={token}
      weekIso={result.weekIso}
      alreadyVoted={result.alreadyVoted ?? null}
    />
  );
}
```

- [ ] **Step 9.2: Escrever o client component**

**File:** `app/p/[token]/PulseLinkClient.tsx`

```tsx
"use client";

import { useState } from "react";

type Emoji = "sad" | "meh" | "smile" | "grin";

interface Props {
  token: string;
  weekIso: string;
  alreadyVoted: { emoji: string; source: string; at: string } | null;
}

const EMOJIS: Array<{ value: Emoji; label: string; glyph: string }> = [
  { value: "sad",   label: "Difícil",  glyph: "😣" },
  { value: "meh",   label: "Cansativa",glyph: "😐" },
  { value: "smile", label: "Boa",      glyph: "🙂" },
  { value: "grin",  label: "Excelente",glyph: "😄" },
];

export function PulseLinkClient({ token, weekIso, alreadyVoted }: Props) {
  const [submitted, setSubmitted] = useState<Emoji | null>(
    (alreadyVoted?.emoji as Emoji) ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(emoji: Emoji) {
    if (submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, vote: emoji, source: "link" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `http_${res.status}`);
        return;
      }
      setSubmitted(emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          EV · semana {weekIso}
        </p>
        <h1 className="mt-3 text-2xl font-bold">Como foi sua semana?</h1>
        <p className="mt-2 text-sm text-neutral-400">Um toque, sem texto. 1 segundo.</p>

        <div className="mt-10 grid grid-cols-4 gap-3">
          {EMOJIS.map((e) => {
            const selected = submitted === e.value;
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => vote(e.value)}
                disabled={submitting || !!submitted}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${
                  selected
                    ? "border-amber-400/70 bg-amber-400/15"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                } ${(submitting || !!submitted) && !selected ? "opacity-30" : ""}`}
              >
                <span className="text-3xl">{e.glyph}</span>
                <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                  {e.label}
                </span>
              </button>
            );
          })}
        </div>

        {submitted && (
          <p className="mt-8 text-sm text-emerald-300">
            Anotado! O EV vai usar isso pro próximo plano.
          </p>
        )}
        {error && (
          <p className="mt-6 text-sm text-red-400">Erro: {error}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.3: Build local**

```bash
npm run build
```

Esperado: sucesso. A rota `ƒ /p/[token]` aparece no route table.

- [ ] **Step 9.4: Commit**

```bash
git add app/p/[token]/page.tsx app/p/[token]/PulseLinkClient.tsx
git commit -m "feat(pulse): página pública /p/[token] do link curto"
```

---

### Task 10: Cron `/api/cron/weekly-pulse`

**Files:**
- Create: `app/api/cron/weekly-pulse/route.ts`
- Modify: `vercel.json` (adiciona entry de cron)

- [ ] **Step 10.1: Ler doc Next 16**

Mesmo aviso da Task 8 — checar `node_modules/next/dist/docs/` se mudou alguma convenção desde a Fase A. Caso contrário, espelhar `app/api/cron/health-score/route.ts`.

- [ ] **Step 10.2: Escrever `app/api/cron/weekly-pulse/route.ts`**

```ts
/**
 * GET /api/cron/weekly-pulse
 *
 * Cron domingo 12h UTC. Para cada aluno ativo (ciclo ≤120d):
 *   - Idempotência: pula se já há pulse_responses ou notification pulse_request
 *     da semana corrente.
 *   - Cria notification kind=pulse_request com payload.token (link curto).
 *   - sendEvNotification cuida da narrativa via EV-voice; canal de WA
 *     respeita cadenceRules (leve = só in_app).
 *
 * Auth: Bearer ${CRON_SECRET} (header) ou ?secret=... (dev).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listActiveStudents } from "@/lib/health/collect";
import { sendEvNotification, hasNotificationRecently } from "@/lib/notify";
import { signPulseToken } from "@/lib/pulse/token";
import { weekIsoNow } from "@/lib/pulse/weekIso";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Outcome {
  diagnosticId: string;
  ok: boolean;
  status?: "fired" | "skipped_already_voted" | "skipped_already_sent";
  error?: string;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[cron/weekly-pulse] SUPABASE env vars missing");
  return createClient(url, key);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = service();
  const ids = await listActiveStudents();
  const weekIso = weekIsoNow();
  const outcomes: Outcome[] = [];

  for (const id of ids) {
    try {
      // 1) Já votou nessa semana?
      const { data: existingVote } = await supabase
        .from("pulse_responses")
        .select("emoji")
        .eq("diagnostic_id", id)
        .eq("week_iso", weekIso)
        .maybeSingle();
      if (existingVote) {
        outcomes.push({ diagnosticId: id, ok: true, status: "skipped_already_voted" });
        continue;
      }

      // 2) Já mandamos pulse_request essa semana (idempotência em re-runs)?
      const recentlySent = await hasNotificationRecently(id, "pulse_request", 24 * 6);
      if (recentlySent) {
        outcomes.push({ diagnosticId: id, ok: true, status: "skipped_already_sent" });
        continue;
      }

      const token = signPulseToken(id, weekIso);
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://reg.life");
      const link = `${baseUrl}/p/${token}`;

      await sendEvNotification({
        diagnosticId: id,
        kind: "pulse_request",
        trigger: "pulse_request",
        title: "Como foi sua semana?",
        facts: {
          semana_iso: weekIso,
          link_pulse: link,
        },
        fallback: `Bate aqui em um emoji: ${link}`,
        payload: { token, weekIso, link },
      });

      outcomes.push({ diagnosticId: id, ok: true, status: "fired" });
    } catch (err) {
      console.error(`[cron/weekly-pulse] ${id}:`, err);
      outcomes.push({
        diagnosticId: id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    weekIso,
    total: ids.length,
    fired: outcomes.filter((o) => o.status === "fired").length,
    skipped_voted: outcomes.filter((o) => o.status === "skipped_already_voted").length,
    skipped_sent: outcomes.filter((o) => o.status === "skipped_already_sent").length,
    failed: outcomes.filter((o) => !o.ok).length,
    failures: outcomes.filter((o) => !o.ok),
  });
}
```

- [ ] **Step 10.3: Adicionar ao `vercel.json`**

Editar `vercel.json` adicionando entry depois do `health-score`:

```json
    {
      "path": "/api/cron/weekly-pulse",
      "schedule": "0 12 * * 0"
    }
```

- [ ] **Step 10.4: Build local**

```bash
npm run build
```

Esperado: route table mostra `ƒ /api/cron/weekly-pulse`.

- [ ] **Step 10.5: Commit**

```bash
git add app/api/cron/weekly-pulse/route.ts vercel.json
git commit -m "feat(cron): weekly-pulse domingo 12h UTC com link curto + idempotência"
```

---

### Task 11: `PulseCard` no `/meu-plano`

**Files:**
- Create: `components/trainer/PulseCard.tsx`
- Modify: `components/trainer/PlanScreen.tsx` (renderizar `<PulseCard />`)

- [ ] **Step 11.1: Escrever `components/trainer/PulseCard.tsx`**

```tsx
"use client";

/**
 * PulseCard — Card semanal de pulse no /meu-plano.
 *
 * Aparece apenas se há uma notification pulse_request aberta desta semana
 * sem resposta. Após o aluno votar, some.
 *
 * Lê o token via GET /api/manager/chat (que retorna notifications + payload).
 * Vota via POST /api/pulse com source=in_app.
 */

import { useEffect, useState } from "react";

type Emoji = "sad" | "meh" | "smile" | "grin";

interface Props {
  diagnosticId: string | undefined;
}

interface PulseState {
  token: string;
  weekIso: string;
  alreadyVoted: boolean;
}

const EMOJIS: Array<{ value: Emoji; glyph: string; label: string }> = [
  { value: "sad",   glyph: "😣", label: "Difícil" },
  { value: "meh",   glyph: "😐", label: "Cansou" },
  { value: "smile", glyph: "🙂", label: "Boa" },
  { value: "grin",  glyph: "😄", label: "Top" },
];

export function PulseCard({ diagnosticId }: Props) {
  const [state, setState] = useState<PulseState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Emoji | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosticId) return;
    let mounted = true;
    // Busca a notification pulse_request mais recente pelo histórico do chat.
    // /api/manager/chat?userId=diag:<id> devolve mensagens com payload.message
    // pras notifications. Aqui precisamos do payload bruto (token), então
    // pedimos direto a tabela via /api/profile/notifications (que já existe).
    fetch(`/api/profile/notifications?diagnosticId=${diagnosticId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const items: Array<{ kind: string; payload: { token?: string; weekIso?: string } | null; created_at: string }> =
          data?.notifications ?? [];
        const pulse = items
          .filter((n) => n.kind === "pulse_request" && n.payload?.token && n.payload?.weekIso)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (!pulse?.payload?.token || !pulse.payload.weekIso) return;
        // Confere se já votou via /api/pulse?token=
        fetch(`/api/pulse?token=${encodeURIComponent(pulse.payload.token)}`)
          .then((r) => r.json())
          .then((p) => {
            if (!mounted) return;
            if (p?.error) return;
            setState({
              token: pulse.payload!.token!,
              weekIso: pulse.payload!.weekIso!,
              alreadyVoted: !!p.alreadyVoted,
            });
            if (p.alreadyVoted) setSubmitted(p.alreadyVoted.emoji);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [diagnosticId]);

  async function vote(emoji: Emoji) {
    if (!state || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token, vote: emoji, source: "in_app" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `http_${res.status}`);
        return;
      }
      setSubmitted(emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network");
    } finally {
      setSubmitting(false);
    }
  }

  // Sem pulse_request aberto → não renderiza nada
  if (!state) return null;
  // Já votou → some (não polui o feed)
  if (state.alreadyVoted) return null;

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 print:hidden">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-amber-200">Como foi sua semana?</h3>
        <span className="text-[10px] uppercase text-amber-300/60">{state.weekIso}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {EMOJIS.map((e) => {
          const selected = submitted === e.value;
          return (
            <button
              key={e.value}
              type="button"
              onClick={() => vote(e.value)}
              disabled={submitting || !!submitted}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
                selected
                  ? "border-amber-400 bg-amber-400/20"
                  : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"
              } ${(submitting || !!submitted) && !selected ? "opacity-30" : ""}`}
            >
              <span className="text-2xl">{e.glyph}</span>
              <span className="text-[10px] text-neutral-400">{e.label}</span>
            </button>
          );
        })}
      </div>
      {submitted && (
        <p className="mt-3 text-xs text-emerald-300">Anotado.</p>
      )}
      {error && (
        <p className="mt-3 text-xs text-red-400">Erro: {error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: Integrar no `PlanScreen.tsx`**

Abrir `components/trainer/PlanScreen.tsx`. Adicionar o import no topo, junto com os outros:

```ts
import { PulseCard } from "./PulseCard";
```

Localizar o `return (` da função `PlanScreen` e renderizar `<PulseCard diagnosticId={plan.diagnosticId} />` em um lugar coerente — ideal: dentro do container principal, ABAIXO do `<EvHud />` ou onde estiver natural. Como não foi possível ver o JSX completo no plano, o implementer deve **inspecionar o arquivo** e escolher um spot que esteja entre o topo do plano e a lista de tasks. Se for ambíguo, colocar logo após o EvHud, com um espaçamento (`<div className="mt-4">…</div>` ou similar — usar o padrão do arquivo).

- [ ] **Step 11.3: Build local**

```bash
npm run build
```

- [ ] **Step 11.4: Commit**

```bash
git add components/trainer/PulseCard.tsx components/trainer/PlanScreen.tsx
git commit -m "feat(pulse): PulseCard semanal no /meu-plano (4 emojis, in_app)"
```

---

### Task 12: `/api/health/me`

**Files:**
- Create: `app/api/health/me/route.ts`

- [ ] **Step 12.1: Escrever**

```ts
/**
 * GET /api/health/me?diag=<id>
 *
 * Devolve o snapshot mais recente de player_health_snapshots pro aluno
 * dono do cookie de diag.
 *
 * Auth: requireDiagSession — só o aluno dono pode ler seu próprio HS.
 *
 * Se ainda não houve cron pra esse aluno, devolve `snapshot: null` (UI
 * mostra empty state).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDiagSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[api/health/me] SUPABASE env vars missing");
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const diagParam = req.nextUrl.searchParams.get("diag");
  const session = await requireDiagSession(diagParam);
  if (!session.ok) return session.response;

  const supabase = service();
  const { data, error } = await supabase
    .from("player_health_snapshots")
    .select("day, health, band, breakdown")
    .eq("diagnostic_id", session.diagId)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ snapshot: null });
  }

  return NextResponse.json({
    snapshot: {
      day: data.day,
      health: Number(data.health),
      band: data.band,
      breakdown: data.breakdown ?? null,
    },
  });
}
```

- [ ] **Step 12.2: Build**

```bash
npm run build
```

- [ ] **Step 12.3: Commit**

```bash
git add app/api/health/me/route.ts
git commit -m "feat(health): rota /api/health/me — snapshot do aluno (cookie-protected)"
```

---

### Task 13: `<HealthScoreBlock />` componente + integração no PlanScreen

**Files:**
- Create: `components/trainer/HealthScoreBlock.tsx`
- Modify: `components/trainer/PlanScreen.tsx` (renderiza acima do EvHud)

- [ ] **Step 13.1: Escrever `HealthScoreBlock.tsx`**

```tsx
"use client";

/**
 * HealthScoreBlock — Bloco grande do Health Score no /meu-plano.
 *
 * Fetch GET /api/health/me?diag=<id>. Renderiza:
 *   - número grande (0-100)
 *   - barra de progresso colorida por band
 *   - 3 pílulas: Resultado / Conclusão / Sentimento
 *
 * Se não houver snapshot ainda → empty state.
 */

import { useEffect, useState } from "react";

type Band = "green" | "yellow" | "orange" | "red";

interface Breakdown {
  resultado: number | null;
  conclusao: number | null;
  sentimento: number | null;
  leaksClosed?: number;
  leaksTotal?: number;
}

interface Snapshot {
  day: string;
  health: number;
  band: Band;
  breakdown: Breakdown | null;
}

interface Props {
  diagnosticId: string | undefined;
}

const BAND_LABEL: Record<Band, string> = {
  green:  "VERDE",
  yellow: "AMARELO",
  orange: "LARANJA",
  red:    "VERMELHO",
};

const BAND_BAR: Record<Band, string> = {
  green:  "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red:    "bg-red-500",
};

const BAND_TEXT: Record<Band, string> = {
  green:  "text-emerald-300",
  yellow: "text-yellow-300",
  orange: "text-orange-300",
  red:    "text-red-300",
};

export function HealthScoreBlock({ diagnosticId }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);

  useEffect(() => {
    if (!diagnosticId) {
      setSnapshot(null);
      return;
    }
    let mounted = true;
    fetch(`/api/health/me?diag=${encodeURIComponent(diagnosticId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return;
        setSnapshot((data?.snapshot as Snapshot | null) ?? null);
      })
      .catch(() => { if (mounted) setSnapshot(null); });
    return () => { mounted = false; };
  }, [diagnosticId]);

  if (snapshot === undefined) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-500 print:hidden">
        Carregando seu Health Score…
      </div>
    );
  }

  if (snapshot === null) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400 print:hidden">
        <p className="font-semibold text-neutral-200">Health Score</p>
        <p className="mt-1 text-xs text-neutral-500">
          Seu Health Score aparece aqui depois do primeiro cálculo (cron diário 06h UTC).
        </p>
      </div>
    );
  }

  const { health, band, breakdown } = snapshot;
  const pct = Math.max(0, Math.min(100, Math.round(health)));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 print:hidden">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Health Score
        </p>
        <p className={`text-[11px] uppercase tracking-widest ${BAND_TEXT[band]}`}>
          {BAND_LABEL[band]}
        </p>
      </div>

      <div className="mt-2 flex items-end gap-4">
        <div className={`text-5xl font-bold tabular-nums ${BAND_TEXT[band]}`}>{pct}</div>
        <div className="flex-1 pb-2">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full ${BAND_BAR[band]}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Pill label="Resultado"  value={breakdown?.resultado} />
        <Pill label="Conclusão"  value={breakdown?.conclusao} />
        <Pill label="Sentimento" value={breakdown?.sentimento} />
      </div>

      {breakdown?.leaksTotal != null && breakdown.leaksTotal > 0 && (
        <p className="mt-3 text-[11px] text-neutral-500">
          Leaks fechados: <span className="text-neutral-300">{breakdown.leaksClosed ?? 0}/{breakdown.leaksTotal}</span>
        </p>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: number | null | undefined }) {
  const display =
    value === null || value === undefined ? "—" : Math.round(value).toString();
  const tone =
    value === null || value === undefined ? "text-neutral-500" : "text-neutral-200";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${tone}`} title={display === "—" ? "Sem dados ainda" : undefined}>
        {display}
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Integrar no PlanScreen**

Abrir `components/trainer/PlanScreen.tsx`. Adicionar import:

```ts
import { HealthScoreBlock } from "./HealthScoreBlock";
```

Localizar o `EvHud` no JSX. Renderizar `<HealthScoreBlock diagnosticId={plan.diagnosticId} />` IMEDIATAMENTE ANTES dele (e antes do `<PulseCard />` da Task 11, se possível na ordem visual: HealthScoreBlock → EvHud → PulseCard).

O implementer deve inspecionar o JSX e usar o padrão de spacing/margin do arquivo. Se houver wrapper já presente (ex: `<div className="space-y-4">…</div>`), inserir como filho. Caso contrário, adicionar `className="mb-4"` no novo bloco.

- [ ] **Step 13.3: Build**

```bash
npm run build
```

- [ ] **Step 13.4: Commit**

```bash
git add components/trainer/HealthScoreBlock.tsx components/trainer/PlanScreen.tsx
git commit -m "feat(health): HealthScoreBlock no /meu-plano (número + barra + 3 pílulas)"
```

---

### Task 14: 5º stat HS no `EvHud`

**Files:**
- Modify: `components/trainer/EvHud.tsx`

- [ ] **Step 14.1: Editar a grid + adicionar 5º Stat**

Localizar a `div` que envolve os 4 stats:
```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
```

Trocar por:
```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
```

- [ ] **Step 14.2: Adicionar fetch do health no início do componente**

Logo após o `useState<PlanProgressSummary | null>(null)` existente, adicionar:

```ts
  const [health, setHealth] = useState<{ value: number; band: "green" | "yellow" | "orange" | "red" } | null>(null);

  useEffect(() => {
    if (!diagnosticId) return;
    let mounted = true;
    fetch(`/api/health/me?diag=${encodeURIComponent(diagnosticId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data?.snapshot) return;
        setHealth({ value: data.snapshot.health, band: data.snapshot.band });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [diagnosticId]);
```

- [ ] **Step 14.3: Adicionar 5º `<Stat>` ao grid**

Imediatamente ANTES do fechamento `</div>` do grid (após o stat de Quest):

```tsx
        <Stat
          icon="🩺"
          label="HS"
          value={health ? `${Math.round(health.value)}` : "—"}
          sub={health ? bandLabel(health.band) : undefined}
          accent={health ? bandAccent(health.band) : "neutral"}
        />
```

- [ ] **Step 14.4: Adicionar helpers no final do arquivo (após `QuestRow`)**

```ts
function bandLabel(band: "green" | "yellow" | "orange" | "red"): string {
  switch (band) {
    case "green":  return "verde";
    case "yellow": return "amarelo";
    case "orange": return "laranja";
    case "red":    return "vermelho";
  }
}

function bandAccent(band: "green" | "yellow" | "orange" | "red"): "amber" | "emerald" | "neutral" {
  if (band === "green") return "emerald";
  if (band === "yellow") return "amber";
  return "neutral"; // orange/red ficam neutros no contexto do Hud (vermelho explícito pode espantar)
}
```

- [ ] **Step 14.5: Build**

```bash
npm run build
```

- [ ] **Step 14.6: Commit**

```bash
git add components/trainer/EvHud.tsx
git commit -m "feat(hud): adiciona 5º stat HS no EvHud (compacto)"
```

---

### Task 15: Pergunta de cadência no Onboarding + persistência em `/api/leads`

**Files:**
- Modify: `components/trainer/OnboardingForm.tsx` (TOTAL_STEPS, step 8, OnboardingData, autoAdvance do step 7)
- Modify: `app/api/leads/route.ts` (ler body.notifyCadence, insert)

- [ ] **Step 15.1: Editar tipo `OnboardingData`**

Localizar a interface `OnboardingData` (~linha 31-44). Adicionar campo `notifyCadence`:

```ts
export interface OnboardingData {
  playerName: string;
  email: string;
  phone: string;
  notifyChannels: string[];
  whatsappPhone: string | null;
  quizAnswers: QuizAnswers;
  leadScore: number;
  leadCategory: LeadCategory;
  stakeGrade: number;
  studyTime: StudyTime;
  profitGoal: ProfitGoal;
  volumeTargetWeekly: number;
  notifyCadence: "leve" | "ritmada" | "intensa";
}
```

- [ ] **Step 15.2: Adicionar `TOTAL_STEPS = 8` e nova state**

Localizar `const TOTAL_STEPS = 7;`. Trocar pra `8`.

Após os states do quiz (`const [banca, setBanca] = ...`), adicionar:

```ts
  const [notifyCadence, setNotifyCadence] = useState<"leve" | "ritmada" | "intensa">("ritmada");
```

- [ ] **Step 15.3: Editar `finalSubmit` pra incluir `notifyCadence`**

Localizar `finalSubmit`. Trocar a assinatura pra não receber `bancaValue` (o step 7 agora apenas seta banca e avança pra step 8). O step 8 chamará `finalSubmit()` sem argumento.

```ts
  const finalSubmit = () => {
    if (!banca) return;
    const completeQuiz: QuizAnswers = {
      idade: idade!,
      tempo: tempo!,
      objetivo: objetivo!,
      abi: abi!,
      volume: volume!,
      banca,
    };

    const leadScore = computeLeadScore(completeQuiz);
    const leadCategory = computeLeadCategory(leadScore);
    const stakeGrade = computeStakeGrade(completeQuiz);

    onSubmit({
      playerName: playerName.trim(),
      email: email.trim().toLowerCase(),
      phone,
      notifyChannels: ["email"],
      whatsappPhone: null,
      quizAnswers: completeQuiz,
      leadScore,
      leadCategory,
      stakeGrade,
      studyTime: defaultStudyTime(),
      profitGoal: objetivoToProfitGoal(objetivo!),
      volumeTargetWeekly: volumeToWeeklyTarget(volume!),
      notifyCadence,
    });
  };
```

- [ ] **Step 15.4: Mudar o step 7 (banca) pra avançar pra step 8 em vez de submit**

Localizar:
```ts
                onChange={autoAdvance(setBanca, "submit")}
```

Trocar por:
```ts
                onChange={autoAdvance(setBanca, 8)}
```

- [ ] **Step 15.5: Adicionar step 8 (cadência) ao JSX**

Após o bloco `{step === 7 && (...)}` no JSX, ANTES do `</AnimatePresence>`:

```tsx
          {step === 8 && (
            <StepWrapper key="cadencia">
              <Title>Quanto o EV deve te cobrar?</Title>
              <Sub>Você escolhe a frequência. Pode mudar depois com o coach.</Sub>

              <div className="mt-8 space-y-2">
                {[
                  { value: "leve" as const,    label: "Pouco — só quando importar",   sub: "Sem check-in diário. EV só fala quando há sinal forte." },
                  { value: "ritmada" as const, label: "Na medida — recomendado",       sub: "Plano da semana + reviews. Default da maioria." },
                  { value: "intensa" as const, label: "Sem moleza — me cobra todo dia", sub: "Check-in diário, EV em cima do plano." },
                ].map((o) => {
                  const selected = notifyCadence === o.value;
                  return (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => setNotifyCadence(o.value)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? "border-amber-400/70 bg-amber-400/15 text-amber-100"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-xs text-neutral-400">{o.sub}</span>
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected ? "border-amber-400 bg-amber-400" : "border-neutral-700"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={false}
                  onClick={() => finalSubmit()}
                  label="Concluir →"
                />
              </div>
              <BackBar onBack={() => setStep(7)} />
            </StepWrapper>
          )}
```

- [ ] **Step 15.6: Editar `app/api/leads/route.ts` pra persistir `notify_cadence`**

Abrir o arquivo. Localizar o bloco de parsing dos campos do body (~linhas 143-172). Logo após `const stakeGrade = ...`, adicionar:

```ts
  const notifyCadence: "leve" | "ritmada" | "intensa" =
    body.notifyCadence === "leve" || body.notifyCadence === "intensa"
      ? body.notifyCadence
      : "ritmada";
```

No `insert([{...}])` (~linha 176-196), adicionar a coluna:

```ts
        notify_cadence: notifyCadence,
```

(Inserir após `stake_grade: stakeGrade,` ou onde for natural na ordem alfabética/lógica.)

Opcional: no `WebhookPayload` (interface) e no payload do webhook, expor `notifyCadence` pro n8n também. Se não for desejado, pular.

- [ ] **Step 15.7: Verificar onde `OnboardingData.notifyCadence` precisa ser repassado ao body do POST**

`OnboardingForm` chama `onSubmit(data: OnboardingData)`. O componente pai (provavelmente `app/diagnostico/page.tsx` ou `DiagnosticoScreen.tsx`) é quem faz `fetch("/api/leads", { body: JSON.stringify({...data...}) })`. Inspecionar e garantir que `notifyCadence` é enviado.

```bash
grep -rn "fetch.*api/leads" components/ app/ --include="*.tsx" --include="*.ts" | head
```

Se o body do POST for montado com spread (`...onboardingData`), o campo já vai junto. Se for montado manualmente campo a campo, adicionar `notifyCadence: onboardingData.notifyCadence`.

- [ ] **Step 15.8: Build local**

```bash
npm run build
```

Esperado: sucesso.

- [ ] **Step 15.9: Commit**

```bash
git add components/trainer/OnboardingForm.tsx app/api/leads/route.ts
git commit -m "feat(onboarding): step 8 — pergunta de cadência (leve/ritmada/intensa)"
```

---

### Task 16: Smoke end-to-end + push

**Files:** nenhum modificado.

- [ ] **Step 16.1: Rodar verificadores puros**

```bash
npx tsx scripts/check-cadence-rules.ts
npx tsx scripts/check-pulse-token.ts
```

Esperado: ambos com `✓ Todos os checks passaram.`. Se algum falhar, abortar antes do push.

- [ ] **Step 16.2: Build local**

```bash
npm run build
```

Esperado: sucesso. Confirmar que aparecem no route table: `ƒ /api/cron/weekly-pulse`, `ƒ /api/pulse`, `ƒ /api/health/me`, `ƒ /p/[token]`.

- [ ] **Step 16.3: Smoke local — devmode**

`npm run dev` em outro terminal, depois (PowerShell):

```powershell
# /api/health/me sem cookie → 401
curl.exe -s "http://localhost:3000/api/health/me?diag=aaaaaaaa-1111-1111-1111-111111111111"
# Esperado: {"error":"Sessão inválida ou expirada"}

# /api/pulse sem token → 400
curl.exe -s "http://localhost:3000/api/pulse?token="
# Esperado: {"error":"invalid_token"}

# cron weekly-pulse — testa idempotência
curl.exe -s "http://localhost:3000/api/cron/weekly-pulse?secret=$env:CRON_SECRET"
# Esperado: { ok: true, weekIso, total, fired, ... } (valores podem ser 0 em dev)
```

- [ ] **Step 16.4: Smoke visual**

Abrir `http://localhost:3000/diagnostico` → preencher onboarding até o step 8 → confirmar que aparece a pergunta "Quanto o EV deve te cobrar?". Selecionar `ritmada` e concluir.

Depois, abrir `http://localhost:3000/meu-plano` (com plano no localStorage, gerado anteriormente). Esperado:
- `HealthScoreBlock` aparece no topo (com empty state "Seu Health Score aparece aqui…" se ainda não houve cron pra este aluno em prod).
- `EvHud` mostra 5 stats com `HS = —`.
- Se houver notification `pulse_request` aberta sem resposta, o `PulseCard` aparece.

- [ ] **Step 16.5: Push**

```bash
git push origin onboarding-ev
```

- [ ] **Step 16.6: Vercel (pós-deploy manual do user)**

Após o deploy, no Vercel:
1. Conferir que `/api/cron/weekly-pulse` aparece em Cron Jobs com schedule `0 12 * * 0`.
2. Disparar manualmente pra gerar a primeira leva de `pulse_request` em produção (se já for domingo) ou aguardar próximo domingo.
3. Confirmar visualmente no `/admin` aba "Saúde" que rows continuam sendo geradas e que aparece `notify_cadence` no SQL (`select id, player_name, notify_cadence from reglife_diagnostic_results limit 5;` — Fase A já mostrou que a coluna existe; novos leads vão preencher com o valor escolhido).

---

## Self-review

**Spec coverage (Fase C):**
- [x] Cadence settings UI → Task 15
- [x] Cadence persistido em `notify_cadence` → Task 15 (`/api/leads`)
- [x] `lib/triggers/cadenceRules.ts` → Task 2
- [x] Filtro `whatsappAllowed` em `sendNotification` → Task 4
- [x] Guarda do leve em `dailyCheckin` → Task 5
- [x] Cron weekly-pulse com idempotência → Task 10
- [x] `/api/pulse` GET + POST → Task 8
- [x] `/p/[token]` página pública → Task 9
- [x] PulseCard no /meu-plano → Task 11
- [x] `/api/health/me` cookie-protected → Task 12
- [x] `HealthScoreBlock` componente + integração → Task 13
- [x] 5º stat HS no EvHud → Task 14
- [x] Estender `NotificationKind`/`EvTrigger` com `pulse_request` → Task 1
- [x] Token HMAC reusando `SESSION_SECRET` → Task 6
- [x] `weekIso` helper → Task 6
- [x] Scripts de verificação (cadence + token) → Tasks 3, 7

**Placeholder scan:** sem TBD/TODO/implementar-depois. Cada step com código real.

**Type consistency:**
- `NotificationKind` ganha `pulse_request` na Task 1 e é usado pelo Record da Task 2 — consistente.
- `Cadence` tipo definido na Task 2 e importado nas Tasks 4 e 5.
- `fireDailyCheckin` recebe `cadence` na Task 5 (assinatura nova); o caller é atualizado na mesma task.
- `signPulseToken`/`verifyPulseToken` retornam `{ diagnosticId, weekIso }` consistente entre Tasks 6, 8, 9, 10.
- `Band` no `HealthScoreBlock` (Task 13) e `EvHud` (Task 14) usam o mesmo union de 4 valores (mas localmente declarados; a Fase A já tem `HealthBand` em `lib/health/types.ts` — implementer pode optar por importar de lá, é uma melhoria deferida).

**Convenção AGENTS.md:** Tasks 8, 9, 10, 12 tocam rotas — todas com instrução explícita pra checar `node_modules/next/dist/docs/` e seguir o template canônico de `app/api/cron/health-score/route.ts`.
