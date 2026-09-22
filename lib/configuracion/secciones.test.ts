import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FILAS_A_OTRA_PANTALLA, FILAS_EXTERNAS, GRUPOS, HERRAMIENTAS, MI_CUENTA, SECCIONES, cumpleCondicion, esHerramientaId, esSeccionId, esTarjetaId, externaVisible, herramientaDeTarjeta,
  herramientaPorId, herramientaVisible, herramientasDeSeccion, rolesDeTarjeta, seccionDeTarjeta, seccionPorId, tarjetaPorId, tarjetasDeHerramienta,
  type FilaExternaId, type TarjetaConfiguracion, type TarjetaId,
} from './secciones.ts';
import { TARJETAS_REGLAS } from './reglas-reserva.ts';

// Los nombres y frases de Configuración son copy aprobado, y lo que se decide
// aquí lo pinta la pantalla tal cual. Estos tests no juzgan el texto: fijan lo
// que, si se rompe, deja a la propietaria sin encontrar algo o leyendo una
// frase que no dice la verdad.

const todas = SECCIONES.flatMap(s => s.tarjetas as readonly TarjetaConfiguracion[]);

test('catorce secciones, y ningún id repetido: ni entre secciones ni entre tarjetas de secciones distintas', () => {
  assert.equal(SECCIONES.length, 14);
  const ids = [...SECCIONES.map(s => s.id), ...todas.map(t => t.id)];
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'ids repetidos');
  for (const t of todas) assert.match(t.id, /^[a-z0-9][a-z0-9_-]*$/, `«${t.id}» no sirve como ancla de URL`);
});

test('cada sección se explica con un resumen corto y UNA frase', () => {
  for (const s of SECCIONES) {
    assert.ok(s.titulo.trim(), `${s.id}: sin título`);
    assert.ok(s.resumen.trim() && !s.resumen.endsWith('.'), `${s.id}: el resumen es una etiqueta, sin punto final`);
    assert.ok(s.resumen.length <= 60, `${s.id}: el resumen no cabe en dos líneas del móvil`);
    assert.ok(s.frase.endsWith('.'), `${s.id}: la frase termina en punto`);
    const frases = s.frase.split(/(?<=[.!?])\s+(?=[¿¡«A-ZÁÉÍÓÚÑ])/);
    assert.equal(frases.length, 1, `${s.id}: «${s.frase}» son ${frases.length} frases`);
    assert.ok(s.tarjetas.length > 0, `${s.id}: una sección sin tarjetas no lleva a nada`);
  }
});

test('cada tarjeta tiene título, una línea que dice qué hace y un modo de guardado conocido', () => {
  const modos = new Set(['barra', 'al-pulsar', 'catalogo', 'accion', 'lectura']);
  for (const t of todas) {
    assert.ok(t.titulo.trim(), `${t.id}: sin título`);
    assert.ok(t.frase.endsWith('.'), `${t.id}: la frase termina en punto`);
    assert.ok(t.frase.length <= 200, `${t.id}: «una línea» no son ${t.frase.length} caracteres`);
    assert.ok(modos.has(t.guardado), `${t.id}: modo de guardado «${t.guardado}»`);
  }
});

test('la propietaria ve todas las secciones y todas las tarjetas', () => {
  for (const s of SECCIONES) assert.ok((s.roles as readonly string[]).includes('PROPIETARIO'), s.id);
  for (const t of todas) assert.ok(rolesDeTarjeta(t).includes('PROPIETARIO'), t.id);
});

// Una tarjeta sin `roles` es de la propietaria: lo nuevo nace cerrado, y abrir
// algo a otro rol es una decisión que se escribe. La cerradura es la RLS.
test('lo que ve la gerencia son las cinco tarjetas de la operación de su sede, y nada más', () => {
  const suyas = todas.filter(t => rolesDeTarjeta(t).includes('MANAGER')).map(t => t.id);
  assert.deepEqual(suyas, ['horario', 'cerrar-el-centro', 'salas', 'tipos-de-clase', 'horario-de-citas']);
  // Ni recepción ni la instructora entran en ninguna.
  for (const rol of ['RECEPCION', 'INSTRUCTOR'] as const) {
    assert.deepEqual(todas.filter(t => rolesDeTarjeta(t).includes(rol)), [], rol);
  }
});

test('los roles de una sección son los de sus tarjetas, juntos: ni una sección vacía ni una tarjeta inalcanzable', () => {
  for (const s of SECCIONES) {
    const deSusTarjetas = new Set((s.tarjetas as readonly TarjetaConfiguracion[]).flatMap(t => rolesDeTarjeta(t)));
    assert.deepEqual(
      [...s.roles].sort(),
      [...deSusTarjetas].sort(),
      `${s.id}: la sección se abre a ${[...s.roles]} y sus tarjetas, a ${[...deSusTarjetas]}`,
    );
  }
});

test('una herramienta se abre si este rol ve alguna de sus tarjetas', () => {
  assert.equal(herramientaVisible('salas', 'MANAGER'), true);
  assert.equal(herramientaVisible('tipos-de-clase', 'MANAGER'), true);
  for (const id of ['correos-automaticos', 'recompensas-y-logros', 'codigos-descuento', 'contenido-de-tu-app', 'widgets'] as const) {
    assert.equal(herramientaVisible(id, 'MANAGER'), false, id);
    assert.equal(herramientaVisible(id, 'PROPIETARIO'), true, id);
  }
});

test('«Plan de Tentare» es de la propietaria; a «Mi cuenta» llega todo el personal del panel', () => {
  assert.equal(externaVisible(FILAS_EXTERNAS.plan, 'PROPIETARIO'), true);
  assert.equal(externaVisible(FILAS_EXTERNAS.plan, 'MANAGER'), false);
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
    assert.equal(externaVisible(FILAS_EXTERNAS['mi-cuenta'], rol), true, rol);
  }
});

test('el copy dice «alumna», nunca «clienta» ni «socia»', () => {
  const textos = [
    ...SECCIONES.flatMap(s => [s.titulo, s.resumen, s.frase]),
    ...todas.flatMap(t => [t.titulo, t.frase]),
    MI_CUENTA.titulo, MI_CUENTA.resumen,
    ...Object.values(FILAS_EXTERNAS).flatMap(f => [f.titulo, f.resumen]),
  ];
  for (const texto of textos) assert.doesNotMatch(texto, /\b(client|soci)as?\b/i, texto);
});

test('cada tarjeta es de UNA sección, y ya ninguna se pinta en la de otra', () => {
  for (const s of SECCIONES) {
    for (const t of s.tarjetas as readonly TarjetaConfiguracion[]) {
      const id = t.id as TarjetaId;
      assert.equal(seccionDeTarjeta(id), s.id);
      assert.equal(tarjetaPorId(id), t);
      assert.ok(esTarjetaId(id));
      assert.equal('hospedadaEn' in t, false, `${t.id}: ya no hay tarjetas de paso en otra sección`);
    }
  }
  // Las dos que vivían dentro de las reglas de reserva, ya en su sitio (15-sep).
  assert.equal(seccionDeTarjeta('compra-desde-tu-enlace'), 'altas');
  assert.equal(seccionDeTarjeta('ajuste-instructoras-crean-clases'), 'equipo');
});

test('«Cómo reservan mis alumnas»: las seis reglas con su cajón y el aviso, en ese orden', () => {
  const ids = seccionPorId('reservas').tarjetas.map(t => t.id);
  assert.deepEqual(ids, [...TARJETAS_REGLAS, 'ajuste-avisar-alumnas']);
  // Las reglas esperan al «Guardar» de su cajón; el aviso se guarda al pulsar.
  for (const id of TARJETAS_REGLAS) assert.equal(tarjetaPorId(id).guardado, 'barra', id);
  assert.equal(tarjetaPorId('ajuste-avisar-alumnas').guardado, 'al-pulsar');
});

test('las tarjetas condicionales solo salen donde toca', () => {
  assert.equal(cumpleCondicion(undefined, { haySedes: false, esCadena: false }), true);
  assert.equal(cumpleCondicion('multiSede', { haySedes: false, esCadena: false }), false);
  assert.equal(cumpleCondicion('multiSede', { haySedes: true, esCadena: false }), true);
  assert.equal(cumpleCondicion('cadena', { haySedes: true, esCadena: false }), false);
  assert.equal(cumpleCondicion('cadena', { haySedes: true, esCadena: true }), true);
});

test('«Mi cuenta» lleva a su propia pantalla', () => {
  assert.equal(MI_CUENTA.href, '/mi-perfil');
});

test('«Marca» junta logo, color y textos; «Tu cuenta», avisos, panel, plan y cuenta', () => {
  // Los siete campos de «Textos de tu app» no caben en un cajón (≤ 6): se
  // partieron en «Cómo te presentas» y «Textos de bienvenida», y el primero
  // conserva id y ancla porque los llevan enlaces ya escritos.
  assert.deepEqual(seccionPorId('marca').tarjetas.map(t => t.id), ['logo-y-favicon', 'color-de-marca', 'textos-de-tu-app', 'textos-de-bienvenida']);
  assert.equal(tarjetaPorId('textos-de-tu-app').titulo, 'Cómo te presentas');
  // Solo las imágenes se guardan al elegirlas (el archivo ya se ha subido); el
  // color y los textos esperan al «Guardar» de su cajón.
  assert.equal(tarjetaPorId('logo-y-favicon').guardado, 'al-pulsar');
  for (const id of ['textos-de-tu-app', 'textos-de-bienvenida'] as const) assert.equal(tarjetaPorId(id).guardado, 'barra');
  // La apariencia de la app no se guarda aquí: es una pantalla propia con su «Publicar».
  assert.equal(tarjetaPorId('color-de-marca').guardado, 'accion');
  assert.deepEqual(seccionPorId('avisos').tarjetas.map(t => t.id), ['tus-avisos']);
  // La tabla de avisos se abre en su pantalla: en su sección solo queda su fila.
  assert.equal(herramientaDeTarjeta('tus-avisos'), 'tus-avisos');
  assert.deepEqual(seccionPorId('panel').tarjetas.map(t => t.id), ['menu-del-panel', 'inicio-del-panel', 'posicion-del-menu', 'claro-u-oscuro']);
  // Ni el logo ni los textos se quedan también en «Mi app y mi web».
  assert.equal(seccionDeTarjeta('textos-de-tu-app'), 'marca');
  const cuenta = GRUPOS.find(g => g.id === 'tu-cuenta')!;
  assert.deepEqual(cuenta.secciones, ['avisos', 'panel']);
  assert.deepEqual(cuenta.externas, ['plan', 'mi-cuenta']);
  assert.deepEqual(GRUPOS.find(g => g.id === 'tu-imagen')!.secciones, ['marca', 'web']);
  // Claro u oscuro es de este navegador: se guarda al pulsar, nunca con la barra del menú.
  assert.equal(tarjetaPorId('claro-u-oscuro').guardado, 'al-pulsar');
  for (const id of ['menu-del-panel', 'inicio-del-panel', 'posicion-del-menu'] as const) assert.equal(tarjetaPorId(id).guardado, 'barra');
});

test('las filas que llevan a otra pantalla: «Plan de Tentare» a /suscripcion y «Mi cuenta» a /mi-perfil', () => {
  assert.equal(FILAS_EXTERNAS.plan.href, '/suscripcion');
  assert.equal(FILAS_EXTERNAS['mi-cuenta'].href, MI_CUENTA.href);
  for (const [id, f] of Object.entries(FILAS_EXTERNAS)) {
    assert.equal(f.id, id);
    assert.ok(f.resumen.trim() && !f.resumen.endsWith('.'), `${id}: el resumen es una etiqueta, sin punto final`);
    assert.ok(f.resumen.length <= 60, `${id}: el resumen no cabe en dos líneas del móvil`);
  }
});

test('seis grupos en el inicio: cada sección en uno solo, y la lista en su mismo orden', () => {
  assert.deepEqual(GRUPOS.map(g => g.titulo), ['Lo básico', 'Tus alumnas', 'Tu imagen', 'Equipo', 'Conexiones y datos', 'Tu cuenta']);
  const enGrupos = GRUPOS.flatMap(g => g.secciones);
  // En el mismo orden que SECCIONES: la columna de la izquierda y el inicio no
  // pueden contar dos órdenes distintos.
  assert.deepEqual(enGrupos, SECCIONES.map(s => s.id));
  // Cada fila externa va una vez, y todas en el último grupo.
  const externas = GRUPOS.flatMap(g => g.externas ?? []);
  assert.deepEqual([...externas].sort(), (Object.keys(FILAS_EXTERNAS) as FilaExternaId[]).sort());
  assert.deepEqual(GRUPOS.filter(g => g.externas?.length).map(g => g.id), ['tu-cuenta']);
  for (const g of GRUPOS) {
    // Frase normal, no un rótulo en mayúsculas.
    assert.notEqual(g.titulo, g.titulo.toUpperCase(), g.titulo);
    assert.ok(g.titulo.length <= 20, `${g.titulo}: un título de grupo es corto`);
  }
});

test('nueve herramientas con pantalla propia, cada una de UNA sección y con sus tarjetas seguidas', () => {
  assert.deepEqual(HERRAMIENTAS.map(h => h.id), [
    'salas', 'tipos-de-clase', 'correos-automaticos', 'recompensas-y-logros', 'codigos-descuento', 'contenido-de-tu-app', 'widgets',
    'tus-avisos', 'avisos-del-movil',
  ]);
  for (const h of HERRAMIENTAS) {
    assert.ok(esHerramientaId(h.id));
    assert.equal(herramientaPorId(h.id), h);
    const suyas = tarjetasDeHerramienta(h.id);
    assert.ok(suyas.length > 0, `${h.id}: una herramienta sin tarjetas no abre nada`);
    for (const t of suyas) {
      assert.equal(seccionDeTarjeta(t), h.seccion, `${h.id}#${t}`);
      assert.equal(herramientaDeTarjeta(t), h.id);
    }
    // Seguidas en su sección: una herramienta no se parte en dos filas.
    const ids = seccionPorId(h.seccion).tarjetas.map(t => t.id) as string[];
    const posiciones = suyas.map(t => ids.indexOf(t));
    assert.deepEqual(posiciones, posiciones.map((_, i) => posiciones[0] + i), `${h.id}: tarjetas no seguidas`);
    // Copy: una frase, un resumen corto y «alumna».
    assert.ok(h.frase.endsWith('.') && h.frase.split(/(?<=[.!?])\s+(?=[¿¡«A-ZÁÉÍÓÚÑ])/).length === 1, `${h.id}: una sola frase`);
    assert.ok(h.resumen.trim() && !h.resumen.endsWith('.') && h.resumen.length <= 60, `${h.id}: resumen`);
    for (const texto of [h.titulo, h.frase, h.resumen]) assert.doesNotMatch(texto, /\b(client|soci)as?\b/i, texto);
  }
  // La de una sola tarjeta se llama como ella: su pantalla no repite el título.
  for (const h of HERRAMIENTAS.filter(x => tarjetasDeHerramienta(x.id).length === 1)) {
    const [t] = tarjetasDeHerramienta(h.id);
    assert.equal(t, h.id);
    assert.equal(h.titulo, tarjetaPorId(t).titulo);
    assert.equal(h.frase, tarjetaPorId(t).frase);
  }
  assert.deepEqual(tarjetasDeHerramienta('recompensas-y-logros'), ['recompensas', 'canjes', 'logros', 'niveles', 'retos']);
  // Las reglas de los créditos son un ajuste: se quedan en la sección.
  assert.equal(herramientaDeTarjeta('reglas'), null);
  assert.deepEqual(herramientasDeSeccion('web').map(h => h.id), ['contenido-de-tu-app', 'widgets']);
  assert.deepEqual(herramientasDeSeccion('reservas'), []);
});

test('«Mi equipo»: crear clases se guarda al tocarlo y la app es una acción; lo demás lleva a su pantalla', () => {
  assert.deepEqual(seccionPorId('equipo').tarjetas.map(t => t.id), ['ajuste-instructoras-crean-clases', 'app-de-tus-instructoras']);
  assert.equal(tarjetaPorId('ajuste-instructoras-crean-clases').guardado, 'al-pulsar');
  assert.equal(tarjetaPorId('app-de-tus-instructoras').guardado, 'accion');
  // Con Tentare Core retirado la instructora no edita clases en ningún sitio: la frase no puede prometerlo.
  assert.doesNotMatch(tarjetaPorId('ajuste-instructoras-crean-clases').frase, /editar/);
  assert.deepEqual(
    FILAS_A_OTRA_PANTALLA.filter(f => f.seccion === 'equipo').map(f => f.href),
    ['/sustituciones', '/equipo/liquidaciones', '/equipo'],
  );
  for (const p of ['roles', 'permisos', 'sustituciones', 'tarifa', 'liquidación']) {
    assert.ok((seccionPorId('equipo').palabras ?? []).includes(p), `el buscador no encuentra Mi equipo por «${p}»`);
  }
});

test('lo que se abre en un cajón cabe en su línea (≤ 120), y las filas a otra pantalla llevan a una que existe', () => {
  // Mi estudio, Cobros y facturas y Alta de alumnas son filas con cajón: su
  // frase es la ÚNICA línea de explicación de ese cajón (§5 de la reorganización).
  // Marca, Mis avisos y Tu panel entraron el 16-sep: eran las cuatro últimas
  // secciones con el modelo viejo.
  for (const s of ['estudio', 'cobros', 'altas', 'reservas', 'comunicacion', 'motivacion', 'marca', 'web', 'conexiones', 'equipo', 'avisos', 'panel'] as const) {
    for (const t of seccionPorId(s).tarjetas) assert.ok(t.frase.length <= 120, `${t.id}: ${t.frase.length} caracteres`);
    assert.ok(seccionPorId(s).frase.length <= 90, `${s}: la frase de la sección`);
  }
  for (const f of FILAS_A_OTRA_PANTALLA) {
    assert.ok(esSeccionId(f.seccion), f.id);
    assert.ok(existsSync(join(import.meta.dirname, '../../app/(dashboard)', f.href, 'page.tsx')), `${f.id}: ${f.href} no es una pantalla`);
    assert.ok(f.resumen.length <= 60 && !f.resumen.endsWith('.'), f.id);
    assert.doesNotMatch(`${f.titulo} ${f.resumen}`, /\b(client|soci)as?\b/i, f.id);
  }
});

test('las palabras del buscador: en minúsculas, sin repetir y que no repiten el título', () => {
  const conPalabras = [...SECCIONES, ...todas, ...Object.values(FILAS_EXTERNAS)] as { id: string; titulo: string; palabras?: readonly string[] }[];
  assert.ok(conPalabras.filter(x => x.palabras?.length).length > 20, 'casi ninguna tarjeta tiene palabras');
  for (const x of conPalabras) {
    const palabras = x.palabras ?? [];
    assert.equal(new Set(palabras).size, palabras.length, `${x.id}: palabras repetidas`);
    for (const p of palabras) {
      assert.equal(p, p.trim().toLowerCase(), `${x.id}: «${p}»`);
      assert.doesNotMatch(p, /\b(client|soci)as?\b/i, `${x.id}: «${p}»`);
      assert.notEqual(p, x.titulo.toLowerCase(), `${x.id}: «${p}» ya es el título`);
    }
  }
});
