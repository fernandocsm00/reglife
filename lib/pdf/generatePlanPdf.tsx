// lib/pdf/generatePlanPdf.tsx — Gera o PDF de 3 páginas com @react-pdf/renderer.

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
