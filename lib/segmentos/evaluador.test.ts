import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, Reserva, Sesion, CampoPersonalizado, PlanTarifa } from '@/lib/types';
import { construirContextoSegmento, evaluarSegmento } from './evaluador.ts';
import { estadosDeClientas } from '../clientas/estado.ts';
import type { DefinicionSegmento } from './tipos.ts';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const diasDespues = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: diasAntes(100), activo: true, ...p });

// El plan de las suscripciones de prueba: una cuota mensual (da derecho a reservar mientras está vigente).
const PLANES = [{ id: 'p', studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 50, tipo: 'MENSUAL', sesiones: null, activo: true } as PlanTarifa];

function ctx(socios: Socio[], suscripciones: Suscripcion[] = [], reservas: Reserva[] = [], sesiones: Sesion[] = [], campos: CampoPersonalizado[] = []) {
  // El estado de cada una con la misma función que Clientas.
  const estados = estadosDeClientas({ socios, suscripciones, planesTarifa: PLANES, reservas, sesiones }, NOW);
  return construirContextoSegmento(socios, suscripciones, reservas, sesiones, campos, NOW, estados);
}

test('segmento vacío (sin condiciones) incluye a todo el mundo', () => {
  const s = socio({ id: 's1' });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [] };
  assert.equal(evaluarSegmento(def, s, ctx([s])), true);
});

test('AND: exige que se cumplan todas las condiciones', () => {
  const s = socio({ id: 's1', tags: ['vip'] });
  const suscripciones: Suscripcion[] = [
    { id: 'sus1', studioId: 'e1', socioId: 's1', planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(10), fechaFin: diasDespues(3), sesionesRestantes: null, stripeSubscriptionId: null },
  ];
  const def: DefinicionSegmento = {
    operador: 'AND',
    condiciones: [
      { campo: 'etiqueta', comparador: 'igual', valor: 'vip' },
      { campo: 'bono_caduca_en_dias', comparador: 'menor_que', valor: 7 },
    ],
  };
  assert.equal(evaluarSegmento(def, s, ctx([s], suscripciones)), true);

  const otra = socio({ id: 's2', tags: ['vip'] }); // sin bono próximo a caducar
  assert.equal(evaluarSegmento(def, otra, ctx([otra])), false);
});

test('OR: basta con que se cumpla una condición', () => {
  const s = socio({ id: 's1', tags: ['nueva'] });
  const def: DefinicionSegmento = {
    operador: 'OR',
    condiciones: [
      { campo: 'etiqueta', comparador: 'igual', valor: 'vip' },
      { campo: 'etiqueta', comparador: 'igual', valor: 'nueva' },
    ],
  };
  assert.equal(evaluarSegmento(def, s, ctx([s])), true);
});

test('dias_desde_ultima_visita: socia que nunca ha venido no cumple una condición numérica (sin dato ≠ infinito)', () => {
  const s = socio({ id: 's1' });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'dias_desde_ultima_visita', comparador: 'mayor_que', valor: 30 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], [])), false);
});

test('dias_desde_ultima_visita: se calcula desde la última reserva ASISTIDA', () => {
  const s = socio({ id: 's1' });
  const reservas: Reserva[] = [
    { id: 'r1', studioId: 'e1', sesionId: 'se1', socioId: 's1', estado: 'ASISTIDA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(45) },
  ];
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'dias_desde_ultima_visita', comparador: 'mayor_que', valor: 30 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], reservas)), true);
});

test('tiene_reserva_futura: solo cuenta una sesión no cancelada con inicio en el futuro', () => {
  const s = socio({ id: 's1' });
  const sesiones: Sesion[] = [
    { id: 'se1', studioId: 'e1', tipoClaseId: 't1', salaId: 'sa1', instructorId: 'i1', inicio: diasDespues(2), fin: diasDespues(2), aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null },
  ];
  const reservas: Reserva[] = [
    { id: 'r1', studioId: 'e1', sesionId: 'se1', socioId: 's1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(1) },
  ];
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'tiene_reserva_futura', comparador: 'es_verdadero', valor: null }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], reservas, sesiones)), true);

  const sinFutura = socio({ id: 's2' });
  assert.equal(evaluarSegmento(def, sinFutura, ctx([sinFutura])), false);
});

test('sin_bono_activo: cierto cuando no hay suscripción ACTIVA', () => {
  const s = socio({ id: 's1' });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'sin_bono_activo', comparador: 'es_verdadero', valor: null }] };
  assert.equal(evaluarSegmento(def, s, ctx([s])), true);

  const conBono = socio({ id: 's2' });
  const suscripciones: Suscripcion[] = [
    { id: 'sus1', studioId: 'e1', socioId: 's2', planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(5), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null },
  ];
  assert.equal(evaluarSegmento(def, conBono, ctx([conBono], suscripciones)), false);
});

test('campo_extra numérico: compara el valor guardado en socio.camposExtra', () => {
  const campos: CampoPersonalizado[] = [{ id: 'peso', studioId: 'e1', etiqueta: 'Peso', tipo: 'numero', opciones: [], requerido: false, orden: 0, activo: true }];
  const s = socio({ id: 's1', camposExtra: { peso: 72 } });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'campo_extra:peso', comparador: 'mayor_que', valor: 70 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], [], [], campos)), true);
});

test('campo_extra borrado desde que se guardó el segmento no rompe, simplemente no cumple', () => {
  const s = socio({ id: 's1', camposExtra: { peso: 72 } });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'campo_extra:peso', comparador: 'mayor_que', valor: 70 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], [], [], [])), false); // campos=[] → definición no encontrada
});

test('bono_caduca_en_dias: cuenta hacia atrás desde fechaFin, positivo = días que quedan', () => {
  const s = socio({ id: 's1' });
  const suscripciones: Suscripcion[] = [
    { id: 'sus1', studioId: 'e1', socioId: 's1', planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(20), fechaFin: diasDespues(2), sesionesRestantes: null, stripeSubscriptionId: null },
  ];
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'bono_caduca_en_dias', comparador: 'menor_que', valor: 5 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], suscripciones)), true);
});

// Regresión QA (PR #1276, hallazgo 1): un comparador que 'etiqueta' no
// admite (solo admite igual/distinto) no debe interpretarse como 'igual'.
test('etiqueta: comparador no soportado (mayor_que) no cumple, no se confunde con igual', () => {
  const conTag = socio({ id: 's1', tags: ['vip'] });
  const sinTag = socio({ id: 's2', tags: [] });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'etiqueta', comparador: 'mayor_que', valor: 'vip' }] };
  assert.equal(evaluarSegmento(def, conTag, ctx([conTag])), false);
  assert.equal(evaluarSegmento(def, sinTag, ctx([sinTag])), false);
});

// Regresión QA (PR #1276, hallazgo 5): un campo personalizado desactivado
// (no borrado) debe tratarse igual que uno borrado — el builder ya no deja
// crear condiciones nuevas sobre él, así que un segmento existente tampoco
// debe seguir evaluándolo con normalidad.
test('campo_extra desactivado (activo=false) no se evalúa, igual que uno borrado', () => {
  const campos: CampoPersonalizado[] = [{ id: 'peso', studioId: 'e1', etiqueta: 'Peso', tipo: 'numero', opciones: [], requerido: false, orden: 0, activo: false }];
  const s = socio({ id: 's1', camposExtra: { peso: 72 } });
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'campo_extra:peso', comparador: 'mayor_que', valor: 70 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s], [], [], [], campos)), false);
});

test('cumpleanos_en_proximos_dias: ignora el año de nacimiento', () => {
  const s = socio({ id: 's1', fechaNacimiento: '1990-08-22' }); // 2 días después de NOW (2026-08-20)
  const def: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'cumpleanos_en_proximos_dias', comparador: 'menor_que', valor: 5 }] };
  assert.equal(evaluarSegmento(def, s, ctx([s])), true);
});

test('«Estado»: el mismo que enseña Clientas (Activa con cuota vigente, Interesada sin nada)', () => {
  const activa = socio({ id: 'a' });
  const interesada = socio({ id: 'i' });
  const sus: Suscripcion[] = [
    { id: 'sa', studioId: 'e1', socioId: 'a', planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(10).slice(0, 10), fechaFin: diasDespues(20).slice(0, 10), sesionesRestantes: null, stripeSubscriptionId: null },
  ];
  const c = ctx([activa, interesada], sus);
  const esActiva: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'estado', comparador: 'igual', valor: 'ACTIVA' }] };
  assert.equal(evaluarSegmento(esActiva, activa, c), true);
  assert.equal(evaluarSegmento(esActiva, interesada, c), false);
  const noActiva: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'estado', comparador: 'distinto', valor: 'ACTIVA' }] };
  assert.equal(evaluarSegmento(noActiva, interesada, c), true);
});

test('un segmento guardado con la etapa antigua se sigue entendiendo: LEAD = Interesada', () => {
  const interesada = socio({ id: 'i' });
  const c = ctx([interesada]);
  const lead: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'lead_stage', comparador: 'igual', valor: 'LEAD' }] };
  assert.equal(evaluarSegmento(lead, interesada, c), true);
  const noLead: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'lead_stage', comparador: 'distinto', valor: 'LEAD' }] };
  assert.equal(evaluarSegmento(noLead, interesada, c), false);
  // «En riesgo» se marcaba a mano: se sigue leyendo de la columna.
  const riesgo = socio({ id: 'r', leadStage: 'EN_RIESGO' });
  const enRiesgo: DefinicionSegmento = { operador: 'AND', condiciones: [{ campo: 'lead_stage', comparador: 'igual', valor: 'EN_RIESGO' }] };
  assert.equal(evaluarSegmento(enRiesgo, riesgo, ctx([riesgo])), true);
});

