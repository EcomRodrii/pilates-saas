import { NextResponse } from 'next/server';

// Retirada el 21-oct-2026. El asistente de bienvenida ofrecía que la llamaran y
// que le configuraran el estudio, y nadie llama a los estudios ni los configura
// por ellos: las dos opciones se quitaron y el asistente ya no llama aquí.
//
// Se queda contestando 410 (y no un 404) por una pestaña abierta con el
// asistente de antes: le dice que recargue en vez de un error sin explicación.
// Las solicitudes que ya se hicieron siguen en `solicitudes_llamada` y el
// fundador las atiende en /interno/llamadas. Sin efectos: no guarda ni avisa.
export function POST() {
  return NextResponse.json(
    { error: 'Esta opción ya no existe. Recarga la página para seguir.' },
    { status: 410 },
  );
}
