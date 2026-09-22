import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  descontarSesionDeReserva, devolucionPermitida, efectosTrasConsumo, esColumnaInexistente,
  interpretarFilaConsumo, ocupaPlaza, sesionDescontada,
  SIN_CONSUMO, type ClienteConsumo, type ConsumoBono, type ResultadoConsumo,
} from './consumo-bono-reserva.ts';

const c = (resultado: ResultadoConsumo, via: ConsumoBono['via'] = 'reserva'): ConsumoBono =>
  ({ ...SIN_CONSUMO(resultado), via });

// ── Lógica pura ─────────────────────────────────────────────────────────────

test('la fila de la RPC se traduce tal cual', () => {
  assert.deepEqual(
    interpretarFilaConsumo({ resultado: 'CONSUMIDA', saldo_restante: 3, suscripcion_consumida_id: 'sus-1' }),
    { resultado: 'CONSUMIDA', saldo: 3, suscripcionId: 'sus-1', via: 'reserva' },
  );
  for (const r of ['YA_CONSUMIDA', 'YA_DECIDIDA', 'SIN_BONO', 'SIN_SALDO', 'NO_OCUPA_PLAZA', 'NO_VERIFICABLE']) {
    assert.equal(interpretarFilaConsumo({ resultado: r }).resultado, r);
  }
});

test('una reserva que ya no existe no se cobra, igual que una cancelada', () => {
  assert.equal(interpretarFilaConsumo({ resultado: 'RESERVA_NO_ENCONTRADA' }).resultado, 'NO_OCUPA_PLAZA');
});

test('⚠️ una respuesta inesperada es un FALLO, nunca un éxito', () => {
  for (const fila of [null, undefined, {}, { resultado: 'OK' }, { resultado: 42 }, 'CONSUMIDA']) {
    assert.equal(interpretarFilaConsumo(fila).resultado, 'FALLO', JSON.stringify(fila));
  }
});

test('solo se cobra una plaza que se ocupa', () => {
  for (const e of ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']) assert.equal(ocupaPlaza(e), true, e);
  for (const e of ['CANCELADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION', null, undefined, '']) assert.equal(ocupaPlaza(e), false, String(e));
});

test('«se descontó» es verdad si se hizo ahora o antes, nunca si se decidió no cobrar', () => {
  assert.equal(sesionDescontada(c('CONSUMIDA')), true);
  assert.equal(sesionDescontada(c('YA_CONSUMIDA')), true);
  for (const r of ['YA_DECIDIDA', 'SIN_SALDO', 'SIN_BONO', 'NO_OCUPA_PLAZA', 'NO_VERIFICABLE', 'FALLO'] as const) {
    assert.equal(sesionDescontada(c(r)), false, r);
  }
});

test('⚠️ en un reintento los avisos solo se repiten si la decisión ocurre AHORA, con marca', () => {
  for (const r of ['CONSUMIDA', 'SIN_BONO', 'SIN_SALDO'] as const) {
    assert.equal(efectosTrasConsumo('CONFIRMADA', c(r), true), true, `${r}: la primera vez no llegó a avisar`);
  }
  for (const r of ['YA_CONSUMIDA', 'YA_DECIDIDA', 'NO_VERIFICABLE', 'NO_OCUPA_PLAZA', 'FALLO'] as const) {
    assert.equal(efectosTrasConsumo('CONFIRMADA', c(r), true), false, r);
  }
  // Sin la migración no hay marca que lo pruebe.
  assert.equal(efectosTrasConsumo('CONFIRMADA', c('SIN_BONO', 'legado'), true), false);
  // La clase ya se dio: se cobra, pero no se anuncia «reserva confirmada».
  assert.equal(efectosTrasConsumo('ASISTIDA', c('CONSUMIDA'), true), false);
});

test('⚠️ llamada normal: si otra llamada ya decidió (carrera con un reintento), no avisa ni cuenta', () => {
  assert.equal(efectosTrasConsumo('CONFIRMADA', c('YA_CONSUMIDA'), false), false);
  assert.equal(efectosTrasConsumo('CONFIRMADA', c('YA_DECIDIDA'), false), false);
  // Todo lo demás, como siempre.
  for (const r of ['CONSUMIDA', 'SIN_BONO', 'SIN_SALDO', 'NO_OCUPA_PLAZA', 'FALLO'] as const) {
    assert.equal(efectosTrasConsumo('CONFIRMADA', c(r), false), true, r);
    assert.equal(efectosTrasConsumo('CONFIRMADA', c(r, 'legado'), false), true, `${r} legado`);
  }
});

test('columna inexistente: 42703 de Postgres o PGRST204 de la caché, nada más', () => {
  assert.equal(esColumnaInexistente({ code: '42703' }), true);
  assert.equal(esColumnaInexistente({ code: 'PGRST204' }), true);
  for (const e of [null, undefined, {}, { code: 'PGRST202' }, { code: '57014' }]) assert.equal(esColumnaInexistente(e), false);
});

test('⚠️ al cancelar, una reserva rastreada que nunca se cobró de un bono no recupera sesión', () => {
  // Rastreada y cobrada de un bono: se devuelve.
  assert.equal(devolucionPermitida({ bono_consumo_rastreado: true, bono_suscripcion_id: 'sus-1' }), true);
  // Rastreada sin cobro: sin decidir (cobro en vuelo) o decidida sin bono.
  assert.equal(devolucionPermitida({ bono_consumo_rastreado: true, bono_suscripcion_id: null }), false);
  // Legada o no rastreada: como siempre.
  assert.equal(devolucionPermitida({ bono_consumo_rastreado: null, bono_suscripcion_id: null }), true);
  assert.equal(devolucionPermitida({ bono_consumo_rastreado: false, bono_suscripcion_id: null }), true);
  assert.equal(devolucionPermitida({}), true, 'sin columnas (migración sin aplicar): como siempre');
});

// ── Con una base de datos fingida ───────────────────────────────────────────
// El modelo de `consumir_sesion_bono_reserva` de abajo copia la migración paso
// a paso. No prueba el SQL (eso es el bloque de comprobaciones de la migración,
// con BEGIN…ROLLBACK): prueba que el servidor, llamando como llama, decide UNA
// vez por reserva pase lo que pase entre medias.

interface FilaReserva {
  id: string; studio_id: string; sesion_id: string; socio_id: string; estado: string;
  bono_decidido_en: string | null; bono_suscripcion_id: string | null; bono_consumo_rastreado: boolean | null;
}

function crearBD(inicial: { migracion: 'aplicada' | 'sin-aplicar' }) {
  const estado = { ...inicial };
  const reservas = new Map<string, FilaReserva>();
  const saldo = new Map<string, number>([['sus-1', 5], ['sus-2', 0]]);
  const llamadas: string[] = [];
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const fila = (resultado: string, saldoRestante: number | null = null, sus: string | null = null) =>
    ok([{ resultado, saldo_restante: saldoRestante, suscripcion_consumida_id: sus }]);
  const decidir = (r: FilaReserva, sus: string | null) => {
    r.bono_decidido_en = '2026-09-14T10:00:00Z';
    r.bono_suscripcion_id = sus;
  };

  const cliente: ClienteConsumo = {
    rpc(fn, a) {
      llamadas.push(fn);
      if (fn === 'consumir_sesion_bono_reserva') {
        if (estado.migracion !== 'aplicada') {
          return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
        }
        const r = reservas.get(a.p_reserva_id as string);
        if (!r || r.studio_id !== a.p_studio_id) return fila('RESERVA_NO_ENCONTRADA');
        if (r.bono_decidido_en) {
          return r.bono_suscripcion_id
            ? fila('YA_CONSUMIDA', saldo.get(r.bono_suscripcion_id) ?? null, r.bono_suscripcion_id)
            : fila('YA_DECIDIDA');
        }
        if (!['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'].includes(r.estado)) return fila('NO_OCUPA_PLAZA');
        if (a.p_reintento && r.bono_consumo_rastreado !== true) return fila('NO_VERIFICABLE');
        const sus = a.p_suscripcion_id as string | null;
        if (sus == null) { decidir(r, null); return fila('SIN_BONO'); }
        if ((saldo.get(sus) ?? 0) <= 0) { decidir(r, null); return fila('SIN_SALDO'); }
        saldo.set(sus, saldo.get(sus)! - 1);
        decidir(r, sus);
        return fila('CONSUMIDA', saldo.get(sus)!, sus);
      }
      if (fn === 'consumir_sesion_bono') {
        const sus = a.p_suscripcion_id as string;
        if ((saldo.get(sus) ?? 0) <= 0) return ok(null);
        saldo.set(sus, saldo.get(sus)! - 1);
        return ok(saldo.get(sus));
      }
      throw new Error(`RPC inesperada: ${fn}`);
    },
  };

  return {
    cliente, llamadas, estado,
    saldo: (sus = 'sus-1') => saldo.get(sus),
    comprarBono: (sus: string, sesiones: number) => saldo.set(sus, sesiones),
    /** Lo que hace `reservar_plaza`: insertar la fila (y nada más). */
    insertarReserva(id: string, extra: Partial<FilaReserva> = {}) {
      reservas.set(id, {
        id, studio_id: 'st-1', sesion_id: 'ses-1', socio_id: 'soc-1', estado: 'CONFIRMADA',
        bono_decidido_en: null, bono_suscripcion_id: null,
        // Con la 2 de 2 aplicada las filas nuevas nacen rastreadas; antes, NULL.
        bono_consumo_rastreado: estado.migracion === 'aplicada' ? true : null,
        ...extra,
      });
    },
    cancelar: (id: string) => { reservas.get(id)!.estado = 'CANCELADA'; },
    reserva: (id: string) => reservas.get(id)!,
  };
}

const PEDIDO = { studioId: 'st-1', sesionId: 'ses-1', suscripcionId: 'sus-1' };

test('la primera llamada descuenta y la segunda no hace nada', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');

  const primera = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.deepEqual({ r: primera.resultado, saldo: primera.saldo }, { r: 'CONSUMIDA', saldo: 4 });

  for (const reintento of [false, true]) {
    const otra = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento });
    assert.equal(otra.resultado, 'YA_CONSUMIDA');
    assert.equal(otra.saldo, 4, 'enseña el saldo que hay, sin tocarlo');
  }
  assert.equal(bd.saldo(), 4, 'una reserva, una sesión');
  assert.ok(!bd.llamadas.includes('consumir_sesion_bono'), 'con la migración aplicada no se usa la RPC vieja');
});

test('⚠️ muere entre crear la reserva y descontar: el reintento descuenta exactamente una vez', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  // …y aquí el proceso muere: nadie llama al descuento.
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'CONSUMIDA');
  assert.equal(efectosTrasConsumo('CONFIRMADA', reintento, true), true, 'la primera vez no llegó a avisar: avisa ahora');

  const otro = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(otro.resultado, 'YA_CONSUMIDA');
  assert.equal(efectosTrasConsumo('CONFIRMADA', otro, true), false, 'y no vuelve a avisar');
  assert.equal(bd.saldo(), 4);
});

test('⚠️ carrera: un reintento gana y la llamada normal no repite avisos, analítica ni créditos', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  const [ganadora, perdedora] = await Promise.all([
    descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true }),
    descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false }),
  ]);
  assert.equal(ganadora.resultado, 'CONSUMIDA');
  assert.equal(efectosTrasConsumo('CONFIRMADA', ganadora, true), true);
  assert.equal(perdedora.resultado, 'YA_CONSUMIDA');
  assert.equal(efectosTrasConsumo('CONFIRMADA', perdedora, false), false);
  assert.equal(bd.saldo(), 4);
});

test('⚠️ sin la migración, todo sigue como hoy: la primera vez descuenta y el reintento no', async () => {
  const bd = crearBD({ migracion: 'sin-aplicar' });
  bd.insertarReserva('res-1');

  const primera = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.deepEqual(
    { resultado: primera.resultado, saldo: primera.saldo, via: primera.via },
    { resultado: 'CONSUMIDA', saldo: 4, via: 'legado' },
  );
  // Sin escribir la marca a mano: si no se ve la RPC, tampoco se ven sus columnas.
  assert.deepEqual(bd.llamadas, ['consumir_sesion_bono_reserva', 'consumir_sesion_bono']);

  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'NO_VERIFICABLE');
  assert.equal(bd.saldo(), 4);

  const sinBono = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: null, reservaId: 'res-1', reintento: false });
  assert.deepEqual({ r: sinBono.resultado, via: sinBono.via }, { r: 'SIN_BONO', via: 'legado' });
  assert.equal(bd.llamadas.filter(l => l === 'consumir_sesion_bono').length, 1, 'sin bono no llama a nada que descuente');
});

test('⚠️ «sin bono» se registra: si compra un bono después, el reintento no le cobra esa clase', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  const primera = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: null, reservaId: 'res-1', reintento: false });
  assert.equal(primera.resultado, 'SIN_BONO');
  assert.ok(bd.reserva('res-1').bono_decidido_en, 'la decisión queda marcada');

  bd.comprarBono('sus-2', 10);
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: 'sus-2', reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'YA_DECIDIDA');
  assert.equal(efectosTrasConsumo('CONFIRMADA', reintento, true), false);
  assert.equal(bd.saldo('sus-2'), 10, 'el bono nuevo queda intacto');
});

test('«sin saldo» también se registra: rellenar el bono no convierte el reintento en cobro', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  const r = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: 'sus-2', reservaId: 'res-1', reintento: false });
  assert.equal(r.resultado, 'SIN_SALDO');
  bd.comprarBono('sus-2', 3);
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: 'sus-2', reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'YA_DECIDIDA');
  assert.equal(bd.saldo('sus-2'), 3);
});

test('⚠️ una reserva NO rastreada (plaza fija, importada) nunca se cobra en un reintento', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  for (const id of ['res-pf-1', 'res-importada']) {
    bd.insertarReserva(id, { bono_consumo_rastreado: false });
    const r = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: id, reintento: true });
    assert.equal(r.resultado, 'NO_VERIFICABLE', id);
  }
  assert.equal(bd.saldo(), 5);
});

test('una reserva LEGADA: el reintento no descuenta, la primera llamada del hecho sí', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-vieja', { bono_consumo_rastreado: null });
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-vieja', reintento: true });
  assert.equal(reintento.resultado, 'NO_VERIFICABLE');
  // P. ej. una lista de espera de ayer que sube hoy: es la primera vez del hecho.
  const promocion = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-vieja', reintento: false });
  assert.equal(promocion.resultado, 'CONSUMIDA');
  assert.equal(bd.saldo(), 4);
});

test('una reserva que no ocupa plaza no se cobra aunque llegue un reintento', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  for (const estado of ['CANCELADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']) {
    bd.insertarReserva(`res-${estado}`, { estado });
    const r = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: `res-${estado}`, reintento: true });
    assert.equal(r.resultado, 'NO_OCUPA_PLAZA', estado);
  }
  assert.equal(bd.saldo(), 5);
});

test('⚠️ un error cualquiera NO cae a la RPC vieja: podría haber descontado ya', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  const cliente: ClienteConsumo = {
    rpc: (fn, a) => fn === 'consumir_sesion_bono_reserva'
      ? Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      : bd.cliente.rpc(fn, a),
  };
  const r = await descontarSesionDeReserva(cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(r.resultado, 'FALLO');
  assert.equal(bd.saldo(), 5);
  assert.ok(!bd.llamadas.includes('consumir_sesion_bono'));
});

test('⚠️ cancelar con el cobro aún en vuelo: ni se devuelve sesión ni se cobra después', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');
  // La socia cancela antes de que el servidor llegue a cobrar.
  bd.cancelar('res-1');
  assert.equal(devolucionPermitida(bd.reserva('res-1')), false, 'no hay sesión cobrada que devolver');
  // El cobro en vuelo llega tarde y ve la reserva cancelada.
  const tarde = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(tarde.resultado, 'NO_OCUPA_PLAZA');
  assert.equal(bd.saldo(), 5, 'saldo intacto: ni regalo ni cobro');

  // En cambio, cobrada y luego cancelada: sí se devuelve.
  bd.insertarReserva('res-2');
  await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-2', reintento: false });
  bd.cancelar('res-2');
  assert.equal(devolucionPermitida(bd.reserva('res-2')), true);

  // Y decidida sin bono, cancelada: nada que devolver.
  bd.insertarReserva('res-3');
  await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, suscripcionId: null, reservaId: 'res-3', reintento: false });
  bd.cancelar('res-3');
  assert.equal(devolucionPermitida(bd.reserva('res-3')), false);
});

// ── Guardianes sobre el código y las migraciones ────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const ADMIN = leer('lib/db/supabase-data-admin.ts');
const MODULO = leer('lib/reservas/consumo-bono-reserva.ts');
const sinComentariosSql = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const MIGR_A = sinComentariosSql(leer('supabase/migrations/20260914182637_reservas_bono_decidido_por_reserva.sql'));
const MIGR_B = sinComentariosSql(leer('supabase/migrations/20260914182713_reservas_bono_rastreo_por_defecto.sql'));

/** Texto de la llamada que empieza en `i`, hasta su paréntesis de cierre. */
function llamadaDesde(fuente: string, i: number): string {
  let prof = 0;
  for (let j = fuente.indexOf('(', i); j < fuente.length; j++) {
    if (fuente[j] === '(') prof++;
    if (fuente[j] === ')' && --prof === 0) return fuente.slice(i, j + 1);
  }
  return fuente.slice(i);
}

/** Cuerpo de una función de primer nivel, hasta la siguiente. */
function cuerpoDe(fuente: string, nombre: string): string {
  const ini = fuente.search(new RegExp(`\\n(?:export\\s+)?async function ${nombre}\\(`));
  assert.ok(ini > 0, `no encuentro ${nombre}: ¿se renombró?`);
  const sig = fuente.slice(ini + 1).search(/\n(?:export\s+)?(?:async\s+)?function \w+\(/);
  return sig === -1 ? fuente.slice(ini) : fuente.slice(ini, ini + 1 + sig);
}

test('⚠️ todo cobro de bono en servidor dice de QUÉ reserva es, y nunca «sin reserva»', () => {
  const llamadas = [...ADMIN.matchAll(/consumirBonoServidor\(admin/g)].map(m => llamadaDesde(ADMIN, m.index!));
  assert.ok(llamadas.length >= 3, 'no se encuentran las llamadas: revisa este guardián');
  for (const l of llamadas) {
    assert.match(l, /reservaId/, `cobro sin reserva: ${l}`);
    assert.doesNotMatch(l, /\?\?\s*null/, `cobro con reserva posiblemente nula: ${l}`);
  }
});

test('⚠️ los reintentos del mostrador y del pago completan el bono en vez de callarse', () => {
  for (const nombre of ['crearReservaMostrador', 'reservarPlazaTrasPagoPublico']) {
    const cuerpo = cuerpoDe(ADMIN, nombre);
    const rama = cuerpo.slice(cuerpo.indexOf('YA_RESERVADA'));
    const tras = rama.indexOf('trasReservaCreada(');
    assert.ok(tras > 0 && rama.slice(tras, tras + 400).includes('reintento: true'),
      `${nombre}: el reintento del mismo intento tiene que llamar a su dueño en modo reintento`);
  }
});

test('⚠️ completar tras un reintento nunca toca una plaza fija', () => {
  const cuerpo = cuerpoDe(ADMIN, 'completarConfirmacionTrasReintento');
  const guardia = cuerpo.indexOf("startsWith('res-pf-')");
  assert.ok(guardia > 0, 'falta la guardia de plaza fija');
  assert.ok(guardia < cuerpo.indexOf('trasPlazaConfirmada('), 'la guardia va antes de llamar al dueño');
});

test('⚠️ toda devolución por cancelación mira si la reserva llegó a cobrarse', () => {
  for (const nombre of ['ejecutarCancelacionReserva', 'devolverBonosPorCancelacionClase']) {
    assert.match(cuerpoDe(ADMIN, nombre), /reservasSinCobroRegistrado\(/, nombre);
  }
  assert.match(leer('app/api/reservas/devolver-bonos/route.ts'), /reservasSinCobroRegistrado\(/);
  // Los que cancelan una clase entera le pasan la reserva, o la guardia no mira nada.
  assert.match(cuerpoDe(ADMIN, 'cancelarSesionPorMinimoNoAlcanzado'), /reservaId: r\.id/);
  assert.match(leer('app/api/sustituciones/route.ts'), /tipoClaseId, reservaId: r\.id/);
});

test('⚠️ las reservas importadas nacen NO rastreadas, y el import sigue funcionando sin la migración', () => {
  const ruta = leer('app/api/reservas/import/route.ts');
  assert.match(ruta, /bono_consumo_rastreado: false/);
  assert.match(ruta, /esColumnaInexistente\(error\)/);
});

test('⚠️ al caer al descuento viejo no se escribe ninguna marca a mano', () => {
  assert.doesNotMatch(MODULO, /\.from\(/, 'la protección de esa ventana es el orden de las migraciones, no una escritura suelta');
});

test('⚠️ migración 1 de 2: candado, decisión sin bono, estados espejo de TS, solo service_role y SIN default', () => {
  assert.match(MIGR_A, /from public\.reservas as r[\s\S]*?for update;/, 'sin FOR UPDATE sobre la reserva no hay idempotencia bajo concurrencia');
  assert.match(MIGR_A, /if p_suscripcion_id is null then[\s\S]*?bono_decidido_en = now\(\)[\s\S]*?'SIN_BONO'/);
  const estados = MIGR_A.match(/v_estado not in \(([^)]*)\)/)?.[1].match(/'(\w+)'/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(estados, ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);
  for (const e of estados!) assert.equal(ocupaPlaza(e), true, `ocupaPlaza no coincide con el SQL en ${e}`);
  const firma = 'public.consumir_sesion_bono_reserva(text, text, text, boolean)';
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.ok(MIGR_A.includes(`revoke all on function ${firma} from ${rol};`), `falta REVOKE ... FROM ${rol}`);
  }
  assert.ok(MIGR_A.includes(`grant execute on function ${firma} to service_role;`));
  assert.doesNotMatch(MIGR_A, /grant execute on function public\.consumir_sesion_bono_reserva[^;]*(anon|authenticated)/);
  assert.match(MIGR_A, /add column if not exists bono_consumo_rastreado boolean;/);
  assert.doesNotMatch(MIGR_A, /set default/, 'el default va en la 2 de 2, después de confirmar que PostgREST ve la RPC');
});

test('⚠️ migración 1 de 2: la plaza fija conserva firma, SECURITY DEFINER y grants, y nace no rastreada', () => {
  assert.match(MIGR_A, /create or replace function public\.materializar_plazas_fijas\(p_horizonte_dias integer default 42\)\s+returns integer\s+language plpgsql\s+security definer/);
  assert.match(MIGR_A, /insert into reservas \([^)]*bono_consumo_rastreado\)\s+select 'res-pf-'[^;]*now\(\), false\s/);
  // Misma firma: sus grants no cambian. Solo la decisión por escrito sobre anon
  // que exige la regla RGPD, que ya estaba revocado.
  const sentencias = [...MIGR_A.matchAll(/\b(grant|revoke)\b[^;]*materializar_plazas_fijas[^;]*;/gi)].map(m => m[0]);
  assert.deepEqual(sentencias, ['revoke all on function public.materializar_plazas_fijas(integer) from public, anon;']);
});

test('⚠️ migración 2 de 2: solo el default, nada más', () => {
  const sentencias = MIGR_B.split(';').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(sentencias, ['alter table public.reservas\n  alter column bono_consumo_rastreado set default true']);
});

test('⚠️ R-4: la devolución legada también sella por reserva, no solo la rastreada', () => {
  const cuerpo = cuerpoDe(ADMIN, 'devolverBonoServidor');
  // La rama rastreada (RES-3) ya sella con `devolver_sesion_bono_por_reserva`
  // y devuelve pronto; lo que se comprueba aquí es que, tras ella, la rama
  // legada NO cae directa al `+1` ciego cuando SÍ hay reservaId — antes de
  // llegar al `devolver_sesion_bono` sin marca, tiene que intentar la RPC
  // sellada.
  const trasRamaRastreada = cuerpo.slice(cuerpo.indexOf('bonoDevolvible('));
  const iLegado = trasRamaRastreada.indexOf('devolver_sesion_bono_legado_por_reserva');
  const iCiego = trasRamaRastreada.indexOf("rpc('devolver_sesion_bono'");
  assert.ok(iLegado > 0, 'falta la llamada a la RPC legada sellada');
  assert.ok(iCiego > iLegado, 'el incremento ciego (sin marca) tiene que ir DESPUÉS, como último recurso sin reservaId');
  // Y esa llamada va detrás de un `if (reservaId)` — nunca se llama sin id.
  const guardaReservaId = trasRamaRastreada.slice(0, iLegado).lastIndexOf('if (reservaId)');
  assert.ok(guardaReservaId > 0, 'la RPC legada sellada exige reservaId, igual que la rastreada');
});
