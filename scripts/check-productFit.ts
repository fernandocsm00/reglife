// Verificação pura — roda com: npx tsx scripts/check-productFit.ts
import {
  QUIZ_QUESTIONS,
  answerRank,
  computeStakeGrade,
  labelOf,
  objetivoToProfitGoal,
  parseQuizAnswers,
  studyTimeFromTorneios,
  weeklyVolumeTarget,
  type QuizAnswers,
} from "../lib/poker/leadScoring";
import {
  PRODUCT_ORDER,
  PRODUCT_REQUIREMENTS,
  accuracyPct,
  describeProduct,
  finalProduct,
  isTestBucket,
  profileFromRaw,
  profileProduct,
  testBucket,
} from "../lib/poker/productFit";
import { GRADE_LINKS } from "../lib/poker/spotLinks";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// Quiz mínimo: tudo na primeira opção, objetivo "competir" (fecha Bases).
const BASE: QuizAnswers = {
  idade: "25_34",
  tempoJogo: "aprendendo",
  objetivo: "competir",
  abi: "nao_sei",
  torneiosMes: "nao_sei",
  banca: "lt_875",
};
const q = (o: Partial<QuizAnswers>): QuizAnswers => ({ ...BASE, ...o });

const COMUNIDADE_MIN = q({
  tempoJogo: "gt_5", objetivo: "profissional", abi: "lt_5", torneiosMes: "100_200", banca: "875_2000",
});
const TIME_MIN = q({
  tempoJogo: "gt_5", objetivo: "ja_vive", abi: "23_54", torneiosMes: "gt_300", banca: "875_2000",
});

// ---- Questionário ----------------------------------------------------------
check("QUIZ_QUESTIONS order", QUIZ_QUESTIONS.map((x) => x.key), [
  "idade", "tempoJogo", "objetivo", "abi", "torneiosMes", "banca",
]);
check("objetivo labels", QUIZ_QUESTIONS[2].options.map((o) => o.label), [
  "Diversão, não me preocupo com resultado",
  "Competir, mas não pretendo viver do jogo",
  "Renda extra, poder contar com os ganhos no jogo",
  "Ser profissional, ter o jogo como renda principal",
  "Já vivo do poker e quero crescer na carreira",
]);
check("answerRank abi gt_54", answerRank("abi", "gt_54"), 5);
check("answerRank invalid", answerRank("abi", "xx"), -1);
check("answerRank null", answerRank("banca", null), -1);
check("labelOf banca", labelOf("banca", "875_2000"), "$875 a $2.000");
check("labelOf invalid", labelOf("banca", "875_1499"), null);

check("parse valid", parseQuizAnswers({ ...BASE }), BASE);
check("parse missing key", parseQuizAnswers({ ...BASE, banca: undefined }), null);
check("parse invalid value", parseQuizAnswers({ ...BASE, objetivo: "competitivo" }), null);
check("parse non-object", parseQuizAnswers("x"), null);
check("parse null", parseQuizAnswers(null), null);
check("parse strips extra keys", parseQuizAnswers({ ...BASE, foo: "bar" }), BASE);

// ---- Derivações ------------------------------------------------------------
check("stakeGrade lt_875", computeStakeGrade(q({ banca: "lt_875" })), 1);
check("stakeGrade 875_2000", computeStakeGrade(q({ banca: "875_2000" })), 2.5);
check("stakeGrade 2001_5000", computeStakeGrade(q({ banca: "2001_5000" })), 4);
check("stakeGrade 5001_10000", computeStakeGrade(q({ banca: "5001_10000" })), 10);
check("stakeGrade gt_10000", computeStakeGrade(q({ banca: "gt_10000" })), 19);
for (const b of QUIZ_QUESTIONS[5].options) {
  const g = computeStakeGrade(q({ banca: b.value as QuizAnswers["banca"] }));
  check(`GRADE_LINKS has ${g}`, GRADE_LINKS[g] !== undefined, true);
}

check("profitGoal diversao", objetivoToProfitGoal("diversao"), "usd1k");
check("profitGoal competir", objetivoToProfitGoal("competir"), "usd1k");
check("profitGoal renda_extra", objetivoToProfitGoal("renda_extra"), "usd10k");
check("profitGoal profissional", objetivoToProfitGoal("profissional"), "usd100k");
check("profitGoal ja_vive", objetivoToProfitGoal("ja_vive"), "usd50k");

check("volume nao_sei", weeklyVolumeTarget("nao_sei"), 25);
check("volume lt_100", weeklyVolumeTarget("lt_100"), 20);
check("volume 100_200", weeklyVolumeTarget("100_200"), 38);
check("volume 200_300", weeklyVolumeTarget("200_300"), 63);
check("volume gt_300", weeklyVolumeTarget("gt_300"), 88);

check("studyTime nao_sei", studyTimeFromTorneios("nao_sei"), "ate15");
check("studyTime lt_100", studyTimeFromTorneios("lt_100"), "ate15");
check("studyTime 100_200", studyTimeFromTorneios("100_200"), "ate40");
check("studyTime 200_300", studyTimeFromTorneios("200_300"), "ate40");
check("studyTime gt_300", studyTimeFromTorneios("gt_300"), "mais40");

// ---- Requisitos monotônicos (acumulativos) ---------------------------------
for (let i = 1; i < PRODUCT_ORDER.length; i++) {
  const prev = PRODUCT_REQUIREMENTS[PRODUCT_ORDER[i - 1]];
  const cur = PRODUCT_REQUIREMENTS[PRODUCT_ORDER[i]];
  for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
    check(`monotonic ${PRODUCT_ORDER[i]}.${k}`, cur[k] >= prev[k], true);
  }
}

// ---- Perfil ----------------------------------------------------------------
check("bases mínimo", profileProduct(BASE), "bases");
check("diversao com tudo no máximo → null",
  profileProduct(q({ ...TIME_MIN, objetivo: "diversao", abi: "gt_54", banca: "gt_10000" })), null);
check("idade não pontua", profileProduct(q({ idade: "55_mais" })), "bases");

check("protocolo mínimo", profileProduct(q({ tempoJogo: "1_3", objetivo: "renda_extra" })), "protocolo");
check("protocolo falha tempo lt_1", profileProduct(q({ tempoJogo: "lt_1", objetivo: "renda_extra" })), "bases");
check("protocolo falha objetivo competir", profileProduct(q({ tempoJogo: "gt_5", objetivo: "competir" })), "bases");

check("comunidade mínimo", profileProduct(COMUNIDADE_MIN), "comunidade");
check("comunidade falha tempo 3_5", profileProduct({ ...COMUNIDADE_MIN, tempoJogo: "3_5" }), "protocolo");
check("comunidade falha abi nao_sei", profileProduct({ ...COMUNIDADE_MIN, abi: "nao_sei" }), "protocolo");
check("comunidade falha torneios lt_100", profileProduct({ ...COMUNIDADE_MIN, torneiosMes: "lt_100" }), "protocolo");
check("comunidade falha banca lt_875", profileProduct({ ...COMUNIDADE_MIN, banca: "lt_875" }), "protocolo");

check("time mínimo", profileProduct(TIME_MIN), "time");
check("time falha abi 13_23", profileProduct({ ...TIME_MIN, abi: "13_23" }), "comunidade");
check("time falha torneios 200_300", profileProduct({ ...TIME_MIN, torneiosMes: "200_300" }), "comunidade");
check("time falha objetivo profissional", profileProduct({ ...TIME_MIN, objetivo: "profissional" }), "comunidade");
check("time herda banca de comunidade", profileProduct({ ...TIME_MIN, banca: "lt_875" }), "protocolo");
check("ja_vive com tempo lt_1 → bases", profileProduct({ ...TIME_MIN, tempoJogo: "lt_1" }), "bases");

check("profileFromRaw valid", profileFromRaw({ ...TIME_MIN }), "time");
check("profileFromRaw quiz v1", profileFromRaw({ idade: "25_34", tempo: "mais_5", objetivo: "competitivo", abi: "lt_5", volume: "gt_300", banca: "876_2000" }), null);

// ---- Teste e final ---------------------------------------------------------
check("bucket 100", testBucket(100), "time");
check("bucket 70", testBucket(70), "time");
check("bucket 69", testBucket(69), "comunidade");
check("bucket 50", testBucket(50), "comunidade");
check("bucket 49", testBucket(49), "comunidade_ou_protocolo");
check("bucket 0", testBucket(0), "comunidade_ou_protocolo");
check("isTestBucket rejects prototype chain prop", isTestBucket("toString"), false);

check("final null profile", finalProduct(null, "time"), null);
check("final time/time", finalProduct("time", "time"), "time");
check("final time/comunidade", finalProduct("time", "comunidade"), "comunidade");
check("final time/cop", finalProduct("time", "comunidade_ou_protocolo"), "comunidade");
check("final comunidade/cop", finalProduct("comunidade", "comunidade_ou_protocolo"), "comunidade");
check("final protocolo/time", finalProduct("protocolo", "time"), "protocolo");
check("final protocolo/cop", finalProduct("protocolo", "comunidade_ou_protocolo"), "protocolo");
check("final bases/time", finalProduct("bases", "time"), "bases");

check("accuracy empty", accuracyPct([]), 0);
check("accuracy 2/3", accuracyPct([{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }]), 67);
check("accuracy 7/10", accuracyPct(Array.from({ length: 10 }, (_, i) => ({ isCorrect: i < 7 }))), 70);

// ---- describeProduct (admin) -----------------------------------------------
const row = (o: Partial<Parameters<typeof describeProduct>[0]>) => ({
  product_profile: null, product_test: null, product_final: null, quiz_answers: null, ...o,
});
check("describe final", describeProduct(row({ product_profile: "time", product_final: "comunidade" })), "Comunidade");
check("describe pendente", describeProduct(row({ product_profile: "protocolo" })), "Perfil: Protocolo · teste pendente");
check("describe fora do perfil", describeProduct(row({ quiz_answers: q({ objetivo: "diversao" }) })), "Fora do perfil");
check("describe lead antigo", describeProduct(row({ quiz_answers: { objetivo: "competitivo" } })), "—");
check("describe valor inválido", describeProduct(row({ product_final: "xx" })), "—");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All productFit checks passed");
