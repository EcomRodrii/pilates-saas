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
}): PegadoDelEvento {
  // Solo la carga dice dónde está pegado. El resto de eventos de la misma
  // sesión (y algunos llevan el socio_id) no se atan a ninguna web.
  if (x.tipo !== 'widget_loaded') return NADA;

  // La nativa corre en el DOM de la web del estudio: su anfitrión es la
  // cabecera `Origin`, que pone el navegador y no la página. Tener la cabecera
  // no basta (un POST del mismo origen también la manda, según Fetch): hace
  // falta además el `?studioId=` que solo pone el bundle, y que el origen no
  // sea de Tentare. Lo que diga el cuerpo aquí no cuenta.
  if (x.studioIdEnUrl && x.origenCabecera && !esOrigenDeTentare(x.origenCabecera, x.propios)) {
    return { forma: 'nativa', anfitrion: origenAnfitrion(x.origenCabecera), firma: null };
  }

  // Dentro de una página o encima: lo cuenta la página (/reservar), que es la
  // que ve el marco y el referrer. 'nativa' en el cuerpo NO vale: una petición
  // del mismo origen no puede ser la nativa, y aceptarla dejaría a cualquiera
  // inventarse una sin cabecera.
  const forma = x.cuerpo.forma;
  if (forma !== 'incrustado' && forma !== 'ventana') return NADA;

  // Un anfitrión de Tentare (el onboarding, el portal, una vista previa) no es
  // su web: se queda la forma y se calla la dirección, en vez de decirle
  // «Visto en www.tentare.app».
  const origen = origenAnfitrion(x.cuerpo.anfitrion);
  const anfitrion = origen && !esOrigenDeTentare(origen, x.propios) ? origen : null;

  // Una firma rara no invalida el resto: la visita y la web siguen siendo
  // ciertas, solo no sabemos qué versión era.
  const firma = typeof x.cuerpo.firma === 'string' && FIRMA_CONTENIDO_VALIDA.test(x.cuerpo.firma)
    ? x.cuerpo.firma
    : null;

  return { forma, anfitrion, firma };
}
