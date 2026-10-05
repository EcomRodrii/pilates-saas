import { NextResponse } from 'next/server';

// La respuesta de una ruta del Centro de Control cuando su transición no se
// aplicó (`dbTransicionarRecomendacion`). La pantalla ya no quita la tarjeta
// antes de tiempo: enseña este error tal cual, así que tiene que poder leerlo la
// propietaria — no «La recomendación no estaba en estado PENDIENTE» — y no puede
// ser el mismo para «otra vía ya la resolvió» que para «no se ha guardado».
export const YA_NO_PENDIENTE = 'Ya no estaba pendiente: se ha resuelto por otra vía. Recarga la página para ver cómo ha quedado.';

export function transicionFallida(r: { noEstaba?: boolean }): NextResponse {
  return r.noEstaba
    ? NextResponse.json({ error: YA_NO_PENDIENTE }, { status: 409 })
    : NextResponse.json({ error: 'No se ha podido guardar. Vuelve a intentarlo.' }, { status: 500 });
}

/**
 * Leer la recomendación falló (`dbGetRecomendacion` devuelve `undefined`): un
 * 500 para volver a intentarlo, no el 404 de «no existe» que se respondía antes.
 */
export function lecturaFallida(): NextResponse {
  return NextResponse.json({ error: 'No se ha podido leer. Vuelve a intentarlo.' }, { status: 500 });
}
