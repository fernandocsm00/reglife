import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const key = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export const supabase = createClient(url, key);

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
