import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compartenClase, esIdSociaValido, inicioVentanaClaseCompartida, nombreOtraParte, puedeSolicitarCompanera,
  NOMBRE_COMPANERA_NEUTRO, VENTANA_CLASE_COMPARTIDA_DIAS, type ReservaParaClaseCompartida,
} from './social-companeras-reglas.ts';

const AHORA = new Date('2026-09-13T10:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();
const dentroDe = (dias: number) => new Date(AHORA.getTime() + dias * 86_400_000).toISOString();

function r(socioId: string, sesionId: string, estado: string, finSesion: string | null): ReservaParaClaseCompartida {
  return { socioId, sesionId, estado, finSesion };
}

// ── Id del body ────────────────────────────────────────────────────────────
test('id de socia: formato real sí, cualquier cosa que rompa un filtro .or() no', () => {
  for (const id of ['soc-1', 'soc-mf3k2-a-x9z1q', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'SOC_7']) {
    assert.equal(esIdSociaValido(id), true, id);
  }
  for (const id of ['', 'soc-1),id.eq.comp-9', 'soc 1', 'soc,1', 'a'.repeat(65), null, 42, undefined]) {
    assert.equal(esIdSociaValido(id), false, String(id));
  }
});

// ── Clase compartida ───────────────────────────────────────────────────────
test('comparten clase si las dos van (o fueron) a la misma sesión reciente', () => {
  assert.equal(compartenClase([r('A', 'ses-1', 'CONFIRMADA', dentroDe(2)), r('B', 'ses-1', 'CONFIRMADA', dentroDe(2))], 'A', 'B', AHORA), true);
  assert.equal(compartenClase([r('A', 'ses-1', 'ASISTIDA', hace(10)), r('B', 'ses-1', 'ASISTIDA', hace(10))], 'A', 'B', AHORA), true);
  assert.equal(compartenClase([r('A', 'ses-1', 'ASISTIDA', hace(1)), r('B', 'ses-1', 'CONFIRMADA', hace(1))], 'A', 'B', AHORA), true);
});

test('sesiones distintas no son clase compartida', () => {
  assert.equal(compartenClase([r('A', 'ses-1', 'CONFIRMADA', dentroDe(2)), r('B', 'ses-2', 'CONFIRMADA', dentroDe(2))], 'A', 'B', AHORA), false);
});

test('cancelada, no asistió, lista de espera o pendiente de aprobar no cuentan', () => {
  for (const estado of ['CANCELADA', 'NO_ASISTIO', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']) {
    assert.equal(
      compartenClase([r('A', 'ses-1', 'CONFIRMADA', dentroDe(1)), r('B', 'ses-1', estado, dentroDe(1))], 'A', 'B', AHORA),
      false, estado,
    );
    assert.equal(
      compartenClase([r('A', 'ses-1', estado, dentroDe(1)), r('B', 'ses-1', 'CONFIRMADA', dentroDe(1))], 'A', 'B', AHORA),
      false, estado,
    );
  }
});

test('una clase compartida fuera de la ventana ya no hace compañeras', () => {
  const borde = VENTANA_CLASE_COMPARTIDA_DIAS;
  assert.equal(compartenClase([r('A', 's', 'ASISTIDA', hace(borde - 1)), r('B', 's', 'ASISTIDA', hace(borde - 1))], 'A', 'B', AHORA), true);
  assert.equal(compartenClase([r('A', 's', 'ASISTIDA', hace(borde + 1)), r('B', 's', 'ASISTIDA', hace(borde + 1))], 'A', 'B', AHORA), false);
  assert.equal(compartenClase([r('A', 's', 'ASISTIDA', null), r('B', 's', 'ASISTIDA', null)], 'A', 'B', AHORA), false);
  assert.equal(inicioVentanaClaseCompartida(AHORA), hace(borde));
});

test('reservas de terceras o sin sesión no fabrican una coincidencia', () => {
  const reservas = [
    r('A', 'ses-1', 'CONFIRMADA', dentroDe(1)),
    r('C', 'ses-1', 'CONFIRMADA', dentroDe(1)),
    { socioId: 'B', sesionId: null, estado: 'CONFIRMADA', finSesion: dentroDe(1) },
  ];
  assert.equal(compartenClase(reservas, 'A', 'B', AHORA), false);
  assert.equal(compartenClase([r('A', 'ses-1', 'CONFIRMADA', dentroDe(1))], 'A', 'A', AHORA), false);
});

// ── Quién puede solicitar ──────────────────────────────────────────────────
test('solo se solicita a quien es visible en clase o comparte clase contigo', () => {
  const invisible = { id: 'B', visibleEnClase: false };
  const visible = { id: 'B', visibleEnClase: true };
  assert.equal(puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: invisible, compartenClase: false }), false, 'el caso de H3');
  assert.equal(puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: invisible, compartenClase: true }), true);
  assert.equal(puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: visible, compartenClase: false }), true);
});

test('una socia que no existe recibe la misma negativa que una no elegible', () => {
  assert.equal(puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: null, compartenClase: true }), false);
  assert.equal(
    puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: null, compartenClase: false }),
    puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: { id: 'B', visibleEnClase: false }, compartenClase: false }),
  );
  assert.equal(puedeSolicitarCompanera({ solicitanteId: 'A', destinataria: { id: 'A', visibleEnClase: true }, compartenClase: true }), false);
});

// ── Nombre mostrado ────────────────────────────────────────────────────────
const MARTA = { nombre: 'Marta', apellidos: 'López Ruiz', visibleEnClase: false };
const MARTA_VISIBLE = { ...MARTA, visibleEnClase: true };

test('nombre completo solo en una relación aceptada', () => {
  for (const otraEsSolicitante of [true, false]) {
    assert.equal(nombreOtraParte({ estado: 'aceptada', otraEsSolicitante, otra: MARTA }), 'Marta López Ruiz');
  }
  assert.equal(nombreOtraParte({ estado: 'aceptada', otraEsSolicitante: false, otra: { ...MARTA, apellidos: null } }), 'Marta');
});

test('solicitud enviada a quien no es visible: texto neutro, ni nombre ni apellidos', () => {
  assert.equal(nombreOtraParte({ estado: 'pendiente', otraEsSolicitante: false, otra: MARTA }), NOMBRE_COMPANERA_NEUTRO);
});

test('solicitud enviada a quien es visible: nombre de pila, sin apellidos', () => {
  assert.equal(nombreOtraParte({ estado: 'pendiente', otraEsSolicitante: false, otra: MARTA_VISIBLE }), 'Marta');
});

test('solicitud recibida: nombre de pila de quien escribe, nunca apellidos', () => {
  assert.equal(nombreOtraParte({ estado: 'pendiente', otraEsSolicitante: true, otra: MARTA }), 'Marta');
  assert.equal(nombreOtraParte({ estado: 'pendiente', otraEsSolicitante: true, otra: MARTA_VISIBLE }), 'Marta');
});

test('bloqueada: mismo criterio que una no aceptada', () => {
  for (const otraEsSolicitante of [true, false]) {
    assert.equal(nombreOtraParte({ estado: 'bloqueada', otraEsSolicitante, otra: MARTA }), NOMBRE_COMPANERA_NEUTRO);
    assert.equal(nombreOtraParte({ estado: 'bloqueada', otraEsSolicitante, otra: MARTA_VISIBLE }), 'Marta');
  }
});

test('ningún estado que no sea aceptada deja pasar un apellido', () => {
  for (const estado of ['pendiente', 'bloqueada', 'otro']) {
    for (const otraEsSolicitante of [true, false]) {
      for (const otra of [MARTA, MARTA_VISIBLE]) {
        const nombre = nombreOtraParte({ estado, otraEsSolicitante, otra });
        assert.ok(!nombre.includes('López'), `${estado}/${otraEsSolicitante}/${otra.visibleEnClase}: ${nombre}`);
      }
    }
  }
});

test('ficha borrada o sin nombre: texto neutro', () => {
  assert.equal(nombreOtraParte({ estado: 'aceptada', otraEsSolicitante: true, otra: null }), NOMBRE_COMPANERA_NEUTRO);
  assert.equal(nombreOtraParte({ estado: 'aceptada', otraEsSolicitante: true, otra: { nombre: '  ', apellidos: 'X', visibleEnClase: true } }), NOMBRE_COMPANERA_NEUTRO);
});
