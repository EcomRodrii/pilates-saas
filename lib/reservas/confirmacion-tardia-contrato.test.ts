import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanTarifa, Suscripcion } from '../types.ts';
import { bonoConsumible } from '../bono-logic.ts';
import { conReintentoPorInterbloqueo, consumoYaDecidido, efectosTrasConsumo, esInterbloqueo } from './consumo-bono-reserva.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Las confirmaciones tardías (aprobar una pendiente, aceptar una plaza ofrecida,
// subir de la lista de espera) descuentan el bono en la MISMA transacción y bajo
// el MISMO candado por socia que la confirmación, como `reservar_plaza`
// (migración 20260930120000). Y la base de datos elige el bono igual que TS.
//
// Estructural sobre el ÚLTIMO cuerpo de cada función en las migraciones; el
// ensayo en vivo (bloque que termina en RAISE, nada persiste) va en el PR.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR = join(RAIZ, 'supabase/migrations');
const MIGRACIONES = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort();

/** El último cuerpo declarado (entre sus etiquetas de dólar) de una función. */
function cuerpoVigente(fn: string): string {
  let ultimo: string | null = null;
  for (const nombre of MIGRACIONES) {
    const sql = readFileSync(join(DIR, nombre), 'utf8');
    const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${fn}\s*\(`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index);
      const abre = /\$(function|body)?\$/.exec(resto);
      if (!abre) continue;
      const etiqueta = abre[0];
      const cierra = resto.indexOf(etiqueta, abre.index + etiqueta.length);
      if (cierra === -1) continue;
      ultimo = resto.slice(abre.index + etiqueta.length, cierra);
    }
  }
  assert.notEqual(ultimo, null, `No se encontró ninguna definición de ${fn}`);
  return ultimo!;
}

const CANDADO = /pg_advisory_xact_lock\(hashtext\(p_studio_id \|\| ':' \|\| (v_socio_id|p_socio_id|v_cand\.socio_id)\)\)/;
const DESCUENTO = /begin\s+perform public\.consumir_bono_interno\(\s*[\w.]+,\s*public\.elegir_bono_consumible\([^)]*\),\s*p_studio_id\);\s+exception when raise_exception then\s+null;\s+end;/;

for (const fn of ['resolver_reserva_pendiente', 'aceptar_oferta_lista_espera', 'promocionar_siguiente_espera']) {
  test(`⚠️ ${fn}: candado de la socia y descuento en la misma transacción`, () => {
    const cuerpo = cuerpoVigente(fn);
    const candado = CANDADO.exec(cuerpo);
    assert.ok(candado, `${fn}: sin el candado por socia de reservar_plaza`);
    const descuento = DESCUENTO.exec(cuerpo);
    assert.ok(descuento, `${fn}: sin el descuento dentro de su bloque defensivo`);
    // El descuento, DESPUÉS de confirmar.
    const confirma = cuerpo.search(/set estado\s*=\s*('CONFIRMADA'|v_estado)/);
    assert.ok(confirma > -1 && confirma < descuento.index, `${fn}: el descuento va después de confirmar`);
    if (fn === 'promocionar_siguiente_espera') {
      // Aquí la sesión ya está bloqueada cuando se sabe a quién le toca: el
      // candado de la candidata va ANTES de sus comprobaciones.
      assert.ok(candado.index < cuerpo.indexOf('socio_tiene_conflicto_horario'), 'el candado antes de mirar su solape');
    } else {
      // Como reservar_plaza: el candado de la socia antes que cualquier fila.
      assert.ok(candado.index < cuerpo.search(/for update/i), `${fn}: el candado antes del primer FOR UPDATE`);
    }
  });
}

test('⚠️ elegir_bono_consumible: la misma elección que `elegirBono` (TS)', () => {
  const cuerpo = cuerpoVigente('elegir_bono_consumible');
  assert.match(cuerpo, /p_tipo_clase_id is not null and exists/, 'la mensual gana, y solo ante una clase concreta');
  assert.match(cuerpo, /p\.tipo = 'MENSUAL'/);
  assert.match(cuerpo, /s\.sesiones_restantes > 0/, 'un bono agotado no es candidato');
  assert.match(cuerpo, /p\.tipo in \('BONO', 'PUNTUAL'\)/);
  assert.match(cuerpo, /plan_cubre_tipo_clase\(p\.id, p_tipo_clase_id\)/);
  assert.match(cuerpo, /s\.fecha_fin is null or s\.fecha_fin >= p_hoy/, 'vigente');
  // El orden de JS (binario): sin `collate "C"`, en_US pondría «sus-a1» antes que «sus-B1».
  assert.match(cuerpo, /order by coalesce\(s\.fecha_fin, '9999-12-31'::date\), s\.id collate "C"/);
});

test('la migración no borra ni cambia la firma de nada, y cierra los permisos', () => {
  const nombre = MIGRACIONES.find(n => n.endsWith('_confirmacion_tardia_descuenta_en_la_transaccion.sql'));
  assert.ok(nombre);
  const sql = readFileSync(join(DIR, nombre), 'utf8');
  assert.doesNotMatch(sql, /drop\s+function/i);
  for (const firma of [
    'elegir_bono_consumible(text, text, text, date)', 'resolver_reserva_pendiente(text, text, boolean)',
    'aceptar_oferta_lista_espera(text, text, text)', 'promocionar_siguiente_espera(text, text, integer)',
  ]) {
    const f = firma.replace(/[()]/g, m => `\\${m}`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${f} from public, anon;`), firma);
    assert.match(sql, new RegExp(`revoke all on function public\\.${f} from authenticated;`), firma);
    assert.match(sql, new RegExp(`grant execute on function public\\.${f} to service_role, postgres;`), firma);
  }
  assert.match(sql, /returns table\(estado text, posicion_espera integer\)/);
  assert.match(sql, /returns table\(estado text\)/);
  assert.match(sql, /returns table\(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone\)/);
});

test('TS usa la decisión de la confirmación, y repite ante un interbloqueo', () => {
  const ts = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');
  const plaza = ts.slice(ts.indexOf('async function trasPlazaConfirmada('), ts.indexOf('async function trasPromocionDeEspera('));
  assert.ok(plaza.indexOf('decisionDeLaConfirmacion(') > -1 && plaza.indexOf('decisionDeLaConfirmacion(') < plaza.indexOf('consumirBonoServidor('));
  const promocion = ts.slice(ts.indexOf('async function trasPromocionDeEspera('), ts.indexOf('export async function completarConfirmacionTrasReintento('));
  assert.ok(promocion.indexOf('decisionDeLaConfirmacion(') > -1 && promocion.indexOf('decisionDeLaConfirmacion(') < promocion.indexOf('consumirBonoServidor('));
  for (const rpc of ['promocionar_siguiente_espera', 'expirar_oferta_lista_espera', 'cancelar_reserva_plaza']) {
    assert.match(ts, new RegExp(`conReintentoPorInterbloqueo\\(\\(\\) => admin\\.rpc\\('${rpc}'`), rpc);
  }
});

// ── Las funciones puras ──────────────────────────────────────────────────────

test('consumoYaDecidido: la decisión escrita en la reserva, como decisión NUEVA', () => {
  assert.equal(consumoYaDecidido(null, null), null);
  assert.equal(consumoYaDecidido({ bono_decidido_en: null, bono_suscripcion_id: null }, null), null);
  const pagada = consumoYaDecidido({ bono_decidido_en: '2026-09-30T10:00:00Z', bono_suscripcion_id: 'sus-1' }, 0);
  assert.deepEqual(pagada, { resultado: 'CONSUMIDA', saldo: 0, suscripcionId: 'sus-1', via: 'reserva' });
  const sinBono = consumoYaDecidido({ bono_decidido_en: '2026-09-30T10:00:00Z', bono_suscripcion_id: null }, 3);
  assert.deepEqual(sinBono, { resultado: 'SIN_BONO', saldo: null, suscripcionId: null, via: 'reserva' });
  // Y con ella siguen los avisos: no es «otra llamada ya lo hizo».
  assert.equal(efectosTrasConsumo('CONFIRMADA', pagada!, false), true);
  assert.equal(efectosTrasConsumo('CONFIRMADA', sinBono!, false), true);
});

test('interbloqueo: se repite UNA vez, y solo por 40P01', async () => {
  assert.equal(esInterbloqueo({ code: '40P01' }), true);
  assert.equal(esInterbloqueo({ code: 'P0001' }), false);
  assert.equal(esInterbloqueo(null), false);
  let n = 0;
  const siempre = await conReintentoPorInterbloqueo(async () => { n++; return { error: { code: '40P01' } }; });
  assert.equal(n, 2);
  assert.equal(siempre.error?.code, '40P01');
  n = 0;
  const segunda = await conReintentoPorInterbloqueo(async () => { n++; return { error: n === 1 ? { code: '40P01' } : null, data: n }; });
  assert.equal(n, 2);
  assert.equal(segunda.error, null);
  n = 0;
  await conReintentoPorInterbloqueo(async () => { n++; return { error: { code: '23505' } }; });
  assert.equal(n, 1, 'otros errores no se repiten');
});

test('TS ordena los ids en binario (el `collate "C"` de la base de datos): «sus-B1» antes que «sus-a1»', () => {
  const sus = (id: string): Suscripcion => ({
    id, studioId: 'e1', socioId: 'a', planId: 'p1', estado: 'ACTIVA',
    fechaInicio: '2026-01-01', fechaFin: '2026-12-31', sesionesRestantes: 2, stripeSubscriptionId: null,
  });
  const plan: PlanTarifa = { id: 'p1', studioId: 'e1', tipo: 'BONO', nombre: 'Bono', descripcion: null, precio: 50, sesiones: 5, validezDias: null, limiteSemanal: null, activo: true };
  assert.equal(bonoConsumible('a', [sus('sus-a1'), sus('sus-B1')], [plan], '2026-09-30', 'tc')?.suscripcion.id, 'sus-B1');
});
