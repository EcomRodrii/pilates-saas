import { useCallback, useEffect, useRef } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { mensajeSeguro } from '@/lib/errores';
import { postPublicoWidget } from '@/lib/reservar/api-publica';
import {
  esAvisoPuenteListo, mensajeEncargo, resultadoDelPuente, TIPO_EMAIL_DEL_INTENTO, urlPuente,
  type EncargoAcceso,
} from '@/lib/widget/puente-sesion';
// `uuidV4` y no `randomUUID` a secas: la nativa corre en la web del estudio, y
// en una web `http` (contexto no seguro) `randomUUID` no existe.
import { uuidV4 } from '@/lib/utils';

// Acciones de login/registro del bundle embebible (Modo B) — Fase 2 del
// Booking Engine, ver docs/auth-widget-diseno.md. Separado de
// usar-sesion-widget.ts (que solo lee el estado) porque este hook escribe.
//
// ⚠️ El ACCESO (contraseña o correo) no se hace en la web del estudio
// (16-oct-2026). Toda llamada de acceso a gotrue necesita un token de Turnstile
// (el captcha se exige a nivel de proyecto), y la site key solo da token en los
// dominios que Cloudflare tiene autorizados: en la web de un estudio contesta
// con el error 110200 y nadie podía entrar ni darse de alta desde la nativa en
// NINGUNA web. Añadir cada dominio en Cloudflare no escala (el plan gratuito
// admite un puñado). Así que el widget abre una ventana de Tentare
// (app/widget-auth-retorno, el puente del enlace de siempre) y le ENCARGA el
// acceso: allí corre el captcha, allí se llama a gotrue, y vuelve el resultado
// por `postMessage`. Ver `lib/widget/puente-sesion.ts`.
//
// Lo que se comprueba en cada mensaje, las tres cosas a la vez:
//  · origen EXACTAMENTE el de Tentare (`baseUrl`, del `<script src>`);
//  · que lo manda la ventana que abrió ESTE intento (`e.source`);
//  · el nonce del intento.
// El encargo (con la contraseña) se manda solo a esa ventana y con
// `targetOrigin` = Tentare: si la ventana ya no está en Tentare, el navegador
// no lo entrega. Nunca `'*'`.

export interface AceptacionWidget {
  fecha: string;
  firma: string;
  versionTexto: string;
}

export type ResultadoAcceso =
  /** Ha entrado: la sesión ya está puesta en el widget. */
  | { ok: true }
  /** El correo ha salido; el resto (enlace o código) sigue en la ventana. */
  | { enviado: true }
  | { error: string }
  /**
   * No hay ventana con la que hablar: el navegador no la dejó abrir, o se
   * cerró (o la web del estudio corta el vínculo entre ventanas, COOP) antes
   * de terminar. El formulario ofrece la página de reservas entera.
   */
  | { sinVentana: 'bloqueada' | 'cerrada' };

interface Intento {
  nonce: string;
  ventana: Window;
  email: string;
  /** Lo que se encarga al «listo» del puente. La contraseña se olvida en cuanto sale. */
  encargo: EncargoAcceso | null;
  resolver: ((r: ResultadoAcceso) => void) | null;
  vigilancia: ReturnType<typeof setInterval> | null;
}

/** Cada cuánto se mira si la ventana sigue abierta. */
const VIGILANCIA_MS = 500;

export function useAuthWidget(slug: string, baseUrl: string) {
  const intentoRef = useRef<Intento | null>(null);

  const terminar = useCallback((resultado?: ResultadoAcceso) => {
    const intento = intentoRef.current;
    if (!intento) return;
    intentoRef.current = null;
    if (intento.vigilancia) clearInterval(intento.vigilancia);
    const resolver = intento.resolver;
    intento.resolver = null;
    if (resultado) resolver?.(resultado);
  }, []);

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (!baseUrl || e.origin !== baseUrl) return;
      const intento = intentoRef.current;
      if (!intento || e.source !== intento.ventana) return;

      // El puente de ESTE intento está listo: se le encarga el acceso.
      if (esAvisoPuenteListo(e.data, intento.nonce)) {
        if (intento.encargo) {
          intento.ventana.postMessage(mensajeEncargo(intento.nonce, intento.encargo), baseUrl);
          // La contraseña se olvida en cuanto sale. El correo no lleva secreto
          // y se guarda: si la ventana se recarga antes de mandarlo (otro
          // «listo»), se le vuelve a encargar en vez de dejar el botón colgado.
          // La ventana atiende un solo encargo por carga.
          if (intento.encargo.accion === 'password') intento.encargo = null;
          return;
        }
        if (intento.resolver) {
          // Se recargó con la contraseña ya enviada y sin contestar: no hay con
          // qué repetirlo. Se cierra y se pide volver a pulsar.
          intento.ventana.close();
          terminar({ error: 'Se ha recargado la ventana para entrar. Vuelve a pulsar «Entrar».' });
          return;
        }
        // Ya contestó (el correo salió): solo el email, para el código.
        intento.ventana.postMessage({ tipo: TIPO_EMAIL_DEL_INTENTO, nonce: intento.nonce, email: intento.email }, baseUrl);
        return;
      }

      const resultado = resultadoDelPuente(e.data, intento.nonce);
      if (!resultado) return;
      if (resultado.tipo === 'enlace-enviado') {
        // El intento sigue vivo: la sesión llegará por esta misma ventana
        // cuando abra el enlace o escriba el código.
        const resolver = intento.resolver;
        intento.resolver = null;
        // Enviado: una recarga de la ventana ya no lo vuelve a mandar.
        intento.encargo = null;
        resolver?.({ enviado: true });
        return;
      }
      if (resultado.tipo === 'error') { terminar({ error: resultado.error }); return; }
      // Una sesión: el token ya viene firmado por Supabase; esto solo lo
      // transporta. Se da por buena cuando el SDK del widget la acepta.
      const resolver = intento.resolver;
      terminar();
      const { error } = await supabasePortal.auth.setSession({
        access_token: resultado.access_token, refresh_token: resultado.refresh_token,
      });
      resolver?.(error
        ? { error: mensajeSeguro(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.') }
        : { ok: true });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [baseUrl, terminar]);

  useEffect(() => () => terminar(), [terminar]);

  /**
   * Encarga el acceso a la ventana de Tentare.
   *
   * ⚠️ Hay que llamarla de forma SÍNCRONA en el manejador del clic, sin ningún
   * `await` antes: abre la ventana aquí mismo, y una ventana abierta después de
   * esperar algo el navegador la trata como no pedida y la bloquea (Safari el
   * primero). La promesa se resuelve después, con lo que conteste la ventana.
   */
  const acceder = useCallback((encargo: EncargoAcceso): Promise<ResultadoAcceso> => {
    // Un intento nuevo deja sin efecto el anterior (su ventana, si sigue
    // abierta, se reutiliza por el nombre y pasa a ser la de este).
    terminar();
    const nonce = uuidV4();
    const ventana = window.open(urlPuente(baseUrl, slug, window.location.origin, nonce), 'tentare-widget-auth', 'width=440,height=640');
    if (!ventana) return Promise.resolve({ sinVentana: 'bloqueada' });
    return new Promise<ResultadoAcceso>((resolve) => {
      const intento: Intento = { nonce, ventana, email: encargo.email, encargo, resolver: resolve, vigilancia: null };
      let vistaCerrada = false;
      intento.vigilancia = setInterval(() => {
        if (!ventana.closed) return;
        // Cerrada sin contestar: no hay sesión que esperar. Cerrada después de
        // «correo enviado»: tampoco (era ella quien la iba a traer).
        // ⚠️ Una vuelta de gracia antes de darla por perdida: la ventana manda
        // su resultado y se cierra en el acto, y son dos procesos distintos
        // (sitios distintos): el «cerrada» puede verse aquí antes de que llegue
        // el mensaje que mandó justo antes de cerrarse.
        if (!vistaCerrada) { vistaCerrada = true; return; }
        if (intentoRef.current === intento) terminar({ sinVentana: 'cerrada' });
      }, VIGILANCIA_MS);
      intentoRef.current = intento;
    });
  }, [slug, baseUrl, terminar]);

  // Alta de la walk-in ya autenticada (password o magic link) sin ficha de
  // socia todavía — mismos tres campos que crearAltaWalkIn en
  // app/reservar/[slug]/page.tsx, mismo endpoint (/api/public/socio, ya
  // CORS-aware desde PR #1090). No pasa por gotrue: no lleva captcha.
  const registrar = useCallback(async (studioId: string, nombre: string, telefono: string, aceptacion: AceptacionWidget, marketing = false) => {
    return postPublicoWidget(`${baseUrl}/api/public/socio`, {
      accion: 'registrar',
      studioId,
      id: uuidV4(),
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      aceptacion,
      referidoPor: null,
      origenLead: null,
      // Casilla de novedades, aparte y desmarcada: solo viaja el «sí».
      ...(marketing ? { marketing: true } : {}),
    }, { studioId });
  }, [baseUrl]);

  const logout = useCallback(async () => { await supabasePortal.auth.signOut({ scope: 'local' }); }, []);

  return { acceder, registrar, logout };
}
