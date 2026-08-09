import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camposVisibles, agruparCampos } from './theme/campos.ts';
import {
  DEFAULT_BLOQUES_POR_PANTALLA, resolveBloquesPantalla, bloquesVisibles, getBlockCatalogEntry, BLOCK_CATALOG,
  resolverHrefBloque, resolverVideoEmbed, bloqueEstaCompleto,
  CAMPOS_BANNER, CAMPOS_TEXTO, CAMPOS_CTA, CAMPOS_FAQ, CAMPOS_GALERIA, CAMPOS_VIDEO, CAMPOS_TESTIMONIOS,
  REGISTRO_BLOQUES, DEFINICIONES_CATALOGO, getDefinicionBloque, definicionDe,
  resolverBloque, resolverBloques,
  BLOQUE_SISTEMA_LABEL, BLOQUES_SISTEMA_IDS, BLOQUES_SISTEMA_POR_PANTALLA, PANTALLA_IDS,
  type BloqueHome, type BloqueHijo, type FaqConfig, CAMPOS_ESTILO, CAMPOS_ESTILO_BANNER, CAMPOS_CONTENEDOR, conFijos, esBloqueFijo } from './portal-home-bloques.ts';
import { defaultsDe, resolverConfig, type CampoSchema } from './theme/campos.ts';

test('DEFAULT_BLOQUES_POR_PANTALLA.home: los fijos delante y los 4 de siempre detrás, en orden', () => {
  const idsVisibles = DEFAULT_BLOQUES_POR_PANTALLA.home
    .filter((b) => !b.oculto)
    .map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  // ⚠️ `cabecera` y `proximaClase` son nuevos, y NO cambian nada de lo que se
  // pinta: ya se pintaban, escritos a fuego encima del contenedor de bloques.
  // Lo que cambia es que ahora EXISTEN para el editor. Los 4 de siempre siguen
  // en su orden, detrás.
  assert.deepEqual(idsVisibles, ['cabecera', 'proximaClase', 'estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
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
  assert.deepEqual(visibles, ['cabecera', 'proximaClase', 'estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
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
  // Los fijos van DELANTE, no en el orden legacy: el saludo y la tarjeta se
  // mantienen arriba pase lo que pase. El resto conserva su orden guardado.
  assert.deepEqual(visibles, ['cabecera', 'proximaClase', 'contenidoEstudio', 'estaSemana', 'accesosRapidos']);
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
  // Sigue sin mirar el legacy: lo guardado manda. Lo único que se añade son
  // los bloques FIJOS, que existen siempre por definición.
  const suyos = r.publicado.filter((b) => !(b.kind === 'sistema' && ['cabecera', 'proximaClase'].includes(b.sistemaId)));
  assert.deepEqual(suyos, guardado.publicado);
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
  assert.deepEqual(BLOCK_CATALOG.map((b) => b.kind).sort(), ['banner', 'contenedor', 'cta', 'faq', 'galeria', 'testimonios', 'texto', 'video']);
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
  contenedor: { titulo: '', direccion: 'columna', separacion: 'normal', reparto: 'iguales' },
};

test('defaultsDe(CAMPOS_X) coincide con el defaultConfig de hoy, para los 8 bloques', () => {
  const porKind: Record<string, readonly CampoSchema[]> = {
    banner: CAMPOS_BANNER, texto: CAMPOS_TEXTO, cta: CAMPOS_CTA, faq: CAMPOS_FAQ,
    galeria: CAMPOS_GALERIA, video: CAMPOS_VIDEO, testimonios: CAMPOS_TESTIMONIOS,
    contenedor: CAMPOS_CONTENEDOR,
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

test('BLOCK_CATALOG derivado es el catálogo de antes MÁS el contenedor', () => {
  // El octavo (`contenedor`) es el primer bloque nuevo desde que existe el
  // registro, y va PRIMERO porque es el que abre el anidamiento. Los siete de
  // antes siguen byte a byte iguales — esa es la parte que este oráculo
  // protege de verdad.
  assert.deepEqual(BLOCK_CATALOG, [
    { kind: 'contenedor', label: 'Grupo', icono: 'Rows3', descripcion: 'Agrupa varios bloques y los coloca en fila o en columna.', defaultConfig: { titulo: '', direccion: 'columna', separacion: 'normal', reparto: 'iguales' } },
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
    cabecera: 'Cabecera',
    proximaClase: 'Tarjeta de próxima clase',
    estaSemana: 'Esta semana',
    accesosRapidos: 'Accesos rápidos',
    invitarAmiga: 'Invita a una amiga',
    contenidoEstudio: 'Contenido del estudio',
    listadoClases: 'Calendario de clases',
    listadoBonos: 'Tu bono y accesos rápidos',
    tiraSemana: 'Tira de la semana',
    progresoSemanal: 'Progreso semanal',
    retos: 'Retos',
  });
});

// La explicación no se ha perdido al acortar los nombres: se ha bajado de
// altura tipográfica. El rail pinta `nombre` en negro y `descripcion` en gris
// debajo, que es lo que hace la lista legible de un vistazo.
test('el paréntesis explicativo vive ahora en `descripcion`, no dentro del nombre', () => {
  const sistema = Object.values(REGISTRO_BLOQUES).filter((d) => d.origen === 'sistema');

  for (const def of sistema) {
    assert.ok(
      !def.nombre.includes('('),
      `«${def.nombre}» vuelve a llevar la explicación dentro del nombre: eso ocupa tres renglones en el rail. Va en \`descripcion\`.`,
    );
  }

  assert.equal(REGISTRO_BLOQUES.retos.descripcion, 'Carrusel con conteo real de apuntadas y botón Apuntarme.');
  assert.equal(REGISTRO_BLOQUES.accesosRapidos.descripcion, 'Reservas, progreso, notificaciones y equipo.');
  assert.equal(REGISTRO_BLOQUES.contenidoEstudio.descripcion, 'Mensaje destacado y banners.');
});

// ⚠️ El trampolín conocido de este registro: `getByText` de Playwright hace
// match de SUBCADENA sin distinguir mayúsculas. Dos bloques de la MISMA
// pantalla donde el nombre de uno cabe dentro del texto del otro rompen los
// e2e con un "strict mode violation" que no dice de dónde viene. Ya pasó con
// "Esta semana" y "Progreso semanal (…esta semana…)".
test('ningún nombre de sistema es subcadena del texto de otro de su pantalla', () => {
  for (const pantalla of PANTALLA_IDS) {
    // El mapa de verdad de qué módulo sale en qué pantalla. Con un
    // `d.pantallas ?? TODAS` de más se cruzaban pantallas que nunca conviven
    // —«Accesos rápidos» (Inicio) contra «Tu bono y accesos rápidos»
    // (Bonos)— y el guard saltaba por una colisión imposible.
    const enPantalla = BLOQUES_SISTEMA_POR_PANTALLA[pantalla]
      .map((sistemaId) => REGISTRO_BLOQUES[sistemaId]);

    for (const a of enPantalla) {
      for (const b of enPantalla) {
        if (a === b) continue;
        const textoDeB = `${b.nombre} ${b.descripcion ?? ''}`.toLowerCase();
        assert.ok(
          !textoDeB.includes(a.nombre.toLowerCase()),
          `En ${pantalla}, «${a.nombre}» cabe dentro del texto de «${b.nombre}» — getByText los confundiría.`,
        );
      }
    }
  }
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
    // `estilizable` sigue siendo cosa del catálogo: el fondo/padding/esquinas
    // de un módulo de producto los decide el TEMA, no la propietaria bloque a
    // bloque. Eso no ha cambiado.
    assert.equal(def.estilizable, def.origen === 'catalogo', def.nombre);
    // ⚠️ Lo que SÍ ha cambiado: este test exigía `campos: []` en todo bloque de
    // sistema, con el argumento de que "lo que enseña sale de los datos del
    // estudio". Era verdad para los DATOS (las clases de esta semana) y falso
    // para los TEXTOS que los envuelven: el titular de "Invita a una amiga"
    // era copy de un estudio concreto servido a todos, sin forma de cambiarlo.
    // Un bloque de sistema puede tener campos; los que aún no se han abierto
    // siguen con la lista vacía.
    if (def.origen === 'catalogo') assert.ok(def.campos.length > 0, def.nombre);
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

// ── completoSi: el motor y el render tienen que decir lo MISMO ──────────────
// Este es el punto entero del cambio. `bloqueEstaCompleto` decide si el
// bloque se pinta; el render, justo después, hace `resolverVideoEmbed(url)!`
// y `resolverHrefBloque(href)!` con la aserción de no-nulo puesta. Si el
// validador del motor fuera un ápice más laxo que el resolvedor del render,
// esa aserción sería mentira y la socia acabaría viendo un `<iframe
// src={null}>`. Pasó de verdad mientras se escribía esto: había dos copias de
// la validación y divergían en AMBOS sentidos.
const URLS_FRONTERIZAS = [
  'https://youtube.com/',                       // host bueno, sin id
  'https://youtube.com/watch',                  // /watch sin ?v=
  'https://youtube.com/watch?v=abc123',
  'https://www.youtube.com/embed/abc123',
  'https://m.youtube.com/watch?v=abc123',       // el motor duplicado lo rechazaba
  'https://youtu.be/',                          // sin id
  'https://youtu.be/abc123',
  'https://vimeo.com/abc',                      // id no numérico
  'https://vimeo.com/123456',
  'https://player.vimeo.com/video/123456',
  'https://player.vimeo.com/otro',
  'ftp://youtube.com/x',                        // protocolo no http(s)
  'javascript:alert(1)',
  'https://malicioso.com/x.mp4',
  '   ', '',
];

test('el validador videoEmbed dice exactamente lo mismo que resolverVideoEmbed', () => {
  for (const url of URLS_FRONTERIZAS) {
    const completo = bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url } });
    const resuelve = resolverVideoEmbed(url) !== null;
    assert.equal(completo, resuelve, `divergen en ${JSON.stringify(url)}`);
  }
});

const HREFS_FRONTERIZOS = [
  '/reservar', '/', 'https://ejemplo.com', 'http://ejemplo.com',
  'javascript:alert(1)', 'data:text/html,x', 'ftp://ejemplo.com',
  'ejemplo.com', '   ', '',
];

test('el validador href dice exactamente lo mismo que resolverHrefBloque', () => {
  for (const href of HREFS_FRONTERIZOS) {
    const completo = bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Reservar', href } });
    const resuelve = resolverHrefBloque(href) !== null;
    assert.equal(completo, resuelve, `divergen en ${JSON.stringify(href)}`);
  }
});

test('un kind desconocido no está completo — nunca llega al render', () => {
  // Antes esto no se podía ni preguntar: la cadena de `if` acababa en un
  // `return b.config.testimonios.length > 0` que reventaba con cualquier
  // config que no fuera la de testimonios.
  const raro = { id: 'x', kind: 'inventado', config: {} } as unknown as Exclude<BloqueHome, { kind: 'sistema' }>;
  assert.equal(bloqueEstaCompleto(raro), false);
});

test('completoSi está declarado en los 6 bloques que lo tenían, y solo en esos', () => {
  const conCondicion = DEFINICIONES_CATALOGO.filter((d) => d.completoSi).map((d) => d.id).sort();
  assert.deepEqual(conCondicion, ['cta', 'faq', 'galeria', 'testimonios', 'texto', 'video']);
  // Banner es el único sin condición: se pinta con o sin imagen y sin enlace.
  assert.equal(REGISTRO_BLOQUES.banner.completoSi, undefined);
});

test('un botón con solo espacios ya no cuenta como completo — cambio deliberado', () => {
  // Antes la condición era `!!b.config.textoBoton`, verdad para '   '. El
  // resultado era un botón real, enlazado, con la etiqueta en blanco. `noVacio`
  // hace `trim()`, así que ahora el bloque no se pinta y además aparece en el
  // panel de "antes de publicar". Es el único cambio de comportamiento de esta
  // PR y va a mejor.
  const conEspacios = { id: 'c', kind: 'cta', config: { titulo: '', textoBoton: '   ', href: '/reservar' } } as const;
  assert.equal(bloqueEstaCompleto(conEspacios), false);
  assert.equal(bloqueEstaCompleto({ ...conEspacios, config: { ...conEspacios.config, textoBoton: 'Reservar' } }), true);
  // Mismo criterio en `texto`: un título de espacios no salva el bloque.
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: '  ', texto: '' } }), false);
});

// ── Lectura tolerante ───────────────────────────────────────────────────────

test('un array ya válido sale igual, salvo los defaults que se rellenan a propósito', () => {
  // ⚠️ Este test decía "byte a byte igual". Dejó de ser cierto para los
  // bloques de SISTEMA con campos abiertos, y el cambio es deliberado: ahora
  // se les rellena el texto de fábrica igual que ya se hacía con el catálogo,
  // que es lo que hace retroactivo un campo nuevo sin migrar datos.
  //
  // Lo que se sigue exigiendo, y es lo que este test protege de verdad: que
  // NADA de lo guardado se pierda ni se altere.
  const bueno: BloqueHome[] = [
    { id: 's', kind: 'sistema', sistemaId: 'estaSemana' },
    { id: 's2', kind: 'sistema', sistemaId: 'tiraSemana', oculto: true },
    { id: 'b', kind: 'banner', config: { imagenUrl: 'u', titulo: 'T', texto: 'x', href: '/reservar' } },
    { id: 'f', kind: 'faq', config: { titulo: '', preguntas: [{ pregunta: 'P', respuesta: 'R' }] }, estilo: { esquinas: 'pill' } },
  ];
  const salida = resolverBloques(bueno);
  // Lo del catálogo, intacto byte a byte.
  assert.deepEqual(salida.slice(2), bueno.slice(2));
  // `tiraSemana` no tiene campos (ni los tendrá): sigue saliendo idéntico.
  assert.deepEqual(salida[1], bueno[1]);
  // `estaSemana` sí, y gana sus textos de fábrica sin perder nada de lo suyo.
  assert.equal(salida[0].id, 's');
  assert.equal((salida[0] as { config: Record<string, unknown> }).config.titulo, 'Esta semana');
});

test('un kind desconocido se descarta SOLO a sí mismo — antes reventaba la pantalla entera', () => {
  // El bug latente: `BloqueHomeRender` acaba en `return <TestimoniosBloque>`
  // sin guarda, así que un kind inesperado leía `config.testimonios.map` de
  // una config que no lo tiene. La socia perdía sus clases y su bono, no solo
  // el bloque raro.
  const conBasura = [
    { id: 'ok1', kind: 'texto', config: { titulo: 'A', texto: 'B' } },
    { id: 'raro', kind: 'delFuturo', config: { loQueSea: 1 } },
    { id: 'ok2', kind: 'sistema', sistemaId: 'estaSemana' },
  ];
  const salida = resolverBloques(conBasura);
  assert.deepEqual(salida.map((b) => b.id), ['ok1', 'ok2']);
});

test('descarta lo que no es un bloque, sin lanzar', () => {
  assert.deepEqual(resolverBloques([null, 42, 'texto', [], {}, { kind: 'texto' }, { id: 'x' }]), []);
  assert.deepEqual(resolverBloques('no soy un array'), []);
  assert.deepEqual(resolverBloques(undefined), []);
  assert.equal(resolverBloque({ id: 'x', kind: 'sistema' }), null, 'sistema sin sistemaId');
  assert.equal(resolverBloque({ id: 'x', kind: 'sistema', sistemaId: 'inventado' }), null);
  // Un `kind` de catálogo no puede colarse como sistemaId, ni al revés.
  assert.equal(resolverBloque({ id: 'x', kind: 'sistema', sistemaId: 'banner' }), null);
  assert.equal(resolverBloque({ id: 'x', kind: 'retos', config: {} }), null);
});

test('una clave ausente se rellena con su porDefecto — un campo nuevo es retroactivo', () => {
  // Este es el efecto que vale más que la tolerancia: lo guardado pasa a ser
  // un parche sobre los defaults del schema, así que añadir un campo NO exige
  // migrar los jsonb de todos los estudios. Justo lo que no pasaba con los
  // `defaults` de los temas.
  const viejo = { id: 'v', kind: 'video', config: { url: 'https://youtu.be/x' } };
  assert.deepEqual(resolverBloque(viejo), {
    id: 'v', kind: 'video', config: { titulo: '', url: 'https://youtu.be/x' },
  });
  const sinConfig = { id: 'b', kind: 'banner' };
  assert.deepEqual(resolverBloque(sinConfig), {
    id: 'b', kind: 'banner', config: { imagenUrl: '', titulo: '', texto: '', href: '' },
  });
});

test('una clave desconocida se CONSERVA — tirarla la borraría en el siguiente guardado', () => {
  const conExtra = { id: 't', kind: 'texto', config: { titulo: 'A', texto: 'B', campoDeOtraVersion: 'no me borres' } };
  const salida = resolverBloque(conExtra) as { config: Record<string, unknown> };
  assert.equal(salida.config.campoDeOtraVersion, 'no me borres');
});

test('estilo NO se rellena con defaults — ausente significa "hereda del tema"', () => {
  // Si `resolverConfig` tocara `estilo`, un bloque que hoy hereda pasaría a
  // llevar `esquinas: 'redondeada'` y `espaciado: 'normal'` escritos, y
  // cambiaría de aspecto en estudios reales sin que nadie tocara nada.
  const sinEstilo = resolverBloque({ id: 't', kind: 'texto', config: { titulo: 'A', texto: 'B' } });
  assert.equal('estilo' in (sinEstilo as object), false);
  const conEstiloParcial = resolverBloque({ id: 't', kind: 'texto', config: { titulo: 'A', texto: 'B' }, estilo: { fondo: '#aabbcc' } });
  assert.deepEqual((conEstiloParcial as { estilo: unknown }).estilo, { fondo: '#aabbcc' });
});

test('resolveBloquesPantalla ya no deja pasar basura al render', () => {
  const shape = resolveBloquesPantalla(
    { draft: [{ id: 'ok', kind: 'texto', config: { titulo: 'A', texto: '' } }, { id: 'malo', kind: 'zzz' }], publicado: [] },
    'home',
  );
  // La basura se cae; lo bueno sobrevive. Los fijos se añaden delante (existen
  // siempre), así que lo que este test protege es que `zzz` NO pasa.
  const ids = shape.draft.map((b) => b.id);
  assert.equal(ids.includes('malo'), false);
  assert.equal(ids.includes('ok'), true);
});

// ── Anidamiento de un nivel, solo en bloques de catálogo ───────────────────
// Ninguna definición declara `hijos` todavía, así que estos tests usan un
// registro de mentira para probar el MECANISMO. El día que un bloque real los
// declare, la fontanería ya está probada.

test('sin `hijos` en la definición, un array de hijos en el jsonb se ignora', () => {
  // El caso de hoy: los siete bloques no admiten hijos. Si alguien mete un
  // `hijos` a mano en la base de datos, no debe colarse al render.
  const conHijosNoPedidos = {
    id: 'b', kind: 'texto', config: { titulo: 'A', texto: 'B' },
    hijos: [{ id: 'h', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '/x' } }],
  };
  const salida = resolverBloque(conHijosNoPedidos) as Record<string, unknown>;
  assert.equal('hijos' in salida, false);
});

test('un bloque sin hijos NO gana una clave `hijos` vacía', () => {
  // Importante para la no-regresión: el objeto guardado tiene que salir igual
  // que entró, no con un `hijos: []` de más que luego se persistiría.
  const simple: BloqueHome = { id: 't', kind: 'texto', config: { titulo: 'A', texto: 'B' } };
  assert.deepEqual(resolverBloque(simple), simple);
});

test('el tipo impide un segundo nivel — BloqueHijo no tiene `hijos`', () => {
  // Comprobación de tipo, no de runtime: si `BloqueHijo` volviera a admitir
  // `hijos`, esto dejaría de compilar. El runtime lo cubre el test siguiente.
  const hijo: BloqueHijo = { id: 'h', kind: 'texto', config: { titulo: '', texto: 'x' } };
  assert.equal('hijos' in hijo, false);
  // @ts-expect-error un hijo no puede tener hijos
  const invalido: BloqueHijo = { id: 'h2', kind: 'texto', config: { titulo: '', texto: 'x' }, hijos: [] };
  void invalido;
});

// ── Campos de los bloques de SISTEMA ────────────────────────────────────────
// Abrirlos es el arreglo de la queja "solo puedo reordenar bloques": el estado
// por defecto de las tres pantallas es 100 % bloques de sistema, así que
// mientras tuvieran `campos: []` una propietaria no podía editar NADA hasta
// añadir un bloque de catálogo.

test('los cuatro bloques del Inicio ya no están vacíos de campos', () => {
  assert.ok(getDefinicionBloque('estaSemana')!.campos.length > 0);
  assert.ok(getDefinicionBloque('accesosRapidos')!.campos.length > 0);
  assert.ok(getDefinicionBloque('invitarAmiga')!.campos.length > 0);
});

test('⚠️ los porDefecto SON los textos que estaban escritos a fuego en el render', () => {
  // Si alguien cambia un texto en portal-home-view.tsx y no aquí, el portal de
  // un estudio que nunca tocó el campo cambiaría solo. Este test es el ancla.
  const campo = (sis: string, id: string) =>
    getDefinicionBloque(sis)!.campos.find((c) => c.id === id) as { porDefecto: unknown };
  assert.equal(campo('estaSemana', 'titulo').porDefecto, 'Esta semana');
  assert.equal(campo('estaSemana', 'enlaceTexto').porDefecto, 'Agenda →');
  assert.equal(campo('invitarAmiga', 'antetitulo').porDefecto, 'Trae a quien quieras');
  assert.equal(campo('invitarAmiga', 'titulo').porDefecto, 'La calma se comparte mejor.');
  assert.equal(campo('invitarAmiga', 'subtitulo').porDefecto, 'Invita a una amiga y ganáis las dos');
  // El de accesos rápidos va vacío a propósito: sin rótulo propio manda el del
  // tema (`rotuloAccesos`), y un texto aquí lo pisaría para todo el mundo.
  assert.equal(campo('accesosRapidos', 'titulo').porDefecto, '');
});

test('un bloque de sistema guardado SIN config se lee con los textos de siempre', () => {
  // El caso de todos los estudios que ya existen: su jsonb no tiene `config`.
  const b = resolverBloque({ id: 'x', kind: 'sistema', sistemaId: 'invitarAmiga' });
  assert.ok(b && b.kind === 'sistema');
  assert.equal((b.config as Record<string, unknown>).titulo, 'La calma se comparte mejor.');
});

test('un texto guardado por el estudio NO se pisa con el de fábrica', () => {
  const b = resolverBloque({
    id: 'x', kind: 'sistema', sistemaId: 'invitarAmiga',
    config: { titulo: 'Ven con quien tú quieras' },
  });
  assert.ok(b && b.kind === 'sistema');
  const c = b.config as Record<string, unknown>;
  assert.equal(c.titulo, 'Ven con quien tú quieras');
  // Y lo que no tocó sigue en el texto de siempre, no en undefined.
  assert.equal(c.antetitulo, 'Trae a quien quieras');
});

test('los módulos de Clases, Bonos, Progreso y Retos también tienen campos', () => {
  for (const sis of ['listadoClases', 'listadoBonos', 'progresoSemanal', 'retos']) {
    assert.ok(getDefinicionBloque(sis)!.campos.length > 0, sis);
  }
});

test('⚠️ y sus porDefecto también SON los literales del render', () => {
  const campo = (sis: string, id: string) =>
    getDefinicionBloque(sis)!.campos.find((c) => c.id === id) as { porDefecto: unknown };
  assert.equal(campo('listadoClases', 'titulo').porDefecto, 'Clases');
  assert.equal(campo('listadoClases', 'vacioDia').porDefecto, 'No hay clases este día.');
  assert.equal(campo('listadoClases', 'vacioMias').porDefecto, 'Todavía no tienes ninguna clase reservada.');
  assert.equal(campo('listadoBonos', 'antetitulo').porDefecto, 'Saldo y planes');
  assert.equal(campo('listadoBonos', 'titulo').porDefecto, 'Bonos');
  assert.equal(campo('progresoSemanal', 'titulo').porDefecto, 'Tu semana');
  assert.equal(campo('retos', 'titulo').porDefecto, 'Retos');
});

test('`tiraSemana` se queda SIN campos a propósito — no tiene ningún texto propio', () => {
  // Son siete casillas de día generadas de los datos. Inventarle un "título"
  // sería un control que no mueve nada, que es peor que su ausencia.
  assert.deepEqual(getDefinicionBloque('tiraSemana')!.campos, []);
});

test('un bloque de sistema SIN campos abiertos no gana un `config` vacío', () => {
  // Ensuciar el jsonb de todos los estudios con `config: {}` no aporta nada y
  // hace ruido en cada diff de guardado.
  const b = resolverBloque({ id: 'x', kind: 'sistema', sistemaId: 'contenidoEstudio' });
  assert.ok(b && b.kind === 'sistema');
  assert.equal('config' in b, false);
});

// ── El Hero: cabecera + tarjeta de próxima clase ────────────────────────────
// Medido en un estudio real: el saludo y la tarjeta grande son el 48 % del alto
// del Inicio, y hasta ahora no estaban en el editor — ni listados, ni
// seleccionables, ni editables. Y el diseño aprobado los pone PRIMEROS en el
// `bloquesHome` de los tres temas, con el nombre `proximaClase`.

test('la cabecera y la tarjeta existen como bloques, con campos', () => {
  assert.ok(getDefinicionBloque('cabecera')!.campos.length > 0);
  assert.ok(getDefinicionBloque('proximaClase')!.campos.length > 0);
});

test('se llama `proximaClase`, no `tarjetaPrincipal` — ese id YA es un eje de variantes', () => {
  // `variantes.tarjetaPrincipal` (hero | rotulada) existe desde antes. Dos
  // cosas distintas con el mismo id habrían sido un enredo garantizado, y
  // además `proximaClase` es el nombre que usa el diseño aprobado.
  assert.equal(getDefinicionBloque('tarjetaPrincipal'), undefined);
  assert.ok(getDefinicionBloque('proximaClase'));
});

test('⚠️ los porDefecto de los seis estados SON los literales del render', () => {
  const c = (id: string) =>
    (getDefinicionBloque('proximaClase')!.campos.find((x) => x.id === id) as { porDefecto: unknown }).porDefecto;
  assert.equal(c('vaciaVolanta'), 'Sin clases reservadas');
  assert.equal(c('vaciaTitulo'), 'Empieza por aquí');
  assert.equal(c('vaciaTexto'), 'Elige el día que mejor te venga');
  assert.equal(c('vaciaBoton'), 'Ver la agenda');
  assert.equal(c('proximaVolanta'), 'Tu próxima clase');
  assert.equal(c('proximaBoton'), 'Ver mi acceso');
  assert.equal(c('bonoTitulo'), 'Te queda una sesión');
  assert.equal(c('rachaTitulo'), 'No la pierdas ahora');
  assert.equal(c('inactivaTitulo'), 'Tu sitio te espera');
});

test('la frase "con clase" va VACÍA por defecto — hay dos literales según el tema', () => {
  // '¿Lista para tu sesión de hoy?' en la cabecera clásica y 'Hoy tienes una
  // cita contigo.' en las demás. Un porDefecto aquí impondría uno de los dos a
  // todos los temas; vacío, cada sitio conserva el suyo.
  const c = getDefinicionBloque('cabecera')!.campos.find((x) => x.id === 'fraseConClase') as { porDefecto: unknown };
  assert.equal(c.porDefecto, '');
});

test('⚠️ un estudio que YA tiene su Inicio guardado recibe los bloques fijos', () => {
  // Sin esto no aparecerían NUNCA: `resolveBloquesPantalla` devolvía lo
  // guardado tal cual. Es lo que dejó fuera a tiraSemana/progresoSemanal/retos
  // de todo estudio que no instalara uno de los tres temas.
  const guardado = {
    draft: [{ id: 'a', kind: 'sistema', sistemaId: 'accesosRapidos' }],
    publicado: [{ id: 'a', kind: 'sistema', sistemaId: 'accesosRapidos' }],
  };
  const r = resolveBloquesPantalla(guardado, 'home');
  const ids = r.draft.filter((b) => b.kind === 'sistema').map((b) => b.sistemaId);
  assert.deepEqual(ids.slice(0, 2), ['cabecera', 'proximaClase'], 'van delante, en su orden');
  assert.ok(ids.includes('accesosRapidos'), 'y no se pierde lo que ya tenía');
});

test('los fijos NO se duplican si ya estaban guardados', () => {
  const guardado = {
    draft: [
      { id: 'c', kind: 'sistema', sistemaId: 'cabecera' },
      { id: 'p', kind: 'sistema', sistemaId: 'proximaClase' },
      { id: 'a', kind: 'sistema', sistemaId: 'accesosRapidos' },
    ],
    publicado: [],
  };
  const ids = resolveBloquesPantalla(guardado, 'home').draft.map((b) => b.id);
  assert.deepEqual(ids, ['c', 'p', 'a']);
});

test('un bloque reordenable que el estudio quitó NO se le vuelve a meter', () => {
  // Solo se inyectan los FIJOS. Reinyectar los demás sería deshacerle una
  // decisión a la propietaria cada vez que abre el editor.
  const guardado = { draft: [{ id: 'a', kind: 'sistema', sistemaId: 'accesosRapidos' }], publicado: [] };
  const ids = resolveBloquesPantalla(guardado, 'home').draft.filter((b) => b.kind === 'sistema').map((b) => b.sistemaId);
  assert.equal(ids.includes('invitarAmiga'), false);
  assert.equal(ids.includes('estaSemana'), false);
});

test('en Clases y Bonos no hay fijos: su lista guardada sale intacta', () => {
  const guardado = { draft: [{ id: 'l', kind: 'sistema', sistemaId: 'listadoClases' }], publicado: [] };
  assert.deepEqual(resolveBloquesPantalla(guardado, 'clases').draft.map((b) => b.id), ['l']);
});

test('⚠️ un campo con porDefecto VACÍO no debe borrar el texto del render', () => {
  // El bug: `fraseConClase` va vacía a propósito (cada variante de cabecera
  // conserva SU frase). El helper del render trataba '' como valor válido, así
  // que en vez de heredar BORRABA la frase cuando la socia sí tenía clase hoy.
  //
  // Ni tsc, ni el lint, ni 1793 unitarios, ni los 22 e2e del editor lo vieron:
  // lo cazó un e2e del PORTAL que no se me ocurrió correr. Este test fija la
  // pieza que se puede comprobar desde aquí — que el defecto es '' — para que
  // el día que alguien le ponga un texto se pregunte por qué estaba vacío.
  const c = getDefinicionBloque('cabecera')!.campos.find((x) => x.id === 'fraseConClase') as { porDefecto: unknown };
  assert.equal(c.porDefecto, '', 'vacío = "la frase que traiga tu tema", no una frase impuesta a todos');
  // Y la que sí tiene texto propio lo conserva.
  const sin = getDefinicionBloque('cabecera')!.campos.find((x) => x.id === 'fraseSinClase') as { porDefecto: unknown };
  assert.equal(sin.porDefecto, 'Tu sitio sigue aquí.');
});

// ── Etapa 1: condiciones y grupos en el estilo ──────────────────────────────
test('estilo: "Esquinas" se esconde sin fondo NI sombra — no hay nada que redondear', () => {
  const ids = (v: Record<string, unknown>) => camposVisibles(CAMPOS_ESTILO, v).map((c) => c.id);
  assert.equal(ids({}).includes('esquinas'), false);
  assert.equal(ids({ sombra: 'ninguna' }).includes('esquinas'), false);
  assert.equal(ids({ fondo: '#FFEEDD' }).includes('esquinas'), true);
  assert.equal(ids({ sombra: 'suave' }).includes('esquinas'), true);
});

test('estilo: la condición NO esconde nada más — los otros 7 salen siempre', () => {
  // Una condición mal puesta que oculte de más es peor que no tenerla: la
  // propietaria pierde controles sin saber por qué.
  const visibles = camposVisibles(CAMPOS_ESTILO, {}).map((c) => c.id);
  assert.deepEqual(visibles.sort(), ['alineacion', 'ancho', 'color', 'espaciado', 'fondo', 'sombra', 'tamanoTexto']);
});

test('estilo del BANNER: esquinas siempre (recortan la foto) y fondo solo sin foto', () => {
  const ids = (v: Record<string, unknown>) => camposVisibles(CAMPOS_ESTILO_BANNER, v).map((c) => c.id);
  // Sin fondo ni sombra, banner SÍ enseña esquinas — su geometría es propia.
  assert.equal(ids({ imagenUrl: '' }).includes('esquinas'), true);
  // Con foto, el fondo no se vería nunca: el panel deja de ofrecerlo.
  assert.equal(ids({ imagenUrl: 'https://x/foto.jpg' }).includes('fondo'), false);
  assert.equal(ids({ imagenUrl: '' }).includes('fondo'), true);
});

test('estilo: los 8 controles quedan en 3 secciones, ninguno suelto', () => {
  const r = agruparCampos(CAMPOS_ESTILO, { fondo: '#000000' });
  assert.deepEqual(r.sueltos, []);
  assert.deepEqual(r.grupos.map((g) => g.titulo), ['Color', 'Disposición', 'Forma']);
});

test('REGISTRO_BLOQUES: solo banner declara camposEstilo propio', () => {
  // Si otro bloque lo necesitara habría que justificarlo: el estilo común es
  // lo que hace que el panel se sienta igual en todos.
  const conPropio = Object.values(REGISTRO_BLOQUES).filter((d) => d.camposEstilo).map((d) => d.id);
  assert.deepEqual(conPropio, ['banner']);
});

// ── Etapa 3: "fijo" vive en la instancia ───────────────────────────────────
test('conFijos MARCA los bloques fijos que ya estaban sin la marca', () => {
  // Un borrador guardado antes de que la marca existiera. Sin marcarlo, sus
  // bloques fijos pasarían de golpe a ser arrastrables y borrables.
  const viejo: BloqueHome[] = [
    { id: 'sistema-cabecera', kind: 'sistema', sistemaId: 'cabecera' },
    { id: 'sistema-proximaClase', kind: 'sistema', sistemaId: 'proximaClase' },
    { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  ];
  const r = conFijos(viejo, 'home');
  assert.equal(r.length, 3, 'no debe duplicar los que ya estaban');
  assert.deepEqual(r.filter(esBloqueFijo).map((b) => b.id), ['sistema-cabecera', 'sistema-proximaClase']);
  // El que no es fijo se queda intacto, sin marca.
  assert.equal(esBloqueFijo(r.find((b) => b.id === 'sistema-estaSemana')!), false);
});

test('esBloqueFijo pregunta al BLOQUE, no a una tabla por pantalla', () => {
  // Ese cambio de firma es el punto de la etapa: el llamador ya no puede
  // consultar la pantalla equivocada, que es como se coló el bug de los
  // bloques fijos invisibles en el editor.
  assert.equal(esBloqueFijo({ id: 'x', kind: 'sistema', sistemaId: 'cabecera', fijo: true }), true);
  assert.equal(esBloqueFijo({ id: 'x', kind: 'sistema', sistemaId: 'cabecera' }), false);
  assert.equal(esBloqueFijo({ id: 'x', kind: 'texto', config: { titulo: '', texto: '' } }), false);
});

test('los defaults traen ya la marca — misma forma que lo que devuelve la lectura', () => {
  // Si los defaults salieran sin marca, un estudio nuevo y uno con borrador
  // guardado tendrían bloques distintos para la MISMA pantalla.
  assert.deepEqual(
    DEFAULT_BLOQUES_POR_PANTALLA.home.filter(esBloqueFijo).map((b) => (b as { sistemaId: string }).sistemaId),
    ['cabecera', 'proximaClase'],
  );
  assert.deepEqual(DEFAULT_BLOQUES_POR_PANTALLA.clases.filter(esBloqueFijo), []);
});

// ── Etapa 4b: el lector acepta las dos formas ──────────────────────────────
test('resolverBloques lee el documento {bloques, orden} igual que un array', () => {
  const comoArray = [
    { id: 'a', kind: 'texto', config: { titulo: 'Uno', texto: '' } },
    { id: 'b', kind: 'texto', config: { titulo: 'Dos', texto: '' } },
  ];
  const comoDocumento = { bloques: { a: comoArray[0], b: comoArray[1] }, orden: ['a', 'b'] };
  assert.deepEqual(resolverBloques(comoDocumento), resolverBloques(comoArray));
});

test('resolverBloques respeta el ORDEN del documento, no el de las claves del mapa', () => {
  const doc = {
    bloques: {
      b: { id: 'b', kind: 'texto', config: { titulo: 'Dos', texto: '' } },
      a: { id: 'a', kind: 'texto', config: { titulo: 'Uno', texto: '' } },
    },
    orden: ['a', 'b'],
  };
  assert.deepEqual(resolverBloques(doc).map((x) => x.id), ['a', 'b']);
});

test('un id del orden que no está en el mapa se ignora — dato a medio migrar', () => {
  // Lo contrario sería un `undefined` colándose en el render, y la pantalla de
  // la socia en blanco. Mismo criterio que el `kind` desconocido.
  const doc = {
    bloques: { a: { id: 'a', kind: 'texto', config: { titulo: 'Uno', texto: '' } } },
    orden: ['fantasma', 'a'],
  };
  assert.deepEqual(resolverBloques(doc).map((x) => x.id), ['a']);
});

test('lo que NO es ni array ni documento sigue devolviendo vacío', () => {
  for (const basura of [null, undefined, 42, 'x', {}, { bloques: {} }, { orden: [] }]) {
    assert.deepEqual(resolverBloques(basura), [], JSON.stringify(basura));
  }
});

test('resolveBloquesPantalla entiende un borrador guardado como documento', () => {
  // El camino completo, que es el que usa el servidor al pintar el portal.
  const guardado = {
    draft: { bloques: { t: { id: 't', kind: 'texto', config: { titulo: 'Hola', texto: '' } } }, orden: ['t'] },
    publicado: [],
  };
  const r = resolveBloquesPantalla(guardado, 'clases');
  assert.deepEqual(r.draft.map((b) => b.id), ['t']);
});
