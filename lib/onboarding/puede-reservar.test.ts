import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  avisoListo, finalDelParrafo, leerRespuestaPuedeReservar, prometeReservas, puedeReservarAlumnaNueva,
  veredictoSinPreguntarAStripe,
  type DatosPuedeReservar, type PlanPuedeReservar, type ResultadoPuedeReservar,
} from './puede-reservar.ts';
import { instanteDeApertura } from '../booking-logic.ts';
import { inicioDelDiaEstudio } from '../utils.ts';
import { AVISO_VENTA_SIN_STRIPE, avisoVentaOnline } from '../onboarding.ts';
import { evaluarListo } from '../opening/listo.ts';

// «Tu estudio ya puede recibir reservas» solo puede prometer que cualquiera
// reserva si una alumna NUEVA puede de verdad. Cada caso de esta tabla es una
// combinación de ajustes que el gate real (crearReservaPublica + reservar_plaza)
// resuelve de una forma concreta, y esto tiene que resolverla igual.

const AHORA = new Date('2026-10-05T10:00:00Z');
const MANANA = '2026-10-06T08:00:00Z';

const BONO: PlanPuedeReservar = { id: 'bono', activo: true, precio: 50 };

function datos(cambios: Partial<Omit<DatosPuedeReservar, 'estudio'>> & { estudio?: Partial<DatosPuedeReservar['estudio']> } = {}): DatosPuedeReservar {
  const { estudio, ...resto } = cambios;
  return {
    sesiones: [{ inicio: MANANA, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }],
    tipos: [
      { id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: false },
      { id: 'tc-2', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: false },
    ],
    planes: [BONO],
    cierres: [],
    stripe: 'PUEDE',
    ...resto,
    estudio: {
      paginaOculta: false, paginaConClave: false,
      reservaExigirPlan: true, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null,
      reservaAntelacionHora: null, aperturaSuave: false, fechaApertura: null,
      ...estudio,
    },
  };
}

const evaluar = (d: DatosPuedeReservar) => puedeReservarAlumnaNueva(d, AHORA);

const CASOS: { caso: string; d: DatosPuedeReservar; espera: ResultadoPuedeReservar }[] = [
  { caso: '(1) exige bono, hay uno a la venta que la cubre y Stripe cobra', d: datos(), espera: { estado: 'SI' } },
  { caso: '(2) lo mismo sin Stripe: la evaluación del 13-sep', d: datos({ stripe: 'SIN_CUENTA' }), espera: { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' } },
  { caso: '(3) Stripe conectado pero sin charges_enabled', d: datos({ stripe: 'NO_PUEDE' }), espera: { estado: 'NO', motivo: 'STRIPE_NO_PUEDE' } },
  { caso: '(4) Stripe no contesta y era lo único que faltaba', d: datos({ stripe: 'SIN_RESPUESTA' }), espera: { estado: 'SIN_COMPROBAR', motivo: 'STRIPE' } },
  {
    caso: '(5) exige bono pero no hay ninguna tarifa activa: el gate no bloquea',
    d: datos({ planes: [{ ...BONO, activo: false }], stripe: 'SIN_CUENTA' }), espera: { estado: 'SI' },
  },
  {
    caso: '(6) la única tarifa activa es la clase de prueba: no hay nada que contratar',
    d: datos({ planes: [{ id: 'prueba', activo: true, precio: 15, esPrueba: true }], stripe: 'SIN_CUENTA' }), espera: { estado: 'SI' },
  },
  {
    caso: '(7) el único plan a la venta es de otro tipo de clase',
    d: datos({ planes: [{ ...BONO, tiposClaseIds: ['tc-2'] }] }), espera: { estado: 'NO', motivo: 'SIN_PLAN_QUE_CUBRA' },
  },
  {
    caso: '(7b) la clase de prueba no es salida: desde el enlace que se comparte no se vende',
    // Sin tipos cubriría cualquier clase, pero solo se ofrece en `?prueba=1` y
    // ni el checkout ni la tienda la venden (`planesComprablesParaReservar`). El
    // bono de tc-2 hace que se exija plan, y para tc-1 no hay nada que comprar.
    d: datos({ planes: [{ ...BONO, tiposClaseIds: ['tc-2'] }, { id: 'prueba', activo: true, precio: 15, esPrueba: true }] }),
    espera: { estado: 'NO', motivo: 'SIN_PLAN_QUE_CUBRA' },
  },
  {
    caso: '(8) un plan sin tipos asignados cubre todos, como en el checkout',
    d: datos({ planes: [{ ...BONO, tiposClaseIds: [] }] }), espera: { estado: 'SI' },
  },
  {
    caso: '(9) el tipo de clase no pide bono aunque el estudio sí: sin Stripe se reserva igual',
    d: datos({
      stripe: 'SIN_CUENTA',
      tipos: [{ id: 'tc-1', reservaExigirPlan: false, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: false }],
    }),
    espera: { estado: 'SI' },
  },
  {
    caso: '(10) solo hay clases pasadas o canceladas',
    d: datos({ sesiones: [
      { inicio: '2026-10-04T08:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' },
      { inicio: MANANA, cancelada: true, aforoMaximo: 8, tipoClaseId: 'tc-1' },
    ] }),
    espera: { estado: 'NO', motivo: 'SIN_CLASE_FUTURA' },
  },
];

for (const { caso, d, espera } of CASOS) {
  test(caso, () => assert.deepEqual(evaluar(d), espera));
}

test('(11) con 7 días de antelación y la clase a 17, dice cuándo se abre: el mismo instante que el servidor', () => {
  const inicio = '2026-10-22T09:00:00Z';
  const r = evaluar(datos({ sesiones: [{ inicio, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }], estudio: { reservaAntelacionMaximaDias: 7 } }));
  assert.deepEqual(r, {
    estado: 'NO', motivo: 'ANTELACION', antelacionDias: 7, abreEl: instanteDeApertura(inicio, 7, null).toISOString(),
  });
  // Y la antelación del TIPO manda sobre la del estudio (heredaOverride).
  const conTipo = evaluar(datos({
    sesiones: [{ inicio, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }],
    estudio: { reservaAntelacionMaximaDias: 7 },
    tipos: [{ id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: 30, requiereAutorizacion: false }],
  }));
  assert.deepEqual(conTipo, { estado: 'SI' });
});

test('(12) apertura suave: las clases de antes del día de apertura no son para una alumna nueva', () => {
  const r = evaluar(datos({ estudio: { aperturaSuave: true, fechaApertura: '2026-10-15' } }));
  assert.deepEqual(r, { estado: 'NO', motivo: 'APERTURA_SUAVE', abreEl: inicioDelDiaEstudio('2026-10-15') });
  // Las de después de abrir, sí: la regla es por fecha, igual que en el servidor.
  const despues = evaluar(datos({
    estudio: { aperturaSuave: true, fechaApertura: '2026-10-15' },
    sesiones: [{ inicio: '2026-10-16T08:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }],
  }));
  assert.deepEqual(despues, { estado: 'SI' });
  // Sin fecha no hay corte (cierreAperturaSuave hace lo mismo).
  assert.deepEqual(evaluar(datos({ estudio: { aperturaSuave: true, fechaApertura: null } })), { estado: 'SI' });
});

test('(13) una clase sin instructora cuenta: el gate solo la mira para el rol INSTRUCTOR', () => {
  // `evaluarListo` sí la exige, y por eso no se reutiliza tal cual.
  const listo = evaluarListo({
    sesiones: [{ inicio: MANANA, cancelada: false, tipoClaseId: 'tc-1', instructorId: null, aforoMaximo: 8 }],
    slug: 's', exigirPlan: false, planes: [], tiposPorPlan: {}, stripe: 'SIN_CUENTA',
    fiscal: { nif: null, razonSocial: null, direccion: null, codigoPostal: null, ciudad: null },
    antelacionMaximaDias: null,
  }, AHORA, () => true);
  assert.equal(listo.find(c => c.id === 'clases')?.estado, 'FALTA');
  assert.deepEqual(evaluar(datos({ estudio: { reservaExigirPlan: false }, stripe: 'SIN_CUENTA' })), { estado: 'SI' });
});

test('(14) donde el aviso del cliente avisa, el servidor nunca dice que sí', () => {
  const variantesPlanes: PlanPuedeReservar[][] = [
    [], [BONO], [{ ...BONO, activo: false }], [{ ...BONO, precio: 0 }], [{ ...BONO, tiposClaseIds: ['tc-2'] }],
  ];
  let avisos = 0;
  for (const cuenta of [null, 'acct_1']) {
    for (const exigir of [true, false]) {
      for (const planes of variantesPlanes) {
        const aviso = avisoVentaOnline({ stripeAccountId: cuenta, reservaExigirPlan: exigir, numPlanesActivos: planes.filter(p => p.activo).length });
        if (!aviso) continue;
        avisos++;
        const r = evaluar(datos({ planes, stripe: cuenta ? 'PUEDE' : 'SIN_CUENTA', estudio: { reservaExigirPlan: exigir } }));
        assert.notEqual(r.estado, 'SI', `avisa y el servidor dice que sí: ${JSON.stringify({ cuenta, exigir, planes })}`);
      }
    }
  }
  assert.ok(avisos >= 3, 'la tabla tiene que cubrir de verdad los casos que avisan');
  // La excepción, al revés: con solo la clase de prueba activa el cliente avisa
  // (cuenta tarifas activas) y el gate NO bloquea. Quien se equivoca es el
  // aviso, y por eso la pantalla deja que lo corrija el servidor.
  const soloPrueba = [{ id: 'prueba', activo: true, precio: 15, esPrueba: true }];
  assert.ok(avisoVentaOnline({ stripeAccountId: null, reservaExigirPlan: true, numPlanesActivos: 1 }));
  const r = evaluar(datos({ planes: soloPrueba, stripe: 'SIN_CUENTA' }));
  assert.deepEqual(r, { estado: 'SI' });
  assert.equal(avisoListo(r, AVISO_VENTA_SIN_STRIPE), null);
});

// ─── Más allá de la tabla de la spec: el resto del gate ──────────────────────

test('basta una clase que pase, y si ninguna pasa se cuenta dónde se quedó la que más lejos llegó', () => {
  const lejana = { inicio: '2026-10-22T09:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' };
  const cercana = { inicio: MANANA, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' };
  const sinPlan = { inicio: MANANA, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-2' };
  // La cercana está en plazo y solo le falta Stripe; la lejana ni ha abierto. Lo
  // que hay que arreglar es Stripe, no la antelación.
  assert.deepEqual(
    evaluar(datos({ sesiones: [lejana, cercana], stripe: 'NO_PUEDE', estudio: { reservaAntelacionMaximaDias: 7 } })),
    { estado: 'NO', motivo: 'STRIPE_NO_PUEDE' },
  );
  // Una de Mat que no pide bono basta, aunque la de Reformer no tenga plan.
  assert.deepEqual(evaluar(datos({
    sesiones: [sinPlan, cercana], stripe: 'SIN_CUENTA', planes: [{ ...BONO, tiposClaseIds: ['tc-1'] }],
    tipos: [
      { id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: false },
      { id: 'tc-2', reservaExigirPlan: false, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: false },
    ],
  })), { estado: 'SI' });
});

test('un cierre del centro tapa la clase: reservar_plaza la rechaza ese día', () => {
  const cierre = { id: 'c', desde: '2026-10-06', hasta: '2026-10-06', motivo: null };
  assert.deepEqual(evaluar(datos({ cierres: [cierre] })), { estado: 'NO', motivo: 'CIERRE' });
  // El día del cierre es el del ESTUDIO, no el de UTC (como `fecha_en_cierre`,
  // que convierte a Europe/Madrid).
  assert.deepEqual(
    evaluar(datos({ cierres: [cierre], sesiones: [{ inicio: '2026-10-05T22:30:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }] })),
    { estado: 'NO', motivo: 'CIERRE' }, '22:30 UTC del 5 son las 00:30 del 6 en Madrid: cae en el cierre',
  );
  assert.deepEqual(
    evaluar(datos({ cierres: [cierre], sesiones: [{ inicio: '2026-10-06T22:30:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }] })),
    { estado: 'SI' }, '22:30 UTC del 6 son las 00:30 del 7 en Madrid: ya no',
  );
});

test('«solo para alumnas autorizadas»: una alumna nueva no puede', () => {
  const r = evaluar(datos({
    tipos: [{ id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: true }],
  }));
  assert.deepEqual(r, { estado: 'NO', motivo: 'NECESITA_AUTORIZACION' });
});

test('una clase sin plazas o dentro de la ventana mínima no es una clase que se pueda reservar', () => {
  assert.deepEqual(evaluar(datos({ sesiones: [{ inicio: MANANA, cancelada: false, aforoMaximo: 0, tipoClaseId: 'tc-1' }] })),
    { estado: 'NO', motivo: 'SIN_CLASE_FUTURA' });
  const enMediaHora = '2026-10-05T10:30:00Z';
  assert.deepEqual(evaluar(datos({
    sesiones: [{ inicio: enMediaHora, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }],
    estudio: { reservaVentanaMinimaMinutos: 60 },
  })), { estado: 'NO', motivo: 'SIN_CLASE_FUTURA' });
  // Con la ventana del tipo a 15 min, la misma clase sí entra.
  assert.deepEqual(evaluar(datos({
    sesiones: [{ inicio: enMediaHora, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }],
    estudio: { reservaVentanaMinimaMinutos: 60 },
    tipos: [{ id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: 15, reservaAntelacionMaximaDias: null, requiereAutorizacion: false }],
  })), { estado: 'SI' });
});

test('una tarifa activa a 0 € obliga a tener plan pero no se puede comprar', () => {
  // `exigePlanAlReservar` la cuenta (hay algo que contratar) y el checkout no la
  // vende: la alumna nueva se queda sin salida.
  assert.deepEqual(evaluar(datos({ planes: [{ ...BONO, precio: 0 }] })), { estado: 'NO', motivo: 'SIN_PLAN_QUE_CUBRA' });
});

test('un no por la fecha no tapa lo que no se arregla esperando', () => {
  // La evaluación del 13-sep (sin Stripe, exige bono, un bono a la venta) con la
  // única clase fuera de plazo: «no se podrá reservar hasta el 15» daría a
  // entender que el 15 sí, y sin Stripe tampoco. Se cuenta lo de Stripe.
  const lejana = { inicio: '2026-10-22T09:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' };
  assert.deepEqual(
    evaluar(datos({ stripe: 'SIN_CUENTA', sesiones: [lejana], estudio: { reservaAntelacionMaximaDias: 7 } })),
    { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' },
  );
  assert.deepEqual(
    evaluar(datos({ stripe: 'NO_PUEDE', sesiones: [lejana], estudio: { reservaAntelacionMaximaDias: 7 } })),
    { estado: 'NO', motivo: 'STRIPE_NO_PUEDE' },
  );
  // Con la apertura suave, igual: las fundadoras tampoco podrían comprarlo online.
  assert.deepEqual(
    evaluar(datos({ stripe: 'SIN_CUENTA', estudio: { aperturaSuave: true, fechaApertura: '2026-10-15' } })),
    { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' },
  );
  // Y con el cierre, el plan que no la cubre y la autorización.
  const cierre = { id: 'c', desde: '2026-10-06', hasta: '2026-10-06', motivo: null };
  assert.deepEqual(evaluar(datos({ cierres: [cierre], planes: [{ ...BONO, tiposClaseIds: ['tc-2'] }] })),
    { estado: 'NO', motivo: 'SIN_PLAN_QUE_CUBRA' });
  assert.deepEqual(evaluar(datos({
    cierres: [cierre],
    tipos: [{ id: 'tc-1', reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, requiereAutorizacion: true }],
  })), { estado: 'NO', motivo: 'NECESITA_AUTORIZACION' });
  // Si Stripe no contesta, no se sabe si eso fallará: se queda la fecha, que sí se sabe.
  assert.deepEqual(
    evaluar(datos({ stripe: 'SIN_RESPUESTA', sesiones: [lejana], estudio: { reservaAntelacionMaximaDias: 7 } })),
    { estado: 'NO', motivo: 'ANTELACION', antelacionDias: 7, abreEl: instanteDeApertura(lejana.inicio, 7, null).toISOString() },
  );
});

test('la fecha que se cuenta es la de una clase que SÍ se podrá reservar cuando llegue', () => {
  // La de Mat (sin plan que la cubra) abre antes; la de Reformer, que sí tiene
  // bono, abre el 15. Decir «hasta el 13» prometería una clase que ese día
  // tampoco se puede reservar.
  const mat = { inicio: '2026-10-20T09:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-2' };
  const reformer = { inicio: '2026-10-22T09:00:00Z', cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' };
  const r = evaluar(datos({
    sesiones: [mat, reformer], planes: [{ ...BONO, tiposClaseIds: ['tc-1'] }], estudio: { reservaAntelacionMaximaDias: 7 },
  }));
  assert.deepEqual(r, { estado: 'NO', motivo: 'ANTELACION', antelacionDias: 7, abreEl: instanteDeApertura(reformer.inicio, 7, null).toISOString() });
});

test('con la página oculta no reserva nadie de fuera, aunque todo lo demás esté bien', () => {
  // `fetchPublicStudioData` no enseña clases y las puertas que escriben dicen
  // que no sin el pase de la clave (lib/publico/pagina-cerrada-peticion.ts).
  assert.deepEqual(evaluar(datos({ estudio: { paginaOculta: true, paginaConClave: true } })),
    { estado: 'NO', motivo: 'PAGINA_OCULTA', conClave: true });
  assert.deepEqual(evaluar(datos({ estudio: { paginaOculta: true }, sesiones: [] })),
    { estado: 'NO', motivo: 'PAGINA_OCULTA', conClave: false }, 'va antes que todo: no es de una clase');
  // Y el aviso no dice que está abierta, ni el párrafo tampoco.
  const conClave = leerRespuestaPuedeReservar(JSON.parse(JSON.stringify({ estado: 'NO', motivo: 'PAGINA_OCULTA', conClave: true })));
  assert.match(avisoListo(conClave, null) ?? '', /^Tu página está oculta: .* solo podrá reservar quien entre con tu clave\. Para abrirla, ve a Configuración > Mi app y mi web > Ocultar tu página\.$/);
  assert.match(avisoListo({ estado: 'NO', motivo: 'PAGINA_OCULTA', conClave: false }, null) ?? '', /sin clave: .* desde fuera no puede reservar nadie/);
  assert.match(avisoListo({ estado: 'NO', motivo: 'PAGINA_OCULTA' }, null) ?? '', /^Tu página está oculta: /);
  assert.equal(finalDelParrafo(conClave, null), null);
  assert.equal(prometeReservas(conClave, null), false);
});

test('el ajuste del estudio sin valor se lee como «se exige», el defecto del servidor', () => {
  assert.deepEqual(evaluar(datos({ stripe: 'SIN_CUENTA', estudio: { reservaExigirPlan: null } })),
    { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' });
});

test('a Stripe solo se le pregunta cuando su respuesta cambia el veredicto', () => {
  // Es lo que deja al servidor no gastar 2,5 s en Stripe sin necesidad: si
  // `veredictoSinPreguntarAStripe` contesta, conteste lo que conteste Stripe sale
  // eso mismo; si no contesta, cobre o no cobre sale distinto.
  const LEJANA = '2026-10-22T09:00:00Z';
  const variantes: DatosPuedeReservar[] = [
    datos(), datos({ planes: [] }), datos({ planes: [{ ...BONO, tiposClaseIds: ['tc-2'] }] }),
    datos({ estudio: { reservaExigirPlan: false } }), datos({ sesiones: [] }),
    datos({ estudio: { paginaOculta: true } }),
    // Con la fecha por medio, Stripe cambia el MOTIVO sin que ninguno sea un
    // «sin comprobar»: comparando solo SIN_COMPROBAR, aquí no se le preguntaba.
    datos({ estudio: { reservaAntelacionMaximaDias: 1 }, sesiones: [{ inicio: LEJANA, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }] }),
    datos({ estudio: { reservaAntelacionMaximaDias: 1, reservaExigirPlan: false }, sesiones: [{ inicio: LEJANA, cancelada: false, aforoMaximo: 8, tipoClaseId: 'tc-1' }] }),
  ];
  let sinPreguntar = 0;
  let preguntando = 0;
  for (const d of variantes) {
    const { stripe: _, ...sinStripe } = d;
    const v = veredictoSinPreguntarAStripe(sinStripe, AHORA);
    if (v) {
      sinPreguntar++;
      for (const stripe of ['PUEDE', 'NO_PUEDE', 'SIN_RESPUESTA'] as const) assert.deepEqual(evaluar({ ...d, stripe }), v);
    } else {
      preguntando++;
      assert.notDeepEqual(evaluar({ ...d, stripe: 'PUEDE' }), evaluar({ ...d, stripe: 'NO_PUEDE' }));
    }
  }
  assert.ok(sinPreguntar >= 4 && preguntando >= 2, 'sin casos de los dos lados, este test no prueba nada');
});

// ─── Lo que lee la pantalla ──────────────────────────────────────────────────

test('la respuesta se lee sin dar por hecha su forma', () => {
  assert.deepEqual(leerRespuestaPuedeReservar({}), { estado: 'SIN_COMPROBAR' });
  assert.deepEqual(leerRespuestaPuedeReservar(null), { estado: 'SIN_COMPROBAR' });
  assert.deepEqual(leerRespuestaPuedeReservar('SI'), { estado: 'SIN_COMPROBAR' });
  assert.deepEqual(leerRespuestaPuedeReservar({ estado: 'NO' }), { estado: 'SIN_COMPROBAR' }, 'un NO sin motivo no es un NO que se pueda contar');
  assert.deepEqual(leerRespuestaPuedeReservar({ estado: 'SI', extra: 1 }), { estado: 'SI' });
  assert.deepEqual(leerRespuestaPuedeReservar({ estado: 'NO', motivo: 'OTRO', abreEl: 'no-es-fecha', antelacionDias: 'siete' }),
    { estado: 'NO', motivo: 'OTRO' });
});

test('el aviso y la promesa salen de la MISMA respuesta', () => {
  const cliente = AVISO_VENTA_SIN_STRIPE;
  // Mientras espera: el aviso del cliente, y ninguna promesa todavía.
  assert.equal(avisoListo(null, cliente), cliente);
  assert.equal(prometeReservas(null, null), false);
  // Sí: ni aviso ni duda.
  assert.equal(avisoListo({ estado: 'SI' }, cliente), null);
  assert.equal(prometeReservas({ estado: 'SI' }, cliente), true);
  // No: el aviso del servidor, y nunca la promesa.
  const noPuede = { estado: 'NO', motivo: 'STRIPE_NO_PUEDE' } as const;
  assert.match(avisoListo(noPuede, null) ?? '', /Stripe aún no puede cobrar/);
  assert.equal(prometeReservas(noPuede, null), false);
  assert.equal(avisoListo({ estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' }, null), AVISO_VENTA_SIN_STRIPE);
  // Sin clase por venir no hay aviso que dar, y tampoco promesa.
  assert.equal(avisoListo({ estado: 'NO', motivo: 'SIN_CLASE_FUTURA' }, cliente), null);
  assert.equal(prometeReservas({ estado: 'NO', motivo: 'SIN_CLASE_FUTURA' }, null), false);
  // Un motivo que esta versión no conoce: el aviso de siempre, sin promesa.
  assert.equal(avisoListo({ estado: 'NO', motivo: 'NUEVO' }, cliente), cliente);
  assert.equal(prometeReservas({ estado: 'NO', motivo: 'NUEVO' }, null), false);
  // Sin poder ni preguntar (red, 500, `{}`): exactamente lo que decía la pantalla antes.
  assert.equal(avisoListo({ estado: 'SIN_COMPROBAR' }, cliente), cliente);
  assert.equal(prometeReservas({ estado: 'SIN_COMPROBAR' }, cliente), false);
  assert.equal(prometeReservas({ estado: 'SIN_COMPROBAR' }, null), true);
  // Pero el SIN_COMPROBAR del SERVIDOR sabe que depende de Stripe: con cuenta
  // conectada el cliente nunca avisa, y prometer aquí era la mentira de antes.
  const stripeSinContestar = leerRespuestaPuedeReservar({ estado: 'SIN_COMPROBAR', motivo: 'STRIPE' });
  assert.deepEqual(stripeSinContestar, { estado: 'SIN_COMPROBAR', motivo: 'STRIPE' });
  assert.equal(prometeReservas(stripeSinContestar, null), false);
  assert.match(avisoListo(stripeSinContestar, null) ?? '', /No hemos podido comprobar si Stripe ya puede cobrar/);
  assert.equal(finalDelParrafo(stripeSinContestar, null), 'Tu página está abierta.');
  // Un motivo de duda que esta versión no conoce: tampoco promete.
  assert.equal(prometeReservas({ estado: 'SIN_COMPROBAR', motivo: 'OTRO' }, null), false);
  assert.equal(avisoListo({ estado: 'SIN_COMPROBAR', motivo: 'OTRO' }, cliente), cliente);
  // Y el servidor solo contesta SIN_COMPROBAR con su motivo.
  assert.deepEqual(evaluar(datos({ stripe: 'SIN_RESPUESTA' })), stripeSinContestar);
});

test('el párrafo no dice nada de la página hasta saberlo', () => {
  // Mientras espera, ni «abierta» (con la página oculta es falso) ni la promesa.
  assert.equal(finalDelParrafo(null, null), null);
  assert.equal(finalDelParrafo(null, AVISO_VENTA_SIN_STRIPE), null);
  assert.equal(finalDelParrafo({ estado: 'SI' }, null), 'Tu página está abierta: cualquiera con este enlace puede reservar.');
  assert.equal(finalDelParrafo({ estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' }, null), 'Tu página está abierta.');
  assert.equal(finalDelParrafo({ estado: 'SIN_COMPROBAR' }, null), 'Tu página está abierta: cualquiera con este enlace puede reservar.');
  assert.equal(finalDelParrafo({ estado: 'SIN_COMPROBAR' }, AVISO_VENTA_SIN_STRIPE), 'Tu página está abierta.');
});

test('los avisos con fecha la escriben en el día del estudio', () => {
  const abre = instanteDeApertura('2026-10-22T09:00:00Z', 7, null).toISOString();
  assert.equal(avisoListo({ estado: 'NO', motivo: 'ANTELACION', abreEl: abre, antelacionDias: 7 }, null),
    'Solo dejas reservar con 7 días de antelación: tu primera clase no se podrá reservar hasta el 15 de octubre.');
  assert.match(avisoListo({ estado: 'NO', motivo: 'ANTELACION', abreEl: abre, antelacionDias: 1 }, null) ?? '', /con 1 día de/);
  // Sin la fecha no se inventa una frase: vuelve el aviso de siempre.
  assert.equal(avisoListo({ estado: 'NO', motivo: 'ANTELACION' }, 'aviso'), 'aviso');
  // La apertura del día 15 empieza a medianoche de Madrid (22:00 UTC del 14).
  assert.match(avisoListo({ estado: 'NO', motivo: 'APERTURA_SUAVE', abreEl: inicioDelDiaEstudio('2026-10-15') }, null) ?? '',
    /hasta el 15 de octubre estas clases solo las reservan tus fundadoras e invitadas/);
});
