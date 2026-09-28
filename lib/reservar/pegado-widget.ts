// Dónde está pegado este widget, visto desde dentro (Fase C del constructor).
//
// /reservar lo calcula UNA vez al montar y viaja solo con `widget_loaded`
// (lib/reservar/eventos.ts); la ruta que lo guarda lo vuelve a validar, y el
// panel lo enseña como «Visto en albapilates.example.com hace 2 h» en «Lo que
// tienes en tu web». Sin React ni Next: node --test.
//
// ⚠️ Nada de esto viaja en el código que se copia: no hay ningún parámetro
// nuevo. La forma sale de `ventana=1` (lo pone el script del popup en tiempo de
// ejecución, lib/widgets/popup-url.ts), la web de `ancestorOrigins` o del
// referrer, y la versión de la propia URL (`firmaDeUrl`).

import { esOrigenDeTentare, origenAnfitrion, type FormaPegada } from '../widgets/pegado.ts';
import { firmaDeUrl } from '../widgets/firma-contenido.ts';

/**
 * Parámetros que pone la PROPIA Tentare al volver a esta página (la
 * redirección de la nativa con `directo=1`, la vuelta de Stripe, el enlace de
 * acceso, los pasos de la reserva) o el panel al previsualizar. Con cualquiera
 * de ellos, lo que carga no es lo que se pegó: esa URL no es el código de su
 * web, y su firma saldría como «una versión distinta» que nadie pegó.
 */
export const PARAMS_DE_EJECUCION = [
  'vista-previa', 'directo', 'compra', 'tentare_pago', 'wsid', 'acceso', 'paso', 'clase',
] as const;

/** Lo que manda `widget_loaded`: solo las dos formas que se ven dentro de un marco. */
export interface PegadoWidget {
  forma: Extract<FormaPegada, 'incrustado' | 'ventana'>;
  /** El origen de su web, o `null` si no nos lo dice (`no-referrer`, iframe sandbox). */
  anfitrion: string | null;
  firma: string;
}

/**
 * Qué se ha pegado y dónde, o `null` si esta carga no es un widget pegado en
 * la web del estudio. `null` no es «sin dirección»: es no mandar NADA, y la
 * visita cuenta igual en el embudo.
 */
export function pegadoDesde(x: {
  params: URLSearchParams;
  enMarco: boolean;
  ancestros: readonly string[] | null;
  referrer: string;
  propio: string;
}): PegadoWidget | null {
  // Sin `embed=1` es la página suelta: un botón o un enlace, que llegan de
  // Instagram, de WhatsApp o de un blog personal. Por privacidad no se manda
  // de dónde (lib/widgets/pegado.ts).
  if (x.params.get('embed') !== '1') return null;
  // `embed=1` sin marco: alguien abrió la URL del iframe a pantalla completa.
  // Ahí el referrer vuelve a ser de dónde viene una persona, no una web.
  if (!x.enMarco) return null;
  if (PARAMS_DE_EJECUCION.some(k => x.params.has(k))) return null;

  // La cima y no el padre: Wix mete el código en un marco suyo
  // (`filesusr.com`) dentro de la web del estudio, y el padre inmediato sería
  // Wix. Firefox no tiene `ancestorOrigins`: ahí queda el referrer, que con la
  // política por defecto es solo el origen del padre.
  const anfitrion = origenAnfitrion(x.ancestros?.at(-1) ?? x.referrer);
  // Dentro de la propia Tentare (el onboarding, el portal, las vistas previas
  // de cada despliegue) no es su web: nada, ni siquiera «sin dirección».
  if (anfitrion && esOrigenDeTentare(anfitrion, [x.propio])) return null;

  return {
    forma: x.params.get('ventana') === '1' ? 'ventana' : 'incrustado',
    anfitrion,
    firma: firmaDeUrl(x.params),
  };
}
