// Cada estado de Tenti en su momento (lib/tenti/momentos.ts): que cada función
// solo devuelva lo que el MAPA dice de su sitio, que cada estado y emoción
// tenga significado y sitio, y las reglas una a una.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOCIONES, ESTADOS, type EmocionTenti, type EstadoTenti } from './motor.ts';
import {
  DECIDEN, FRASE_DORMIDO, estadoDelVeredicto, MAPA, SIGNIFICADO, SIN_SITIO_TODAVIA, UMBRAL_AGOBIO,
  emocionDeHoy, esRecordDelDia, estadoDeHoy, estadoDeLaBandeja, estadoDeLaMigracion, estadoDelAutonomo,
  fraseDeHoy, maxAlumnasAntesDe, primerasVecesHoy, subio,
} from './momentos.ts';

const TODOS_LOS_ESTADOS = Object.keys(ESTADOS) as EstadoTenti[];
const TODAS_LAS_EMOCIONES = Object.keys(EMOCIONES) as EmocionTenti[];

// Lo que puede devolver cada función, recorriendo su dominio entero.
const DOMINIO: Record<keyof typeof DECIDEN, () => unknown[]> = {
  estadoDeLaBandeja: () => [null, undefined, -1, 0, 1, 2, UMBRAL_AGOBIO - 1, UMBRAL_AGOBIO, 40].map(estadoDeLaBandeja),
  estadoDelAutonomo: () => [null, 0, 1, 5].flatMap(e => [0, 1, 3].map(f => estadoDelAutonomo({ esperandoEnBandeja: e, fallidasHoy: f }))),
  estadoDeHoy: () => {
    const clases = [
      [], [{ finalizada: true, estado: 'OK', senal: 'OK', pendientes: 0 }],
      [{ finalizada: false, estado: 'OK', senal: 'OK', pendientes: 0 }],
      [{ finalizada: true, estado: 'OK', senal: 'PROBLEMA', pendientes: 0 }],
    ] as unknown as Parameters<typeof estadoDeHoy>[0]['clases'][];
    return [true, false].flatMap(esHoy => [true, false].flatMap(cargando => [true, false].flatMap(fallo =>
      clases.map(c => estadoDeHoy({ esHoy, cargando, fallo, clases: c })))));
  },
  estadoDeLaMigracion: () => [true, false].flatMap(deshecho => [[], [{}], [{ error: 'x' }]].map(resultados => estadoDeLaMigracion({ resultados, deshecho }))),
  estadoDelVeredicto: () => {
    const out: unknown[] = [];
    for (const tipo of ['MENSAJE', 'SILENCIO', 'SIN_ANALIZAR'] as const)
      for (const analisis of ['quieto', 'en-curso', 'tardando'] as const)
        for (const b of [0, 1, 2, 3, 4, 5, 6, 7].map(i => [!!(i & 1), !!(i & 2), !!(i & 4)]))
          for (const fallidasHoy of [0, 1])
            out.push(estadoDelVeredicto({ tipo, analisis, hayRecomendacion: b[0], pospuesta: b[1], efectoCobra: b[2], recienTerminado: b[0], recienRespondido: b[1], fallidasHoy }));
    return out;
  },
};

test('cada función devuelve solo estados que MAPA da a su sitio (o null: sin Tenti)', () => {
  for (const [fichero, s] of Object.entries(MAPA)) {
    if (!s.funcion) continue;
    for (const e of DOMINIO[s.funcion]()) {
      if (e === null) continue;
      assert.ok(s.estados.includes(e as EstadoTenti), `${fichero}: ${s.funcion} devuelve '${String(e)}', que su sitio no tiene en MAPA`);
    }
  }
  for (const s of Object.values(MAPA)) {
    for (const l of s.literales) assert.ok(s.estados.includes(l), `${s.sitio}: el literal '${l}' no está en sus estados`);
  }
});

test('cada estado tiene significado y al menos un sitio (salvo lo que espera su PR, con motivo)', () => {
  const conSitio = new Set(Object.values(MAPA).flatMap(s => s.estados));
  for (const e of TODOS_LOS_ESTADOS) {
    assert.ok(SIGNIFICADO.estados[e]?.es, `'${e}' sin significado`);
    assert.ok(conSitio.has(e) || SIN_SITIO_TODAVIA[e], `'${e}' no tiene ningún sitio en MAPA`);
    assert.ok(!(conSitio.has(e) && SIN_SITIO_TODAVIA[e]), `'${e}' ya tiene sitio: quítalo de SIN_SITIO_TODAVIA`);
  }
  assert.deepEqual(Object.keys(SIN_SITIO_TODAVIA), ['buscando'], 'la única excepción es buscando, que llega con el asistente');
});

test('cada emoción tiene significado y un sitio', () => {
  const conSitio = new Set(Object.values(MAPA).flatMap(s => s.emociones));
  for (const e of TODAS_LAS_EMOCIONES) {
    assert.ok(SIGNIFICADO.emociones[e]?.es, `'${e}' sin significado`);
    assert.ok(conSitio.has(e), `'${e}' no tiene ningún sitio en MAPA`);
  }
});

test('estadoDeLaBandeja: sin cifra o cero, sin Tenti; de 1 a 9, espera tu visto bueno; desde 10, agobiado', () => {
  assert.equal(UMBRAL_AGOBIO, 10);
  assert.equal(estadoDeLaBandeja(null), null);
  assert.equal(estadoDeLaBandeja(0), null);
  assert.equal(estadoDeLaBandeja(1), 'esperaTuOk');
  assert.equal(estadoDeLaBandeja(9), 'esperaTuOk');
  assert.equal(estadoDeLaBandeja(10), 'agobiado');
});

test('estadoDelAutonomo: lo que espera va antes que lo que falló; sin la bandeja, reposo', () => {
  assert.equal(estadoDelAutonomo({ esperandoEnBandeja: 2, fallidasHoy: 3 }), 'esperaTuOk');
  assert.equal(estadoDelAutonomo({ esperandoEnBandeja: 0, fallidasHoy: 1 }), 'error');
  assert.equal(estadoDelAutonomo({ esperandoEnBandeja: 0, fallidasHoy: 0 }), 'reposo');
  assert.equal(estadoDelAutonomo({ esperandoEnBandeja: null, fallidasHoy: 4 }), 'reposo', 'la cara no afirma lo que la bandeja no ha contado');
});

test('estadoDeHoy: un problema en una clase terminada no se duerme, y otro día nunca', () => {
  const fin = { finalizada: true, estado: 'FINALIZADA', senal: 'OK', pendientes: 0 } as const;
  const base = { esHoy: true, cargando: false, fallo: false };
  assert.equal(estadoDeHoy({ ...base, clases: [] }), 'dormido', 'sin clases, el estudio descansa');
  assert.equal(estadoDeHoy({ ...base, clases: [fin, { ...fin, estado: 'CANCELADA', finalizada: false }] as never }), 'dormido');
  assert.equal(estadoDeHoy({ ...base, clases: [fin, { ...fin, senal: 'PROBLEMA' }] as never }), 'reposo');
  assert.equal(estadoDeHoy({ ...base, clases: [{ ...fin, pendientes: 1 }] as never }), 'reposo');
  assert.equal(estadoDeHoy({ ...base, clases: [fin, { ...fin, finalizada: false }] as never }), 'reposo', 'queda una clase');
  assert.equal(estadoDeHoy({ ...base, esHoy: false, clases: [] }), 'reposo', 'otro día no se duerme');
  assert.equal(estadoDeHoy({ ...base, cargando: true, clases: [] }), 'reposo');
  assert.equal(estadoDeHoy({ ...base, fallo: true, clases: [] }), 'reposo', 'una agenda que no carga no es un estudio que descansa');
});

test('la frase de dormido dice que Tentare sigue: nunca se lee «Tentare apagado»', () => {
  for (const f of Object.values(FRASE_DORMIDO)) assert.match(f, /Tentare sigue/);
  const sin = fraseDeHoy({ resumen: { problemas: 0, alumnas: 0 }, clases: [], primerasVeces: 0, record: false, estado: 'dormido' });
  assert.equal(sin?.texto, FRASE_DORMIDO.sinClases);
  const fin = fraseDeHoy({
    resumen: { problemas: 0, alumnas: 4 }, clases: [{ finalizada: true, estado: 'FINALIZADA', huecos: 2 }] as never,
    primerasVeces: 0, record: false, estado: 'dormido',
  });
  assert.equal(fin?.texto, FRASE_DORMIDO.terminadas, 'los huecos de una clase ya dada no se ofrecen');
});

test('fraseDeHoy: primero quien viene por primera vez, luego lo encontrado, el récord y el descanso', () => {
  const clases = [{ finalizada: false, estado: 'OK', huecos: 3 }] as never;
  assert.deepEqual(fraseDeHoy({ resumen: { problemas: 0, alumnas: 12 }, clases, primerasVeces: 0, record: false, estado: 'reposo' }),
    { texto: 'Tentare ha encontrado 1 clase con hueco que puedes llenar.', soloHuecos: true });
  assert.equal(fraseDeHoy({ resumen: { problemas: 0, alumnas: 12 }, clases, primerasVeces: 2, record: true, estado: 'reposo' })?.texto,
    '2 alumnas vienen hoy por primera vez. Tentare ha encontrado 1 clase con hueco que puedes llenar. Hoy es el día con más alumnas desde que usas Tentare (12).');
  assert.equal(fraseDeHoy({ resumen: { problemas: 0, alumnas: 0 }, clases: [], primerasVeces: 1, record: false, estado: 'dormido' })?.texto,
    `Una alumna ha venido hoy por primera vez. ${FRASE_DORMIDO.sinClases}`);
  assert.equal(fraseDeHoy({ resumen: { problemas: 0, alumnas: 0 }, clases: [{ finalizada: false, estado: 'OK', huecos: 0 }] as never, primerasVeces: 0, record: false, estado: 'reposo' }), null);
  const conProblema = fraseDeHoy({
    resumen: { problemas: 1, alumnas: 5 }, clases: [{ finalizada: false, estado: 'SIN_INSTRUCTORA', huecos: 2 }] as never,
    primerasVeces: 0, record: false, estado: 'reposo',
  });
  assert.equal(conProblema?.soloHuecos, false, 'con un problema ya no es solo una pista');
});

test('emocionDeHoy: amor > orgullo > guiño, y nada si no hay qué contar', () => {
  assert.equal(emocionDeHoy({ primerasVeces: 1, record: true, soloHuecos: true }), 'amor');
  assert.equal(emocionDeHoy({ primerasVeces: 0, record: true, soloHuecos: true }), 'orgullo');
  assert.equal(emocionDeHoy({ primerasVeces: 0, record: false, soloHuecos: true }), 'guino');
  assert.equal(emocionDeHoy({ primerasVeces: 0, record: false, soloHuecos: false }), null);
});

test('esRecordDelDia: con 55 días de historia, no; empatar el máximo, no; 9 alumnas, no', () => {
  assert.equal(esRecordDelDia({ alumnasHoy: 20, maxPrevio: 12, diasDeHistoria: 56 }), true);
  assert.equal(esRecordDelDia({ alumnasHoy: 20, maxPrevio: 12, diasDeHistoria: 55 }), false);
  assert.equal(esRecordDelDia({ alumnasHoy: 12, maxPrevio: 12, diasDeHistoria: 90 }), false);
  assert.equal(esRecordDelDia({ alumnasHoy: 9, maxPrevio: 3, diasDeHistoria: 90 }), false);
  assert.equal(esRecordDelDia({ alumnasHoy: 20, maxPrevio: null, diasDeHistoria: 90 }), false, 'sin días anteriores no hay récord que batir');
  assert.equal(esRecordDelDia({ alumnasHoy: 20, maxPrevio: 3, diasDeHistoria: null }), false, 'sin saber desde cuándo, no');
});

test('estadoDeLaMigracion: todo dentro, hecho; con un error, error; deshecha, sin Tenti', () => {
  assert.equal(estadoDeLaMigracion({ resultados: [{}, {}], deshecho: false }), 'hecho');
  assert.equal(estadoDeLaMigracion({ resultados: [{}, { error: 'sin red' }], deshecho: false }), 'error');
  assert.equal(estadoDeLaMigracion({ resultados: [{ error: 'x' }], deshecho: true }), null);
});

test('subio: solo cuando sube un valor que ya se había visto', () => {
  assert.equal(subio(null, 3), false, 'al cargar no hay sorpresa');
  assert.equal(subio(2, 3), true);
  assert.equal(subio(3, 3), false);
  assert.equal(subio(3, 2), false);
});

const diaDe = (iso: string) => iso.slice(0, 10);

test('primerasVecesHoy: sin ninguna reserva que contara antes de hoy, y sin historial importado', () => {
  const reservasHoy = [
    { socioId: 'nueva', sesionId: 's1', estado: 'CONFIRMADA' },
    { socioId: 'nueva', sesionId: 's2', estado: 'CONFIRMADA' }, // dos clases hoy: una persona
    { socioId: 'veterana', sesionId: 's1', estado: 'CONFIRMADA' },
    { socioId: 'migrada', sesionId: 's1', estado: 'ASISTIDA' },
    { socioId: 'sin-ficha', sesionId: 's1', estado: 'CONFIRMADA' },
    { socioId: 'cancelo', sesionId: 's1', estado: 'CANCELADA' },
    { socioId: 'en-cancelada', sesionId: 'sx', estado: 'CONFIRMADA' },
    { socioId: null, sesionId: 's1', estado: 'CONFIRMADA' }, // externa (ClassPass)
  ];
  const primera: Record<string, string | null> = {
    nueva: '2026-10-06T08:00:00Z', veterana: '2026-03-01T08:00:00Z', migrada: null, 'sin-ficha': null, cancelo: null, 'en-cancelada': null,
  };
  const historial: Record<string, boolean> = { nueva: false, veterana: false, migrada: true, cancelo: false, 'en-cancelada': false };
  const n = primerasVecesHoy({
    reservasHoy, sesionesCanceladas: new Set(['sx']), hoy: '2026-10-06', diaDe,
    primeraReservaDe: id => primera[id] ?? null, historialPrevio: id => historial[id] ?? null,
  });
  assert.equal(n, 1);
});

test('maxAlumnasAntesDe: plazas ocupadas por día anterior, con la regla de resumirDia', () => {
  const sesiones = [
    { id: 'a', inicio: '2026-10-01T08:00:00Z' }, { id: 'b', inicio: '2026-10-01T18:00:00Z' },
    { id: 'c', inicio: '2026-10-02T08:00:00Z' }, { id: 'x', inicio: '2026-10-02T09:00:00Z', cancelada: true },
    { id: 'hoy', inicio: '2026-10-06T08:00:00Z' },
  ];
  const r = (sesionId: string, estado: string, n: number) => Array.from({ length: n }, () => ({ sesionId, estado }));
  const reservas = [...r('a', 'CONFIRMADA', 3), ...r('b', 'ASISTIDA', 2), ...r('b', 'NO_ASISTIO', 4), ...r('c', 'ASISTIDA', 4), ...r('x', 'CONFIRMADA', 9), ...r('hoy', 'CONFIRMADA', 30)];
  assert.equal(maxAlumnasAntesDe({ sesiones, reservas, hoy: '2026-10-06', diaDe }), 5);
  assert.equal(maxAlumnasAntesDe({ sesiones: [sesiones[4]], reservas, hoy: '2026-10-06', diaDe }), null);
});

test('estadoDelVeredicto: las reglas en orden, y nunca una cara junto a un cobro', () => {
  const base = {
    tipo: 'SILENCIO' as const, hayRecomendacion: false, pospuesta: false, efectoCobra: false,
    analisis: 'quieto' as const, recienTerminado: false, recienRespondido: false, fallidasHoy: 0,
  };
  assert.equal(estadoDelVeredicto({ ...base, analisis: 'en-curso', fallidasHoy: 2 }), 'pensando');
  assert.equal(estadoDelVeredicto({ ...base, analisis: 'tardando' }), 'pensando');
  assert.equal(estadoDelVeredicto({ ...base, recienTerminado: true, fallidasHoy: 2 }), 'hecho');
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'SIN_ANALIZAR', recienTerminado: true }), 'reposo', 'un análisis que murió no es un hecho');
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'MENSAJE', recienRespondido: true }), 'hecho');
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'MENSAJE', hayRecomendacion: true, fallidasHoy: 1 }), 'pregunta');
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'MENSAJE', hayRecomendacion: true, efectoCobra: true }), null);
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'MENSAJE', hayRecomendacion: true, efectoCobra: true, analisis: 'en-curso' }), null,
    'ni pensando junto a «Cobrar ahora»');
  assert.equal(estadoDelVeredicto({ ...base, tipo: 'MENSAJE', hayRecomendacion: true, pospuesta: true }), 'reposo', 'aplazada: ya no pregunta');
  assert.equal(estadoDelVeredicto({ ...base, fallidasHoy: 1 }), 'error');
  assert.equal(estadoDelVeredicto(base), 'reposo', '«Hoy no te interrumpo con nada»: la firma, no un «todo bien»');
});
