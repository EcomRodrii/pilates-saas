import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hayGamificacion, logrosDe, nivelDe, recompensasDe, retosDe } from './gamificacion.ts';

const niveles = [
  { id: 'n1', nombre: 'Inicio', orden: 1, umbralCreditos: 0, color: '#aaa', icono: '🌱', beneficios: null },
  { id: 'n2', nombre: 'Constante', orden: 2, umbralCreditos: 100, color: '#bbb', icono: '⭐', beneficios: null },
  { id: 'n3', nombre: 'Veterana', orden: 3, umbralCreditos: 500, color: '#ccc', icono: '🏆', beneficios: '10% en bonos' },
];

test('el nivel sale del total GANADO, no del saldo: canjear no baja de nivel', () => {
  // Ha ganado 250 históricos aunque le queden 5 de saldo: sigue en Constante.
  const v = nivelDe(250, niveles);
  assert.equal(v.actual?.nombre, 'Constante');
  assert.equal(v.siguiente?.nombre, 'Veterana');
  assert.equal(v.faltan, 250);
  assert.equal(Math.round(v.progreso * 100), 38); // (250-100)/(500-100)
});

test('sin créditos, el primer nivel si su umbral es 0; en el último, no falta nada', () => {
  assert.equal(nivelDe(0, niveles).actual?.nombre, 'Inicio');
  const tope = nivelDe(900, niveles);
  assert.equal(tope.actual?.nombre, 'Veterana');
  assert.equal(tope.siguiente, null);
  assert.equal(tope.faltan, null);
  assert.equal(tope.progreso, 1);
});

test('un estudio sin niveles configurados no tiene nivel que enseñar', () => {
  assert.deepEqual(nivelDe(300, []), { actual: null, siguiente: null, faltan: null, progreso: 0 });
});

test('si el primer umbral no es 0, por debajo aún no hay nivel', () => {
  const v = nivelDe(50, [{ id: 'x', nombre: 'Plata', orden: 1, umbralCreditos: 100, color: '#a', icono: '🥈', beneficios: null }]);
  assert.equal(v.actual, null);
  assert.equal(v.siguiente?.nombre, 'Plata');
  assert.equal(v.faltan, 50);
});

const logros = [
  { id: 'l1', nombre: 'Primeros pasos', descripcion: null, umbral: 5, icono: '👣', creditosRecompensa: 10, activo: true },
  { id: 'l2', nombre: 'Diez clases', descripcion: null, umbral: 10, icono: '🔟', creditosRecompensa: 20, activo: true },
  { id: 'l3', nombre: 'Retirado', descripcion: null, umbral: 3, icono: '🚫', creditosRecompensa: 5, activo: false },
];

test('logros: primero lo que falta y más cerca está, después lo conseguido', () => {
  const v = logrosDe(logros, [
    { achievementId: 'l1', progresoActual: 5, completado: true, completadoEn: '2026-09-01' },
    { achievementId: 'l2', progresoActual: 8, completado: false, completadoEn: null },
  ]);
  assert.deepEqual(v.map((x) => x.nombre), ['Diez clases', 'Primeros pasos']);
  assert.equal(v[0].progresoActual, 8);
  assert.equal(v[1].completado, true);
});

test('un logro desactivado no se enseña, y sin progreso empieza a cero', () => {
  const v = logrosDe(logros, []);
  assert.equal(v.length, 2);
  assert.ok(v.every((x) => x.progresoActual === 0 && !x.completado));
});

const retos = [
  { id: 'r1', nombre: 'Septiembre activo', descripcion: null, icono: '🔥', objetivo: 12, fechaInicio: '2026-09-01', fechaFin: '2026-09-30', creditosRecompensa: 50 },
  { id: 'r2', nombre: 'Terminado', descripcion: null, icono: '⏰', objetivo: 8, fechaInicio: '2026-08-01', fechaFin: '2026-08-31', creditosRecompensa: 30 },
  { id: 'r3', nombre: 'Aún no empieza', descripcion: null, icono: '📅', objetivo: 5, fechaInicio: '2026-10-01', fechaFin: '2026-10-31', creditosRecompensa: 20 },
];

test('solo los retos vigentes hoy: ni terminados ni futuros', () => {
  const v = retosDe(retos, [], [], '2026-09-05');
  assert.deepEqual(v.map((x) => x.nombre), ['Septiembre activo']);
  assert.equal(v[0].diasRestantes, 25);
});

test('el reto lleva su progreso y si está apuntada; el que acaba antes va primero', () => {
  const dos = [...retos, { id: 'r4', nombre: 'Acaba ya', descripcion: null, icono: '⚡', objetivo: 3, fechaInicio: '2026-09-01', fechaFin: '2026-09-07', creditosRecompensa: 10 }];
  const v = retosDe(dos, [{ challengeId: 'r1', progresoActual: 7, completado: false, completadoEn: null }], ['r1'], '2026-09-05');
  assert.deepEqual(v.map((x) => x.nombre), ['Acaba ya', 'Septiembre activo']);
  const sept = v.find((x) => x.id === 'r1')!;
  assert.equal(sept.progresoActual, 7);
  assert.equal(sept.apuntada, true);
});

const premios = [
  { id: 'p1', nombre: 'Clase suelta', descripcion: null, costeCreditos: 100, icono: '🎟', activo: true, stock: null },
  { id: 'p2', nombre: 'Camiseta', descripcion: null, costeCreditos: 300, icono: '👕', activo: true, stock: 2 },
  { id: 'p3', nombre: 'Agotada', descripcion: null, costeCreditos: 50, icono: '🧦', activo: true, stock: 0 },
  { id: 'p4', nombre: 'Retirada', descripcion: null, costeCreditos: 10, icono: '❌', activo: false, stock: null },
];

test('recompensas: primero lo alcanzable y barato; lo agotado al final y marcado', () => {
  const v = recompensasDe(premios, 150);
  assert.deepEqual(v.map((x) => x.nombre), ['Clase suelta', 'Camiseta', 'Agotada']);
  assert.equal(v[0].alcanzable, true);
  assert.equal(v[1].alcanzable, false);
  assert.equal(v[1].faltan, 150);
  assert.equal(v[2].agotada, true);
  assert.equal(v[2].alcanzable, false, 'agotada no es alcanzable aunque sobre saldo');
});

// ── recompensas: vigencia y límite por socia ─────────────────────────────────
const HOY = '2026-09-08';

test('la vencida NO se enseña; la que aún no empieza SÍ, pero no se puede canjear', () => {
  const v = recompensasDe([
    { id: 'viva', nombre: 'Viva', descripcion: null, costeCreditos: 10, icono: '✅', activo: true, stock: null },
    { id: 'vencida', nombre: 'Vencida', descripcion: null, costeCreditos: 10, icono: '⌛', activo: true, stock: null, disponibleHasta: '2026-09-07' },
    { id: 'futura', nombre: 'Futura', descripcion: null, costeCreditos: 10, icono: '🔜', activo: true, stock: null, disponibleDesde: '2026-10-01' },
  ], 999, HOY);

  // La vencida se va: nadie va a poder canjearla nunca más y sería ruido.
  assert.deepEqual(v.map((x) => x.nombre), ['Viva', 'Futura']);
  // La futura se queda: explica por qué no se puede pulsar y da algo por lo
  // que volver. Desaparecer solo sería un misterio.
  const futura = v.find((x) => x.id === 'futura')!;
  assert.equal(futura.aunNoDisponible, true);
  assert.equal(futura.alcanzable, false, 'con saldo de sobra, pero fuera de ventana');
});

test('el último día de la ventana todavía se enseña y se puede canjear', () => {
  const v = recompensasDe(
    [{ id: 'hoy', nombre: 'Justo hoy', descripcion: null, costeCreditos: 10, icono: '🎯', activo: true, stock: null, disponibleDesde: HOY, disponibleHasta: HOY }],
    999, HOY,
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].alcanzable, true);
  assert.equal(v[0].aunNoDisponible, false);
});

test('la que ya ha canjeado hasta su tope se enseña marcada, no desaparece', () => {
  // Desaparecer daría a entender que el estudio la ha retirado, cuando otra
  // socia sí puede llevársela.
  const premio = { id: 'lim', nombre: 'Una por cabeza', descripcion: null, costeCreditos: 10, icono: '🎁', activo: true, stock: null, limitePorSocia: 1 };
  const agotadaParaElla = recompensasDe([premio], 999, HOY, { lim: 1 });
  assert.equal(agotadaParaElla.length, 1);
  assert.equal(agotadaParaElla[0].limiteAlcanzado, true);
  assert.equal(agotadaParaElla[0].alcanzable, false, 'con saldo de sobra, pero ya la tiene');

  const primeraVez = recompensasDe([premio], 999, HOY, {});
  assert.equal(primeraVez[0].limiteAlcanzado, false);
  assert.equal(primeraVez[0].alcanzable, true);
});

test('sin límite configurado, haberla canjeado veinte veces no la bloquea', () => {
  const v = recompensasDe(
    [{ id: 'libre', nombre: 'Sin tope', descripcion: null, costeCreditos: 10, icono: '♾', activo: true, stock: null }],
    999, HOY, { libre: 20 },
  );
  assert.equal(v[0].limiteAlcanzado, false);
  assert.equal(v[0].alcanzable, true);
});

test('lo que ya no da nada baja del todo; lo canjeable manda', () => {
  const v = recompensasDe([
    { id: 'a', nombre: 'Ya canjeada', descripcion: null, costeCreditos: 10, icono: '🎁', activo: true, stock: null, limitePorSocia: 1 },
    { id: 'b', nombre: 'Futura', descripcion: null, costeCreditos: 10, icono: '🔜', activo: true, stock: null, disponibleDesde: '2026-12-01' },
    { id: 'c', nombre: 'Canjeable', descripcion: null, costeCreditos: 10, icono: '✅', activo: true, stock: null },
  ], 999, HOY, { a: 1 });
  assert.deepEqual(v.map((x) => x.nombre), ['Canjeable', 'Futura', 'Ya canjeada']);
});

test('sin `hoy` ni canjes, el catálogo se comporta como antes', () => {
  // Compatibilidad: los dos argumentos nuevos son opcionales, y quien no los
  // pase no debe empezar a ver recompensas bloqueadas de la nada.
  const v = recompensasDe([
    { id: 'x', nombre: 'Con fechas', descripcion: null, costeCreditos: 10, icono: '📅', activo: true, stock: null, disponibleDesde: '2030-01-01', limitePorSocia: 1 },
  ], 999);
  assert.equal(v.length, 1);
  assert.equal(v[0].alcanzable, true);
});

test('sin nada configurado, la pantalla no debe existir', () => {
  assert.equal(hayGamificacion({ niveles: [], logros: [], retos: [], recompensas: [] }), false);
  assert.equal(hayGamificacion({ niveles: [], logros: [1], retos: [], recompensas: [] }), true);
});
