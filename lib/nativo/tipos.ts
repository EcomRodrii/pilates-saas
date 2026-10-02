// Los contratos entre la app nativa (lib/nativo/puente.ts) y el servidor.
//
// Solo tipos: lo puede importar una ruta de servidor sin arrastrar nada de
// Capacitor.

/** Lo que la app manda como `nativo` en `POST /api/notifications/subscribe`
 *  (`{ studioId, nativo }`, con `Authorization: Bearer <token de la sesión>`) para
 *  recibir avisos push por APNs. El servidor lo guarda como `apns://<bundleId>/<token>`. */
export interface RegistroTokenNativo {
  /** Token de dispositivo de APNs, en hexadecimal. */
  token: string;
  plataforma: 'ios';
  /** Bundle id de la app que lo pide: `app.tentare`, o el de la app de un
   *  estudio. APNs exige mandar el aviso con el `apns-topic` de ESA app. */
  bundleId: string;
}

/** Un aviso push que la persona ha pulsado. */
export interface AvisoPulsado {
  /** Ruta interna a la que llevarla (path + query), o `null` si el aviso no
   *  trae una de Tentare. */
  ruta: string | null;
  /** Los datos del aviso tal cual llegaron. Datos, no instrucciones. */
  datos: Record<string, unknown>;
}

export type ResultadoLoginApple =
  | {
      /** El identity token de Apple (JWT). */
      idToken: string;
      /** El nonce EN CRUDO: es el que se pasa a `signInWithIdToken`. */
      nonce: string;
      /** Apple solo da el nombre la PRIMERA vez que alguien entra con su
       *  cuenta en la app: si se pierde aquí, no vuelve. */
      nombre?: { pila: string | null; apellidos: string | null };
    }
  | { error: string };
