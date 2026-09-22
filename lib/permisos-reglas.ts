// Las REGLAS de permisos, sin React y sin Supabase.
//
// Estaban dentro de `lib/permisos.ts`, que es `'use client'` y arrastra
// `useStudio` → el cliente de Supabase. Consecuencia: no se podían probar sin
// levantar medio entorno, y una regla de permisos que nadie puede comprobar es
// justo la que no debería existir. Aquí son funciones puras; `lib/permisos.ts`
// las reexporta, así que ningún import de fuera cambia.

// La extensión .ts no sobra: `npm test` corre con `node --test
// --experimental-strip-types`, que no resuelve extensiones como el bundler. Sin
// ella el test ni siquiera importa el módulo (y pasó en CI, no en local, porque
// local usaba tsx). Turbopack la acepta —build de producción comprobada— y
// `allowImportingTsExtensions` está activo en tsconfig.
import { esRutaCongelada } from './frozen-features.ts';
import type { Rol } from './types';

// Instructoras: NINGUNA pantalla del panel. Tentare Core se retiró (paso 2,
// decisión del fundador 14-sep-2026): su trabajo vive en la app del estudio
// (`app/portal/[slug]/equipo`) y `DashboardShell` la manda allí
// (`components/layout/puerta-app-instructora.tsx`). Aquí vivía una lista blanca
// (/dashboard, /calendario, /clientas, /mensajeria…) que por prefijo llegó a
// abrirle seis pantallas de importación. Su perfil de Tentare Network sigue
// fuera del panel, en app/network, sin pasar por aquí.

// Recepción: todo lo operativo, nada de configuración del negocio,
// marketing, automatizaciones, informes o gestión del equipo.
// '/centro-de-control' (Decision OS, MVP): solo PROPIETARIO — la apertura
// parcial a RECEPCION se decidirá post-MVP (DECISION-OS-ANALISIS.md §8).
const BLOQUEADO_RECEPCION = ['/equipo', '/marketing', '/contenido', '/automatizaciones', '/informes', '/configuracion', '/centro-de-control', '/notificaciones'];

// Manager: lleva una sede. Todo lo operativo de recepción MÁS el equipo, y
// MENOS el dinero — incluida la pantalla de cobros, que recepción sí ve porque
// cobra en mostrador y un manager no.
// ⚠️ Las pantallas del dinero se consolidaron dentro de /cobros y esta lista se
// quedó apuntando a '/transacciones', que hoy es solo un redirect (ver
// app/(dashboard)/transacciones/page.tsx). Resultado: el manager tenía /cobros y
// /cierre abiertos, y en el menú lateral. Se bloquea la pantalla REAL y además
// los alias, que siguen existiendo porque son urls de retorno vivas de Stripe.
const BLOQUEADO_MANAGER = [
  '/marketing', '/contenido', '/automatizaciones', '/informes',
  '/centro-de-control',
  // ⚠️ `/configuracion` YA NO está bloqueada: la gerencia lleva la operación de
  // su sede (horario, cierres, salas y averías, tipos de clase y horario de
  // citas), con `puede_gestionar_sede()` detrás. Lo que ve DENTRO lo decide
  // `seccionesVisibles` (lib/configuracion/destino.ts) tarjeta a tarjeta, no
  // esta lista, que es por RUTA.
  // Estas dos SÍ, porque son rutas propias con sus APIs de propietaria:
  // «Apariencia de tu app» y la pantalla vieja de avisos. Sin nombrarlas,
  // abrir `/configuracion` las abriría por prefijo.
  '/configuracion/apariencia', '/configuracion/notificaciones',
  // El Notification Center enseña el TÍTULO Y EL CUERPO de todo lo enviado por
  // el estudio, y ahí van los avisos de `pagos` con importe (pago fallido,
  // disputa, penalización). Dejarlo abierto al manager sería una puerta lateral
  // al dinero que /cobros, /facturas y `puedeVerFinanzas` ya le niegan de frente.
  '/notificaciones',
  '/cobros', '/cierre',
  '/transacciones', '/facturas', '/pagos',
  // La caja/TPV. Sus rutas de servidor exigen `puedeMoverDinero` (vender,
  // devolver, abrir y cuadrar caja) y `puedeVerFinanzas` (ver el catálogo y el
  // arqueo), y las dos dejan fuera al manager. Sin esta línea le aparecería en
  // el menú una pantalla que responde 403 nada más abrirla — un botón que la
  // base de datos va a rechazar es justo lo que esta lista existe para evitar.
  '/pos',
  // Importar membresías es meter BONOS: dinero cobrado. Su ruta de API ya exige
  // `puedeMoverDinero` (app/api/suscripciones/import), que deja fuera al manager
  // igual que la deja fuera de /cobros. El resto de importaciones sí las hace.
  '/clientas/importar/membresias',
];

function coincide(path: string, prefijo: string) {
  return path === prefijo || path.startsWith(`${prefijo}/`);
}

// Ficha clínica: dato de salud sensible (FICHA-CLINICA.md §11). En el PANEL solo
// la PROPIETARIA ve el detalle clínico; RECEPCIÓN solo ve el color del semáforo
// (no el motivo ni las condiciones). Es una barrera de UI; la fuente de verdad
// se protege también en servidor.
//
// La INSTRUCTORA salió de aquí al retirarse Tentare Core (14-sep-2026): la salud
// de sus alumnas la lee en la app del estudio, por su propia ruta de servidor
// (`lib/datos-salud/salud-para-instructora.ts`), no por el panel.
export function puedeVerFichaClinica(rol: Rol): boolean {
  return rol === 'PROPIETARIO';
}

// El semáforo (verde/ámbar/rojo) SÍ lo ve RECEPCIÓN, según el comentario de
// arriba y FICHA-CLINICA.md §11 — solo el detalle (motivo, condiciones) está
// vedado. No existía esta función: las tres pantallas que pintan el semáforo
// lo escondían entero detrás de `puedeVerFichaClinica`, así que RECEPCIÓN no
// veía ni el punto de color, contradiciendo la propia especificación.
//
// MANAGER también lo ve (38ª pasada de auditoría): gestiona la ficha completa
// de cualquier clienta (`puedeGestionarClientas`) y el calendario
// (`puedeGestionarCalendario`) — más autoridad operativa que RECEPCIÓN, que ya
// veía el color. No había ninguna decisión documentada que lo excluyera; era
// un descuido de cuando se añadió el rol MANAGER, no una exclusión a propósito
// (a diferencia de otras exclusiones de MANAGER en este fichero, que sí llevan
// comentario explicando el motivo).
export function puedeVerSemaforo(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'INSTRUCTOR' || rol === 'RECEPCION' || rol === 'MANAGER';
}

// ⚠️ `puedeVerFichaClinica` dice si el ROL es clínico en el panel, no si ve la
// ficha de UNA socia concreta. La instructora ve la salud de sus alumnas (reserva
// o cita con ella en ±30 días) solo en la app del estudio: la regla vive en
// `lib/datos-salud/acceso-instructora.ts` (TS) y en `instructora_atiende_socia()`
// (RLS, pendiente de cerrarse para el panel).

// Definir los campos personalizados de socia (qué se pregunta en el alta y en
// la ficha). Solo la propietaria: lo que se rellena ahí va a `campos_extra`,
// que lee todo el personal sin las garantías de la ficha clínica, y la
// auditoría RGPD encontró un campo «Lesiones previas» creado ahí. La cerradura
// es la RLS (migr 20260913214150); esto solo no enseña botones que fallarían.
export function puedeGestionarCamposPersonalizados(rol: Rol): boolean {
  return rol === 'PROPIETARIO';
}

// Datos PRIVADOS de la socia (auditoría RGPD 2026-09-13, M1): NIF, dirección,
// fecha de nacimiento completa, firma del contrato y los identificadores de
// pago (Stripe, SEPA, tarjeta). Solo la propietaria (responsable del
// tratamiento) y recepción (cobra y factura en mostrador). El manager y la
// instructora trabajan con nombre, contacto y lo operativo; el cumpleaños les
// llega sin año (`socios.cumple_mm_dd`).
//
// Espejo de `puede_ver_datos_privados_socia()` en SQL (migr 20260914025903):
// esa función decide qué devuelve la RPC `socios_datos_privados()` y, tras la
// migración de cierre, quién puede escribir esas columnas. Esto solo esconde
// los campos y evita mandarlos al guardar.
export function puedeVerDatosPrivadosSocia(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION';
}

// Mover dinero: crear cobros, marcarlos cobrados, asignar o cancelar planes.
// La propietaria y recepción — recepción cobra en mostrador y vende bonos, así
// que necesita poder de verdad. La instructora no: no tiene ningún motivo para
// tocar la facturación, y hasta la migración 0112 podía (la separación de roles
// estaba en el menú, no en la base de datos).
//
// Esto es la barrera de UI y su ÚNICO trabajo es no enseñar un botón que la
// base de datos va a rechazar. La cerradura está en la RLS (0112).
export function puedeMoverDinero(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION';
}

// VER la facturación (la pestaña Pagos de una ficha, el gasto total). Es otra
// pregunta que `puedeMoverDinero`, aunque hoy la respuesta coincida: se pueden
// separar el día que alguien tenga que consultar sin poder tocar.
// Antes esto se escribía a mano como `rol !== 'INSTRUCTOR'`, que con un rol
// nuevo se equivoca sola: un manager habría heredado la vista de finanzas.
export function puedeVerFinanzas(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION';
}

// Aprobar/rechazar una reserva pendiente de aprobación (Fase 2a). Espejo TS
// de `puede_gestionar_calendario()` en SQL (`resolver_reserva_pendiente`,
// migr 20260730192445) — el mismo criterio en los dos sitios, como manda la
// regla de este repo: la UI no es la cerradura, pero tiene que decir lo mismo
// que ella o enseña un botón que la BD va a rechazar.
export function puedeGestionarCalendario(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER' || rol === 'RECEPCION';
}

// Llevar la operación de la sede en Configuración: horario del estudio, cierres
// del centro, salas y averías, tipos de clase (alta y edición) y horario de
// citas. Propietaria y gerencia; recepción no. Espejo de
// `puede_gestionar_sede()` (migr 20260915224739_permisos_de_sede_para_la_gerencia).
//
// No abre el dinero: servicios y precios de citas, las reglas de dinero de un
// tipo de clase y borrar un tipo siguen siendo de la propietaria, y lo que
// cubre una tarifa, de quien mueve dinero.
export function puedeGestionarSede(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// Moderar Comunidad: editar/fijar/borrar el post o comentario de OTRA
// persona. Espejo TS de `posts_comunidad_editar`/`comentarios_comunidad_editar`
// (migr 20260902104439, F-18) — INSTRUCTOR queda fuera aquí, no porque no
// pueda participar en el tablón (sí puede: publicar, comentar, editar/borrar
// lo suyo), sino porque antes de esta migración cualquier staff podía tocar
// el post ajeno con solo la RLS de `studio_id` de por medio. Barrera de UI;
// la cerradura real es esa RLS.
export function puedeModerarComunidad(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER' || rol === 'RECEPCION';
}

// Dar de alta, importar, editar y dar de baja CLIENTAS. Es el trabajo de
// mostrador, y el manager lo hace.
export function puedeGestionarClientas(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'RECEPCION' || rol === 'MANAGER';
}

// Crear una clase nueva ASIGNADA A UNO MISMO. Distinto de `puedeGestionarClientas`
// (que sigue siendo "puede tocar/crear la clase de cualquiera, en cualquier
// sala, con instructora libre") — INSTRUCTOR entra aquí porque la migración
// 20260731100000 le abrió el INSERT en `sesiones` SOLO cuando
// `instructor_id = current_instructor_id()`. Esto es la barrera de UI; la
// cerradura real es esa RLS.
//
// Desde 20260914104856 lo decide además el estudio (`studios.instructoras_crean_clases`,
// «la instructora crea sus clases / solo se le asignan»): con `false` la
// instructora no crea, y la RLS de INSERT lo exige igual. Solo afecta a ella: el
// resto de roles crea siempre. Sin el dato, `true` (el comportamiento de #550).
export function puedeCrearClasesPropias(rol: Rol, instructorasCreanClases = true): boolean {
  if (rol === 'INSTRUCTOR') return instructorasCreanClases;
  return rol === 'PROPIETARIO' || rol === 'RECEPCION' || rol === 'MANAGER';
}

// Dar de alta y editar al EQUIPO. Es lo que distingue a un manager de recepción,
// y el permiso más delicado que hay: con él se pueden repartir permisos. Que un
// manager no pueda ascender a nadie NO se defiende aquí — se defiende en la RLS
// (migración 0113), porque esto es solo la UI.
export function puedeGestionarEquipo(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// Ver el TIPO y el MOTIVO de la ausencia de otra persona del equipo (vacaciones,
// baja médica, otro). Es dato laboral y a veces de salud: solo quien gestiona el
// equipo. Recepción sigue sabiendo QUIÉN no está y QUÉ DÍAS —lo necesita para no
// asignarle una clase—, sin el porqué. Espejo de `ausencias_gestion`
// (migr 20260914000209). La instructora ve el detalle de las SUYAS aparte.
export function puedeVerDetalleAusencias(rol: Rol): boolean {
  return puedeGestionarEquipo(rol);
}

// Leer las solicitudes que el estudio manda a Tentare desde «Ayuda». Texto
// libre: quien escribe describe su caso y a veces el caso es una alumna. Todo
// el personal puede ESCRIBIR una; leerlas, solo la propietaria. Espejo de
// `soporte_leer_propietaria` (migr 20260914000205). No hay pantalla que las
// liste hoy: la regla está para que la primera no nazca abierta a todo el equipo.
export function puedeVerSolicitudesSoporte(rol: Rol): boolean {
  return rol === 'PROPIETARIO';
}

// Configurar el Inicio del portal — reordenar módulos, añadir/editar bloques
// del catálogo (Fase 2/3 del editor de temas). Mismo criterio que
// `puedeGestionarEquipo` (trabajo operativo/de marketing de sede, no
// facturación), pero con nombre propio: son permisos conceptualmente
// distintos que hoy coinciden, y podrían divergir el día que uno de los dos
// cambie sin que el otro deba seguirle.
export function puedeGestionarPortalHome(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// Opening OS (apertura del estudio). Espejo de la RLS de opening_progreso /
// opening_config / launch_stages / alertas_opening (migr 20260921131627).
export function puedeGestionarApertura(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// Ver el Notification Center (`/notificaciones`, `/api/notifications/admin`): el
// historial de TODO lo que el estudio ha enviado, a quién y con qué resultado,
// con título y cuerpo completos. No es la campana de cada cual —eso es
// `/api/notifications`, acotado por `recipient_user_id`— sino la vista agregada
// de los avisos de TODAS las personas del estudio, socias incluidas.
//
// Solo PROPIETARIO, porque la pantalla es la UNIÓN de dominios que el resto de
// roles tiene vedados por separado, y una vista de auditoría no puede ser el
// atajo que devuelve lo que cada permiso ya negó. Lo que deja fuera a cada rol:
//   - MANAGER, por la categoría `pagos`: `pago.fallido` y `pago.disputado`
//     llevan el importe en el cuerpo. Hoy no los ve en su campana solo porque no
//     existe plantilla `#MANAGER` y `crearInApp` se salta la fila sin ella — el
//     Notification Center se los daría igual, porque lee `title`/`body` crudos
//     de la tabla sin pasar por `plantillaDe`. Es justo el rodeo que /cobros y
//     `puedeVerFinanzas` le cierran de frente.
//   - RECEPCION, por `decision.mensaje_dia` (/centro-de-control es solo de la
//     propietaria) y sobre todo por `riesgo.dependencia`, que es a la vez dato
//     de /informes y un juicio sobre una compañera ("{instructora} concentra el
//     {porcentaje}% de tu facturación"). OJO: el argumento de `pagos` NO vale
//     contra recepción — sí ve dinero (`puedeVerFinanzas`) y ya recibe esos
//     mismos avisos con importe en su propia campana.
//   - INSTRUCTOR, por todo lo anterior más `salud.revision_pendiente`, cuyo
//     cuerpo nombra a la socia y revela que tiene ficha clínica pendiente de
//     revisar. Es metadato clínico, no el detalle del §11 (no lleva condiciones
//     ni motivo), pero la lista de quién tiene ficha ya es dato de salud.
// Queda en el mismo escalón que /informes, solo-propietaria (y que las partes de
// /configuracion que siguen siéndolo: la gerencia entra, pero al horario, las
// salas y las clases de su sede, no al dinero ni a la cuenta).
//
// Si algún día recepción necesita depurar entregas ("¿le llegó el recordatorio a
// Marta?"), la vía es un endpoint acotado por socia y sin las categorías
// `decisiones`/`salud`/`riesgo` — no relajar este permiso, que gobierna una
// vista agregada sin filtrar.
//
// ⚠️ Esto NO es un espejo de la RLS de `notification`, y por eso no está en la
// tabla ESPEJO del test: esa policy es por PERSONA (`recipient_user_id =
// auth.uid()`), no por rol. Son dos preguntas distintas — "¿es esta fila tuya?"
// la contesta la base de datos; "¿puedes ver el agregado de todo el estudio?" la
// contesta esto, porque ese camino va por service-role y se salta la RLS entera.
export function puedeVerCentroNotificaciones(rol: Rol): boolean {
  return rol === 'PROPIETARIO';
}

// Roles que un rol puede REPARTIR al invitar o editar a alguien. La propietaria
// reparte todo; el manager solo hacia abajo. Espejo de la policy 0113: si las
// dos dejan de coincidir, la UI ofrece algo que la base de datos rechaza.
export function rolesQuePuedeAsignar(rol: Rol): Rol[] {
  if (rol === 'PROPIETARIO') return ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'];
  if (rol === 'MANAGER') return ['RECEPCION', 'INSTRUCTOR'];
  return [];
}

// Auditoría integral 2026-08-21 (duplicación, hallazgo P1): "¿puede rolActor
// gestionar la ficha de alguien con rolFicha?" se copiaba a mano 3 veces en
// app/api/equipo/{tarifas,liquidaciones}/route.ts, cada una con su propio
// comentario "mismo guard que...". Un manager no gestiona la tarifa/
// liquidación/compensación de la propietaria ni de otro manager — la misma
// regla que ya usa `rolesQuePuedeAsignar` para decidir a quién puede DAR de
// alta, reutilizada aquí para decidir sobre quién ya existente puede actuar.
export function puedeGestionarFichaDe(rolActor: Rol, rolFicha: Rol): boolean {
  return rolesQuePuedeAsignar(rolActor).includes(rolFicha);
}

// VER la retribución (tarifa, base, horas de contrato, liquidación) de una ficha
// del equipo. Espejo de la RLS de `instructor_tarifas`/`liquidaciones_instructoras`:
// `*_gestion` (`puede_gestionar_ficha_instructor`, migr 20260908184657) más la
// lectura propia (`tarifas_propia_lectura`/`liquidaciones_propia_lectura`).
//
// Hacía falta porque los LISTADOS (`GET /api/equipo/tarifas` y
// `GET /api/equipo/liquidaciones` sin `instructorId`) van por service-role y
// solo miraban `puedeGestionarEquipo`: un MANAGER se llevaba la tarifa y la
// liquidación de la propietaria y de las otras managers, justo lo que la RLS le
// niega. `rolFicha` desconocido (ficha que ya no está) → no, salvo propietaria.
export function puedeVerRetribucionDe(rolActor: Rol, rolFicha: Rol | null | undefined, esPropia: boolean): boolean {
  if (rolActor === 'PROPIETARIO') return true;
  if (esPropia) return true;
  if (!rolFicha) return false;
  return puedeGestionarFichaDe(rolActor, rolFicha);
}

// Aplica `puedeVerRetribucionDe` a un listado. `propiaVisible` afina la fila
// propia (la liquidación propia solo se ve CONFIRMADA/PAGADA, como en la RLS).
export function filtrarRetribucionVisible<T extends { instructorId: string }>(
  filas: readonly T[],
  ctx: {
    rolActor: Rol;
    rolPorInstructor: ReadonlyMap<string, Rol>;
    propioInstructorId: string | null;
    propiaVisible?: (fila: T) => boolean;
  },
): T[] {
  if (ctx.rolActor === 'PROPIETARIO') return [...filas];
  return filas.filter(fila => {
    const esPropia = ctx.propioInstructorId != null && fila.instructorId === ctx.propioInstructorId;
    if (esPropia) return ctx.propiaVisible ? ctx.propiaVisible(fila) : true;
    return puedeVerRetribucionDe(ctx.rolActor, ctx.rolPorInstructor.get(fila.instructorId), false);
  });
}

// Conectar/revocar una app de terceros (OAuth, p.ej. Zapier) para el estudio
// entero. Mismo criterio que puedeGestionarEquipo: es una decisión de negocio
// de la sede, no algo que competa a RECEPCION/INSTRUCTOR. Barrera de UI; la
// cerradura real está en que /api/oauth/authorize y /api/oauth/revoke
// comprueban este mismo criterio en servidor (las tablas oauth_* no tienen
// política RLS para authenticated — ver lib/oauth-server.ts).
export function puedeGestionarAppsOAuth(rol: Rol): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// ── Reglas de rutas de servidor que solo pedían sesión de staff ─────────────
// Todas estas rutas corren con service-role, así que la RLS no está debajo:
// la regla de aquí es la cerradura de la ruta, no solo la de la UI.

// Actuar sobre UNA clase concreta: avisar a sus alumnas de que se cancela o
// cambia, o abrir la puerta al marcar asistencia en ella: mostrador y manager,
// sobre cualquiera. Tentare Core retirado (14-sep-2026): la instructora ya no
// opera clases desde el panel (apuntar alumnas, Kisi, email de cancelación), ni
// siquiera las suyas.
export function puedeOperarClase(rol: Rol): boolean {
  return puedeGestionarCalendario(rol);
}

export const TIPOS_EMAIL_PANEL = [
  'recibo', 'bienvenida', 'reserva', 'automatizacion', 'promocion', 'cancelacion', 'cambio', 'recordatorio',
] as const;
export type TipoEmailPanel = typeof TIPOS_EMAIL_PANEL[number];

// Los tipos que hablan de una clase. En /api/emails/send su contenido (clase,
// fecha, hora, sala, instructora) sale de la BD a partir de `sesionId`, nunca
// del cuerpo de la petición.
export const TIPOS_EMAIL_DE_CLASE: readonly TipoEmailPanel[] = ['reserva', 'promocion', 'cancelacion', 'cambio', 'recordatorio'];

// Quién puede mandar cada correo de `/api/emails/send` a una clienta. Todos salen
// con la marca del estudio, así que el rol va por lo que dice el correo:
//   · recibo → dinero (un justificante de pago).
//   · bienvenida y automatizacion → trabajo de mostrador sobre la clienta; es
//     el único tipo con título y texto libres (mensaje a una persona desde la
//     ficha o Mensajería, aprobación de una automatización).
//   · cancelacion → quien puede operar la clase (calendario; la instructora ya
//     no, ni la suya: Tentare Core retirado, 14-sep-2026).
//   · reserva/promocion/cambio/recordatorio → calendario. Desde el panel no los
//     llama nadie hoy (el servidor los manda por su cuenta).
export function puedeEnviarEmail(rol: Rol, tipo: string): boolean {
  switch (tipo) {
    case 'recibo': return puedeMoverDinero(rol);
    case 'bienvenida':
    case 'automatizacion': return puedeGestionarClientas(rol);
    case 'cancelacion': return puedeOperarClase(rol);
    case 'reserva':
    case 'promocion':
    case 'cambio':
    case 'recordatorio': return puedeGestionarCalendario(rol);
    default: return false;
  }
}

// Ejecutar las automatizaciones a mano (`/api/automatizaciones/run`): manda
// emails y WhatsApps reales a las clientas. Mismo criterio que la pantalla
// `/automatizaciones`, que ya era solo de la propietaria (bloqueada para
// recepción y manager en `puedeVer`); la ruta usaba `puedeMoverDinero` y dejaba
// pasar a recepción por una puerta que su menú no tenía.
export function puedeGestionarAutomatizaciones(rol: Rol): boolean {
  return rol === 'PROPIETARIO';
}

// Email y teléfono de las compañeras. Quien organiza el calendario los necesita
// (contactar a una sustituta por WhatsApp); una instructora solo recibe los
// suyos. Mismo recorte que ya hace `/api/equipo/tarjetas` con la vista de
// compañeras.
export function puedeVerContactoEquipo(rol: Rol): boolean {
  return puedeGestionarCalendario(rol);
}

// Leer las valoraciones de una instructora una a una: comentario libre de la
// alumna y su nombre. La propietaria y la manager (gestionan el equipo).
// Recepción no: ni siquiera ve /equipo. La instructora TAMPOCO, ni las suyas
// (decisión del 14-sep-2026): ella sabe quién vino a cada clase, así que una
// valoración suelta la identifica. Solo ve su nota agregada y protegida en la
// app del estudio (`lib/valoraciones/agregado.ts`).
export function puedeVerValoracionesDe(rol: Rol, _esPropia: boolean): boolean {
  return rol === 'PROPIETARIO' || rol === 'MANAGER';
}

// La media y el total en vivo (sin comentarios ni nombres): lo pinta el ranking
// de /sustituciones, que usa todo el mostrador. La instructora no: una media en
// vivo deja deducir un voto viendo cuándo cambia.
export function puedeVerResumenValoracionDe(rol: Rol, _esPropia: boolean): boolean {
  return puedeGestionarCalendario(rol);
}

// Arquitectura de marca: el panel es una sola app role-gateada, pero se
// percibe como dos productos — Tentare Core para instructoras, Tentare
// Manager para propietaria/manager/recepción. Fuente de verdad única del
// mapeo; todo lo que muestre el nombre del producto (título de página, logo,
// emails al equipo) pasa por aquí en vez de repetir el `rol === 'INSTRUCTOR'`.
// Tentare Core se retiró (14-sep-2026): a la instructora ya no se le habla de
// un producto propio del panel, solo de la marca paraguas (sus correos de
// sustituciones, disponibilidad e invitación).
export function nombreAppPorRol(rol: Rol): 'Tentare' | 'Tentare Manager' {
  return rol === 'INSTRUCTOR' ? 'Tentare' : 'Tentare Manager';
}

// Fuente de verdad única de "cómo se llama este rol" — auditoría integral
// 2026-08-21: había 4 catálogos distintos (tab-perfil.tsx, sede-activa.tsx,
// equipo/page.tsx, notificaciones/page.tsx), dos de ellos sin la clave
// MANAGER (crash real al abrir "Mi perfil" con ese rol) y con el mismo rol
// llamado "Gerencia" en un sitio y "Responsable de sede" en otro.
export const ETIQUETA_ROL: Record<Rol, { label: string; bg: string; text: string }> = {
  PROPIETARIO: { label: 'Propietaria', bg: '#F1F2EA', text: '#343825' },
  MANAGER: { label: 'Responsable de sede', bg: '#EFF3FF', text: '#2E3A5C' },
  INSTRUCTOR: { label: 'Instructora', bg: '#FFF2F7', text: '#5A6142' },
  RECEPCION: { label: 'Recepción', bg: '#EAF6FF', text: '#3F5A7A' },
};


export function puedeVer(rol: Rol, path: string): boolean {
  // Feature-freeze PMF: los módulos congelados no son visibles para NINGÚN rol.
  // Esto los saca a la vez del menú, del buscador ⌘K y hace que el guardia del
  // layout redirija a /dashboard. Reactivar = quitar la ruta de RUTAS_CONGELADAS.
  if (esRutaCongelada(path)) return false;
  if (rol === 'PROPIETARIO') return true;
  // Ni una: su sitio es la app del estudio (ver arriba).
  if (rol === 'INSTRUCTOR') return false;
  if (rol === 'MANAGER') return !BLOQUEADO_MANAGER.some(p => coincide(path, p));
  return !BLOQUEADO_RECEPCION.some(p => coincide(path, p));
}
