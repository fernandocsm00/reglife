# Onboarding SharkScope Nick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um step 7 ao `OnboardingForm` que coleta nick + network SharkScope do aluno (com opt-out explícito) e persistir nas colunas `sharkscope_username` / `sharkscope_network` já existentes em `reglife_diagnostic_results`.

**Architecture:** `OnboardingForm.tsx` ganha novo step com radio "Sim/Não" + (se sim) select de network e input de nick. `TOTAL_STEPS` muda de 8 → 9. Banca e WhatsApp opt-in são renumerados (8 e 9). `OnboardingData` expande com 2 campos opcionais. `/api/leads/route.ts` faz parse defensivo dos 2 campos do body e os adiciona ao INSERT. Sync com SharkScope segue assíncrono via cron weekly-sharkscope existente — esta entrega NÃO chama `/api/sharkscope/sync-diagnostic`.

**Tech Stack:** Next.js App Router (TS), React client state, Tailwind. Sem framework de testes — validação via `tsc`/`lint`/`build` + smoke visual no dev.

**Spec base:** `docs/superpowers/specs/2026-06-02-onboarding-sharkscope-nick-design.md` (commit `68f3d9f`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `components/trainer/OnboardingForm.tsx` | **Modify** | Const `SHARKSCOPE_NETWORKS` + tipo. `TOTAL_STEPS` 8→9. `OnboardingData` ganha 2 campos. 3 states novos (`hasSharkscope`, `sharkscopeUsername`, `sharkscopeNetwork`). UI do novo step 7 com radio + form condicional. Renumeração: banca 7→8, whatsapp 8→9, `finalSubmit` chamado no step 9. `BackBar` ajustado nos 3 steps afetados. |
| `app/api/leads/route.ts` | **Modify** | Parse defensivo de `body.sharkscopeUsername` / `body.sharkscopeNetwork`. INSERT acrescenta 2 colunas. |

Nenhum arquivo criado. Zero schema change.

## Sequência das tasks

1. **Task 1** — Modificar `OnboardingForm.tsx`: tudo (states, UI, renumeração).
2. **Task 2** — Modificar `/api/leads/route.ts`: parse + INSERT.
3. **Task 3** — Sanity check final.

Cada task termina com `tsc --noEmit` verde e um commit.

---

## Task 1 — `OnboardingForm.tsx` com step 7 + renumeração

**Files:**
- Modify: `components/trainer/OnboardingForm.tsx`

**Por quê:** Toda a mudança UI/state fica num arquivo só. Renumeração + novo step + tipos formam uma unidade coerente que deve commitar junto pra evitar estado intermediário inválido (step 7 banca vs step 7 nick coexistindo).

- [ ] **Step 1: Adicionar `SHARKSCOPE_NETWORKS` no topo do arquivo**

Editar `components/trainer/OnboardingForm.tsx`. Logo após a linha 58 (`const TOTAL_STEPS = 8;`), trocar essa linha por:

```ts
const TOTAL_STEPS = 9; // 1 identidade + 6 perguntas + 1 nick SharkScope + 1 banca + 1 opt-in WhatsApp

const SHARKSCOPE_NETWORKS = [
  "PokerStars",
  "GGPoker",
  "PartyPoker",
  "888Poker",
  "WPN",
  "iPoker",
] as const;
type SharkscopeNetwork = (typeof SHARKSCOPE_NETWORKS)[number];
```

- [ ] **Step 2: Expandir `OnboardingData` interface**

A interface atual (linhas 31-52) inclui `whatsappOptIn: boolean;`. Acrescentar 2 campos novos APÓS `whatsappOptIn`:

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
  /**
   * Consentimento explícito do aluno pra receber contatos via WhatsApp na
   * Comunidade. Substituiu a pergunta antiga de cadência no passo 8.
   * - true  → aceitou
   * - false → recusou
   */
  whatsappOptIn: boolean;
  /** Nick SharkScope informado no step 7 — null se aluno opt-out. */
  sharkscopeUsername: string | null;
  /** Network SharkScope informado no step 7 — null se aluno opt-out. */
  sharkscopeNetwork: string | null;
}
```

- [ ] **Step 3: Adicionar states novos no componente**

Logo após `const [whatsappOptIn, setWhatsappOptIn] = useState<boolean | null>(null);` (linha ~97), acrescentar:

```ts
// Step 7 — SharkScope
const [hasSharkscope, setHasSharkscope] = useState<boolean | null>(null);
const [sharkscopeUsername, setSharkscopeUsername] = useState("");
const [sharkscopeNetwork, setSharkscopeNetwork] = useState<SharkscopeNetwork>("PokerStars");
```

- [ ] **Step 4: Adicionar validação `sharkscopeValid`**

Logo após `const identityValid = ...` (linha ~102), acrescentar:

```ts
const sharkscopeValid =
  hasSharkscope === false ||
  (hasSharkscope === true && sharkscopeUsername.trim().length >= 2);
```

- [ ] **Step 5: Estender `finalSubmit` pra incluir os campos novos**

Na função `finalSubmit` (linhas 104-136), o `onSubmit({...})` atual termina com `whatsappOptIn: whatsappOptIn!,`. Trocar por:

```ts
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
      whatsappOptIn: whatsappOptIn!,
      sharkscopeUsername: hasSharkscope ? sharkscopeUsername.trim() : null,
      sharkscopeNetwork: hasSharkscope ? sharkscopeNetwork : null,
    });
```

- [ ] **Step 6: Inserir novo step 7 (SharkScope) entre o step de volume (atual 6) e o step de banca**

Localizar o bloco `{step === 6 && (...)}` (linha ~265, step "volume") e o bloco `{step === 7 && (...)}` (linha ~281, atualmente "banca"). Antes do bloco do step 7 atual (banca), INSERIR o novo bloco do step 7 (SharkScope):

```tsx
          {step === 7 && (
            <StepWrapper key="sharkscope-nick">
              <Title>Você joga em algum site que o SharkScope cobre?</Title>
              <Sub>
                Se você joga em PokerStars, GGPoker ou outros sites principais,
                informe seu nick aqui. Com isso o EV consegue puxar seus
                resultados automaticamente.
              </Sub>

              <div className="mt-8 space-y-2">
                {[
                  {
                    value: true,
                    label: "Sim, tenho conta SharkScope",
                    sub: "Vou informar meu nick agora.",
                  },
                  {
                    value: false,
                    label: "Não tenho conta SharkScope",
                    sub: "Quero pular esse passo por enquanto.",
                  },
                ].map((o) => {
                  const selected = hasSharkscope === o.value;
                  return (
                    <button
                      type="button"
                      key={String(o.value)}
                      onClick={() => setHasSharkscope(o.value)}
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

              {hasSharkscope === true && (
                <div className="mt-6 space-y-4">
                  <Field label="Em qual site você joga mais?">
                    <select
                      value={sharkscopeNetwork}
                      onChange={(e) =>
                        setSharkscopeNetwork(e.target.value as SharkscopeNetwork)
                      }
                      className={inputClass}
                    >
                      {SHARKSCOPE_NETWORKS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Qual é o seu nick nesse site?">
                    <input
                      type="text"
                      value={sharkscopeUsername}
                      onChange={(e) => setSharkscopeUsername(e.target.value)}
                      placeholder="seu_nick_aqui"
                      className={inputClass}
                      autoFocus
                    />
                  </Field>
                  <p className="text-xs text-neutral-500">
                    ℹ️ Sem isso o EV não vai puxar seus resultados
                    automaticamente. Você ainda pode informar depois
                    conversando com o EV.
                  </p>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <NextButton
                  disabled={!sharkscopeValid}
                  onClick={() => setStep(8)}
                  label="Continuar →"
                />
              </div>
              <BackBar onBack={() => setStep(6)} />
            </StepWrapper>
          )}
```

Notas de implementação:
- Reusa `Field`, `inputClass`, `Title`, `Sub`, `StepWrapper`, `NextButton`, `BackBar` que já existem no arquivo. Não inventar componentes novos.
- O pattern de radio (botões inline com `border-amber-400/70`) é idêntico ao do step 8 atual (whatsapp opt-in). Replicação consciente — sem helper compartilhado por enquanto.
- Inputs condicionais só renderiza quando `hasSharkscope === true`. Aluno que escolhe "Não" pode clicar Continuar direto.

- [ ] **Step 7: Renumerar step de banca (era 7, vira 8)**

O bloco atual `{step === 7 && (` para "banca" (linhas ~281-296) precisa virar `{step === 8 && (`. Dentro dele, o `autoAdvance(setBanca, 8)` precisa virar `autoAdvance(setBanca, 9)`, e o `BackBar` precisa apontar pra `() => setStep(7)` (volta pro novo step 7 de nick).

Localizar o bloco atual:

```tsx
          {step === 7 && (
            <StepWrapper key="banca">
              <Title>Qual é a sua banca total para poker online (em dólares)?</Title>
              <Sub>
                Não é só a soma do que você tem nas salas, é todo o dinheiro
                que você tem disponível para dar buy-ins, incluindo o que
                ainda pode depositar.
              </Sub>
              <QuestionOptions
                options={BANCA_OPTIONS}
                value={banca}
                onChange={autoAdvance(setBanca, 8)}
              />
              <BackBar onBack={() => setStep(6)} />
            </StepWrapper>
          )}
```

Substituir por:

```tsx
          {step === 8 && (
            <StepWrapper key="banca">
              <Title>Qual é a sua banca total para poker online (em dólares)?</Title>
              <Sub>
                Não é só a soma do que você tem nas salas, é todo o dinheiro
                que você tem disponível para dar buy-ins, incluindo o que
                ainda pode depositar.
              </Sub>
              <QuestionOptions
                options={BANCA_OPTIONS}
                value={banca}
                onChange={autoAdvance(setBanca, 9)}
              />
              <BackBar onBack={() => setStep(7)} />
            </StepWrapper>
          )}
```

Mudanças exatas:
- `{step === 7 && (` → `{step === 8 && (`
- `autoAdvance(setBanca, 8)` → `autoAdvance(setBanca, 9)`
- `BackBar onBack={() => setStep(6)}` → `BackBar onBack={() => setStep(7)}`

- [ ] **Step 8: Renumerar step do whatsapp opt-in (era 8, vira 9)**

O bloco atual `{step === 8 && (` para "whatsapp-opt-in" (linhas ~298-357) precisa virar `{step === 9 && (`, e o `BackBar` precisa apontar pra `() => setStep(8)` (volta pra banca).

Localizar a linha `{step === 8 && (` que abre o `whatsapp-opt-in` (linha ~298). Substituir por `{step === 9 && (`.

Localizar a linha `<BackBar onBack={() => setStep(7)} />` dentro desse bloco (linha ~355). Substituir por `<BackBar onBack={() => setStep(8)} />`.

Mudanças exatas:
- `{step === 8 && (` → `{step === 9 && (`
- `BackBar onBack={() => setStep(7)}` → `BackBar onBack={() => setStep(8)}`

- [ ] **Step 9: Atualizar `autoAdvance` no step de volume (era 6→7, agora 6→7 também — sem mudança)**

O step 6 (volume, linha ~265) tem `autoAdvance(setVolume, 7)`. Como o novo step 7 é o SharkScope, esse `, 7)` continua correto.

**Confirmar sem alteração.** Nenhuma mudança neste bloco.

- [ ] **Step 10: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 11: Lint**

Run: `npx eslint components/trainer/OnboardingForm.tsx`
Expected: zero novos erros.

- [ ] **Step 12: Smoke visual rápido**

Run: `npm run dev` em outro terminal. Abrir `http://localhost:3000/`. Sem precisar completar o quiz inteiro, confirmar:

- [ ] A barra de progresso mostra 9 steps (não 8).
- [ ] Avançar até o step de volume, escolher uma opção → cai no novo step 7 (SharkScope).
- [ ] Step 7 mostra a pergunta "Você joga em algum site que o SharkScope cobre?" e 2 botões.
- [ ] Clicar "Sim" revela o select de network + input de nick.
- [ ] Clicar "Não" oculta os inputs e habilita o botão "Continuar".
- [ ] Botão "Continuar" desabilitado quando nada selecionado, ou quando "Sim" + nick vazio.
- [ ] Voltar (BackBar) volta pro step 6 (volume).
- [ ] Avançar leva pro step 8 (banca, conteúdo "banca total").
- [ ] Step 9 = whatsapp opt-in, voltar dele vai pra step 8 (banca).

Sem precisar terminar o submit — só validar a sequência de telas e validações. Se algo estiver fora do esperado, debugar a numeração.

- [ ] **Step 13: Commit**

```bash
git add components/trainer/OnboardingForm.tsx
git commit -m "$(cat <<'EOF'
feat(plan): step 7 do OnboardingForm coleta nick SharkScope

Step novo entre volume (6) e banca (agora 8): radio "Sim/Nao" pra
saber se aluno tem conta SharkScope. Se sim, revela select de 6
networks (PokerStars/GGPoker/PartyPoker/888Poker/WPN/iPoker) e
input de nick. Validacao leve no client. Opt-out explicito persiste
null nos 2 campos novos do OnboardingData.

TOTAL_STEPS 8 -> 9. Banca renumerada 7 -> 8, WhatsApp opt-in
renumerado 8 -> 9. BackBar e autoAdvance ajustados.

Persistencia no /api/leads vem na Task 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `/api/leads/route.ts` persiste os 2 campos

**Files:**
- Modify: `app/api/leads/route.ts`

**Por quê:** Endpoint passa a receber e persistir os campos novos enviados pelo OnboardingForm. Parse defensivo garante compat com payloads legados.

- [ ] **Step 1: Adicionar parse defensivo dos 2 campos novos**

Localizar o bloco que faz parse de `whatsappOptIn` (linhas ~180-184 atualmente):

```ts
  // Consentimento explícito pra contato via WhatsApp. Form novo manda
  // sempre boolean; payloads legados (sem o campo) gravam null e ficam
  // tratados como "tácito" pela camada de notify.
  const whatsappOptIn: boolean | null =
    typeof body.whatsappOptIn === "boolean" ? body.whatsappOptIn : null;
```

Logo após esse bloco, inserir:

```ts
  // SharkScope: nick + network informados no onboarding (step 7). Quando o
  // aluno marca "não tenho conta", chegam como null e ficam vazios na linha
  // — o cron weekly-sharkscope e o admin modal pulam linhas sem nick.
  const sharkscopeUsername: string | null =
    typeof body.sharkscopeUsername === "string" &&
    body.sharkscopeUsername.trim().length > 0
      ? body.sharkscopeUsername.trim()
      : null;
  const sharkscopeNetwork: string | null =
    typeof body.sharkscopeNetwork === "string" &&
    body.sharkscopeNetwork.trim().length > 0
      ? body.sharkscopeNetwork.trim()
      : null;
```

- [ ] **Step 2: INSERT acrescenta as 2 colunas**

Localizar o objeto dentro de `.insert([{ ... }])` (linhas 188-210). Atualmente termina assim:

```ts
        whatsapp_phone: whatsappPhone,
        quiz_answers: quizAnswers,
        lead_score: leadScore,
        lead_category: leadCategory,
        stake_grade: stakeGrade,
        notify_cadence: notifyCadence,
        whatsapp_opt_in: whatsappOptIn,
        // Test ainda não rodou — fica vazio
        stopped_early: false,
        spots_played: 0,
        spots_failed: 0,
        spot_summaries: [],
        results: [],
      },
```

Inserir as 2 colunas logo após `whatsapp_opt_in: whatsappOptIn,`:

```ts
        whatsapp_phone: whatsappPhone,
        quiz_answers: quizAnswers,
        lead_score: leadScore,
        lead_category: leadCategory,
        stake_grade: stakeGrade,
        notify_cadence: notifyCadence,
        whatsapp_opt_in: whatsappOptIn,
        sharkscope_username: sharkscopeUsername,
        sharkscope_network: sharkscopeNetwork,
        // Test ainda não rodou — fica vazio
        stopped_early: false,
        spots_played: 0,
        spots_failed: 0,
        spot_summaries: [],
        results: [],
      },
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Lint**

Run: `npx eslint app/api/leads/route.ts`
Expected: zero novos erros.

- [ ] **Step 5: Smoke via curl (opcional)**

Subir `npm run dev` em outro terminal. Testar com body válido:

```bash
curl -s -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Smoke Test",
    "email": "smoke+test@example.com",
    "phone": "(11) 99999-9999",
    "quizAnswers": {
      "idade": "25-34",
      "tempo": "1a3anos",
      "objetivo": "rendaExtra",
      "abi": "1a4",
      "volume": "100a200",
      "banca": "1ka2k"
    },
    "studyTime": "ate15",
    "profitGoal": "usd10k",
    "volumeTargetWeekly": 25,
    "stakeGrade": 4,
    "leadScore": 12,
    "leadCategory": "morno",
    "notifyCadence": "ritmada",
    "whatsappOptIn": true,
    "sharkscopeUsername": "smoke_nick",
    "sharkscopeNetwork": "PokerStars"
  }' | jq
```

Expected: response com `{ "id": "...", "createdAt": "..." }`. Verificar no Supabase: linha tem `sharkscope_username = "smoke_nick"` + `sharkscope_network = "PokerStars"`.

Testar também SEM esses 2 campos (backward compat):

```bash
curl -s -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Backward Compat",
    "email": "compat@example.com",
    "phone": "(11) 99999-9998",
    "quizAnswers": {
      "idade": "25-34",
      "tempo": "1a3anos",
      "objetivo": "rendaExtra",
      "abi": "1a4",
      "volume": "100a200",
      "banca": "1ka2k"
    },
    "studyTime": "ate15",
    "profitGoal": "usd10k",
    "volumeTargetWeekly": 25,
    "stakeGrade": 4,
    "leadScore": 12,
    "leadCategory": "morno",
    "notifyCadence": "ritmada",
    "whatsappOptIn": true
  }' | jq
```

Expected: response 200. Linha no Supabase com `sharkscope_username = null` + `sharkscope_network = null`.

Limpar essas 2 linhas de teste depois (DELETE no Supabase).

Se não quiser subir o dev, pular este step — Task 3 cobre o smoke completo.

- [ ] **Step 6: Commit**

```bash
git add app/api/leads/route.ts
git commit -m "$(cat <<'EOF'
feat(plan): /api/leads persiste sharkscope_username e _network

Parse defensivo dos campos sharkscopeUsername/sharkscopeNetwork do
body (undefined/empty/non-string viram null). INSERT em
reglife_diagnostic_results inclui as 2 colunas existentes. Sem sync
sincrono — cron weekly-sharkscope sincroniza assincronamente. Payloads
legados sem os campos seguem funcionando (null nas colunas).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar critérios de aceite do spec com a feature inteira no ar.

- [ ] **Step 1: tsc + build no HEAD**

Run: `npx tsc --noEmit && echo "TSC OK" && npm run build 2>&1 | tail -8`
Expected: `TSC OK` + build completa.

- [ ] **Step 2: Smoke no dev**

Run: `npm run dev`
Esperado: dev server em http://localhost:3000.

- [ ] **Step 3: Fluxo completo "Sim, tenho conta"**

Abrir `http://localhost:3000/`. Completar o onboarding inteiro:

- [ ] Identidade (step 1) → preencher e Continuar.
- [ ] Idade (step 2) → escolher.
- [ ] Tempo (step 3) → escolher.
- [ ] Objetivo (step 4) → escolher.
- [ ] ABI (step 5) → escolher.
- [ ] Volume (step 6) → escolher.
- [ ] **Nicks SharkScope (step 7)** → marcar "Sim, tenho conta SharkScope".
  - [ ] Select de network mostra 6 opções: PokerStars, GGPoker, PartyPoker, 888Poker, WPN, iPoker.
  - [ ] Escolher network e preencher nick `test_nick`.
  - [ ] Botão "Continuar" habilita.
  - [ ] Clicar Continuar.
- [ ] Banca (step 8) → escolher.
- [ ] WhatsApp opt-in (step 9) → escolher Aceito → "Concluir →".
- [ ] Após submit, ir no Supabase, abrir `reglife_diagnostic_results` ordenado por `created_at DESC` → conferir que a linha mais recente tem `sharkscope_username = "test_nick"` e `sharkscope_network = "PokerStars"` (ou network escolhida).

- [ ] **Step 4: Fluxo completo "Não tenho conta"**

Refazer o quiz em sessão anônima ou aba privada. No step 7, marcar "Não tenho conta SharkScope" → Continuar (deve estar habilitado sem precisar preencher nada). Terminar o quiz.

- [ ] Linha no Supabase tem `sharkscope_username = null` e `sharkscope_network = null`.

- [ ] **Step 5: Validação do botão "Continuar"**

No step 7, sem marcar nenhuma opção → botão "Continuar" desabilitado.
Marcar "Sim" mas deixar nick vazio (ou só 1 caractere) → botão "Continuar" desabilitado.

- [ ] **Step 6: BackBar**

No step 7, clicar back → volta pro step 6 (volume).
No step 8 (banca), clicar back → volta pro step 7 (nick), preservando a escolha anterior.
No step 9 (whatsapp), clicar back → volta pro step 8 (banca).

- [ ] **Step 7: DevTools network**

DevTools → Network → completar o onboarding → encontrar POST `/api/leads` → ver Request Body. Confirmar:

- [ ] Body contém `"sharkscopeUsername": "test_nick"` (ou `null`).
- [ ] Body contém `"sharkscopeNetwork": "PokerStars"` (ou `null`).
- [ ] Response status 200 com `{ id, createdAt }`.

- [ ] **Step 8: Backward compat**

Confirmar que linhas existentes em `reglife_diagnostic_results` (de antes desta entrega) continuam funcionando: abrir `/admin` e ver que a lista de leads aparece normalmente, sem erros de TypeScript ou crashes no front.

- [ ] **Step 9: Checar critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-onboarding-sharkscope-nick-design.md` seção "Critérios de aceite". Confirmar cada item:

- [ ] OnboardingForm tem 9 steps na sequência correta.
- [ ] `TOTAL_STEPS = 9`.
- [ ] Step 7 mostra radio Sim/Não.
- [ ] "Sim" revela select de 6 networks + input nick.
- [ ] "Não" oculta inputs e habilita Continuar direto.
- [ ] Botão Continuar desabilitado quando esperado.
- [ ] Sub-texto explica que EV não puxará dados sem nick.
- [ ] `OnboardingData` ganha 2 campos.
- [ ] `finalSubmit` envia null quando opt-out, trim quando preenche.
- [ ] `/api/leads` faz parse defensivo dos 2 campos.
- [ ] INSERT inclui as 2 colunas.
- [ ] Endpoint NÃO chama `/api/sharkscope/sync-diagnostic`.
- [ ] Banca e WhatsApp opt-in renumerados.
- [ ] `tsc --noEmit` e lint passam.
- [ ] `SHARKSCOPE_NETWORKS` listadas exatamente como spec.

- [ ] **Step 10: Reportar pronto**

Sem ação de código. Reportar: feature completa, 2 commits no branch `onboarding-ev`, smoke ok, pronto pra `finishing-a-development-branch`.

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério do spec mapeia em alguma task.

- "9 steps na sequência" → Task 1 Step 1 (`TOTAL_STEPS = 9`) + Steps 6-8 (UI nova + renumeração).
- "Step 7 radio Sim/Não" → Task 1 Step 6 (bloco do `step === 7`).
- "Sim revela inputs" → Task 1 Step 6 (`{hasSharkscope === true && (...)}`).
- "Não habilita Continuar direto" → Task 1 Step 4 (`sharkscopeValid` aceita `=== false`).
- "Botão Continuar desabilitado" → Task 1 Step 4 + Step 6 (`disabled={!sharkscopeValid}`).
- "Sub-texto" → Task 1 Step 6 (`<p>ℹ️ Sem isso...</p>`).
- "`OnboardingData` ganha 2 campos" → Task 1 Step 2.
- "`finalSubmit` envia trim/null" → Task 1 Step 5.
- "`/api/leads` parse defensivo" → Task 2 Step 1.
- "INSERT inclui colunas" → Task 2 Step 2.
- "Sem sync síncrono" → garantido por não chamar `/api/sharkscope/sync-diagnostic` em lugar nenhum.
- "Banca e WhatsApp renumerados" → Task 1 Steps 7-8.
- "`SHARKSCOPE_NETWORKS` listadas" → Task 1 Step 1.
- "tsc + lint" → Task 1 Steps 10-11, Task 2 Steps 3-4.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código mostram código completo. Step 5 (Task 2) e Step 5/12 (Task 1) são "opcionais" mas com comandos exatos.

**3. Type consistency:**
- `OnboardingData.sharkscopeUsername: string | null` consistente em Task 1 Step 2 (interface), Step 5 (envio do finalSubmit), e Task 2 Step 1 (parse no endpoint).
- `SharkscopeNetwork` derivado de `typeof SHARKSCOPE_NETWORKS[number]` — consistente entre const declaration (Task 1 Step 1) e state declaration (Step 3).
- `hasSharkscope: boolean | null` (3 estados: null inicial, true, false) — usado consistentemente em Step 3 (state), Step 4 (validação) e Step 6 (UI).
- Nomes de colunas snake_case: `sharkscope_username` e `sharkscope_network` consistentes entre Task 2 Step 2 (INSERT) e o schema existente.

**4. Step renumbering correctness:**
- Step 6 (volume): `autoAdvance(setVolume, 7)` segue mandando pro novo step 7 (nick) — sem mudança porque o número 7 continua sendo o "próximo".
- Step 7 (novo, nick): manual `setStep(8)` no Continuar. `BackBar` pra step 6.
- Step 8 (banca, era 7): `autoAdvance(setBanca, 9)`. `BackBar` pra step 7 (nick).
- Step 9 (whatsapp, era 8): `finalSubmit` no Concluir. `BackBar` pra step 8 (banca).
