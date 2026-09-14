// Regrava public/spots/*.json com as mãos do Nivelamento Light.
// Roda com: npx tsx scripts/sync-nivelamento-light.ts
//
// Pra cada mão do doc, clona o spotConfig de uma entrada existente do mesmo
// cenário (posição + stack + vilões + street) — assim action history, botões
// por stack, pot e stacks continuam os que já foram validados no trainer — e
// aplica board/combos/respostas/overrides do doc.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NIVELAMENTO_LIGHT, type DocHand } from "./nivelamento-light.data";
import type { ExpectedAnswer, SpotConfigFile } from "../lib/poker/types";

const SPOTS_DIR = join(process.cwd(), "public", "spots");

function villainsOf(e: ExpectedAnswer): string[] {
  return e.villainPositions ?? (e.villainPosition ? [e.villainPosition] : []);
}
function docVillains(hand: DocHand): string[] {
  return hand.vs === undefined ? [] : Array.isArray(hand.vs) ? hand.vs : [hand.vs];
}
const boardLen = (b: string | undefined) => (b ? b.split("-").length : 0);

function scenarioMatches(e: ExpectedAnswer, hand: DocHand): boolean {
  return (
    e.position === hand.pos &&
    e.stackSize === hand.stack &&
    villainsOf(e).join("+") === docVillains(hand).join("+") &&
    boardLen(e.board) === boardLen(hand.board)
  );
}

function buildEntry(slug: string, hand: DocHand, existing: ExpectedAnswer[]): ExpectedAnswer {
  const candidates = existing.filter((e) => scenarioMatches(e, hand));
  const template =
    candidates.find((e) => (e.board ?? "") === (hand.board ?? "")) ?? candidates[0];
  if (!template) {
    throw new Error(
      `[${slug}] sem template pra ${hand.pos} ${hand.stack}bb vs ${docVillains(hand).join("+") || "-"} board=${hand.board ?? "-"}`
    );
  }

  const entry: ExpectedAnswer = structuredClone(template);
  delete entry.id;
  entry.position = hand.pos;
  entry.stackSize = hand.stack;

  const villains = docVillains(hand);
  delete entry.villainPosition;
  delete entry.villainPositions;
  if (villains.length === 1) entry.villainPosition = villains[0];
  if (villains.length > 1) entry.villainPositions = villains;

  if (hand.board) entry.board = hand.board;
  else delete entry.board;

  if (hand.pot !== undefined) {
    entry.spotConfig = { ...entry.spotConfig, potSize: hand.pot, currentPotSize: hand.pot };
  }
  if (hand.heroStack !== undefined) {
    entry.spotConfig = {
      ...entry.spotConfig,
      heroStackSize: hand.heroStack,
      villainStackSize: hand.heroStack,
    };
  }

  entry.expectedAnswers = [{ combos: hand.combos, answer: hand.answers }];
  return entry;
}

const MAX_WIDTH = 100;

/** Representação de linha única mais compacta possível (sem checar largura). */
function compactInline(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(compactInline).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const body = entries.map(([k, v]) => `${JSON.stringify(k)}: ${compactInline(v)}`).join(", ");
    return `{ ${body} }`;
  }
  return JSON.stringify(value);
}

/**
 * Formata como o time formata à mão: inline quando cabe em MAX_WIDTH colunas
 * (contando a indentação atual), senão multi-linha com 2 espaços por nível,
 * recursando por elemento/propriedade.
 */
function formatJson(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  const childIndent = indent + 2;
  const childPad = " ".repeat(childIndent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inline = compactInline(value);
    if (indent + inline.length <= MAX_WIDTH) return inline;
    const items = value.map((v) => `${childPad}${formatJson(v, childIndent)}`);
    return `[\n${items.join(",\n")}\n${pad}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const inline = compactInline(value);
    if (indent + inline.length <= MAX_WIDTH) return inline;
    const items = entries.map(
      ([k, v]) => `${childPad}${JSON.stringify(k)}: ${formatJson(v, childIndent)}`
    );
    return `{\n${items.join(",\n")}\n${pad}}`;
  }

  return JSON.stringify(value);
}

for (const mod of NIVELAMENTO_LIGHT) {
  const path = join(SPOTS_DIR, `${mod.slug}.json`);
  const config = JSON.parse(readFileSync(path, "utf-8")) as SpotConfigFile;
  const existing = config.expectedAnswers;

  config.expectedAnswers = mod.hands.map((hand) => buildEntry(mod.slug, hand, existing));
  config.mode = "ordered";
  config.sessionSize = config.expectedAnswers.length;
  config.tier = mod.tier;

  // Working copy usa CRLF (core.autocrlf=true), formatação compacta (o time
  // edita esses JSONs à mão — evita explodir cada entry em várias linhas).
  const out = formatJson(config).replace(/\n/g, "\r\n") + "\r\n";
  writeFileSync(path, out, "utf-8");
  console.log(`${mod.slug}: ${existing.length} → ${config.expectedAnswers.length} mãos`);
}
