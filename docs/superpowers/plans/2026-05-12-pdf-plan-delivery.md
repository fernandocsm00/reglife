# PDF Plan Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o plano de 90 dias como PDF resumo de 3 páginas, distribuído via email e WhatsApp, com botão de download persistente em `/meu-plano`.

**Architecture:** Frontend POSTa o `SavedPlan` completo pra `/api/results`. Server-side: insere a linha no Supabase, gera PDF com `@react-pdf/renderer`, faz upload pro bucket `plan-pdfs`, dispara entregas fire-and-forget nos canais escolhidos (email stub + WhatsApp Z-API). Botão em `/meu-plano` aponta pra rota curta `/r/[id]` que redireciona pro Storage.

**Tech Stack:**
- PDF: `@react-pdf/renderer` (server-side, sem Chromium)
- Storage: Supabase Storage (bucket público, UUID-protected)
- Email: provider-agnostic interface (stub agora, provider real depois)
- WhatsApp: Z-API/Evolution já configurado
- Frontend: Next.js 16 + React 19 (já no projeto)

**Sem framework de testes** — gate de qualidade é `npx tsc --noEmit` + script de PDF de amostra pra eyeball + smoke test E2E na última task.

---

### Task 1: Install dep + migration 008 (Storage bucket)

**Files:**
- Modify: `package.json` (via npm install)
- Create: `supabase/migrations/008_plan_pdf_storage.sql`

- [ ] **Step 1: Install @react-pdf/renderer**

```bash
cd reglife-trainer
npm install @react-pdf/renderer
```

Expected: `package.json` updated with new dep at ~v4.x, `package-lock.json` updated.

- [ ] **Step 2: Create the storage migration file**

Create `supabase/migrations/008_plan_pdf_storage.sql`:

```sql
-- ============================================================
-- RegLife — Migration 008: bucket pro PDF do plano
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('plan-pdfs', 'plan-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "plan-pdfs: public read" on storage.objects;
create policy "plan-pdfs: public read"
  on storage.objects for select
  using (bucket_id = 'plan-pdfs');

drop policy if exists "plan-pdfs: service write" on storage.objects;
create policy "plan-pdfs: service write"
  on storage.objects for insert to service_role
  with check (bucket_id = 'plan-pdfs');

drop policy if exists "plan-pdfs: service update" on storage.objects;
create policy "plan-pdfs: service update"
  on storage.objects for update to service_role
  using (bucket_id = 'plan-pdfs');
```

- [ ] **Step 3: Typecheck baseline**

Run: `npx tsc --noEmit`
Expected: zero errors (no code changed yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json supabase/migrations/008_plan_pdf_storage.sql
git commit -m "feat(pdf): add @react-pdf/renderer + storage bucket migration"
```

> **Nota pra você (Fernando):** rode a migration 008 no SQL Editor do projeto Supabase novo (`kpuhxvbfuvnvxpirufqw`) **antes de fazer o deploy** — sem o bucket, o upload falha e o PDF não é entregue.

---

### Task 2: PDF utility functions

Cria funções puras (sem React) que extraem os dados que o PDF precisa do `SavedPlan`. Mantém o `generatePlanPdf.ts` focado em layout.

**Files:**
- Create: `lib/pdf/utils.ts`

- [ ] **Step 1: Create the file with utilities**

```ts
// lib/pdf/utils.ts — Extrai dados estruturados de um SavedPlan pra alimentar o PDF.

import type { SavedPlan } from "@/lib/poker/planStorage";

export interface SpotAccuracyEntry {
  label: string;     // "RFI · 15bb · BTN"
  pct: number;       // 0-100
  passed: boolean;
}

export interface LeakHighlight {
  label: string;     // "Vs RFI · 15bb · HJ"
  pct: number;       // accuracy do spot
  narrative: string; // 1-2 frases na voz do EV
}

const STUDY_TIME_LABELS: Record<string, string> = {
  ate15: "Até 15h/semana",
  ate40: "Até 40h/semana",
  mais40: "Mais de 40h/semana",
};

const PROFIT_GOAL_LABELS: Record<string, string> = {
  usd1k: "USD 1k/mês",
  usd10k: "USD 10k/mês",
  usd50k: "USD 50k/mês",
  usd100k: "USD 100k/mês",
};

export function profileSummary(plan: SavedPlan) {
  return {
    studyTime: STUDY_TIME_LABELS[plan.studyTime] ?? "Não informado",
    profitGoal: PROFIT_GOAL_LABELS[plan.profitGoal] ?? "Não informado",
    volumeTarget: plan.volumeTargetWeekly
      ? `${plan.volumeTargetWeekly} torneios/semana`
      : null,
  };
}

/**
 * Extrai os spots no formato {label, pct, passed} pra alimentar o
 * gráfico horizontal de accuracy da página 2.
 */
export function buildAccuracyList(plan: SavedPlan): SpotAccuracyEntry[] {
  return plan.byTrainer.map((b) => ({
    label: b.label,
    pct: Math.round(b.pct),
    passed: b.pct >= 70,
  }));
}

/**
 * Top N leaks ordenados do pior pro menos ruim (menor accuracy primeiro).
 * Narrativa é hard-coded por enquanto — futura iteração pode usar OpenAI.
 */
export function topLeaks(plan: SavedPlan, n: number = 3): LeakHighlight[] {
  return [...plan.leaks]
    .sort((a, b) => {
      const accA = a.total > 0 ? (a.total - a.errors) / a.total : 1;
      const accB = b.total > 0 ? (b.total - b.errors) / b.total : 1;
      return accA - accB; // pior primeiro
    })
    .slice(0, n)
    .map((leak) => {
      const accuracyPct =
        leak.total > 0
          ? Math.round(((leak.total - leak.errors) / leak.total) * 100)
          : 0;
      return {
        label: `${leak.actionLabel} · ${leak.position} · ${leak.stackBand}`,
        pct: accuracyPct,
        narrative: leak.recommendation,
      };
    });
}

/**
 * Pega 2-3 bullets do focus de cada fase pra mostrar no roadmap.
 * Mantém curto pra caber no PDF.
 */
export function phaseHighlights(plan: SavedPlan): Array<{
  title: string;
  range: string;
  bullets: string[];
}> {
  return plan.phases.map((phase) => {
    const bullets = [phase.focus];
    const taskBullets = phase.tasks
      .slice(0, 2)
      .map((t) => t.text);
    bullets.push(...taskBullets);
    return {
      title: phase.title,
      range: phase.rangeLabel,
      bullets: bullets.slice(0, 3),
    };
  });
}

/** Resumo numérico pra capa. */
export function coverHeadline(plan: SavedPlan) {
  return {
    tier: plan.playerTier,
    tierLabel: plan.playerTierLabel,
    accuracyPct: plan.accuracyPct,
    correctOfTotal: `${plan.totalCorrect} de ${plan.totalDrills}`,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/utils.ts
git commit -m "feat(pdf): add SavedPlan extractor utilities"
```

---

### Task 3: PDF generator (the heavy one — 3 pages)

**Files:**
- Create: `lib/pdf/generatePlanPdf.ts`

- [ ] **Step 1: Create generator with Cover page**

```tsx
// lib/pdf/generatePlanPdf.ts — Gera o PDF de 3 páginas com @react-pdf/renderer.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  buildAccuracyList,
  coverHeadline,
  phaseHighlights,
  profileSummary,
  topLeaks,
} from "./utils";

// ---------------------------------------------------------------------------
// Paleta + tipografia
// ---------------------------------------------------------------------------
const COLORS = {
  bg: "#FFFFFF",
  fg: "#0F172A",        // texto principal
  muted: "#475569",     // texto secundário
  amber: "#D97706",     // accent da marca
  amberSoft: "#FEF3C7", // fundo de destaque
  red: "#DC2626",       // accuracy <50%
  yellow: "#CA8A04",    // accuracy 50-69%
  green: "#16A34A",     // accuracy >=70%
  border: "#E2E8F0",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    color: COLORS.fg,
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  h1: { fontSize: 26, fontWeight: "bold", color: COLORS.fg },
  h2: { fontSize: 18, fontWeight: "bold", color: COLORS.fg, marginBottom: 8 },
  h3: { fontSize: 14, fontWeight: "bold", color: COLORS.fg, marginBottom: 4 },
  muted: { color: COLORS.muted, fontSize: 10 },
  amberAccent: { color: COLORS.amber, fontWeight: "bold" },
  hr: { borderBottomWidth: 1, borderBottomColor: COLORS.border, marginVertical: 12 },
  highlightBox: {
    backgroundColor: COLORS.amberSoft,
    borderRadius: 6,
    padding: 14,
    marginVertical: 8,
  },
  row: { flexDirection: "row" },
  col: { flexDirection: "column" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Página 1 — Capa
// ---------------------------------------------------------------------------
function CoverPage({ plan }: { plan: SavedPlan }) {
  const cover = coverHeadline(plan);
  const profile = profileSummary(plan);
  const issued = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Page size="A4" style={styles.page}>
      <View>
        <Text style={[styles.muted, { letterSpacing: 1.5 }]}>REGLIFE</Text>
        <Text style={[styles.h1, { marginTop: 4 }]}>
          Seu Plano de Evolução · 90 Dias
        </Text>
        <Text style={[styles.muted, { marginTop: 8 }]}>
          {plan.playerName} · {issued}
        </Text>
      </View>

      <View style={[styles.highlightBox, { marginTop: 32 }]}>
        <Text style={styles.muted}>TIER ATUAL</Text>
        <Text style={[styles.amberAccent, { fontSize: 36, marginTop: 4 }]}>
          Tier {cover.tier}
        </Text>
        <Text style={[styles.muted, { marginTop: 2 }]}>{cover.tierLabel}</Text>

        <View style={[styles.hr, { marginVertical: 16 }]} />

        <Text style={styles.muted}>ACCURACY DO DIAGNÓSTICO</Text>
        <Text style={[styles.h2, { marginTop: 4 }]}>{cover.accuracyPct}%</Text>
        <Text style={styles.muted}>{cover.correctOfTotal} spots corretos</Text>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={styles.h3}>Seu perfil</Text>
        <Text style={{ marginTop: 4 }}>
          <Text style={styles.muted}>Meta de profit: </Text>
          {profile.profitGoal}
        </Text>
        <Text style={{ marginTop: 4 }}>
          <Text style={styles.muted}>Tempo de estudo: </Text>
          {profile.studyTime}
        </Text>
        {profile.volumeTarget && (
          <Text style={{ marginTop: 4 }}>
            <Text style={styles.muted}>Volume target: </Text>
            {profile.volumeTarget}
          </Text>
        )}
      </View>

      <Text style={styles.footer}>
        Gerado por EV · seu Manager de Evolução
      </Text>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Página 2 — Diagnóstico (top 3 leaks + accuracy chart)
// ---------------------------------------------------------------------------
function DiagnosticPage({ plan }: { plan: SavedPlan }) {
  const leaks = topLeaks(plan, 3);
  const accuracy = buildAccuracyList(plan);

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h2}>O que vimos na sua avaliação</Text>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.h3}>Top 3 leaks</Text>
        {leaks.map((leak, i) => (
          <View
            key={i}
            style={{
              marginTop: 10,
              padding: 10,
              borderLeftWidth: 3,
              borderLeftColor: COLORS.amber,
              backgroundColor: "#FAFAF9",
            }}
          >
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontWeight: "bold" }}>{leak.label}</Text>
              <Text style={[styles.amberAccent]}>{leak.pct}% acerto</Text>
            </View>
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {leak.narrative}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.hr, { marginVertical: 16 }]} />

      <Text style={styles.h3}>Accuracy por spot</Text>
      <View style={{ marginTop: 8 }}>
        {accuracy.map((spot, i) => (
          <View key={i} style={{ marginVertical: 3 }}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontSize: 9 }}>{spot.label}</Text>
              <Text style={{ fontSize: 9, color: COLORS.muted }}>{spot.pct}%</Text>
            </View>
            <View
              style={{
                marginTop: 2,
                height: 6,
                backgroundColor: COLORS.border,
                borderRadius: 3,
              }}
            >
              <View
                style={{
                  width: `${spot.pct}%`,
                  height: "100%",
                  backgroundColor:
                    spot.pct >= 70
                      ? COLORS.green
                      : spot.pct >= 50
                        ? COLORS.yellow
                        : COLORS.red,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.muted, { marginTop: 12, fontStyle: "italic" }]}>
        Esses são os pontos onde EV vai te cobrar mais nos primeiros 30 dias.
      </Text>

      <Text style={styles.footer}>
        Reglife · Plano de Evolução · {plan.playerName}
      </Text>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Página 3 — Roadmap
// ---------------------------------------------------------------------------
function RoadmapPage({ plan }: { plan: SavedPlan }) {
  const phases = phaseHighlights(plan);

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h2}>Sua jornada</Text>

      {phases.map((phase, i) => (
        <View
          key={i}
          style={{
            marginTop: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 6,
          }}
        >
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={{ fontWeight: "bold" }}>{phase.title}</Text>
            <Text style={styles.muted}>{phase.range}</Text>
          </View>
          {phase.bullets.map((b, j) => (
            <Text key={j} style={{ marginTop: 4 }}>
              · {b}
            </Text>
          ))}
        </View>
      ))}

      <View style={[styles.highlightBox, { marginTop: 24 }]}>
        <Text style={styles.h3}>Como o EV te acompanha</Text>
        <Text style={{ marginTop: 6 }}>· Chat — fale com o EV a qualquer hora</Text>
        <Text style={{ marginTop: 4 }}>· Quests semanais — desafios pra manter o ritmo</Text>
        <Text style={{ marginTop: 4 }}>
          · SharkScope — sincronizando seu volume e ROI real
        </Text>
      </View>

      <Text style={[styles.muted, { marginTop: 24, textAlign: "center" }]}>
        Continue na plataforma → ia-reglife.eldzmi.easypanel.host/meu-plano
      </Text>

      <Text style={styles.footer}>
        Reglife · Plano de Evolução · {plan.playerName}
      </Text>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function generatePlanPdf(plan: SavedPlan): Promise<Buffer> {
  const doc = (
    <Document
      title={`Plano Reglife · ${plan.playerName}`}
      author="EV (Reglife)"
      subject="Plano de Evolução · 90 Dias"
    >
      <CoverPage plan={plan} />
      <DiagnosticPage plan={plan} />
      <RoadmapPage plan={plan} />
    </Document>
  );

  return renderToBuffer(doc);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (Se reclamar de JSX em `.ts`, renomeie pra `.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/generatePlanPdf.ts lib/pdf/utils.ts
git commit -m "feat(pdf): add 3-page plan PDF generator with @react-pdf/renderer"
```

---

### Task 4: Sample PDF script (for visual review)

Gera um PDF de teste com dados fake. Você roda, abre o arquivo, dá feedback visual. Equivalente a um snapshot test mas pra olho humano.

**Files:**
- Create: `scripts/generate-sample-pdf.ts`

- [ ] **Step 1: Create the script**

```ts
// scripts/generate-sample-pdf.ts — Gera um PDF de amostra pra revisão visual.
// Uso: npx tsx scripts/generate-sample-pdf.ts
// Saída: ./sample-plan.pdf

import { writeFileSync } from "node:fs";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import type { SavedPlan } from "@/lib/poker/planStorage";

const samplePlan: SavedPlan = {
  version: 1,
  id: "sample-id",
  createdAt: Date.now(),
  playerName: "Fernando Reglife",
  email: "fernando@reglife.com.br",
  phone: "+5511999999999",
  studyTime: "ate40",
  profitGoal: "usd10k",
  volumeTargetWeekly: 80,
  playerTier: 2,
  playerTierLabel: "Reg de Reg",
  accuracyPct: 72,
  totalCorrect: 13,
  totalErrors: 5,
  totalDrills: 18,
  stoppedEarly: false,
  spotsPlayed: 18,
  spotsFailed: 2,
  byTrainer: [
    { label: "RFI · 15bb · BTN", correct: 2, total: 3, pct: 66 },
    { label: "RFI · 25bb · CO", correct: 3, total: 3, pct: 100 },
    { label: "Vs RFI · 15bb · HJ", correct: 1, total: 3, pct: 33 },
    { label: "Vs RFI · 50bb · BTN", correct: 2, total: 3, pct: 66 },
    { label: "Vs 3-bet · CO", correct: 3, total: 3, pct: 100 },
    { label: "C-Bet · BTN", correct: 2, total: 3, pct: 66 },
  ],
  leaks: [
    {
      id: "vsrfi-hj-15",
      action: "vsOpen",
      actionLabel: "Vs RFI",
      position: "HJ",
      stackBand: "15bb",
      errors: 2,
      total: 3,
      examples: [],
      recommendation:
        "Você está pagando demais com mão marginal contra UTG em short stack. Foco em folds disciplinados.",
      lessons: [],
    },
    {
      id: "rfi-btn-15",
      action: "RFI",
      actionLabel: "RFI",
      position: "BTN",
      stackBand: "15bb",
      errors: 1,
      total: 3,
      examples: [],
      recommendation:
        "Tá abrindo apertado demais no BTN com 15bb. Em short stack o BTN é uma das melhores posições — alarga o range.",
      lessons: [],
    },
    {
      id: "cbet-btn-100",
      action: "cBet",
      actionLabel: "C-Bet",
      position: "BTN",
      stackBand: "100bb",
      errors: 1,
      total: 3,
      examples: [],
      recommendation:
        "Em boards drawy você tá c-betando demais como blefe puro. Escolhe melhor as texturas.",
      lessons: [],
    },
  ],
  phases: [
    {
      id: "fase1",
      title: "Fase 1 · Fundamentos",
      rangeLabel: "Dias 0-30",
      focus: "Corrigir leaks de pré-flop short stack",
      tasks: [
        { id: "t1", text: "Estudar ranges de RFI por posição em 15bb" },
        { id: "t2", text: "Drill diário de 50 mãos no trainer (15-25bb)" },
        { id: "t3", text: "Revisar 3 sessões na semana usando filtro de short stack" },
      ],
      lessons: [],
    },
    {
      id: "fase2",
      title: "Fase 2 · Aplicação",
      rangeLabel: "Dias 30-60",
      focus: "Defesa de BB e jogo pós-flop em pots single-raised",
      tasks: [
        { id: "t4", text: "Aulas de defesa de BB por stack depth" },
        { id: "t5", text: "Drill de Vs C-Bet do BB no trainer" },
      ],
      lessons: [],
    },
    {
      id: "fase3",
      title: "Fase 3 · Integração",
      rangeLabel: "Dias 60-90",
      focus: "Spots avançados (3-bet pots, ICM, multiway)",
      tasks: [
        { id: "t6", text: "Aulas de pote tribetado e ICM básico" },
        { id: "t7", text: "Sessões longas (3+ horas) com review pelo SharkScope" },
      ],
      lessons: [],
    },
  ],
  progress: { checkedLessonUrls: [], checkedTaskIds: [] },
  attempts: 1,
};

async function main() {
  console.log("Gerando PDF de amostra...");
  const buffer = await generatePlanPdf(samplePlan);
  const out = "sample-plan.pdf";
  writeFileSync(out, buffer);
  console.log(`✓ Gerado: ${out} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error("Falhou:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Install tsx (script runner)**

```bash
npm install -D tsx
```

- [ ] **Step 3: Run the script and eyeball the output**

Run: `npx tsx scripts/generate-sample-pdf.ts`
Expected output:
```
Gerando PDF de amostra...
✓ Gerado: sample-plan.pdf (XXXXX bytes)
```

Abre `sample-plan.pdf` (Explorer / Finder / preview do VS Code). Confere:
- 3 páginas
- Capa com Tier 2, accuracy 72%, perfil do Fernando
- Página 2 com 3 leaks (Vs RFI HJ, RFI BTN, C-Bet BTN) + gráfico com barras vermelha/amarela/verde
- Página 3 com 3 fases + bloco "Como o EV te acompanha"

Se algo estiver feio, ajusta `lib/pdf/generatePlanPdf.ts` e roda de novo. Itera até ficar OK.

- [ ] **Step 4: Add sample-plan.pdf to gitignore + commit**

Edit `.gitignore` (criar se não existe):
```
sample-plan.pdf
```

Then:
```bash
git add scripts/generate-sample-pdf.ts package.json package-lock.json .gitignore
git commit -m "feat(pdf): add sample PDF generator script for visual review"
```

---

### Task 5: Storage helper

Upload do PDF pro Supabase Storage + helper pra montar URL pública.

**Files:**
- Create: `lib/pdf/storage.ts`

- [ ] **Step 1: Create the helper**

```ts
// lib/pdf/storage.ts — Upload do PDF + URL pública.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "plan-pdfs";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Faz upload do PDF pro bucket `plan-pdfs` no path `{diagnosticId}.pdf`.
 * Substitui (`upsert: true`) se já existe — útil pra regenerar.
 */
export async function uploadPlanPdf(
  diagnosticId: string,
  buffer: Buffer
): Promise<{ ok: boolean; error?: string }> {
  const path = `${diagnosticId}.pdf`;
  const supabase = service();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * URL pública do PDF (bucket é public, então URL é direta — sem signing).
 */
export function getPlanPdfPublicUrl(diagnosticId: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${diagnosticId}.pdf`;
}

/**
 * Verifica se o PDF existe no bucket (HEAD-like via list).
 */
export async function planPdfExists(diagnosticId: string): Promise<boolean> {
  const supabase = service();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list("", { search: `${diagnosticId}.pdf` });
  if (error || !data) return false;
  return data.some((f) => f.name === `${diagnosticId}.pdf`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/storage.ts
git commit -m "feat(pdf): add Supabase Storage helpers for plan PDFs"
```

---

### Task 6: Email layer (provider-agnostic stub)

Cria interface pronta pra plugar qualquer provider depois. Default: log no console e segue.

**Files:**
- Create: `lib/email.ts`

- [ ] **Step 1: Create the stub**

```ts
// lib/email.ts — Provider-agnostic transactional email layer.
//
// Default: no-op stub (loga e segue). Quando o provider for escolhido (Resend,
// SendGrid, SES, etc.), substitua a função `dispatch()` mantendo a mesma assinatura.

export interface PlanReportEmailArgs {
  to: string;
  playerName: string;
  pdfBuffer: Buffer;
  downloadUrl: string;
}

export interface EmailResult {
  ok: boolean;
  provider: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? "EV <ev@reglife.com.br>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "contato@reglife.com.br";

function htmlBody(playerName: string, downloadUrl: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A;">
      <p style="font-size: 16px; margin: 0 0 12px;">Oi, ${playerName}.</p>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
        Anexei o relatório do seu nivelamento aqui. São 3 páginas:
        capa com o seu Tier e accuracy, top 3 leaks que vamos atacar primeiro,
        e o roadmap dos 90 dias.
      </p>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
        Você também pode baixar a qualquer momento:
        <a href="${downloadUrl}" style="color: #D97706; font-weight: bold;">${downloadUrl}</a>
      </p>
      <p style="font-size: 13px; color: #475569; margin: 0;">
        — EV<br/>Seu Manager de Evolução · Reglife
      </p>
    </div>
  `.trim();
}

/**
 * Stub default — substituir quando provider for escolhido.
 * Mantém a assinatura idêntica pra o resto do app não mudar.
 */
async function dispatch(args: PlanReportEmailArgs): Promise<EmailResult> {
  // TODO: trocar por chamada real ao provider (Resend / SendGrid / SES) quando configurado.
  // Até lá, apenas loga pra deixar evidente nos logs que o envio teria ocorrido.
  console.log(
    `[email:stub] would send plan PDF to ${args.to} (player: ${args.playerName}, pdf: ${args.pdfBuffer.length} bytes, url: ${args.downloadUrl})`
  );
  return { ok: true, provider: "stub" };
}

export async function sendPlanReportEmail(
  args: PlanReportEmailArgs
): Promise<EmailResult> {
  if (!args.to || !args.to.includes("@")) {
    return { ok: false, provider: "stub", error: "invalid email" };
  }
  try {
    return await dispatch(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] dispatch failed", msg);
    return { ok: false, provider: "stub", error: msg };
  }
}

export const EMAIL_CONFIG = { FROM, REPLY_TO, htmlBody };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat(email): provider-agnostic transactional email stub"
```

---

### Task 7: Estender lib/notify.ts com 'email' channel e WhatsApp do PDF

**Files:**
- Modify: `lib/notify.ts`

- [ ] **Step 1: Adicionar 'email' ao type Channel**

Edit `lib/notify.ts`: encontre a linha com `export type Channel = "in_app" | "discord" | "whatsapp";` e troque por:

```ts
export type Channel = "in_app" | "discord" | "whatsapp" | "email";
```

- [ ] **Step 2: Adicionar função sendPlanReportWhatsapp**

Adicione no fim do arquivo (depois do `sendWhatsapp` existente, ou em local equivalente):

```ts
/**
 * Envia o PDF do plano pelo WhatsApp. Tenta como documento primeiro;
 * fallback é mensagem de texto com o link.
 *
 * Não passa pelo fluxo de quiet hours / canais — é entrega transacional
 * (one-shot, disparada quando o aluno acabou de pedir).
 */
export async function sendPlanReportWhatsapp(args: {
  phone: string;
  playerName: string;
  pdfUrl: string;
}): Promise<{ ok: boolean; mode: "document" | "text" | "skipped"; error?: string }> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token) {
    console.warn("[notify] WhatsApp não configurado, pulando envio de PDF.");
    return { ok: false, mode: "skipped", error: "not configured" };
  }
  const phone = args.phone.replace(/\D/g, "");
  if (!phone) {
    return { ok: false, mode: "skipped", error: "invalid phone" };
  }

  const caption = `Seu relatório Reglife 📎 — abre quando puder. — EV`;
  const fallbackText = `Oi ${args.playerName}, teu relatório Reglife tá pronto. Baixa aqui: ${args.pdfUrl}\n— EV`;

  // 1) tenta como documento
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone,
        document: args.pdfUrl,
        fileName: "plano-reglife.pdf",
        caption,
      }),
    });
    if (res.ok) return { ok: true, mode: "document" };
  } catch (err) {
    console.warn("[notify] WhatsApp document falhou, indo pro fallback texto", err);
  }

  // 2) fallback texto
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone, message: fallbackText }),
    });
    if (res.ok) return { ok: true, mode: "text" };
    return { ok: false, mode: "text", error: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: "text", error: msg };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/notify.ts
git commit -m "feat(notify): add email channel + WhatsApp PDF report sender"
```

---

### Task 8: Short URL route /r/[id]

Server component que faz 302 redirect pro PDF no Storage.

**Files:**
- Create: `app/r/[id]/page.tsx`

- [ ] **Step 1: Create the route**

```tsx
// app/r/[id]/page.tsx — URL curta que redireciona pro PDF do plano.
// /r/abc-123 → 302 → https://<supabase>/storage/v1/object/public/plan-pdfs/abc-123.pdf

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getPlanPdfPublicUrl, planPdfExists } from "@/lib/pdf/storage";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ShortUrlPage({ params }: Props) {
  const { id } = await params;

  // UUID format check leve — evita SQL desnecessário
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    notFound();
  }

  // Confirma que o diagnóstico existe (proteção contra links inválidos)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  // Se PDF não existe no Storage (raro), envia pro endpoint que regenera
  const exists = await planPdfExists(id);
  if (!exists) {
    redirect(`/api/plan/pdf?diagnosticId=${id}&redirect=1`);
  }

  redirect(getPlanPdfPublicUrl(id));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/r/[id]/page.tsx
git commit -m "feat(pdf): /r/[id] short URL with PDF redirect"
```

---

### Task 9: Manual PDF endpoint

GET `/api/plan/pdf?diagnosticId=...` retorna a URL (ou regenera se faltar).

**Files:**
- Create: `app/api/plan/pdf/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/plan/pdf/route.ts — GET retorna URL do PDF; regenera se faltar no Storage.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  planPdfExists,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import type { SavedPlan } from "@/lib/poker/planStorage";

export async function GET(req: NextRequest) {
  const diagnosticId = req.nextUrl.searchParams.get("diagnosticId");
  const wantsRedirect = req.nextUrl.searchParams.get("redirect") === "1";

  if (!diagnosticId) {
    return NextResponse.json(
      { error: "diagnosticId é obrigatório" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Já existe no Storage? retorna a URL direto
  if (await planPdfExists(diagnosticId)) {
    const url = getPlanPdfPublicUrl(diagnosticId);
    return wantsRedirect ? NextResponse.redirect(url) : NextResponse.json({ url });
  }

  // Não existe — busca o plano completo salvo em saved_plan (coluna nova adicionada na Task 11)
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("saved_plan")
    .eq("id", diagnosticId)
    .single();

  if (error || !data?.saved_plan) {
    return NextResponse.json(
      { error: "Plano não encontrado para regenerar PDF" },
      { status: 404 }
    );
  }

  const plan = data.saved_plan as SavedPlan;
  const buffer = await generatePlanPdf(plan);
  const upload = await uploadPlanPdf(diagnosticId, buffer);
  if (!upload.ok) {
    return NextResponse.json(
      { error: `Upload falhou: ${upload.error}` },
      { status: 500 }
    );
  }

  const url = getPlanPdfPublicUrl(diagnosticId);
  return wantsRedirect ? NextResponse.redirect(url) : NextResponse.json({ url });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. Vai dar erro se a coluna `saved_plan` ainda não existe no tipo gerado, mas isso é runtime — o `as SavedPlan` cobre. Se quiser ser explícito, ignore o aviso por enquanto.

- [ ] **Step 3: Commit**

```bash
git add app/api/plan/pdf/route.ts
git commit -m "feat(pdf): /api/plan/pdf endpoint with regenerate-on-miss"
```

---

### Task 10: Onboarding — checkboxes de canal

**Files:**
- Modify: `components/trainer/OnboardingForm.tsx`

- [ ] **Step 1: Adicionar estado local e UI**

Lê o arquivo todo primeiro pra entender a estrutura. Depois, adiciona depois do campo de telefone existente:

```tsx
// 1) Adicionar ao estado do form:
const [notifyEmail, setNotifyEmail] = useState(true); // já vem marcado
const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
const [whatsappPhone, setWhatsappPhone] = useState("");

// 2) Adicionar bloco UI depois do campo "phone":
<fieldset className="rounded-md border border-neutral-800 p-3">
  <legend className="px-2 text-xs font-semibold text-neutral-300">
    Como você quer receber seu relatório
  </legend>
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={notifyEmail}
      onChange={(e) => setNotifyEmail(e.target.checked)}
    />
    <span>Email (será enviado pro endereço acima)</span>
  </label>
  <label className="mt-2 flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={notifyWhatsapp}
      onChange={(e) => {
        setNotifyWhatsapp(e.target.checked);
        if (e.target.checked && !whatsappPhone) setWhatsappPhone(phone);
      }}
    />
    <span>WhatsApp</span>
  </label>
  {notifyWhatsapp && (
    <input
      type="tel"
      value={whatsappPhone}
      onChange={(e) => setWhatsappPhone(e.target.value)}
      placeholder="Confirme o número (com DDI)"
      className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      required={notifyWhatsapp}
    />
  )}
  <p className="mt-2 text-xs text-neutral-500">
    EV também usa esses canais pra te lembrar de check-ins. Você pode mudar depois em Configurações.
  </p>
</fieldset>
```

- [ ] **Step 2: Validar no submit + tornar email obrigatório**

No `handleSubmit` (ou equivalente), antes de POST:

```tsx
// Validação canais
if (!notifyEmail && !notifyWhatsapp) {
  alert("Escolhe pelo menos um canal pra receber o relatório.");
  return;
}
if (notifyEmail && !email.trim()) {
  alert("Email obrigatório pra receber o relatório.");
  return;
}
if (notifyWhatsapp && !whatsappPhone.trim()) {
  alert("Confirme o número de WhatsApp.");
  return;
}

const notifyChannels: string[] = [];
if (notifyEmail) notifyChannels.push("email");
if (notifyWhatsapp) notifyChannels.push("whatsapp");
```

- [ ] **Step 3: Enviar no body do POST**

Inclui no body do POST que vai pra `/api/results`:

```tsx
{
  // ... campos existentes
  notifyChannels,
  whatsappPhone: notifyWhatsapp ? whatsappPhone : null,
  savedPlan: plan, // ← novo: envia o SavedPlan completo pro server gerar PDF
}
```

(Onde `plan` é o `SavedPlan` construído pelo `planBuilder.ts` antes do submit.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add components/trainer/OnboardingForm.tsx
git commit -m "feat(onboarding): channel preference (email/WhatsApp) + savedPlan in body"
```

---

### Task 11: Orquestrar tudo em /api/results

Modifica o POST pra: salvar canais + savedPlan, gerar PDF, fazer upload, disparar entregas fire-and-forget.

**Files:**
- Modify: `app/api/results/route.ts`
- Modify: `supabase/migrations/008_plan_pdf_storage.sql` (adicionar coluna saved_plan)

- [ ] **Step 1: Adicionar coluna saved_plan na migration 008**

Edit `supabase/migrations/008_plan_pdf_storage.sql`, adiciona no topo (antes dos comandos de storage):

```sql
-- Coluna nova: SavedPlan completo serializado pra permitir regeneração do PDF
alter table public.reglife_diagnostic_results
  add column if not exists saved_plan jsonb;
```

> **Pra você (Fernando):** se já rodou a migration 008 antes, rode SÓ esse alter table novo no SQL Editor.

- [ ] **Step 2: Modify the POST handler**

Substituir todo o corpo do POST em `app/api/results/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import { sendPlanReportEmail, EMAIL_CONFIG } from "@/lib/email";
import { sendPlanReportWhatsapp } from "@/lib/notify";
import type { SavedPlan } from "@/lib/poker/planStorage";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[api/results] SUPABASE env vars not configured");
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  const ssUsername =
    typeof body.sharkscopeUsername === "string" && body.sharkscopeUsername.trim()
      ? body.sharkscopeUsername.trim()
      : null;
  const ssNetwork = ssUsername ? body.sharkscopeNetwork ?? "PokerStars" : null;
  const volumeTarget =
    typeof body.volumeTargetWeekly === "number" && body.volumeTargetWeekly > 0
      ? Math.round(body.volumeTargetWeekly)
      : null;

  const notifyChannels: string[] = Array.isArray(body.notifyChannels)
    ? body.notifyChannels.filter((c: unknown) => typeof c === "string")
    : ["email"];

  const whatsappPhone =
    typeof body.whatsappPhone === "string" && body.whatsappPhone.trim()
      ? body.whatsappPhone.trim()
      : null;

  const savedPlan = body.savedPlan as SavedPlan | undefined;

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .insert([
      {
        player_name: body.playerName ?? "Jogador",
        email: body.email ?? null,
        phone: body.phone ?? null,
        study_time: body.studyTime ?? null,
        profit_goal: body.profitGoal ?? null,
        stopped_early: body.stoppedEarly ?? false,
        spots_played: body.spotsPlayed ?? 0,
        spots_failed: body.spotsFailed ?? 0,
        spot_summaries: body.spotSummaries ?? [],
        results: body.results ?? [],
        sharkscope_username: ssUsername,
        sharkscope_network: ssNetwork,
        volume_target_weekly: volumeTarget,
        notify_channels: notifyChannels,
        whatsapp_phone: whatsappPhone,
        saved_plan: savedPlan ?? null,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("[api/results] insert error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const diagnosticId = data.id;

  // Gera PDF + upload (síncrono, parte do "retorno do POST")
  let pdfUrl: string | null = null;
  if (savedPlan) {
    try {
      const planWithId: SavedPlan = { ...savedPlan, diagnosticId };
      const buffer = await generatePlanPdf(planWithId);
      const upload = await uploadPlanPdf(diagnosticId, buffer);
      if (upload.ok) {
        pdfUrl = getPlanPdfPublicUrl(diagnosticId);

        // Fire-and-forget: emails + WhatsApp em background, não bloqueia o response
        const origin = req.nextUrl.origin;
        const shortUrl = `${origin}/r/${diagnosticId}`;

        if (notifyChannels.includes("email") && body.email) {
          void sendPlanReportEmail({
            to: body.email,
            playerName: body.playerName ?? "Jogador",
            pdfBuffer: buffer,
            downloadUrl: shortUrl,
          }).catch((err) =>
            console.error("[api/results] email dispatch failed", err)
          );
        }

        if (notifyChannels.includes("whatsapp") && whatsappPhone) {
          void sendPlanReportWhatsapp({
            phone: whatsappPhone,
            playerName: body.playerName ?? "Jogador",
            pdfUrl: shortUrl,
          }).catch((err) =>
            console.error("[api/results] whatsapp dispatch failed", err)
          );
        }
      } else {
        console.error("[api/results] PDF upload failed:", upload.error);
      }
    } catch (err) {
      console.error("[api/results] PDF generation failed:", err);
      // Não derruba o response — diagnóstico foi salvo, frontend segue
    }
  }

  return NextResponse.json({ id: diagnosticId, pdfUrl }, { status: 201 });
}

// GET /api/results — list all (admin) — mantém igual ao anterior
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.ADMIN_SECRET ?? "reglife2024";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Silence unused import warning if EMAIL_CONFIG isn't referenced (used implicitly)
void EMAIL_CONFIG;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/results/route.ts supabase/migrations/008_plan_pdf_storage.sql
git commit -m "feat(api): generate PDF + dispatch email/WhatsApp on diagnostic save"
```

---

### Task 12: Botão "Baixar relatório" em /meu-plano

**Files:**
- Modify: `components/trainer/PlanScreen.tsx`

- [ ] **Step 1: Adicionar botão no header da página**

Encontre o bloco do CTA do EV (linha ~128 no PlanScreen.tsx, "CTA do EV"). Adiciona logo abaixo ou ao lado:

```tsx
{plan.diagnosticId && (
  <a
    href={`/r/${plan.diagnosticId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-sm text-neutral-200 transition hover:border-amber-400/50 hover:text-amber-300"
  >
    📄 Baixar relatório (PDF)
  </a>
)}
```

Posicionamento exato depende do layout do JSX existente — sugiro colocar próximo ao CTA do EV no topo. Ajusta o classname se quiser combinar com o estilo do CTA existente.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/trainer/PlanScreen.tsx
git commit -m "feat(plan): add download PDF button on /meu-plano"
```

---

### Task 13: Smoke test end-to-end + push

Validação manual completa, depois sobe pra produção.

- [ ] **Step 1: Aplicar migration 008 no Supabase**

No SQL Editor do projeto novo (`kpuhxvbfuvnvxpirufqw`), cola e roda o conteúdo de `supabase/migrations/008_plan_pdf_storage.sql`. Confere:

```sql
select id, public from storage.buckets where id = 'plan-pdfs';
-- Esperado: 1 linha, public=true

select column_name from information_schema.columns
where table_name = 'reglife_diagnostic_results' and column_name = 'saved_plan';
-- Esperado: 1 linha (column saved_plan existe)
```

- [ ] **Step 2: Rodar dev server**

```bash
npm run dev
```

Abre `http://localhost:3000`.

- [ ] **Step 3: Fluxo do aluno**

1. Faz o nivelamento completo (ou abre o trainer e completa um diagnóstico rápido).
2. Preenche o onboarding com:
   - Nome qualquer
   - **Email válido seu** (vai cair no log do dev server porque o provider é stub)
   - Telefone qualquer
   - Marca **WhatsApp** e confirma o número
3. Submete.

- [ ] **Step 4: Validar no terminal e no Supabase**

No terminal do `npm run dev`, deve aparecer:
- `[email:stub] would send plan PDF to <seu_email>` (confirmando que email foi disparado)
- Se WhatsApp foi marcado e Z-API funcionar: log de sucesso. Se Z-API não está configurado: aviso "WhatsApp não configurado".

No Supabase Dashboard → Table editor → `reglife_diagnostic_results` → última linha:
- `notify_channels` = `['email', 'whatsapp']`
- `saved_plan` = JSON do plano (não null)
- `whatsapp_phone` preenchido

No Supabase Dashboard → Storage → bucket `plan-pdfs`:
- Tem arquivo `<id-da-linha>.pdf` listado.

- [ ] **Step 5: Validar botão de download e short URL**

1. Na página `/meu-plano`, clica no botão "Baixar relatório (PDF)".
2. Deve abrir nova aba com o PDF carregado.
3. URL deve ser `localhost:3000/r/<id>` que faz 302 pra Storage.

Abre o PDF e confere:
- 3 páginas
- Capa com nome, tier, accuracy reais (do diagnóstico que você acabou de fazer)
- Página 2 com top 3 leaks reais + gráfico de accuracy
- Página 3 com fases do plano que o `planBuilder` gerou

- [ ] **Step 6: Push pra produção**

```bash
git push origin main
```

Easypanel deploya automático. Quando subir, repete o fluxo na URL de produção (`https://ia-reglife.eldzmi.easypanel.host`) com a **migration 008 já aplicada no Supabase de prod** (mesmo projeto kpuhxvbfuvnvxpirufqw).

---

## Pendências pós-deploy (não bloqueiam essa feature)

- **Escolher provider de email** e substituir o `dispatch()` em `lib/email.ts` (Resend recomendado).
- **Configurar `EMAIL_FROM` e `EMAIL_REPLY_TO`** no Easypanel quando o domínio `reglife.com.br` estiver configurado.
- **Testar Z-API/Evolution `/send-document` real** — se não suportar, o fallback texto+link já cobre.
- **Adicionar `phaseHighlights` mais inteligente** se os bullets atuais ficarem rasos (atualmente pega `focus` + primeiras 2 tasks).
