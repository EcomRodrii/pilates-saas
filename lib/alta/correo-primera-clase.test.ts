import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claveCorreoPrimeraClase, decidirCorreoPrimeraClase, HORAS_DESDE_CORREO_PRIMERA_CLASE, HORAS_HASTA_CORREO_PRIMERA_CLASE,
  varianteCorreoPrimeraClase,
} from './correo-primera-clase.ts';
import { AVISO_VENTA_SIN_STRIPE } from '../onboarding.ts';

// El correo 3 del alta nueva, «Tu primera clase en Tentare, en 5 minutos»
// (PR-5): a quién, cuándo, una vez, y qué dice según lo que de verdad falta.

const AHORA = Date.parse('2026-10-22T17:42:00Z');
const hace = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();
const BASE = {
  version: 'v2', cadenaId: null, esDemo: false, suspendido: false, creadoEn: hace(25),
  yaEnviado: false, claseReservable: false, email: 'duena@example.com', ahoraMs: AHORA,
};

test('a las 24 h, un estudio del alta nueva sin clase reservable: sale', () => {
  assert.deepEqual(decidirCorreoPrimeraClase(BASE), { enviar: true });
  // La versión de prueba también: es como el fundador lo ve antes de abrirlo a todas.
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, version: 'v2_prueba' }), { enviar: true });
});

test('ventana de 24 a 72 h: antes es pronto y después ya no es «al día siguiente»', () => {
  assert.equal(HORAS_DESDE_CORREO_PRIMERA_CLASE, 24);
  assert.equal(HORAS_HASTA_CORREO_PRIMERA_CLASE, 72);
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, creadoEn: hace(23.9) }), { enviar: false, motivo: 'aun_no' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, creadoEn: hace(24) }), { enviar: true });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, creadoEn: hace(72) }), { enviar: true });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, creadoEn: hace(73) }), { enviar: false, motivo: 'tarde' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, creadoEn: 'no es fecha' }), { enviar: false, motivo: 'aun_no' });
});

test('una vez, y nunca a quien ya puede recibir reservas', () => {
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, yaEnviado: true }), { enviar: false, motivo: 'ya_enviado' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, claseReservable: true }), { enviar: false, motivo: 'clase_reservable' });
});

test('fuera: el alta de siempre, sedes de cadena, demos, suspendidos y sin correo', () => {
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, version: 'v1' }), { enviar: false, motivo: 'no_es_alta_nueva' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, version: null }), { enviar: false, motivo: 'no_es_alta_nueva' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, cadenaId: 'cad-1' }), { enviar: false, motivo: 'sede_de_cadena' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, esDemo: true }), { enviar: false, motivo: 'demo' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, suspendido: true }), { enviar: false, motivo: 'suspendido' });
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, email: null }), { enviar: false, motivo: 'sin_email' });
  // Sin leer el correo todavía, lo demás decide.
  assert.deepEqual(decidirCorreoPrimeraClase({ ...BASE, email: undefined }), { enviar: true });
});

test('la clave de Resend es una por estudio', () => {
  assert.equal(claveCorreoPrimeraClase('s-1'), 'alta-primera-clase:s-1');
  assert.notEqual(claveCorreoPrimeraClase('s-1'), claveCorreoPrimeraClase('s-2'));
});

test('qué dice: sin clase, la maqueta; con clase que no se puede reservar, eso (D7)', () => {
  assert.deepEqual(varianteCorreoPrimeraClase({ haySesiones: false, veredicto: null }), { tipo: 'sin_clase' });
  assert.deepEqual(varianteCorreoPrimeraClase({ haySesiones: true, veredicto: { estado: 'SI' } }), { tipo: 'reservable' });
  const v = varianteCorreoPrimeraClase({ haySesiones: true, veredicto: { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' } });
  assert.equal(v.tipo, 'no_reservable');
  assert.equal(v.tipo === 'no_reservable' && v.aviso.texto, AVISO_VENTA_SIN_STRIPE);
  // Sin poder preguntar, no se manda (no se sabe qué decir): la pasada siguiente.
  assert.deepEqual(varianteCorreoPrimeraClase({ haySesiones: true, veredicto: null }), { tipo: 'sin_saber' });
  assert.deepEqual(varianteCorreoPrimeraClase({ haySesiones: true, veredicto: { estado: 'SIN_COMPROBAR' } }), { tipo: 'sin_saber' });
});

// ── La guarda del job (migración 20261021160000) ────────────────────────────

const MIGRACION = readFileSync(join(import.meta.dirname, '../../supabase/migrations/20261021160000_alta_primeros_pasos.sql'), 'utf8');
const normal = (s: string) => s.replace(/\s+/g, ' ').trim();

test('la guarda sigue llamando por las altas a medias, con la MISMA condición de siempre', () => {
  for (const c of [
    'recordatorio_enviado_en is null',
    'recordatorio_reclamado_en is null',
    'recordatorio_descartado is null',
    "iniciada_en <= now() - interval '24 hours'",
    "(a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)",
  ]) assert.ok(normal(MIGRACION).includes(c), `la guarda no filtra: ${c}`);
});

test('y llama también por un estudio del alta nueva en la ventana, sin el hito ni el correo', () => {
  const m = normal(MIGRACION);
  assert.ok(m.includes("a.version in ('v2', 'v2_prueba')"));
  assert.ok(m.includes('s.cadena_id is null'));
  assert.ok(m.includes(`s.creado_en <= now() - interval '${HORAS_DESDE_CORREO_PRIMERA_CLASE} hours' + interval '1 minute'`));
  assert.ok(m.includes(`s.creado_en > now() - interval '${HORAS_HASTA_CORREO_PRIMERA_CLASE} hours' - interval '1 minute'`));
  assert.ok(m.includes("e.paso in ('clase_reservable', 'correo_primera_clase')"));
});

test('el job no cambia de ruta, cadencia ni tiempo: solo cuándo llama', () => {
  assert.match(MIGRACION, /url := 'https:\/\/www\.tentare\.app\/api\/cron\/altas-sin-terminar'/);
  assert.match(MIGRACION, /timeout_milliseconds := 55000/);
  assert.match(MIGRACION, /where public\.cron_hay_trabajo_altas\(\);/);
  assert.match(MIGRACION, /cron\.alter_job\(v_id, command := v_cmd\)/);
  assert.doesNotMatch(MIGRACION, /cron\.schedule\(/, 'la cadencia (al minuto 23) no se toca');
});

test('la guarda es solo del servidor: revoke a public, anon Y authenticated, grant a service_role', () => {
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.ok(MIGRACION.includes(`revoke execute on function public.cron_hay_trabajo_altas(text) from ${rol};`), rol);
  }
  assert.ok(MIGRACION.includes('grant execute on function public.cron_hay_trabajo_altas(text) to service_role;'));
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.cron_hay_trabajo_altas\(text\)'/);
});
