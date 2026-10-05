import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGLAS } from '../notifications/catalog.ts';
import { EVENTOS_DE_ALUMNA } from './tipo-aviso.ts';
import {
  accionDeAviso, agruparAvisosPorDia, filtrarAvisos, filtroDeAviso, grupoDeDia, iconoDeAviso, plazoDeOferta,
} from './avisos-vista.ts';

// ── Filtros ──────────────────────────────────────────────────────────────────

test('cada evento de alumna cae en su filtro por la categoría REAL del catálogo', () => {
  for (const ev of EVENTOS_DE_ALUMNA) {
    const regla = REGLAS[ev];
    if (!regla) continue;
    const f = filtroDeAviso(regla.category, ev);
    if (ev.startsWith('reserva.') || ev.startsWith('clase.') || ev.startsWith('clase_fija.') || ev.startsWith('plaza_fija.')) {
      assert.equal(f, 'reservas', `${ev} (${regla.category})`);
    }
    if (ev.startsWith('pago.') || ev.startsWith('bono.') || ev.startsWith('renovacion.') || ev.startsWith('suscripcion.')) {
      assert.equal(f, 'pagos', `${ev} (${regla.category})`);
    }
  }
});

test('lo que cuenta el estudio (tablón, mensajes, campañas) va a «Del estudio»', () => {
  assert.equal(filtroDeAviso('marketing', 'comunidad.post_nuevo'), 'estudio');
  assert.equal(filtroDeAviso('mensajeria', 'mensaje.recibido'), 'estudio');
});

test('sin categoría, se mira el prefijo del evento; sin nada, «Del estudio»', () => {
  assert.equal(filtroDeAviso(null, 'reserva.confirmada'), 'reservas');
  assert.equal(filtroDeAviso(undefined, 'bono.agotado'), 'pagos');
  assert.equal(filtroDeAviso(null, null), 'estudio');
});

test('«Todo» no quita nada y los demás filtran', () => {
  const avisos = [
    { id: 1, categoria: 'reservas', evento: 'reserva.confirmada' },
    { id: 2, categoria: 'pagos', evento: 'bono.agotado' },
    { id: 3, categoria: 'marketing', evento: 'comunidad.post_nuevo' },
  ];
  assert.equal(filtrarAvisos(avisos, 'todo').length, 3);
  assert.deepEqual(filtrarAvisos(avisos, 'pagos').map((a) => a.id), [2]);
  assert.deepEqual(filtrarAvisos(avisos, 'estudio').map((a) => a.id), [3]);
});

// ── Por días ─────────────────────────────────────────────────────────────────

test('Hoy, Ayer, Esta semana (desde el lunes) y Antes', () => {
  // Jueves 15 de octubre de 2026.
  assert.equal(grupoDeDia('2026-10-15', '2026-10-15'), 'Hoy');
  assert.equal(grupoDeDia('2026-10-14', '2026-10-15'), 'Ayer');
  assert.equal(grupoDeDia('2026-10-12', '2026-10-15'), 'Esta semana');
  assert.equal(grupoDeDia('2026-10-11', '2026-10-15'), 'Antes', 'el domingo es de la semana pasada');
  // Un lunes: el domingo es «Ayer», el sábado ya es «Antes».
  assert.equal(grupoDeDia('2026-10-11', '2026-10-12'), 'Ayer');
  assert.equal(grupoDeDia('2026-10-10', '2026-10-12'), 'Antes');
});

test('agrupa lo más nuevo primero y con el día de la ZONA DEL ESTUDIO, no el de UTC', () => {
  const diaMadrid = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
  const avisos = [
    { id: 'viejo', fecha: '2026-10-01T09:00:00Z' },
    // 23:30 UTC del 14 = 01:30 del 15 en Madrid: es de HOY, no de ayer.
    { id: 'madrugada', fecha: '2026-10-14T23:30:00Z' },
    { id: 'ayer', fecha: '2026-10-14T10:00:00Z' },
    { id: 'hoy', fecha: '2026-10-15T08:00:00Z' },
  ];
  const g = agruparAvisosPorDia(avisos, '2026-10-15', diaMadrid);
  assert.deepEqual(g.map((x) => x.grupo), ['Hoy', 'Ayer', 'Antes']);
  assert.deepEqual(g[0].items.map((x) => x.id), ['hoy', 'madrugada']);
});

// ── Botones ──────────────────────────────────────────────────────────────────

test('qué botón lleva cada aviso', () => {
  assert.equal(accionDeAviso('reserva.oferta_lista_espera'), 'aceptar-oferta');
  assert.equal(accionDeAviso('bono.por_caducar'), 'renovar');
  assert.equal(accionDeAviso('bono.agotado'), 'renovar');
  assert.equal(accionDeAviso('reserva.confirmada'), 'calendario');
  assert.equal(accionDeAviso('reserva.plaza_liberada'), 'calendario');
  assert.equal(accionDeAviso('reserva.cancelada'), null);
  assert.equal(accionDeAviso('clase.sustituta'), null);
  assert.equal(accionDeAviso(null), null);
});

test('los eventos con botón existen en el catálogo y son de la alumna', () => {
  for (const ev of ['reserva.oferta_lista_espera', 'bono.por_caducar', 'bono.agotado', 'reserva.confirmada', 'reserva.plaza_liberada']) {
    assert.ok(REGLAS[ev], ev);
    assert.ok(EVENTOS_DE_ALUMNA.has(ev), ev);
  }
});

test('el plazo de la oferta: hasta qué hora y cuánto queda; caducada, nada', () => {
  const hora = () => '18:36';
  const ahora = new Date('2026-10-05T16:12:00Z').getTime();
  assert.equal(plazoDeOferta('2026-10-05T16:36:00Z', ahora, hora), 'Tienes hasta las 18:36 · quedan 24 min');
  assert.equal(plazoDeOferta('2026-10-05T17:42:00Z', ahora, hora), 'Tienes hasta las 18:36 · quedan 1 h 30 min');
  assert.equal(plazoDeOferta('2026-10-05T16:12:00Z', ahora, hora), null);
  assert.equal(plazoDeOferta('no es fecha', ahora, hora), null);
});

// ── Iconos ───────────────────────────────────────────────────────────────────

test('todo icono que se pide existe en el set (`Icono.tsx`), y «Cambio de profesora» lleva el de instructoras', () => {
  const set = readFileSync(join(process.cwd(), 'components/student/ui/Icono.tsx'), 'utf8');
  const tipos = ['plaza-liberada', 'recordatorio', 'bono', 'estudio', 'valorar', 'atencion'];
  const nombres = new Set([...EVENTOS_DE_ALUMNA, 'mensaje.recibido', 'otro.cualquiera'].flatMap((ev) => tipos.map((t) => iconoDeAviso(ev, t))));
  for (const n of nombres) assert.match(set, new RegExp(`^\\s+'?${n}'?:\\s*\\[`, 'm'), `falta el icono «${n}»`);
  assert.equal(iconoDeAviso('clase.sustituta', 'estudio'), 'instructoras');
});
