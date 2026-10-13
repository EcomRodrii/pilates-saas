// Qué se le ofrece a la alumna para tener la app del estudio en su móvil, en
// ESTE navegador. Hermano de `push-estado.ts`: el navegador da señales brutas y
// aquí se decide el estado y la frase.
//
// ⚠️ Sin imports ni `@/`: `node --test --experimental-strip-types` no resuelve
// ese alias — un test que lo use no falla, deja de ejecutarse.
//
// Es la web app instalable del estudio (su manifest, su nombre y su icono). No
// es una app de las tiendas y la frase no lo insinúa: lo que se promete es lo
// que hace «Añadir a la pantalla de inicio».
//
// Cada estado pide una acción distinta, y pintar siempre un botón «Instalar»
// sería un control muerto en la mitad de ellos: iPhone no tiene
// `beforeinstallprompt`, y un navegador que no lo lanza no deja instalar.

export type EstadoInstalacion =
  | 'ya-instalada'      // abierta desde el icono (standalone) o dentro de la app nativa: no hay nada que ofrecer
  | 'instalable'        // el navegador ofreció instalar y lo guardamos: botón
  | 'ios-guia'          // iPhone/iPad en un navegador: Compartir → Añadir a pantalla de inicio
  | 'ios-incrustado'    // iPhone dentro del navegador de otra app (Instagram, Facebook…): ahí no se puede
  | 'sin-opcion';       // escritorio o navegador sin prompt: no se ofrece nada

export interface ContextoInstalacion {
  esNativa: boolean;
  esStandalone: boolean;
  esIOS: boolean;
  /** El navegador ya lanzó `beforeinstallprompt` y lo tenemos guardado. */
  hayPrompt: boolean;
  /** `navigator.userAgent`, solo para reconocer el navegador incrustado de otra app. */
  userAgent: string;
}

// Los visores web de otras apps (el de Instagram, el de Facebook, el de LINE…)
// no tienen el menú de compartir de Safari: mandar a «Añadir a pantalla de
// inicio» ahí es mandarla a un botón que no existe.
const INCRUSTADOS = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|TikTok/i;

export function estadoInstalacion(c: ContextoInstalacion): EstadoInstalacion {
  if (c.esNativa || c.esStandalone) return 'ya-instalada';
  // Antes que el iPhone: si en un iPhone hubiera prompt (no lo hay hoy), gana el botón.
  if (c.hayPrompt) return 'instalable';
  if (c.esIOS) return INCRUSTADOS.test(c.userAgent) ? 'ios-incrustado' : 'ios-guia';
  return 'sin-opcion';
}

export interface TextoInstalacion {
  titulo: string;
  /** Una línea para la fila de Perfil. */
  resumen: string;
  cuerpo: string;
  /** Pasos numerados, si hay una guía que seguir. */
  pasos: string[];
  /** Qué hace el botón de la hoja, o `null` si no hay botón. */
  accion: 'instalar' | null;
}

export function textoInstalacion(e: EstadoInstalacion, nombreEstudio: string): TextoInstalacion {
  switch (e) {
    case 'instalable':
      return {
        titulo: `Instala la app de ${nombreEstudio}`,
        resumen: 'Ábrela desde tu pantalla de inicio',
        cuerpo: `Tendrás ${nombreEstudio} en tu pantalla de inicio, con su icono, y se abre como una app.`,
        pasos: [],
        accion: 'instalar',
      };
    case 'ios-guia':
      return {
        titulo: `Instala la app de ${nombreEstudio}`,
        resumen: 'Tenla en tu pantalla de inicio',
        cuerpo: 'En iPhone se hace desde Safari, en tres toques. Además, los avisos de plaza libre y recordatorios solo llegan desde la app instalada.',
        pasos: [
          'Toca el botón Compartir, el cuadrado con una flecha hacia arriba.',
          'Elige «Añadir a pantalla de inicio».',
          'Toca «Añadir» y abre la app desde su icono.',
        ],
        accion: null,
      };
    case 'ios-incrustado':
      return {
        titulo: `Instala la app de ${nombreEstudio}`,
        resumen: 'Ábrela primero en Safari',
        cuerpo: 'Estás dentro del navegador de otra app, que no deja instalarla. Abre este mismo enlace en Safari y vuelve aquí.',
        pasos: [
          'Toca los tres puntos o el icono de compartir de esa app.',
          'Elige «Abrir en Safari».',
          'Ya en Safari, vuelve a esta pantalla y sigue los pasos.',
        ],
        accion: null,
      };
    case 'ya-instalada':
    case 'sin-opcion':
      return { titulo: '', resumen: '', cuerpo: '', pasos: [], accion: null };
  }
}

/** ¿Se ofrece algo en la pantalla? Si no, ni siquiera se pinta la fila. */
export const seOfrece = (e: EstadoInstalacion | null): boolean =>
  e === 'instalable' || e === 'ios-guia' || e === 'ios-incrustado';

/** La respuesta del navegador a «¿quieres instalarla?», en lo que la alumna necesita saber. */
export type ResultadoInstalacion = 'aceptada' | 'rechazada' | 'no-disponible';

export function fraseResultado(r: ResultadoInstalacion, nombreEstudio: string): string {
  switch (r) {
    case 'aceptada': return `Listo. Busca ${nombreEstudio} en tu pantalla de inicio.`;
    case 'rechazada': return 'No pasa nada: puedes instalarla cuando quieras desde aquí.';
    case 'no-disponible': return 'Tu navegador no nos deja instalarla ahora. Prueba desde su menú, o más tarde.';
  }
}
