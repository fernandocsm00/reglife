-- ============================================================
-- RegLife — Migration 005: SharkScope PlayerGroup
--
-- Permite o admin conectar um PlayerGroup do SharkScope ao aluno
-- (jogadores com várias contas / multi-skin). Quando preenchido,
-- o sync usa o endpoint de playergroup em vez do player individual,
-- e o Rex passa a ler o resultado consolidado.
-- ============================================================

alter table public.reglife_diagnostic_results
  add column if not exists sharkscope_playergroup_id text;

-- Histórico de snapshots também guarda a origem pra auditoria
alter table public.sharkscope_diag_snapshots
  add column if not exists source text default 'player'; -- 'player' | 'playergroup'
