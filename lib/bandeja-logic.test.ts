// Tests de la bandeja diaria (F2 · B2.9). Lógica pura, runner nativo: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Recuperacion, Recibo, Sesion, Reserva, BloqueoMaquina, PlazaFija, SocioExcepcion, Socio, Sala,
} from '@/lib/types';
import { construirBandeja, type EntradaBandeja } from './bandeja-logic.ts';

// Ahora de referencia: miércoles 2026-07-15 09:00 UTC.
const AHORA = Date.parse('2026-07-15T09:00:00Z');

// ── Factories mínimas ─────────────────────────────────────────────────────────
const socio = (id: string, nombre: string, apellidos = ''): Socio => ({ id, nombre, apellidos } as unknown as Socio);
const sala = (id: string, nombre: string): Sala => ({ id, nombre } as unknown as Sala);

function recup(p: Partial<Recuperacion> & Pick<Recuperacion, 'id' | 'socioId' | 'caducaEl'>): Recuperacion {
  return { studioId: 'e1', origenReservaId: null, motivo: null, estado: 'DISPONIBLE', usadaEnReservaId: null, creadaEn: '2026-07-01T00:00:00Z', ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'id'>): Recibo {
  return { studioId: 'e1', socioId: 's1', suscripcionId: null, concepto: 'Cuota mensual', importe: 50, estado: 'PENDIENTE', fechaVencimiento: '2026-07-10', fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'salaId' | 'inicio' | 'fin'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 't1', instructorId: 'i1', aforoMaximo: 6, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'id' | 'sesionId' | 'socioId'>): Reserva {
  return { studioId: 'e1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-07-01T00:00:00Z', ...p };
}
function bloqueo(p: Partial<BloqueoMaquina> & Pick<BloqueoMaquina, 'id' | 'salaId' | 'desde'>): BloqueoMaquina {
  return { studioId: 'e1', spotId: null, hasta: null, motivo: null, creadoEn: '2026-07-01T00:00:00Z', ...p };
}
function plaza(p: Partial<PlazaFija> & Pick<PlazaFija, 'id' | 'socioId'>): PlazaFija {
  return { studioId: 'e1', diaSemana: 4, horaInicio: '10:00', salaId: 'sala1', tipoClaseId: null, spotId: null, vigenciaDesde: '2026-07-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-07-01T00:00:00Z', ...p };
}
function exc(socioId: string, tipo: string): SocioExcepcion {
  return { id: `e-${socioId}-${tipo}`, studioId: 'e1', socioId, tipo, motivo: null, creadaEn: '2026-07-01T00:00:00Z' };
}

function entrada(over: Partial<EntradaBandeja>): EntradaBandeja {
  return {
    ahoraMs: AHORA,
    recuperaciones: [], recibos: [], plazasFijas: [], bloqueosMaquina: [],
    sesiones: [], reservas: [],
    socios: [socio('s1', 'Ana', 'García')], salas: [sala('sala1', 'Reformer')], excepciones: [],
    ...over,
  };
}

// ── Recuperaciones ────────────────────────────────────────────────────────────
test('recuperación DISPONIBLE que caduca dentro de 7 días entra', () => {
  const b = construirBandeja(entrada({ recuperaciones: [recup({ id: 'r1', socioId: 's1', caducaEl: '2026-07-18' })] }));
  assert.equal(b.length, 1);
  assert.equal(b[0].categoria, 'RECUPERACION');
  assert.match(b[0].titulo, /caduca en 3 días/);
  assert.equal(b[0].href, '/clientas/s1');
  assert.match(b[0].detalle, /Ana García/);
});

test('recuperación ya caducada, lejana o no DISPONIBLE no entra', () => {
  const b = construirBandeja(entrada({ recuperaciones: [
    recup({ id: 'r1', socioId: 's1', caducaEl: '2026-07-14' }),                 // -1 día
    recup({ id: 'r2', socioId: 's1', caducaEl: '2026-08-01' }),                 // muy lejos
    recup({ id: 'r3', socioId: 's1', caducaEl: '2026-07-18', estado: 'USADA' }), // ya usada
  ] }));
  assert.equal(b.length, 0);
});

// ── Cobros ────────────────────────────────────────────────────────────────────
test('un cobro pendiente entra con nombre; la excepción SIN_RECORDATORIO lo exime', () => {
  const base = { recibos: [recibo({ id: 'rc1', socioId: 's1', importe: 50, fechaVencimiento: '2026-07-10' })] };
  const con = construirBandeja(entrada(base));
  assert.equal(con.length, 1);
  assert.equal(con[0].categoria, 'COBRO');
  assert.match(con[0].detalle, /Ana García/);
  assert.match(con[0].titulo, /vencido/i); // vto 10 < ahora 15

  const exento = construirBandeja(entrada({ ...base, excepciones: [exc('s1', 'SIN_RECORDATORIO')] }));
  assert.equal(exento.length, 0);
});

test('varios cobros pendientes se agregan en un solo item', () => {
  const b = construirBandeja(entrada({ recibos: [
    recibo({ id: 'rc1', socioId: 's1', importe: 50, fechaVencimiento: '2026-07-10' }),
    recibo({ id: 'rc2', socioId: 's2', importe: 30, fechaVencimiento: '2026-07-12' }),
  ] }));
  assert.equal(b.length, 1);
  assert.equal(b[0].id, 'cobro-lote');
  assert.match(b[0].titulo, /2 cobros pendientes/);
  assert.match(b[0].detalle, /80,00/);
});

// ── Avería (overflow) ─────────────────────────────────────────────────────────
test('overflow por avería entra; sin avería no', () => {
  const ses = sesion({ id: 'ses1', salaId: 'sala1', inicio: '2026-07-15T10:00:00Z', fin: '2026-07-15T11:00:00Z', aforoMaximo: 6 });
  const seis = Array.from({ length: 6 }, (_, i) => reserva({ id: `x${i}`, sesionId: 'ses1', socioId: `s${i}` }));
  const bloq = bloqueo({ id: 'b1', salaId: 'sala1', desde: '2026-07-15T09:00:00Z', hasta: '2026-07-15T12:00:00Z' });

  const con = construirBandeja(entrada({ sesiones: [ses], reservas: seis, bloqueosMaquina: [bloq] }));
  assert.equal(con.length, 1);
  assert.equal(con[0].categoria, 'AVERIA');
  assert.match(con[0].titulo, /1 reserva sin sitio/);

  const sin = construirBandeja(entrada({ sesiones: [ses], reservas: seis })); // sin avería → cabe
  assert.equal(sin.length, 0);
});

test('sesión más allá de 72 h no cuenta para la avería', () => {
  const lejana = sesion({ id: 'ses9', salaId: 'sala1', inicio: '2026-07-20T10:00:00Z', fin: '2026-07-20T11:00:00Z', aforoMaximo: 6 });
  const seis = Array.from({ length: 6 }, (_, i) => reserva({ id: `x${i}`, sesionId: 'ses9', socioId: `s${i}` }));
  const bloq = bloqueo({ id: 'b1', salaId: 'sala1', desde: '2026-07-20T09:00:00Z', hasta: '2026-07-20T12:00:00Z' });
  const b = construirBandeja(entrada({ sesiones: [lejana], reservas: seis, bloqueosMaquina: [bloq] }));
  assert.equal(b.length, 0);
});

// ── Plaza fija sin clase ──────────────────────────────────────────────────────
test('plaza fija ACTIVA sin reserva materializada futura entra (pasada la gracia)', () => {
  const p = plaza({ id: 'p1', socioId: 's1', vigenciaDesde: '2026-07-01', creadaEn: '2026-07-01T00:00:00Z' });
  const b = construirBandeja(entrada({ plazasFijas: [p] }));
  assert.equal(b.length, 1);
  assert.equal(b[0].categoria, 'PLAZA');
  assert.equal(b[0].href, '/clientas/s1');
});

test('plaza con reserva materializada (res-pf-) futura no entra', () => {
  const p = plaza({ id: 'p1', socioId: 's1', vigenciaDesde: '2026-07-01', creadaEn: '2026-07-01T00:00:00Z' });
  const ses = sesion({ id: 'sesF', salaId: 'sala1', inicio: '2026-07-16T10:00:00Z', fin: '2026-07-16T11:00:00Z' });
  const rpf = reserva({ id: 'res-pf-abc', sesionId: 'sesF', socioId: 's1' });
  const b = construirBandeja(entrada({ plazasFijas: [p], sesiones: [ses], reservas: [rpf] }));
  assert.equal(b.length, 0);
});

test('plaza recién creada (dentro de la gracia del cron) no entra', () => {
  const p = plaza({ id: 'p1', socioId: 's1', vigenciaDesde: '2026-07-14', creadaEn: '2026-07-15T00:00:00Z' }); // 9 h antes de AHORA < 36 h
  const b = construirBandeja(entrada({ plazasFijas: [p] }));
  assert.equal(b.length, 0);
});

test('plaza PAUSADA no entra', () => {
  const p = plaza({ id: 'p1', socioId: 's1', estado: 'PAUSADA', creadaEn: '2026-07-01T00:00:00Z' });
  const b = construirBandeja(entrada({ plazasFijas: [p] }));
  assert.equal(b.length, 0);
});

// ── Tope de 5 + orden ─────────────────────────────────────────────────────────
test('la bandeja nunca supera 5 y ordena por urgencia (avería primera)', () => {
  const recs = Array.from({ length: 8 }, (_, i) => recup({ id: `r${i}`, socioId: 's1', caducaEl: '2026-07-16' }));
  const ses = sesion({ id: 'ses1', salaId: 'sala1', inicio: '2026-07-15T10:00:00Z', fin: '2026-07-15T11:00:00Z', aforoMaximo: 2 });
  const bloq = bloqueo({ id: 'b1', salaId: 'sala1', desde: '2026-07-15T09:00:00Z', hasta: '2026-07-15T12:00:00Z' });
  const dos = Array.from({ length: 2 }, (_, i) => reserva({ id: `x${i}`, sesionId: 'ses1', socioId: `s${i}` }));

  const b = construirBandeja(entrada({ recuperaciones: recs, sesiones: [ses], reservas: dos, bloqueosMaquina: [bloq] }));
  assert.equal(b.length, 5);
  assert.equal(b[0].categoria, 'AVERIA'); // la más urgente arriba
  // ordenada de forma no creciente
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].urgencia >= b[i].urgencia);
});
