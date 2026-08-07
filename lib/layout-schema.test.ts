import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, aplicarLayout, DEFAULT_LAYOUT, layoutConfigSchema, type OrdenVisibilidad, bloqueHomeSchema } from './layout-schema.ts';
import { DEFAULT_BLOQUES_SHAPE } from './portal-home-bloques.ts';

test('resolveLayout: null/garbage → default', () => {
  assert.deepEqual(resolveLayout(null), DEFAULT_LAYOUT);
  assert.deepEqual(resolveLayout('x'), DEFAULT_LAYOUT);
  assert.deepEqual(resolveLayout(7), DEFAULT_LAYOUT);
});

test('resolveLayout: filtra tipos inválidos por campo', () => {
  const r = resolveLayout({ orden: ['/a', 3, '/b'], ocultos: 'no', menuPosition: 'raro' });
  assert.deepEqual(r.orden, ['/a', '/b']);
  assert.deepEqual(r.ocultos, []);
  assert.equal(r.menuPosition, 'lateral');
});

test('resolveLayout: config válida se respeta', () => {
  const r = resolveLayout({ orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior' });
  assert.deepEqual(r, {
    orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior',
    home: { orden: [], ocultos: [] },
    portalHome: { orden: [], ocultos: [] },
    bloques: DEFAULT_BLOQUES_SHAPE,
  });
});

test('resolveLayout: resuelve bloques.home (Fase 3) — ver portal-home-bloques.test.ts para el detalle de resolveBloquesPantalla', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveLayout({ bloques: { home: guardado } });
  // Los bloques FIJOS (cabecera y tarjeta de próxima clase) se añaden delante
  // siempre: existen por definición, no son algo que el estudio pueda no tener.
  // Lo que este test protege es que SUS bloques salen intactos.
  const suyos = r.bloques.home.publicado.filter((b) => b.kind !== 'sistema');
  assert.deepEqual(suyos, guardado.publicado);
});

test('resolveLayout: homeBloques legacy (antes de la Fase 1 del Theme Builder) se sigue leyendo como bloques.home', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveLayout({ homeBloques: guardado });
  // Los bloques FIJOS (cabecera y tarjeta de próxima clase) se añaden delante
  // siempre: existen por definición, no son algo que el estudio pueda no tener.
  // Lo que este test protege es que SUS bloques salen intactos.
  const suyos = r.bloques.home.publicado.filter((b) => b.kind !== 'sistema');
  assert.deepEqual(suyos, guardado.publicado);
});

test('resolveLayout: resuelve bloques.clases/bonos de forma independiente', () => {
  const guardadoClases = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Promo', texto: 'x' } }] };
  const r = resolveLayout({ bloques: { clases: guardadoClases } });
  assert.deepEqual(r.bloques.clases.publicado, guardadoClases.publicado);
  // Home y Bonos, no tocados, siguen en su default.
  assert.deepEqual(r.bloques.home, DEFAULT_BLOQUES_SHAPE.home);
  assert.deepEqual(r.bloques.bonos, DEFAULT_BLOQUES_SHAPE.bonos);
});

test('resolveLayout: resuelve la config de la home', () => {
  const r = resolveLayout({ home: { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] } });
  assert.deepEqual(r.home, { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] });
  assert.deepEqual(resolveLayout({ home: 'basura' }).home, { orden: [], ocultos: [] });
});

test('resolveLayout: resuelve la config de portalHome (Inicio del portal cliente)', () => {
  const r = resolveLayout({ portalHome: { orden: ['estaSemana', 'invitarAmiga'], ocultos: ['accesosRapidos'] } });
  assert.deepEqual(r.portalHome, { orden: ['estaSemana', 'invitarAmiga'], ocultos: ['accesosRapidos'] });
  assert.deepEqual(resolveLayout({ portalHome: 'basura' }).portalHome, { orden: [], ocultos: [] });
});

const TODOS = ['/dashboard', '/calendario', '/socios', '/pagos', '/pos'];

test('aplicarLayout: default no cambia el orden', () => {
  assert.deepEqual(aplicarLayout(TODOS, DEFAULT_LAYOUT), TODOS);
});

test('aplicarLayout: oculta módulos', () => {
  const cfg: OrdenVisibilidad = { orden: [], ocultos: ['/pos', '/pagos'] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/dashboard', '/calendario', '/socios']);
});

test('aplicarLayout: reordena y añade el resto en orden natural', () => {
  const cfg: OrdenVisibilidad = { orden: ['/socios', '/dashboard'], ocultos: [] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/socios', '/dashboard', '/calendario', '/pagos', '/pos']);
});

test('aplicarLayout: ignora hrefs de orden que ya no existen', () => {
  const cfg: OrdenVisibilidad = { orden: ['/borrado', '/pos'], ocultos: [] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/dashboard', '/calendario', '/socios', '/pagos']);
});

test('aplicarLayout: reordenar + ocultar a la vez', () => {
  const cfg: OrdenVisibilidad = { orden: ['/pos', '/socios'], ocultos: ['/dashboard'] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/socios', '/calendario', '/pagos']);
});

test('layoutConfigSchema: bloques ausente → default (config guardada antes de esta fase)', () => {
  const sinBloques = { ...DEFAULT_LAYOUT };
  const objSinBloques = sinBloques as Record<string, unknown>;
  delete objSinBloques.bloques;
  const r = layoutConfigSchema.safeParse(objSinBloques);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.bloques, DEFAULT_BLOQUES_SHAPE);
});

test('layoutConfigSchema: acepta un bloque de cada tipo del catálogo, por pantalla', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      home: {
        draft: [
          { id: 'a', kind: 'banner', config: { imagenUrl: 'https://x.com/i.png', titulo: 'T', texto: 'x', href: '/reservar' } },
          { id: 'b', kind: 'texto', config: { titulo: 'T', texto: 'x' } },
          { id: 'c', kind: 'cta', config: { titulo: 'T', textoBoton: 'Ir', href: '/reservar' } },
          { id: 'd', kind: 'faq', config: { titulo: 'T', preguntas: [{ pregunta: '¿?', respuesta: '.' }] } },
        ],
        publicado: [],
      },
    },
  });
  assert.equal(r.success, true);
});

test('layoutConfigSchema: acepta `estilo` por bloque (fondo/color/alineación/espaciado) y lo conserva tal cual', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      home: {
        draft: [
          {
            id: 'a', kind: 'texto', config: { titulo: 'T', texto: 'x' },
            estilo: { fondo: '#1E3A8A', color: '#FFFFFF', alineacion: 'centro', espaciado: 'amplio' },
          },
        ],
        publicado: [],
      },
    },
  });
  assert.equal(r.success, true);
  if (r.success) {
    // `draft` es ahora una unión (array o documento) porque el zod acepta las
    // dos formas — ver pantallaGuardadaSchema. Aquí el caso de prueba es un
    // array, así que se estrecha explícitamente.
    const draft = r.data.bloques.home.draft;
    assert.ok(Array.isArray(draft));
    const bloque = draft[0]!;
    assert.equal(bloque.kind, 'texto');
    if (bloque.kind === 'texto') {
      assert.deepEqual(bloque.estilo, { fondo: '#1E3A8A', color: '#FFFFFF', alineacion: 'centro', espaciado: 'amplio' });
    }
  }
});

test('layoutConfigSchema: `estilo` ausente sigue validando (compatibilidad con bloques guardados antes de esta fase)', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      home: { draft: [{ id: 'a', kind: 'texto', config: { titulo: 'T', texto: 'x' } }], publicado: [] },
    },
  });
  assert.equal(r.success, true);
});

test('layoutConfigSchema: rechaza un bloque de kind desconocido', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: { ...DEFAULT_BLOQUES_SHAPE, home: { draft: [{ id: 'a', kind: 'carrusel', config: {} }], publicado: [] } },
  });
  assert.equal(r.success, false);
});

test('layoutConfigSchema: acepta los 3 tipos de bloque nuevos (galería/vídeo/testimonios)', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      clases: {
        draft: [
          { id: 'g', kind: 'galeria', config: { imagenes: [{ url: 'https://x.com/i.png', alt: 'x' }] } },
          { id: 'v', kind: 'video', config: { titulo: 'T', url: 'https://youtube.com/watch?v=abc' } },
          { id: 't', kind: 'testimonios', config: { titulo: 'T', testimonios: [{ cita: 'x', autor: 'Ana', rol: 'Socia' }] } },
        ],
        publicado: [],
      },
    },
  });
  assert.equal(r.success, true);
});

test('layoutConfigSchema: acepta un bloque con el estilo ampliado (tamanoTexto/esquinas/sombra/ancho)', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      home: {
        draft: [{
          id: 'a', kind: 'texto', config: { titulo: 'T', texto: 'x' },
          estilo: { fondo: '#FFFFFF', color: '#000000', alineacion: 'centro', espaciado: 'amplio', tamanoTexto: 'grande', esquinas: 'pill', sombra: 'marcada', ancho: 'contenido' },
        }],
        publicado: [],
      },
    },
  });
  assert.equal(r.success, true);
});

test('layoutConfigSchema: rechaza un valor de estilo fuera del enum', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    bloques: {
      ...DEFAULT_BLOQUES_SHAPE,
      home: { draft: [{ id: 'a', kind: 'texto', config: { titulo: 'T', texto: 'x' }, estilo: { tamanoTexto: 'enorme' } }], publicado: [] },
    },
  });
  assert.equal(r.success, false);
});

test('bloqueHomeSchema conserva `fijo` — si zod lo podara, el bloque volvería a ser movible', () => {
  const r = bloqueHomeSchema.parse({ id: 'sistema-cabecera', kind: 'sistema', sistemaId: 'cabecera', fijo: true });
  assert.equal((r as { fijo?: true }).fijo, true);
});
