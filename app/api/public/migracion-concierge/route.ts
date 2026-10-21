import { NextResponse } from 'next/server';

// Retirada el 21-oct-2026. Era el formulario «Te la hacemos nosotros» de
// /soluciones/cambiar-de-software: prometía que Tentare hacía la migración por
// la propietaria, y nadie la hace. El formulario se quitó de la página y la
// única vía que queda es la real, el importador del panel.
//
// Se queda contestando 410 (y no un 404) por una pestaña abierta con la página
// de antes. Sin efectos: no guarda ningún lead ni avisa a nadie. Los leads que
// ya entraron siguen en `plataforma_lead` (/interno/crecimiento).
export function POST() {
  return NextResponse.json(
    { error: 'Esta opción ya no existe. Puedes traer tus datos tú misma desde el panel, con el importador.' },
    { status: 410 },
  );
}
