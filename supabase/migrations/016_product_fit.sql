-- ============================================================
-- RegLife — Migration 016: Product fit (Nivelamento Light)
-- Aplicar manualmente no Supabase SQL Editor.
-- ============================================================
--
-- Produto indicado pro lead (admin-only):
--   product_profile → pelo questionário: bases | protocolo | comunidade | time
--                     (null = fora do perfil ou lead legacy)
--   product_test    → pelo % do nivelamento: time | comunidade | comunidade_ou_protocolo
--                     (null = teste não concluído)
--   product_final   → min(perfil, teste): bases | protocolo | comunidade | time
--
-- Substitui o lead score (lead_score/lead_category continuam existindo, mas
-- o código passa a gravar null).
-- Numerada 016 (e não 012) pra não colidir com 012–015 do branch onboarding-ev.
-- Sem CHECK constraint: valores validados no código (lib/poker/productFit.ts).
-- Sem esta migration aplicada, /api/leads e /api/results dão 500
-- ("column does not exist").

alter table public.reglife_diagnostic_results
  add column if not exists product_profile text,
  add column if not exists product_test text,
  add column if not exists product_final text;

comment on column public.reglife_diagnostic_results.product_profile is
  'Produto pelo questionário (bases/protocolo/comunidade/time). null = fora do perfil ou lead legacy.';

comment on column public.reglife_diagnostic_results.product_test is
  'Bucket do nivelamento (time/comunidade/comunidade_ou_protocolo). null = teste não concluído.';

comment on column public.reglife_diagnostic_results.product_final is
  'Produto final = min(perfil, teste). null = teste pendente ou fora do perfil.';
