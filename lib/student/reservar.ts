'use client';

// La escritura de reservas: `confirmarReserva` del contrato del paquete,
// conectada al backend real.
//
// El paquete la declara como `confirmarReserva(claseId, outcome?)`, donde
// `outcome` es una ayuda de demo para forzar el resultado. Aquí NO existe: el
// desenlace lo decide el servidor y punto. La firma que queda es
// `confirmarReserva(slug, claseId, opciones)`, porque necesita el estudio (de
// la URL) y opcionalmente el sitio elegido.
//
// ⚠️ SERVER AUTHORITATIVE, en el sentido literal:
//   · La UI nunca decide si hay plaza. El aforo que pinta es orientativo — no
//     resta las máquinas averiadas, que no salen en ningún payload público— así
//     que el servidor puede rechazar una clase que la pantalla mostraba libre.
//     Eso NO es un fallo: es el estado `full`, y el diseño ya lo contempla.
//   · Nada se pinta como confirmado hasta que la respuesta lo dice. Ni con
//     optimismo, ni «mientras carga».
//   · El `socioId` no se manda: lo deriva el servidor del JWT. Mandarlo sería
//     dejar que el cliente diga de quién es la reserva.

import { invalidarCatalogo } from '@/lib/student/catalogo';
import { desenlaceDeRespuesta, type DesenlaceReserva, type RespuestaReserva } from '@/lib/student/reserva-codigos';
import { portalAuthHeader } from '@/lib/api-client';

export interface OpcionesReserva {
  /** El sitio (reformer) que ha elegido, si la sala los tiene. */
  spotId?: string | null;
  /** `false` cuando el navegador ya sabe que no hay red. */
  online?: boolean;
}

/**
 * Crea la reserva y devuelve el estado de la máquina del diseño.
 *
 * Nunca lanza: cualquier fallo se traduce a un estado que la pantalla sabe
 * pintar. Una excepción escapándose de aquí dejaría el sheet en `submitting`
 * para siempre, que es la peor pantalla posible — la alumna no sabe si tiene
 * plaza ni si le han cobrado.
 */
export async function confirmarReserva(
  slug: string, claseId: string, studioId: string, opts: OpcionesReserva = {},
): Promise<DesenlaceReserva> {
  if (opts.online === false) return { state: 'offline' };

  let respuesta: RespuestaReserva | null = null;
  try {
    // ⚠️ `portalAuthHeader()` es ASÍNCRONA: lee la sesión de gotrue. Sin el
    // `await`, el spread mete las claves de una Promise (ninguna) y la
    // petición sale SIN Authorization — o sea, toda reserva iría sin
    // autenticar y el servidor devolvería 401. Lo cazó el typecheck.
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/reserva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        accion: 'crear',
        studioId,
        sesionId: claseId,
        spotId: opts.spotId ?? null,
      }),
    });

    // 401 es «tu sesión ha caducado», y tiene copy propio en el diseño: dice
    // explícitamente que no se ha hecho ningún cargo. Colapsarlo en `error`
    // dejaría a la alumna sin saber que basta con volver a entrar.
    if (res.status === 401) return { state: 'session-expired' };

    respuesta = (await res.json().catch(() => null)) as RespuestaReserva | null;
  } catch {
    // Falló la red DURANTE la petición. No se sabe si el servidor llegó a
    // crearla, así que no se pinta ni éxito ni «no se ha hecho nada»: el copy
    // de `offline` es el honesto, e invita a reintentar.
    return { state: 'offline' };
  }

  const desenlace = desenlaceDeRespuesta(respuesta);

  // Si algo cambió de verdad, el catálogo en memoria ya no vale: la clase tiene
  // una plaza menos y la alumna una reserva más. Sin esto, volver al horario
  // enseña el aforo de antes y su propia reserva no aparece.
  if (desenlace.state === 'confirmed' || desenlace.state === 'waitlisted') {
    invalidarCatalogo(slug);
  }

  return desenlace;
}
