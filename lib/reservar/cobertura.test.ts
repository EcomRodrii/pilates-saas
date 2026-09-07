import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coberturaDeClase, estaCubierta, textoCobertura, textoCoberturaListaEspera, precioDeCobertura } from './cobertura.ts';
import { tieneEntitlementActivo, bonoConsumible, bonoDevolvible } from '../bono-logic.ts';
import type { PlanTarifa, Suscripcion } from '../types.ts';

const HOY = '2026-08-17';
const SOCIA = 'socia-1';
const REFORMER = 'tc-reformer';
const MAT = 'tc-mat';

function plan(p: Partial<PlanTarifa> & { id: string; tipo: PlanTarifa['tipo'] }): PlanTarifa {
  return {
    studioId: 'st', nombre: p.id, descripcion: null, precio: 0, sesiones: null,
    activo: true, ...p,
  } as PlanTarifa;
}
function sus(s: Partial<Suscripcion> & { planId: string }): Suscripcion {
  return {
    id: `sus-${s.planId}`, studioId: 'st', socioId: SOCIA, estado: 'ACTIVA',
    fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: null,
    stripeSubscriptionId: null, ...s,
  } as Suscripcion;
}

const BONO_REFORMER = plan({ id: 'p-bono-ref', nombre: 'Bono 10 Reformer', tipo: 'BONO', tiposClaseIds: [REFORMER] });
const MENSUAL_TODO = plan({ id: 'p-mensual', nombre: 'Mensual Ilimitado', tipo: 'MENSUAL' });

// ── El bug 1: la cobertura es POR CLASE ──────────────────────────────────────

test('un bono de Reformer NO cubre Mat: el precio sigue visible en Mat', () => {
  // Este es el bug: `cubierta` se calculaba una vez con el tipo de la clase
  // abierta y se aplicaba a todo el listado, así que abrir un Reformer cubierto
  // borraba el precio de las clases de Mat que sí hay que pagar.
  const args = {
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 5 })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, precioClaseSuelta: 15,
  };
  const ref = coberturaDeClase({ ...args, tipoClaseId: REFORMER });
  const mat = coberturaDeClase({ ...args, tipoClaseId: MAT });

  assert.equal(ref.estado, 'BONO');
  assert.equal(precioDeCobertura(ref), null, 'la clase cubierta no muestra precio');
  assert.equal(mat.estado, 'NO_CUBRE_ESTA_CLASE');
  assert.equal(precioDeCobertura(mat), 15, 'la clase NO cubierta sí muestra su precio');
});

test('se distingue "no tengo plan" de "mi plan no cubre esta clase"', () => {
  const sinPlan = coberturaDeClase({
    socioId: SOCIA, suscripciones: [], planesTarifa: [BONO_REFORMER],
    hoyISO: HOY, tipoClaseId: MAT, precioClaseSuelta: 15,
  });
  assert.equal(sinPlan.estado, 'SIN_PLAN');
  // Con el mensaje genérico, quien tiene 8 sesiones de Reformer no entiende por
  // qué no puede apuntarse a Mat — mismo criterio que ya usa el gate.
  const noCubre = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 8 })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: MAT, precioClaseSuelta: 15,
  });
  assert.equal(noCubre.estado, 'NO_CUBRE_ESTA_CLASE');
  assert.notEqual(textoCobertura(sinPlan), textoCobertura(noCubre));
});

// ── El bug 2: decir QUÉ consume ──────────────────────────────────────────────

test('dice de qué bono sale y cuánto queda DESPUÉS', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 5 })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  const texto = textoCobertura(c);
  assert.match(texto!, /Bono 10 Reformer/);
  assert.match(texto!, /te quedarán 4/, 'el saldo es el de DESPUÉS de reservar');
});

test('la última sesión se avisa como tal, no con "te quedarán 0"', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 1 })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.match(textoCobertura(c)!, /última sesión/);
});

test('la mensual no promete descontar sesiones', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: MENSUAL_TODO.id })],
    planesTarifa: [MENSUAL_TODO], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.equal(c.estado, 'MENSUAL');
  assert.doesNotMatch(textoCobertura(c)!, /sesi/i);
});

test('con mensual Y bono a la vez gana la mensual (no se descuenta nada)', () => {
  // Con planes por tipo de clase una socia puede tener las dos cosas; decirle
  // "te quedan 3" cuando no se le va a restar nada sería mentira.
  const c = coberturaDeClase({
    socioId: SOCIA,
    suscripciones: [
      sus({ planId: BONO_REFORMER.id, sesionesRestantes: 3 }),
      sus({ planId: MENSUAL_TODO.id }),
    ],
    planesTarifa: [BONO_REFORMER, MENSUAL_TODO], hoyISO: HOY,
    tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.equal(c.estado, 'MENSUAL');
});

test('con varios bonos que cubren, el saldo es la SUMA, sin depender del orden', () => {
  const otro = plan({ id: 'p-bono-2', nombre: 'Bono 5', tipo: 'BONO', tiposClaseIds: [REFORMER] });
  const a = [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 9 }), sus({ id: 'sus-b', planId: otro.id, sesionesRestantes: 2 })];
  const base = { socioId: SOCIA, planesTarifa: [BONO_REFORMER, otro], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15 };
  const c1 = coberturaDeClase({ ...base, suscripciones: a });
  const c2 = coberturaDeClase({ ...base, suscripciones: [...a].reverse() });
  assert.deepEqual(c1, c2, 'el resultado no puede depender del orden del array');
  assert.equal(c1.estado === 'BONO' && c1.sesionesRestantes, 11, 'tiene 9 + 2, no 2');
});

test('comprar otro bono SUBE lo que se le dice que le queda', () => {
  // El fallo real (producción, 2026-08-18): con 3 sesiones vivas compró un bono
  // de 4 y la pantalla siguió diciendo lo mismo, porque enseñaba UN bono en vez
  // del saldo. Nada se perdía —la fila nueva estaba en la base— pero desde
  // fuera es indistinguible de "he pagado y no me lo han dado".
  const nuevo = plan({ id: 'p-bono-4', nombre: 'Bono 4 clases', tipo: 'BONO', sesiones: 4, tiposClaseIds: [REFORMER] });
  const base = { socioId: SOCIA, planesTarifa: [BONO_REFORMER, nuevo], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15 };
  const antes = coberturaDeClase({
    ...base, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 3, fechaFin: '2026-10-10' })],
  });
  const despues = coberturaDeClase({
    ...base,
    suscripciones: [
      sus({ planId: BONO_REFORMER.id, sesionesRestantes: 3, fechaFin: '2026-10-10' }),
      sus({ id: 'sus-nuevo', planId: nuevo.id, sesionesRestantes: 4, fechaFin: '2026-10-17' }),
    ],
  });
  assert.equal(antes.estado === 'BONO' && antes.sesionesRestantes, 3);
  assert.equal(despues.estado === 'BONO' && despues.sesionesRestantes, 7, '3 + 4, no 3');
  assert.match(textoCobertura(despues)!, /te quedarán 6/);
});

test('se nombra el bono que de verdad se va a descontar, no otro', () => {
  // El que caduca antes, aunque tenga MÁS saldo que el otro: es el que elige
  // `bonoConsumible`. Nombrar uno y descontar de otro deja a la socia viendo
  // bajar un bono que la pantalla no había mencionado.
  const caducaAntes = plan({ id: 'p-urgente', nombre: 'Bono que caduca ya', tipo: 'BONO', tiposClaseIds: [REFORMER] });
  const suscripciones = [
    sus({ id: 'sus-largo', planId: BONO_REFORMER.id, sesionesRestantes: 2, fechaFin: '2026-12-31' }),
    sus({ id: 'sus-urgente', planId: caducaAntes.id, sesionesRestantes: 8, fechaFin: '2026-08-20' }),
  ];
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones, planesTarifa: [BONO_REFORMER, caducaAntes],
    hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  const elegido = bonoConsumible(SOCIA, suscripciones, [BONO_REFORMER, caducaAntes], HOY, REFORMER);
  assert.equal(c.estado === 'BONO' && c.planNombre, 'Bono que caduca ya');
  assert.equal(c.estado === 'BONO' && c.planNombre, elegido!.plan.nombre, 'la pantalla y el consumo, el mismo bono');
});

// ── Casos que no deben afirmar nada ──────────────────────────────────────────

test('sin sesión no se inventa un saldo', () => {
  const c = coberturaDeClase({
    socioId: null, suscripciones: [], planesTarifa: [BONO_REFORMER],
    hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.equal(c.estado, 'ANONIMA');
  assert.doesNotMatch(textoCobertura(c)!, /tu /i);
  assert.equal(precioDeCobertura(c), 15);
});

test('sin precio de clase suelta configurado no se inventa un importe', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [], planesTarifa: [],
    hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: null,
  });
  assert.equal(textoCobertura(c), null);
  assert.equal(precioDeCobertura(c), null);
});

test('un bono caducado o sin sesiones no cubre; una suscripción PAUSADA tampoco', () => {
  const base = { socioId: SOCIA, planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15 };
  for (const s of [
    sus({ planId: BONO_REFORMER.id, sesionesRestantes: 0 }),
    sus({ planId: BONO_REFORMER.id, sesionesRestantes: 5, fechaFin: '2026-08-16' }),
    sus({ planId: BONO_REFORMER.id, sesionesRestantes: 5, estado: 'PAUSADA' }),
  ]) {
    assert.equal(estaCubierta(coberturaDeClase({ ...base, suscripciones: [s] })), false, JSON.stringify(s));
  }
});

test('un bono que caduca HOY todavía vale', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 2, fechaFin: HOY })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.equal(c.estado, 'BONO');
});

// ── El guardia contra la divergencia ─────────────────────────────────────────

test('coberturaDeClase y tieneEntitlementActivo NUNCA se contradicen', () => {
  // `tieneEntitlementActivo` es lo que aplica el GATE (cliente y servidor). Si
  // esta función dijera "incluida" donde el gate dice "no", la alumna vería
  // "incluida en tu bono" y al pulsar se comería un error — el bug de partida,
  // pero al revés. Esta matriz es lo que lo impide.
  const planes = [
    BONO_REFORMER,
    MENSUAL_TODO,
    plan({ id: 'p-puntual', nombre: 'Clase suelta', tipo: 'PUNTUAL' }),
    plan({ id: 'p-mensual-mat', nombre: 'Mensual Mat', tipo: 'MENSUAL', tiposClaseIds: [MAT] }),
  ];
  const suscripcionesPosibles: Suscripcion[][] = [
    [],
    [sus({ planId: 'p-bono-ref', sesionesRestantes: 3 })],
    [sus({ planId: 'p-bono-ref', sesionesRestantes: 0 })],
    [sus({ planId: 'p-mensual' })],
    [sus({ planId: 'p-mensual-mat' })],
    [sus({ planId: 'p-puntual', sesionesRestantes: 1 })],
    [sus({ planId: 'p-bono-ref', sesionesRestantes: 3 }), sus({ id: 's2', planId: 'p-mensual-mat' })],
    [sus({ planId: 'p-mensual', estado: 'PAUSADA' })],
    [sus({ planId: 'p-bono-ref', sesionesRestantes: 3, fechaFin: '2026-01-01' })],
  ];

  let comprobados = 0;
  for (const suscripciones of suscripcionesPosibles) {
    for (const tipoClaseId of [REFORMER, MAT]) {
      const c = coberturaDeClase({
        socioId: SOCIA, suscripciones, planesTarifa: planes, hoyISO: HOY, tipoClaseId, precioClaseSuelta: 15,
      });
      const gate = tieneEntitlementActivo(SOCIA, suscripciones, planes, HOY, tipoClaseId);
      assert.equal(
        estaCubierta(c), gate,
        `divergencia con ${JSON.stringify(suscripciones)} / ${tipoClaseId}: cobertura=${c.estado}, gate=${gate}`,
      );
      comprobados++;
    }
  }
  assert.equal(comprobados, 18);
});

// ── Lista de espera (auditoría de conversión, 2026-08-31): la misma
// cobertura, en futuro condicional — la sesión NO se consume al apuntarse,
// solo si acepta la oferta más tarde. Reutilizar `textoCobertura` a secas
// diría "Descuenta 1 sesión... te quedarán N" antes de que pase nada.

test('lista de espera con bono: en futuro condicional, nunca como un hecho ya pasado', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: BONO_REFORMER.id, sesionesRestantes: 5 })],
    planesTarifa: [BONO_REFORMER], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  const texto = textoCoberturaListaEspera(c);
  assert.match(texto!, /Bono 10 Reformer/);
  assert.match(texto!, /si se libera un hueco/i);
  assert.doesNotMatch(texto!, /te quedarán/, 'no debe sonar a que ya se ha descontado');
});

test('lista de espera con mensual: sigue sin prometer descuento de sesiones', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [sus({ planId: MENSUAL_TODO.id })],
    planesTarifa: [MENSUAL_TODO], hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.doesNotMatch(textoCoberturaListaEspera(c)!, /sesi/i);
});

test('lista de espera sin plan: precio también en futuro condicional', () => {
  const c = coberturaDeClase({
    socioId: SOCIA, suscripciones: [], planesTarifa: [BONO_REFORMER],
    hoyISO: HOY, tipoClaseId: REFORMER, precioClaseSuelta: 15,
  });
  assert.equal(c.estado, 'SIN_PLAN');
  assert.match(textoCoberturaListaEspera(c)!, /si se libera un hueco/i);
  assert.match(textoCoberturaListaEspera(c)!, /15/);
});

// ── La mensual gana: la pantalla y el servidor no pueden discrepar ───────────
//
// Auditoría 26ª pasada. `cobertura.ts:112` promete desde siempre que «si la
// mensual cubre, no se le descuenta ninguna sesión de bono» — y lo cumplía
// solo ella. `bonoConsumible` filtraba los planes MENSUAL como no candidatos y
// se quedaba tan ancho con el bono: pantalla «Incluida en tu cuota», servidor
// descontando una sesión. Y con el techo semanal de la mensual, la RPC gastaba
// además una recuperación: la misma clase pagada dos veces.
//
// El test NO enumera casos: RECORRE una matriz y deriva la invariante de lo que
// diga `coberturaDeClase`. Un caso nuevo (una cobertura nueva, un tipo de plan
// nuevo) entra solo en la matriz y la propiedad se le aplica sin tocar el test.
// Enumerar ejemplares no cierra una familia; esto sí.
test('invariante: si la cobertura dice MENSUAL, no se consume NI se devuelve bono', () => {
  const GYRO = 'tc-gyro';
  const MENSUAL_MAQUINA = plan({
    id: 'p-mens-maq', nombre: 'Cuota Máquina', tipo: 'MENSUAL', tiposClaseIds: [REFORMER],
  });
  const BONO_TODO = plan({ id: 'p-bono-todo', nombre: 'Bono 10', tipo: 'BONO', sesiones: 10 });

  const escenarios: { nombre: string; suscripciones: Suscripcion[]; planes: PlanTarifa[] }[] = [
    {
      nombre: 'mensual ilimitada + bono suelto',
      suscripciones: [
        sus({ id: 's-mens', planId: MENSUAL_TODO.id }),
        sus({ id: 's-bono', planId: BONO_TODO.id, sesionesRestantes: 4 }),
      ],
      planes: [MENSUAL_TODO, BONO_TODO],
    },
    {
      // El caso que abre la cuota combinada (migr 20260907030553): mensual que
      // solo cubre Máquina, y un bono para lo demás.
      nombre: 'cuota por actividad + bono para el resto',
      suscripciones: [
        sus({ id: 's-mens', planId: MENSUAL_MAQUINA.id }),
        sus({ id: 's-bono', planId: BONO_TODO.id, sesionesRestantes: 4 }),
      ],
      planes: [MENSUAL_MAQUINA, BONO_TODO],
    },
    {
      nombre: 'mensual con fecha fin todavía vigente + bono',
      suscripciones: [
        sus({ id: 's-mens', planId: MENSUAL_TODO.id, fechaFin: '2026-12-31' }),
        sus({ id: 's-bono', planId: BONO_TODO.id, sesionesRestantes: 4 }),
      ],
      planes: [MENSUAL_TODO, BONO_TODO],
    },
    {
      // Control negativo: la mensual CADUCÓ. Aquí el bono sí debe pagar, o el
      // arreglo sería un apagón de cobros disfrazado de invariante.
      nombre: 'mensual caducada + bono (el bono SÍ paga)',
      suscripciones: [
        sus({ id: 's-mens', planId: MENSUAL_TODO.id, fechaFin: '2026-01-31' }),
        sus({ id: 's-bono', planId: BONO_TODO.id, sesionesRestantes: 4 }),
      ],
      planes: [MENSUAL_TODO, BONO_TODO],
    },
  ];

  let vecesQueLaMensualGano = 0;
  let vecesQuePagoElBono = 0;
  let vecesSinTipo = 0;
  // `null` entra en la matriz a propósito (lo señaló la revisión independiente):
  // cuatro llamantes reales pueden pasarlo —`devolverSesionBono` con `sesionId`
  // opcional, y los `.find()`/`?? null` que resuelven el tipo desde la ventana
  // de sesiones cargada— y `planCubreTipoClase` responde `true` ante un nulo.
  // Sin este caso, el guardián sería más estrecho que la realidad.
  for (const e of escenarios) {
    for (const tipoClaseId of [REFORMER, MAT, GYRO, null]) {
      const c = coberturaDeClase({
        socioId: SOCIA, suscripciones: e.suscripciones, planesTarifa: e.planes,
        hoyISO: HOY, tipoClaseId, precioClaseSuelta: 15,
      });
      const consumible = bonoConsumible(SOCIA, e.suscripciones, e.planes, HOY, tipoClaseId);
      const devolvible = bonoDevolvible(SOCIA, e.suscripciones, e.planes, HOY, tipoClaseId);
      const donde = `${e.nombre} · ${tipoClaseId ?? 'SIN TIPO'}`;
      if (tipoClaseId === null) {
        // Sin clase delante no se afirma cobertura: si hay un bono apto, PAGA.
        // El caso contrario («la mensual la cubre, no descuentes») regalaría la
        // sesión cada vez que el llamante no sepa de qué clase se trata.
        vecesSinTipo++;
        const hayBonoConSaldo = e.suscripciones.some(x =>
          x.estado === 'ACTIVA' && (x.sesionesRestantes ?? 0) > 0);
        assert.equal(Boolean(consumible), hayBonoConSaldo,
          `${donde}: sin tipo de clase, la decisión de consumo no puede apoyarse en la mensual`);
        continue;
      }
      if (c.estado === 'MENSUAL') {
        vecesQueLaMensualGano++;
        assert.equal(consumible, null, `${donde}: la pantalla dice «incluida» y el servidor descontaría un bono`);
        assert.equal(devolvible, null, `${donde}: cancelar regalaría una sesión que nunca se gastó`);
      }
      if (c.estado === 'BONO') {
        vecesQuePagoElBono++;
        assert.ok(consumible, `${donde}: la pantalla nombra un bono y el servidor no descontaría de ninguno`);
        assert.equal(consumible!.plan.nombre, c.planNombre,
          `${donde}: se nombra un bono y se descuenta de otro`);
      }
    }
  }
  // Control positivo de la propia matriz: si un refactor dejara todos los casos
  // en SIN_PLAN, los asserts de arriba pasarían sin comprobar nada.
  assert.ok(vecesQueLaMensualGano >= 4, `la matriz no ejerció el caso MENSUAL (${vecesQueLaMensualGano})`);
  assert.ok(vecesQuePagoElBono >= 3, `la matriz no ejerció el caso BONO (${vecesQuePagoElBono})`);
  assert.equal(vecesSinTipo, escenarios.length, 'la matriz no ejerció el caso «sin tipo de clase»');
});
