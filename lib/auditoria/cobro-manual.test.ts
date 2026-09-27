import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { COLUMNAS_DEL_COBRO, TIEMPO_LECTURA_MS, anotarCobroManual, leerReciboAntesDeCobrar } from './cobro-manual.ts';
import { filaDeAuditoriaServidor, type EntradaServidor } from './entrada-servidor.ts';

const SESION = { userId: '00000000-0000-4000-8000-000000000001', studioId: 'studio-1', rol: 'RECEPCION' };

const PENDIENTE = {
  estado: 'PENDIENTE', metodo_cobro: null, sepa_estado: null, fecha_cobro: null, stripe_payment_intent_id: null,
  socio_id: 'soc-1', concepto: 'Mensual Ilimitado — Sep 2026', importe: 85,
};
const COBRADO = {
  ...PENDIENTE, estado: 'COBRADO', metodo_cobro: 'TARJETA', fecha_cobro: '2026-09-26', stripe_payment_intent_id: 'pi_123',
};
const EN_CURSO = { ...PENDIENTE, estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing', stripe_payment_intent_id: 'pi_456' };

/** Un admin que responde `filas` en orden, una por lectura del recibo, y recuerda qué se le pidió. */
function adminConLecturas(filas: Array<Record<string, unknown> | 'error' | 'lanza' | null>) {
  const lecturas: Array<{ tabla: string; filtros: Record<string, unknown>; conTope: boolean }> = [];
  return {
    lecturas,
    admin: {
      from(tabla: string) {
        const filtros: Record<string, unknown> = {};
        let conTope = false;
        const c = {
          select() { return c; },
          eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
          abortSignal(s?: AbortSignal) { conTope = s instanceof AbortSignal; return c; },
          maybeSingle() {
            lecturas.push({ tabla, filtros, conTope });
            const siguiente = filas[lecturas.length - 1];
            if (siguiente === 'lanza') throw new Error('red caída');
            if (siguiente === 'error') return Promise.resolve({ data: null, error: { message: 'boom' } });
            return Promise.resolve({ data: siguiente ?? null, error: null });
          },
        };
        return c;
      },
    } as never,
  };
}

function registrador() {
  const entradas: EntradaServidor[] = [];
  return { entradas, registrar: async (_admin: unknown, e: EntradaServidor) => { entradas.push(e); } };
}

const base = { sesion: SESION, reciboId: 'rec-1', socioId: 'soc-1', origen: 'COBRAR_ONLINE' as const };

test('un cobro que sale bien anota quién, el recibo de antes y de después, y con qué resultado', async () => {
  const { admin, lecturas } = adminConLecturas([COBRADO]);
  const r = registrador();
  const avisos: string[] = [];
  await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded' } }, r.registrar, m => avisos.push(m));

  assert.equal(r.entradas.length, 1);
  const e = r.entradas[0];
  assert.deepEqual(e.sesion, SESION);
  assert.equal(e.tabla, 'recibos');
  assert.equal(e.filaId, 'rec-1');
  assert.equal(e.operacion, 'UPDATE');
  assert.equal(e.socioId, 'soc-1');
  assert.equal(e.contexto.accion, 'COBRO_LANZADO');
  assert.equal(e.contexto.concepto, 'Mensual Ilimitado — Sep 2026');
  assert.equal(e.contexto.importe, 85);
  assert.equal(e.contexto.resultado_cobro, 'succeeded');
  assert.equal(e.contexto.origen, 'COBRAR_ONLINE');
  assert.deepEqual(Object.keys(e.antes ?? {}).sort(), [...COLUMNAS_DEL_COBRO].sort());
  assert.equal((e.antes as Record<string, unknown>).estado, 'PENDIENTE');
  assert.equal((e.despues as Record<string, unknown>).estado, 'COBRADO');
  // Lee el recibo DE ESTA SEDE, con tope de tiempo.
  assert.deepEqual(lecturas.map(l => [l.tabla, l.filtros, l.conTope]), [['recibos', { id: 'rec-1', studio_id: 'studio-1' }, true]]);
  assert.ok(TIEMPO_LECTURA_MS > 0 && TIEMPO_LECTURA_MS <= 5000, 'la lectura de antes va delante del cargo: tope corto');
  assert.deepEqual(avisos, []);
});

test('la fila del libro solo lleva las columnas que cambiaron (ni el concepto ni el importe son un cambio)', async () => {
  const { admin } = adminConLecturas([COBRADO]);
  const r = registrador();
  await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded' } }, r.registrar, () => {});
  const f = filaDeAuditoriaServidor(r.entradas[0]);
  assert.ok(f.ok);
  assert.deepEqual(f.fila.cambios, ['estado', 'fecha_cobro', 'metodo_cobro', 'stripe_payment_intent_id']);
  assert.equal(f.fila.origen, 'servidor');
  assert.equal(f.fila.actor_uid, SESION.userId);
});

test('un adeudo SEPA en marcha también se anota: el recibo pasa a EN_CURSO y lo dice el resultado', async () => {
  const { admin } = adminConLecturas([EN_CURSO]);
  const r = registrador();
  await anotarCobroManual(admin, { ...base, origen: 'AUTOMATIZACIONES', antes: PENDIENTE, resultado: { ok: true, status: 'processing' } }, r.registrar, () => {});
  assert.equal(r.entradas.length, 1);
  assert.equal(r.entradas[0].contexto.resultado_cobro, 'processing');
  assert.equal(r.entradas[0].contexto.origen, 'AUTOMATIZACIONES');
  assert.equal((r.entradas[0].despues as Record<string, unknown>).estado, 'EN_CURSO');
  assert.equal((r.entradas[0].despues as Record<string, unknown>).sepa_estado, 'processing');
});

test('un cobro que NO salió bien no anota nada ni lee nada: el recibo no cambió', async () => {
  for (const resultado of [{ ok: false }, { ok: false, status: 'requires_action' }]) {
    const { admin, lecturas } = adminConLecturas([]);
    const r = registrador();
    await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado }, r.registrar, () => {});
    assert.equal(r.entradas.length, 0);
    assert.equal(lecturas.length, 0, 'ni siquiera relee el recibo');
  }
});

test('«cobrado sin persistir»: el dinero entró pero el recibo no cambió; no se inventa un COBRADO (ni se lee nada)', async () => {
  const { admin, lecturas } = adminConLecturas([PENDIENTE]);
  const r = registrador();
  await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR' } }, r.registrar, () => {});
  assert.equal(r.entradas.length, 0);
  assert.equal(lecturas.length, 0);
});

test('si el recibo no cambió de verdad (el adeudo perdió una carrera): sin entrada vacía, pero NO en silencio — se avisa con quién lo lanzó', async () => {
  const { admin } = adminConLecturas([PENDIENTE]);
  const r = registrador();
  const avisos: Array<[string, Record<string, unknown>]> = [];
  await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'processing' } },
    r.registrar, (m, extra) => avisos.push([m, extra]));
  assert.equal(r.entradas.length, 0);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0][0], 'AUDITORIA_COBRO_SIN_CAMBIO_EN_EL_RECIBO');
  assert.equal(avisos[0][1].userId, SESION.userId);
  assert.equal(avisos[0][1].filaId, 'rec-1');
});

test('«cobrado sin persistir»: no hay entrada, pero el aviso lleva quién lo lanzó (el de Stripe no lo sabe)', async () => {
  const { admin } = adminConLecturas([]);
  const r = registrador();
  const avisos: Array<[string, Record<string, unknown>]> = [];
  await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR' } },
    r.registrar, (m, extra) => avisos.push([m, extra]));
  assert.equal(r.entradas.length, 0);
  assert.equal(avisos[0][0], 'AUDITORIA_COBRO_SIN_PERSISTIR_LANZADO_POR');
  assert.equal(avisos[0][1].userId, SESION.userId);
  assert.equal(avisos[0][1].origen, 'COBRAR_ONLINE');
});

test('el socio de la entrada es el del RECIBO, no el que llegó en el cuerpo; y sin valor anterior se dice', async () => {
  const { admin } = adminConLecturas([COBRADO]);
  const r = registrador();
  await anotarCobroManual(admin, { ...base, socioId: 'soc-del-cuerpo', antes: null, resultado: { ok: true, status: 'succeeded' } }, r.registrar, () => {});
  assert.equal(r.entradas[0].socioId, 'soc-1');
  assert.equal(r.entradas[0].contexto.sin_valor_anterior, true);
  // Y con el valor de antes no se marca.
  const { admin: admin2 } = adminConLecturas([COBRADO]);
  const r2 = registrador();
  await anotarCobroManual(admin2, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded' } }, r2.registrar, () => {});
  assert.equal('sin_valor_anterior' in r2.entradas[0].contexto, false);
});

test('sin el valor de antes, la entrada sale igualmente (y se avisó al leerlo)', async () => {
  const { admin } = adminConLecturas(['error', COBRADO]);
  const avisos: Array<[string, Record<string, unknown>]> = [];
  const antes = await leerReciboAntesDeCobrar(admin, 'studio-1', 'rec-1', (m, extra) => avisos.push([m, extra]));
  assert.equal(antes, null);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0][0], 'AUDITORIA_LECTURA_PREVIA_FALLO');
  assert.equal(avisos[0][1].filaId, 'rec-1');

  const r = registrador();
  await anotarCobroManual(admin, { ...base, antes, resultado: { ok: true, status: 'succeeded' } }, r.registrar, () => {});
  assert.equal(r.entradas.length, 1);
  assert.equal((r.entradas[0].despues as Record<string, unknown>).estado, 'COBRADO');
});

test('si no se puede releer el recibo después, no se calla: se avisa (un cobro real sin rastro y sin aviso es lo que hay que evitar)', async () => {
  for (const lectura of ['error', 'lanza', null] as const) {
    const { admin } = adminConLecturas([lectura]);
    const r = registrador();
    const avisos: string[] = [];
    await anotarCobroManual(admin, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded' } }, r.registrar, m => avisos.push(m));
    assert.equal(r.entradas.length, 0, String(lectura));
    assert.deepEqual(avisos, ['AUDITORIA_LECTURA_POSTERIOR_FALLO'], String(lectura));
  }
});

test('nunca lanza: ni si el registro falla ni si una lectura revienta', async () => {
  const { admin } = adminConLecturas(['lanza']);
  // La lectura de antes se traga el fallo (y avisa).
  const avisos: string[] = [];
  assert.equal(await leerReciboAntesDeCobrar(admin, 'studio-1', 'rec-1', m => avisos.push(m)), null);
  assert.deepEqual(avisos, ['AUDITORIA_LECTURA_PREVIA_FALLO']);

  const { admin: admin2 } = adminConLecturas([COBRADO]);
  const avisos2: string[] = [];
  await anotarCobroManual(admin2, { ...base, antes: PENDIENTE, resultado: { ok: true, status: 'succeeded' } },
    async () => { throw new Error('el libro se cayó'); }, m => avisos2.push(m));
  assert.deepEqual(avisos2, ['AUDITORIA_FALLO']);
});

test('el índice único de la migración rechaza exactamente lo que este helper puede repetir: el mismo cargo del mismo recibo', () => {
  // Se busca por el nombre y no por la versión: al aplicarla, el fichero se renombra a la que quedó en la base de datos.
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const nombre = readdirSync(dir).find(n => n.endsWith('_auditoria_cobro_unico_por_cargo.sql'));
  assert.ok(nombre, 'no se encuentra la migración del índice único del cobro');
  const sql = readFileSync(new URL(nombre, dir), 'utf8').replace(/--.*$/gm, '');
  assert.match(
    sql,
    /create unique index if not exists auditoria_estudio_cobro_unico_idx\s+on public\.auditoria_estudio \(studio_id, fila_id, \(despues ->> 'stripe_payment_intent_id'\)\)\s+where origen = 'servidor' and contexto ->> 'accion' = 'COBRO_LANZADO';/,
  );
  // Y la acción del índice es la que escribe el helper (si una cambia y la otra no, el índice no protege nada).
  assert.match(readFileSync(new URL('./cobro-manual.ts', import.meta.url), 'utf8'), /accion:\s*'COBRO_LANZADO'/);
});
