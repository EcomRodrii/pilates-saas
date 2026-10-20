// Las lecturas a Supabase de las herramientas del asistente que NO dependen entre
// sí van a la vez. Se prueba con el cliente falso y una latencia simulada: lo que
// se mide es cuántas lecturas hay en vuelo a la vez (el «pico») y cuántas rondas
// de latencia hacen falta, no milisegundos de reloj (que bailan con la carga).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supabaseFalso } from '../db/supabase-falso.ts';
import { cargarClientasServidor } from '../clientas/estado-servidor.ts';
import { sesionesYReservasDelRango } from '../calendario/rango-servidor.ts';

const ST = 'st-1';

/** Cada lectura tarda `ms`; apunta el orden de inicio/fin y el pico de lecturas a la vez. */
function conLatencia(tablas: Record<string, Record<string, unknown>[]>, ms = 15) {
  const { admin, consultas } = supabaseFalso(tablas);
  const orden: string[] = [];
  let vivas = 0;
  let pico = 0;
  const from = admin.from.bind(admin) as (t: string) => { then: (ok: unknown, ko: unknown) => unknown };
  (admin as unknown as { from: unknown }).from = (tabla: string) => {
    const q = from(tabla);
    const th = q.then.bind(q) as (ok: unknown, ko: unknown) => Promise<unknown>;
    q.then = (ok: unknown, ko: unknown) => {
      vivas++; pico = Math.max(pico, vivas); orden.push(`ini:${tabla}`);
      return new Promise(r => setTimeout(r, ms)).then(() => { vivas--; orden.push(`fin:${tabla}`); return th(ok, ko); }).then(ok as never, ko as never);
    };
    return q;
  };
  return { admin, consultas, orden, pico: () => pico };
}

test('cargarClientasServidor: las clases del estudio se leen a la vez que socias, planes y reservas (una ronda, no dos)', async () => {
  const { admin, orden, pico } = conLatencia({
    socios: [{ id: 'so-1', studio_id: ST, activo: true, fecha_alta: '2026-01-01', lead_stage: null, borrado_en: null }],
    suscripciones: [], planes_tarifa: [], reservas: [{ id: 'r-1', studio_id: ST, socio_id: 'so-1', sesion_id: 'se-1', estado: 'ASISTIDA' }],
    sesiones: [{ id: 'se-1', studio_id: ST, inicio: '2026-10-01T10:00:00Z' }, { id: 'se-ajena', studio_id: 'st-2', inicio: '2026-10-01T10:00:00Z' }],
  });
  const r = await cargarClientasServidor(admin, ST, { ahora: new Date('2026-10-20T10:00:00Z') });
  assert.ok(r);
  assert.equal(r.fichas.length, 1);
  assert.equal(r.hechos.get('so-1')?.ultimaAsistida != null || r.hechos.has('so-1'), true, 'sigue calculando los hechos con las clases leídas');
  assert.equal(pico(), 5, 'las cinco lecturas en vuelo a la vez');
  assert.ok(orden.indexOf('ini:sesiones') < orden.indexOf('fin:socios'), 'sesiones empieza antes de que termine la primera lectura');
});

test('cargarClientasServidor: con una lectura fallida devuelve null (no «no hay clientas»)', async () => {
  const { admin } = supabaseFalso({ socios: [], suscripciones: [], planes_tarifa: [], reservas: [], sesiones: [] }, { fallan: ['sesiones'] });
  assert.equal(await cargarClientasServidor(admin, ST, { ahora: new Date() }), null);
});

test('sesionesYReservasDelRango: los lotes de 100 clases van de cuatro en cuatro y siguen acotados al estudio', async () => {
  const sesiones = Array.from({ length: 450 }, (_, i) => ({
    id: `se-${String(i).padStart(3, '0')}`, studio_id: ST, tipo_clase_id: null, sala_id: null, instructor_id: null,
    inicio: '2026-10-05T10:00:00Z', fin: '2026-10-05T11:00:00Z', aforo_maximo: 10, cancelada: false, incidencia_texto: null,
  }));
  const reservas = sesiones.map((s, i) => ({ id: `r-${i}`, studio_id: ST, sesion_id: s.id, socio_id: 'so-1', estado: 'CONFIRMADA' }));
  const { admin, consultas, pico } = conLatencia({ sesiones, reservas, sustituciones: [], tipos_clase: [], salas: [] });
  const r = await sesionesYReservasDelRango(admin, ST, '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z');
  assert.ok(r);
  assert.equal(r.reservas.length, 450, 'ninguna reserva se pierde al leer los lotes a la vez');
  assert.equal(pico(), 8, '4 lotes × 2 lecturas, nunca todos de golpe');
  for (const c of consultas) assert.ok(c.eqs.includes(`studio_id=${ST}`), `${c.tabla} sin acotar al estudio`);
});

test('sesionesYReservasDelRango: si falla la lectura de un lote, null', async () => {
  const sesiones = Array.from({ length: 150 }, (_, i) => ({ id: `se-${i}`, studio_id: ST, inicio: '2026-10-05T10:00:00Z', fin: '2026-10-05T11:00:00Z', aforo_maximo: 1, cancelada: false }));
  const { admin } = supabaseFalso({ sesiones, reservas: [], sustituciones: [], tipos_clase: [], salas: [] }, { fallan: ['reservas'] });
  assert.equal(await sesionesYReservasDelRango(admin, ST, '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'), null);
});

// `facturacion_del_periodo` y `que_revisar_hoy` importan con el alias `@/…` (que `node --test` no resuelve): su
// paralelismo se vigila aquí sobre el código, y se midió en vivo con el cliente falso (ver el PR).
test('facturacion_del_periodo pide el catálogo de planes a la vez que los recibos, y los lotes de suscripciones a la vez', () => {
  const src = readFileSync(new URL('./herramientas/dinero.ts', import.meta.url), 'utf8');
  assert.match(src, /Promise\.all\(\[\s*recibosCobradosEnTramo\([^)]*\)[^,]*,\s*leerPlanes\(ctx\),\s*\]\)/);
  assert.match(src, /Promise\.all\(lotes\.map\(/);
});

test('que_revisar_hoy pide el mensaje del día a la vez que los conteos de la bandeja', () => {
  const src = readFileSync(new URL('./herramientas/estudio.ts', import.meta.url), 'utf8');
  assert.match(src, /Promise\.all\(\[\s*contarConteosEstudio\([^)]*\),\s*verMensaje \? dbGetMensajeDia\(ctx\.studioId, ctx\.hoy\)/);
});
