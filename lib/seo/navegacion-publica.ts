// ─────────────────────────────────────────────────────────────────────────────
// Menú y pie de las páginas públicas interiores (funcionalidades, soluciones,
// comparativas, recursos, ayuda…): la arquitectura del sitio, en un solo sitio.
//
// Hasta el 7-oct-2026 cada página pasaba a mano tres o cuatro enlaces a su pie y
// la barra superior solo tenía «volver». El rastreo de ese día lo dejó a la
// vista: /sobre-tentare no la enlazaba NINGUNA página, /soluciones una sola, y
// quien entraba desde Google en una comparativa no tenía cómo llegar a las
// soluciones por tipo de estudio sin volver a la home. Un pie con todo el árbol
// deja cada página de dinero a un clic de cualquier página del sitio.
//
// Cada `href` es un path del registro (lib/seo/paginas.ts): el test
// `navegacion-publica.test.ts` falla si alguno deja de existir, así que un pie
// no puede enlazar a una página borrada.
//
// Sin alias `@/` ni extensiones implícitas: lo lee `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface EnlacePublico {
  href: string;
  label: string;
}

/** Barra superior en escritorio y menú en el móvil. */
export const MENU_PUBLICO: EnlacePublico[] = [
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/soluciones', label: 'Soluciones' },
  { href: '/precios', label: 'Precios' },
  { href: '/comparativa', label: 'Comparativa' },
  { href: '/recursos', label: 'Recursos' },
];

/**
 * Pie de las páginas interiores. El orden de las columnas es el del embudo:
 * qué hace, para quién, contra quién, cómo aprender, quién hay detrás.
 */
export const PIE_PUBLICO: { titulo: string; enlaces: EnlacePublico[] }[] = [
  {
    titulo: 'Producto',
    enlaces: [
      { href: '/funcionalidades/reservas-online', label: 'Reservas online' },
      { href: '/funcionalidades/lista-de-espera', label: 'Lista de espera' },
      { href: '/funcionalidades/app-para-alumnas', label: 'App con tu marca' },
      { href: '/funcionalidades/bonos-y-membresias', label: 'Bonos y cuotas' },
      { href: '/funcionalidades/cobros-recurrentes', label: 'Cobros automáticos' },
      { href: '/funcionalidades/gestion-de-instructoras', label: 'Instructoras' },
      { href: '/funcionalidades/sustituciones', label: 'Sustituciones' },
      { href: '/funcionalidades', label: 'Todas las funcionalidades' },
    ],
  },
  {
    titulo: 'Para tu estudio',
    enlaces: [
      { href: '/', label: 'Estudio de Pilates' },
      { href: '/soluciones/programa-de-gestion-para-estudio-de-pilates', label: 'Programa de gestión' },
      { href: '/soluciones/estudio-de-pilates-reformer', label: 'Pilates reformer' },
      { href: '/soluciones/estudio-de-yoga', label: 'Estudio de yoga' },
      { href: '/funcionalidades/multi-centro', label: 'Varias sedes' },
      { href: '/soluciones/cambiar-de-software', label: 'Cambiar de software' },
      { href: '/precios', label: 'Precios' },
    ],
  },
  {
    titulo: 'Comparar',
    enlaces: [
      { href: '/comparativa/tentare-vs-bsport', label: 'Alternativa a bsport' },
      { href: '/comparativa/tentare-vs-eversports', label: 'Alternativa a Eversports' },
      { href: '/comparativa/tentare-vs-momence', label: 'Alternativa a Momence' },
      { href: '/comparativa/tentare-vs-mindbody', label: 'Alternativa a Mindbody' },
      { href: '/comparativa/tentare-vs-timp', label: 'Alternativa a TIMP' },
      { href: '/comparativa/tentare-vs-lorari', label: 'Alternativa a Lorari' },
      { href: '/comparativa/tentare-vs-bonsai', label: 'Alternativa a Bonsai' },
      { href: '/recursos/mejor-software-para-estudios-de-pilates', label: 'Mejor software de Pilates' },
      { href: '/comparativa', label: 'Todas las comparativas' },
    ],
  },
  {
    titulo: 'Aprender',
    enlaces: [
      { href: '/recursos', label: 'Guías para tu estudio' },
      { href: '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates', label: 'Cuánto cuesta abrir un estudio' },
      { href: '/recursos/rentabilidad-estudio-de-pilates', label: 'Rentabilidad de un estudio' },
      { href: '/recursos/checklist-elegir-software-estudio', label: 'Cómo elegir software' },
      { href: '/glosario', label: 'Glosario' },
      { href: '/ayuda', label: 'Centro de Ayuda' },
    ],
  },
  {
    titulo: 'Tentare',
    enlaces: [
      { href: '/sobre-tentare', label: 'Sobre Tentare' },
      { href: '/seguridad', label: 'Seguridad y datos' },
      { href: '/soporte', label: 'Soporte' },
      { href: '/legal', label: 'Aviso legal' },
      { href: '/privacidad', label: 'Privacidad' },
      { href: '/terminos', label: 'Términos' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
];
