/**
 * scripts/check-pulse-token.ts — Verifica sign/verify roundtrip e adversários.
 *
 * Rodar com: SESSION_SECRET=test-secret-32-chars-min-1234 npx tsx scripts/check-pulse-token.ts
 *
 * (Sem env var, o módulo usa o default dev — funciona pro teste local.)
 */

import { signPulseToken, verifyPulseToken } from "../lib/pulse/token";
import { weekIsoOf } from "../lib/pulse/weekIso";

function assertEq<T>(label: string, got: T, expected: T) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${String(got)}, expected ${String(expected)}`);
  if (!ok) process.exitCode = 1;
}

function assertDeep(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  if (!ok) process.exitCode = 1;
}

console.log("\n=== Caso 1: roundtrip sign → verify");
const diag = "11111111-2222-3333-4444-555555555555";
const week = "2026-W21";
const token = signPulseToken(diag, week);
console.log(`  token: ${token}`);
assertDeep("verify", verifyPulseToken(token), { diagnosticId: diag, weekIso: week });

console.log("\n=== Caso 2: token truncado (manipulado)");
assertEq("truncado", verifyPulseToken(token.slice(0, token.length - 1)), null);

console.log("\n=== Caso 3: troca a semana sem re-assinar");
const forged = `${diag}~2026-W22~${token.split("~")[2]}`;
assertEq("semana alterada", verifyPulseToken(forged), null);

console.log("\n=== Caso 4: diag mal formatado");
assertEq("diag-curto", verifyPulseToken(`abc~2026-W21~deadbeef`), null);

console.log("\n=== Caso 5: weekIso mal formatado");
assertEq("week-curto", verifyPulseToken(`${diag}~2026-21~deadbeef`), null);

console.log("\n=== Caso 6: empty");
assertEq("vazio", verifyPulseToken(""), null);

console.log("\n=== Caso 7: weekIsoOf");
// 2026-01-01 (quinta) cai na semana 1 do ISO 2026
assertEq("2026-01-01", weekIsoOf(new Date("2026-01-01T12:00:00Z")), "2026-W01");
// 2026-12-31 cai na quinta da W53 (ISO 2026 tem 53 semanas)
assertEq("2026-12-31", weekIsoOf(new Date("2026-12-31T12:00:00Z")), "2026-W53");
// 2025-12-29 (segunda) já é W01 de 2026
assertEq("2025-12-29 (border)", weekIsoOf(new Date("2025-12-29T12:00:00Z")), "2026-W01");

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
