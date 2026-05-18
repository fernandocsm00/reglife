// lib/pdf/generatePlanPdf.tsx — Gera o PDF do Desafio Profissão Poker (30 dias).
//
// Estrutura enxuta de 1 página: título, nome do aluno, 6 itens linkados
// (carreira, 3 spots derivados dos top leaks, grade, grupo WhatsApp).

import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildChallenge30d } from "@/lib/poker/challenge30d";

const COLORS = {
  bg: "#FFFFFF",
  fg: "#0F172A",
  muted: "#475569",
  amber: "#D97706",
  amberSoft: "#FEF3C7",
  border: "#E2E8F0",
  linkBg: "#FAFAF9",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    color: COLORS.fg,
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  kicker: {
    fontSize: 10,
    color: COLORS.amber,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.fg,
  },
  date: {
    marginTop: 6,
    fontSize: 10,
    color: COLORS.muted,
  },
  rule: {
    marginTop: 18,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: COLORS.linkBg,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.amber,
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.fg,
  },
  itemSub: {
    marginTop: 3,
    fontSize: 9,
    color: COLORS.muted,
  },
  itemArrow: {
    fontSize: 14,
    color: COLORS.amber,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "center",
  },
});

function ChallengePage({ plan }: { plan: SavedPlan }) {
  const items = buildChallenge30d(plan);
  const issued = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.kicker}>Desafio Profissão Poker</Text>
      <Text style={styles.title}>Plano de 30 dias — {plan.playerName}</Text>
      <Text style={styles.date}>Emitido em {issued}</Text>

      <View style={styles.rule} />

      <View>
        {items.map((item, i) => (
          <Link key={i} src={item.url} style={{ textDecoration: "none" }}>
            <View style={styles.item}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.sublabel && (
                  <Text style={styles.itemSub}>{item.sublabel}</Text>
                )}
              </View>
              <Text style={styles.itemArrow}>→</Text>
            </View>
          </Link>
        ))}
      </View>

      <Text style={styles.footer}>
        Reg Life · Desafio Profissão Poker · {plan.playerName}
      </Text>
    </Page>
  );
}

export async function generatePlanPdf(plan: SavedPlan): Promise<Buffer> {
  const doc = (
    <Document
      title={`Desafio Profissão Poker · ${plan.playerName}`}
      author="Reg Life"
      subject="Plano de 30 Dias"
    >
      <ChallengePage plan={plan} />
    </Document>
  );

  return renderToBuffer(doc);
}
