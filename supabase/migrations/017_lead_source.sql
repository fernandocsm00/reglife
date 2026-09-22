-- ============================================================
-- RegLife — Migration 017: Origem do lead (porta de entrada + UTMs)
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- Duas portas de entrada levam ao mesmo teste:
--   /       → "fazer o teste"            → lead_entry = 'teste'
--   /plano  → "receber o plano individual" → lead_entry = 'plano'
--   quem abre /diagnostico direto         → lead_entry = 'direto'
--
--   lead_entry → porta de entrada (teste | plano | direto)
--   lead_utm   → UTMs da URL de entrada (JSONB). Ex.:
--                {"utm_source":"meta","utm_campaign":"plano-set"}
--                null = veio sem UTM.
--
-- Serve pro comercial saber o que foi prometido no anúncio antes de ligar.
-- Sem CHECK constraint: valores validados no código (lib/leadSource.ts).
-- Sem esta migration aplicada, /api/leads dá 500 ("column does not exist").

alter table public.reglife_diagnostic_results
  add column if not exists lead_entry text,
  add column if not exists lead_utm jsonb;

comment on column public.reglife_diagnostic_results.lead_entry is
  'Porta de entrada do lead: teste | plano | direto. null = lead anterior a esta migration.';

comment on column public.reglife_diagnostic_results.lead_utm is
  'UTMs da URL de entrada (JSONB): utm_source, utm_medium, utm_campaign, utm_content, utm_term. null = sem UTM.';

-- Recarrega o schema cache do PostgREST pra API enxergar as colunas novas na hora.
notify pgrst, 'reload schema';
