import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com ANON KEY.
 * Lazy + Proxy: createClient explode com URL/key undefined, e durante
 * `next build` o módulo é importado pra coletar metadata. Resolvemos
 * embrulhando num Proxy que só instancia no primeiro uso real.
 */
let _client: SupabaseClient | null = null;
function realClient(): SupabaseClient {
  if (!_client) {
    const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
    const key = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: keyof SupabaseClient) {
    const c = realClient();
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
});

/**
 * Cliente Supabase com SERVICE ROLE KEY — bypassa RLS.
 * Use SOMENTE em rotas server-side (API routes, cron, etc). Nunca expõe
 * pro browser. Mesmo padrão Proxy/lazy do anon client.
 */
let _admin: SupabaseClient | null = null;
function realAdmin(): SupabaseClient {
  if (!_admin) {
    const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop: keyof SupabaseClient) {
    const c = realAdmin();
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
});

// ---- Types ----------------------------------------------------------------

export interface SharkscopeSummary {
  entries: number | null;
  profit: number | null;
  avgRoi: number | null;
  itm: number | null;
  pkoRatio: number | null;
  winrate: string | null;
}

export interface DiagnosticRow {
  id: string;
  created_at: string;
  player_name: string;
  email: string | null;
  phone: string | null;
  study_time: string | null;
  profit_goal: string | null;
  stopped_early: boolean;
  spots_played: number;
  spots_failed: number;
  spot_summaries: SpotSummaryRow[];
  results: ResultRow[];
  sharkscope_username: string | null;
  sharkscope_network: string | null;
  sharkscope_playergroup_id: string | null;
  sharkscope_last_sync: string | null;
  sharkscope_summary: SharkscopeSummary | null;
  volume_target_weekly: number | null;
  // Lead scoring legado (grava null) + quiz (admin-only)
  lead_score: number | null;
  lead_category: string | null; // 'frio' | 'morno' | 'quente' | 'super_quente'
  quiz_answers: Record<string, string> | null;
  stake_grade: number | null;
  /** Produto pelo questionário (lib/poker/productFit.ts). null = fora do perfil/legacy. */
  product_profile: string | null;
  /** Bucket do nivelamento: time | comunidade | comunidade_ou_protocolo. */
  product_test: string | null;
  /** min(perfil, teste). */
  product_final: string | null;
  /** Porta de entrada: teste | plano | direto (lib/leadSource.ts). null = lead legacy. */
  lead_entry: string | null;
  /** UTMs da URL de entrada. null = sem UTM. */
  lead_utm: Record<string, string> | null;
  /** Aponta pra linha da tentativa anterior do mesmo lead (null = 1ª vez). */
  previous_diagnostic_id: string | null;
}

export interface SpotSummaryRow {
  label: string;
  action: string;
  tier: number;
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
}

export interface ResultRow {
  spotLabel: string;
  action: string;
  tier: number;
  position: string;
  stackSize: number;
  board: string;
  hand: string;
  picked: string;
  expected: string[];
  isCorrect: boolean;
}
