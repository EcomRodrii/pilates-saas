// Dónde vive la sesión de la alumna: «Recordar inicio de sesión».
//
// ⚠️ EL PUNTO DE PARTIDA IMPORTA. `supabasePortal` se crea con
// `persistSession: true` y SIN opción `storage`, y auth-js en ese caso usa
// `globalThis.localStorage` (comprobado en su fuente:
// `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`). Es decir: la
// sesión YA sobrevivía a cerrar el navegador, siempre, sin que nadie lo
// eligiera.
//
// Por eso un checkbox que «active recordar» sería un control muerto: no habría
// nada que activar. Lo que sí decide algo es lo contrario —si la sesión debe
// MORIR al cerrar la ventana— y eso es lo que hace este adaptador:
//
//   marcado (por defecto) → localStorage   · sobrevive a cerrar el navegador
//   sin marcar            → sessionStorage · muere con la pestaña
//
// Que es lo que una alumna espera al desmarcarlo en el móvil de una amiga o en
// la tablet del mostrador del estudio.
//
// ⚠️ NUNCA se guarda la contraseña. Lo que se mueve de un sitio a otro es el
// token que ya emite Supabase; la preferencia es un `'0'`/`'1'` suelto.
//
// ⚠️ Por defecto RECUERDA, así que el comportamiento no cambia para nadie que
// no toque el checkbox — y `supabasePortal` lo comparten 14 ficheros
// (`/reservar`, el widget embebible, la mensajería). Este cambio es invisible
// para todos ellos.

/** Dónde se guarda la preferencia. No es un credencial: es un interruptor. */
const CLAVE_PREFERENCIA = 'sb-portal-recordar';

function hayNavegador(): boolean {
  return typeof window !== 'undefined';
}

/** `true` salvo que la alumna haya desmarcado explícitamente. */
export function recuerdaSesion(): boolean {
  if (!hayNavegador()) return true;
  try {
    return window.localStorage.getItem(CLAVE_PREFERENCIA) !== '0';
  } catch {
    // Almacenamiento bloqueado: se comporta como antes.
    return true;
  }
}

function almacenActivo(): Storage | null {
  if (!hayNavegador()) return null;
  try {
    return recuerdaSesion() ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function elOtro(): Storage | null {
  if (!hayNavegador()) return null;
  try {
    return recuerdaSesion() ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Adaptador que auth-js usará como `storage`.
 *
 * Al LEER mira también el otro almacén: si la preferencia cambió después de
 * iniciar sesión, la sesión sigue estando donde se escribió y no queremos
 * echar a nadie por un cambio de interruptor.
 */
export const almacenSesionPortal = {
  getItem(clave: string): string | null {
    try {
      return almacenActivo()?.getItem(clave) ?? elOtro()?.getItem(clave) ?? null;
    } catch {
      return null;
    }
  },
  setItem(clave: string, valor: string): void {
    try {
      almacenActivo()?.setItem(clave, valor);
      // Que no queden dos copias vivas: la de fuera se borra.
      elOtro()?.removeItem(clave);
    } catch {
      // Modo privado o cuota llena: la sesión vivirá solo en memoria, que es
      // el mismo grado de degradación que tenía antes este cliente.
    }
  },
  removeItem(clave: string): void {
    // Cerrar sesión borra de LOS DOS: dejar una copia en el almacén inactivo
    // resucitaría la sesión al volver a marcar el checkbox.
    try { window.localStorage.removeItem(clave); } catch { /* da igual */ }
    try { window.sessionStorage.removeItem(clave); } catch { /* da igual */ }
  },
};

/**
 * Cambia la preferencia y MUEVE la sesión en curso al almacén que toca.
 *
 * Sin la mudanza, desmarcar «recordar» dejaría la sesión donde estaba —en
 * `localStorage`— y seguiría sobreviviendo al cierre del navegador: el
 * interruptor diría una cosa y el navegador haría otra.
 */
export function fijarRecordarSesion(recordar: boolean, storageKey = 'sb-portal-auth'): void {
  if (!hayNavegador()) return;
  try {
    const antes = window.localStorage.getItem(storageKey) ?? window.sessionStorage.getItem(storageKey);
    window.localStorage.setItem(CLAVE_PREFERENCIA, recordar ? '1' : '0');
    if (antes === null) return;
    const destino = recordar ? window.localStorage : window.sessionStorage;
    const origen = recordar ? window.sessionStorage : window.localStorage;
    destino.setItem(storageKey, antes);
    origen.removeItem(storageKey);
  } catch {
    // Si no se puede escribir la preferencia, se queda el valor por defecto
    // (recordar), que es el comportamiento que este cliente ya tenía.
  }
}
