// Lo que «Apariencia de tu app» le cuenta a la dueña sobre DÓNDE más llega lo
// que elige. Vive aquí, y no escrito en el JSX, porque tiene que decir la verdad
// de `lib/reservar/tema-app.ts` y un test lo cruza con su comportamiento
// (./textos-apariencia.test.ts): si algún día el botón o las esquinas llegan a
// /reservar, el test falla hasta que el texto lo diga.
//
// ⚠️ Lo que se decía antes y no era verdad (auditoría del 16-oct-2026):
//   · «Color secundario (solo tu panel y tu página de reservas)»: /reservar no
//     lo lee; sí los correos a tus alumnas (lib/emails/plantillas-server.ts).
//   · «También se aplica a tu página de reservas y al widget»: llegan el estilo,
//     la tipografía y tu color, pero no el botón principal, las esquinas ni el
//     tamaño de los titulares (de la pareja solo llega el peso).

/** Debajo del título del editor: qué toma de aquí la página de reservas (y el widget, que es esa página). */
export const TEXTO_RESERVAS_Y_WIDGET =
  'Tu página de reservas y el widget de tu web toman de aquí el estilo, la tipografía y tu color (salvo los colores o la letra que le pongas al widget). El botón principal, las esquinas y el tamaño de los títulos solo cambian en tu app.';

/** El desplegable del color secundario. */
export const TEXTO_SECUNDARIO = 'Color secundario (solo tu panel y los correos a tus alumnas)';
