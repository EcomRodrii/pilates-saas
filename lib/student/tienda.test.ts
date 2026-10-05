import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ahorroFrenteASuelta, catalogoTienda, coberturaProducto, hayALaVentaQueCubra, paraQueClases, precioDeTienda, renovacionDeCuota, resumenProducto,
  textoBotonCompra, topesPorActividad, vigenciaDeCompra,
} from './tienda.ts';
import { cicloInicialDe } from '../bono-logic.ts';

const PLANES = [
  { id: 'p1', nombre: 'Mensual Ilimitado', tipo: 'MENSUAL', precio: 85, sesiones: null, activo: true },
  { id: 'p2', nombre: 'Bono 8 clases', tipo: 'BONO', precio: 64, sesiones: 8, activo: true, validezDias: 90 },
  { id: 'p3', nombre: 'Bono 4 clases', tipo: 'BONO', precio: 36, sesiones: 4, activo: true },
  { id: 'p4', nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 12, sesiones: 1, activo: true },
];

const SERVICIOS = [
  { id: 's1', nombre: 'Privada 1:1', precio: 45, duracionMin: 60, activo: true, autoReservable: true },
  { id: 's2', nombre: 'Valoración interna', precio: 0, activo: true, autoReservable: false },
];

test('Casos 1–4 · aparecen suscripciones, bonos, sueltas y privadas con su precio', () => {
  const c = catalogoTienda(PLANES, SERVICIOS);
  const porId = Object.fromEntries(c.map((p) => [p.id, p]));
  assert.equal(porId.p1.familia, 'suscripcion'); assert.equal(porId.p1.precio, 85);
  assert.equal(porId.p2.familia, 'bono');        assert.equal(porId.p2.precio, 64);
  assert.equal(porId.p4.familia, 'suelta');      assert.equal(porId.p4.precio, 12);
  assert.equal(porId.s1.familia, 'servicio');    assert.equal(porId.s1.precio, 45);
});

test('Caso 5 · un plan DESACTIVADO no aparece como comprable', () => {
  const c = catalogoTienda([{ ...PLANES[1], activo: false }], []);
  assert.equal(c.length, 0);
});

test('Caso 5 · un servicio NO auto-reservable no aparece — no es vendible online', () => {
  // Una valoración interna que el estudio nunca quiso vender.
  const c = catalogoTienda([], SERVICIOS);
  assert.deepEqual(c.map((p) => p.id), ['s1']);
});

test('un producto sin precio válido no se enseña como comprable', () => {
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Sin precio', tipo: 'BONO', precio: null, activo: true }], []).length, 0);
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Cero', tipo: 'BONO', precio: 0, activo: true }], []).length, 0);
});

test('un tipo de plan desconocido NO se inventa una familia', () => {
  // Decidir por el estudio cómo se vende algo que no entendemos es peor que
  // no enseñarlo.
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Raro', tipo: 'CUPON', precio: 10, activo: true }], []).length, 0);
});

test('orden: suscripciones, bonos, suelta, servicios — y dentro, de barato a caro', () => {
  const c = catalogoTienda(PLANES, SERVICIOS);
  assert.deepEqual(c.map((p) => p.id), ['p1', 'p3', 'p2', 'p4', 's1']);
});

test('estudio sin nada vendible devuelve lista vacía, no revienta', () => {
  assert.deepEqual(catalogoTienda([], []), []);
  assert.deepEqual(catalogoTienda(null, null), []);
  assert.deepEqual(catalogoTienda(undefined, undefined), []);
});

test('resumen: la suscripción ilimitada lo dice, no enseña «null clases»', () => {
  const c = catalogoTienda(PLANES, []);
  assert.equal(resumenProducto(c[0]), 'Clases ilimitadas');
});

test('la caducidad sale del resumen y va a su línea, con fecha: solo si el plan la declara', () => {
  const c = catalogoTienda(PLANES, []);
  const bono8 = c.find((p) => p.id === 'p2')!;
  const bono4 = c.find((p) => p.id === 'p3')!;
  // «caduca a los 90 días» obligaba a contar días: ahora es una fecha.
  assert.doesNotMatch(resumenProducto(bono8), /caduca/);
  assert.equal(vigenciaDeCompra(bono8, new Date('2026-10-05T10:00:00Z')), 'Vale 90 días: si lo compras hoy, hasta el 3 de enero');
  assert.equal(vigenciaDeCompra(bono4, new Date('2026-10-05T10:00:00Z')), null);
});

test('resumen de una privada incluye su duración', () => {
  const c = catalogoTienda([], SERVICIOS);
  assert.match(resumenProducto(c[0]), /60 min/);
});


// ── A qué tipos de clase está acotado un bono ───────────────────────────────
//
// Lo decidía el servidor y la tienda se lo callaba: un bono de Mat se vendía
// sin una palabra de que en un Reformer no sirve, y la alumna se enteraba al
// reservar, ya pagado.

const NOMBRES = new Map([['t1', 'Reformer'], ['t2', 'Mat'], ['t3', 'Barre']]);

function bono(tiposClaseIds: string[]) {
  return catalogoTienda([{ id: 'b', nombre: 'Bono', tipo: 'BONO', precio: 50, sesiones: 5, activo: true, tiposClaseIds }], [])[0];
}

test('cobertura: sin tipos declarados, el bono vale para todo y no se dice nada', () => {
  // La regla del servidor (`cubreTipo`): lista vacía = sirve para cualquier
  // tipo. Escribir «Solo para…» ahí sería inventar una restricción.
  assert.equal(coberturaProducto(bono([]), NOMBRES), null);
});

test('cobertura: un tipo se nombra en singular', () => {
  assert.equal(coberturaProducto(bono(['t2']), NOMBRES), 'Solo para Mat');
});

test('cobertura: varios tipos se enumeran con «y», no con comas sueltas', () => {
  assert.equal(coberturaProducto(bono(['t1', 't2', 't3']), NOMBRES), 'Solo para Reformer, Mat y Barre');
  assert.equal(coberturaProducto(bono(['t1', 't2']), NOMBRES), 'Solo para Reformer y Mat');
});

test('cobertura: un id sin nombre se omite en vez de inventarlo', () => {
  // Un tipo archivado, o que el estudio no publica: no viaja en el payload.
  assert.equal(coberturaProducto(bono(['t1', 'fantasma']), NOMBRES), 'Solo para Reformer');
});

test('cobertura: si NINGÚN id se puede nombrar, no se escribe nada', () => {
  // Callar es peor que avisar, pero peor todavía es un aviso que no dice de
  // qué: «Solo para » no ayuda a decidir, y afirmar «vale para todo» sería
  // falso. Sin nombres no hay frase.
  assert.equal(coberturaProducto(bono(['x', 'y']), NOMBRES), null);
});

test('cobertura: un tipo repetido no se nombra dos veces', () => {
  assert.equal(coberturaProducto(bono(['t1', 't1']), NOMBRES), 'Solo para Reformer');
});

test('cobertura: un servicio de cita nunca está acotado a tipos de clase', () => {
  // No se reserva contra el horario, así que `plan_tipos_clase` no le aplica.
  const s = catalogoTienda([], [{ id: 's1', nombre: 'Privada', precio: 45, activo: true, autoReservable: true }])[0];
  assert.deepEqual(s.tiposClaseIds, []);
  assert.equal(coberturaProducto(s, NOMBRES), null);
});

// ── El tope por actividad se le cuenta a la alumna ANTES de pagar ────────────
//
// 26ª pasada. `plan_tipos_clase.limite_semanal` (migr 20260907030553) viajaba
// hasta el cliente y ninguna pantalla lo decía: el escaparate enseñaba solo el
// techo total, así que «2 de Máquina + 1 de Gyrotonic» se leía como «3 clases
// por semana». La alumna lo descubría al reservar la tercera de Máquina, con
// el dinero ya pagado.
//
// El primer intento de arreglo se aplicó sobre `lib/portal-tema/datos.ts`, que
// NO lo importa nadie (resto del kit de tema borrado): un no-op perfecto que
// pasó typecheck, lint y 3.969 tests. De ahí este test — ata la frase a la
// función que la pantalla viva (`app/portal/[slug]/comprar`) llama de verdad.

const NOMBRES_TOPES = new Map([['tc-maq', 'Máquina'], ['tc-gyro', 'Gyrotonic']]);

test('el resumen cuenta el tope por actividad, no solo el total', () => {
  const [cuota] = catalogoTienda([{
    id: 'p-comb', nombre: 'Cuota combinada', tipo: 'MENSUAL', precio: 90, activo: true,
    limiteSemanal: 3, tiposClaseIds: ['tc-maq', 'tc-gyro'],
    limitePorTipo: { 'tc-maq': 2, 'tc-gyro': 1 },
  }], []);
  assert.deepEqual(cuota.limitePorTipo, { 'tc-maq': 2, 'tc-gyro': 1 },
    'el tope por actividad tiene que llegar a la proyección de tienda');
  const resumen = resumenProducto(cuota, NOMBRES_TOPES);
  assert.match(resumen, /2 de Máquina y 1 de Gyrotonic por semana/,
    'sin esto, «máx. 3/semana» se lee como «3 de lo que quieras»');
});

test('sin los nombres de los tipos no se inventa la frase', () => {
  const [cuota] = catalogoTienda([{
    id: 'p-comb', nombre: 'Cuota', tipo: 'MENSUAL', precio: 90, activo: true,
    limitePorTipo: { 'tc-archivado': 2 },
  }], []);
  // Un tipo que el estudio no publica se omite en vez de nombrarlo con su id.
  assert.equal(topesPorActividad(cuota, NOMBRES_TOPES), null);
  assert.equal(topesPorActividad(cuota, undefined), null);
});

test('los topes a null o 0 no se anuncian', () => {
  // El formulario del panel escribe `null` en los tipos sin tope: «0 de
  // Gyrotonic» sería peor que no decir nada.
  const [cuota] = catalogoTienda([{
    id: 'p', nombre: 'Cuota', tipo: 'MENSUAL', precio: 90, activo: true,
    limitePorTipo: { 'tc-maq': 2, 'tc-gyro': null },
  }], []);
  assert.deepEqual(cuota.limitePorTipo, { 'tc-maq': 2 });
  assert.equal(topesPorActividad(cuota, NOMBRES_TOPES), '2 de Máquina por semana');
});

// ── Productos físicos ────────────────────────────────────────────────────────

const PRODUCTOS = [
  { id: 'pf1', nombre: 'Calcetines antideslizantes', precio: 12, descripcion: 'Talla única.', imagenUrl: 'https://x/y.webp?v=17' },
  { id: 'pf2', nombre: 'Botella', precio: 5, descripcion: null, imagenUrl: null },
];

test('los productos físicos van los ÚLTIMOS, detrás de todo lo que hace volver', () => {
  const c = catalogoTienda(PLANES, SERVICIOS, PRODUCTOS);
  const familias = [...new Set(c.map((p) => p.familia))];
  assert.equal(familias[familias.length - 1], 'producto',
    'Lo que hace crecer al estudio es que reserve, no que compre una botella.');
});

test('un producto sin foto entra igual: hoy NINGUNO tiene', () => {
  // Medido en producción: 3 productos activos, 0 con imagen. Si la foto fuera
  // requisito, la sección nacería vacía para todo el mundo.
  const c = catalogoTienda([], [], PRODUCTOS);
  assert.equal(c.length, 2);
  assert.equal(c.find((p) => p.id === 'pf2')?.imagenUrl, null);
});

test('la URL de la foto se pasa TAL CUAL, con su parámetro de caché', () => {
  // El `?v=` es lo que hace que se vea la foto NUEVA cuando el estudio la
  // sustituye conservando la ruta. Normalizarla la dejaría pegada a la vieja.
  const c = catalogoTienda([], [], PRODUCTOS);
  assert.equal(c.find((p) => p.id === 'pf1')?.imagenUrl, 'https://x/y.webp?v=17');
});

test('un producto sin precio válido no se enseña', () => {
  const c = catalogoTienda([], [], [{ id: 'x', nombre: 'Roto', precio: 0, descripcion: null, imagenUrl: null }]);
  assert.deepEqual(c, []);
});

test('sin productos, el catálogo es exactamente el de antes', () => {
  // Que la familia nueva sea OPCIONAL importa: `/reservar` y el widget llaman
  // con dos argumentos y no deben cambiar de comportamiento.
  assert.deepEqual(catalogoTienda(PLANES, SERVICIOS), catalogoTienda(PLANES, SERVICIOS, []));
  assert.deepEqual(catalogoTienda(PLANES, SERVICIOS), catalogoTienda(PLANES, SERVICIOS, null));
});

test('un producto NO trae nada que sugiera comprarlo online', () => {
  // Sesiones, validez, duración o límites son el vocabulario de algo que se
  // consume dentro del producto. Un artículo físico no tiene nada de eso, y
  // rellenarlo invitaría a pintarle un checkout que no existe.
  const p = catalogoTienda([], [], PRODUCTOS)[0];
  assert.equal(p.sesiones, null);
  assert.equal(p.validezDias, null);
  assert.equal(p.duracionMin, null);
  assert.equal(p.limiteSemanal, null);
  assert.equal(p.periodicidadMeses, null);
  assert.deepEqual(p.tiposClaseIds, []);
});

test('⚠️ la «clase de prueba» no se vende en la tienda de la app', () => {
  const productos = catalogoTienda([...PLANES, { id: 'prueba', nombre: 'Tu primera clase', tipo: 'PUNTUAL', precio: 5, sesiones: 1, activo: true, esPrueba: true }], []);
  assert.ok(!productos.some(p => p.id === 'prueba'));
});

// ── La tarjeta que se lee sin hacer cuentas (P09) ───────────────────────────

const TIENDA = catalogoTienda([
  { id: 'cuota', nombre: 'Cuota mensual 2 días', tipo: 'MENSUAL', precio: 69, sesiones: null, activo: true, limiteSemanal: 2, tiposClaseIds: ['tc-r', 'tc-m'] },
  { id: 'tri', nombre: 'Trimestral', tipo: 'MENSUAL', precio: 180, sesiones: null, activo: true, periodicidadMeses: 3 },
  { id: 'bono10', nombre: 'Bono 10 clases', tipo: 'BONO', precio: 136, sesiones: 10, activo: true, validezDias: 150 },
  { id: 'anual', nombre: 'Bono anual 50 clases', tipo: 'BONO', precio: 600, sesiones: 50, activo: true, validezDias: 365 },
  { id: 'suelta', nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 20, sesiones: 1, activo: true, validezDias: 30 },
], [{ id: 'priv', nombre: 'Privada 1:1', precio: 45.5, duracionMin: 60, activo: true, autoReservable: true }],
[{ id: 'agua', nombre: 'Botella', precio: 12, descripcion: null, imagenUrl: null }]);
const de = (id: string) => TIENDA.find((p) => p.id === id)!;
const TIPOS = new Map([['tc-r', 'Reformer'], ['tc-m', 'Mat'], ['tc-b', 'Barre']]);
const HOY = new Date('2026-10-05T10:00:00Z');

test('el precio y el botón llevan el importe, con el periodo de la cuota', () => {
  assert.equal(precioDeTienda(de('bono10')), '136 €');
  assert.equal(precioDeTienda(de('cuota')), '69 €/mes');
  assert.equal(textoBotonCompra(de('bono10')), 'Comprar · 136 €');
  assert.equal(textoBotonCompra(de('cuota')), 'Contratar · 69 €/mes');
  // Una trimestral no se anuncia «/mes»: se cobra cada tres.
  assert.equal(textoBotonCompra(de('tri')), 'Contratar · 180 €/trimestre');
  // Con céntimos, los dos; sin ellos, ninguno (el mismo formato que /reservar).
  assert.equal(textoBotonCompra(de('priv')), 'Comprar · 45,50 €');
  // Lo que se compra en el estudio no tiene botón.
  assert.equal(textoBotonCompra(de('agua')), null);
});

test('«ahorras un N %» solo en bonos y solo si es verdad frente a la suelta', () => {
  const suelta = [{ tipo: 'PUNTUAL', precio: 20, activo: true, sesiones: 1 }];
  // 13,60 €/clase frente a 20 € = 32 % (redondeado hacia abajo).
  assert.equal(ahorroFrenteASuelta(de('bono10'), suelta), 32);
  // Sin clase suelta con la que comparar no hay ahorro que presumir.
  assert.equal(ahorroFrenteASuelta(de('bono10'), []), null);
  assert.equal(ahorroFrenteASuelta(de('bono10'), null), null);
  // Un bono más caro por clase que la suelta no «ahorra»: no se pinta nada.
  assert.equal(ahorroFrenteASuelta(de('bono10'), [{ tipo: 'PUNTUAL', precio: 13, activo: true, sesiones: 1 }]), null);
  // Ni la cuota (no tiene precio por clase) ni la suelta (es la referencia).
  assert.equal(ahorroFrenteASuelta(de('cuota'), suelta), null);
  assert.equal(ahorroFrenteASuelta(de('suelta'), suelta), null);
});

test('⚠️ el ahorro se compara con una suelta que sirva para LAS CLASES del bono', () => {
  const [bonoMat] = catalogoTienda([
    { id: 'bmat', nombre: 'Bono 10 Mat', tipo: 'BONO', precio: 120, sesiones: 10, activo: true, tiposClaseIds: ['tc-m'] },
  ], []);
  const sueltaReformer = { tipo: 'PUNTUAL', precio: 25, activo: true, sesiones: 1, tiposClaseIds: ['tc-r'] };
  // La única suelta es de Reformer: una clase de Mat no se puede comprar suelta
  // a 25 €, así que «ahorras un 52 %» sería un ahorro fabricado.
  assert.equal(ahorroFrenteASuelta(bonoMat, [sueltaReformer]), null);
  // Con una suelta para todas (o que incluya Mat), sí hay con qué comparar.
  assert.equal(ahorroFrenteASuelta(bonoMat, [sueltaReformer, { tipo: 'PUNTUAL', precio: 20, activo: true, sesiones: 1 }]), 40);
  assert.equal(ahorroFrenteASuelta(bonoMat, [{ ...sueltaReformer, tiposClaseIds: ['tc-r', 'tc-m'] }]), 52);
  // Un bono para todas no se compara con una suelta que solo vale para unas.
  assert.equal(ahorroFrenteASuelta(de('bono10'), [sueltaReformer]), null);
});

test('la fecha de caducidad es la MISMA que escribe el cobro (cicloInicialDe)', () => {
  // 5-oct + 150 días = 4-mar del año que viene. Se compara contra la función
  // del servidor para que nunca puedan prometer días distintos.
  const { fechaFin } = cicloInicialDe({ tipo: 'BONO', sesiones: 10, validezDias: 150 }, HOY.toISOString());
  assert.equal(fechaFin, '2027-03-04');
  assert.equal(vigenciaDeCompra(de('bono10'), HOY), 'Vale 150 días: si lo compras hoy, hasta el 4 de marzo');
  // La suelta también caduca si el estudio lo dice.
  assert.equal(vigenciaDeCompra(de('suelta'), HOY), 'Vale 30 días: si lo compras hoy, hasta el 4 de noviembre');
});

test('el día es el del estudio: a las 00:30 de Madrid ya es mañana aunque en UTC sea hoy', () => {
  // 4-oct 22:30 UTC = 5-oct 00:30 en Madrid. El bono arranca el 5, como en el cobro.
  assert.equal(vigenciaDeCompra(de('bono10'), new Date('2026-10-04T22:30:00Z')), 'Vale 150 días: si lo compras hoy, hasta el 4 de marzo');
});

test('a casi un año vista la fecha lleva el año, que si no se lee como hoy', () => {
  assert.equal(vigenciaDeCompra(de('anual'), HOY), 'Vale 365 días: si lo compras hoy, hasta el 5 de octubre de 2027');
});

test('una cuota no «caduca»: dice cómo se renueva, sacado de SU periodo', () => {
  assert.equal(vigenciaDeCompra(de('cuota'), HOY), null);
  assert.equal(renovacionDeCuota(de('cuota')), 'Se renueva sola cada mes hasta que te des de baja.');
  assert.equal(renovacionDeCuota(de('tri')), 'Se renueva sola cada trimestre hasta que te des de baja.');
  // Nada de «la cancelas cuando quieras»: la baja no está en la app.
  assert.doesNotMatch(renovacionDeCuota(de('cuota'))!, /cancel/i);
  assert.equal(renovacionDeCuota(de('bono10')), null);
});

test('«Para»: todas las clases, o las que cubre con su nombre', () => {
  assert.equal(paraQueClases(de('bono10'), TIPOS), 'Para todas las clases');
  assert.equal(paraQueClases(de('cuota'), TIPOS), 'Para Reformer y Mat');
  const tres = { ...de('bono10'), tiposClaseIds: ['tc-r', 'tc-m', 'tc-b'] };
  assert.equal(paraQueClases(tres, TIPOS), 'Para Reformer, Mat y Barre');
  // Acotado a un tipo que no se puede nombrar: ni «para todas» (mentira) ni «Para» a secas.
  assert.equal(paraQueClases({ ...de('bono10'), tiposClaseIds: ['archivado'] }, TIPOS), null);
  // Una privada o un producto no se reservan contra el horario.
  assert.equal(paraQueClases(de('priv'), TIPOS), null);
  assert.equal(paraQueClases(de('agua'), TIPOS), null);
});

// ── ¿Hay algo a la venta que dé derecho a ESTA clase? ────────────────────────
// La ficha, Inicio y Bonos ofrecen la tienda solo si van a encontrar ahí lo que se les promete.

test('hayALaVentaQueCubra: un plan del escaparate que cubra el tipo, y nada más', () => {
  const plan = (o: Record<string, unknown>) => ({ id: 'p', nombre: 'P', precio: 50, tipo: 'BONO', activo: true, ...o });
  // Un bono general cubre cualquier clase.
  assert.equal(hayALaVentaQueCubra([plan({})], 'tc-ref'), true);
  // Acotado a Mat: no cubre un Reformer.
  assert.equal(hayALaVentaQueCubra([plan({ tiposClaseIds: ['tc-mat'] })], 'tc-ref'), false);
  assert.equal(hayALaVentaQueCubra([plan({ tiposClaseIds: ['tc-mat'] })], 'tc-mat'), true);
  // Lo que el escaparate no enseña tampoco cuenta: apagado, de prueba o sin precio.
  assert.equal(hayALaVentaQueCubra([plan({ activo: false })], 'tc-ref'), false);
  assert.equal(hayALaVentaQueCubra([plan({ esPrueba: true })], 'tc-ref'), false);
  assert.equal(hayALaVentaQueCubra([plan({ precio: 0 })], 'tc-ref'), false);
  // Cuota y clase suelta también dan derecho a la clase.
  assert.equal(hayALaVentaQueCubra([plan({ tipo: 'MENSUAL' })], 'tc-ref'), true);
  assert.equal(hayALaVentaQueCubra([plan({ tipo: 'PUNTUAL' })], 'tc-ref'), true);
  // Sin nada a la venta.
  assert.equal(hayALaVentaQueCubra([], 'tc-ref'), false);
  assert.equal(hayALaVentaQueCubra(null, 'tc-ref'), false);
});
