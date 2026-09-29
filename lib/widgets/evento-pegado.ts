// Qué guarda /api/public/evento de lo pegado en la web del estudio (Fase C):
// con qué forma se cargó, desde qué web y con qué versión. Puro, sin Next ni
// Supabase, para node --test: la ruta solo le pasa lo que ya tiene.
//
// ⚠️ Lo que devuelve va TAL CUAL al insert de `widget_eventos`, y la tabla
// tiene CHECKs sobre las tres columnas (migración `…_widget_eventos_visto_en_su_web`).
// Un valor que la BD rechace no pierde solo el anfitrión: pierde la visita
// entera. Por eso aquí nada pasa sin validar, y ante la duda, `null`.

import { LEGAL, canonicalizarOrigen } from '../legal-info.ts';
import {
  FIRMA_CONTENIDO_VALIDA, esOrigenDeTentare, origenAnfitrion, type FormaPegada,
} from './pegado.ts';

export interface PegadoDelEvento {
  forma: FormaPegada | null;
  anfitrion: string | null;
  firma: string | null;
}

const NADA: PegadoDelEvento = { forma: null, anfitrion: null, firma: null };

/**
 * La versión que dice el cuerpo, si tiene la forma del CHECK de
 * `widget_eventos.firma`. Una firma rara no invalida el resto: la visita y la
 * web siguen siendo ciertas, solo no sabemos qué versión era.
 */
function firmaDelCuerpo(v: unknown): string | null {
  return typeof v === 'string' && FIRMA_CONTENIDO_VALIDA.test(v) ? v : null;
}

/**
 * Los orígenes que son Tentare para esta petición: el canónico y el de la
 * propia petición (el despliegue que la atiende, `localhost` en desarrollo).
 * Aparte para que la ruta y el test usen exactamente la misma lista.
 */
export function propiosDeLaPeticion(origenPeticion: string): string[] {
  return [canonicalizarOrigen(new URL(LEGAL.url).origin), canonicalizarOrigen(origenPeticion)];
}

export function pegadoDelEvento(x: {
  tipo: string;
  cuerpo: { forma?: unknown; anfitrion?: unknown; firma?: unknown };
  /** La URL de la petición trae `?studioId=`: así llama el bundle de la nativa (lib/reservar/eventos.ts, `baseUrl`). */
  studioIdEnUrl: boolean;
  /** La cabecera `Origin` tal cual, o `null` si no vino. */
  origenCabecera: string | null;
  /** Los orígenes de Tentare: el canónico y el de la propia petición. */
  propios: readonly string[];
  /**
   * Esa cabecera `Origin` está entre las webs que ESTE estudio autorizó
   * (`origenPermitido`, lib/cors-widget.ts) y el `?studioId=` de la URL es el
   * del cuerpo. Lo resuelve la ruta, que es quien puede consultar la BD.
   */
  nativaAutorizada?: boolean;
}): PegadoDelEvento {
  // Solo la carga dice dónde está pegado. El resto de eventos de la misma
  // sesión (y algunos llevan el socio_id) no se atan a ninguna web.
  if (x.tipo !== 'widget_loaded') return NADA;

  // La nativa corre en el DOM de la web del estudio: su anfitrión es la
  // cabecera `Origin`, que pone el navegador y no la página. Tener la cabecera
  // no basta (un POST del mismo origen también la manda, según Fetch): hace
  // falta además el `?studioId=` que solo pone el bundle, y que el origen no
  // sea de Tentare. Del cuerpo aquí solo cuenta la FIRMA (Fase E): la calcula
  // el bundle de los `data-*` de su código (`firmaDeUrl` sobre su `dataset`);
  // la forma y la web que diga el cuerpo se ignoran. Una firma falsa escrita a
  // mano solo cambia qué versión se enseña de ESA web, que ya es suya.
  //
  // ⚠️ Y esa web tiene que estar autorizada por ESTE estudio: «Visto en» solo
  // nombra webs que el propio estudio dio por suyas. La nativa de verdad solo
  // carga en webs autorizadas, así que no se pierde ninguna carga real.
  if (x.studioIdEnUrl && x.origenCabecera && !esOrigenDeTentare(x.origenCabecera, x.propios)) {
    if (!x.nativaAutorizada) return NADA;
    return { forma: 'nativa', anfitrion: origenAnfitrion(x.origenCabecera), firma: firmaDelCuerpo(x.cuerpo.firma) };
  }

  // Dentro de una página o encima: lo cuenta la página (/reservar), que es la
  // que ve el marco y el referrer. 'nativa' en el cuerpo NO vale: una petición
  // del mismo origen no puede ser la nativa, y aceptarla dejaría a cualquiera
  // inventarse una sin cabecera.
  //
  // ⚠️ Solo si la petición sale de Tentare: la página manda el evento desde
  // su propio origen (un POST del mismo origen, que siempre lleva `Origin`).
  // El precio: un iframe con `sandbox` sin `allow-same-origin` manda `null` y
  // pierde la forma; la visita sigue contando.
  if (!x.origenCabecera || !esOrigenDeTentare(x.origenCabecera, x.propios)) return NADA;
  const forma = x.cuerpo.forma;
  if (forma !== 'incrustado' && forma !== 'ventana') return NADA;

  // Un anfitrión de Tentare (el onboarding, el portal, una vista previa) no es
  // su web: se queda la forma y se calla la dirección, en vez de decirle
  // «Visto en www.tentare.app».
  const origen = origenAnfitrion(x.cuerpo.anfitrion);
  const anfitrion = origen && !esOrigenDeTentare(origen, x.propios) ? origen : null;

  return { forma, anfitrion, firma: firmaDelCuerpo(x.cuerpo.firma) };
}
