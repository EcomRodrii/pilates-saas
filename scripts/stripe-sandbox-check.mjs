#!/usr/bin/env node
// Comprobación PREVIA del sandbox de Stripe. No cobra, no escribe, no despliega.
//
// ⚠️ Existe porque el montaje de `docs/STRIPE-MODO-TEST.md` tiene seis piezas
// que fallan por separado y **casi ninguna avisa cuando falta**: sin el webhook
// el cobro sale bien en Stripe y la app no se entera; sin el `acct_` en el
// estudio el checkout revienta a mitad; con la clave en el modo equivocado el
// guardia bloquea y el mensaje aparece en un log que nadie mira. Descubrir eso
// tarjeta en mano cuesta una tarde.
//
// ⚠️ **No imprime NINGÚN valor secreto**, solo si está y qué forma tiene. Una
// clave pegada en un log o en una captura de pantalla es una clave filtrada.
//
// Uso:  node scripts/stripe-sandbox-check.mjs

import { readFileSync, existsSync } from 'node:fs';

const ROJO = '\x1b[31m', VERDE = '\x1b[32m', AMBAR = '\x1b[33m', GRIS = '\x1b[90m', FIN = '\x1b[0m';
const ok = (m, d) => console.log(`  ${VERDE}✓${FIN} ${m}${d ? ` ${GRIS}${d}${FIN}` : ''}`);
const mal = (m, comoArreglar) => { console.log(`  ${ROJO}✗${FIN} ${m}\n     ${GRIS}→ ${comoArreglar}${FIN}`); fallos++; };
const aviso = (m, d) => { console.log(`  ${AMBAR}!${FIN} ${m}${d ? `\n     ${GRIS}${d}${FIN}` : ''}`); avisos++; };

let fallos = 0, avisos = 0;

// ── .env.local ──────────────────────────────────────────────────────────────
// Se lee el fichero directamente en vez de `process.env`: este script corre
// fuera de Next, que es quien normalmente lo carga.
const env = {};
if (existsSync('.env.local')) {
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

console.log('\n── Claves ──────────────────────────────────────────────────');

if (!existsSync('.env.local')) {
  mal('no hay .env.local', 'créalo; ver docs/STRIPE-MODO-TEST.md §1');
}

const sk = env.STRIPE_SECRET_KEY ?? '';
if (!sk) {
  mal('STRIPE_SECRET_KEY sin definir', 'Stripe → Test mode → Developers → API keys');
} else if (sk.startsWith('sk_test_XXXX') || sk === 'sk_test_XXXX') {
  // El centinela de «sin configurar», que NO es lo mismo que modo test.
  mal('STRIPE_SECRET_KEY es el centinela `sk_test_XXXX`', 'eso significa «sin configurar», no «modo test». Pon una clave de test REAL (sk_test_51…)');
} else if (sk.startsWith('sk_live_')) {
  mal('STRIPE_SECRET_KEY es una clave LIVE en tu máquina', 'sustitúyela por la de test — no la añadas debajo. `modo-stripe.ts` la bloqueará, pero el riesgo es tener el .env de producción aquí');
} else if (sk.startsWith('sk_test_')) {
  ok('STRIPE_SECRET_KEY en modo test');
} else {
  aviso('STRIPE_SECRET_KEY no parece una clave de Stripe', 'debería empezar por sk_test_');
}

for (const [clave, para] of [
  ['STRIPE_WEBHOOK_SECRET', 'eventos de tu cuenta (`stripe listen`)'],
  ['STRIPE_CONNECT_WEBHOOK_SECRET', 'eventos de la cuenta CONECTADA (`stripe listen --forward-connect-to`)'],
]) {
  const v = env[clave] ?? '';
  if (!v || v.includes('XXXX')) {
    // Sin esto el cobro se completa en Stripe y la app nunca se entera: el
    // recibo se queda PENDIENTE y la tarjeta no se guarda.
    mal(`${clave} sin definir`, `${para} — sin él el cobro «funciona» pero la app no se entera`);
  } else if (v.startsWith('whsec_')) {
    ok(clave, `(${para})`);
  } else {
    aviso(`${clave} no empieza por whsec_`);
  }
}

if (env.STRIPE_PERMITIR_MODO_CRUZADO === '1') {
  aviso('STRIPE_PERMITIR_MODO_CRUZADO=1 — la protección de modos está DESACTIVADA',
    'es la escotilla para depurar producción. Quítala en cuanto termines.');
}

// ── Base de datos ───────────────────────────────────────────────────────────
console.log('\n── Base de datos ───────────────────────────────────────────');

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!url) {
  mal('NEXT_PUBLIC_SUPABASE_URL sin definir', 'arranca Supabase local: `supabase start`');
} else if (/127\.0\.0\.1|localhost/.test(url)) {
  ok('Supabase apunta a local');
} else {
  // El motivo real no es de estilo: los crons de producción corren con clave
  // live e intentarían hablar con la cuenta de test.
  mal('Supabase apunta a un proyecto REMOTO', 'el estudio de pruebas NO puede vivir en la base de producción — ver §3 del doc');
}

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  mal('SUPABASE_SERVICE_ROLE_KEY sin definir', 'los cobros server-side y los crons la necesitan');
} else {
  ok('SUPABASE_SERVICE_ROLE_KEY presente');
}

// ── Herramientas ────────────────────────────────────────────────────────────
console.log('\n── Lo que tienes que arrancar a mano ────────────────────────');
console.log(`  ${GRIS}Este script no puede comprobarlos: son procesos, no configuración.${FIN}`);
console.log(`  ${GRIS}· stripe listen --forward-to localhost:3000/api/stripe/webhook${FIN}`);
console.log(`  ${GRIS}· stripe listen --forward-connect-to localhost:3000/api/stripe/webhook${FIN}`);
console.log(`  ${GRIS}· npx inngest-cli@latest dev   (para disparar los crons de dinero)${FIN}`);

// ── Veredicto ───────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
if (fallos > 0) {
  console.log(`${ROJO}${fallos} cosa(s) que arreglar antes de probar un cobro.${FIN}`);
  if (avisos) console.log(`${AMBAR}${avisos} aviso(s).${FIN}`);
  console.log(`${GRIS}Detalle del montaje: docs/STRIPE-MODO-TEST.md${FIN}\n`);
  process.exit(1);
}
console.log(`${VERDE}Configuración lista.${FIN}${avisos ? ` ${AMBAR}${avisos} aviso(s).${FIN}` : ''}`);
console.log(`${GRIS}Recuerda: esto valida la CONFIGURACIÓN, no que el cobro funcione.${FIN}`);
console.log(`${GRIS}La prueba de verdad es pagar con 4242 4242 4242 4242 y mirar la BD.${FIN}\n`);
