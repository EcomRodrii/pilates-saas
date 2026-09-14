import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  descontarSesionDeReserva, efectosTrasReintento, interpretarFilaConsumo, ocupaPlaza, sesionDescontada,
  SIN_CONSUMO, type ClienteConsumo, type ConsumoBono,
} from './consumo-bono-reserva.ts';

// ── Lógica pura ─────────────────────────────────────────────────────────────

test('la fila de la RPC se traduce tal cual', () => {
  assert.deepEqual(
    interpretarFilaConsumo({ resultado: 'CONSUMIDA', saldo_restante: 3, suscripcion_consumida_id: 'sus-1' }),
    { resultado: 'CONSUMIDA', saldo: 3, suscripcionId: 'sus-1', via: 'reserva' },
  );
  assert.equal(interpretarFilaConsumo({ resultado: 'YA_CONSUMIDA', saldo_restante: 0, suscripcion_consumida_id: 'sus-1' }).saldo, 0);
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

test('«se descontó» es verdad si se hizo ahora o antes, nunca si no se hizo', () => {
  const c = (resultado: ConsumoBono['resultado']) => SIN_CONSUMO(resultado);
  assert.equal(sesionDescontada(c('CONSUMIDA')), true);
  assert.equal(sesionDescontada(c('YA_CONSUMIDA')), true);
  for (const r of ['SIN_SALDO', 'SIN_BONO', 'NO_OCUPA_PLAZA', 'NO_VERIFICABLE', 'FALLO'] as const) {
    assert.equal(sesionDescontada(c(r)), false, r);
  }
});

test('⚠️ en un reintento los avisos solo se repiten si el descuento ha ocurrido AHORA', () => {
  const c = (resultado: ConsumoBono['resultado']) => SIN_CONSUMO(resultado);
  assert.equal(efectosTrasReintento('CONFIRMADA', c('CONSUMIDA')), true, 'la primera vez murió antes de avisar');
  // Ya cobrada: la primera vez llegó al menos hasta el descuento, y pudo avisar.
  assert.equal(efectosTrasReintento('CONFIRMADA', c('YA_CONSUMIDA')), false);
  // Sin bono (mensual) o legada: no hay prueba de nada, se deja como estaba.
  for (const r of ['SIN_BONO', 'NO_VERIFICABLE', 'SIN_SALDO', 'NO_OCUPA_PLAZA', 'FALLO'] as const) {
    assert.equal(efectosTrasReintento('CONFIRMADA', c(r)), false, r);
  }
  // La clase ya se dio: se cobra, pero no se anuncia «reserva confirmada».
  assert.equal(efectosTrasReintento('ASISTIDA', c('CONSUMIDA')), false);
});

// ── Con una base de datos fingida ───────────────────────────────────────────
// El modelo de `consumir_sesion_bono_reserva` de abajo copia la migración paso
// a paso. No prueba el SQL (eso es el bloque de verificación al final de la
// migración, con BEGIN…ROLLBACK): prueba que el servidor, llamando como llama,
// descuenta UNA vez por reserva pase lo que pase entre medias.

interface FilaReserva {
  id: string; studio_id: string; sesion_id: string; socio_id: string; estado: string;
  bono_consumido_en?: string | null; bono_suscripcion_id?: string | null; bono_consumo_rastreado?: boolean | null;
}

function crearBD(inicial: { migracion: 'aplicada' | 'sin-aplicar' | 'solo-columnas' }) {
  const estado = { ...inicial };
  const reservas = new Map<string, FilaReserva>();
  const saldo = new Map<string, number>([['sus-1', 5]]);
  const socioDeSuscripcion = new Map<string, string>([['sus-1', 'soc-1']]);
  const llamadas: string[] = [];
  const columnas = () => estado.migracion !== 'sin-aplicar';
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const fila = (resultado: string, saldoRestante: number | null = null, sus: string | null = null) =>
    ok([{ resultado, saldo_restante: saldoRestante, suscripcion_consumida_id: sus }]);

  const cliente: ClienteConsumo = {
    rpc(fn, a) {
      llamadas.push(fn);
      if (fn === 'consumir_sesion_bono_reserva') {
        if (estado.migracion !== 'aplicada') {
          return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
        }
        const r = reservas.get(a.p_reserva_id as string);
        if (!r || r.studio_id !== a.p_studio_id) return fila('RESERVA_NO_ENCONTRADA');
        if (r.bono_consumido_en) return fila('YA_CONSUMIDA', saldo.get(r.bono_suscripcion_id!) ?? null, r.bono_suscripcion_id!);
        if (!['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'].includes(r.estado)) return fila('NO_OCUPA_PLAZA');
        if (a.p_reintento && r.bono_consumo_rastreado !== true) return fila('NO_VERIFICABLE');
        const sus = a.p_suscripcion_id as string;
        if (socioDeSuscripcion.get(sus) !== r.socio_id) {
          return Promise.resolve({ data: null, error: { code: 'P0001', message: 'SUSCRIPCION_NO_ES_DE_LA_SOCIA' } });
        }
        if ((saldo.get(sus) ?? 0) <= 0) return fila('SIN_SALDO');
        saldo.set(sus, saldo.get(sus)! - 1);
        r.bono_consumido_en = '2026-09-14T10:00:00Z';
        r.bono_suscripcion_id = sus;
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
    from(tabla) {
      assert.equal(tabla, 'reservas');
      return {
        update: (valores) => ({
          eq: (c1, id) => ({
            eq: (c2, studio) => ({
              is: (c3) => {
                assert.deepEqual([c1, c2, c3], ['id', 'studio_id', 'bono_consumido_en']);
                llamadas.push('marcar-legado');
                if (!columnas()) {
                  return Promise.resolve({ error: { code: '42703', message: 'column does not exist' } });
                }
                const r = reservas.get(id);
                if (r && r.studio_id === studio && !r.bono_consumido_en) Object.assign(r, valores);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        }),
      };
    },
  };

  return {
    cliente, llamadas, estado,
    saldo: () => saldo.get('sus-1'),
    /** Lo que hace `reservar_plaza`: insertar la fila (y nada más). */
    insertarReserva(id: string, extra: Partial<FilaReserva> = {}) {
      reservas.set(id, {
        id, studio_id: 'st-1', sesion_id: 'ses-1', socio_id: 'soc-1', estado: 'CONFIRMADA',
        // El default de la columna: las filas nuevas nacen rastreadas.
        ...(columnas() ? { bono_consumido_en: null, bono_suscripcion_id: null, bono_consumo_rastreado: true } : {}),
        ...extra,
      });
    },
    reserva: (id: string) => reservas.get(id),
  };
}

const PEDIDO = { studioId: 'st-1', sesionId: 'ses-1', suscripcionId: 'sus-1' };

test('la primera llamada descuenta y la segunda no hace nada', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  bd.insertarReserva('res-1');

  const primera = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(primera.resultado, 'CONSUMIDA');
  assert.equal(primera.saldo, 4);
  assert.equal(bd.saldo(), 4);

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
  assert.equal(bd.saldo(), 5);

  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'CONSUMIDA');
  assert.equal(efectosTrasReintento('CONFIRMADA', reintento), true, 'la primera vez no llegó a avisar: avisa ahora');
  assert.equal(bd.saldo(), 4);

  // Un tercer intento (doble toque del mostrador, otra entrega del webhook).
  const otro = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(otro.resultado, 'YA_CONSUMIDA');
  assert.equal(efectosTrasReintento('CONFIRMADA', otro), false, 'y no vuelve a avisar');
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
  assert.deepEqual(bd.llamadas, ['consumir_sesion_bono_reserva', 'consumir_sesion_bono', 'marcar-legado']);

  // Sin marca no se puede saber si ya se hizo: no se arriesga a cobrar dos veces.
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'NO_VERIFICABLE');
  assert.equal(bd.saldo(), 4);
});

test('sin la migración y sin saldo: SIN_SALDO, como hoy', async () => {
  const bd = crearBD({ migracion: 'sin-aplicar' });
  bd.insertarReserva('res-1');
  for (let i = 0; i < 5; i++) await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: `res-x${i}`, reintento: false });
  assert.equal(bd.saldo(), 0);
  const r = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(r.resultado, 'SIN_SALDO');
});

test('⚠️ recién aplicada (RPC aún fuera de la caché): el descuento viejo deja la marca y el reintento no repite', async () => {
  const bd = crearBD({ migracion: 'solo-columnas' });
  bd.insertarReserva('res-1');
  const primera = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(primera.via, 'legado');
  assert.ok(bd.reserva('res-1')?.bono_consumido_en, 'la reserva queda marcada');

  bd.estado.migracion = 'aplicada';
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-1', reintento: true });
  assert.equal(reintento.resultado, 'YA_CONSUMIDA');
  assert.equal(bd.saldo(), 4);
});

test('una reserva LEGADA: el reintento no descuenta, la primera llamada del hecho sí', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  // Existía antes de la migración: pudo cobrarse con la RPC vieja, sin marca.
  bd.insertarReserva('res-vieja', { bono_consumo_rastreado: null });
  const reintento = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: 'res-vieja', reintento: true });
  assert.equal(reintento.resultado, 'NO_VERIFICABLE');
  assert.equal(bd.saldo(), 5);

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
    ...bd.cliente,
    rpc: (fn, a) => fn === 'consumir_sesion_bono_reserva'
      // Tiempo agotado: la transacción pudo confirmarse sin que llegara la respuesta.
      ? Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      : bd.cliente.rpc(fn, a),
  };
  const r = await descontarSesionDeReserva(cliente, { ...PEDIDO, reservaId: 'res-1', reintento: false });
  assert.equal(r.resultado, 'FALLO');
  assert.equal(bd.saldo(), 5);
  assert.ok(!bd.llamadas.includes('consumir_sesion_bono'));
});

test('sin reserva identificada se usa el descuento de siempre, y nunca en un reintento', async () => {
  const bd = crearBD({ migracion: 'aplicada' });
  const r = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: null, reintento: false });
  assert.deepEqual({ resultado: r.resultado, via: r.via }, { resultado: 'CONSUMIDA', via: 'legado' });
  assert.deepEqual(bd.llamadas, ['consumir_sesion_bono'], 'no hay reserva que marcar');
  const otra = await descontarSesionDeReserva(bd.cliente, { ...PEDIDO, reservaId: null, reintento: true });
  assert.equal(otra.resultado, 'NO_VERIFICABLE');
  assert.equal(bd.saldo(), 4);
});

// ── Guardianes sobre el código y la migración ───────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const ADMIN = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');
const MIGRACION = readdirSync(MIGRACIONES)
  .filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join(MIGRACIONES, f), 'utf8'))
  .find(sql => /create or replace function public\.consumir_sesion_bono_reserva\(/.test(sql));

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
function cuerpoDe(nombre: string): string {
  const ini = ADMIN.search(new RegExp(`\\n(?:export\\s+)?async function ${nombre}\\(`));
  assert.ok(ini > 0, `no encuentro ${nombre}: ¿se renombró?`);
  const sig = ADMIN.slice(ini + 1).search(/\n(?:export\s+)?async function \w+\(/);
  return sig === -1 ? ADMIN.slice(ini) : ADMIN.slice(ini, ini + 1 + sig);
}

test('⚠️ todo descuento de bono en servidor dice de QUÉ reserva es', () => {
  const llamadas = [...ADMIN.matchAll(/consumirBonoServidor\(admin/g)].map(m => llamadaDesde(ADMIN, m.index!));
  assert.ok(llamadas.length >= 3, 'no se encuentran las llamadas: revisa este guardián');
  for (const l of llamadas) assert.match(l, /reservaId/, `descuento sin reserva: ${l}`);
});

test('⚠️ los reintentos del mostrador y del pago completan el bono en vez de callarse', () => {
  for (const nombre of ['crearReservaMostrador', 'reservarPlazaTrasPagoPublico']) {
    const cuerpo = cuerpoDe(nombre);
    const rama = cuerpo.slice(cuerpo.indexOf('YA_RESERVADA'));
    assert.ok(rama.indexOf('YA_RESERVADA') >= 0, `${nombre} ya no trata YA_RESERVADA`);
    const tras = rama.indexOf('trasReservaCreada(');
    assert.ok(tras > 0 && rama.slice(tras, tras + 400).includes('reintento: true'),
      `${nombre}: el reintento del mismo intento tiene que llamar a su dueño en modo reintento`);
  }
});

test('⚠️ la migración: candado en la reserva, estados espejo de TS y solo service_role', () => {
  assert.ok(MIGRACION, 'no encuentro la migración de consumir_sesion_bono_reserva');
  const sql = MIGRACION!.replace(/^\s*--.*$/gm, '');
  assert.match(sql, /from public\.reservas as r[\s\S]*?for update;/, 'sin FOR UPDATE sobre la reserva no hay idempotencia bajo concurrencia');
  const estados = sql.match(/v_estado not in \(([^)]*)\)/)?.[1].match(/'(\w+)'/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(estados, ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);
  for (const e of estados!) assert.equal(ocupaPlaza(e), true, `ocupaPlaza no coincide con el SQL en ${e}`);
  const firma = 'public.consumir_sesion_bono_reserva(text, text, text, boolean)';
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.ok(sql.includes(`revoke all on function ${firma} from ${rol};`), `falta REVOKE ... FROM ${rol}`);
  }
  assert.ok(sql.includes(`grant execute on function ${firma} to service_role;`));
  assert.doesNotMatch(sql, /grant execute on function public\.consumir_sesion_bono_reserva[^;]*(anon|authenticated)/);
  // Las filas existentes quedan legadas: el default va DESPUÉS del ADD COLUMN.
  assert.match(sql, /add column if not exists bono_consumo_rastreado boolean;/);
  assert.match(sql, /alter column bono_consumo_rastreado set default true;/);
});
