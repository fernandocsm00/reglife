# Spot lesson link Curseduca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a URL do link "Estudar este spot" no `SpotCard` pra apontar pra mesma aula Curseduca que o título já indica (em vez de URL temática genérica `reglife.com.br/<tema>`).

**Architecture:** Adicionar função pura `getLessonUrlForLeak` em `lib/poker/spotLinks.ts` que faz lookup no `LESSON_CATALOG` (já existente em `lessonCatalog.ts`) pela primeira aula matching action. Substituir 1 chamada em `lib/poker/spotTrack.ts`. Sem mudança em UI / schema / endpoints.

**Tech Stack:** Next.js App Router (TS), TypeScript puro. Sem framework de testes — validação via `tsc/lint/build` + smoke `tsx`.

**Spec base:** `docs/superpowers/specs/2026-06-02-spot-lesson-link-curseduca-design.md` (commit `c9a3b33`).

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `lib/poker/spotLinks.ts` | **Modify** | Adicionar export `CURSEDUCA_HOME` + função `getLessonUrlForLeak`. `getSpotLink` permanece intocada (consumida por `challenge30d.ts`). |
| `lib/poker/spotTrack.ts` | **Modify** (linhas 10-17 do import block + linha 59 do map) | Substituir `getSpotLink` por `getLessonUrlForLeak` na chamada de `buildSpotTrack`. |

Nenhum arquivo criado. Nenhum teste novo (projeto sem framework — smoke `tsx` temporário, apagado antes do commit).

## Sequência das tasks

1. **Task 1** — Adicionar `CURSEDUCA_HOME` + `getLessonUrlForLeak` em `spotLinks.ts` com smoke `tsx`.
2. **Task 2** — Trocar a chamada em `spotTrack.ts`.
3. **Task 3** — Sanity check final.

Cada task termina com `tsc --noEmit` verde e um commit.

---

## Task 1 — Adicionar `getLessonUrlForLeak` em `spotLinks.ts`

**Files:**
- Modify: `lib/poker/spotLinks.ts` (adições no início, sem remover nada existente)

**Por quê:** Concentra a lógica de match leak → URL Curseduca numa função pura, fácil de raciocinar e validar via smoke `tsx`.

- [ ] **Step 1: Adicionar import de `LESSON_CATALOG`, `CURSEDUCA_HOME` e `getLessonUrlForLeak`**

Editar `lib/poker/spotLinks.ts`. No topo do arquivo, logo após o cabeçalho de comentário (antes do `const PLACEHOLDER = ...` na linha 12), adicionar:

```ts
import { LESSON_CATALOG, type LessonAction } from "./lessonCatalog";

/** Home do Curso Educa — fallback quando não há aula específica pra um leak. */
export const CURSEDUCA_HOME = "https://reglife.curseduca.pro/m";
```

Depois, no final do arquivo (após a função `hasInternalTrainer`), adicionar a nova função:

```ts
/**
 * Devolve a URL Curseduca da primeira aula que cobre a action do leak.
 *
 * Procura no LESSON_CATALOG (lib/poker/lessonCatalog.ts) a primeira Lesson
 * onde tags.action bate com a action extraída do leakId.
 *
 * Pareada com lessonMeta() de components/trainer/SpotTrack.tsx — ambos usam
 * a MESMA aula (a primeira matching action). Título mostrado e link clicado
 * batem.
 *
 * Fallback: CURSEDUCA_HOME (leakId malformado, action vazio, action
 * desconhecido, ou Tier 3 sem aula no catálogo).
 */
export function getLessonUrlForLeak(leakId: string): string {
  const parts = leakId.split("-");
  if (parts.length < 1) return CURSEDUCA_HOME;
  const action = parts[0];
  if (!action) return CURSEDUCA_HOME;

  const lesson = LESSON_CATALOG.find(
    (l) => l.tags.action === (action as LessonAction),
  );
  return lesson?.url ?? CURSEDUCA_HOME;
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Se reclamar de `LessonAction` não exportado, conferir `lib/poker/lessonCatalog.ts:22` (deve já estar com `export type LessonAction`).

- [ ] **Step 3: Lint**

Run: `npx eslint lib/poker/spotLinks.ts`
Expected: zero warnings/errors.

- [ ] **Step 4: Smoke `tsx`**

Criar `./tmp-smoke-spotLinks.ts` na raiz do repo:

```ts
import { getLessonUrlForLeak, CURSEDUCA_HOME } from "./lib/poker/spotLinks";

// Caso 1: RFI matching action — devolve URL da primeira lesson RFI no LESSON_CATALOG
const r1 = getLessonUrlForLeak("RFI-BTN-40");
console.log("[1]", r1);
// Esperado: https://reglife.curseduca.pro/m/lessons/rfi-ranges-sizes-cev

// Caso 2: cBet matching action — primeira lesson cBet
const r2 = getLessonUrlForLeak("cBet-BTN-40");
console.log("[2]", r2);
// Esperado: https://reglife.curseduca.pro/m/lessons/cbet-frequencias-teoricas

// Caso 3: vsOpen — primeira lesson vsOpen (qualquer URL Curseduca matching action)
const r3 = getLessonUrlForLeak("vsOpen-BB-25");
console.log("[3] startsWithCurseduca=", r3.startsWith("https://reglife.curseduca.pro/m/lessons/"));
// Esperado: startsWithCurseduca= true

// Caso 4: Tier 3 sem aula no catálogo
const r4 = getLessonUrlForLeak("vsCheckRaise-BTN-40");
console.log("[4]", r4);
// Esperado: https://reglife.curseduca.pro/m

// Caso 5: Action desconhecido
const r5 = getLessonUrlForLeak("acao_invalida-BTN-40");
console.log("[5]", r5);
// Esperado: https://reglife.curseduca.pro/m

// Caso 6: String vazia
const r6 = getLessonUrlForLeak("");
console.log("[6]", r6);
// Esperado: https://reglife.curseduca.pro/m

// Caso 7: Leak sem action (começa com hífen)
const r7 = getLessonUrlForLeak("-BTN-40");
console.log("[7]", r7);
// Esperado: https://reglife.curseduca.pro/m

// Caso 8: Só action, sem position/stack
const r8 = getLessonUrlForLeak("RFI");
console.log("[8] startsWithCurseduca=", r8.startsWith("https://reglife.curseduca.pro/m/lessons/"));
// Esperado: startsWithCurseduca= true

// Caso 9: CURSEDUCA_HOME exportada corretamente
console.log("[9] home=", CURSEDUCA_HOME);
// Esperado: home= https://reglife.curseduca.pro/m
```

Run: `npx tsx ./tmp-smoke-spotLinks.ts`
Expected: 9 linhas batendo os comentários `// Esperado`.

DELETE `tmp-smoke-spotLinks.ts` antes do commit.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/spotLinks.ts
git commit -m "$(cat <<'EOF'
feat(plan): add getLessonUrlForLeak pra link Curseduca por aula

Nova função pura que devolve a URL Curseduca da primeira aula no
LESSON_CATALOG com tags.action matching o action do leak. Fallback
CURSEDUCA_HOME quando não há match (Tier 3 ou action desconhecido).
Pareada com lessonMeta() de SpotTrack.tsx — título e link descrevem
a MESMA aula. getSpotLink segue intacta pra uso pelo PDF antigo
(challenge30d).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Substituir chamada em `spotTrack.ts`

**Files:**
- Modify: `lib/poker/spotTrack.ts` (linhas 10-17 do import block + linha 59 do map)

**Por quê:** Última peça — fazer `buildSpotTrack` consumir a nova função. UI inteira (`SpotCard.tsx`) absorve a mudança sem qualquer alteração própria.

- [ ] **Step 1: Trocar import de `getSpotLink` por `getLessonUrlForLeak`**

Editar `lib/poker/spotTrack.ts`. O bloco atual de import (linhas 10-17) é:

```ts
import {
  FIXED_LINKS,
  canonicalSlotForLeak,
  getGradeLink,
  getSpotLink,
  hasInternalTrainer,
  slugForLeak,
} from "./spotLinks";
```

Substituir por:

```ts
import {
  FIXED_LINKS,
  canonicalSlotForLeak,
  getGradeLink,
  getLessonUrlForLeak,
  hasInternalTrainer,
  slugForLeak,
} from "./spotLinks";
```

(Trocar apenas a linha `getSpotLink,` por `getLessonUrlForLeak,`. As outras 5 entradas seguem.)

- [ ] **Step 2: Trocar a chamada no `buildSpotTrack`**

Localizar o bloco atual (linha 54-62):

```ts
return leaks.map((leak, i) => ({
  index: i,
  leakId: leak.id,
  label: leak.label,
  pct: leak.pct,
  lessonUrl: getSpotLink(leak.id),
  trainerSlug: slugForLeak(leak.id),
  hasInternalTrainer: hasInternalTrainer(leak.id),
}));
```

Substituir `getSpotLink(leak.id)` por `getLessonUrlForLeak(leak.id)`:

```ts
return leaks.map((leak, i) => ({
  index: i,
  leakId: leak.id,
  label: leak.label,
  pct: leak.pct,
  lessonUrl: getLessonUrlForLeak(leak.id),
  trainerSlug: slugForLeak(leak.id),
  hasInternalTrainer: hasInternalTrainer(leak.id),
}));
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: exit 0. Se reclamar de `getSpotLink` não usado (eslint às vezes pega isso como TS warning), conferir que o `import` ficou exatamente como o bloco acima — sem deixar `getSpotLink` no import.

- [ ] **Step 4: Lint**

Run: `npx eslint lib/poker/spotTrack.ts`
Expected: zero warnings/errors. Em particular, nenhum `unused-import` pra `getSpotLink`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build completa. Confirma que `SpotCard.tsx` continua compilando sem mudança (ele só consome `entry.lessonUrl`, que segue tipo `string`).

- [ ] **Step 6: Commit**

```bash
git add lib/poker/spotTrack.ts
git commit -m "$(cat <<'EOF'
feat(plan): buildSpotTrack usa getLessonUrlForLeak

Troca getSpotLink por getLessonUrlForLeak no map de buildSpotTrack.
SpotCard.tsx absorve a mudança sem alteração — entry.lessonUrl agora
aponta pra URL Curseduca da aula matching action, batendo com o
título já mostrado via lessonMeta(). PDF antigo (challenge30d) segue
com getSpotLink, fora de escopo até spec A8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Sanity check final

**Files:** nenhum.

**Por quê:** Atravessar critérios de aceite do spec com a feature no ar.

- [ ] **Step 1: Smoke no dev**

Run: `npm run dev`
Esperado: dev server rodando em http://localhost:3000.

- [ ] **Step 2: Aluno com plano contendo leak RFI**

Abrir `/meu-plano` autenticado como aluno com um plano onde o primeiro spot é RFI. Conferir:

- [ ] No SpotCard ativo, o botão "📺 Apresentação dos Ranges e Sizes de abertura cEV (50, 25, 15, 10bb)" aparece.
- [ ] Clicar no botão abre `https://reglife.curseduca.pro/m/lessons/rfi-ranges-sizes-cev` em nova aba (não mais `reglife.com.br/rfi`).

- [ ] **Step 3: Aluno com plano contendo leak cBet**

Abrir um plano com leak `cBet-...`. Conferir:

- [ ] Botão abre `https://reglife.curseduca.pro/m/lessons/cbet-frequencias-teoricas`.

- [ ] **Step 4: Fallback (caso forjado — opcional)**

Se quiser exercitar o fallback sem precisar de aluno Tier 3, no DevTools console rodar:

```js
fetch('/_next/static/chunks/...').then(...) // não é necessário
```

Suficiente: confirmar pelo smoke `tsx` da Task 1 que `vsCheckRaise-BTN-40` e `acao_invalida-BTN-40` retornam `CURSEDUCA_HOME`.

- [ ] **Step 5: Checar critérios de aceite do spec**

Reler `docs/superpowers/specs/2026-06-02-spot-lesson-link-curseduca-design.md` seção "Critérios de aceite". Marcar mentalmente cada:

- [ ] `getLessonUrlForLeak("RFI-BTN-40")` → URL `rfi-ranges-sizes-cev` (validado Step 2 ou smoke `tsx`).
- [ ] `getLessonUrlForLeak("cBet-BTN-40")` → URL `cbet-frequencias-teoricas` (Step 3 ou smoke).
- [ ] `getLessonUrlForLeak("vsCheckRaise-BTN-40")` → `CURSEDUCA_HOME` (smoke).
- [ ] `getLessonUrlForLeak("")` e `"acao_invalida"` → `CURSEDUCA_HOME` (smoke).
- [ ] `CURSEDUCA_HOME` exportado.
- [ ] `buildSpotTrack` chama `getLessonUrlForLeak`.
- [ ] `getSpotLink` segue exportada (confirmar via `git diff`).
- [ ] No `/meu-plano`, link abre URL Curseduca (Step 2/3).
- [ ] Título e link descrevem a MESMA aula.
- [ ] Sem alteração em `SpotCard.tsx`, `lessonCatalog.ts`, `challenge30d.ts`, `SpotTrack.tsx`.
- [ ] `tsc --noEmit` e `npm run lint` passam.

- [ ] **Step 6: Reportar pronto**

Sem ação de código. Reportar: feature completa, 2 commits no branch `onboarding-ev`, smoke ok, pronto pra `finishing-a-development-branch`.

---

## Self-Review do plano (preenchido pelo autor)

**1. Spec coverage:** cada critério do spec mapeia em alguma task.

- `getLessonUrlForLeak("RFI-BTN-40")` retorna URL específica → Task 1 Step 1 + smoke Step 4.
- `getLessonUrlForLeak("cBet-BTN-40")` retorna URL específica → idem.
- Fallback `CURSEDUCA_HOME` em vários casos → Task 1 Step 4 (smoke casos 4-7).
- `CURSEDUCA_HOME` exportado → Task 1 Step 1 (`export const CURSEDUCA_HOME`).
- `buildSpotTrack` usa nova função → Task 2 Step 2.
- `getSpotLink` segue exportada → garantido por NÃO tocar nela em Task 1/2.
- UI absorve mudança sem alteração → Task 2 Step 5 (`npm run build` valida).
- Sem alteração em outros arquivos → não há nenhuma task tocando eles.

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código mostram código completo. Step 4 da Task 3 é opcional e tem comando claro pra apoio.

**3. Type consistency:**
- `getLessonUrlForLeak(leakId: string): string` — mesma assinatura em Task 1 e referenciada em Task 2.
- `CURSEDUCA_HOME: string` — mesma constante em Task 1, sem mudança.
- `lessonUrl: string` em `SpotTrackEntry` — preservada (Task 2 não muda o tipo).
- `LessonAction` import via `type LessonAction` — `lessonCatalog.ts:22` exporta.
