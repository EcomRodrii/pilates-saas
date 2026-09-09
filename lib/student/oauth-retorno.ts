// Qué dice la URL cuando la vuelta de Google NO trae sesión.
//
// ⚠️ Por qué hace falta leerla a mano. `supabasePortal` va con el `flowType`
// por defecto de auth-js, que es `'implicit'`
// (node_modules/@supabase/auth-js/…/GoTrueClient.js:24), así que el retorno
// llega en el FRAGMENTO. Cuando trae sesión, auth-js la guarda y limpia la URL;
// cuando trae un error, `_getSessionFromURL` lanza `AuthImplicitGrantRedirect
// Error` en la comprobación de `params.error` (línea 3204) — que está ANTES del
// `window.history.replaceState` de la línea 3237. O sea: **en el camino de
// error el fragmento NO se limpia**, sigue en la barra de direcciones, y es la
// única pista de lo que pasó. Ese error tampoco viaja por `onAuthStateChange`,
// así que la pantalla no se entera por ninguna otra vía.
//
// Sin esto, cancelar en la pantalla de Google devolvía a `/acceso/verificar`
// sin sesión, y esa pantalla enseña su estado de «no hay sesión todavía»:
// «Verifica tu email — te hemos enviado un enlace». Nadie le había enviado
// ningún enlace: había pulsado «Cancelar» en Google. El mensaje describía otro
// trámite distinto del que acababa de abandonar.
//
// Se lee de las DOS mitades (query y fragmento) a propósito: `implicit` los
// manda en el `#`, pero si algún día se pasa a `flowType: 'pkce'` viajarían en
// el `?`, y una pantalla de error que enmudece al cambiar una opción del
// cliente es justo el tipo de rotura que no avisa.

export interface ErrorRetornoOAuth {
  /** El código crudo, para telemetría. Nunca se enseña. */
  codigo: string;
  /** Lo que lee la alumna. */
  mensaje: string;
  /** ¿Tiene sentido ofrecerle reintentar con Google, o es un callejón? */
  reintentable: boolean;
}

/**
 * `null` = esta URL no trae ningún error de OAuth (el caso normal: o trae
 * sesión, o simplemente es una visita directa).
 */
export function errorDeRetornoOAuth(url: string): ErrorRetornoOAuth | null {
  let codigo = '';
  try {
    const u = new URL(url, 'http://x');
    // El fragmento manda: es donde lo pone el flujo implícito.
    const frag = new URLSearchParams(u.hash.replace(/^#/, ''));
    codigo = frag.get('error_code') || frag.get('error')
      || u.searchParams.get('error_code') || u.searchParams.get('error') || '';
  } catch {
    return null;
  }
  if (!codigo) return null;

  // ⚠️ El texto NUNCA sale de `error_description`. Ese campo lo redacta Google
  // o gotrue, viene en inglés, y es texto de terceros metido en la URL: pintarlo
  // tal cual sería enseñar a la alumna una cadena que controla quien le mande el
  // enlace. Se traduce por código, y lo que no se reconoce cae en un texto
  // genérico honesto.
  if (codigo === 'access_denied') {
    return {
      codigo,
      // Cancelar no es un fallo, y no debe leerse como uno: la mitad de las
      // veces es alguien que se ha arrepentido a propósito.
      mensaje: 'No has terminado de entrar con Google. Puedes intentarlo otra vez o usar tu email.',
      reintentable: true,
    };
  }
  if (codigo === 'server_error' || codigo === 'temporarily_unavailable') {
    return {
      codigo,
      mensaje: 'Google no ha respondido a tiempo. Inténtalo de nuevo en un momento.',
      reintentable: true,
    };
  }
  // `provider_email_needs_verification`: Google devuelve un email que gotrue no
  // da por verificado. No se arregla reintentando — hay que entrar por correo.
  if (codigo === 'provider_email_needs_verification') {
    return {
      codigo,
      mensaje: 'Google no nos ha confirmado tu email. Entra con tu email y te mandamos un enlace.',
      reintentable: false,
    };
  }
  if (codigo === 'otp_expired' || codigo === 'access_token_expired') {
    return {
      codigo,
      mensaje: 'Ese enlace ya ha caducado. Pide uno nuevo desde la pantalla de acceso.',
      reintentable: false,
    };
  }
  return {
    codigo,
    mensaje: 'No hemos podido completar la entrada. Inténtalo de nuevo o usa tu email.',
    reintentable: true,
  };
}
