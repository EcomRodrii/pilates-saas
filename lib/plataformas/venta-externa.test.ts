import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  estudiosSinVentaExterna, motivoSinVentaExterna, motivoSinVentaExternaDe, porQueSinVentaExterna,
  type FilaVentaExterna,
} from './venta-externa.ts';

// Un estudio sin contrato (baja de pago o prueba vencida) o suspendido no vende
// por USC ni por Wellhub: como si hubiera apagado la integración (7-oct-2026).
// Aquí, la regla con cada estado de la suscripción, los dos lectores de la base
// de datos y que cada puerta la pregunte.

const AHORA = Date.parse('2026-10-07T12:00:00Z');
const DIA = 86_400_000;
const hace = (ms: number) => new Date(AHORA - ms).toISOString();
const dentroDe = (ms: number) => new Date(AHORA + ms).toISOString();

const PAGA: FilaVentaExterna = {
  subscription_status: 'active', subscription_id: 'sub_1', trial_ends_at: null, contrato_terminado_en: null, suspendido_en: null,
};
const fila = (c: Partial<FilaVentaExterna>): FilaVentaExterna => ({ ...PAGA, ...c });
const pruebaLocal = (c: Partial<FilaVentaExterna>) => fila({ subscription_status: 'trialing', subscription_id: null, ...c });

test('con contrato vende: pagando, con el cobro atrasado (Stripe aún puede cobrar) o en su prueba', () => {
  assert.equal(motivoSinVentaExterna(PAGA, AHORA), null);
  for (const s of ['past_due', 'unpaid', 'incomplete']) {
    assert.equal(motivoSinVentaExterna(fila({ subscription_status: s }), AHORA), null, s);
  }
  assert.equal(motivoSinVentaExterna(pruebaLocal({ trial_ends_at: dentroDe(3 * DIA) }), AHORA), null);
  // La prueba de Stripe (con suscripción) la cierra Stripe, aunque la fecha local ya pasara.
  assert.equal(motivoSinVentaExterna(fila({ subscription_status: 'trialing', trial_ends_at: hace(DIA) }), AHORA), null);
  // Un estudio de antes de abrir al público, sin prueba ni baja: no está en ningún ciclo.
  assert.equal(motivoSinVentaExterna(fila({ subscription_status: null, subscription_id: null }), AHORA), null);
});

test('baja: manda `contrato_terminado_en`, nunca un `canceled` a secas', () => {
  assert.equal(motivoSinVentaExterna(fila({ subscription_status: 'canceled', contrato_terminado_en: hace(DIA) }), AHORA), 'baja');
  // Una sede recibe el `canceled` de su suscripción suelta aunque pague su cadena:
  // la fecha la pone la BD con la suscripción QUE MANDA, y sin fecha no hay baja.
  assert.equal(motivoSinVentaExterna(fila({ subscription_status: 'canceled', contrato_terminado_en: null }), AHORA), null);
});

test('prueba vencida: la barrida y la que el barrido aún no ha cerrado, desde su hora exacta', () => {
  assert.equal(motivoSinVentaExterna(pruebaLocal({ subscription_status: 'trial_expirado', trial_ends_at: hace(40 * DIA) }), AHORA), 'prueba_vencida');
  // Venció hace un minuto y pg_cron (cada 15 min) aún no la ha pasado a
  // 'trial_expirado': ya no vende. Regla de negocio, no de reloj.
  assert.equal(motivoSinVentaExterna(pruebaLocal({ trial_ends_at: hace(60_000) }), AHORA), 'prueba_vencida');
  assert.equal(motivoSinVentaExterna(pruebaLocal({ trial_ends_at: new Date(AHORA).toISOString() }), AHORA), 'prueba_vencida');
  assert.equal(motivoSinVentaExterna(pruebaLocal({ trial_ends_at: dentroDe(60_000) }), AHORA), null);
  // 'trialing' nuestro sin fecha de fin: el estado incoherente que daba acceso
  // para siempre. Como en el gate del panel, no cuenta como prueba viva.
  assert.equal(motivoSinVentaExterna(pruebaLocal({ trial_ends_at: null }), AHORA), 'prueba_vencida');
});

test('suspendido a mano: no vende aunque pague, y manda sobre lo demás', () => {
  assert.equal(motivoSinVentaExterna(fila({ suspendido_en: hace(DIA) }), AHORA), 'suspendido');
  assert.equal(motivoSinVentaExterna(fila({ suspendido_en: hace(DIA), contrato_terminado_en: hace(DIA) }), AHORA), 'suspendido');
});

test('el panel dice por qué, en palabras de la propietaria', () => {
  assert.equal(porQueSinVentaExterna('suspendido'), 'tu cuenta está suspendida');
  assert.equal(porQueSinVentaExterna('baja'), 'tu suscripción ha terminado');
  assert.equal(porQueSinVentaExterna('prueba_vencida'), 'tu prueba gratuita ha terminado');
});

// ── Lectores de la base de datos, contra un cliente falso ───────────────────

type FilaConId = FilaVentaExterna & { id: string };

function clienteFalso(filas: FilaConId[], opts: { error?: string } = {}) {
  const lotes: string[][] = [];
  const res = <T>(data: T) => (opts.error ? { data: null, error: { message: opts.error } } : { data, error: null });
  const cliente = {
    from(tabla: string) {
      assert.equal(tabla, 'studios');
      return {
        select(columnas: string) {
          assert.match(columnas, /subscription_status, subscription_id, trial_ends_at, contrato_terminado_en, suspendido_en/);
          return {
            eq: (_col: string, id: string) => ({ maybeSingle: async () => res(filas.find(f => f.id === id) ?? null) }),
            in: async (_col: string, ids: string[]) => { lotes.push(ids); return res(filas.filter(f => ids.includes(f.id))); },
          };
        },
      };
    },
  };
  return { cliente: cliente as never, lotes };
}

test('un webhook: el motivo, null si vende, y «error» si no se pudo leer o no existe (nunca se acepta a ciegas)', async () => {
  const { cliente } = clienteFalso([{ id: 'paga', ...PAGA }, { id: 'susp', ...fila({ suspendido_en: hace(DIA) }) }]);
  assert.equal(await motivoSinVentaExternaDe(cliente, 'paga', AHORA), null);
  assert.equal(await motivoSinVentaExternaDe(cliente, 'susp', AHORA), 'suspendido');
  assert.equal(await motivoSinVentaExternaDe(cliente, 'no-existe', AHORA), 'error');
  const { cliente: roto } = clienteFalso([], { error: 'timeout' });
  assert.equal(await motivoSinVentaExternaDe(roto, 'paga', AHORA), 'error');
});

test('un cron: solo los que no venden, sin repetir ni pasarse del tamaño de un lote; si la lectura falla, se lanza', async () => {
  const filas: FilaConId[] = Array.from({ length: 450 }, (_, i) => ({ id: `e${i}`, ...PAGA }));
  filas[7] = { id: 'e7', ...fila({ contrato_terminado_en: hace(DIA) }) };
  filas[300] = { id: 'e300', ...pruebaLocal({ trial_ends_at: hace(DIA) }) };
  const { cliente, lotes } = clienteFalso(filas);
  const sin = await estudiosSinVentaExterna(cliente, [...filas.map(f => f.id), 'e7', 'e7'], AHORA);
  assert.deepEqual([...sin.entries()].sort(), [['e300', 'prueba_vencida'], ['e7', 'baja']]);
  assert.deepEqual(lotes.map(l => l.length), [200, 200, 50]);

  const { cliente: roto } = clienteFalso(filas, { error: 'timeout' });
  await assert.rejects(estudiosSinVentaExterna(roto, ['e1'], AHORA), /contrato de los estudios: timeout/);
});

// ── Puertas (ficheros que `node --test` no puede cargar) ────────────────────

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (p: string) => sinComentarios(readFileSync(join(raiz, p), 'utf8'));

function codigo(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(raiz, rel)).isDirectory()) codigo(rel, acc);
    else if (/\.tsx?$/.test(e) && !e.endsWith('.test.ts')) acc.push(rel);
  }
  return acc;
}

test('⚠️ toda reserva que la plataforma hace SOLA (`p_exigir_cupo: true`) pregunta antes si el estudio vende fuera', () => {
  const puertas = [...codigo('lib'), ...codigo('app')].filter(f => /p_exigir_cupo:\s*true/.test(leer(f)));
  // USC (Instant Booking) y Wellhub (reserva pedida), hoy; la próxima plataforma por API, también.
  assert.ok(puertas.length >= 2, `solo ${puertas.length} puertas: ¿ha cambiado la llamada a la RPC?`);
  for (const f of puertas) {
    const s = leer(f);
    const pregunta = s.indexOf('motivoSinVentaExternaDe(admin, ');
    const reserva = s.indexOf("admin.rpc('reservar_plaza_externa'");
    assert.ok(pregunta > 0 && reserva > pregunta, `${f}: la reserva tiene que ir después de preguntar`);
  }
});

test('webhooks: sin venta se rechaza como con la integración apagada, y si no se pudo leer, como un fallo de la BD', () => {
  const usc = leer('lib/plataformas/usc/instant-booking-servidor.ts');
  assert.match(usc, /if \(sinVenta === 'error'\) return \{ ok: false, motivo: 'error-interno'/);
  assert.match(usc, /if \(!integracion\?\.activo \|\| sinVenta\) return \{ ok: false, motivo: 'clase-no-existe' \};/);
  const wh = leer('lib/plataformas/wellhub/servidor.ts');
  assert.match(wh, /if \(conexion === 'error' \|\| integracion\.error \|\| sinVenta === 'error'\) return \{ tipo: 'error'/);
  assert.match(wh, /if \(!conexion \|\| conexion\.gymId !== e\.gymId \|\| !integracion\.data\?\.activo \|\| sinVenta\) \{\s*return \{ tipo: 'rechazada'/);
});

test('crons: un estudio sin venta se trata como «no publica» y se le retira lo publicado por el camino de apagar', () => {
  const usc = leer('lib/plataformas/usc/horario-servidor.ts');
  assert.match(usc, /const sinVenta = await estudiosSinVentaExterna\(admin, /);
  assert.match(usc, /if \(!intg\.activo \|\| !uscPublicaPorApi\(config\) \|\| sinVenta\.has\(intg\.studio_id\)\) \{\s*await retirarTodo\(/);
  // Los nombres de las instructoras se reescriben antes, también sin venta (anonimizar).
  assert.ok(usc.indexOf('await renombrarTrainers(') < usc.indexOf('sinVenta.has(intg.studio_id)'));
  const wh = leer('lib/plataformas/wellhub/horario-servidor.ts');
  assert.match(wh, /const sinVenta = await estudiosSinVentaExterna\(admin, estudios, ahora\);/);
  assert.match(wh, /const publicar = !!c && vende\.has\(studioId\) && !sinVenta\.has\(studioId\) && /);
});

test('panel: Conexiones dice que está en pausa en vez de «van solos», con el estudio de la sesión', () => {
  const ruta = leer('app/api/integrations/config/route.ts');
  assert.match(ruta, /motivoSinVentaExternaDe\(admin, sesion\.studioId\)/);
  assert.match(ruta, /ventaCortada: corte === 'error' \? null : corte/);
  const pantalla = leer('components/configuracion/plataformas-externas.tsx');
  assert.match(pantalla, /ventaCortada: p === USC \? usc\?\.ventaCortada : null/);
  assert.match(pantalla, /porApi && cortada \? `Vendo aquí · en pausa: /);
  assert.match(pantalla, /conectada && ventaCortada\s*\? `En pausa: /);
});
