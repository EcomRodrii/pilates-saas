import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarAcceso, claseEsDeAhora, reservaEnClase, tipoDeAcceso, type ClaseEnPuerta, type EntradaAcceso, type ReservaEnPuerta } from './evaluar-acceso.ts';

// Martes 18:00–18:55 (hora de Madrid en verano = 16:00Z).
const REFORMER: ClaseEnPuerta = { id: 'ses-reformer', inicio: '2026-09-29T16:00:00Z', fin: '2026-09-29T16:55:00Z', cancelada: false };
const MAT: ClaseEnPuerta = { id: 'ses-mat', inicio: '2026-09-29T16:00:00Z', fin: '2026-09-29T16:50:00Z', cancelada: false };
const LLEGA = Date.parse('2026-09-29T15:50:00Z'); // 10 min antes

function reserva(p: Partial<ReservaEnPuerta> & Pick<ReservaEnPuerta, 'sesionId' | 'estado'>): ReservaEnPuerta {
  return { id: `res-${p.sesionId}-${p.estado}`, checkInEn: null, creadoEn: '2026-09-20T10:00:00Z', esRecuperacion: false, esPrueba: false, ...p };
}

function entrada(p: Partial<EntradaAcceso>): EntradaAcceso {
  return { ahoraMs: LLEGA, claseElegida: REFORMER, clasesAhora: [REFORMER, MAT], reservas: [], socia: { activa: true, conImpago: false }, ...p };
}

// ── Los casos del encargo ───────────────────────────────────────────────────

test('A — sin reserva para esa clase: 🔴 SIN_RESERVA, con la clase de la que se habla', () => {
  const r = evaluarAcceso(entrada({}));
  assert.equal(r.veredicto, 'DENEGADO');
  assert.equal(r.motivo, 'SIN_RESERVA');
  assert.equal(r.clase?.id, 'ses-reformer');
  assert.equal(r.reserva, null);
});

test('B — plaza fija: 🟢 PLAZA_FIJA (la reconoce por el id que pone el motor)', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ id: 'res-pf-abc', sesionId: 'ses-reformer', estado: 'CONFIRMADA' })] }));
  assert.equal(r.veredicto, 'PERMITIDO');
  assert.equal(r.motivo, 'PLAZA_FIJA');
  assert.equal(r.tipoAcceso, 'PLAZA_FIJA');
});

test('C — reservó y canceló: mira el estado ACTUAL, no que alguna vez existiera', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CANCELADA' })] }));
  assert.equal(r.veredicto, 'DENEGADO');
  assert.equal(r.motivo, 'RESERVA_CANCELADA');
});

test('C bis — canceló y volvió a reservar: vale la viva, no la cancelada', () => {
  const r = evaluarAcceso(entrada({
    reservas: [
      reserva({ id: 'res-1', sesionId: 'ses-reformer', estado: 'CANCELADA', creadoEn: '2026-09-20T10:00:00Z' }),
      reserva({ id: 'res-2', sesionId: 'ses-reformer', estado: 'CONFIRMADA', creadoEn: '2026-09-21T10:00:00Z' }),
    ],
  }));
  assert.equal(r.veredicto, 'PERMITIDO');
  assert.equal(r.reserva?.id, 'res-2');
});

test('D — reserva confirmada: 🟢 RESERVA_CONFIRMADA', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })] }));
  assert.equal(r.veredicto, 'PERMITIDO');
  assert.equal(r.motivo, 'RESERVA_CONFIRMADA');
  assert.equal(r.tipoAcceso, 'RESERVA');
});

// ── El resto de estados ─────────────────────────────────────────────────────

test('lista de espera: 🔴, aunque ocupe fila viva en el índice', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'LISTA_ESPERA' })] }));
  assert.equal(r.veredicto, 'DENEGADO');
  assert.equal(r.motivo, 'LISTA_ESPERA');
});

test('pendiente de aprobación: 🟠, decide quien escanea', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'PENDIENTE_APROBACION' })] }));
  assert.equal(r.veredicto, 'REVISAR');
  assert.equal(r.motivo, 'PENDIENTE_APROBACION');
});

test('marcada como que no vino: 🔴 NO_ASISTIO', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'NO_ASISTIO' })] }));
  assert.equal(r.motivo, 'NO_ASISTIO');
  assert.equal(r.veredicto, 'DENEGADO');
});

test('reserva de otra clase de ahora: 🔴 y dice cuál', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-mat', estado: 'CONFIRMADA' })] }));
  assert.equal(r.veredicto, 'DENEGADO');
  assert.equal(r.motivo, 'RESERVA_OTRA_CLASE');
  assert.equal(r.otraClase?.id, 'ses-mat');
});

test('clase cancelada: 🔴 siempre', () => {
  const cancelada = { ...REFORMER, cancelada: true };
  const r = evaluarAcceso(entrada({
    claseElegida: cancelada, clasesAhora: [cancelada],
    reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CANCELADA' })],
  }));
  assert.equal(r.motivo, 'CLASE_CANCELADA');
});

test('clase ya terminada (reserva pasada): 🔴', () => {
  const r = evaluarAcceso(entrada({
    ahoraMs: Date.parse('2026-09-29T17:10:00Z'),
    reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })],
  }));
  assert.equal(r.motivo, 'CLASE_TERMINADA');
  assert.equal(r.veredicto, 'DENEGADO');
});

test('una clase que aún no toca (más de una hora antes): 🔴', () => {
  const r = evaluarAcceso(entrada({
    ahoraMs: Date.parse('2026-09-29T14:30:00Z'),
    reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })],
  }));
  assert.equal(r.motivo, 'CLASE_NO_EMPEZADA');
});

test('ya entró: 🟢 YA_ENTRO con la hora (pista de un QR prestado)', () => {
  const r = evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'ASISTIDA', checkInEn: '2026-09-29T15:52:00Z' })] }));
  assert.equal(r.veredicto, 'PERMITIDO');
  assert.equal(r.motivo, 'YA_ENTRO');
  assert.equal(r.yaEntroEn, '2026-09-29T15:52:00Z');
});

test('recuperación y clase de prueba: 🟢 con su tipo', () => {
  assert.equal(evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA', esRecuperacion: true })] })).tipoAcceso, 'RECUPERACION');
  assert.equal(evaluarAcceso(entrada({ reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA', esPrueba: true })] })).tipoAcceso, 'CLASE_DE_PRUEBA');
});

// ── 🟠 por el estado de la alumna ───────────────────────────────────────────

test('desactivada con reserva confirmada: 🟠 CLIENTA_DESACTIVADA, no se deniega sola', () => {
  const r = evaluarAcceso(entrada({
    socia: { activa: false, conImpago: false },
    reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })],
  }));
  assert.equal(r.veredicto, 'REVISAR');
  assert.equal(r.motivo, 'CLIENTA_DESACTIVADA');
});

test('impago con reserva confirmada: 🟠 IMPAGO; con los dos, van los dos en avisos', () => {
  const r = evaluarAcceso(entrada({
    socia: { activa: false, conImpago: true },
    reservas: [reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })],
  }));
  assert.equal(r.veredicto, 'REVISAR');
  assert.deepEqual(r.avisos, ['CLIENTA_DESACTIVADA', 'IMPAGO']);
});

test('desactivada SIN reserva: 🔴 manda (el aviso no convierte un no en un quizá)', () => {
  const r = evaluarAcceso(entrada({ socia: { activa: false, conImpago: false } }));
  assert.equal(r.veredicto, 'DENEGADO');
  assert.deepEqual(r.avisos, ['CLIENTA_DESACTIVADA']);
});

// ── Sin clase elegida: recepción, «cualquiera de las de ahora» ──────────────

test('recepción: la clase sale de su reserva, sin elegir nada', () => {
  const r = evaluarAcceso(entrada({ claseElegida: null, reservas: [reserva({ sesionId: 'ses-mat', estado: 'CONFIRMADA' })] }));
  assert.equal(r.veredicto, 'PERMITIDO');
  assert.equal(r.clase?.id, 'ses-mat');
});

test('recepción: con sitio en dos clases a la vez, 🟠 VARIAS_CLASES con las dos para elegir', () => {
  const r = evaluarAcceso(entrada({
    claseElegida: null,
    reservas: [reserva({ sesionId: 'ses-mat', estado: 'CONFIRMADA' }), reserva({ sesionId: 'ses-reformer', estado: 'CONFIRMADA' })],
  }));
  assert.equal(r.motivo, 'VARIAS_CLASES');
  assert.deepEqual(r.candidatas.map(c => c.id).sort(), ['ses-mat', 'ses-reformer']);
});

test('recepción: sin nada en ninguna clase de ahora, 🔴 SIN_RESERVA sin clase', () => {
  const r = evaluarAcceso(entrada({ claseElegida: null }));
  assert.equal(r.motivo, 'SIN_RESERVA');
  assert.equal(r.clase, null);
});

test('recepción: si canceló la de ahora, se habla de esa clase', () => {
  const r = evaluarAcceso(entrada({ claseElegida: null, reservas: [reserva({ sesionId: 'ses-mat', estado: 'CANCELADA' })] }));
  assert.equal(r.motivo, 'RESERVA_CANCELADA');
  assert.equal(r.clase?.id, 'ses-mat');
});

test('recepción: sin ninguna clase en marcha ni por empezar, 🔴 SIN_CLASE_AHORA', () => {
  const r = evaluarAcceso(entrada({ claseElegida: null, ahoraMs: Date.parse('2026-09-29T08:00:00Z') }));
  assert.equal(r.motivo, 'SIN_CLASE_AHORA');
});

// ── Piezas ──────────────────────────────────────────────────────────────────

test('«de ahora» = desde una hora antes hasta el final', () => {
  assert.equal(claseEsDeAhora(REFORMER, Date.parse('2026-09-29T15:00:00Z')), true);
  assert.equal(claseEsDeAhora(REFORMER, Date.parse('2026-09-29T14:59:00Z')), false);
  assert.equal(claseEsDeAhora(REFORMER, Date.parse('2026-09-29T16:55:00Z')), true);
  assert.equal(claseEsDeAhora(REFORMER, Date.parse('2026-09-29T16:56:00Z')), false);
});

test('reservaEnClase: la viva gana; si no, no vino; si no, la última cancelada', () => {
  const rs = [
    reserva({ id: 'a', sesionId: 's', estado: 'CANCELADA', creadoEn: '2026-09-01T00:00:00Z' }),
    reserva({ id: 'b', sesionId: 's', estado: 'CANCELADA', creadoEn: '2026-09-02T00:00:00Z' }),
  ];
  assert.equal(reservaEnClase(rs, 's')?.id, 'b');
  assert.equal(reservaEnClase([...rs, reserva({ id: 'c', sesionId: 's', estado: 'NO_ASISTIO' })], 's')?.id, 'c');
  assert.equal(reservaEnClase([...rs, reserva({ id: 'd', sesionId: 's', estado: 'CONFIRMADA' })], 's')?.id, 'd');
  assert.equal(reservaEnClase(rs, 'otra'), null);
});

test('tipoDeAcceso: la plaza fija manda sobre cualquier otra marca', () => {
  assert.equal(tipoDeAcceso({ id: 'res-pf-1', esRecuperacion: true, esPrueba: true }), 'PLAZA_FIJA');
  assert.equal(tipoDeAcceso({ id: 'res-1', esRecuperacion: false, esPrueba: false }), 'RESERVA');
});
