/**
 * scripts/check-cadence-rules.ts — Verifica que a matriz de cadência
 * casa com a tabela aprovada no spec da Fase C.
 *
 * Rodar com: npx tsx scripts/check-cadence-rules.ts
 */

import { whatsappAllowed, inAppAllowed } from "../lib/triggers/cadenceRules";

function assert(label: string, got: boolean, expected: boolean) {
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — got ${got}, expected ${expected}`);
  if (!ok) process.exitCode = 1;
}

// daily_checkin: leve=❌ tudo, ritmada/intensa = in_app+WA
console.log("\n=== daily_checkin");
assert("leve  → wa",     whatsappAllowed("daily_checkin", "leve"),     false);
assert("leve  → in_app", inAppAllowed   ("daily_checkin", "leve"),     false);
assert("ritmada → wa",   whatsappAllowed("daily_checkin", "ritmada"),  true);
assert("intensa → wa",   whatsappAllowed("daily_checkin", "intensa"),  true);

// weekly_review: leve=só in_app, ritmada/intensa = in_app+WA
console.log("\n=== weekly_review");
assert("leve  → wa",     whatsappAllowed("weekly_review", "leve"),     false);
assert("leve  → in_app", inAppAllowed   ("weekly_review", "leve"),     true);
assert("ritmada → wa",   whatsappAllowed("weekly_review", "ritmada"),  true);

// pulse_request: leve=só in_app, ritmada/intensa = in_app+WA
console.log("\n=== pulse_request");
assert("leve  → wa",     whatsappAllowed("pulse_request", "leve"),     false);
assert("ritmada → wa",   whatsappAllowed("pulse_request", "ritmada"),  true);

// streak_risk: sempre in_app+WA (todos)
console.log("\n=== streak_risk");
assert("leve  → wa",     whatsappAllowed("streak_risk",   "leve"),     true);
assert("ritmada → wa",   whatsappAllowed("streak_risk",   "ritmada"),  true);
assert("intensa → wa",   whatsappAllowed("streak_risk",   "intensa"),  true);

// leak_alert / leak_closed / health_band_change / phase_transition / plan_delivered: sempre WA
console.log("\n=== sempre-WA triggers");
assert("leak_alert leve → wa",        whatsappAllowed("leak_alert",       "leve"),    true);
assert("leak_closed leve → wa",       whatsappAllowed("leak_closed",      "leve"),    true);
assert("health_band_change leve → wa",whatsappAllowed("health_band_change","leve"),   true);
assert("phase_transition leve → wa",  whatsappAllowed("phase_transition", "leve"),    true);
assert("plan_delivered leve → wa",    whatsappAllowed("plan_delivered",   "leve"),    true);

// Gamificação: nunca WA
console.log("\n=== gamificação (nunca WA)");
assert("badge_unlocked ritmada → wa", whatsappAllowed("badge_unlocked",   "ritmada"), false);
assert("quest_done ritmada → wa",     whatsappAllowed("quest_done",       "ritmada"), false);
assert("drop_active intensa → wa",    whatsappAllowed("drop_active",      "intensa"), false);

console.log("\n=== FIM ===");
if (process.exitCode === 1) {
  console.log("✗ FAIL — corrigir cadenceRules.ts antes de continuar.");
  process.exit(1);
}
console.log("✓ Todos os checks passaram.");
