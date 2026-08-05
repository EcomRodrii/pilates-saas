import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BLOQUES_POR_PANTALLA, resolveBloquesPantalla, bloquesVisibles, getBlockCatalogEntry, BLOCK_CATALOG,
  resolverHrefBloque, resolverVideoEmbed, bloqueEstaCompleto,
  CAMPOS_BANNER, CAMPOS_TEXTO, CAMPOS_CTA, CAMPOS_FAQ, CAMPOS_GALERIA, CAMPOS_VIDEO, CAMPOS_TESTIMONIOS,
  REGISTRO_BLOQUES, DEFINICIONES_CATALOGO, getDefinicionBloque, definicionDe,
  BLOQUE_SISTEMA_LABEL, BLOQUES_SISTEMA_IDS, BLOQUES_SISTEMA_POR_PANTALLA, PANTALLA_IDS,
  type BloqueHome, type FaqConfig,
} from './portal-home-bloques.ts';
import { defaultsDe, resolverConfig, type CampoSchema } from './theme/campos.ts';

test('DEFAULT_BLOQUES_POR_PANTALLA.home: los 4 módulos de siempre, en orden, sin ocultar', () => {
  const idsVisibles = DEFAULT_BLOQUES_POR_PANTALLA.home
    .filter((b) => !b.oculto)
    .map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(idsVisibles, ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
});

test('DEFAULT_BLOQUES_POR_PANTALLA.home: tiraSemana/progresoSemanal/retos existen pero OCULTOS (solo Oliva/Noir/Bloom los activan)', () => {
  const ocultos = DEFAULT_BLOQUES_POR_PANTALLA.home
    .filter((b) => b.oculto)
    .map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(ocultos, ['tiraSemana', 'progresoSemanal', 'retos']);
});

test('DEFAULT_BLOQUES_POR_PANTALLA: Clases y Bonos tienen un único bloque sistema', () => {
  assert.deepEqual(DEFAULT_BLOQUES_POR_PANTALLA.clases.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoClases']);
  assert.deepEqual(DEFAULT_BLOQUES_POR_PANTALLA.bonos.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoBonos']);
});

test('resolveBloquesPantalla: Home sin nada guardado y sin legacy → default de siempre', () => {
  const r = resolveBloquesPantalla(null, 'home', { orden: [], ocultos: [] });
  const visibles = r.publicado.filter((b) => !b.oculto).map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(visibles, ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
  assert.deepEqual(r.draft, r.publicado);
});

test('resolveBloquesPantalla: Home, tiraSemana/progresoSemanal/retos llegan OCULTOS incluso sin legacy', () => {
  const r = resolveBloquesPantalla(null, 'home', { orden: [], ocultos: [] });
  const ocultos = r.publicado.filter((b) => b.oculto).map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(ocultos, ['tiraSemana', 'progresoSemanal', 'retos']);
});

test('resolveBloquesPantalla: Home sintetiza desde portalHome legacy (Fase 2) — mismo orden/ocultos, sin migrar datos', () => {
  const r = resolveBloquesPantalla(null, 'home', { orden: ['contenidoEstudio', 'estaSemana'], ocultos: ['invitarAmiga'] });
  const visibles = r.publicado.filter((b) => !b.oculto).map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(visibles, ['contenidoEstudio', 'estaSemana', 'accesosRapidos']);
  const invitar = r.publicado.find((b) => b.kind === 'sistema' && b.sistemaId === 'invitarAmiga');
  assert.equal(invitar?.oculto, true);
  // tiraSemana/progresoSemanal/retos no estaban en el legacy (no existían) →
  // se añaden al final por el segundo spread de resolveBloquesPantalla, y
  // bloqueSistema() ya los marca ocultos por defecto.
  const nuevos = r.publicado.filter((b) => b.kind === 'sistema' && (b.sistemaId === 'tiraSemana' || b.sistemaId === 'progresoSemanal' || b.sistemaId === 'retos'));
  assert.equal(nuevos.length, 3);
  assert.ok(nuevos.every((b) => b.oculto));
});

test('resolveBloquesPantalla: Home, una vez hay bloques guardado, YA NO mira portalHome (es la fuente de verdad)', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveBloquesPantalla(guardado, 'home', { orden: ['contenidoEstudio'], ocultos: ['estaSemana'] });
  assert.deepEqual(r.publicado, guardado.publicado);
});

test('resolveBloquesPantalla: Home, raw inválido/basura no lanza, cae al default', () => {
  assert.doesNotThrow(() => resolveBloquesPantalla('nope', 'home', { orden: [], ocultos: [] }));
  assert.doesNotThrow(() => resolveBloquesPantalla(42, 'home', { orden: [], ocultos: [] }));
});

test('resolveBloquesPantalla: Clases/Bonos sin nada guardado → su único bloque sistema, sin legado que migrar', () => {
  const rClases = resolveBloquesPantalla(null, 'clases');
  assert.deepEqual(rClases.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoClases']);
  const rBonos = resolveBloquesPantalla(null, 'bonos');
  assert.deepEqual(rBonos.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoBonos']);
});

test('resolveBloquesPantalla: Clases respeta lo guardado (banner añadido antes del calendario)', () => {
  const guardado = {
    draft: [],
    publicado: [
      { id: 'b1', kind: 'banner', config: { imagenUrl: '', titulo: 'Promo', texto: '', href: '' } },
      { id: 'sistema-listadoClases', kind: 'sistema', sistemaId: 'listadoClases' },
    ] satisfies BloqueHome[],
  };
  const r = resolveBloquesPantalla(guardado, 'clases');
  assert.deepEqual(r.publicado.map((b) => b.kind), ['banner', 'sistema']);
});

test('bloquesVisibles: filtra los ocultos', () => {
  const bloques = [
    { id: 'a', kind: 'texto' as const, config: { titulo: '', texto: '' }, oculto: true },
    { id: 'b', kind: 'texto' as const, config: { titulo: '', texto: '' } },
  ];
  assert.deepEqual(bloquesVisibles(bloques).map((b) => b.id), ['b']);
});

test('BLOCK_CATALOG: no incluye bloques sistema (esos no se "añaden")', () => {
  assert.equal(BLOCK_CATALOG.some((b) => (b.kind as string) === 'sistema'), false);
  assert.deepEqual(BLOCK_CATALOG.map((b) => b.kind).sort(), ['banner', 'cta', 'faq', 'galeria', 'testimonios', 'texto', 'video']);
});

test('getBlockCatalogEntry: id desconocido → undefined', () => {
  assert.equal(getBlockCatalogEntry('no-existe'), undefined);
  assert.ok(getBlockCatalogEntry('banner'));
});

test('resolverHrefBloque: ruta interna se acepta tal cual', () => {
  assert.deepEqual(resolverHrefBloque('/reservar'), { interno: true, valor: '/reservar' });
});

test('resolverHrefBloque: externo http(s) se acepta, javascript:/data: se rechaza', () => {
  assert.deepEqual(resolverHrefBloque('https://x.com'), { interno: false, valor: 'https://x.com' });
  assert.equal(resolverHrefBloque('javascript:alert(1)'), null);
  assert.equal(resolverHrefBloque('data:text/html,<script>alert(1)</script>'), null);
});

test('resolverHrefBloque: vacío → null (bloque sin enlace)', () => {
  assert.equal(resolverHrefBloque(''), null);
  assert.equal(resolverHrefBloque('   '), null);
});

test('resolverVideoEmbed: YouTube (watch/youtu.be/embed) se resuelve a la URL de embed', () => {
  assert.equal(resolverVideoEmbed('https://www.youtube.com/watch?v=abc123'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://youtube.com/watch?v=abc123&t=10s'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://youtu.be/abc123'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://www.youtube.com/embed/abc123'), 'https://www.youtube.com/embed/abc123');
});

test('resolverVideoEmbed: Vimeo se resuelve a player.vimeo.com', () => {
  assert.equal(resolverVideoEmbed('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.equal(resolverVideoEmbed('https://player.vimeo.com/video/123456789'), 'https://player.vimeo.com/video/123456789');
});

test('resolverVideoEmbed: dominio no permitido, URL rota o vacía → null', () => {
  assert.equal(resolverVideoEmbed('https://malicioso.com/video.mp4'), null);
  assert.equal(resolverVideoEmbed('javascript:alert(1)'), null);
  assert.equal(resolverVideoEmbed('no-es-una-url'), null);
  assert.equal(resolverVideoEmbed(''), null);
  assert.equal(resolverVideoEmbed('https://youtube.com/watch?v='), null);
  assert.equal(resolverVideoEmbed('https://vimeo.com/no-numerico'), null);
});

test('bloqueEstaCompleto: banner nunca está incompleto', () => {
  assert.equal(bloqueEstaCompleto({ id: 'b', kind: 'banner', config: { imagenUrl: '', titulo: '', texto: '', href: '' } }), true);
});

test('bloqueEstaCompleto: texto necesita título o cuerpo', () => {
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: '', texto: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: 'Hola', texto: '' } }), true);
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: '', texto: 'x' } }), true);
});

test('bloqueEstaCompleto: cta necesita enlace resoluble y texto de botón', () => {
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: '', href: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: '', href: '/reservar' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '/reservar' } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: 'javascript:alert(1)' } }), false);
});

test('bloqueEstaCompleto: faq/galería/testimonios necesitan al menos un elemento', () => {
  assert.equal(bloqueEstaCompleto({ id: 'f', kind: 'faq', config: { titulo: '', preguntas: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'f', kind: 'faq', config: { titulo: '', preguntas: [{ pregunta: '¿?', respuesta: '.' }] } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'g', kind: 'galeria', config: { imagenes: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'g', kind: 'galeria', config: { imagenes: [{ url: 'https://x.com/i.png', alt: '' }] } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'te', kind: 'testimonios', config: { titulo: '', testimonios: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'te', kind: 'testimonios', config: { titulo: '', testimonios: [{ cita: 'x', autor: 'Ana', rol: '' }] } }), true);
});

test('bloqueEstaCompleto: vídeo necesita una URL que resuelva a embed', () => {
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: 'https://malicioso.com/x.mp4' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: 'https://youtu.be/abc123' } }), true);
});

// ── Oráculo de no-regresión de los schemas ─────────────────────────────────
// Los tipos ya los comprueba `tsc` (las interfaces escritas a mano pasaron a
// ser `ConfigDe<typeof CAMPOS_X>`, así que cualquier divergencia rompe la
// compilación). Lo que `tsc` NO ve son los VALORES por defecto: un
// `porDefecto` mal puesto compila igual y le cambia el contenido inicial a
// una propietaria. Por eso el oráculo está copiado literal aquí, no importado
// de BLOCK_CATALOG — un test que importa lo que compara no prueba nada.
const DEFAULTS_ESPERADOS: Record<string, unknown> = {
  banner: { imagenUrl: '', titulo: '', texto: '', href: '' },
  texto: { titulo: '', texto: '' },
  cta: { titulo: '', textoBoton: '', href: '' },
  faq: { titulo: '', preguntas: [] },
  galeria: { imagenes: [] },
  video: { titulo: '', url: '' },
  testimonios: { titulo: '', testimonios: [] },
};

test('defaultsDe(CAMPOS_X) coincide con el defaultConfig de hoy, para los 7 bloques', () => {
  const porKind: Record<string, readonly CampoSchema[]> = {
    banner: CAMPOS_BANNER, texto: CAMPOS_TEXTO, cta: CAMPOS_CTA, faq: CAMPOS_FAQ,
    galeria: CAMPOS_GALERIA, video: CAMPOS_VIDEO, testimonios: CAMPOS_TESTIMONIOS,
  };
  assert.deepEqual(Object.keys(porKind).sort(), BLOCK_CATALOG.map((b) => b.kind).sort());
  for (const [kind, campos] of Object.entries(porKind)) {
    assert.deepEqual(defaultsDe(campos), DEFAULTS_ESPERADOS[kind], `defaults de ${kind}`);
  }
});

test('el defaultConfig del catálogo sigue siendo el mismo objeto que el oráculo', () => {
  for (const entrada of BLOCK_CATALOG) {
    assert.deepEqual(entrada.defaultConfig, DEFAULTS_ESPERADOS[entrada.kind], entrada.kind);
  }
});

test('el orden de los campos es el del formulario de hoy — el Inspector pintará igual', () => {
  assert.deepEqual(CAMPOS_BANNER.map((c) => c.id), ['imagenUrl', 'titulo', 'texto', 'href']);
  assert.deepEqual(CAMPOS_CTA.map((c) => c.id), ['titulo', 'textoBoton', 'href']);
  assert.deepEqual(CAMPOS_TESTIMONIOS.map((c) => c.id), ['titulo', 'testimonios']);
  // Galería es el único sin título: su formulario de hoy empieza por la lista.
  assert.deepEqual(CAMPOS_GALERIA.map((c) => c.id), ['imagenes']);
});

test('las etiquetas son literalmente las del formulario escrito a mano', () => {
  const etiqueta = (campos: readonly CampoSchema[], id: string) =>
    campos.find((c) => c.id === id)?.etiqueta;
  assert.equal(etiqueta(CAMPOS_BANNER, 'imagenUrl'), 'URL de la imagen');
  assert.equal(etiqueta(CAMPOS_BANNER, 'href'), 'Enlace (opcional)');
  assert.equal(etiqueta(CAMPOS_CTA, 'href'), 'Enlace');
  assert.equal(etiqueta(CAMPOS_CTA, 'textoBoton'), 'Texto del botón');
  assert.equal(etiqueta(CAMPOS_VIDEO, 'url'), 'URL de YouTube o Vimeo');
  // "Título" a secas en los bloques donde hoy es obligatorio, "(opcional)" en
  // el resto — la diferencia la ve la propietaria, así que se fija aquí.
  assert.equal(etiqueta(CAMPOS_BANNER, 'titulo'), 'Título');
  assert.equal(etiqueta(CAMPOS_CTA, 'titulo'), 'Título');
  assert.equal(etiqueta(CAMPOS_TEXTO, 'titulo'), 'Título (opcional)');
  assert.equal(etiqueta(CAMPOS_FAQ, 'titulo'), 'Título (opcional)');
  assert.equal(etiqueta(CAMPOS_VIDEO, 'titulo'), 'Título (opcional)');
  assert.equal(etiqueta(CAMPOS_TESTIMONIOS, 'titulo'), 'Título (opcional)');
});

test('los tres repetidores declaran los mismos subcampos que sus formularios a mano', () => {
  const lista = (campos: readonly CampoSchema[], id: string) => {
    const c = campos.find((x) => x.id === id);
    assert.equal(c?.tipo, 'lista', `${id} tiene que ser una lista`);
    return c?.tipo === 'lista' ? c.campos.map((s) => s.id) : [];
  };
  assert.deepEqual(lista(CAMPOS_FAQ, 'preguntas'), ['pregunta', 'respuesta']);
  assert.deepEqual(lista(CAMPOS_GALERIA, 'imagenes'), ['url', 'alt']);
  assert.deepEqual(lista(CAMPOS_TESTIMONIOS, 'testimonios'), ['cita', 'autor', 'rol']);
});

test('resolverConfig rellena un bloque guardado antes de existir un campo nuevo', () => {
  // El valor de tener los defaults en el schema y no solo en el catálogo: un
  // bloque guardado hace meses, al que le falta una clave, se lee completo sin
  // migrar nada — y lo que la propietaria SÍ escribió no se toca.
  const guardado = { titulo: 'Lo que escribió ella' };
  assert.deepEqual(resolverConfig(CAMPOS_VIDEO, guardado), { titulo: 'Lo que escribió ella', url: '' });
  assert.deepEqual(guardado, { titulo: 'Lo que escribió ella' }, 'no muta la entrada');
});

// ── El registro y sus vistas derivadas ──────────────────────────────────────
// Los oráculos van copiados literales, NO importados de lo que comparan: un
// test que deriva su expectativa de la misma fuente que prueba pasa siempre.

test('BLOCK_CATALOG derivado es exactamente el catálogo de antes del registro', () => {
  assert.deepEqual(BLOCK_CATALOG, [
    { kind: 'banner', label: 'Banner', icono: 'Image', descripcion: 'Imagen a todo lo ancho con título, texto y enlace opcional.', defaultConfig: { imagenUrl: '', titulo: '', texto: '', href: '' } },
    { kind: 'texto', label: 'Texto', icono: 'Type', descripcion: 'Un bloque de texto libre, con título opcional.', defaultConfig: { titulo: '', texto: '' } },
    { kind: 'cta', label: 'Llamada a la acción', icono: 'MousePointerClick', descripcion: 'Título y un botón que lleva a donde quieras.', defaultConfig: { titulo: '', textoBoton: '', href: '' } },
    { kind: 'faq', label: 'Preguntas frecuentes', icono: 'HelpCircle', descripcion: 'Lista de preguntas y respuestas, plegable.', defaultConfig: { titulo: '', preguntas: [] } },
    { kind: 'galeria', label: 'Galería de imágenes', icono: 'GalleryHorizontal', descripcion: 'Varias imágenes en un carrusel horizontal.', defaultConfig: { imagenes: [] } },
    { kind: 'video', label: 'Vídeo', icono: 'Video', descripcion: 'Un vídeo embebido de YouTube o Vimeo.', defaultConfig: { titulo: '', url: '' } },
    { kind: 'testimonios', label: 'Testimonios', icono: 'Quote', descripcion: 'Citas de socias, con autora y rol opcional.', defaultConfig: { titulo: '', testimonios: [] } },
  ]);
});

test('BLOQUE_SISTEMA_LABEL derivado no cambia ni una coma — hay e2e que buscan ese texto', () => {
  assert.deepEqual(BLOQUE_SISTEMA_LABEL, {
    estaSemana: 'Esta semana',
    accesosRapidos: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)',
    invitarAmiga: 'Invita a una amiga',
    contenidoEstudio: 'Contenido del estudio (mensaje destacado y banners)',
    listadoClases: 'Calendario de clases',
    listadoBonos: 'Tu bono y accesos rápidos',
    tiraSemana: 'Tira de la semana (7 días, con punto si hay clase reservada)',
    progresoSemanal: 'Progreso semanal (anillo con tus clases reservadas)',
    retos: 'Retos (carrusel con conteo real de apuntadas y botón Apuntarme)',
  });
});

test('el registro cubre TODOS los kinds del catálogo y TODOS los sistemaId', () => {
  // El agujero que esto cierra: un bloque en el registro sin render (o al
  // revés) es una pantalla en blanco para la socia. Aquí se fija el lado del
  // registro; el mapa de render se comprueba contra este mismo conjunto.
  const sistema = Object.values(REGISTRO_BLOQUES).filter((d) => d.origen === 'sistema');
  assert.deepEqual(sistema.map((d) => d.sistemaId).sort(), [...BLOQUES_SISTEMA_IDS].sort());
  assert.deepEqual(DEFINICIONES_CATALOGO.map((d) => d.id).sort(), BLOCK_CATALOG.map((b) => b.kind).sort());
  // Todos los `sistema` comparten `kind: 'sistema'`: la clave del registro es
  // el sistemaId, no el kind. Si esto se rompiera, `definicionDe` devolvería
  // la definición equivocada para 8 de los 9.
  assert.ok(sistema.every((d) => d.id === 'sistema'));
});

test('definicionDe resuelve un bloque sistema por su sistemaId, no por su kind', () => {
  const bloque: BloqueHome = { id: 'x', kind: 'sistema', sistemaId: 'retos' };
  assert.equal(definicionDe(bloque)?.nombre, REGISTRO_BLOQUES.retos.nombre);
  assert.equal(definicionDe({ id: 'y', kind: 'cta', config: { titulo: '', textoBoton: '', href: '' } })?.nombre, 'Llamada a la acción');
});

test('getDefinicionBloque no se traga claves heredadas de Object.prototype', () => {
  assert.equal(getDefinicionBloque('constructor'), undefined);
  assert.equal(getDefinicionBloque('toString'), undefined);
  assert.equal(getDefinicionBloque('__proto__'), undefined);
});

test('getBlockCatalogEntry devuelve un defaultConfig nuevo en cada llamada', () => {
  // Dos FAQ en la misma pantalla no pueden compartir el array `preguntas`.
  const a = getBlockCatalogEntry('faq')!;
  const b = getBlockCatalogEntry('faq')!;
  assert.deepEqual(a.defaultConfig, b.defaultConfig);
  assert.notEqual(a.defaultConfig, b.defaultConfig);
  assert.notEqual((a.defaultConfig as FaqConfig).preguntas, (b.defaultConfig as FaqConfig).preguntas);
  // Y un `sistema` no es una entrada del catálogo: no se puede "añadir".
  assert.equal(getBlockCatalogEntry('retos'), undefined);
});

test('solo los bloques del catálogo son estilizables', () => {
  for (const def of Object.values(REGISTRO_BLOQUES)) {
    assert.equal(def.estilizable, def.origen === 'catalogo', def.nombre);
    // Un `sistema` no tiene formulario: lo que enseña sale de los datos del
    // estudio, no de campos que rellene la propietaria.
    if (def.origen === 'sistema') assert.deepEqual(def.campos, []);
    else assert.ok(def.campos.length > 0, def.nombre);
  }
});

test('DEFAULT_BLOQUES_POR_PANTALLA sigue sacando el orden de BLOQUES_SISTEMA_POR_PANTALLA', () => {
  // Y NO del registro: el orden de las claves de un objeto no es una promesa
  // que quiera hacer aquí, y el orden de los módulos en la pantalla de la
  // socia sí es visible. Son dos cosas distintas y deben seguir siéndolo.
  for (const pantalla of PANTALLA_IDS) {
    const enPantalla = DEFAULT_BLOQUES_POR_PANTALLA[pantalla]
      .filter((b) => b.kind === 'sistema')
      .map((b) => (b as { sistemaId: string }).sistemaId);
    assert.deepEqual(enPantalla, [...BLOQUES_SISTEMA_POR_PANTALLA[pantalla]], pantalla);
  }
});
