import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoSesion, pideDecision, PINTA, type SesionParaEstado, type ContextoEstadoSesion } from './calendario-estado.ts';

const INICIO = '2026-07-13T08:00:00.000Z';
const FIN = '2026-07-13T09:00:00.000Z';

const sesion = (o: Partial<SesionParaEstado> = {}): SesionParaEstado => ({
  cancelada: false, inicio: INICIO, fin: FIN, incidenciaTexto: null, ...o,
});
const ctx = (o: Partial<ContextoEstadoSesion> = {}): ContextoEstadoSesion => ({
  sustitucionAbierta: false, conflicto: false, confirmadasSinCheckin: 0, ...o,
});

// ── Los cuatro tramos temporales base, sin ninguna señal encendida ──────────

test('antes de empezar → PROGRAMADA', () => {
  const ahora = new Date('2026-07-13T07:00:00.000Z');
  assert.equal(estadoSesion(sesion(), ahora, ctx()), 'PROGRAMADA');
});

test('entre inicio y fin → EN_CURSO', () => {
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(estadoSesion(sesion(), ahora, ctx()), 'EN_CURSO');
});

test('justo en el instante de inicio → EN_CURSO, no PROGRAMADA', () => {
  assert.equal(estadoSesion(sesion(), new Date(INICIO), ctx()), 'EN_CURSO');
});

test('terminada, todo el mundo marcado → FINALIZADA', () => {
  const ahora = new Date('2026-07-13T10:00:00.000Z');
  assert.equal(estadoSesion(sesion(), ahora, ctx({ confirmadasSinCheckin: 0 })), 'FINALIZADA');
});

test('justo en el instante de fin → ya cuenta como terminada', () => {
  assert.equal(estadoSesion(sesion(), new Date(FIN), ctx()), 'FINALIZADA');
});

// ── SIN_PASAR_LISTA: solo existe una vez terminada la clase ─────────────────

test('terminada con confirmadas sin check-in → SIN_PASAR_LISTA', () => {
  const ahora = new Date('2026-07-13T10:00:00.000Z');
  assert.equal(estadoSesion(sesion(), ahora, ctx({ confirmadasSinCheckin: 3 })), 'SIN_PASAR_LISTA');
});

test('EN_CURSO con confirmadas "sin check-in" no es SIN_PASAR_LISTA todavía', () => {
  // La señal solo se evalúa una vez pasado el fin — mitad de clase no cuenta.
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(estadoSesion(sesion(), ahora, ctx({ confirmadasSinCheckin: 5 })), 'EN_CURSO');
});

// ── Orden de gravedad: lo que exige una decisión gana ───────────────────────

test('CANCELADA gana a todo lo demás, incluida una incidencia abierta', () => {
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(
    estadoSesion(sesion({ cancelada: true, incidenciaTexto: 'algo' }), ahora, ctx({ conflicto: true, sustitucionAbierta: true })),
    'CANCELADA',
  );
});

test('SIN_INSTRUCTORA gana a INCIDENCIA/CONFLICTO', () => {
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(
    estadoSesion(sesion({ incidenciaTexto: 'algo' }), ahora, ctx({ sustitucionAbierta: true, conflicto: true })),
    'SIN_INSTRUCTORA',
  );
});

test('INCIDENCIA gana a CONFLICTO', () => {
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(
    estadoSesion(sesion({ incidenciaTexto: 'sala sin luz' }), ahora, ctx({ conflicto: true })),
    'INCIDENCIA',
  );
});

test('CONFLICTO gana a EN_CURSO/FINALIZADA/SIN_PASAR_LISTA', () => {
  const enCurso = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(estadoSesion(sesion(), enCurso, ctx({ conflicto: true })), 'CONFLICTO');
  const terminada = new Date('2026-07-13T10:00:00.000Z');
  assert.equal(estadoSesion(sesion(), terminada, ctx({ conflicto: true, confirmadasSinCheckin: 4 })), 'CONFLICTO');
});

test('incidenciaTexto vacío ("") no cuenta como incidencia abierta', () => {
  const ahora = new Date('2026-07-13T08:30:00.000Z');
  assert.equal(estadoSesion(sesion({ incidenciaTexto: '' }), ahora, ctx()), 'EN_CURSO');
});

test('sesión sin incidenciaTexto (undefined, fixture antigua) no rompe la derivación', () => {
  const s: SesionParaEstado = { cancelada: false, inicio: INICIO, fin: FIN };
  const ahora = new Date('2026-07-13T07:00:00.000Z');
  assert.equal(estadoSesion(s, ahora, ctx()), 'PROGRAMADA');
});

// ── PINTA: una entrada por estado, con las tres propiedades de color ────────

test('PINTA tiene entrada para los 8 estados, cada una con label/fondo/tinta/barra', () => {
  const estados: (keyof typeof PINTA)[] = [
    'PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'SIN_PASAR_LISTA',
    'SIN_INSTRUCTORA', 'INCIDENCIA', 'CONFLICTO', 'CANCELADA',
  ];
  for (const e of estados) {
    const p = PINTA[e];
    assert.ok(p.label.length > 0, `${e} sin label`);
    assert.ok(p.fondo.length > 0, `${e} sin fondo`);
    assert.ok(p.tinta.length > 0, `${e} sin tinta`);
    assert.ok(p.barra.length > 0, `${e} sin barra`);
  }
});

test('INCIDENCIA y CONFLICTO comparten el mismo tono (peligro) — ambos exigen atención urgente', () => {
  assert.equal(PINTA.INCIDENCIA.tinta, PINTA.CONFLICTO.tinta);
});

test('SIN_INSTRUCTORA y SIN_PASAR_LISTA comparten el mismo tono (aviso), distinto de CANCELADA/FINALIZADA', () => {
  assert.equal(PINTA.SIN_INSTRUCTORA.tinta, PINTA.SIN_PASAR_LISTA.tinta);
  assert.notEqual(PINTA.SIN_INSTRUCTORA.tinta, PINTA.CANCELADA.tinta);
});

// ── pideDecision ─────────────────────────────────────────────────────────────

test('pideDecision: los 4 estados que exigen acción, siempre piden decisión', () => {
  for (const e of ['SIN_INSTRUCTORA', 'INCIDENCIA', 'CONFLICTO', 'SIN_PASAR_LISTA'] as const) {
    assert.equal(pideDecision(e, { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), true, e);
  }
});

test('pideDecision: PROGRAMADA/EN_CURSO/FINALIZADA sin espera ni sobreaforo no piden nada', () => {
  for (const e of ['PROGRAMADA', 'EN_CURSO', 'FINALIZADA'] as const) {
    assert.equal(pideDecision(e, { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), false, e);
  }
});

test('pideDecision: PROGRAMADA con lista de espera Y hueco libre SÍ pide decisión (ofrecer plaza)', () => {
  assert.equal(pideDecision('PROGRAMADA', { enEspera: 2, sobreaforo: 0, huecosLibres: 1 }), true);
});

test('pideDecision: PROGRAMADA llena con lista de espera pero SIN hueco libre no pide nada — es un estado sano, no un oversell', () => {
  assert.equal(pideDecision('PROGRAMADA', { enEspera: 2, sobreaforo: 0, huecosLibres: 0 }), false);
});

test('pideDecision: EN_CURSO con sobreaforo SÍ pide decisión (ajustar aforo), sin depender de huecosLibres', () => {
  assert.equal(pideDecision('EN_CURSO', { enEspera: 0, sobreaforo: 1, huecosLibres: 0 }), true);
});

test('pideDecision: CANCELADA nunca pide decisión, aunque tenga espera/sobreaforo/hueco libre', () => {
  assert.equal(pideDecision('CANCELADA', { enEspera: 5, sobreaforo: 3, huecosLibres: 2 }), false);
});
