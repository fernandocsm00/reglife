// lib/leadSource.ts — Origem do lead: por qual porta de entrada ele chegou
// ("fazer o teste" ou "receber o plano individual") e de qual anúncio.
//
// A landing (/ e /plano) guarda isso no sessionStorage assim que abre; o
// DiagnosticoScreen manda no POST /api/leads, que revalida tudo no servidor
// antes de gravar em lead_entry / lead_utm (migration 017).
//
// Funções puras + dois helpers de sessionStorage (no-op no servidor).

export const LEAD_ENTRIES = ["teste", "plano", "direto"] as const;
export type LeadEntry = (typeof LEAD_ENTRIES)[number];

/** Quem cai no /diagnostico sem passar pela landing. */
export const DEFAULT_ENTRY: LeadEntry = "direto";

export const LEAD_ENTRY_LABELS: Record<LeadEntry, string> = {
  teste: "Fazer o teste",
  plano: "Plano individual",
  direto: "Direto",
};

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type LeadUtm = Partial<Record<UtmKey, string>>;

export interface LeadSource {
  entry: LeadEntry;
  utm: LeadUtm | null;
}

/** Teto por valor de UTM — protege coluna, webhook e CSV de payload gigante. */
const MAX_UTM_LENGTH = 200;

const STORAGE_KEY = "reglife:leadSource";

export function isLeadEntry(v: unknown): v is LeadEntry {
  return typeof v === "string" && (LEAD_ENTRIES as readonly string[]).includes(v);
}

/** Valor conhecido ou `direto`. */
export function parseLeadEntry(v: unknown): LeadEntry {
  return isLeadEntry(v) ? v : DEFAULT_ENTRY;
}

function cleanUtmValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_UTM_LENGTH);
}

/** Extrai só as UTMs conhecidas de uma query string. Sem nenhuma → null. */
export function parseUtm(search: string): LeadUtm | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: LeadUtm = {};
  for (const key of UTM_KEYS) {
    const value = cleanUtmValue(params.get(key));
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Valida o que o cliente mandou no body (ou o que veio do sessionStorage).
 * Sempre devolve um LeadSource — origem desconhecida vira `direto`.
 */
export function parseLeadSource(raw: unknown): LeadSource {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { entry: DEFAULT_ENTRY, utm: null };
  }
  const r = raw as Record<string, unknown>;
  const entry = parseLeadEntry(r.entry);

  const rawUtm = r.utm;
  if (!rawUtm || typeof rawUtm !== "object" || Array.isArray(rawUtm)) {
    return { entry, utm: null };
  }
  const src = rawUtm as Record<string, unknown>;
  const utm: LeadUtm = {};
  for (const key of UTM_KEYS) {
    const value = cleanUtmValue(src[key]);
    if (value) utm[key] = value;
  }
  return { entry, utm: Object.keys(utm).length > 0 ? utm : null };
}

/** Linha curta pro admin/CSV: "meta · plano-set". */
export function utmSummary(utm: LeadUtm | null | undefined): string {
  if (!utm) return "";
  return [utm.utm_source, utm.utm_campaign].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// sessionStorage (client)
// ---------------------------------------------------------------------------

/**
 * Guarda a origem na primeira página que o lead abre. Só grava uma vez por
 * aba: se ele passar pela /plano e depois pela /, vale a porta pela qual
 * entrou. sessionStorage pode lançar (aba anônima, cookies bloqueados) —
 * falha em silêncio, o lead vira `direto`.
 */
export function rememberLeadSource(entry: LeadEntry, search: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;
    const source: LeadSource = { entry, utm: parseUtm(search) };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch {
    // sem storage disponível — segue sem origem
  }
}

/** Lê a origem guardada. Sem nada gravado → `direto`. */
export function readLeadSource(): LeadSource {
  if (typeof window === "undefined") return { entry: DEFAULT_ENTRY, utm: null };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { entry: DEFAULT_ENTRY, utm: null };
    return parseLeadSource(JSON.parse(raw));
  } catch {
    return { entry: DEFAULT_ENTRY, utm: null };
  }
}
