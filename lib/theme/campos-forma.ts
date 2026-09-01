// Los ejes de FORMA del tema, declarados como schema.
//
// Hasta ahora estos campos no tenían NINGÚN control: solo se fijaban
// instalando un tema de la biblioteca. Una propietaria podía elegir "Bloom" y
// quedarse con su barra flotante, pero no podía poner la barra flotante sobre
// su propia paleta. Con el motor de campos, exponerlos es declarar un array —
// cero JSX nuevo, el Inspector genérico los pinta.
//
// ⚠️ **`tabBarStyle` NO está aquí, a propósito.** El plan lo listaba entre los
// ejes sin control, pero `portal-nav.tsx` dejó de leerlo en el rediseño de
// 2026-08 (un único look de barra para todos los estudios): un control de
// "estilo de la barra" atado a él no movería la barra. Su único efecto vivo
// hoy es una compuerta heredada de la pantalla de bienvenida en
// `app/portal/[slug]/login/page.tsx`, y ESO ya se controla de verdad con
// `variantes.bienvenida`, que sí está expuesto abajo.
//
// ⚠️ **`radioTema` sí está, pero con `numeroHeredado`, no con `numero`.** La
// misma var (`--portal-radius-card`) cae a TRES números distintos según la
// superficie que la lee: 20 en `portal-tokens.ts`, 24 en `portal-design.ts` y
// 26 escrito a mano en la vista de bonos. No existe "el valor por defecto",
// así que un campo `numero` tendría que elegir uno y pintarlo — y guardarlo
// fijaría un valor donde antes había herencia, el mismo error que `estilo`
// obliga a evitar en los bloques. Con `numeroHeredado` la casilla puede estar
// vacía de verdad y eso significa "hereda".

import { VARIANTES_PORTAL, resolveVariantes, type EjeVariante } from '../theme-variantes.ts';
import type { CampoSchema } from './campos.ts';

/** Etiquetas de negocio de cada valor. Las claves son los ids del catálogo. */
const ETIQUETA_VARIANTE: Record<string, string> = {
  // barra
  soloActiva: 'Solo la activa', todas: 'Todas', todasRelleno: 'Todas, icono relleno',
  // retos
  neutro: 'Neutra', color: 'Con color propio',
  // tarjetaPrincipal
  hero: 'Bloque grande', rotulada: 'Con rótulo encima',
  // bienvenida
  ninguna: 'Ninguna', foto: 'Sobre la foto', marca: 'Sobre el color de marca',
};

interface EjeExpuesto {
  eje: EjeVariante;
  etiqueta: string;
  ayuda: string;
}

/**
 * Los ejes que van al panel "Forma del portal". El orden es el que ve la
 * propietaria: de lo que más se nota (la cabecera al abrir) a lo que menos.
 *
 * `barra` NO está aquí: se va con los flags de la barra al panel de
 * navegación, que ya tiene un preview vivo del propio componente — así el
 * control y su efecto se ven a la vez, en vez de en dos pantallas distintas.
 */
const EJES_FORMA: readonly EjeExpuesto[] = [
  // `cabeceraInicio`/`accesosRapidos` quedaron FUERA a propósito (31-ago): el
  // Inicio tiene un hero único fotográfico para todo estudio, y el bloque
  // "Accesos rápidos" ni siquiera existe en el diseño real de referencia — los
  // dos ejes siguen vivos en VARIANTES_PORTAL (compatibilidad de temas ya
  // guardados), pero ya no se pintan en el Inspector: exponer un control que
  // no mueve nada sería peor que no tenerlo.
  { eje: 'tarjetaPrincipal', etiqueta: 'Tarjeta principal', ayuda: 'La pieza grande del Inicio, con su próxima clase.' },
  { eje: 'retos', etiqueta: 'Retos', ayuda: 'Si cada reto lleva su propio color de fondo.' },
  { eje: 'bienvenida', etiqueta: 'Bienvenida antes de entrar', ayuda: 'Pantalla previa al acceso de la socia.' },
];

const EJES_BARRA: readonly EjeExpuesto[] = [
  { eje: 'barra', etiqueta: 'Texto bajo los iconos', ayuda: 'Si se ve en todas las pestañas o solo en la activa.' },
];

const EJES_EXPUESTOS: readonly EjeExpuesto[] = [...EJES_FORMA, ...EJES_BARRA];

/**
 * ⚠️ El PRIMER valor de cada eje es el aspecto de HOY (garantía de
 * `VARIANTES_PORTAL`, con test propio). Por eso `porDefecto` sale de ahí y no
 * de una constante escrita a mano que podría separarse del catálogo.
 */
function camposDeEjes(ejes: readonly EjeExpuesto[]): readonly CampoSchema[] {
  return ejes.map(({ eje, etiqueta, ayuda }) => {
  const valores = VARIANTES_PORTAL[eje] as readonly string[];
  const opciones = valores.map((id) => ({ id, label: ETIQUETA_VARIANTE[id] ?? id }));
  return {
    // A partir de 4 valores el `<select>` nativo se lee mejor que una fila de
    // botones que no cabe en la columna del Inspector — mismo criterio que
    // documenta el propio motor de campos.
    tipo: valores.length >= 4 ? 'select' : 'opciones',
    id: eje,
    etiqueta,
    ayuda,
    opciones,
    porDefecto: valores[0],
  } as CampoSchema;
  });
}

/** Forma de las piezas del Inicio. Categoría propia. */
export const CAMPOS_FORMA_PORTAL: readonly CampoSchema[] = camposDeEjes(EJES_FORMA);

/** Todo lo de la barra inferior, junto a su preview en "Navegación del portal". */
export const CAMPOS_BARRA_PORTAL: readonly CampoSchema[] = [
  ...camposDeEjes(EJES_BARRA),
  {
    tipo: 'booleano', id: 'barraClasica', porDefecto: false,
    etiqueta: 'Barra pegada abajo',
    ayuda: 'En vez de flotar sobre el contenido, se apoya en el borde inferior.',
  },
  {
    tipo: 'booleano', id: 'barraFlotante', porDefecto: false,
    etiqueta: 'Barra despegada de los lados',
    ayuda: 'Deja aire a izquierda y derecha, como una píldora.',
  },
  {
    tipo: 'booleano', id: 'barraOscura', porDefecto: false,
    etiqueta: 'Barra oscura',
    ayuda: 'Fondo oscuro con iconos claros, aunque el portal sea claro.',
  },
];

/**
 * El acento va con los COLORES, no con la forma: es un color, y la
 * propietaria lo busca donde están los demás.
 */
export const CAMPOS_ACENTO: readonly CampoSchema[] = [
  {
    tipo: 'colorHeredado', id: 'destacado', porDefecto: null,
    etiqueta: 'Acento',
    ayuda: 'Icono activo de la barra, borde de clase reservada y punto de aviso. Sin fijar, usa el color de marca.',
  },
];

/**
 * Esquinas por pieza. Vacío = hereda, que NO es lo mismo que 0 — ver el aviso
 * de arriba sobre los tres fallbacks de `--portal-radius-card`.
 *
 * `max: 40` no es arbitrario: por encima de eso una tarjeta de portal deja de
 * leerse como tarjeta. El tope evita el "999" que convierte todo en píldoras
 * sin querer.
 */
export const CAMPOS_RADIO: readonly CampoSchema[] = ([
  ['card', 'Tarjetas'],
  ['boton', 'Botones'],
  ['chip', 'Etiquetas'],
  ['acceso', 'Baldosas de accesos rápidos'],
] as const).map(([id, etiqueta]) => ({
  tipo: 'numeroHeredado' as const,
  id: `radio_${id}`,
  etiqueta,
  porDefecto: null,
  min: 0,
  max: 40,
  paso: 2,
  marcadorHeredado: 'Del tema',
}));

/**
 * Tamaño de texto por pieza. Era el ÚLTIMO eje del tema sin ningún control:
 * los tres temas de la biblioteca lo fijan (Bloom titula sus secciones a 20 y
 * Noir a 17) y el portal lo aplica, pero una propietaria no podía tocarlo sin
 * instalar un tema entero encima de su paleta.
 *
 * Mismo mecanismo que `CAMPOS_RADIO`, y por el mismo motivo: vacío = hereda,
 * que NO es lo mismo que un número. Los valores de siempre viven repartidos en
 * `portal-design.ts`, y fijarlos aquí al guardar mataría esa herencia — el
 * error que documenta [["Ausente" no es "valor por defecto"]].
 *
 * ⚠️ Los topes no son adorno. Por debajo de 12 px un rótulo deja de leerse en
 * un móvil, y por encima de 72 el número de sesiones de un bono se sale de su
 * tarjeta. El máximo real más alto que usa un tema es 60 (`numeroBono` de
 * Bloom), así que 72 deja margen sin permitir el "200" que rompe la pantalla.
 */
export const CAMPOS_ESCALA_TEXTO: readonly CampoSchema[] = ([
  ['seccion', 'Rótulos de sección', '«Próxima clase», «Esta semana».'],
  ['tituloPantalla', 'Títulos de pantalla', 'El encabezado de Clases o Bonos.'],
  ['saludo', 'Saludo del Inicio', 'El «Hola, {nombre}» de la cabecera.'],
  ['tituloHero', 'Titular de la tarjeta principal', 'El nombre de la clase, en grande.'],
  ['bienvenida', 'Titular de la bienvenida', 'La pantalla previa al acceso, si la tienes activada.'],
  ['numeroBono', 'Número de sesiones', 'La cifra grande de tu bono.'],
] as const).map(([id, etiqueta, ayuda]) => ({
  tipo: 'numeroHeredado' as const,
  id: `texto_${id}`,
  etiqueta,
  ayuda,
  porDefecto: null,
  min: 12,
  max: 72,
  paso: 1,
  marcadorHeredado: 'Del tema',
}));

/** Los grupos juntos — para los tests y para cualquier validación global. */
export const CAMPOS_FORMA: readonly CampoSchema[] = [
  ...CAMPOS_FORMA_PORTAL, ...CAMPOS_BARRA_PORTAL, ...CAMPOS_ACENTO, ...CAMPOS_RADIO,
  ...CAMPOS_ESCALA_TEXTO,
];

/** `radio_card` → `card`. Los ids llevan prefijo para no chocar en el plano. */
const PIEZAS_RADIO = ['card', 'boton', 'chip', 'acceso'] as const;
type PiezaRadio = (typeof PIEZAS_RADIO)[number];
const ID_RADIO = new Map<string, PiezaRadio>(PIEZAS_RADIO.map((p) => [`radio_${p}`, p]));

/** `texto_seccion` → `seccion`. Mismo prefijo-para-no-chocar que el radio. */
const PIEZAS_TEXTO = ['seccion', 'tituloPantalla', 'saludo', 'tituloHero', 'bienvenida', 'numeroBono'] as const;
type PiezaTexto = (typeof PIEZAS_TEXTO)[number];
const ID_TEXTO = new Map<string, PiezaTexto>(PIEZAS_TEXTO.map((p) => [`texto_${p}`, p]));

/** Los ids que van dentro de `variantes` y no son claves sueltas del tema. */
const IDS_VARIANTE = new Set<string>(EJES_EXPUESTOS.map((e) => e.eje));

/** Lo que el tema tiene hoy, en la forma plana que espera el Inspector. */
export function valoresFormaDesdeTema(tema: {
  variantes?: unknown; barraClasica?: boolean; barraFlotante?: boolean;
  barraOscura?: boolean; destacado?: string | null;
  radioTema?: Partial<Record<PiezaRadio, number>>;
  escalaTexto?: Partial<Record<PiezaTexto, number>>;
}): Record<string, unknown> {
  // `resolveVariantes` ya devuelve el objeto COMPLETO con el aspecto de hoy en
  // los ejes ausentes — no hace falta (ni se debe) pasar esto por
  // `resolverConfig`, que es para la `config` de un bloque.
  const v = resolveVariantes(tema.variantes) as Record<string, unknown>;
  return {
    ...Object.fromEntries(EJES_EXPUESTOS.map(({ eje }) => [eje, v[eje]])),
    barraClasica: tema.barraClasica ?? false,
    barraFlotante: tema.barraFlotante ?? false,
    barraOscura: tema.barraOscura ?? false,
    destacado: tema.destacado ?? null,
    // `?? null` y NUNCA un número: ausente significa hereda. Poner aquí el
    // fallback de alguna superficie fijaría ESE valor en cuanto se guardara.
    ...Object.fromEntries(PIEZAS_RADIO.map((p) => [`radio_${p}`, tema.radioTema?.[p] ?? null])),
    ...Object.fromEntries(PIEZAS_TEXTO.map((p) => [`texto_${p}`, tema.escalaTexto?.[p] ?? null])),
  };
}

/**
 * Traduce un campo tocado en el Inspector al `setCampo(clave, valor)` que
 * espera el editor de temas. Devuelve `null` para un id desconocido en vez de
 * inventar una escritura.
 *
 * Los ejes de `variantes` no se pueden escribir sueltos: hay que reenviar el
 * objeto entero, así que se parte del resuelto y se cambia una clave.
 */
export function escrituraDeCampoForma(
  tema: {
    variantes?: unknown;
    radioTema?: Partial<Record<PiezaRadio, number>>;
    escalaTexto?: Partial<Record<PiezaTexto, number>>;
  },
  campoId: string,
  valor: unknown,
): { clave: string; valor: unknown } | null {
  const letra = ID_TEXTO.get(campoId);
  if (letra) {
    // Idéntico a `radioTema` abajo, y por los mismos dos motivos: el zod es
    // `.strict()` (una clave con `undefined` dentro tumba el objeto entero) y
    // vaciar una pieza tiene que BORRARLA, que es como se escribe "hereda".
    const siguiente = { ...(tema.escalaTexto ?? {}) };
    if (typeof valor === 'number') siguiente[letra] = valor;
    else delete siguiente[letra];
    return { clave: 'escalaTexto', valor: Object.keys(siguiente).length > 0 ? siguiente : undefined };
  }
  const pieza = ID_RADIO.get(campoId);
  if (pieza) {
    // `radioTema` es `.strict()` en el zod: una clave con `undefined` dentro
    // tumbaría el objeto entero. Vaciar una pieza la BORRA del objeto, que es
    // exactamente lo que el esquema entiende por "hereda".
    const siguiente = { ...(tema.radioTema ?? {}) };
    if (typeof valor === 'number') siguiente[pieza] = valor;
    else delete siguiente[pieza];
    // Sin ninguna pieza fijada, el campo entero se va: `radioTema: {}` y
    // `radioTema: undefined` pintan igual, pero el segundo no deja basura.
    return { clave: 'radioTema', valor: Object.keys(siguiente).length > 0 ? siguiente : undefined };
  }
  if (IDS_VARIANTE.has(campoId)) {
    return { clave: 'variantes', valor: { ...resolveVariantes(tema.variantes), [campoId]: valor } };
  }
  if (campoId === 'barraClasica' || campoId === 'barraFlotante' || campoId === 'barraOscura') {
    return { clave: campoId, valor: Boolean(valor) };
  }
  if (campoId === 'destacado') {
    // `''` desde un input de color vacío significa "sin fijar", igual que null
    // — nunca se guarda la cadena vacía, que zod rechazaría por no ser hex.
    return { clave: 'destacado', valor: valor === '' || valor === undefined ? null : valor };
  }
  return null;
}
