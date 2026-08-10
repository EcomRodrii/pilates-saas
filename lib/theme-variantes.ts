// Variantes de FORMA por tema — el mecanismo que faltaba.
//
// Hasta ahora un tema podía cambiar color, radio, sombra y estilo de barra
// (CSS vars con fallback, ver theme-runtime.ts), pero no podía decir "este
// bloque se pinta con otra forma". Por eso Oliva/Bloom/Noir se veían "todos
// iguales pero de otro color": el prototipo real los separa sobre todo por la
// FORMA de cada bloque (accesos rápidos en rejilla vs círculos, etiquetas en
// toda la barra o solo en la activa, retos con fondo propio...), y nada de eso
// es un valor CSS — son elementos que existen o no existen en el DOM.
//
// Por qué un catálogo y no un booleano suelto por diferencia (que es lo que
// hizo `barraClasica`, el precedente):
//  · Un booleano no expresa una elección de 3 valores. "filas | rejilla |
//    círculos" con dos flags permite que los dos estén a true, y obliga a una
//    precedencia que no está escrita en ningún sitio.
//  · Cada diferencia nueva costaría otra pasada por los mismos cinco ficheros
//    (schema, supabase-data-admin, studio-context...). Con un solo objeto, la
//    fontanería se paga UNA vez y la diferencia número 12 es una clave más.
//  · Un matiz nuevo es un valor de enum, no un campo: el icono relleno de
//    Oliva es un tercer valor de `barra`, no un `iconoActivoRelleno` que
//    podría contradecir al resto. Estados imposibles, imposibles.
//
// Módulo PURO a propósito (sin React ni zod), como lib/portal-nav.ts y
// lib/portal-home-bloques.ts: lo importan tanto el esquema (para construir el
// zod) como los componentes (para leer la variante).

/**
 * Catálogo de ejes de variación. **El PRIMER valor de cada lista es siempre el
 * aspecto de HOY** — esa es la garantía de que un tema sin `variantes` (o un
 * estudio sin tema) no cambia absolutamente nada. Hay un test que lo fija.
 */
export const VARIANTES_PORTAL = {
  /**
   * Cabecera del Inicio:
   *  · `clasica` — la de siempre: "Hola, {nombre}." a 50px, sin avatar, y la
   *    campana como CONTADOR numérico.
   *  · `saludo` — la de Oliva en el prototipo: avatar + "Hola, {nombre}" a un
   *    tamaño medio y la pregunta debajo, con la campana como ICONO con punto.
   *  · `nombre` — la de Noir: avatar + saludo por hora pequeño arriba y el
   *    nombre como encabezado debajo.
   *  · `titular` — la de Bloom: igual que `nombre` y ADEMÁS un titular grande
   *    aparte, debajo de la fila del saludo. En el prototipo solo Bloom lo
   *    lleva; Noir se queda en el nombre.
   * Las tres del prototipo llevan avatar y campana de icono con punto; lo que
   * cambia entre ellas es la jerarquía del texto.
   */
  cabeceraInicio: ['clasica', 'saludo', 'nombre', 'titular'],
  /** Accesos rápidos: filas de lista (hoy), rejilla de baldosas, o círculos. */
  accesosRapidos: ['filas', 'rejilla', 'circulos'],
  /** Barra inferior: etiqueta solo en la activa (hoy), en todas, o en todas
   *  con el icono activo relleno. */
  barra: ['soloActiva', 'todas', 'todasRelleno'],
  /** Retos: tarjeta neutra (hoy) o con fondo de color propio por reto. */
  retos: ['neutro', 'color'],
  /**
   * La tarjeta principal del Inicio:
   *  · `hero` — la de siempre: bloque grande, con la foto del estudio si la
   *    hay, en TODOS los casos incluido "no tienes clases reservadas".
   *  · `rotulada` — la del prototipo: un rótulo de sección encima ("Tu
   *    semana" sin clase, "Próxima clase" con ella) y, en el estado VACÍO,
   *    una tarjeta sencilla en vez del bloque grande. Con clase reservada
   *    sigue siendo el hero, que es lo que el prototipo también hace.
   */
  tarjetaPrincipal: ['hero', 'rotulada'],
  /** Bienvenida antes del login: ninguna (hoy), sobre la foto del estudio, o
   *  sobre el color de marca. */
  bienvenida: ['ninguna', 'foto', 'marca'],
} as const;

export type EjeVariante = keyof typeof VARIANTES_PORTAL;
export type ValorVariante<E extends EjeVariante> = (typeof VARIANTES_PORTAL)[E][number];

/** Lo que un tema declara: parcial, todo opcional. */
export type VariantesPortal = { [E in EjeVariante]?: ValorVariante<E> };

/** Lo que consume un componente: siempre completo, nunca undefined. */
export type VariantesResueltas = { [E in EjeVariante]: ValorVariante<E> };

const EJES = Object.keys(VARIANTES_PORTAL) as EjeVariante[];

/** El aspecto de hoy: el primer valor de cada eje. */
export const DEFAULT_VARIANTES: VariantesResueltas = Object.fromEntries(
  EJES.map((eje) => [eje, VARIANTES_PORTAL[eje][0]]),
) as VariantesResueltas;

/**
 * Resuelve CLAVE A CLAVE (mismo espíritu que `pick` en resolveTheme): un valor
 * inválido en `retos` no arrastra a `accesosRapidos`. Nunca lanza y siempre
 * devuelve el objeto completo, para que ningún componente tenga que escribir
 * `variantes?.retos ?? 'neutro'` por su cuenta.
 */
export function resolveVariantes(raw: unknown): VariantesResueltas {
  // `Record<string, string>` para escribir: con la clave todavía siendo la
  // unión de ejes, TS estrecha el destino de la asignación a `never` (cada eje
  // admite valores distintos y no puede probar cuál es). La firma pública
  // sigue devolviendo el tipo bueno.
  const out: Record<string, string> = { ...DEFAULT_VARIANTES };
  if (!raw || typeof raw !== 'object') return out as VariantesResueltas;
  const obj = raw as Record<string, unknown>;
  for (const eje of EJES) {
    const valor = obj[eje];
    // `as readonly string[]`: sin esto TS estrecha `includes` al literal del
    // eje concreto y rechaza un string cualquiera, que es justo lo que hay
    // que poder comprobar aquí.
    if (typeof valor === 'string' && (VARIANTES_PORTAL[eje] as readonly string[]).includes(valor)) {
      out[eje] = valor;
    }
  }
  return out as VariantesResueltas;
}
