// El mensaje destacado del estudio, arriba del inicio de la app de la alumna
// (decisión 11A de «Mi app y mi web» v2, 15-oct-2026).
//
// Lo escribe la propietaria en «Contenido de tu app» (`contenido_portal`, hasta
// 280 caracteres por un CHECK). Llevaba en el payload público desde siempre y
// ninguna pantalla lo pintaba: el editor decía «se muestra en Inicio» y no era
// verdad (#2744 cambió ese texto).
//
// Puro y sin React: lo usan el servidor (qué viaja en el payload) y el panel
// (qué enseña la vista previa), que tienen que decir lo mismo.

/** Lo que pinta la app: el texto sin espacios de sobra, o `null` = no hay franja. */
export function mensajeParaLaApp(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim();
  return t ? t : null;
}
