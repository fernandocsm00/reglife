// Verificação pura — roda com: npx tsx scripts/check-leadSource.ts
import {
  DEFAULT_ENTRY,
  LEAD_ENTRIES,
  LEAD_ENTRY_LABELS,
  UTM_KEYS,
  isLeadEntry,
  parseLeadEntry,
  parseLeadSource,
  parseUtm,
  utmSummary,
} from "../lib/leadSource";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// ---- Constantes ------------------------------------------------------------
check("LEAD_ENTRIES", LEAD_ENTRIES, ["teste", "plano", "direto"]);
check("DEFAULT_ENTRY", DEFAULT_ENTRY, "direto");
check("UTM_KEYS", UTM_KEYS, [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);
check("labels", LEAD_ENTRY_LABELS, {
  teste: "Fazer o teste",
  plano: "Plano individual",
  direto: "Direto",
});

// ---- isLeadEntry / parseLeadEntry -----------------------------------------
check("isLeadEntry teste", isLeadEntry("teste"), true);
check("isLeadEntry plano", isLeadEntry("plano"), true);
check("isLeadEntry direto", isLeadEntry("direto"), true);
check("isLeadEntry inválido", isLeadEntry("outra"), false);
check("isLeadEntry não-string", isLeadEntry(3), false);
check("isLeadEntry null", isLeadEntry(null), false);

check("parseLeadEntry válida", parseLeadEntry("plano"), "plano");
check("parseLeadEntry inválida vira direto", parseLeadEntry("x"), DEFAULT_ENTRY);
check("parseLeadEntry undefined vira direto", parseLeadEntry(undefined), DEFAULT_ENTRY);

// ---- parseUtm --------------------------------------------------------------
check("parseUtm sem parâmetros", parseUtm(""), null);
check("parseUtm só com parâmetros alheios", parseUtm("?fbclid=abc&x=1"), null);
check(
  "parseUtm completo",
  parseUtm("?utm_source=meta&utm_medium=cpc&utm_campaign=plano-set&utm_content=v2&utm_term=poker"),
  {
    utm_source: "meta",
    utm_medium: "cpc",
    utm_campaign: "plano-set",
    utm_content: "v2",
    utm_term: "poker",
  }
);
check("parseUtm parcial", parseUtm("?utm_source=meta&utm_campaign=teste-set"), {
  utm_source: "meta",
  utm_campaign: "teste-set",
});
check("parseUtm ignora valor vazio", parseUtm("?utm_source=&utm_medium=cpc"), {
  utm_medium: "cpc",
});
check("parseUtm apara espaços", parseUtm("?utm_source=%20meta%20"), { utm_source: "meta" });
// Valor gigante é cortado em 200 caracteres (protege a coluna e o webhook).
const longUtm = parseUtm(`?utm_campaign=${"a".repeat(500)}`);
check("parseUtm corta em 200", longUtm?.utm_campaign?.length, 200);
// URLSearchParams aceita com ou sem "?", e query string repetida usa o 1º valor.
check("parseUtm sem interrogação", parseUtm("utm_source=google"), { utm_source: "google" });
check("parseUtm valor repetido usa o primeiro", parseUtm("?utm_source=a&utm_source=b"), {
  utm_source: "a",
});

// ---- parseLeadSource (o que o /api/leads usa) ------------------------------
check("parseLeadSource completo", parseLeadSource({ entry: "plano", utm: { utm_source: "meta" } }), {
  entry: "plano",
  utm: { utm_source: "meta" },
});
check("parseLeadSource sem nada", parseLeadSource(undefined), { entry: "direto", utm: null });
check("parseLeadSource entry inválida", parseLeadSource({ entry: "hack" }), {
  entry: "direto",
  utm: null,
});
check("parseLeadSource utm não-objeto", parseLeadSource({ entry: "teste", utm: "x" }), {
  entry: "teste",
  utm: null,
});
check("parseLeadSource utm array", parseLeadSource({ entry: "teste", utm: ["a"] }), {
  entry: "teste",
  utm: null,
});
// Chave fora da lista é descartada; valor não-string também.
check(
  "parseLeadSource filtra chaves e valores",
  parseLeadSource({ entry: "teste", utm: { utm_source: "meta", gclid: "x", utm_medium: 3 } }),
  { entry: "teste", utm: { utm_source: "meta" } }
);
check(
  "parseLeadSource corta valor longo",
  parseLeadSource({ entry: "teste", utm: { utm_source: "b".repeat(300) } })?.utm?.utm_source?.length,
  200
);
check("parseLeadSource utm vazio vira null", parseLeadSource({ entry: "teste", utm: {} }), {
  entry: "teste",
  utm: null,
});

// ---- utmSummary (admin e CSV) ---------------------------------------------
check("utmSummary null", utmSummary(null), "");
check("utmSummary vazio", utmSummary({}), "");
check("utmSummary source+campaign", utmSummary({ utm_source: "meta", utm_campaign: "plano-set" }), "meta · plano-set");
check("utmSummary só source", utmSummary({ utm_source: "meta" }), "meta");
check("utmSummary só campaign", utmSummary({ utm_campaign: "plano-set" }), "plano-set");
check("utmSummary ignora medium", utmSummary({ utm_medium: "cpc" }), "");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All leadSource checks passed");
