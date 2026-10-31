import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claveCorreoEmpuje, correosEmpujeActivos, decidirCorreoEmpuje, PASO_EMPUJE, VENTANA_EMPUJE } from './correo-empuje.ts';
import { PASOS_DURABLES, PASOS_EMBUDO } from './embudo.ts';

// Los dos correos de «después de la primera clase»: a quién, cuándo y una vez.

const AHORA = Date.parse('2026-10-31T10:00:00Z');
const hace = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();
const COMPARTIR = {
  variante: 'compartir' as const, version: 'v2', cadenaId: null, esDemo: false, suspendido: false,
  hitoEn: hace(25), yaEnviado: false, enlaceCompartido: false, email: 'duena@example.com', ahoraMs: AHORA,
};
const ALUMNAS = { ...COMPARTIR, variante: 'alumnas' as const, hitoEn: hace(49), enlaceCompartido: true, hayReservas: false };

test('compartir: la clase es reservable desde hace un día y no enseñó el enlace → sale', () => {
  assert.deepEqual(decidirCorreoEmpuje(COMPARTIR), { enviar: true });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, version: 'v2_prueba' }), { enviar: true });
});

test('compartir: ventana de 24 h a 7 días desde el hito', () => {
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: hace(23.9) }), { enviar: false, motivo: 'aun_no' });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: hace(24) }), { enviar: true });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: hace(7 * 24) }), { enviar: true });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: hace(7 * 24 + 1) }), { enviar: false, motivo: 'tarde' });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: null }), { enviar: false, motivo: 'sin_hito' });
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, hitoEn: 'no es fecha' }), { enviar: false, motivo: 'sin_hito' });
});

test('compartir: si ya copió o mandó el enlace no hay nada que empujar', () => {
  assert.deepEqual(decidirCorreoEmpuje({ ...COMPARTIR, enlaceCompartido: true }), { enviar: false, motivo: 'ya_compartido' });
});

test('alumnas: compartió hace dos días y sigue sin ninguna reserva → sale', () => {
  assert.deepEqual(decidirCorreoEmpuje(ALUMNAS), { enviar: true });
});

test('alumnas: ventana de 48 h a 10 días, y solo si compartió', () => {
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hitoEn: hace(47.9) }), { enviar: false, motivo: 'aun_no' });
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hitoEn: hace(48) }), { enviar: true });
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hitoEn: hace(10 * 24) }), { enviar: true });
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hitoEn: hace(10 * 24 + 1) }), { enviar: false, motivo: 'tarde' });
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, enlaceCompartido: false }), { enviar: false, motivo: 'sin_compartir' });
});

test('alumnas: con una sola reserva ya no es «nadie ha reservado»', () => {
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hayReservas: true }), { enviar: false, motivo: 'ya_tiene_reservas' });
  // Sin leerlas todavía, lo demás decide (se leen justo antes de mandar).
  assert.deepEqual(decidirCorreoEmpuje({ ...ALUMNAS, hayReservas: undefined }), { enviar: true });
});

test('una vez por variante, y fuera lo que no es un estudio nuevo de verdad', () => {
  for (const base of [COMPARTIR, ALUMNAS]) {
    assert.deepEqual(decidirCorreoEmpuje({ ...base, yaEnviado: true }), { enviar: false, motivo: 'ya_enviado' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, version: 'v1' }), { enviar: false, motivo: 'no_es_alta_nueva' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, version: null }), { enviar: false, motivo: 'no_es_alta_nueva' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, cadenaId: 'cad-1' }), { enviar: false, motivo: 'sede_de_cadena' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, esDemo: true }), { enviar: false, motivo: 'demo' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, suspendido: true }), { enviar: false, motivo: 'suspendido' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, email: null }), { enviar: false, motivo: 'sin_email' });
    assert.deepEqual(decidirCorreoEmpuje({ ...base, email: undefined }), { enviar: true });
  }
});

test('los dos son excluyentes: un mismo estudio nunca califica para los dos', () => {
  for (const enlaceCompartido of [true, false]) {
    const a = decidirCorreoEmpuje({ ...COMPARTIR, enlaceCompartido, hitoEn: hace(60) });
    const b = decidirCorreoEmpuje({ ...ALUMNAS, enlaceCompartido, hitoEn: hace(60) });
    assert.ok(!(a.enviar && b.enviar), `con enlaceCompartido=${enlaceCompartido} saldrían los dos`);
  }
});

test('la clave de Resend es una por estudio y variante', () => {
  assert.equal(claveCorreoEmpuje('compartir', 's-1'), 'alta-empuje-compartir:s-1');
  assert.notEqual(claveCorreoEmpuje('compartir', 's-1'), claveCorreoEmpuje('alumnas', 's-1'));
  assert.notEqual(claveCorreoEmpuje('alumnas', 's-1'), claveCorreoEmpuje('alumnas', 's-2'));
});

test('apagado de serie: solo ALTA_EMPUJE=on los enciende', () => {
  assert.equal(correosEmpujeActivos(undefined), false);
  assert.equal(correosEmpujeActivos(''), false);
  assert.equal(correosEmpujeActivos('prueba'), false);
  assert.equal(correosEmpujeActivos('true'), false);
  assert.equal(correosEmpujeActivos('on'), true);
  assert.equal(correosEmpujeActivos(' ON '), true);
});

test('las marcas son pasos del embudo y duraderos (valen pase cuando pase)', () => {
  for (const paso of Object.values(PASO_EMPUJE)) {
    assert.ok((PASOS_EMBUDO as readonly string[]).includes(paso), `${paso} no está en PASOS_EMBUDO`);
    assert.ok((PASOS_DURABLES as readonly string[]).includes(paso), `${paso} no es duradero`);
  }
});

// ── La guarda del job (migración 20261031100000) ────────────────────────────

const MIGRACION = readFileSync(join(import.meta.dirname, '../../supabase/migrations/20261031100000_alta_empuje_compartir_y_alumnas.sql'), 'utf8');
const normal = (s: string) => s.replace(/\s+/g, ' ').trim();

test('la guarda llama por las dos ventanas, con las MISMAS horas que la regla', () => {
  const m = normal(MIGRACION);
  assert.ok(m.includes(`e.ocurrido_en <= now() - interval '${VENTANA_EMPUJE.compartir.desdeHoras} hours' + interval '1 minute'`));
  assert.ok(m.includes(`e.ocurrido_en > now() - interval '${VENTANA_EMPUJE.compartir.hastaHoras / 24} days' - interval '1 minute'`));
  assert.ok(m.includes(`e.ocurrido_en <= now() - interval '${VENTANA_EMPUJE.alumnas.desdeHoras} hours' + interval '1 minute'`));
  assert.ok(m.includes(`e.ocurrido_en > now() - interval '${VENTANA_EMPUJE.alumnas.hastaHoras / 24} days' - interval '1 minute'`));
  assert.ok(m.includes("e.paso in ('enlace_compartido', 'correo_empuje_compartir')"));
  assert.ok(m.includes("e.paso = 'correo_empuje_alumnas'"));
  assert.ok(m.includes('not exists (select 1 from public.reservas r where r.studio_id = s.id)'));
});

test('sigue llamando por las dos ramas de antes, con las MISMAS condiciones', () => {
  const m = normal(MIGRACION);
  for (const c of [
    "(a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)",
    "e.paso in ('clase_reservable', 'correo_primera_clase')",
    "s.creado_en <= now() - interval '24 hours' + interval '1 minute'",
    "s.creado_en > now() - interval '72 hours' - interval '1 minute'",
  ]) assert.ok(m.includes(c), `la guarda ya no filtra: ${c}`);
});

test('la guarda sigue siendo solo del servidor y no toca el job', () => {
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.ok(MIGRACION.includes(`revoke execute on function public.cron_hay_trabajo_altas(text) from ${rol};`), rol);
  }
  assert.ok(MIGRACION.includes('grant execute on function public.cron_hay_trabajo_altas(text) to service_role;'));
  assert.doesNotMatch(MIGRACION, /cron\.(schedule|alter_job)\(/, 'ni cadencia ni comando del job: solo la guarda');
});
