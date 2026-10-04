// El puente entre la web y la app nativa de iOS (docs/APP-IOS.md).
//
// La app es la web real metida en una carcasa (capacitor.config.ts →
// `server.url`). Casi todo funciona igual que en Safari; lo que no, pasa por
// aquí: abrir algo fuera, compartir un fichero, los avisos push de APNs, los
// enlaces que abren la app y los dos logins que Apple y Google no dejan hacer
// dentro de un WebView.
//
// Reglas del fichero:
//   - Se puede importar desde cualquier componente de cliente: no toca
//     `window` al cargarse y los plugins de Capacitor se importan con `import()`
//     SOLO dentro de la app. En la web no se descarga ni un byte de Capacitor.
//   - En el servidor no hace nada útil (todo pregunta antes `esAppNativa()`,
//     que ahí es `false`). Los TIPOS del contrato con el servidor viven en
//     lib/nativo/tipos.ts para que una ruta los importe sin pasar por aquí.
//   - Lo puro (validar enlaces, el nonce, el nombre del fichero) está en
//     enlaces.ts / nonce.ts / ficheros.ts, con sus tests.
//
// ⚠️ No lleva 'use client': no es un componente, y la directiva en un módulo
// de funciones las convertiría en referencias de cliente si algún componente
// de servidor lo importara. Quien lo llama ya es de cliente.

import type { PluginListenerHandle } from '@capacitor/core';
import { descargarBlob } from '../descargar-blob.ts';
import { esUrlAbrible, esVueltaDeOAuth, rutaDeAviso, rutaInternaDeEnlace } from './enlaces.ts';
import { bytesABase64, nombreDeFicheroSeguro } from './ficheros.ts';
import { prepararNonceApple } from './nonce.ts';
import { esNativoSegun } from './plataforma.ts';
import { esCancelacion, formaDeCompartir } from './compartir.ts';
import type { TintaBarra } from './barra-de-estado.ts';
import type { AvisoPulsado, RegistroTokenNativo, ResultadoLoginApple } from './tipos.ts';

export type { AvisoPulsado, RegistroTokenNativo, ResultadoLoginApple } from './tipos.ts';
export { esVueltaDeOAuth } from './enlaces.ts';

const ESPERA_PUSH_MS = 20_000;
const ESPERA_OAUTH_MS = 10 * 60_000;

/** `true` solo dentro de la app nativa (Capacitor de verdad), nunca en la web. */
export function esAppNativa(): boolean {
  if (typeof window === 'undefined') return false;
  return esNativoSegun((window as unknown as { Capacitor?: unknown }).Capacitor);
}

// ─── Identidad de la app ──────────────────────────────────────────────────

let bundleIdCache: Promise<string | null> | null = null;

/** Bundle id de la app que está abierta (`app.tentare`, o el de la app de un
 *  estudio); `null` en la web. Es también su esquema de URL propio. */
export function bundleIdDeLaApp(): Promise<string | null> {
  if (!esAppNativa()) return Promise.resolve(null);
  bundleIdCache ??= import('@capacitor/app')
    .then(({ App }) => App.getInfo())
    .then((info) => info.id || null)
    .catch(() => {
      bundleIdCache = null;
      return null;
    });
  return bundleIdCache;
}

// ─── Pantalla de carga ────────────────────────────────────────────────────

/**
 * Quita el logo del arranque. La carcasa lo deja puesto hasta que la web está
 * pintada (capacitor.config.ts, `launchShowDuration` es solo la red de
 * seguridad): si se quitara solo, en un arranque en frío se veía la pantalla en
 * blanco mientras llegaba la web. Llamarla dos veces no hace nada.
 */
export async function ocultarPantallaDeCarga(): Promise<void> {
  if (!esAppNativa()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    // Sin el plugin la quita la propia carcasa al vencer su plazo.
  }
}

// ─── Abrir fuera ──────────────────────────────────────────────────────────

/**
 * Abre una URL fuera de la página: en la app, en un Safari por encima
 * (SFSafariViewController, con su botón de «OK» para volver); en la web, en una
 * pestaña nueva como hasta ahora.
 */
export async function abrirFuera(url: string): Promise<void> {
  if (!esUrlAbrible(url)) return;
  if (!esAppNativa()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover' });
}

// ─── Compartir un fichero ─────────────────────────────────────────────────

export interface FicheroParaCompartir {
  nombre: string;
  /** Tipo MIME (`text/calendar`, `application/pdf`…). */
  tipo: string;
  contenido: Blob | string;
}

/**
 * En la app: lo escribe en la caché y abre la hoja de compartir de iOS (desde
 * ahí, Calendario para un .ics; Archivos, Imprimir o Mail para un PDF). En la
 * web: lo descarga, que es lo que se hace hoy (lib/descargar-blob.ts).
 *
 * Cerrar la hoja sin elegir nada devuelve `{ error: 'cancelado' }`: no es un
 * fallo que haya que enseñar.
 */
export async function compartirFichero(f: FicheroParaCompartir): Promise<{ ok: true } | { error: string }> {
  const nombre = nombreDeFicheroSeguro(f.nombre, f.tipo);
  if (!esAppNativa()) {
    const blob = typeof f.contenido === 'string' ? new Blob([f.contenido], { type: f.tipo }) : f.contenido;
    descargarBlob(blob, nombre);
    return { ok: true };
  }
  try {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const path = `compartir/${nombre}`;
    const escrito = typeof f.contenido === 'string'
      ? await Filesystem.writeFile({ path, data: f.contenido, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
      : await Filesystem.writeFile({
          path,
          data: bytesABase64(new Uint8Array(await f.contenido.arrayBuffer())),
          directory: Directory.Cache,
          recursive: true,
        });
    await Share.share({ title: nombre, files: [escrito.uri] });
    return { ok: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { error: /cancel/i.test(mensaje) ? 'cancelado' : mensaje };
  }
}

// ─── Compartir un texto con su enlace ─────────────────────────────────────

/**
 * La hoja de compartir del sistema con una frase y un enlace: en la app, la
 * nativa de iOS; en un navegador que la tenga (`navigator.share`), la suya.
 *
 * Devuelve `'copiar'` cuando no hay hoja (escritorio) o la hoja falló: quien
 * llama copia entonces al portapapeles, que es lo que se hacía siempre — y
 * comprueba que se copió de verdad (ver `copiarAlPortapapeles`). `'cancelado'`
 * = cerró la hoja sin elegir: no se enseña nada.
 */
/** ¿Hay hoja de compartir del sistema (la app, o un navegador con `navigator.share`)? */
export function hayHojaDeCompartir(): boolean {
  return formaDeCompartir({
    nativa: esAppNativa(),
    hayWebShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  }) !== 'copiar';
}

export async function compartirTexto(c: { titulo: string; texto: string; url?: string }): Promise<'compartido' | 'cancelado' | 'copiar'> {
  const forma = formaDeCompartir({
    nativa: esAppNativa(),
    hayWebShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  });
  if (forma === 'copiar') return 'copiar';
  try {
    if (forma === 'nativa') {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: c.titulo, text: c.texto, url: c.url, dialogTitle: c.titulo });
    } else {
      await navigator.share({ title: c.titulo, text: c.texto, ...(c.url ? { url: c.url } : null) });
    }
    return 'compartido';
  } catch (e) {
    return esCancelacion(e) ? 'cancelado' : 'copiar';
  }
}

// ─── Vibración (Taptic Engine) ────────────────────────────────────────────

/**
 * Un toque del motor háptico, como las apps nativas. Fuera de la app no hace
 * nada (y no se descarga el plugin).
 *
 *   · `exito` — el servidor ha CONFIRMADO algo (una reserva). Nunca antes de
 *     que conteste: vibrar y que luego diga que no sería mentir con la mano.
 *   · `aviso` — algo salió bien pero conviene notarlo (una cancelación hecha).
 *   · `suave` — un cambio de selección: de pestaña abajo, de día en el horario.
 */
export async function vibrar(tipo: 'exito' | 'aviso' | 'suave'): Promise<void> {
  if (!esAppNativa()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (tipo === 'suave') await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: tipo === 'exito' ? NotificationType.Success : NotificationType.Warning });
  } catch {
    // Sin motor háptico (iPad, simulador) no pasa nada: es un adorno.
  }
}

// ─── Barra de estado ──────────────────────────────────────────────────────

/**
 * Letras claras u oscuras en la barra de estado (hora, batería). Lo decide
 * `tintaBarraDeEstado` (barra-de-estado.ts) según lo que hay detrás.
 *
 * ⚠️ En Capacitor `Style.Dark` significa «para fondos oscuros», o sea letras
 * CLARAS; `Style.Light`, letras oscuras. Se traduce aquí una vez.
 */
export async function estiloBarraDeEstado(tinta: TintaBarra): Promise<void> {
  if (!esAppNativa()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: tinta === 'clara' ? Style.Dark : Style.Light });
  } catch {
    // Sin el plugin la barra se queda como la deja iOS: no rompe nada.
  }
}

// ─── Avisos push (APNs) ───────────────────────────────────────────────────

/**
 * Pide permiso para avisos, registra el aparato en APNs y devuelve su token.
 *
 * NO lo manda al servidor: eso es `POST /api/notifications/subscribe` con
 * `{ studioId, nativo: RegistroTokenNativo }` (ver `datosRegistroToken`). Llamarlo otra vez es seguro:
 * iOS devuelve el mismo token mientras no cambie.
 */
export async function registrarPushNativo(): Promise<{ token: string } | { error: string }> {
  if (!esAppNativa()) return { error: 'solo-en-la-app' };
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let permiso = await PushNotifications.checkPermissions();
  if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') {
    permiso = await PushNotifications.requestPermissions();
  }
  if (permiso.receive !== 'granted') return { error: 'permiso-denegado' };

  return new Promise((resolve) => {
    const asas: Promise<PluginListenerHandle>[] = [];
    let hecho = false;
    const terminar = (r: { token: string } | { error: string }) => {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      for (const a of asas) void a.then((h) => h.remove()).catch(() => {});
      resolve(r);
    };
    // Si iOS no llega a contestar (sin red hasta APNs, por ejemplo), mejor un
    // error claro que una promesa colgada.
    const reloj = setTimeout(() => terminar({ error: 'sin-respuesta-de-apns' }), ESPERA_PUSH_MS);
    asas.push(PushNotifications.addListener('registration', (t) => terminar({ token: t.value })));
    asas.push(PushNotifications.addListener('registrationError', (e) => terminar({ error: e.error || 'error-de-registro' })));
    // Los oyentes, ANTES de registrar: si no, un token rápido se pierde.
    void Promise.all(asas)
      .then(() => PushNotifications.register())
      .catch((e: unknown) => terminar({ error: e instanceof Error ? e.message : 'error-de-registro' }));
  });
}

/** El permiso de avisos de la app, SIN pedirlo: para pintar el estado. */
export async function permisoPushNativo(): Promise<'granted' | 'denied' | 'default'> {
  if (!esAppNativa()) return 'default';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default';
  } catch {
    return 'default';
  }
}

/** El `nativo` de `POST /api/notifications/subscribe` para un token ya obtenido. */
export async function datosRegistroToken(token: string): Promise<RegistroTokenNativo | null> {
  const bundleId = await bundleIdDeLaApp();
  return bundleId ? { token, plataforma: 'ios', bundleId } : null;
}

/**
 * Avisa cuando la persona pulsa un aviso push. Devuelve cómo dejar de escuchar.
 *
 * Regístralo pronto (al montar la app): si el aviso abrió la app desde cerrada,
 * Capacitor guarda el evento hasta que alguien escuche, pero solo lo entrega
 * a quien se apunte.
 */
export async function alPulsarAviso(handler: (aviso: AvisoPulsado) => void): Promise<() => void> {
  if (!esAppNativa()) return () => {};
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const asa = await PushNotifications.addListener('pushNotificationActionPerformed', (accion) => {
    const datos = (accion.notification?.data ?? {}) as Record<string, unknown>;
    handler({ ruta: rutaDeAviso(datos), datos });
  });
  return () => void asa.remove();
}

// ─── Enlaces que abren la app ─────────────────────────────────────────────

/**
 * Avisa cuando un enlace abre la app (Universal Link de tentare.app o el
 * esquema propio `<bundle id>://…`) con la ruta INTERNA a la que llevarla:
 * solo path + query, ya validados. Los enlaces que no son de Tentare no llegan.
 * Devuelve cómo dejar de escuchar.
 */
export async function alAbrirEnlace(handler: (ruta: string) => void): Promise<() => void> {
  if (!esAppNativa()) return () => {};
  const [{ App }, bundleId] = await Promise.all([import('@capacitor/app'), bundleIdDeLaApp()]);
  const esquemas = bundleId ? [bundleId] : [];
  const asa = await App.addListener('appUrlOpen', ({ url }) => {
    const ruta = rutaInternaDeEnlace(url, esquemas);
    if (ruta) handler(ruta);
  });
  return () => void asa.remove();
}

// ─── Iniciar sesión con Apple ─────────────────────────────────────────────

interface RespuestaApple {
  response: {
    user: string;
    identityToken: string;
    authorizationCode?: string;
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
  };
}
interface PluginApple {
  authorize(opciones: { nonce: string; scopes?: string; clientId?: string; redirectURI?: string }): Promise<RespuestaApple>;
}

let pluginApple: PluginApple | null = null;

/**
 * Abre la hoja nativa de «Iniciar sesión con Apple».
 *
 * Devuelve el identity token y el nonce EN CRUDO, que es lo que pide
 * `supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce })`.
 * A Apple se le ha mandado el SHA-256 de ese nonce (lib/nativo/nonce.ts).
 *
 * El plugin nativo es `SignInWithApplePlugin` (ios/App/App/), con el mismo
 * nombre y la misma respuesta que `@capacitor-community/apple-sign-in`: cuando
 * ese plugin publique soporte de Capacitor 8 se puede cambiar sin tocar esto.
 */
export async function loginConApple(): Promise<ResultadoLoginApple> {
  if (!esAppNativa()) return { error: 'solo-en-la-app' };
  try {
    if (!pluginApple) {
      const { registerPlugin } = await import('@capacitor/core');
      pluginApple = registerPlugin<PluginApple>('SignInWithApple');
    }
    const { crudo, hash } = await prepararNonceApple();
    const { response: r } = await pluginApple.authorize({ nonce: hash, scopes: 'email name' });
    if (!r?.identityToken) return { error: 'apple-sin-token' };
    const nombre = r.givenName || r.familyName
      ? { pila: r.givenName ?? null, apellidos: r.familyName ?? null }
      : undefined;
    return { idToken: r.identityToken, nonce: crudo, ...(nombre ? { nombre } : {}) };
  } catch (e) {
    const codigo = (e as { code?: string } | null)?.code;
    const mensaje = e instanceof Error ? e.message : 'error-de-apple';
    // `CANCELADO` lo pone nuestro plugin; el comunitario solo deja el mensaje
    // de iOS, que lleva el código 1001 (ASAuthorizationError.canceled).
    if (codigo === 'CANCELADO' || /\b1001\b/.test(mensaje)) return { error: 'cancelado' };
    return { error: mensaje };
  }
}

// ─── Iniciar sesión con Google ────────────────────────────────────────────

/**
 * Abre el flujo OAuth de Google en un Safari por encima de la app y espera a
 * que vuelva. Google bloquea su login dentro de un WebView
 * («disallowed_useragent»), así que no puede hacerse en la página.
 *
 * Solo el MECANISMO: `urlAutorizacion` la construye quien llama (PKCE de
 * Supabase incluido), y la ruta que devuelve (path + query, con su `code`) la
 * canjea también quien llama.
 *
 * ⚠️ La vuelta tiene que llegar como ENLACE A LA APP. Lo fiable es el esquema
 * propio, `<bundle id>://auth/vuelta` (ver `bundleIdDeLaApp`), en la lista de
 * redirecciones permitidas de Supabase: iOS no entrega como Universal Link una
 * redirección que ocurre DENTRO de SFSafariViewController, y entonces la vuelta
 * se quedaría cargando la web en ese Safari.
 *
 * ⚠️ El enlace de vuelta llega TAMBIÉN a cualquier otro `alAbrirEnlace` que
 * haya abierto (el que lleva a la persona a la ruta de un Universal Link, por
 * ejemplo): ese debe ignorar las rutas en las que `esVueltaDeOAuth()` da `true`,
 * o canjearía el mismo `code` dos veces.
 *
 * @param prefijoDeVuelta solo cuenta la vuelta cuya ruta empieza por aquí
 *   (además de traer `code` o `error`).
 */
export async function loginConGoogleNativo(
  urlAutorizacion: string,
  prefijoDeVuelta = '/',
): Promise<{ ruta: string } | { error: string }> {
  if (!esAppNativa()) return { error: 'solo-en-la-app' };
  if (!urlAutorizacion.startsWith('https://')) return { error: 'url-no-valida' };
  const { Browser } = await import('@capacitor/browser');

  return new Promise((resolve) => {
    let hecho = false;
    let dejarEnlaces: (() => void) | null = null;
    let asaCerrar: PluginListenerHandle | null = null;
    const terminar = (r: { ruta: string } | { error: string }) => {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      dejarEnlaces?.();
      void asaCerrar?.remove();
      if ('ruta' in r) void Browser.close().catch(() => {});
      resolve(r);
    };
    const reloj = setTimeout(() => {
      void Browser.close().catch(() => {});
      terminar({ error: 'tiempo-agotado' });
    }, ESPERA_OAUTH_MS);

    void (async () => {
      try {
        dejarEnlaces = await alAbrirEnlace((ruta) => {
          if (esVueltaDeOAuth(ruta, prefijoDeVuelta)) terminar({ ruta });
        });
        // La persona cierra el Safari con «OK» sin terminar.
        asaCerrar = await Browser.addListener('browserFinished', () => terminar({ error: 'cancelado' }));
        if (hecho) {
          dejarEnlaces();
          void asaCerrar.remove();
          return;
        }
        await Browser.open({ url: urlAutorizacion, presentationStyle: 'popover' });
      } catch (e) {
        terminar({ error: e instanceof Error ? e.message : 'no-se-pudo-abrir' });
      }
    })();
  });
}

// ─── Calendario del iPhone ────────────────────────────────────────────────
//
// Con `@ebarooni/capacitor-calendar` (EventKit). Pide acceso COMPLETO y no solo
// de escritura: con «solo añadir» iOS no deja volver a encontrar el evento, y
// entonces no se podría quitar al cancelar la reserva, que es la mitad de la
// promesa del interruptor de Perfil. Los textos del permiso, en Info.plist.

export interface EventoCalendario {
  titulo: string;
  /** Instantes reales (ms), los de `Clase.inicio`/`Clase.fin`. */
  inicioMs: number;
  finMs: number;
  lugar?: string;
  notas?: string;
}

/** ¿Hay acceso al calendario? Lo pide si aún no se ha preguntado. */
export async function pedirAccesoCalendario(): Promise<boolean> {
  if (!esAppNativa()) return false;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const { result } = await CapacitorCalendar.requestFullCalendarAccess();
    return result === 'granted';
  } catch {
    return false;
  }
}

/** Crea el evento y devuelve su id del calendario, o `null` si no se pudo. */
export async function crearEventoCalendario(e: EventoCalendario): Promise<string | null> {
  if (!esAppNativa()) return null;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const r = await CapacitorCalendar.createEvent({
      title: e.titulo, startDate: e.inicioMs, endDate: e.finMs,
      location: e.lugar, description: e.notas,
      // Un aviso una hora antes, como el recordatorio del estudio.
      alerts: [-60],
    });
    return r.id ?? null;
  } catch {
    return null;
  }
}

/** Quita un evento que creó la app. `false` si no se pudo (sin acceso, o ya no existe). */
export async function borrarEventoCalendario(id: string): Promise<boolean> {
  if (!esAppNativa()) return false;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    await CapacitorCalendar.deleteEvent({ id });
    return true;
  } catch {
    return false;
  }
}

// ─── Brillo de la pantalla ────────────────────────────────────────────────
//
// Al enseñar el QR de acceso: el lector del estudio lo lee mucho mejor con la
// pantalla a tope. Se guarda el brillo de antes y se devuelve al cerrar.

/** Sube el brillo al máximo y devuelve con qué restaurarlo (no hace nada fuera de la app). */
export async function brilloAlMaximo(): Promise<() => Promise<void>> {
  const nada = async () => {};
  if (!esAppNativa()) return nada;
  try {
    const { ScreenBrightness } = await import('@capacitor-community/screen-brightness');
    const { brightness } = await ScreenBrightness.getBrightness();
    await ScreenBrightness.setBrightness({ brightness: 1 });
    return async () => {
      try { await ScreenBrightness.setBrightness({ brightness }); } catch { /* sin plugin, iOS lo devuelve al bloquear */ }
    };
  } catch {
    return nada;
  }
}
