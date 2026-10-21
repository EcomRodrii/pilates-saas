// ─────────────────────────────────────────────────────────────────────────────
// La app de la alumna «de muestra»: la app REAL (`/portal/<slug>`) de un estudio
// que todavía no existe, para enseñarla en el paso 1 del alta nueva («Así empieza
// la app de tus alumnas», app/crear-estudio/alta-nueva.tsx) mientras se escribe
// el nombre.
//
// Por qué así y no otro estudio pintado encima: el único estudio de demostración
// que hay (`es_demo`) es un estudio de verdad, con sus clases, sus fotos y sus
// alumnas; ponerle otro nombre enseñaría a una desconocida lo que no es suyo y
// le prometería un estudio lleno el primer día. Esto es lo que su estudio tendrá
// en cuanto se cree, sacado de los MISMOS valores con que nace uno
// (`cargarEstudio`, lib/student/estudio.ts): su nombre, sin logo (el monograma
// con sus iniciales), sin ciudad (la pone el paso 3), la foto de portada de serie
// que le toca por su dirección (`imagenDeEstudio` con su slug de semilla), el
// color de fábrica (`DEFAULT_THEME.primary`) y la apariencia de serie.
//
// ⚠️ El color de fábrica lo pasa quien llama (el layout, en servidor) y no se
// importa aquí: `theme-schema` arrastra zod, y este módulo lo carga también el
// navegador (`ProveedorMuestra`), en el JavaScript de toda la app de la alumna.
//
// La pantalla que se enseña es la de entrada (`/acceso/login`): es lo primero que
// ve una alumna al abrir el enlace, y no depende de clases ni de reservas.
//
// ⚠️ El slug de muestra lleva un guion bajo: `normalizarSlug` (lib/slug.ts), por
// el que pasan el alta y Configuración, solo deja letras, números y guiones, así
// que el producto nunca da esa dirección a un estudio, y el layout no la busca en
// la base de datos (no hay fila, ni nada que escribir). La base de datos NO lo
// impide por sí sola (sin CHECK de formato en `studios.slug`): un estudio creado a
// mano con esa dirección se quedaría sin su app, y lo que la app pida con ese slug
// fuera de la pantalla de entrada (que no pide nada) le llegaría a él. Lo que se
// enseña aquí no cambia: la pantalla de entrada no lee nada del servidor, y el
// marco de muestra corta además toda escritura (`SCRIPT_SOLO_MIRAR`,
// lib/student/solo-mirar.ts).
//
// ⚠️ El color de fábrica lo pasa quien llama (el layout, en servidor) y no se
// importa aquí: `theme-schema` arrastra zod, y este módulo lo carga también el
// navegador (`ProveedorMuestra`), en el JavaScript de toda la app de la alumna.
//
// La pantalla que se enseña es la de entrada (`/acceso/login`): es lo primero que
// ve una alumna al abrir el enlace, y no depende de clases ni de reservas.
//
// ⚠️ El slug de muestra lleva un guion bajo: `normalizarSlug` (lib/slug.ts) solo
// deja letras, números y guiones, así que ningún estudio puede llamarse así y
// `cargarEstudio` nunca se consulta con él. No hay fila en la base de datos ni
// nada que leer o escribir: lo que pida al servidor un estudio que no existe
// contesta «no existe», y el marco de muestra corta además toda escritura
// (`SCRIPT_SOLO_MIRAR`, lib/student/solo-mirar.ts).
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { resolverApariencia } from './apariencia.ts';
import { imagenDeEstudio } from '../imagenes-por-defecto.ts';
import { slugify } from '../slug.ts';
import type { StudioConfig } from './tipos.ts';
import type { AparienciaApp } from './apariencia.ts';

/** La dirección de la app de muestra. Con guion bajo: ningún estudio puede tenerla. */
export const SLUG_MUESTRA = '_muestra';

/** El nombre mientras no ha escrito ninguno, el mismo que enseña el formulario. */
export const NOMBRE_MUESTRA = 'Tu estudio';

/** Lo más largo que se acepta por mensaje: el campo del alta tiene su propio tope. */
const MAX_NOMBRE_MUESTRA = 80;

export function esSlugDeMuestra(slug: string | null | undefined): boolean {
  return slug === SLUG_MUESTRA;
}

/** Lo que el portal necesita del estudio (la forma de `EstudioStudent`, sin importar el módulo de servidor). */
export interface EstudioDeMuestra extends StudioConfig {
  id: string;
  colorPrimario: string;
  apariencia: AparienciaApp;
  paginaOculta: boolean;
  appTienda: null;
}

/**
 * El estudio tal como nacerá con ese nombre (`nombre` vacío = «Tu estudio») y el
 * color con que nace el portal (`DEFAULT_THEME.primary`, ver la cabecera).
 * La foto de portada se elige con SU dirección prevista de semilla, como la
 * elegirá el portal cuando exista (si otro estudio ya tiene esa dirección y le
 * toca un «-2», puede salirle otra de las de serie).
 */
export function estudioDeMuestra(nombreEscrito: string | null | undefined, colorDeFabrica: string): EstudioDeMuestra {
  const nombre = limpiarNombreMuestra(nombreEscrito) || NOMBRE_MUESTRA;
  return {
    id: SLUG_MUESTRA,
    slug: SLUG_MUESTRA,
    nombre,
    ciudad: '',
    direccion: '',
    logoUrl: null,
    iconoMarcaUrl: null,
    fotoPortada: imagenDeEstudio('portada', null, slugify(nombre)),
    telefono: '',
    email: '',
    disciplinas: [],
    // Los de serie de la columna (`studios`): solo se leen al reservar, y aquí no se reserva.
    politicaCancelacionHoras: 12,
    soportaListaEspera: true,
    creditosNombre: null,
    lema: null,
    fraseHeroe: null,
    fraseManuscrita: null,
    subtituloHeroe: null,
    tituloAcceso: null,
    tema: {},
    colorPrimario: colorDeFabrica,
    apariencia: resolverApariencia(null),
    paginaOculta: false,
    appTienda: null,
  };
}

/** Texto plano, una línea y con tope: viene de otra ventana. */
export function limpiarNombreMuestra(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE_MUESTRA);
}

// ── El mensaje del alta a la app de muestra ─────────────────────────────────

/** El tipo del mensaje con el que el alta le pasa el nombre que va escribiendo. */
export const MENSAJE_MUESTRA = 'tentare:muestra-nombre';

/** Lo que avisa la app de muestra al montarse, para que el alta le mande el nombre de ese momento. */
export const MUESTRA_LISTA = 'tentare:muestra-lista';

export interface MensajeMuestra { tipo: typeof MENSAJE_MUESTRA; nombre: string }

export function mensajeMuestra(nombre: string): MensajeMuestra {
  return { tipo: MENSAJE_MUESTRA, nombre: limpiarNombreMuestra(nombre) };
}

/**
 * El nombre que trae un `message`, o `null` si no es nuestro. Solo vale el que
 * viene de la ventana que la enmarca y de NUESTRO origen: el nombre no se lee
 * de la URL a propósito, para que nadie pueda fabricar un enlace de tentare.app
 * con «Entra en <lo que sea>».
 */
export function nombreDeMensajeMuestra(
  e: { origin: string; data: unknown; source: unknown },
  propio: { origin: string; padre: unknown },
): string | null {
  if (e.origin !== propio.origin || e.source !== propio.padre || e.source == null) return null;
  const d = e.data as Partial<MensajeMuestra> | null;
  if (!d || typeof d !== 'object' || d.tipo !== MENSAJE_MUESTRA) return null;
  return limpiarNombreMuestra(d.nombre);
}
