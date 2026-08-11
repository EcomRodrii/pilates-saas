import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumirAcciones, tituloAtencion, tituloOportunidades, fraseEuros,
  type RecomendacionResumible,
} from './action-center.ts';

let n = 0;
function rec(p: Partial<RecomendacionResumible> = {}): RecomendacionResumible {
  return {
    id: `r-${++n}`, titulo: 'Algo', prioridad: 'MEDIA', riesgo: 'PERDIDA',
    confianza: { nivel: 'MEDIA' }, impacto: null, accion: { tipo: 'CONTACTO_MANUAL' },
    score: 50, ...p,
  };
}

// ── Agrupación ──────────────────────────────────────────────────────────────

test('separa lo que cuesta dinero de lo que puede ganarlo', () => {
  const r = resumirAcciones([
    rec({ riesgo: 'PERDIDA', titulo: 'Laura se va' }),
    rec({ riesgo: 'OPORTUNIDAD', titulo: 'Abre otra clase' }),
  ]);
  assert.deepEqual(r.atencion.map(x => x.titulo), ['Laura se va']);
  assert.deepEqual(r.oportunidades.map(x => x.titulo), ['Abre otra clase']);
  assert.equal(r.vacio, false);
});

test('sin nada pendiente, la sección entera no se pinta', () => {
  const r = resumirAcciones([]);
  assert.equal(r.vacio, true);
  assert.deepEqual(r.atencion, []);
  assert.deepEqual(r.oportunidades, []);
});

test('lo más grave primero; a igual gravedad, el score del motor', () => {
  const r = resumirAcciones([
    rec({ titulo: 'media-baja', prioridad: 'MEDIA', confianza: { nivel: 'BAJA' }, score: 90 }),
    rec({ titulo: 'critica', prioridad: 'CRITICA', score: 10 }),
    rec({ titulo: 'importante-alta', prioridad: 'ALTA', confianza: { nivel: 'ALTA' }, score: 80 }),
    rec({ titulo: 'importante-baja', prioridad: 'ALTA', confianza: { nivel: 'ALTA' }, score: 20 }),
  ], 4);
  assert.deepEqual(r.atencion.map(x => x.titulo), ['critica', 'importante-alta', 'importante-baja', 'media-baja']);
});

test('el tope acota lo que se PINTA, no lo que se cuenta', () => {
  const muchas = Array.from({ length: 9 }, (_, i) =>
    rec({ riesgo: 'PERDIDA', impacto: { valor: 10, unidad: 'EUR_MES' }, score: i }));
  const r = resumirAcciones(muchas, 3);
  assert.equal(r.atencion.length, 3);
  // Los 90 € salen de las NUEVE, no de las tres que se ven.
  assert.equal(r.eurMesEnRiesgo, 90);
  assert.equal(r.nUnToque, 9);
});

// ── "lo hace Tentare" sale del ejecutor real ────────────────────────────────

test('MARCAR_GESTIONADO es lo único que Tentare NO hace por ti', () => {
  const r = resumirAcciones([
    rec({ titulo: 'email', accion: { tipo: 'ENVIAR_EMAIL' } }),
    rec({ titulo: 'whatsapp', accion: { tipo: 'CONTACTO_MANUAL' } }),
    rec({ titulo: 'cobro', accion: { tipo: 'COBRAR_RECIBOS' } }),
    rec({ titulo: 'aviso', accion: { tipo: 'MARCAR_GESTIONADO' } }),
  ], 4);
  const porTitulo = Object.fromEntries(r.atencion.map(x => [x.titulo, x.loHaceTentare]));
  assert.equal(porTitulo['email'], true);
  assert.equal(porTitulo['whatsapp'], true);
  assert.equal(porTitulo['cobro'], true);
  assert.equal(porTitulo['aviso'], false);
  assert.equal(r.nUnToque, 3);
});

// ── Los euros no se mezclan ─────────────────────────────────────────────────

test('EUR_MES y EUR se cuentan por separado: sumarlos sería mentir', () => {
  const r = resumirAcciones([
    rec({ riesgo: 'PERDIDA', impacto: { valor: 89, unidad: 'EUR_MES' } }),
    rec({ riesgo: 'PERDIDA', impacto: { valor: 20, unidad: 'EUR' } }),
  ]);
  assert.equal(r.eurMesEnRiesgo, 89);
  assert.equal(r.eurPuntualEnRiesgo, 20);
});

test('una unidad que no es dinero (PCT_OCUPACION) no entra en ninguna cifra en €', () => {
  const r = resumirAcciones([rec({ impacto: { valor: 35, unidad: 'PCT_OCUPACION' } })]);
  assert.equal(r.eurMesEnRiesgo, 0);
  assert.equal(r.eurPuntualEnRiesgo, 0);
});

test('las oportunidades no contaminan las cifras de riesgo', () => {
  const r = resumirAcciones([
    rec({ riesgo: 'PERDIDA', impacto: { valor: 100, unidad: 'EUR_MES' } }),
    rec({ riesgo: 'OPORTUNIDAD', impacto: { valor: 340, unidad: 'EUR' } }),
  ]);
  assert.equal(r.eurMesEnRiesgo, 100);
  assert.equal(r.eurPuntualOportunidad, 340);
  assert.equal(r.eurPuntualEnRiesgo, 0);
  assert.equal(r.eurMesOportunidad, 0);
});

// ── Lenguaje ────────────────────────────────────────────────────────────────

test('los títulos concuerdan en singular y plural', () => {
  assert.equal(tituloAtencion(1), 'Una cosa necesita tu atención');
  assert.equal(tituloAtencion(3), '3 cosas necesitan tu atención');
  assert.equal(tituloOportunidades(1), 'Una oportunidad');
  assert.equal(tituloOportunidades(2), '2 oportunidades');
});

test('fraseEuros: cada unidad con la suya, y null cuando no hay nada que decir', () => {
  // Sin punto de millar a cuatro dígitos: es lo que hace `es-ES` (agrupación
  // `min2` de ECMA-402) y además lo que recomienda la RAE. A cinco sí agrupa.
  assert.equal(fraseEuros(1240, 0), '1240 €/mes');
  assert.equal(fraseEuros(12400, 0), '12.400 €/mes');
  assert.equal(fraseEuros(0, 236), '236 €');
  assert.equal(fraseEuros(1240, 236), '1240 €/mes y 236 €');
  assert.equal(fraseEuros(0, 0), null);
});
