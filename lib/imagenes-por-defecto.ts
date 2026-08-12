// Las fotos que ve una socia cuando su estudio todavía no ha subido ninguna.
//
// El problema que resuelve: una propietaria que acaba de crear su estudio tiene
// varios sitios donde subir una foto antes de que el portal deje de verse
// vacío, y hasta que los rellena su primera alumna entra a bloques de color
// liso. Lo dice el propio código de la tarjeta grande del Inicio: «SIN foto —el
// caso de casi todos los estudios el primer día— esos 476 px eran un vacío de
// color crema». La foto por defecto no sustituye a la suya: le compra el tiempo
// de subirla cuando pueda.
//
// ⚠️ **Esto NO escribe nada en la base de datos.** `imagen_bienvenida_url` y
// `tipos_clase.foto_url` siguen naciendo `NULL`, y los editores siguen
// diciendo «Subir imagen»: lo único que cambia es lo que se pinta cuando no hay
// nada. Guardar la URL al dar de alta el estudio dejaría la foto congelada en
// mil estudios el día que cambiemos el archivo, y le enseñaría a la propietaria
// una imagen que no es suya como si la hubiera elegido ella.
//
// ⚠️ **Dónde NO se pone foto por defecto, a propósito** — «por defecto» no es
// «en todas partes»:
//   · Caras (propietaria, instructoras, socias). Una modelo de catálogo
//     haciéndose pasar por la instructora que da la clase es peor que las
//     iniciales que ya se pintan hoy.
//   · Retos del portal. Decisión del fundador ya documentada en
//     `portal-home-bloques.ts`: la tarjeta lleva un conteo REAL de
//     participantes y mezclarlo con gente de archivo lo convierte en decorado.
//   · Bloques y banners que la propietaria añade a propósito (galería,
//     `contenido_portal_banners`). Son huecos que ella decide abrir.
//   · Miniaturas de los listados de clases. La misma foto ocho veces en una
//     pantalla se lee como un error; el color del tipo de clase distingue
//     mejor. La foto de clase se pinta grande (detalle, sesión guiada) y ahí
//     sí lleva default.

/** Los huecos de imagen de un estudio. Uno por forma, no por pantalla. */
export type HuecoImagen = 'portada' | 'vertical' | 'banda' | 'banner';

/**
 * La única fuente de verdad. Cambiar una foto es sustituir el archivo de
 * `public/por-defecto/`; ningún componente sabe qué archivo es.
 *
 * Cada hueco es una LISTA aunque hoy tenga un elemento: así añadir una segunda
 * variante mañana es una línea aquí, y `elegirVariante` ya la reparte de forma
 * determinista por estudio. Nunca al azar — una propietaria tiene que ver
 * siempre la misma foto mientras no suba la suya.
 */
export const IMAGENES_POR_DEFECTO: Record<HuecoImagen, readonly string[]> = {
  // 1600×1000 (16:10) · portada de acceso, hero del widget, imagen al compartir
  portada: ['/por-defecto/estudio-hero.webp'],
  // 1200×1600 (3:4) · bienvenida a pantalla completa, tarjeta grande del Inicio
  vertical: ['/por-defecto/estudio-vertical.webp'],
  // 1600×592 (27:10) · cabecera de las pantallas Clases y Bonos
  banda: ['/por-defecto/estudio-banda.webp'],
  // 1600×770 (2.08:1) · banner «Invita a una amiga»
  banner: ['/por-defecto/estudio-banner.webp'],
};

/** Fotos de clase: la genérica y las cinco por familia de disciplina. */
export const IMAGENES_CLASE = {
  generica: '/por-defecto/clase.webp',
  reformer: '/por-defecto/clase-reformer.webp',
  mat: '/por-defecto/clase-mat.webp',
  maquina: '/por-defecto/clase-maquina.webp',
  yoga: '/por-defecto/clase-yoga.webp',
  hiit: '/por-defecto/clase-hiit.webp',
} as const;

export type FamiliaClase = keyof typeof IMAGENES_CLASE;

/**
 * Palabras del nombre del tipo de clase que delatan la familia.
 *
 * Van en dos listas por un motivo concreto: `mat` como prefijo se comería
 * «Clase matinal» y «Material», así que las palabras cortas y ambiguas exigen
 * coincidencia EXACTA y solo las largas admiten prefijo (que es lo que hace
 * que «reformers» y «cadillacs» sigan funcionando en plural).
 *
 * El orden manda: la primera que coincide gana. `reformer` va antes que `mat`
 * para que «Reformer & Mat» caiga en reformer, que es la máquina que sale en
 * la foto.
 */
const PISTAS: readonly (readonly [modo: 'exacta' | 'prefijo', pista: string, familia: FamiliaClase])[] = [
  ['prefijo', 'reformer', 'reformer'],
  ['prefijo', 'cadillac', 'maquina'],
  ['prefijo', 'barril', 'maquina'],
  ['prefijo', 'barrel', 'maquina'],
  ['prefijo', 'wunda', 'maquina'],
  ['prefijo', 'maquina', 'maquina'],
  ['exacta', 'torre', 'maquina'],
  ['exacta', 'tower', 'maquina'],
  ['exacta', 'chair', 'maquina'],
  ['exacta', 'silla', 'maquina'],
  ['exacta', 'mat', 'mat'],
  ['prefijo', 'suelo', 'mat'],
  ['prefijo', 'colchoneta', 'mat'],
  ['prefijo', 'yoga', 'yoga'],
  ['prefijo', 'vinyasa', 'yoga'],
  ['prefijo', 'hatha', 'yoga'],
  ['prefijo', 'ashtanga', 'yoga'],
  ['prefijo', 'meditacion', 'yoga'],
  ['prefijo', 'mindfulness', 'yoga'],
  ['prefijo', 'movilidad', 'yoga'],
  ['prefijo', 'estiramiento', 'yoga'],
  ['exacta', 'yin', 'yoga'],
  ['prefijo', 'hiit', 'hiit'],
  ['prefijo', 'funcional', 'hiit'],
  ['prefijo', 'tabata', 'hiit'],
  ['prefijo', 'circuito', 'hiit'],
  ['prefijo', 'bootcamp', 'hiit'],
  ['prefijo', 'fuerza', 'hiit'],
  ['prefijo', 'cardio', 'hiit'],
  ['exacta', 'trx', 'hiit'],
  ['exacta', 'cross', 'hiit'],
];

/** minúsculas, sin tildes, partido en palabras. */
function palabrasDe(texto: string): string[] {
  return texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Adivina la familia por el nombre del tipo de clase.
 *
 * Es una heurística y se comporta como tal: ante la duda, la genérica. Fallar
 * aquí cuesta una foto poco afinada bajo un velo de color al 93 % de opacidad
 * — nunca un dato equivocado en pantalla.
 */
export function familiaDeClase(nombre: string | null | undefined): FamiliaClase {
  const palabras = palabrasDe(nombre ?? '');
  for (const [modo, pista, familia] of PISTAS) {
    const coincide = modo === 'exacta'
      ? palabras.includes(pista)
      : palabras.some((p) => p.startsWith(pista));
    if (coincide) return familia;
  }
  return 'generica';
}

type Candidata = string | null | undefined;

/** `true` para `null`, `undefined`, `''` y para una cadena de solo espacios. */
function vacia(url: Candidata): boolean {
  return !(url ?? '').trim();
}

/**
 * Reparte las variantes de un hueco de forma estable por estudio.
 *
 * Sin semilla —o con lista de una— devuelve siempre la primera. Con varias, el
 * mismo estudio cae SIEMPRE en la misma: nada de `Math.random()`, que además
 * daría una foto distinta en el servidor y en el cliente.
 */
export function elegirVariante(lista: readonly string[], semilla?: string | null): string {
  if (lista.length === 1 || !semilla) return lista[0];
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) >>> 0;
  return lista[h % lista.length];
}

/**
 * La imagen de un hueco del estudio: la primera propia que no esté vacía, o la
 * de por defecto.
 *
 * Acepta varias candidatas porque cada pantalla tiene su orden de herencia
 * propio —el widget de reservas prefiere `fotoUrl` y cae a
 * `imagenBienvenidaUrl`; el portal solo mira la segunda— y ese orden es de
 * quien llama, no de aquí.
 */
export function imagenDeEstudio(
  hueco: HuecoImagen,
  propias: Candidata | readonly Candidata[],
  semilla?: string | null,
): string {
  const lista = Array.isArray(propias) ? propias : [propias as Candidata];
  const propia = lista.find((c) => !vacia(c));
  return propia ? propia.trim() : elegirVariante(IMAGENES_POR_DEFECTO[hueco], semilla);
}

/**
 * La imagen de una clase: la que subió la propietaria para ESE tipo de clase, o
 * la de su familia adivinada por el nombre.
 *
 * La foto es del TIPO de clase, no de la sesión: `sesiones` no tiene columna de
 * imagen y no debe tenerla — el lunes a las 18:00 y el martes a las 09:00 de
 * «Reformer» son la misma clase, y pedir la foto dos veces sería trabajo
 * inventado.
 */
export function imagenDeClase(
  tipo: { fotoUrl?: Candidata; nombre?: string | null } | null | undefined,
): string {
  if (!vacia(tipo?.fotoUrl)) return (tipo!.fotoUrl as string).trim();
  return IMAGENES_CLASE[familiaDeClase(tipo?.nombre)];
}

/**
 * Qué hacer cuando una imagen no carga.
 *
 * Una foto subida puede desaparecer de Storage (borrada a mano, bucket
 * migrado) y hoy eso deja un icono de imagen rota en el portal de las socias.
 * Con esto cae a la de por defecto, que es exactamente lo que se vería si
 * nunca hubiera subido ninguna.
 *
 * ⚠️ Se marca el elemento antes de reintentar: si el archivo por defecto
 * tampoco cargara —bucket caído, red muerta— sin la marca el `onError` se
 * dispararía otra vez sobre sí mismo en bucle infinito.
 */
export function alFallarImagen(respaldo: string) {
  return (evento: { currentTarget: HTMLImageElement }) => {
    const img = evento.currentTarget;
    if (img.dataset.respaldoPuesto === '1') return;
    img.dataset.respaldoPuesto = '1';
    img.src = respaldo;
  };
}
