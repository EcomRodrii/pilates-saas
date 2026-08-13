// Mapa de enlaces de la landing v5 — la capa que el diseño NO traía resuelta.
//
// El HTML de origen (Landing Tentare v5.dc.html) tiene tres problemas de
// enlazado, y los tres se corrigen aquí en vez de arrastrarlos:
//
//  1. **No enlaza las páginas que existen.** El menú lleva "Funcionalidades" a
//     `#funcionalidades` y "Precios" a `#precio` — anclas dentro de la propia
//     página. Las 17 URLs de /funcionalidades y /precios no aparecen ni una
//     vez, que es justamente el árbol que da profundidad al sitio.
//  2. **Un enlace roto**: el pie apunta a `/aviso-legal`. Esa ruta no existe;
//     la real es `/legal`.
//  3. **URLs absolutas al dominio sin www**, que devuelve un 308 hacia el host
//     real. Aquí van RELATIVAS: no dependen del host y no arrastran un salto.
//     (El origen canónico vive en `LEGAL.url` y no se escribe a mano en ningún
//     otro sitio — hay un test que lo comprueba, y cazó este fichero cuando el
//     comentario traía el dominio literal.)
//
// El criterio con las anclas: el menú SIGUE llevando a las secciones (es la
// intención del diseño y funciona mejor para quien está leyendo la página), y
// son las secciones las que enlazan hacia fuera con un "ver más". Así no se
// pierde ni el recorrido de la landing ni la profundidad del sitio.

export interface EnlaceNav {
  href: string;
  label: string;
}

/** Menú superior. Anclas: el recorrido de la landing es la propia página. */
export const NAV_V5: EnlaceNav[] = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#sustituciones', label: 'Sustituciones' },
  { href: '#precio', label: 'Precios' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Salidas de cada sección hacia el árbol real. Esto es lo que el diseño no
 * tenía: sin estos enlaces, /funcionalidades y /precios quedan huérfanas desde
 * la página que más tráfico recibe.
 */
export const SALIDAS = {
  funcionalidades: { href: '/funcionalidades', label: 'Ver las 15 funcionalidades' },
  sustituciones: { href: '/funcionalidades/sustituciones', label: 'Cómo funcionan las sustituciones' },
  precio: { href: '/precios', label: 'Ver los planes en detalle' },
  comparativa: { href: '/comparativa', label: 'Comparar con otras plataformas' },
  // ⚠️ Apunta a /comparativa y NO a /soluciones/cambiar-de-software: esa página
  // se planificó (P1) pero nunca se publicó, y enlazar a un 404 desde la home
  // es peor que no enlazar. Si algún día se escribe, este es el sitio que hay
  // que cambiar — el test de enlaces internos lo cazaría igualmente.
  cambiarse: { href: '/comparativa', label: 'Comparar antes de cambiarte' },
  app: { href: '/funcionalidades/app-para-alumnas', label: 'La app de tus alumnas' },
  widget: { href: '/funcionalidades/reservas-online', label: 'Reservas en tu web' },
  clientas: { href: '/funcionalidades/ficha-de-clienta', label: 'La ficha de cada alumna' },
} as const satisfies Record<string, EnlaceNav>;

/** Pie. `/legal` y no `/aviso-legal`: ese enlace del diseño estaba roto. */
export const PIE_V5: { titulo: string; enlaces: EnlaceNav[] }[] = [
  {
    titulo: 'Producto',
    enlaces: [
      { href: '/funcionalidades', label: 'Funcionalidades' },
      { href: '/precios', label: 'Precios' },
      { href: '/comparativa', label: 'Comparativa' },
      { href: '/seguridad', label: 'Seguridad' },
      // Feature #9 (ficha Lorari-vs-Tentare): la página existía desde el alta,
      // pero sin ningún enlace de entrada era un callejón sin salida — nadie
      // podía encontrarla sin conocer la URL de memoria.
      { href: '/instructora/alta', label: 'Para instructoras sin estudio' },
    ],
  },
  {
    titulo: 'Funcionalidades',
    enlaces: [
      { href: '/funcionalidades/reservas-online', label: 'Reservas online' },
      { href: '/funcionalidades/sustituciones', label: 'Sustituciones' },
      { href: '/funcionalidades/cobros-recurrentes', label: 'Cobros' },
      { href: '/funcionalidades/facturacion', label: 'Facturación' },
    ],
  },
  {
    titulo: 'Recursos',
    enlaces: [
      { href: '/recursos', label: 'Guías' },
      { href: '/glosario', label: 'Glosario' },
      { href: 'mailto:hola@tentare.app', label: 'Contacto' },
    ],
  },
  {
    titulo: 'Legal',
    enlaces: [
      { href: '/legal', label: 'Aviso legal' },
      { href: '/privacidad', label: 'Privacidad' },
      { href: '/terminos', label: 'Términos' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
];

/** Un enlace es externo si sale del sitio: se abre aparte y sin pasar por Link. */
export function esExterno(href: string): boolean {
  return href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
}
