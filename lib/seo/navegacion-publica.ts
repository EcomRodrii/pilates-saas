// ─────────────────────────────────────────────────────────────────────────────
// La navegación de TODA la web pública (home, funcionalidades, soluciones,
// comparativas, recursos, precios, glosario, sobre, seguridad, ayuda y legales):
// la isla de arriba (components/web/IslaWeb.tsx) y el pie
// (components/web/PieWeb.tsx), en un solo sitio.
//
// Hasta el 19-oct-2026 había tres: la isla y el pie de la home, la barra y el pie
// de las interiores, y una cabecera propia en las legales. Una persona que
// entraba desde Google a una comparativa veía otra web.
//
// Hasta el 7-oct-2026 cada página pasaba a mano tres o cuatro enlaces a su pie y
// la barra superior solo tenía «volver». El rastreo de ese día lo dejó a la
// vista: /sobre-tentare no la enlazaba NINGUNA página, /soluciones una sola, y
// quien entraba desde Google en una comparativa no tenía cómo llegar a las
// soluciones por tipo de estudio sin volver a la home. Un pie con todo el árbol
// deja cada página de dinero a un clic de cualquier página del sitio.
//
// Cada `href` es un path del registro (lib/seo/paginas.ts): el test
// `navegacion-publica.test.ts` falla si alguno deja de existir, así que ni el
// menú ni el pie pueden enlazar a una página borrada o que aún no existe.
//
// Sin alias `@/` ni extensiones implícitas: lo lee `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface EnlacePublico {
  href: string;
  label: string;
}

export interface GrupoMenu {
  titulo: string;
  enlaces: EnlacePublico[];
}

/**
 * Los destinos de primer nivel del menú. Es lo que declara el JSON-LD
 * `SiteNavigationElement` (components/OrganizationStructuredData.tsx, vía
 * `NAV_LINKS`): los hubs a los que lleva la isla, sin anclas de la home.
 */
export const MENU_PUBLICO: EnlacePublico[] = [
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/soluciones', label: 'Soluciones' },
  { href: '/precios', label: 'Precios' },
  { href: '/comparativa', label: 'Comparativa' },
  { href: '/recursos', label: 'Recursos' },
];

/** Una entrada de los paneles con su línea de resumen (la del registro, tal cual: lo comprueba el test). */
export interface EnlaceConResumen extends EnlacePublico {
  resumen: string;
}

/**
 * «Producto»: las 17 funcionalidades, por el RESULTADO que busca la dueña (las
 * cinco áreas de la estrategia de la fase 1, §5), no por orden alfabético. Cada
 * una sale una sola vez (lo comprueba el test).
 *
 * ⚠️ Sin el `resumen` del registro a propósito: el de sustituciones dice «La
 * baja se cubre sola», y el modo por defecto pide tu visto bueno (fase 1, §6).
 * En el menú, solo el nombre.
 *
 * Los textos van aquí escritos y no leídos del registro porque la isla es un
 * componente de cliente: importar lib/seo/paginas.ts metería los 24 artículos
 * en el JavaScript de cada página.
 */
export const MENU_PRODUCTO: GrupoMenu[] = [
  {
    titulo: 'Reservas y horario',
    enlaces: [
      { href: '/funcionalidades/reservas-online', label: 'Reservas online' },
      { href: '/funcionalidades/calendario-y-salas', label: 'Calendario y salas' },
      { href: '/funcionalidades/clases-recurrentes', label: 'Clases recurrentes' },
      { href: '/funcionalidades/lista-de-espera', label: 'Lista de espera' },
      { href: '/funcionalidades/plazas-fijas', label: 'Plazas fijas' },
      { href: '/funcionalidades/cancelaciones-y-politicas', label: 'Cancelaciones y no-shows' },
    ],
  },
  {
    titulo: 'Cobros, bonos y cuotas',
    enlaces: [
      { href: '/funcionalidades/bonos-y-membresias', label: 'Bonos y cuotas' },
      { href: '/funcionalidades/cobros-recurrentes', label: 'Cobros automáticos' },
      { href: '/funcionalidades/facturacion', label: 'Facturación' },
    ],
  },
  {
    titulo: 'Alumnas y app',
    enlaces: [
      { href: '/funcionalidades/app-para-alumnas', label: 'App con tu marca' },
      { href: '/funcionalidades/ficha-de-clienta', label: 'Ficha de alumna' },
      { href: '/funcionalidades/control-de-asistencia', label: 'Control de asistencia' },
      { href: '/funcionalidades/automatizaciones-y-avisos', label: 'Automatizaciones y avisos' },
    ],
  },
  {
    titulo: 'Equipo y sustituciones',
    enlaces: [
      { href: '/funcionalidades/gestion-de-instructoras', label: 'Gestión de instructoras' },
      { href: '/funcionalidades/sustituciones', label: 'Sustituciones' },
    ],
  },
  {
    titulo: 'Informes y control',
    enlaces: [
      { href: '/funcionalidades/informes-y-rentabilidad', label: 'Informes y rentabilidad' },
      { href: '/funcionalidades/multi-centro', label: 'Varias sedes' },
    ],
  },
];

/**
 * «Soluciones»: las páginas por tipo de estudio, «Abrir un estudio» (fase 2.3)
 * y «Varias sedes», que se queda como funcionalidad a propósito: una solución
 * casi igual competiría con /funcionalidades/multi-centro en el buscador.
 */
export const MENU_SOLUCIONES: EnlaceConResumen[] = [
  { href: '/soluciones/programa-de-gestion-para-estudio-de-pilates', label: 'Programa de gestión', resumen: 'El programa que lleva el estudio entero: reservas, bonos, cobros, facturas y equipo.' },
  { href: '/soluciones/estudio-de-pilates-reformer', label: 'Estudio de Pilates reformer', resumen: 'Cada reformer, una plaza: aforo por sala, plazas fijas y lista de espera.' },
  { href: '/soluciones/estudio-de-yoga', label: 'Estudio de yoga', resumen: 'Reservas, bonos y sustituciones para tu estudio de yoga.' },
  { href: '/soluciones/abrir-un-estudio', label: 'Abrir un estudio', resumen: 'Tu horario, tus reservas y tu app, listos antes de la primera clase.' },
  { href: '/funcionalidades/multi-centro', label: 'Varias sedes', resumen: 'Dos o más centros, con datos separados y un solo acceso.' },
  { href: '/soluciones/cambiar-de-software', label: 'Cambiar de software', resumen: 'Cambiarte sin perder tus datos.' },
];

/** «Recursos»: el blog, las comparativas, el glosario y la ayuda. Sin calculadoras: no tienen ruta propia. */
export const MENU_RECURSOS: EnlaceConResumen[] = [
  { href: '/recursos', label: 'Blog', resumen: 'Guías prácticas de gestión, sin humo.' },
  { href: '/comparativa', label: 'Comparativas', resumen: 'Tentare frente a las trece plataformas con las que más se compara.' },
  { href: '/glosario', label: 'Glosario', resumen: 'Qué significa cada término del sector, sin marketing.' },
  { href: '/ayuda', label: 'Centro de Ayuda', resumen: 'Documentación oficial de Tentare, paso a paso.' },
];

/**
 * Pie de toda la web pública. Columnas: qué hace, para quién, para aprender y
 * comparar, quién hay detrás, y lo legal. El contacto (correo y WhatsApp) y las
 * redes los añade el componente: no son páginas del registro.
 */
export const PIE_PUBLICO: GrupoMenu[] = [
  {
    titulo: 'Producto',
    enlaces: [
      { href: '/funcionalidades/reservas-online', label: 'Reservas online' },
      { href: '/funcionalidades/calendario-y-salas', label: 'Calendario y salas' },
      { href: '/funcionalidades/lista-de-espera', label: 'Lista de espera' },
      { href: '/funcionalidades/bonos-y-membresias', label: 'Bonos y cuotas' },
      { href: '/funcionalidades/cobros-recurrentes', label: 'Cobros automáticos' },
      { href: '/funcionalidades/app-para-alumnas', label: 'App con tu marca' },
      { href: '/funcionalidades/gestion-de-instructoras', label: 'Instructoras' },
      { href: '/funcionalidades/sustituciones', label: 'Sustituciones' },
      { href: '/funcionalidades/informes-y-rentabilidad', label: 'Informes' },
      { href: '/funcionalidades', label: 'Todas las funcionalidades' },
      { href: '/precios', label: 'Precios' },
    ],
  },
  {
    titulo: 'Soluciones',
    enlaces: [
      { href: '/soluciones/programa-de-gestion-para-estudio-de-pilates', label: 'Programa de gestión' },
      { href: '/soluciones/estudio-de-pilates-reformer', label: 'Pilates reformer' },
      { href: '/soluciones/estudio-de-yoga', label: 'Estudio de yoga' },
      { href: '/soluciones/abrir-un-estudio', label: 'Abrir un estudio' },
      { href: '/funcionalidades/multi-centro', label: 'Varias sedes' },
      { href: '/soluciones/cambiar-de-software', label: 'Cambiar de software' },
      { href: '/soluciones', label: 'Todas las soluciones' },
    ],
  },
  {
    titulo: 'Recursos',
    enlaces: [
      { href: '/recursos', label: 'Guías para tu estudio' },
      // Las dos guías y la comparativa de Mindbody que ya enlazaban los pies
      // anteriores (el de las interiores y el de la home): quitarlas del pie de
      // TODAS las páginas les restaría enlaces internos de golpe.
      { href: '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates', label: 'Cuánto cuesta abrir un estudio' },
      { href: '/recursos/rentabilidad-estudio-de-pilates', label: 'Rentabilidad de un estudio' },
      { href: '/recursos/checklist-elegir-software-estudio', label: 'Cómo elegir software' },
      { href: '/recursos/mejor-software-para-estudios-de-pilates', label: 'Mejor software de Pilates' },
      { href: '/comparativa', label: 'Comparativas' },
      { href: '/comparativa/tentare-vs-bsport', label: 'Alternativa a bsport' },
      { href: '/comparativa/tentare-vs-eversports', label: 'Alternativa a Eversports' },
      { href: '/comparativa/tentare-vs-momence', label: 'Alternativa a Momence' },
      { href: '/comparativa/tentare-vs-mindbody', label: 'Alternativa a Mindbody' },
      { href: '/comparativa/tentare-vs-timp', label: 'Alternativa a TIMP' },
      { href: '/glosario', label: 'Glosario' },
      { href: '/ayuda', label: 'Centro de Ayuda' },
    ],
  },
  {
    titulo: 'Empresa',
    enlaces: [
      { href: '/sobre-tentare', label: 'Sobre Tentare' },
      { href: '/seguridad', label: 'Seguridad y datos' },
      { href: '/soporte', label: 'Soporte' },
    ],
  },
  {
    // TODOS los documentos legales: los que llevaban el pie de la home, el de
    // las interiores y el layout legal. Ninguno se queda fuera.
    titulo: 'Legal',
    enlaces: [
      { href: '/legal', label: 'Aviso legal' },
      { href: '/privacidad', label: 'Privacidad' },
      { href: '/terminos', label: 'Términos' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
];
