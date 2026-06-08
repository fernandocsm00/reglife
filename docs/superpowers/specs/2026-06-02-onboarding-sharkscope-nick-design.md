# Spec — Coleta de nick SharkScope no OnboardingForm

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/` (OnboardingForm) + `/api/leads`
**Apelido interno:** entrega D3 simples — nick SharkScope no onboarding

## Problema

Hoje o `OnboardingForm` coleta identidade + 6 perguntas de quiz + WhatsApp opt-in (8 steps), mas **não pede o nick SharkScope** do aluno. As colunas `sharkscope_username` e `sharkscope_network` em `reglife_diagnostic_results` ficam null e são preenchidas **manualmente** depois pelo admin via modal em `/admin`.

Isso bloqueia:
- O cron `weekly-sharkscope` (que pula linhas sem nick) → o EV não puxa dados automaticamente.
- O EV de mostrar resultados do SharkScope no chat sem intervenção admin.
- O placar de Volume (`MonthlyScoreboard.volume`) de mostrar dados reais — hoje cai em "Conecte SharkScope" pra todos os alunos novos.

A reunião pediu que a coleta entre no fluxo do próprio aluno, na sequência do onboarding (após perguntas de tempo/volume, antes de banca).

## Escopo desta entrega

**D3 simples**: coletar 1 nick + 1 network no onboarding, persistir nas colunas existentes (`sharkscope_username`, `sharkscope_network`). Aluno pode pular com opt-out explícito ("não tenho conta SharkScope").

**Fora de escopo** (entram em specs posteriores):
- **D4 — criação automática de player group** via SharkScope API. Usuário vai apontar onde a API está implementada; depois disso vira spec próprio.
- Multi-site (vários nicks por aluno, ex.: PokerStars + GGPoker). Single-nick na v1.
- Sync síncrono no fim do onboarding. Cron weekly-sharkscope + admin modal manual continuam cobrindo.
- Validação dos nicks via SharkScope API (chamada extra na submissão).

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Posição do step | 7 (depois de volume, antes de banca) |
| Total de steps | 8 → 9 |
| Skipable? | Sim, com opt-out explícito ("não tenho conta SharkScope") |
| Networks oferecidas | 6 (PokerStars, GGPoker, PartyPoker, 888Poker, WPN, iPoker) — mesmas do admin modal |
| Validação | Leve no client (nick não vazio), persistência defensiva no server |
| Sync com SharkScope | Async via cron weekly-sharkscope existente |
| Schema change | Nenhum (colunas já existem) |

## Arquitetura

2 arquivos modificados, zero arquivo novo:

```
components/trainer/OnboardingForm.tsx ← Modify: novo step 7, TOTAL_STEPS 8→9, states + UI + OnboardingData
app/api/leads/route.ts                ← Modify: parse defensivo + 2 colunas no INSERT
```

**Reuso forte:**
- Lista `SHARKSCOPE_NETWORKS` extraída pra const no topo do `OnboardingForm.tsx`. O admin modal (`app/admin/page.tsx:11-17`) já lista os mesmos 6 — pode ser unificado em spec futuro mas por enquanto duplica (escopo cirúrgico).
- Pattern `RadioCard` + `motion` + paleta amber dos outros steps do quiz.
- Endpoint `/api/leads` segue o pattern defensivo de outros campos do body (parse com `typeof` check).

**Sem schema change**: colunas `sharkscope_username text` e `sharkscope_network text` já existem em `reglife_diagnostic_results`.

### Fluxo de dados

```
[Aluno completa onboarding, chega no step 7]
        │
        ▼
Escolhe radio "Sim/Não" + (se Sim) digita nick + escolhe network
        │
        ▼
Step só avança quando o botão "Continuar" é clicado
(diferente dos steps de quiz que usam auto-advance)
        │
        ▼
Avança steps 8 (banca) e 9 (whatsapp opt-in), finalSubmit
        │
        ▼
onSubmit recebe OnboardingData com sharkscopeUsername/Network
(string trimmed ou null se opt-out)
        │
        ▼
POST /api/leads { ...dados, sharkscopeUsername, sharkscopeNetwork }
        │
        ▼
Endpoint faz parse defensivo: undefined/empty/non-string → null
        │
        ▼
INSERT em reglife_diagnostic_results com sharkscope_username e
sharkscope_network preenchidos (ou null)
        │
        ▼
[Cron weekly-sharkscope (próxima execução) detecta linha com nick
 + dispara sync. EV passa a ver dados no chat.]
```

**Para o EV ver dados imediatamente** (sem esperar o cron), o admin pode rodar o sync manual no modal — comportamento atual já cobre.

## Sequência completa do onboarding

| Step | Pergunta | Tipo |
|---|---|---|
| 1 | Identidade (nome, email, phone) | Form |
| 2 | Idade | Radio |
| 3 | Tempo disponível | Radio |
| 4 | Objetivo (renda extra / profissional / etc) | Radio |
| 5 | ABI atual | Radio |
| 6 | Volume atual | Radio |
| **7** | **Nicks SharkScope (NOVO)** | **Form composto** |
| 8 | Banca (era 7) | Radio |
| 9 | WhatsApp opt-in (era 8) | Radio |

## Mudanças em `components/trainer/OnboardingForm.tsx`

### Const novas (topo do arquivo)

```ts
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

### `TOTAL_STEPS` muda de 8 para 9

```ts
const TOTAL_STEPS = 9; // era 8: 1 identidade + 6 perguntas + 1 nick + 1 banca + 1 opt-in WhatsApp
```

### `OnboardingData` ganha 2 campos

```ts
export interface OnboardingData {
  // ...campos existentes...
  sharkscopeUsername: string | null;
  sharkscopeNetwork: string | null;
}
```

### Estado novo no componente

```ts
const [hasSharkscope, setHasSharkscope] = useState<boolean | null>(null);
const [sharkscopeUsername, setSharkscopeUsername] = useState("");
const [sharkscopeNetwork, setSharkscopeNetwork] = useState<SharkscopeNetwork>("PokerStars");
```

### Validação do step 7

```ts
const sharkscopeValid =
  hasSharkscope === false ||
  (hasSharkscope === true && sharkscopeUsername.trim().length >= 2);
```

### `finalSubmit` envia os 2 campos

```ts
onSubmit({
  // ...campos existentes...
  sharkscopeUsername: hasSharkscope ? sharkscopeUsername.trim() : null,
  sharkscopeNetwork: hasSharkscope ? sharkscopeNetwork : null,
});
```

### Renumeração dos steps existentes

- Banca: step 7 → step 8.
- WhatsApp opt-in: step 8 → step 9.
- `finalSubmit` segue chamado no fim do step 9.

### UI do step 7

```tsx
{step === 7 && (
  <motion.div /* mesma transition dos outros steps */>
    <h2 className="text-xl font-semibold mb-6">
      Você joga em algum site que o SharkScope cobre?
    </h2>

    <div className="space-y-2 mb-6">
      <RadioCard
        selected={hasSharkscope === true}
        onClick={() => setHasSharkscope(true)}
        label="Sim, tenho conta SharkScope"
      />
      <RadioCard
        selected={hasSharkscope === false}
        onClick={() => setHasSharkscope(false)}
        label="Não tenho conta SharkScope"
      />
    </div>

    {hasSharkscope === true && (
      <>
        <label className="block text-sm text-neutral-300 mb-2">
          Em qual site você joga mais?
        </label>
        <select
          value={sharkscopeNetwork}
          onChange={(e) => setSharkscopeNetwork(e.target.value as SharkscopeNetwork)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 mb-4"
        >
          {SHARKSCOPE_NETWORKS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <label className="block text-sm text-neutral-300 mb-2">
          Qual é o seu nick nesse site?
        </label>
        <input
          type="text"
          value={sharkscopeUsername}
          onChange={(e) => setSharkscopeUsername(e.target.value)}
          placeholder="seu_nick_aqui"
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 mb-4"
          autoFocus
        />

        <p className="text-xs text-neutral-500 mb-6">
          ℹ️ Sem isso o EV não vai puxar seus resultados automaticamente.
          Você ainda pode informar depois conversando com o EV.
        </p>
      </>
    )}

    <button
      type="button"
      disabled={!sharkscopeValid}
      onClick={() => setStep(8)}
      className="rg-btn rg-btn--primary"
    >
      Continuar →
    </button>
  </motion.div>
)}
```

**Notas:**
- Identificar o componente `RadioCard` real usado pelos outros steps. Se for inline em outras seções, replicar o estilo no novo step (consistência visual).
- Botão "Continuar" explícito em vez de `autoAdvance` porque há input de texto que precisa de cuidado. Padrão similar ao step 1 (identidade) que já usa botão manual.

## Mudanças em `app/api/leads/route.ts`

### Parse defensivo dos novos campos

Logo após o bloco de `whatsappOptIn`, adicionar:

```ts
// SharkScope: nick + network informados no onboarding (step 7). Quando o
// aluno marca "não tenho conta", chegam como null e ficam vazios na linha
// — o cron weekly-sharkscope e o admin modal pulam linhas sem nick.
const sharkscopeUsername: string | null =
  typeof body.sharkscopeUsername === "string" && body.sharkscopeUsername.trim().length > 0
    ? body.sharkscopeUsername.trim()
    : null;
const sharkscopeNetwork: string | null =
  typeof body.sharkscopeNetwork === "string" && body.sharkscopeNetwork.trim().length > 0
    ? body.sharkscopeNetwork.trim()
    : null;
```

Defensivo: undefined / não-string / `""` viram `null`. Não confia no body cru.

### INSERT acrescenta 2 colunas

No objeto dentro de `.insert([{ ... }])`, acrescentar 2 linhas entre `whatsapp_opt_in` e `stopped_early`:

```ts
{
  player_name: body.playerName ?? "Jogador",
  // ...campos existentes...
  whatsapp_opt_in: whatsappOptIn,
  sharkscope_username: sharkscopeUsername,   // NOVO
  sharkscope_network: sharkscopeNetwork,     // NOVO
  stopped_early: false,
  // ...resto...
},
```

### Sem sync síncrono

Endpoint NÃO chama `/api/sharkscope/sync-diagnostic`. Cron weekly-sharkscope existente sincroniza assincronamente.

## Error handling

| Camada | Cenário | Comportamento |
|---|---|---|
| Client | Nick vazio + hasSharkscope === true | Botão "Continuar" desabilitado |
| Client | hasSharkscope === null (nenhuma opção marcada) | Botão "Continuar" desabilitado |
| Client | hasSharkscope === false | Botão "Continuar" habilitado, envia null |
| Endpoint | `body.sharkscopeUsername` undefined / tipo errado / "" | Persiste null (defensivo) |
| Endpoint | Mismatch (`username` preenchido mas `network` null, ou vice-versa) | Aceita mesmo assim — admin/EV resolve depois |
| Endpoint | INSERT falhar | Erro 500 padrão (já existe — não muda) |
| Cron weekly | Linha com nick inválido / inexistente no SharkScope | Falha registrada por linha, não bloqueia outras (comportamento existente) |

## Testes

Projeto sem framework de testes — validação via:

1. **tsc + lint** nos 2 arquivos modificados.
2. **Smoke visual no `npm run dev`**:
   - Completar quiz inteiro. No step 7, marcar "Sim" → preencher nick + network → terminar.
   - Verificar no Supabase: linha tem `sharkscope_username = "test_nick"` + `sharkscope_network = "PokerStars"`.
   - Refazer: marcar "Não" → terminar. Linha com colunas null.
   - DevTools → ver request POST `/api/leads` com os campos.
3. **Smoke via `curl`** (opcional):
   - Body com `sharkscopeUsername: "test"` + `sharkscopeNetwork: "GGPoker"` → row inserida.
   - Body sem esses campos → row inserida com colunas null (backward compat).

## Performance & Risco

- **Zero impacto runtime** — só acrescenta 1 step ao quiz.
- **Zero impacto no admin** — modal manual continua funcionando, agora opera sobre dados pré-preenchidos quando aluno não opt-out.
- **Zero impacto no cron** — weekly-sharkscope já tem lógica de pular linhas sem nick (`sharkscope_username IS NULL`).
- **Backward compat** — payloads legados sem `sharkscopeUsername` no body persistem como null (defensive parse).
- **Drop-off risk** — baixo: aluno tem opção explícita "Não tenho conta" sem fricção.
- **Validação leve** — nick errado/inexistente não bloqueia onboarding; cron / EV detectam depois e admin pode corrigir via modal existente.

## Critérios de aceite

- [ ] `OnboardingForm` tem 9 steps na sequência: identidade → idade → tempo → objetivo → ABI → volume → **nicks** → banca → whatsapp opt-in.
- [ ] `TOTAL_STEPS` declarado como `9` (era `8`).
- [ ] Step 7 mostra radio "Sim/Não" pra SharkScope.
- [ ] Selecionar "Sim" revela select de network (6 opções) + input de nick.
- [ ] Selecionar "Não" oculta os inputs e habilita "Continuar" direto.
- [ ] Botão "Continuar" desabilitado quando `hasSharkscope === null` OR `(hasSharkscope === true && nick.trim().length < 2)`.
- [ ] Sub-texto explica que o EV não puxará dados sem o nick.
- [ ] `OnboardingData` ganha `sharkscopeUsername: string | null` e `sharkscopeNetwork: string | null`.
- [ ] `finalSubmit` envia null quando aluno opt-out, string `.trim()`-ed quando preenche.
- [ ] `/api/leads` aceita `sharkscopeUsername` e `sharkscopeNetwork` no body com parse defensivo (undefined/empty/non-string → null).
- [ ] INSERT em `reglife_diagnostic_results` inclui as 2 colunas (com valor ou null).
- [ ] Endpoint NÃO chama `/api/sharkscope/sync-diagnostic` nem dispara sync síncrono.
- [ ] Banca e WhatsApp opt-in renumerados (steps 8 e 9 respectivamente).
- [ ] `tsc --noEmit` e `npm run lint` passam.
- [ ] `SHARKSCOPE_NETWORKS` listadas exatamente: PokerStars, GGPoker, PartyPoker, 888Poker, WPN, iPoker.
