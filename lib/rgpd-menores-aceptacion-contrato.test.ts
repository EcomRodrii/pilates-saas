import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EDAD_MINIMA_CONSENTIMIENTO_SALUD } from './datos-salud/edad.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardianes de contrato — fase 3 de la auditoría RGPD (2026-09-13).
//
//  · Menores de 14: la alumna no registra su consentimiento de salud (ruta +
//    RPC), y en mostrador firma su tutor legal (el servidor lo exige).
//  · Aceptación del contrato: fecha, origen y texto los fija el servidor, con
//    historial append-only y huella de IP en vez de IP.
//
// Si uno falla, no se arregla quitándolo: se arregla la migración o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

function migracion(sufijo: string): string {
  const nombre = readdirSync(join(RAIZ, 'supabase/migrations')).find(n => n.endsWith(sufijo));
  assert.ok(nombre, `falta la migración *${sufijo}`);
  return sinComentarios(leer(`supabase/migrations/${nombre}`));
}

const MENORES = migracion('_consentimiento_salud_menores_portal.sql');
const ACEPTACION = migracion('_aceptaciones_contrato_eventos.sql');

// ─── Menores ────────────────────────────────────────────────────────────────

test('consentimiento_salud_cambiar: el umbral SQL es el de TS, en hora de Madrid y solo para PORTAL', () => {
  assert.match(MENORES, new RegExp(String.raw`interval '${EDAD_MINIMA_CONSENTIMIENTO_SALUD} years'`));
  assert.match(MENORES, /at time zone 'Europe\/Madrid'/);
  assert.match(MENORES, /if p_origen = 'PORTAL' then/);
  assert.match(MENORES, /return 'MENOR_14'/);
  assert.match(MENORES, /return 'FALTA_FECHA_NACIMIENTO'/);
});

test('consentimiento_salud_cambiar: sigue siendo solo service_role', () => {
  const firma = String.raw`public\.consentimiento_salud_cambiar\(text, text, text, text, text, text, uuid, text\)`;
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(MENORES, new RegExp(String.raw`revoke all on function ${firma} from ${rol};`));
  }
  assert.match(MENORES, new RegExp(String.raw`grant execute on function ${firma} to service_role;`));
  assert.doesNotMatch(MENORES, new RegExp(String.raw`grant execute on function ${firma} to [^;]*(anon|authenticated)`));
});

test('la ruta de la alumna decide por edad ANTES de consentir; el panel exige tutor con una menor', () => {
  const alumna = leer('app/api/public/valoracion/route.ts');
  assert.match(alumna, /bloqueoConsentimientoPortal\(porEdad\)/);
  assert.match(alumna, /consentimientoSaludPorEdad\(await leerFechaNacimiento\(studioId, socioId\)/);
  assert.doesNotMatch(alumna, /body\??\.socioId/);

  const panel = leer('app/api/socios/[id]/consentimiento-salud/route.ts');
  assert.match(panel, /decidirFirmantePanel\(/);
  assert.match(panel, /textoConsentimientoSaludPanel\([^;]*decision\.firmante\)/);
});

// ─── Aceptación del contrato ────────────────────────────────────────────────

test('aceptaciones_contrato_eventos: sin escritura del cliente, lectura solo propietaria', () => {
  assert.match(ACEPTACION, /revoke all on table public\.aceptaciones_contrato_eventos from anon;/);
  assert.match(ACEPTACION, /revoke all on table public\.aceptaciones_contrato_eventos from authenticated;/);
  assert.match(ACEPTACION, /grant select on table public\.aceptaciones_contrato_eventos to authenticated;/);
  assert.doesNotMatch(ACEPTACION, /grant (all|insert|update|delete)[^;]*on table public\.aceptaciones_contrato_eventos to [^;]*authenticated/);
  assert.match(ACEPTACION, /enable row level security/);
  assert.match(ACEPTACION, /current_rol\(\) = 'PROPIETARIO'/);
  // IP nunca en claro: solo una huella hexadecimal de 64.
  assert.match(ACEPTACION, /ip_hmac text check \(ip_hmac is null or ip_hmac ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.doesNotMatch(ACEPTACION, /\bip\s+(inet|text)\b/);
});

test('aceptacion_contrato_registrar: solo service_role, fecha now() y sin columnas nuevas en socios', () => {
  const firma = String.raw`public\.aceptacion_contrato_registrar\(text, text, text, text, text, boolean, text, text, uuid, text, text, text\)`;
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(ACEPTACION, new RegExp(String.raw`revoke all on function ${firma} from ${rol};`));
  }
  assert.match(ACEPTACION, new RegExp(String.raw`grant execute on function ${firma} to service_role;`));
  assert.match(ACEPTACION, /security definer/);
  assert.match(ACEPTACION, /set search_path = ''/);
  assert.match(ACEPTACION, /aceptacion_fecha = now\(\)/);
  assert.match(ACEPTACION, /for update;/);
  // El historial va en su tabla: `socios` no gana columnas (ni grants ni FilaSocioPanel que tocar).
  assert.doesNotMatch(ACEPTACION, /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?socios\b/i);
});

test('las puertas que escriben la aceptación la sellan en servidor', () => {
  const socio = leer('app/api/public/socio/route.ts');
  assert.match(socio, /registrarAceptacionContrato\(/);
  assert.match(socio, /origen: 'PORTAL'/);
  assert.match(socio, /textoContratoVigente\(admin, studioId\)/);
  assert.match(socio, /fecha: new Date\(\)\.toISOString\(\), firma, versionTexto: texto/);
  assert.doesNotMatch(socio, /\.\.\.ac\b/, 'la fecha y el texto del navegador no pueden llegar al INSERT');

  assert.doesNotMatch(leer('lib/db/supabase-data-admin.ts'), /db\.aceptacion_fecha\s*=/);

  const mostrador = leer('app/api/socios/[id]/aceptacion-contrato/route.ts');
  assert.match(mostrador, /puedeGestionarClientas\(sesion\.rol\)/);
  assert.match(mostrador, /origen: 'MOSTRADOR'/);
  assert.match(mostrador, /actorUid: sesion\.userId/);
  assert.match(leer('app/(dashboard)/clientas/page.tsx'), /sellarAceptacionMostrador\(/);

  const admin = leer('lib/db/aceptacion-contrato-admin.ts');
  assert.match(admin, /huellaIp\(clientIp\(req\), secretoRateLimit\(process\.env\)\)/);
  assert.match(admin, /rpc\('aceptacion_contrato_registrar'/);
});
