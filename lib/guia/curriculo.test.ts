import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAPITULOS, NIVELES, capituloPorId } from './curriculo.ts';
import { calcularProgresoGuia } from './progreso.ts';
import { calcularOnboarding, type DatosOnboarding } from '../onboarding.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián del currículo de la guía.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Una guía cuyos botones no llevan a donde dicen es peor que no tener guía: la
// propietaria pulsa «Crear un tipo de clase», aterriza en otra pestaña y deja
// de fiarse de todo lo demás. Y no es hipotético — al auditar esto se encontró
// que el buscador ⌘K llevaba a `?tab=salas` y a `?tab=clases`, que NO EXISTEN
// (la pestaña real es `clases-salas`), y a una pantalla de mantenimiento.
//
// Así que el enlace se comprueba contra el código, no contra la memoria de
// quien lo escribió.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

/** Los ids de pestaña que `/configuracion` acepta de verdad. */
function tabsDeConfiguracion(): string[] {
  const fuente = readFileSync(join(RAIZ, 'app/(dashboard)/configuracion/page.tsx'), 'utf8');
  return [...fuente.matchAll(/id: '([a-z-]+)'/g)].map(m => m[1]);
}

/** Un estudio recién creado: nada configurado. */
function estudioVacio(): DatosOnboarding {
  return {
    nif: null, stripeAccountId: null, slug: null, colorPrimario: null, temaPortal: null, logoUrl: null,
    numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0,
    numSocios: 0, numSalas: 0, numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0,
    contenidoPortalPersonalizado: false, automatizacionesActivas: new Set<string>(),
  };
}

/** Un estudio con TODO hecho. */
function estudioCompleto(): DatosOnboarding {
  return {
    nif: 'B12345674', stripeAccountId: 'acct_1', slug: 'mi-estudio', colorPrimario: '#343825',
    temaPortal: 'oliva', logoUrl: 'https://x/logo.png',
    numInstructores: 3, numInstructoresConCuenta: 2, numTiposClase: 4, numSesiones: 40,
    numSocios: 60, numSalas: 2, numPlanesTarifa: 3, numSuscripcionesActivas: 20, numReservas: 500,
    contenidoPortalPersonalizado: true,
    automatizacionesActivas: new Set(['CLASE_MANANA', 'AUSENCIA_DIAS', 'NUEVA_SOCIA']),
  };
}

test('la guía se ha leído de verdad: hay capítulos y son los tres niveles', () => {
  // Verde por vacío no, otra vez: si el fichero se vacía, esto tiene que gritar.
  assert.ok(CAPITULOS.length >= 10, `solo ${CAPITULOS.length} capítulos`);
  for (const nivel of NIVELES) {
    assert.ok(CAPITULOS.some(c => c.nivel === nivel), `ningún capítulo de nivel «${nivel}»`);
  }
});

test('ids y números de capítulo son únicos y están en orden', () => {
  const ids = CAPITULOS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids de capítulo repetidos');
  const numeros = CAPITULOS.map(c => c.numero);
  assert.deepEqual(
    numeros,
    CAPITULOS.map((_, i) => String(i + 1).padStart(2, '0')),
    'los números no son correlativos: la guía se lee como un recorrido y un salto se nota',
  );
});

test('⚠️ todos los enlaces de la guía apuntan a una ruta que existe', () => {
  const tabs = tabsDeConfiguracion();
  const rotos: string[] = [];

  for (const cap of CAPITULOS) {
    for (const accion of cap.acciones) {
      // Una acción que arranca el tour no navega a ninguna parte.
      if (!accion.href) {
        assert.ok(accion.tour, `${cap.id}: «${accion.label}» no lleva a ningún sitio ni hace nada`);
        continue;
      }
      const [ruta, query] = accion.href.split('?');

      // 1) La pestaña de configuración tiene que existir. Este es el fallo real
      //    que tenía el ⌘K: `?tab=salas` cae en la pestaña por defecto y la
      //    propietaria cree que el botón no funciona.
      const tab = new URLSearchParams(query ?? '').get('tab');
      if (ruta === '/configuracion' && tab && !tabs.includes(tab)) {
        rotos.push(`${cap.id}: «${accion.label}» → ?tab=${tab} no existe (válidos: ${tabs.join(', ')})`);
        continue;
      }

      // 2) La propia ruta tiene que tener su page.tsx. Se prueban los dos sitios
      //    donde viven las pantallas del panel.
      const candidatas = [
        join(RAIZ, 'app/(dashboard)', ruta, 'page.tsx'),
        join(RAIZ, 'app', ruta, 'page.tsx'),
      ];
      if (!candidatas.some(existsSync)) {
        rotos.push(`${cap.id}: «${accion.label}» → ${ruta} no tiene page.tsx`);
      }
    }
  }

  assert.deepEqual(rotos, [], `\n${rotos.join('\n')}\n`);
});

test('⚠️ la guía no manda a nada congelado ni en mantenimiento', () => {
  // Enseñar una puerta cerrada es peor que no mencionarla: la propietaria se
  // queda pensando que ha hecho algo mal. El editor de marca está en
  // mantenimiento desde el 7-sep-2026 y /marketing tras un feature flag.
  const prohibidas = ['/kiosk', '/ondemand', '/chat', '/marketing', '/contenido', '/configuracion/apariencia/editor'];
  const culpables: string[] = [];
  for (const cap of CAPITULOS) {
    for (const accion of cap.acciones) {
      if (!accion.href) continue;
      const ruta = accion.href.split('?')[0];
      if (prohibidas.some(p => ruta === p || ruta.startsWith(`${p}/`))) {
        culpables.push(`${cap.id}: «${accion.label}» → ${ruta}`);
      }
    }
  }
  assert.deepEqual(culpables, [], `\n${culpables.join('\n')}\n`);
});

test('⚠️ cada paso del checklist lo enseña exactamente UN capítulo', () => {
  // Los dos fallos que tapa: un paso que no explica nadie (la propietaria ve
  // «pendiente» sin saber qué es) y un paso contado dos veces (el porcentaje
  // miente). Es también lo que caza un renombrado en onboarding.ts.
  const { categorias } = calcularOnboarding(estudioVacio());
  const idsReales = categorias.flatMap(c => c.pasos.map(p => p.id));
  const idsEnGuia = CAPITULOS.flatMap(c => c.pasos);

  const huerfanos = idsReales.filter(id => !idsEnGuia.includes(id));
  assert.deepEqual(huerfanos, [], `pasos del checklist que ningún capítulo explica: ${huerfanos.join(', ')}`);

  const inventados = idsEnGuia.filter(id => !idsReales.includes(id));
  assert.deepEqual(inventados, [], `capítulos que apuntan a pasos inexistentes: ${inventados.join(', ')}`);

  const repetidos = idsEnGuia.filter((id, i) => idsEnGuia.indexOf(id) !== i);
  assert.deepEqual(repetidos, [], `pasos contados por dos capítulos: ${repetidos.join(', ')}`);
});

test('cada capítulo explica el qué, el porqué y a dónde ir', () => {
  for (const cap of CAPITULOS) {
    assert.ok(cap.queAprendes.length >= 2, `${cap.id}: menos de dos «qué vas a aprender»`);
    assert.ok(cap.porQue.length > 30, `${cap.id}: el porqué es demasiado corto para convencer de nada`);
    assert.ok(cap.apartados.length >= 3, `${cap.id}: menos de tres apartados no es una explicación`);
    assert.ok(cap.acciones.length >= 1, `${cap.id}: sin ninguna acción, es documentación y no una guía`);
    assert.ok(cap.minutos > 0, `${cap.id}: sin tiempo estimado`);
    for (const ap of cap.apartados) {
      assert.ok(ap.texto.length > 80, `${cap.id} › «${ap.titulo}»: una frase suelta no explica el porqué`);
    }
  }
});

test('lo ESENCIAL no exige ni Stripe ni el NIF', () => {
  // Se comprobó contra el camino real de reserva que ninguno de los dos hace
  // falta para recibir una reserva, y el propio checklist ya quitó ese candado
  // falso. Si vuelven a colarse aquí, la guía le estaría diciendo a un estudio
  // que cobra en el mostrador que le falta algo que no le falta.
  const esenciales = CAPITULOS.filter(c => c.nivel === 'esencial').flatMap(c => c.pasos);
  assert.ok(!esenciales.includes('stripe'), 'Stripe ha vuelto a lo esencial');
  assert.ok(!esenciales.includes('estudio'), 'el NIF ha vuelto a lo esencial');
});

test('el progreso sale del checklist: estudio vacío 0 %, estudio completo 100 %', () => {
  const vacio = calcularProgresoGuia(calcularOnboarding(estudioVacio()).categorias);
  assert.equal(vacio.esencialPct, 0);
  assert.ok(vacio.siguiente, 'un estudio sin nada tiene que tener un siguiente capítulo que ofrecer');
  assert.ok(vacio.siguientePaso, 'y un primer paso concreto dentro de él');

  const lleno = calcularProgresoGuia(calcularOnboarding(estudioCompleto()).categorias);
  assert.equal(lleno.esencialPct, 100);
  assert.equal(lleno.siguiente, null, 'con todo hecho no debe quedar ningún capítulo pendiente');
});

test('el siguiente capítulo es el primero pendiente EN ORDEN, no el más corto', () => {
  // Con solo las salas hechas, lo siguiente es el equipo (capítulo 03) porque
  // es el orden en que se desbloquea, no un capítulo posterior más barato.
  const datos = { ...estudioVacio(), numSalas: 1 };
  const p = calcularProgresoGuia(calcularOnboarding(datos).categorias);
  assert.equal(p.siguiente?.capitulo.id, 'tu-equipo');
});

test('un capítulo sin pasos es explicativo, no «pendiente para siempre»', () => {
  // «Conoce Tentare» o «Entiende tu negocio» no se completan: no hay nada que
  // configurar. Marcarlos como pendientes dejaría la guía imposible de acabar.
  const p = calcularProgresoGuia(calcularOnboarding(estudioCompleto()).categorias);
  const sinPasos = p.capitulos.filter(c => c.capitulo.pasos.length === 0);
  assert.ok(sinPasos.length > 0, 'se esperaban capítulos puramente explicativos');
  for (const c of sinPasos) assert.equal(c.estado, 'sin-pasos', `${c.capitulo.id} no debería tener estado de tarea`);
});

test('capituloPorId encuentra y no inventa', () => {
  assert.equal(capituloPorId('tu-horario')?.titulo, 'Pon tu horario en pie');
  assert.equal(capituloPorId('no-existe'), undefined);
});
