/**
 * scripts/check-health-score.ts — Verificação manual da fórmula.
 *
 * Rodar com: npx tsx scripts/check-health-score.ts
 *
 * Substitui testes unitários nesta fase (o repo não tem test runner instalado).
 * Cada bloco imprime PASS/FAIL e o cálculo. Se algum FAIL aparecer, abortar.
 */

import { computeHealth } from "../lib/health/score";
import type { PlayerState } from "../lib/health/types";

function assertNear(label: string, got: number, expected: number, tol = 0.5) {
  const diff = Math.abs(got - expected);
  const ok = diff <= tol;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${got.toFixed(2)}, expected ~${expected.toFixed(2)}`);
  if (!ok) process.exitCode = 1;
}

function assertEq<T>(label: string, got: T, expected: T) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${String(got)}, expected ${String(expected)}`);
  if (!ok) process.exitCode = 1;
}

function base(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    diagnosticId: "test",
    cycleDay: 30,
    diagnosticSpots: [
      { label: "RFI",  pct: 50, tier: 1, passed: false },
      { label: "Cbet", pct: 60, tier: 1, passed: false },
    ],
    retakeSpots: null,
    roiBaseline: null,
    roi30d: null,
    tasksChecked: 0,
    tasksExpected: 0,
    recentPulses: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
console.log("\n=== Caso 1: aluno cru (só leaks, sem SS, sem tasks, sem pulse)");
// 2 leaks, 0 fechados → leakScore=0 → resultado=0 → health=0 (banda red)
{
  const r = computeHealth(base());
  assertNear("health", r.health, 0);
  assertEq("band", r.band, "red");
  assertNear("leakScore", r.breakdown.leakScore ?? -1, 0);
}

console.log("\n=== Caso 2: aluno fechou 1 dos 2 leaks no retake");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 90, tier: 1, passed: true, hands: 12 },
      { label: "Cbet", pct: 70, tier: 1, passed: false, hands: 12 },
    ],
  }));
  // leakScore=50 → resultado=50 → health=50 (sem outros componentes, peso 1.0 em resultado) → orange
  assertNear("health", r.health, 50);
  assertEq("band", r.band, "orange");
  assertEq("leaksClosed", r.breakdown.leaksClosed, 1);
}

console.log("\n=== Caso 3: retake fechou ambos, ROI subiu 5% acima do baseline");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 90, tier: 1, passed: true, hands: 15 },
      { label: "Cbet", pct: 88, tier: 1, passed: true, hands: 15 },
    ],
    roiBaseline: 0,
    roi30d: 5,
  }));
  // leakScore=100 ; roiScore=clip(50+50,0,100)=100 → resultado=0.7·100+0.3·100=100
  // sem outros componentes → health=100 → green
  assertNear("health", r.health, 100);
  assertEq("band", r.band, "green");
}

console.log("\n=== Caso 4: critério MIN_HANDS bloqueia leak fechado");
{
  const r = computeHealth(base({
    retakeSpots: [
      { label: "RFI",  pct: 95, tier: 1, passed: true, hands: 5 },   // mãos < 10 → não fecha
      { label: "Cbet", pct: 95, tier: 1, passed: true, hands: 15 },  // fecha
    ],
  }));
  assertEq("leaksClosed", r.breakdown.leaksClosed, 1);
}

console.log("\n=== Caso 5: conclusão + sentimento com peso redistribuído (sem resultado computável)");
// diagnóstico SEM leaks (todos passed) → total=0 → leakScore=null → resultado=null
// 5/10 tasks → conclusao=50 ; pulses [smile, smile] → sentimento=66
// pesos redistribuem 0.1/(0.1+0.1)=0.5 cada → health = 0.5·50 + 0.5·66 = 58
{
  const r = computeHealth(base({
    diagnosticSpots: [
      { label: "RFI", pct: 90, tier: 1, passed: true },
    ],
    tasksChecked: 5,
    tasksExpected: 10,
    recentPulses: ["smile", "smile"],
  }));
  assertNear("health", r.health, 58);
  assertEq("band", r.band, "orange"); // 40 ≤ 58 < 60 → orange
}

console.log("\n=== Caso 6: tudo null (não deveria acontecer, mas precisa ser robusto)");
{
  const r = computeHealth(base({
    diagnosticSpots: [{ label: "RFI", pct: 90, tier: 1, passed: true }],
    tasksExpected: 0,
  }));
  assertNear("health", r.health, 0);
  assertEq("band", r.band, "red");
}

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
