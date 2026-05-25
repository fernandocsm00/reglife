# Coach IA — Fase C (Cadência + Pulse + UI do Health Score) — Design

**Data:** 2026-05-25
**Branch:** `onboarding-ev`
**Status:** Aprovado em brainstorm (3 perguntas respondidas); aguardando review antes do plano.
**Spec mestre:** `docs/superpowers/specs/2026-05-25-coach-ia-cs-design.md` (commit `65f34ec`).
**Fase A entregue:** `docs/superpowers/plans/2026-05-25-coach-ia-fase-a-nucleo.md` (commits `365f466..e8e9f76`).

## Contexto

A Fase A entregou o núcleo do Health Score, 4 triggers novos (`leak_closed`, `health_band_change`, `daily_checkin`, `weekly_review`) e dashboard admin. Falta dar **agência ao aluno** sobre o quanto o EV cobra, **sentir o aluno** (pulse semanal) e **mostrar a evolução** (HS visível no `/meu-plano`).

Esta fase **NÃO inclui email** — quando email entrar, será via ActiveCampaign (Fase B postergada). O `badge_unlocked` listado originalmente como Fase C **já existe e funciona** em `/api/plan/progress` (linha 342-396) e foi removido do escopo.

## Objetivos

- Aluno escolhe a cadência do EV (leve/ritmada/intensa) no onboarding; default `ritmada`.
- Pulse semanal entrega 1 toque por aluno (in-app + WhatsApp com link curto) e captura 1 emoji por semana.
- Health Score visível pro aluno em dois lugares no `/meu-plano`: bloco grande no topo + número compacto dentro do EvHud existente.

## Não-objetivos (YAGNI)

- **Não** vamos parsear mensagens recebidas via WhatsApp — sem webhook de inbound. O pulse via WA é só o link curto.
- **Não** vamos adicionar email como canal (deferido pra integração ActiveCampaign futura).
- **Não** vamos mexer no `badge_unlocked` (já funciona).
- **Não** vamos ter UI de "ajustar cadência depois" no perfil — a pergunta sai uma vez no onboarding. Ajustar depois é via admin (CSV ou SQL direto, raro).
- **Não** vamos timezone-aware no cron de pulse (UTC suficiente pra escala atual; mesmo padrão dos outros crons).

## Decisões aprovadas (das 3 perguntas)

1. **Cadence rules sem email** — confirmadas (tabela abaixo).
2. **Pulse via WhatsApp** — só link curto, sem webhook de inbound.
3. **UI do HS** — bloco grande no topo do `/meu-plano` + número compacto no EvHud (redundância proposital).

## Arquitetura

Três sub-sistemas independentes que compartilham `lib/notify.ts` (estendido) e a tabela `pulse_responses` (já criada na migração 012).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1) CADÊNCIA                                                              │
│    OnboardingForm (radio leve/ritmada/intensa) → POST /api/leads         │
│    → reglife_diagnostic_results.notify_cadence                           │
│                                                                          │
│    lib/triggers/cadenceRules.ts (tabela trigger×cadência → canais)       │
│    lib/notify.ts (filtra WhatsApp em sendNotification)                   │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ 2) PULSE SEMANAL                                                         │
│    cron /api/cron/weekly-pulse (domingo 12h UTC)                         │
│      → cria notification kind=pulse_request com payload.token            │
│      → manda WA com link curto pra alunos não-leve                       │
│                                                                          │
│    /meu-plano → PulseCard (4 emojis) → POST /api/pulse                   │
│    /p/[token] → 4 botões              → POST /api/pulse                  │
│                                                                          │
│    /api/pulse:                                                           │
│      - valida token HMAC (NEXTAUTH_SECRET ou PULSE_SECRET)               │
│      - upsert em pulse_responses (PK (diagnostic_id, week_iso))          │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ 3) UI DO HEALTH SCORE                                                    │
│    /api/health/me?diag=<id>  (cookie diag-session protegido)             │
│      → leia último player_health_snapshots                               │
│                                                                          │
│    /meu-plano:                                                           │
│      <HealthScoreBlock /> — bloco grande no topo                         │
│      <EvHud + 5º stat HS compacto>                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. Cadence rules

Arquivo: `lib/triggers/cadenceRules.ts`

```ts
import type { NotificationKind } from "@/lib/notify";

export type Cadence = "leve" | "ritmada" | "intensa";

/** Canais permitidos pra (trigger, cadência). Se canal não está listado, NÃO envia. */
export const CADENCE_CHANNELS: Record<
  NotificationKind,
  Record<Cadence, ReadonlyArray<"in_app" | "whatsapp">>
> = {
  daily_checkin:       { leve: [],                ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  weekly_review:       { leve: ["in_app"],        ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  post_session:        { leve: ["in_app"],        ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  streak_risk:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  pulse_request:       { leve: ["in_app"],        ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_alert:          { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  leak_closed:         { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  health_band_change:  { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  phase_transition:    { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
  badge_unlocked:      { leve: ["in_app"],        ritmada: ["in_app"],             intensa: ["in_app"] },
  // (kinds restantes do enum que não fazem sentido restringir; default = passa)
  quest_assigned:      { leve: ["in_app"],        ritmada: ["in_app"],             intensa: ["in_app"] },
  quest_done:          { leve: ["in_app"],        ritmada: ["in_app"],             intensa: ["in_app"] },
  quest_expiring:      { leve: ["in_app"],        ritmada: ["in_app"],             intensa: ["in_app"] },
  drop_active:         { leve: ["in_app"],        ritmada: ["in_app"],             intensa: ["in_app"] },
  plan_delivered:      { leve: ["in_app","whatsapp"], ritmada: ["in_app","whatsapp"], intensa: ["in_app","whatsapp"] },
};

export function whatsappAllowed(kind: NotificationKind, cadence: Cadence): boolean {
  const channels = CADENCE_CHANNELS[kind]?.[cadence];
  return channels?.includes("whatsapp") ?? true;
}
```

Filtro em `lib/notify.ts`: antes de enviar WhatsApp em `sendNotification`, chama `whatsappAllowed(args.kind, prefs.notify_cadence)`. Se false, pula.

Nota: cadência **não bloqueia in-app**. Mesmo no leve, o aluno vê tudo no feed do EV. Só evita "encher" o WhatsApp.

#### Tabela aprovada (resumo legível)

| Trigger | Leve | Ritmada | Intensa |
|---|---|---|---|
| `daily_checkin` | ❌ | in-app+WA | in-app+WA |
| `post_session` | só in-app | in-app+WA | in-app+WA |
| `weekly_review` | só in-app | in-app+WA | in-app+WA |
| `streak_risk` | in-app+WA | in-app+WA | in-app+WA |
| `pulse_request` | só in-app | in-app+WA | in-app+WA |
| `leak_alert` / `leak_closed` / `health_band_change` | sempre | sempre | sempre |
| `phase_transition` / `plan_delivered` | sempre | sempre | sempre |
| `badge_unlocked` / quest_* / drop_active | só in-app | só in-app | só in-app |

Nota sobre `daily_checkin`: além de `whatsappAllowed`, o handler `fireDailyCheckin` ganha um early-return quando `cadence === "leve"` (não dispara nem in-app, conforme tabela). Outras cadências comportam o `noop` se atividade recente.

Nota sobre `streak_risk` no leve: o `daily-pulse` cron continua usando `36h` como threshold. A regra `72h` no leve do spec mestre seria uma extensão futura; nesta entrega, mantemos a janela como está (a tabela registra que o WA do leve continua tocando — não bloqueamos).

### 2. Pulse semanal end-to-end

#### Token HMAC

`lib/pulse/token.ts`:

```ts
import { createHmac } from "crypto";

export function signPulseToken(diagnosticId: string, weekIso: string): string {
  const secret = process.env.PULSE_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("[pulse] PULSE_SECRET ou SESSION_SECRET obrigatório");
  const payload = `${diagnosticId}.${weekIso}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 16);
  return `${diagnosticId}~${weekIso}~${sig}`;
}

export function verifyPulseToken(token: string): { diagnosticId: string; weekIso: string } | null {
  const [diagnosticId, weekIso, sig] = token.split("~");
  if (!diagnosticId || !weekIso || !sig) return null;
  const expected = signPulseToken(diagnosticId, weekIso).split("~")[2];
  // constant-time compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { diagnosticId, weekIso } : null;
}
```

#### Cron de envio

Arquivo: `app/api/cron/weekly-pulse/route.ts`. Roda domingo 12h UTC (`0 12 * * 0`).

Para cada aluno ativo (`listActiveStudents()` já existe em `lib/health/collect.ts`):
- Computa `weekIso` (ex: `2026-W21`).
- Pula se já há `pulse_responses` ou notification `pulse_request` desta semana (idempotência).
- Lê `notify_cadence`.
- Chama `sendNotification` com `kind: "pulse_request"`, `title: "Como foi sua semana?"`, `body` com o link curto + 4 emojis em texto, `payload.token`. O filtro de cadência em `notify.ts` decide o canal de saída.

`pulse_request` é uma **`NotificationKind` nova** (não estava nas 14 da Fase A). Precisa estender o enum.

#### API `/api/pulse`

`app/api/pulse/route.ts`:

- **GET** `?token=...` — usado por `/p/[token]` no SSR pra mostrar a página. Valida HMAC, devolve `{ diagnosticId, weekIso, alreadyVoted }`.
- **POST** `{token, vote: "sad"|"meh"|"smile"|"grin", source: "in_app"|"link"}` — valida HMAC, upsert em `pulse_responses`. Anti-double-vote via PK `(diagnostic_id, week_iso)`. Rate-limit por token.

Rota pública (sem `requireDiagSession`) — o HMAC é o cookie. Rate-limit IP padrão.

#### Página `/p/[token]`

`app/p/[token]/page.tsx` (Server Component que chama `/api/pulse?token=`). Renderiza 4 botões grandes; após click, mostra "Anotado!".

#### Card no `/meu-plano`

`components/trainer/PulseCard.tsx` (client). Aparece SOMENTE se há notificação `pulse_request` aberta sem resposta nesta semana. Após vote, some.

### 3. UI do Health Score pro aluno

#### Endpoint `/api/health/me`

`app/api/health/me/route.ts`:

- GET `?diag=<id>`. Valida `requireDiagSession`. Lê snapshot mais recente em `player_health_snapshots`. Devolve `{ health, band, breakdown, day }`.
- Se nunca rodou cron pra este aluno, devolve `null` campos — UI mostra "ainda calculando".

#### Componente `<HealthScoreBlock />`

`components/trainer/HealthScoreBlock.tsx` (client). Renderiza em `app/meu-plano/page.tsx` ACIMA do `EvHud`:

```
┌──────────────────────────────────────────────────────────┐
│  HEALTH SCORE                              dia 32 / 90    │
│                                                            │
│   ┌──────┐                                                 │
│   │  78  │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  AMARELO                  │
│   └──────┘                                                 │
│                                                            │
│   Resultado 75   Conclusão 80   Sentimento 100             │
└──────────────────────────────────────────────────────────┘
```

- Cores: green/yellow/orange/red (alinhadas com `band`).
- Pílulas com sub-scores. Se algum for `null`, exibe "—" + tooltip "ainda sem dados".
- Empty state (sem snapshot): "Seu Health Score aparece aqui depois do primeiro cálculo."

#### Quinto stat no `<EvHud />`

`components/trainer/EvHud.tsx` já tem `grid-cols-2 sm:grid-cols-4`. Vira `sm:grid-cols-5`. Novo `<Stat icon="🩺" label="HS" value={`${health}`} hint={band} />`.

## Esquema de banco

**Sem migrações novas.** Tudo que esta fase precisa já foi criado na migração 012:
- `pulse_responses (diagnostic_id, week_iso, emoji, source, created_at)` — existe.
- `reglife_diagnostic_results.notify_cadence` (default `'ritmada'`) — existe.

## Fluxo de dados crítico

### Aluno responde pulse via link

```
EV manda WA: "Como foi sua semana? https://reg.life/p/<token>"
  ↓
Aluno clica → GET /p/<token> (Server Component)
  ↓
SSR chama /api/pulse?token=... → valida HMAC → { diagnosticId, weekIso, alreadyVoted }
  ↓
Renderiza 4 botões → onClick POST /api/pulse {token, vote, source:"link"}
  ↓
Upsert em pulse_responses (PK garante anti-double)
  ↓
UI: "Anotado!" + (futuro) "veja seu Health Score em /meu-plano"
```

### Aluno responde pulse no app

```
GET /api/manager/chat (já existe) retorna notification pulse_request
  ↓
/meu-plano mostra <PulseCard> com 4 botões (token vem do payload da notification)
  ↓
onClick POST /api/pulse {token, vote, source:"in_app"}
  ↓
Card desaparece. Score do dia seguinte vai incorporar.
```

### Aluno abre /meu-plano

```
SSR/Client → fetch /api/health/me?diag=<id>
  ↓
HealthScoreBlock renderiza com health/band/breakdown
  ↓
EvHud renderiza stat compacto HS=78
```

## Tratamento de erros

- **Token HMAC inválido** → `/p/[token]` mostra "Esse link expirou ou é inválido. Abre o app." (sem detalhes que confirmem brute-force).
- **Double-vote** → PK conflict; UI mostra "Você já respondeu essa semana, valeu!".
- **Sem `PULSE_SECRET`** → cron falha loudly; rota `/api/pulse` retorna 500 com mensagem clara.
- **Aluno sem snapshot ainda** → `/api/health/me` devolve `null` campos; UI mostra "ainda calculando".
- **WhatsApp falha no pulse** → o `in_app` ainda foi gravado; aluno pode responder pelo app.

## Testes

- `lib/triggers/cadenceRules.test.ts` (script `tsx`) — matriz trigger×cadência batendo com o spec.
- `lib/pulse/token.test.ts` (script `tsx`) — sign/verify roundtrip + adversários (token falsificado, expired week).
- Smoke manual:
  1. POST `/api/leads` com `notify_cadence: "leve"` → confirma persistência.
  2. Curl `/api/cron/weekly-pulse?secret=$CRON_SECRET` → confere notification criada.
  3. Abre link `/p/<token>` → 4 botões → POST → row em `pulse_responses`.
  4. Abre `/meu-plano` autenticado pelo cookie diag → HealthScoreBlock + EvHud stat.

## Faseamento interno

Fase única (3 sub-entregas executadas em sequência), sem dependências cruzadas externas. Plano de implementação divide em ~14 tasks.

## Decisões em aberto (resolvidas pelo plano)

- **`PULSE_SECRET` vs reuse de `SESSION_SECRET`**: reuso aceitável (mesmo nível de confidencialidade); o plano vai documentar e checar `.env`.
- **Texto exato da pergunta de cadência no onboarding**: "Quanto o EV deve te cobrar pra você evoluir?" — opções "Pouco (leve) / Na medida (ritmada) / Sem moleza (intensa)". O plano refina copy se o user pedir.
- **Onde a pergunta aparece no wizard**: novo step 8 (último), antes do submit final. Mantém o quiz separado da preferência operacional.

## Convenção do projeto

> AGENTS.md: "Esta versão do Next.js tem breaking changes. Ler `node_modules/next/dist/docs/` antes de escrever código."

Aplicável a 4 rotas novas: `/api/cron/weekly-pulse`, `/api/pulse`, `/api/health/me`, `/p/[token]`. O plano refere `app/api/cron/health-score/route.ts` (Fase A) como template canônico.
