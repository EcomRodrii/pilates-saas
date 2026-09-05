import { test } from 'node:test';
import assert from 'node:assert/strict';
// Valores por ruta RELATIVA: con `@/` el runner de node --test no resuelve el
// alias y descarta el fichero entero SIN fallar, así que el test dejaría de
// existir sin que nadie se entere. Los `import type` sí pueden usar `@/`
// porque se borran al compilar.
import { nivelDe, estadoReservaDe, estadoPagoDe, bonoDeSuscripcion, OCUPA_PLAZA } from './mapeo.ts';

// Los mapeos entre el vocabulario del backend y el del paquete de diseño.
//
// Tienen test propio porque son el sitio donde un fallo NO se nota: si un enum
// no casa, la traducción cae al valor por defecto y la pantalla enseña algo
// plausible pero falso. Nadie ve una excepción; solo un dato equivocado.

test('nivel: el enum del backend no coincide con el rótulo del diseño', () => {
  // Comprobado contra la base de datos: los cuatro valores están en uso.
  assert.equal(nivelDe('PRINCIPIANTE'), 'Iniciación');
  assert.equal(nivelDe('TODOS'), 'Todos');
  assert.equal(nivelDe('MEDIO'), 'Medio');
  assert.equal(nivelDe('AVANZADO'), 'Avanzado');
});

test('nivel: un valor desconocido cae a Todos, nunca rompe la pantalla', () => {
  assert.equal(nivelDe(null), 'Todos');
  assert.equal(nivelDe(undefined), 'Todos');
  assert.equal(nivelDe('INVENTADO'), 'Todos');
});

test('nivel: NO se traduce comparando en caja mixta', () => {
  // Este es el fallo que el mapa evita: una comparación directa contra los
  // rótulos del diseño devolvería 'Todos' para las cuatro clases.
  const rotulos = ['Todos', 'Iniciación', 'Medio', 'Avanzado'];
  assert.equal(rotulos.includes('PRINCIPIANTE'), false);
});

test('ocupa plaza: el MISMO criterio que la RPC reservar_plaza', () => {
  // reservar_plaza cuenta `estado in ('CONFIRMADA','ASISTIDA')`. Cualquier otro
  // criterio en el cliente enseña plazas que el servidor va a rechazar.
  assert.equal(OCUPA_PLAZA.has('CONFIRMADA'), true);
  assert.equal(OCUPA_PLAZA.has('ASISTIDA'), true);
  // Una persona en lista de espera NO ocupa: si contara, el aforo saldría lleno
  // antes de tiempo. Es la divergencia real entre las dos proyecciones que ya
  // existen en el repo.
  assert.equal(OCUPA_PLAZA.has('LISTA_ESPERA'), false);
  assert.equal(OCUPA_PLAZA.has('CANCELADA'), false);
  assert.equal(OCUPA_PLAZA.has('NO_ASISTIO'), false);
});

test('estado de reserva: los seis del backend caben en los cinco del diseño', () => {
  assert.equal(estadoReservaDe('CONFIRMADA'), 'confirmada');
  assert.equal(estadoReservaDe('CANCELADA'), 'cancelada');
  assert.equal(estadoReservaDe('ASISTIDA'), 'asistida');
  assert.equal(estadoReservaDe('NO_ASISTIO'), 'no-asistida');
  assert.equal(estadoReservaDe('LISTA_ESPERA'), 'en-espera');
  // El sexto: todavía no tiene plaza, así que se lee como espera.
  assert.equal(estadoReservaDe('PENDIENTE_APROBACION'), 'en-espera');
});

test('estado de pago: EN_CURSO no es pagado', () => {
  assert.equal(estadoPagoDe('COBRADO'), 'success');
  // Un adeudo SEPA en vuelo. Leerlo como pagado le diría a la alumna que ya
  // está cobrado cuando el banco todavía puede devolverlo.
  assert.equal(estadoPagoDe('EN_CURSO'), 'processing');
  assert.equal(estadoPagoDe('FALLIDO'), 'failed');
  assert.equal(estadoPagoDe('DEVUELTO'), 'refunded');
});

test('estado de pago: PENDIENTE no es un cobro en marcha', () => {
  // Los dos caían en `processing`, y son cosas distintas: `EN_CURSO` es un
  // adeudo saliendo del banco; `PENDIENTE` es un recibo emitido y sin cobrar
  // —lo que el dunning reintenta—, donde no hay ningún cobro en marcha.
  // Colapsarlos le prometía a quien tiene un recibo impagado un aviso de
  // confirmación que nadie iba a mandarle.
  assert.equal(estadoPagoDe('PENDIENTE'), 'pending');
  assert.notEqual(estadoPagoDe('PENDIENTE'), estadoPagoDe('EN_CURSO'));
});

test('estado de pago: un estado desconocido no se pinta como cobro en marcha', () => {
  // Ante algo que no conocemos, «todavía sin cobrar» es lo que menos promete:
  // «procesando» afirma que hay un cobro saliendo, que es un hecho concreto y
  // puede ser falso.
  assert.equal(estadoPagoDe('LO_QUE_SEA'), 'pending');
  assert.equal(estadoPagoDe(null), 'pending');
});

// ── Bonos: la traducción más cara de equivocar ──────────────────────────────

const PLAN_BONO = { id: 'p1', nombre: 'Bono 8 clases', sesiones: 8, precio: 64 };
const PLAN_MENSUAL = { id: 'p2', nombre: 'Mensual Ilimitado', sesiones: null, precio: 85 };

test('bono ilimitado: sesionesRestantes null es ILIMITADO, no cero', () => {
  const b = bonoDeSuscripcion(
    { id: 's1', planId: 'p2', estado: 'ACTIVA', fechaInicio: '2026-09-01', fechaFin: null, sesionesRestantes: null },
    PLAN_MENSUAL,
    Date.parse('2026-09-03'),
  );
  // El fallo que esto evita: enseñar «0 sesiones» a quien tiene un mensual.
  assert.equal(b.estado, 'activo');
  assert.equal(Number.isFinite(b.creditosTotales), false);
  assert.equal(b.creditosUsados, 0);
});

test('bono limitado: usadas = incluidas − restantes', () => {
  const b = bonoDeSuscripcion(
    { id: 's2', planId: 'p1', estado: 'ACTIVA', fechaInicio: '2026-08-01', fechaFin: '2026-12-01', sesionesRestantes: 5 },
    PLAN_BONO,
    Date.parse('2026-09-03'),
  );
  assert.equal(b.creditosTotales, 8);
  assert.equal(b.creditosUsados, 3);
  assert.equal(b.estado, 'activo');
});

test('bono agotado: sin sesiones pero dentro de plazo', () => {
  const b = bonoDeSuscripcion(
    { id: 's3', planId: 'p1', estado: 'ACTIVA', fechaInicio: '2026-08-01', fechaFin: '2026-12-01', sesionesRestantes: 0 },
    PLAN_BONO,
    Date.parse('2026-09-03'),
  );
  assert.equal(b.estado, 'agotado');
});

test('bono caducado: la fecha manda sobre el saldo', () => {
  // Con sesiones de sobra pero fuera de plazo, sigue siendo expirado: es lo que
  // el servidor va a decir al intentar usarlo.
  const b = bonoDeSuscripcion(
    { id: 's4', planId: 'p1', estado: 'ACTIVA', fechaInicio: '2026-01-01', fechaFin: '2026-06-01', sesionesRestantes: 6 },
    PLAN_BONO,
    Date.parse('2026-09-03'),
  );
  assert.equal(b.estado, 'expirado');
});

test('bono de una suscripción no activa: expirado', () => {
  for (const estado of ['PAUSADA', 'CANCELADA', 'EXPIRADA']) {
    const b = bonoDeSuscripcion(
      { id: 's5', planId: 'p1', estado, fechaInicio: '2026-08-01', fechaFin: '2026-12-01', sesionesRestantes: 4 },
      PLAN_BONO,
      Date.parse('2026-09-03'),
    );
    assert.equal(b.estado, 'expirado', `estado ${estado}`);
  }
});

test('bono sin plan: no revienta, cuenta a cero', () => {
  // Un plan borrado deja la suscripción huérfana. La pantalla tiene que pintar
  // algo, no caerse.
  const b = bonoDeSuscripcion(
    { id: 's6', planId: 'fantasma', estado: 'ACTIVA', fechaInicio: '2026-08-01', fechaFin: null, sesionesRestantes: 2 },
    undefined,
    Date.parse('2026-09-03'),
  );
  assert.equal(b.nombre, 'Bono');
  assert.equal(b.creditosTotales, 0);
  assert.equal(b.precio, 0);
});
