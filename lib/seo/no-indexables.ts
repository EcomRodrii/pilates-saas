// ─────────────────────────────────────────────────────────────────────────────
// Qué rutas NO se indexan. Aparte del registro de páginas (./paginas.ts, que
// lo reexporta) porque esto lo necesita también el navegador en TODAS las
// pantallas (lib/ahrefs-cliente.ts, montado en el layout raíz), y el registro
// arrastra los textos de guías y artículos: ~11 KB con gzip en cada pantalla,
// también en el panel y en la app de la alumna, para comprobar un prefijo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prefijos que NO deben indexarse: panel, portal, zonas autenticadas y páginas
 * de un solo uso abiertas por enlace firmado (valorar, no-puedo…). Es la fuente
 * de `app/robots.ts` Y el filtro del test de cobertura, para que las dos listas
 * no puedan divergir — que es justo como se coló media docena de rutas del
 * panel sin bloquear.
 *
 * Semántica robots.txt: prefijo de CADENA, no de segmento. `/portal` cubre
 * también `/portal-preview`, y `/reservar` cubre `/reservar/<slug>`.
 */
export const PREFIJOS_NO_INDEXABLES = [
  // Infraestructura y autenticación
  '/api', '/login', '/crear-estudio', '/suscripcion', '/invitacion', '/clave-nueva', '/interno', '/verificar-acceso',
  // Aterrizaje para el enlace de la bio de TikTok (app/empieza): repite las
  // promesas de la home y competiría con ella en el buscador.
  '/empieza',
  // Puente del magic link para el widget embebido (Modo B) — se abre en una
  // pestaña emergente y se cierra sola, nunca contenido a visitar (Fase 2 del
  // Booking Engine, docs/auth-widget-diseno.md §2/§6).
  '/widget-auth-retorno',
  // Pantalla de consentimiento OAuth para apps de terceros (Zapier) — interrupción
  // puntual dentro de una sesión autenticada, no contenido público.
  '/oauth',
  // Alta de cuenta freelance (feature #9) — mismo criterio que /crear-estudio.
  '/instructora',
  // Entrada de la app de iOS (usuario de Tentare → la app de su estudio). Es la
  // pantalla de acceso de un binario, no contenido que buscar.
  '/app',
  // Cara pública operativa de cada estudio.
  //
  // ⚠️ `/reservar` YA NO está aquí: decisión del fundador (2026-08-17) de abrir
  // a indexación la página de reservas de cada estudio. Se levantan las DOS
  // puertas a la vez —esta y el `robots` del layout— porque levantar solo una
  // no hace nada: Google no puede leer una etiqueta de una URL que le hemos
  // prohibido rastrear.
  //
  // '/i' SIGUE bloqueado, y no es un olvido: es el enlace público de
  // instructora freelance y REEXPORTA el layout/page de /reservar tal cual. Si
  // se abriera también, el mismo contenido viviría en dos URLs distintas y
  // competirían entre sí. Abrirlo es una decisión aparte, y necesitaría su
  // propio canonical.
  // ⚠️ '/i/' CON barra: sin ella, el prefijo de robots.txt bloqueaba también
  // `/icon1.png`… `/icon4.png` (los favicons que Next sirve desde app/icon*.png)
  // y `/icono-estudio`. Google exige poder rastrear el favicon para enseñarlo en
  // los resultados: con él bloqueado, Tentare salía con el icono genérico.
  '/portal', '/kiosk', '/i/',
  // Enlaces firmados de un solo uso
  '/aceptar-sustitucion', '/confirmar-reserva', '/disponibilidad', '/no-puedo', '/valorar',
  // Panel de gestión — TODOS los segmentos de app/(dashboard)
  '/actualizaciones', '/automatizaciones', '/bienvenido-apertura', '/calendario', '/centro-de-control', '/chat', '/cierre', '/citas',
  '/clientas', '/cobros', '/comunidad', '/configuracion', '/contenido', '/dashboard',
  '/equipo', '/explorar-funciones', '/facturas', '/informes', '/libreta', '/marketing',
  '/mensajeria', '/mi-perfil', '/migracion', '/notificaciones', '/ondemand', '/pagos',
  '/pos', '/primeros-pasos', '/productos', '/socios', '/sustituciones', '/transacciones',
  // Veri*Factu: la declaración responsable del SIF (lleva datos del productor)
  // y cualquier pantalla futura del envío a la AEAT.
  '/verifactu',

  // Tentare Network — autoservicio de la instructora y buscador privado de
  // la propietaria. `/network/` CON BARRA FINAL, no una lista de rutas
  // nombradas a mano: el rediseño 2026-08 intentó nombrar cada ruta privada
  // una por una y se dejó fuera `app/(dashboard)/network/[perfilId]` (la
  // vista privada de una candidata) porque es un segmento DINÁMICO — el
  // recorrido de rutas de paginas.test.ts excluye a propósito los `[...]`,
  // así que ese hueco no lo caza ningún test. Con la barra al final, este
  // prefijo cubre CUALQUIER hijo de /network (estático o dinámico, presente
  // o futuro) sin depender de acordarse de añadirlo aquí — y el landing
  // público en sí (`/network`, sin hijo) nunca coincide con él porque no
  // termina en barra. `/network/instructoras` y sus variantes dinámicas
  // (`[slug]`, `ciudad/[ciudad](/[especialidad])`) se abren de vuelta como
  // excepción explícita en EXCEPCIONES_INDEXABLES, mismo mecanismo que ya
  // usaba este registro antes del rediseño.
  '/network/',
] as const;

/**
 * Excepciones DENTRO de un prefijo bloqueado: `/network/` está bloqueado
 * entero (ver el comentario en PREFIJOS_NO_INDEXABLES), pero el marketplace
 * público (`/network/instructoras` y sus hijos dinámicos) sí debe indexarse.
 * Se resuelve como excepción explícita y no quitando `/network/instructoras`
 * de PREFIJOS_NO_INDEXABLES: la lista de bloqueo sigue reflejando "todo lo
 * privado de Network" tal cual, y aquí queda documentado qué se abrió y por
 * qué — mismo criterio que ya usaba este mecanismo antes del rediseño.
 */
// `/network/crear-perfil` es el wizard de alta — punto de entrada real con
// tráfico entrante (enlaces compartidos, "Crea tu perfil" desde /login y
// /network/acceso), no autoservicio privado como el resto de /network/*.
// Auditoría SEO 2026-08-18: llevaba metadata propia (título/descripción,
// app/network/crear-perfil/layout.tsx) desde una ronda anterior con la
// intención explícita de que fuera indexable, pero el bloqueo de PREFIJOS_
// NO_INDEXABLES ('/network/' entero) la dejaba fuera de rastreo igualmente
// — "se queda indexable" nunca se cumplió porque nadie cruzó las dos
// piezas. Solo el paso 1 (cuenta) es alcanzable sin sesión; los pasos
// siguientes exigen auth, así que un rastreador sin sesión no ve nada
// privado.
// /network/terminos y /network/privacidad (2026-08-30): páginas legales
// propias del marketplace — indexables por la misma razón que las legales
// generales (/legal, /privacidad, /terminos, /cookies) lo son.
export const EXCEPCIONES_INDEXABLES: readonly string[] = ['/network/instructoras', '/network/crear-perfil', '/network/terminos', '/network/privacidad'];

/**
 * Rutas que son un `redirect()` y no una página.
 *
 * Existe porque el registro solo contempla dos categorías —página pública
 * registrada, o prefijo bloqueado— y un redirect no es ninguna de las dos:
 * no tiene contenido que indexar, y Google no indexa la URL que redirige sino
 * su destino. Meterlo en el registro lo colaría en el sitemap; bloquearlo por
 * prefijo es imposible sin bloquear también a sus hijos (`/reservar` es prefijo
 * de cadena de `/reservar/<slug>`, que SÍ queremos indexar).
 *
 * Solo para redirects de verdad: si algún día una de estas pinta algo, deja de
 * pertenecer aquí.
 */
export const RUTAS_REDIRECCION: readonly string[] = [
  // Compatibilidad con enlaces antiguos sin slug → /reservar/<estudio por defecto>.
  '/reservar',
];

/** ¿Esta ruta cae bajo un prefijo bloqueado? Prefijo de cadena, como robots.txt. */
export function esNoIndexable(path: string): boolean {
  if (EXCEPCIONES_INDEXABLES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  return PREFIJOS_NO_INDEXABLES.some((p) => path.startsWith(p));
}
