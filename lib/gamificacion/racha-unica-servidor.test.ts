import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cargarRachaUnica, hechosDeFilas } from './racha-unica-servidor.ts';
import { calcularRachaUnica, type HechoClase } from '../engines/streak-engine.ts';
import { masDias } from '../utils.ts';

// Doble mínimo del cliente de Supabase: guarda tablas en memoria y aplica los filtros que usa el cargador.
type Fila = Record<string, unknown>;
function adminFalso(tablas: Record<string, Fila[]>) {
  const consultas: { tabla: string; filtros: string[] }[] = [];
  const from = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = [];
    const nombres: string[] = [];
    let cuenta = false;
    const q = {
      select(_c: string, opts?: { count?: string; head?: boolean }) { cuenta = !!opts?.head; return q; },
      eq(col: string, v: unknown) { nombres.push(`eq:${col}`); filtros.push((f) => f[col] === v); return q; },
      in(col: string, vs: unknown[]) { nombres.push(`in:${col}`); filtros.push((f) => vs.includes(f[col])); return q; },
      not(col: string, _op: string, v: unknown) { nombres.push(`not:${col}`); filtros.push((f) => f[col] !== v); return q; },
      gte(col: string, v: string) { nombres.push(`gte:${col}`); filtros.push((f) => (f[col] as string) >= v); return q; },
      lt(col: string, v: string) { nombres.push(`lt:${col}`); filtros.push((f) => (f[col] as string) < v); return q; },
      then(res: (v: unknown) => unknown) {
        consultas.push({ tabla, filtros: nombres });
        const filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
        return Promise.resolve(cuenta ? { count: filas.length, data: null, error: null } : { data: filas, error: null }).then(res);
      },
    };
    return q;
  };
  return { from, consultas };
}

const S = 'est-1';
const YO = 'socia-1';
const NOW = new Date('2026-10-20T09:00:00Z'); // martes

// Cinco semanas (lunes 09-14 … 10-12) con clase el martes; la de 09-28 la pierde (no asiste).
const lunes = (i: number) => masDias('2026-09-14', 7 * i);
const sesion = (i: number, extra: Fila = {}): Fila => ({ id: `s${i}`, studio_id: S, inicio: `${masDias(lunes(i), 1)}T17:00:00Z`, cancelada: false, ...extra });

test('cargarRachaUnica da lo mismo que la función única sobre las mismas clases (paridad servidor ↔ motor)', async () => {
  const sesiones = [0, 1, 2, 3, 4].map((i) => sesion(i));
  const reservas: Fila[] = [0, 1, 3, 4].map((i) => ({ studio_id: S, socio_id: YO, sesion_id: `s${i}`, estado: 'ASISTIDA', cancelada_tardia: null }));
  const admin = adminFalso({ sesiones, reservas, cierres_estudio: [], suscripciones: [], plazas_fijas: [], congelaciones: [] });
  const delServidor = await cargarRachaUnica(admin, S, YO, NOW);

  const clases: HechoClase[] = [0, 1, 3, 4].map((i) => ({ inicio: sesiones[i].inicio as string, estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true }));
  const directo = calcularRachaUnica({ clases, cierres: [], pausas: [], semanasSinClases: new Set(), now: NOW });
  assert.deepEqual(delServidor, directo);
  // La 3.ª semana (09-28) falla con racha 2 y sin respiro (se gana con la 4.ª completa, después): vuelve a 0 y suman 2.
  assert.equal(delServidor.semanas, 2);
});

test('una semana en la que el estudio no dio ninguna clase es neutra (se pregunta solo por las candidatas)', async () => {
  const sesiones = [0, 1, 3, 4].map((i) => sesion(i)); // la semana 2 no tiene NINGUNA clase en el estudio
  const reservas: Fila[] = [0, 1, 3, 4].map((i) => ({ studio_id: S, socio_id: YO, sesion_id: `s${i}`, estado: 'ASISTIDA', cancelada_tardia: null }));
  const admin = adminFalso({ sesiones, reservas });
  const r = await cargarRachaUnica(admin, S, YO, NOW);
  assert.equal(r.semanas, 4);
  const preguntasDeClases = admin.consultas.filter((c) => c.tabla === 'sesiones' && c.filtros.includes('gte:inicio'));
  assert.equal(preguntasDeClases.length, 1, 'una sola semana sin explicación');
});

test('cierre del estudio, congelación y plaza en pausa salen de sus tablas', async () => {
  const sesiones = [0, 1, 2, 3, 4].map((i) => sesion(i));
  const reservas: Fila[] = [0, 4].map((i) => ({ studio_id: S, socio_id: YO, sesion_id: `s${i}`, estado: 'ASISTIDA', cancelada_tardia: null }));
  const admin = adminFalso({
    sesiones, reservas,
    cierres_estudio: [{ studio_id: S, desde: lunes(1), hasta: lunes(1) }],
    suscripciones: [{ id: 'sub-1', studio_id: S, socio_id: YO }],
    congelaciones: [{ studio_id: S, suscripcion_id: 'sub-1', desde: masDias(lunes(2), 2), hasta: masDias(lunes(2), 3) }],
    plazas_fijas: [{ studio_id: S, socio_id: YO, pausa_desde: lunes(3), pausa_hasta: null }],
  });
  const r = await cargarRachaUnica(admin, S, YO, NOW);
  assert.equal(r.semanas, 2);
  assert.deepEqual(r.detalle.slice(0, 5).map((d) => d.causa), [null, 'cierre', 'pausa', 'pausa', null]);
});

test('no-show: con lista pasada es falta; sin lista es neutra (lo dice si alguien más figura ASISTIDA)', async () => {
  const sesiones = [0, 1, 2].map((i) => sesion(i));
  const base = (otraAsistida: boolean): Fila[] => [
    { studio_id: S, socio_id: YO, sesion_id: 's0', estado: 'ASISTIDA', cancelada_tardia: null },
    { studio_id: S, socio_id: YO, sesion_id: 's1', estado: 'NO_ASISTIO', cancelada_tardia: null },
    ...(otraAsistida ? [{ studio_id: S, socio_id: 'otra', sesion_id: 's1', estado: 'ASISTIDA', cancelada_tardia: null }] : []),
    { studio_id: S, socio_id: YO, sesion_id: 's2', estado: 'ASISTIDA', cancelada_tardia: null },
  ];
  const ahora = new Date('2026-10-05T09:00:00Z');
  const conLista = await cargarRachaUnica(adminFalso({ sesiones, reservas: base(true) }), S, YO, ahora);
  const sinLista = await cargarRachaUnica(adminFalso({ sesiones, reservas: base(false) }), S, YO, ahora);
  assert.equal(conLista.semanas, 1); // falta real, sin respiro: vuelve a 0 y suma la 3.ª
  assert.equal(sinLista.semanas, 2); // clase sin lista: neutra (no suma, no rompe)
});

test('un fallo de lectura NO se convierte en racha 0: lanza', async () => {
  const roto = { from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lt']) q[m] = () => q; q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caído' } }).then(r); return q; } };
  await assert.rejects(() => cargarRachaUnica(roto, S, YO, NOW), /no se pudo leer/);
});

test('hechosDeFilas ignora reservas de clases que no se han podido leer', () => {
  const h = hechosDeFilas({
    reservas: [{ sesion_id: 'x', estado: 'ASISTIDA', cancelada_tardia: null }],
    sesiones: [], sesionesConLista: new Set(), cierres: [], pausas: [],
  });
  assert.deepEqual(h, []);
});
