# Spec — Link "Estudar" pro spot específico no Curso Educa

**Data:** 2026-06-02
**Branch:** `onboarding-ev`
**Página afetada:** `/meu-plano` (componente `SpotCard`)
**Apelido interno:** entrega A2 — link estudar Curseduca

## Problema

Hoje, em `/meu-plano`, cada `SpotCard` mostra um botão **"Estudar este spot"** com:

- **Título** vindo de `LESSON_CATALOG` (em `lib/poker/lessonCatalog.ts`) — primeira `Lesson` com `tags.action === action`. Resolve para URL Curseduca específica do bloco BASES 2.0 (ex.: `"Apresentação dos Ranges e Sizes de abertura cEV"`).
- **Link (`entry.lessonUrl`)** vindo de `getSpotLink(leak.id)` em `lib/poker/spotLinks.ts` — URL temática genérica `reglife.com.br/<tema>` (ex.: `reglife.com.br/rfi`).

**Inconsistência atual:** título e link descrevem coisas diferentes. O aluno clica num botão que diz "Apresentação dos Ranges..." e cai numa página genérica que pode não conter essa aula.

A reunião de melhorias do trainer (transcrição auditada) decidiu que o link deve levar **direto pro spot específico no Curso Educa**, não pra URL temática. O `LESSON_CATALOG` já tem URLs Curseduca individuais — só falta cruzar.

## Escopo desta entrega

Trocar a fonte do `lessonUrl` em `buildSpotTrack` (`lib/poker/spotTrack.ts`) pra apontar pra mesma aula do Curseduca que o `lessonMeta` em `SpotTrack.tsx` já usa pra montar o título. Título e link passam a bater.

**Fora de escopo** (entram em specs posteriores):

- Mudanças visuais no `SpotCard.tsx`. Esta entrega não toca em UI — só na URL do `<a href>` existente.
- Substituir `getSpotLink` em `lib/poker/challenge30d.ts` (PDF antigo). O PDF está marcado pra ser redesenhado em spec separado (A8 da auditoria); até lá, segue usando URLs temáticas.
- Mudança no formato do `LESSON_CATALOG` ou ordenação das aulas.
- Match refinado por `positions` / `stackBands` do leak. Pra v1, a primeira aula matching action é suficiente (didaticamente correta — é a apresentação do tema).
- Página agregada de tema no Curso Educa (Curseduca não expõe esse tipo de página hoje).

## Decisões de design (já validadas)

| Decisão | Valor |
|---|---|
| Estratégia de match | Primeira aula no `LESSON_CATALOG` com `tags.action === action` |
| Fallback (action inválido / sem aula) | `CURSEDUCA_HOME` = `https://reglife.curseduca.pro/m` |
| `getSpotLink` permanece exportada | Sim (consumida por `challenge30d.ts`) |
| `lessonUrl` no `SpotTrackEntry` | Tipo segue `string`, sem mudança |
| Match refinado por position/stack | Não (v1) |

## Arquitetura

Uma adição + uma edição:

```
lib/poker/spotLinks.ts          ← Modify: nova export getLessonUrlForLeak + CURSEDUCA_HOME
lib/poker/spotTrack.ts          ← Modify (linha 14 import + linha 59 buildSpotTrack)
```

**Inalterado:**
- `lib/poker/lessonCatalog.ts` — fonte de dados, já correto.
- `components/trainer/SpotCard.tsx` — consome `entry.lessonUrl` opacamente.
- `components/trainer/SpotTrack.tsx` — `lessonMeta()` já usa o mesmo critério ("primeira matching action") pra montar título e blurb. Linha 38: `const first = LESSON_CATALOG.find((l) => l.tags.action === action);` Pareando link com `getLessonUrlForLeak` garante que título + link descrevem a MESMA aula.
- `lib/poker/challenge30d.ts` — PDF antigo segue com `getSpotLink`. Será revisto em spec A8.

### Fluxo de dados

1. Aluno abre `/meu-plano`.
2. `PlanScreen` chama `buildSpotTrack(plan)` em `lib/poker/spotTrack.ts`.
3. Para cada leak do plano, `buildSpotTrack` chama `getLessonUrlForLeak(leak.id)` em vez de `getSpotLink(leak.id)`.
4. `getLessonUrlForLeak` extrai `action` do `leakId`, procura no `LESSON_CATALOG` a primeira `Lesson` com `tags.action === action`, devolve `lesson.url`.
5. Sem match → devolve `CURSEDUCA_HOME`.
6. `SpotCard.tsx` renderiza o `<a href={entry.lessonUrl}>` sem qualquer alteração.

## Contrato da função pura

### `getLessonUrlForLeak(leakId: string): string`

Em `lib/poker/spotLinks.ts`:

```ts
/** Home do Curso Educa — fallback quando não há aula específica pra um leak. */
export const CURSEDUCA_HOME = "https://reglife.curseduca.pro/m";

/**
 * Devolve a URL Curseduca da primeira aula que cobre a action do leak.
 *
 * Procura no LESSON_CATALOG (em lib/poker/lessonCatalog.ts) a primeira
 * Lesson onde tags.action bate com a action extraída do leakId.
 *
 * Pareada com lessonMeta() de components/trainer/SpotTrack.tsx — ambos usam
 * a MESMA aula (a primeira matching action). Título mostrado e link clicado
 * batem.
 *
 * Fallback: CURSEDUCA_HOME (leakId malformado, action vazio, action
 * desconhecido, ou Tier 3 sem aula no catálogo).
 */
export function getLessonUrlForLeak(leakId: string): string;
```

### Regras de match

1. **Extrai action**: `leakId.split("-")[0]`. Convenção compartilhada com `getSpotLink`, `slugForLeak`, `canonicalSlotForLeak`.
2. **Action vazio ou ausente** (string vazia, leakId malformado) → `CURSEDUCA_HOME`.
3. **Action não corresponde a nenhum `LessonAction`** → `CURSEDUCA_HOME`.
4. **Lookup**: `LESSON_CATALOG.find((l) => l.tags.action === action)`. Devolve `.url` da primeira correspondência.
5. **Nenhum match** (raro: action válido mas sem aula no catálogo) → `CURSEDUCA_HOME`.

### Por que "primeira" é a aula certa

`LESSON_CATALOG` está organizado por blocos didáticos (BASES 2.0 → Modo Carreira → Camadas → Aulas Ao Vivo). Cada bloco começa com a aula introdutória de BASES 2.0 (ex.: para RFI, a primeira é `"Apresentação dos Ranges e Sizes de abertura cEV (50, 25, 15, 10bb)"`). É o que faz sentido pra um aluno entrar primeiro. A mesma lógica já é usada em `SpotTrack.tsx:38` pra montar o título mostrado — pareando ambos, fechamos a inconsistência.

## Mudança em `spotTrack.ts`

Duas linhas:

```diff
- import { getSpotLink, ... } from "./spotLinks";
+ import { getLessonUrlForLeak, ... } from "./spotLinks";
```

E na função `buildSpotTrack`:

```diff
  return leaks.map((leak, i) => ({
    index: i,
    leakId: leak.id,
    label: leak.label,
    pct: leak.pct,
-   lessonUrl: getSpotLink(leak.id),
+   lessonUrl: getLessonUrlForLeak(leak.id),
    trainerSlug: slugForLeak(leak.id),
    hasInternalTrainer: hasInternalTrainer(leak.id),
  }));
```

`getSpotLink` segue exportada e consumida por `challenge30d.ts` (PDF antigo, fora de escopo).

## Casos de teste

| # | Input | Resultado esperado |
|---|---|---|
| 1 | `"RFI-BTN-40"` | `https://reglife.curseduca.pro/m/lessons/rfi-ranges-sizes-cev` |
| 2 | `"cBet-BTN-40"` | `https://reglife.curseduca.pro/m/lessons/cbet-frequencias-teoricas` |
| 3 | `"vsOpen-BB-25"` | URL da primeira lesson `vsOpen` no `LESSON_CATALOG` |
| 4 | `"vsCheckRaise-BTN-40"` (Tier 3, sem aula) | `CURSEDUCA_HOME` |
| 5 | `"acao_invalida-BTN-40"` (action desconhecido) | `CURSEDUCA_HOME` |
| 6 | `""` (vazio) | `CURSEDUCA_HOME` |
| 7 | `"-BTN-40"` (action vazio) | `CURSEDUCA_HOME` |
| 8 | `"RFI"` (só action, sem position/stack) | URL da primeira lesson RFI |

## Error handling

Função pura, sem I/O. Não lança. `LESSON_CATALOG` é estático no bundle — TypeScript valida o shape em build-time.

## Testes

1. **`lib/poker/spotLinks.test.ts`** — não há framework de testes no projeto. Smoke `tsx` cobrindo os 8 casos da tabela (mesmo padrão das entregas anteriores). Script temporário, apaga após validar.
2. **Sem teste de componente** — `SpotCard.tsx` zero alteração. Confiamos no tipo `lessonUrl: string` (tsc) + smoke visual no dev.
3. **Verificação visual no dev** (`npm run dev`):
   - Abrir `/meu-plano` com um plano com leaks RFI / cBet.
   - Clicar no botão "📺 {title}" no SpotCard ativo.
   - Confirmar que abre a URL Curseduca da primeira aula matching action (não mais `reglife.com.br/<tema>`).

## Performance & Risco

- **Zero impacto em runtime**: `LESSON_CATALOG.find` é O(n) onde n ≈ 100 lessons — milisegundos, executado uma vez por leak (max 3 por plano).
- **Sem impacto no fluxo do aluno**: nenhuma mudança em `/api/spot-training`, `PulseCard`, `HealthScoreBlock`, ou cron jobs.
- **Sem impacto no admin**: `AdminSpotTrack`, `MonthlyScoreboard`, `PulseTimeline` não consomem `lessonUrl`.
- **PDF antigo segue funcionando**: `challenge30d.ts` continua com `getSpotLink` → URLs temáticas. Migrar PDF é spec A8 separado.
- **Regressão possível**: se algum spot do plano tem `action` no leak que não tem aula no `LESSON_CATALOG` (Tier 3), o aluno cai na home do Curseduca em vez da URL temática que existia antes. Trade-off aceito: home é honesta ("tá aqui o catálogo"), URL temática antiga pode estar morta ou enganosa.

## Critérios de aceite

- [ ] `getLessonUrlForLeak("RFI-BTN-40")` retorna `https://reglife.curseduca.pro/m/lessons/rfi-ranges-sizes-cev`.
- [ ] `getLessonUrlForLeak("cBet-BTN-40")` retorna `https://reglife.curseduca.pro/m/lessons/cbet-frequencias-teoricas`.
- [ ] `getLessonUrlForLeak("vsCheckRaise-BTN-40")` retorna `https://reglife.curseduca.pro/m` (fallback).
- [ ] `getLessonUrlForLeak("")` retorna `CURSEDUCA_HOME`.
- [ ] `getLessonUrlForLeak("acao_invalida")` retorna `CURSEDUCA_HOME`.
- [ ] `CURSEDUCA_HOME` exportado em `lib/poker/spotLinks.ts`.
- [ ] `buildSpotTrack` em `lib/poker/spotTrack.ts` chama `getLessonUrlForLeak` em vez de `getSpotLink`.
- [ ] `getSpotLink` segue exportada (não removida).
- [ ] No `/meu-plano`, clicar no botão "Estudar este spot" abre URL Curseduca da aula matching action, não mais `reglife.com.br/<tema>`.
- [ ] Título mostrado no botão (de `lessonMeta`) e URL aberta (de `lessonUrl`) descrevem a MESMA aula.
- [ ] Nenhuma alteração em `SpotCard.tsx`, `lessonCatalog.ts`, `challenge30d.ts`, `SpotTrack.tsx`.
- [ ] `tsc --noEmit` e `npm run lint` passam.
