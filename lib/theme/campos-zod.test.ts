import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { bloqueHomeSchema } from '../layout-schema.ts';
import { zodDeCampos, zodDeBloques } from './campos-zod.ts';
import { CAMPOS_ESTILO } from '../portal-home-bloques.ts';

// ── El oráculo: el zod que estaba escrito a mano ────────────────────────────
// Copiado LITERAL de lib/layout-schema.ts antes de derivarlo. No se importa
// de ningún sitio a propósito: si se importara de donde vive el derivado, el
// test pasaría siempre. Cuando el registro gane un campo nuevo, este oráculo
// se queda atrás — y eso es exactamente lo que debe pasar: el test dirá que
// el zod cambió, y hay que decidir a conciencia si el cambio es el buscado.
const estiloOraculo = z.object({
  fondo: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  alineacion: z.enum(['izquierda', 'centro', 'derecha']).optional(),
  espaciado: z.enum(['compacto', 'normal', 'amplio']).optional(),
  tamanoTexto: z.enum(['pequeno', 'normal', 'grande']).optional(),
  esquinas: z.enum(['ninguna', 'suave', 'redondeada', 'pill']).optional(),
  sombra: z.enum(['ninguna', 'suave', 'marcada']).optional(),
  ancho: z.enum(['completo', 'contenido']).optional(),
}).optional();

const ORACULO = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('sistema'), sistemaId: z.enum(['estaSemana', 'invitarAmiga', 'contenidoEstudio', 'listadoClases', 'listadoBonos', 'tiraSemana', 'progresoSemanal', 'retos']), oculto: z.boolean().optional() }),
  z.object({
    id: z.string(), kind: z.literal('banner'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ imagenUrl: z.string(), titulo: z.string(), texto: z.string(), href: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('texto'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ titulo: z.string(), texto: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('cta'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ titulo: z.string(), textoBoton: z.string(), href: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('faq'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ titulo: z.string(), preguntas: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })) }),
  }),
  z.object({
    id: z.string(), kind: z.literal('galeria'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ imagenes: z.array(z.object({ url: z.string(), alt: z.string() })) }),
  }),
  z.object({
    id: z.string(), kind: z.literal('video'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ titulo: z.string(), url: z.string() }),
  }),
  z.object({
    id: z.string(), kind: z.literal('testimonios'), oculto: z.boolean().optional(), estilo: estiloOraculo,
    config: z.object({ titulo: z.string(), testimonios: z.array(z.object({ cita: z.string(), autor: z.string(), rol: z.string() })) }),
  }),
]);

// Casos que cubren, para cada bloque: la forma válida completa, la forma a la
// que le falta una clave (lo que llega de un estudio guardado antes de que
// ese campo existiera), la que trae basura de tipo, y la que trae claves de
// más (¿se podan o se conservan?).
const CASOS: unknown[] = [
  // sistema
  { id: 's1', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 's2', kind: 'sistema', sistemaId: 'retos', oculto: true },
  { id: 's3', kind: 'sistema', sistemaId: 'noExiste' },
  { id: 's4', kind: 'sistema' },
  // banner
  { id: 'b1', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '', href: '' } },
  { id: 'b2', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '' } },
  { id: 'b3', kind: 'banner', config: { imagenUrl: 1, titulo: 'T', texto: '', href: '' } },
  { id: 'b4', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '', href: '', sobra: 'x' } },
  { id: 'b5', kind: 'banner' },
  // texto / cta
  { id: 't1', kind: 'texto', config: { titulo: '', texto: 'Hola' } },
  { id: 't2', kind: 'texto', config: { texto: 'Hola' } },
  { id: 'c1', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '/reservar' } },
  { id: 'c2', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: 'javascript:alert(1)' } },
  // listas
  { id: 'f1', kind: 'faq', config: { titulo: '', preguntas: [] } },
  { id: 'f2', kind: 'faq', config: { titulo: '', preguntas: [{ pregunta: 'P', respuesta: 'R' }] } },
  { id: 'f3', kind: 'faq', config: { titulo: '', preguntas: [{ pregunta: 'P' }] } },
  { id: 'f4', kind: 'faq', config: { titulo: '', preguntas: 'no soy un array' } },
  { id: 'g1', kind: 'galeria', config: { imagenes: [{ url: 'u', alt: 'a' }] } },
  { id: 'v1', kind: 'video', config: { titulo: '', url: 'https://youtu.be/x' } },
  { id: 'te1', kind: 'testimonios', config: { titulo: '', testimonios: [{ cita: 'C', autor: 'A', rol: '' }] } },
  // estilo
  { id: 'e1', kind: 'texto', config: { titulo: '', texto: 'x' }, estilo: {} },
  { id: 'e2', kind: 'texto', config: { titulo: '', texto: 'x' }, estilo: { fondo: null, esquinas: 'pill' } },
  { id: 'e3', kind: 'texto', config: { titulo: '', texto: 'x' }, estilo: { esquinas: 'inventada' } },
  { id: 'e4', kind: 'texto', config: { titulo: '', texto: 'x' }, estilo: { fondo: 123 } },
  // kind desconocido y basura
  { id: 'x1', kind: 'inventado', config: {} },
  { id: 'x2', config: {} },
  null, 'texto', 42, [],
];

test('el zod derivado acepta y rechaza exactamente lo mismo que el escrito a mano', () => {
  for (const caso of CASOS) {
    const a = ORACULO.safeParse(caso);
    const b = bloqueHomeSchema.safeParse(caso);
    assert.equal(b.success, a.success, `difieren en aceptar/rechazar: ${JSON.stringify(caso)}`);
  }
});

test('y cuando aceptan, devuelven exactamente el mismo objeto', () => {
  // Esto es lo que de verdad puede perder contenido de la propietaria: si el
  // derivado podara una clave que el de antes conservaba, el siguiente
  // guardado la borraría de la base de datos sin avisar a nadie.
  for (const caso of CASOS) {
    const a = ORACULO.safeParse(caso);
    if (!a.success) continue;
    const b = bloqueHomeSchema.safeParse(caso);
    assert.ok(b.success);
    assert.deepEqual(b.data, a.data, `salida distinta para ${JSON.stringify(caso)}`);
  }
});

test('las claves de más se podan, igual que antes — no es un cambio, es lo que ya pasaba', () => {
  const conSobrante = { id: 'b4', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '', href: '', sobra: 'x' } };
  const salida = bloqueHomeSchema.parse(conSobrante) as { config: Record<string, unknown> };
  assert.equal('sobra' in salida.config, false);
  assert.deepEqual(ORACULO.parse(conSobrante), salida);
});

test('zodDeCampos({todoOpcional}) es lo que necesita `estilo`: todo puede faltar', () => {
  // "Ausente" en `estilo` significa "hereda del tema", nunca "el valor por
  // defecto" — si el zod exigiera las claves, un bloque que hoy hereda no
  // pasaría la validación y dejaría de poder guardarse.
  const estilo = zodDeCampos(CAMPOS_ESTILO, { todoOpcional: true });
  assert.equal(estilo.safeParse({}).success, true);
  assert.equal(estilo.safeParse({ fondo: null }).success, true);
  assert.equal(estilo.safeParse({ fondo: '#aabbcc' }).success, true);
  assert.equal(estilo.safeParse({ esquinas: 'inventada' }).success, false);
  // Y sin la opción, las mismas claves pasan a ser obligatorias.
  assert.equal(zodDeCampos(CAMPOS_ESTILO).safeParse({}).success, false);
});

// ── Anidamiento: el zod tiene que podar el segundo nivel ───────────────────

test('un padre que admite hijos los valida con el schema de SU kind', () => {
  const conHijos = zodDeBloques(
    [
      { id: 'sec', origen: 'catalogo', campos: CAMPOS_ESTILO_VACIO, hijos: { admite: ['texto'] } },
      { id: 'texto', origen: 'catalogo', campos: CAMPOS_TEXTO_MINI },
    ],
    ['estaSemana'],
    [],
  );
  const ok = conHijos.safeParse({
    id: 'p', kind: 'sec', config: {},
    hijos: [{ id: 'h', kind: 'texto', config: { texto: 'hola' } }],
  });
  assert.equal(ok.success, true);

  // Un hijo de un kind que el padre NO admite se rechaza.
  const malKind = conHijos.safeParse({
    id: 'p', kind: 'sec', config: {},
    hijos: [{ id: 'h', kind: 'sec', config: {} }],
  });
  assert.equal(malKind.success, false);
});

test('el zod poda un TERCER nivel — el hijo no lleva `hijos`', () => {
  // Si el jsonb viene con más profundidad (a mano, o de una versión futura),
  // no se conserva: el nivel único se garantiza también al guardar, no solo
  // en el tipo de TypeScript.
  const conHijos = zodDeBloques(
    [
      { id: 'sec', origen: 'catalogo', campos: CAMPOS_ESTILO_VACIO, hijos: { admite: ['texto'] } },
      { id: 'texto', origen: 'catalogo', campos: CAMPOS_TEXTO_MINI },
    ],
    ['estaSemana'],
    [],
  );
  const salida = conHijos.parse({
    id: 'p', kind: 'sec', config: {},
    hijos: [{ id: 'h', kind: 'texto', config: { texto: 'x' }, hijos: [{ id: 'n', kind: 'texto', config: { texto: 'y' } }] }],
  }) as { hijos: Record<string, unknown>[] };
  assert.equal('hijos' in salida.hijos[0], false);
});

const CAMPOS_ESTILO_VACIO = [] as const;
const CAMPOS_TEXTO_MINI = [
  { tipo: 'texto', id: 'texto', etiqueta: 'Texto', porDefecto: '' },
] as const;

test('zod de numeroHeredado: acepta null (hereda) y un número, rechaza la cadena', () => {
  const z = zodDeCampos([
    { tipo: 'numeroHeredado', id: 'radioCard', etiqueta: 'Esquina', porDefecto: null },
  ]);
  assert.equal(z.safeParse({ radioCard: null }).success, true);
  assert.equal(z.safeParse({ radioCard: 24 }).success, true);
  // Sin esto, un "24" venido de un input se guardaría como texto y la var CSS
  // saldría con comillas.
  assert.equal(z.safeParse({ radioCard: '24' }).success, false);
});
