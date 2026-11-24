// Tentare Edición · Invierno 26 — la primera edición (23-nov-2026, decisión del fundador: «que sea el mismo diseño y la misma
// animación» que las Editions de Shopify). Una edición es una FOTO CERRADA de lo que se publicó entre dos fechas, no un feed:
// por eso las cifras son constantes y no una consulta (la de «250» es el recuento de `changelog_cambios` publicados desde la 1.0).
//
// ⚠️ NADA de lo que sigue es promesa de venta ni se inventa: cada tarjeta resume un cambio que consta en `changelog_versiones`
// (la versión de la que sale va en `version`). Si una tarjeta deja de ser cierta se corrige aquí; si se añade una, tiene que
// salir de una versión publicada. El texto comercial de las páginas de marca no se toca desde aquí.

export const EDICION = {
  slug: 'invierno-26',
  nombre: 'Tentare Edición',
  temporada: 'Invierno 26',
  etiquetaMono: 'Edición 01',
  ruta: '/edicion/invierno-26',
  /** Primera versión y fecha cubiertas por la edición. */
  desde: { version: '1.00', fecha: '2026-09-11' },
  /** Cambios publicados en `changelog_cambios` entre la 1.00 y la 1.12 (medido el 23-nov-2026: 256, de 10 versiones). */
  actualizaciones: 250,
  versiones: 10,
} as const;

export const TEXTO_PILDORA = `MÁS DE ${EDICION.actualizaciones} ACTUALIZACIONES`;

export interface TarjetaEdicion {
  titulo: string;
  texto: string;
  /** Versión del changelog de la que sale (ancla en /ayuda/novedades). */
  version: string;
  icono: 'app' | 'calendario' | 'cobros' | 'web' | 'seguridad' | 'tenti' | 'equipo' | 'informes';
  /** La escena de producto que ilustra la tarjeta (`components/edicion/escenas.tsx`): un trozo de pantalla dibujado con datos de MUESTRA. */
  escena: 'telefono' | 'semana' | 'recibos' | 'navegador' | 'bandeja' | 'barras' | 'codigo' | 'chat' | 'regalo' | 'qr';
  /** Dos líneas de texto de muestra para la escena (nunca datos de un estudio real). */
  muestra: [string, string];
}

export interface CapituloEdicion {
  id: string;
  /** Una palabra, como los capítulos de Shopify (Agentic, Sidekick, Online…). */
  nombre: string;
  titular: string;
  tarjetas: TarjetaEdicion[];
}

export const CAPITULOS: CapituloEdicion[] = [
  {
    id: 'app',
    nombre: 'App',
    titular: 'La app de tus alumnas, como una app de verdad',
    tarjetas: [
      { titulo: 'Una app que se siente nativa', texto: 'Las pestañas cambian al instante, se tira hacia abajo para actualizar y vibra al tocar.', version: '1.11', icono: 'app', escena: 'telefono', muestra: ['Próxima clase', 'Reformer · 19:00'] },
      { titulo: 'Pagar y reservar en la misma hoja', texto: 'Tu alumna reserva una clase de prueba, guarda o cambia su tarjeta y ve sus recibos sin salir de la app.', version: '1.11', icono: 'cobros', escena: 'recibos', muestra: ['Reservar y pagar', 'Bono 10 clases · 120 €'] },
      { titulo: 'Un Inicio que cambia según el momento', texto: '«Mis clases» se ve como una agenda y «Bonos» enseña un anillo con lo que le queda.', version: '1.11', icono: 'app', escena: 'telefono', muestra: ['Mis bonos', '7 de 10 clases'] },
      { titulo: 'Clases fijas que piden ellas solas', texto: 'En su app aparecen las clases que se repiten y tienen sitio, con su ficha y un toque para pedirlas.', version: '1.08', icono: 'calendario', escena: 'semana', muestra: ['Clase fija', 'Cada lunes · 10:00'] },
      { titulo: 'Valorar, invitar y entrar con un QR', texto: 'Valora la clase al terminar, invita a una amiga y entra al estudio con su código QR fijo.', version: '1.10', icono: 'app', escena: 'qr', muestra: ['Tu código de entrada', 'Valora tu clase'] },
      { titulo: 'Comunidad con normas y moderación', texto: 'Normas visibles, denunciar y bloquear para tus alumnas; tú moderas desde el panel.', version: '1.11', icono: 'equipo', escena: 'chat', muestra: ['Normas de la comunidad', 'Denunciar · Bloquear'] },
    ],
  },
  {
    id: 'calendario',
    nombre: 'Calendario',
    titular: 'Un calendario que se lee entero',
    tarjetas: [
      { titulo: 'El calendario, rehecho', texto: 'La semana por franjas y el día con la ficha de la clase al lado, con todo lo importante a la vista.', version: '1.11', icono: 'calendario', escena: 'semana', muestra: ['Semana 48', 'Reformer · Suelo · Yoga'] },
      { titulo: 'Borrar varias clases de golpe', texto: 'Marcas las que quieras y Tentare te cuenta cuántas alumnas se quedan sin plaza antes de confirmar.', version: '1.11', icono: 'calendario', escena: 'bandeja', muestra: ['3 clases marcadas', '5 alumnas sin plaza'] },
      { titulo: 'Las horas de cierre, marcadas', texto: 'Las horas en que tu estudio está cerrado ese día salen como «Cerrado».', version: '1.11', icono: 'calendario', escena: 'semana', muestra: ['Cerrado', '8:00 – 9:00'] },
      { titulo: 'Clase fija: un solo concepto', texto: 'Un interruptor en la ficha de la clase, y «Crear clase» te pregunta primero qué quieres crear.', version: '1.09', icono: 'calendario', escena: 'semana', muestra: ['Clase fija', 'Interruptor en la ficha'] },
      { titulo: 'Ves qué va a pasar antes de tocar una serie', texto: 'Al cambiar «esta y las siguientes», Tentare te enseña qué cambia y a cuántas alumnas se avisará.', version: '1.09', icono: 'calendario', escena: 'bandeja', muestra: ['Esta y las siguientes', 'Se avisará a 6 alumnas'] },
      { titulo: 'Tus clases que se repiten se renuevan solas', texto: 'Las series se renuevan sin que tengas que volver a crearlas, y las plazas fijas se pausan sin perderlas.', version: '1.03', icono: 'calendario', escena: 'semana', muestra: ['Serie renovada', 'Hasta el 31 de enero'] },
    ],
  },
  {
    id: 'cobros',
    nombre: 'Cobros',
    titular: 'Cobros y facturas que se explican solos',
    tarjetas: [
      { titulo: 'Veri*Factu directo a la AEAT', texto: 'Sin intermediario. La activas tú por estudio y viene apagada por defecto.', version: '1.10', icono: 'cobros', escena: 'recibos', muestra: ['Factura enviada', 'Registro Veri*Factu'] },
      { titulo: 'Tarjeta regalo con saldo en euros', texto: 'La activas en Paquetes y tus clientas —o cualquiera, desde tu página de reservas— la compran para regalar.', version: '1.11', icono: 'cobros', escena: 'regalo', muestra: ['Tarjeta regalo', '50,00 €'] },
      { titulo: 'La parte proporcional del primer mes', texto: 'Una alumna que se apunta a mitad de mes paga solo los días que quedan, y el día 1 la cuota entera.', version: '1.12', icono: 'cobros', escena: 'recibos', muestra: ['Primer mes', 'Cuota parcial · 38 €'] },
      { titulo: 'Quién ha tocado el dinero', texto: 'Cobros → «Cambios del equipo»: quién cambió un recibo, revirtió una penalización o devolvió un cobro.', version: '1.10', icono: 'equipo', escena: 'bandeja', muestra: ['Cambios del equipo', 'Recibo corregido · Ana'] },
      { titulo: 'Un cobro duplicado sube a tu bandeja', texto: 'Un recibo cobrado dos veces por error llega a «Decidir» con un botón «Ya lo he devuelto».', version: '1.10', icono: 'cobros', escena: 'bandeja', muestra: ['Cobrado dos veces', 'Ya lo he devuelto'] },
      { titulo: 'Facturas solas, si tú quieres', texto: 'Decides en Configuración si las facturas salen solas al cobrar.', version: '1.11', icono: 'cobros', escena: 'recibos', muestra: ['Facturación', 'Salen solas al cobrar'] },
    ],
  },
  {
    id: 'web',
    nombre: 'Tu web',
    titular: 'Tu estudio en tu web, con tu estilo',
    tarjetas: [
      { titulo: 'Un constructor de widgets en tres pasos', texto: 'Eliges qué enseñar (horario, precios, packs), cómo se ve y dónde lo pegas. Tentare te da el código.', version: '1.10', icono: 'web', escena: 'navegador', muestra: ['Elige · Diseña · Pega', 'Horario y precios'] },
      { titulo: 'Un solo estilo para todos tus widgets', texto: 'Lo cambias una vez y se aplica a todos, con «Aplicar en mi web» para que llegue solo.', version: '1.10', icono: 'web', escena: 'navegador', muestra: ['Estilo compartido', 'Aplicar en mi web'] },
      { titulo: 'Tu página de reservas, rediseñada', texto: 'Con el estilo, los colores y la tipografía de la app de tu alumna: portada y ficha de cada clase.', version: '1.10', icono: 'web', escena: 'navegador', muestra: ['tuestudio.com/reservar', 'Reformer · Hoy'] },
      { titulo: 'Clase de prueba para quien aún no es alumna', texto: 'Gratis o de pago, en tu página de reservas y en un widget para tu web.', version: '1.10', icono: 'web', escena: 'navegador', muestra: ['Clase de prueba', 'Gratis · Reservar'] },
      { titulo: 'El formulario de contacto vive en Tentare', texto: 'Cada consulta llega a Clientas como una tarjeta, con responder, llamar o dar de alta.', version: '1.10', icono: 'web', escena: 'bandeja', muestra: ['Nueva consulta', 'Responder · Llamar'] },
      { titulo: 'La API pública, para todos los estudios', texto: 'Las claves de API están disponibles en todos los estudios, no solo en algunos planes.', version: '1.12', icono: 'web', escena: 'codigo', muestra: ['Clave de API', 'Todos los estudios'] },
    ],
  },
  {
    id: 'equipo',
    nombre: 'Equipo',
    titular: 'Tu equipo trabaja desde la app',
    tarjetas: [
      { titulo: 'Tus instructoras ya trabajan en la app del estudio', texto: 'Agenda, pasar lista y sus clases desde el móvil, sin entrar al panel.', version: '1.02', icono: 'equipo', escena: 'telefono', muestra: ['Mi agenda', 'Hoy · 4 clases'] },
      { titulo: 'Empiezan sus clases desde la app', texto: 'Y la liquidación sabe cuáles dieron de verdad.', version: '1.05', icono: 'equipo', escena: 'telefono', muestra: ['Pasar lista', 'Reformer · 19:00'] },
      { titulo: 'Una baja ya no cancela sus clases en silencio', texto: 'Pasan a «Decidir» y eliges si se las das a otra instructora o las dejas.', version: '1.10', icono: 'equipo', escena: 'bandeja', muestra: ['Clases sin instructora', 'Decidir'] },
      { titulo: 'Una bandeja para lo que espera tu visto bueno', texto: 'Todo lo que necesita tu decisión, en un solo sitio y con su número.', version: '1.02', icono: 'informes', escena: 'bandeja', muestra: ['Por decidir', '3 pendientes'] },
      { titulo: 'Informes con un titular', texto: 'Arriba, los tres hechos que más importan; debajo, Dinero, Clases y Clientas.', version: '1.11', icono: 'informes', escena: 'barras', muestra: ['Esta semana', '82 % de ocupación'] },
      { titulo: 'Abrir un estudio deja de ser a ciegas', texto: '«¿Lista para abrir?» comprueba el estado real de lo tuyo y te dice qué falta.', version: '1.08', icono: 'informes', escena: 'bandeja', muestra: ['¿Lista para abrir?', '2 cosas por revisar'] },
    ],
  },
  {
    id: 'seguridad',
    nombre: 'Seguridad',
    titular: 'Tus datos y los de tus alumnas, bajo llave',
    tarjetas: [
      { titulo: 'Verificación en dos pasos', texto: 'Un segundo paso con un código que te llega por correo para entrar al panel. Es opcional.', version: '1.11', icono: 'seguridad', escena: 'codigo', muestra: ['Código de verificación', 'Te llega por correo'] },
      { titulo: 'Eliminar a alguien del equipo, como pide el RGPD', texto: 'Tentare te dice exactamente qué se borra y qué se conserva anonimizado.', version: '1.10', icono: 'seguridad', escena: 'bandeja', muestra: ['Eliminar del equipo', 'Qué se borra y qué no'] },
      { titulo: 'Conoce a Tenti', texto: 'La mascota de Tentare te acompaña en los momentos que importan.', version: '1.11', icono: 'tenti', escena: 'chat', muestra: ['Tenti', 'Aquí para lo que necesites'] },
    ],
  },
];

export function anclaVersion(version: string) {
  return `/ayuda/novedades#v${version.replace('.', '-')}`;
}
