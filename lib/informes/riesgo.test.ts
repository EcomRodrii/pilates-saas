import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HechosAsistencia, ResultadoEstado } from '../clientas/estado.ts';
import { ENLACE_ACTIVAS_SIN_VENIR, ENLACE_SIN_RENOVAR, clientasEnRiesgo } from './riesgo.ts';

const AHORA = new Date('2026-10-15T10:00:00Z');
const est = (estado: ResultadoEstado['estado'], desde: string | null = null): ResultadoEstado =>
  ({ estado, desde, nueva: false, derecho: estado === 'ACTIVA', primeraCompraReal: null });
const vino = (ultimaAsistencia: string | null): HechosAsistencia => ({ ultimaAsistencia, primeraReserva: ultimaAsistencia });

test('sin renovar es el estado del chip; activas sin venir, ACTIVA y más de 30 días sin venir', () => {
  const socios = [
    { id: 'sr-vieja', fechaAlta: '2026-01-01' },
    { id: 'sr-nueva', fechaAlta: '2026-01-01' },
    { id: 'act-lejos', fechaAlta: '2026-01-01' },
    { id: 'act-mas-lejos', fechaAlta: '2026-01-01' },
    { id: 'act-viene', fechaAlta: '2026-01-01' },
    { id: 'inactiva', fechaAlta: '2026-01-01' },
    { id: 'baja', fechaAlta: '2026-01-01' },
  ];
  const porSocio = new Map<string, ResultadoEstado>([
    ['sr-vieja', est('SIN_RENOVAR', '2026-08-20')],
    ['sr-nueva', est('SIN_RENOVAR', '2026-10-01')],
    ['act-lejos', est('ACTIVA')],
    ['act-mas-lejos', est('ACTIVA')],
    ['act-viene', est('ACTIVA')],
    ['inactiva', est('INACTIVA')],
    ['baja', est('DE_BAJA')],
  ]);
  const hechos = new Map<string, HechosAsistencia>([
    ['act-lejos', vino('2026-09-01T09:00:00Z')],
    ['act-mas-lejos', vino('2026-07-01T09:00:00Z')],
    ['act-viene', vino('2026-10-10T09:00:00Z')],
    ['inactiva', vino('2026-03-01T09:00:00Z')],
    ['baja', vino('2026-02-01T09:00:00Z')],
  ]);
  const r = clientasEnRiesgo(socios, porSocio, hechos, AHORA);
  assert.deepEqual(r.sinRenovar.map(c => c.socioId), ['sr-nueva', 'sr-vieja'], 'la más reciente primero');
  assert.deepEqual(r.activasSinVenir.map(c => c.socioId), ['act-mas-lejos', 'act-lejos'], 'la que más lleva sin venir primero');
  // Ni la inactiva ni la de baja: ya no se las está perdiendo.
  assert.ok(!r.activasSinVenir.some(c => c.socioId === 'inactiva' || c.socioId === 'baja'));
});

test('una activa que nunca ha venido cuenta desde su alta, como en Clientas', () => {
  const r = clientasEnRiesgo(
    [{ id: 'nunca', fechaAlta: '2026-08-01' }, { id: 'recien', fechaAlta: '2026-10-10' }],
    new Map([['nunca', est('ACTIVA')], ['recien', est('ACTIVA')]]),
    new Map(),
    AHORA,
  );
  assert.deepEqual(r.activasSinVenir.map(c => c.socioId), ['nunca']);
});

test('los enlaces llevan a los filtros que Clientas sabe leer de la URL', () => {
  const pagina = readFileSync(new URL('../../app/(dashboard)/clientas/page.tsx', import.meta.url), 'utf8');
  assert.match(pagina, /p\.get\('estado'\)/);
  assert.match(pagina, /const mas = p\.get\('mas'\)/);
  assert.match(pagina, /'sin_venir_30d'/);
  assert.equal(ENLACE_SIN_RENOVAR, '/clientas?estado=SIN_RENOVAR');
  assert.equal(ENLACE_ACTIVAS_SIN_VENIR, '/clientas?estado=ACTIVA&mas=sin_venir_30d');
});
