// Las secciones de Configuración y sus tarjetas: qué hay, cómo se llama y qué
// hace, en una sola frase.
//
// Configuración eran doce pestañas con nombres de código («API», «Campos de
// clienta», «Integraciones del negocio») y hasta cuatro niveles de
// sub-navegación. Ahora son catorce preguntas que se hace una propietaria —«cómo
// reservan mis alumnas», «cómo me comunico»— y cada respuesta es una lista de
// tarjetas. Esta lista es la ÚNICA fuente de esos nombres y frases: la pantalla
// los pinta de aquí, los enlaces antiguos se traducen contra ella
// (lib/configuracion/destino.ts) y los tests comprueban que cada id existe de
// verdad en algún componente.
//
// Cada tarjeta se pinta en su sección, salvo las de una herramienta grande
// (`herramienta`), que se pintan en la pantalla de esa herramienta y dejan en la
// sección una fila con cómo está. Si una tarjeta cambia de sección o de
// herramienta, basta con moverla aquí: su ancla la sigue sola, y los enlaces
// guardados no se rompen.
//
// Pura y sin imports: la ejecuta `node --test` directamente.

export type SeccionId =
  | 'estudio' | 'clases' | 'reservas' | 'cobros' | 'altas' | 'comunicacion'
  | 'motivacion' | 'marca' | 'web' | 'equipo' | 'conexiones' | 'datos' | 'avisos' | 'panel';

/**
 * Cómo se guarda lo que hay dentro. Solo `al-pulsar` se anuncia en pantalla
 * (con «Se guarda al momento»): es el único que no espera a ningún botón.
 * - barra: espera a su botón «Guardar».
 * - al-pulsar: se guarda al tocarlo (o al salir del campo).
 * - catalogo: una lista con su propio alta y edición.
 * - accion: conectar, copiar, cambiarse… cada botón hace lo suyo.
 * - lectura: solo cuenta lo que hay.
 */
export type ModoGuardado = 'barra' | 'al-pulsar' | 'catalogo' | 'accion' | 'lectura';

export type RolConfiguracion = 'PROPIETARIO' | 'MANAGER' | 'RECEPCION' | 'INSTRUCTOR';

/** Tarjetas que solo existen en algunos estudios. */
export type CondicionTarjeta = 'multiSede' | 'cadena';

/**
 * Las herramientas grandes: cada una tiene su propia pantalla
 * (`?tab=<sección>&abrir=<herramienta>`) y en su sección es una sola fila que
 * dice cómo está.
 */
export type HerramientaId =
  | 'salas' | 'tipos-de-clase' | 'correos-automaticos' | 'recompensas-y-logros' | 'contenido-de-tu-app' | 'widgets'
  | 'tus-avisos' | 'avisos-del-movil' | 'codigos-descuento';

export interface TarjetaConfiguracion {
  readonly id: string;
  readonly titulo: string;
  readonly frase: string;
  readonly guardado: ModoGuardado;
  /** Tarjetas que necesitan sitio (catálogos en rejilla, el constructor de widgets). */
  readonly ancho?: 'amplio';
  readonly condicion?: CondicionTarjeta;
  /** Se pinta en la pantalla de esa herramienta, no en la sección. */
  readonly herramienta?: HerramientaId;
  /**
   * Quién la ve. Sin esto, solo la propietaria: lo nuevo nace cerrado. La
   * cerradura es la RLS; esto solo no enseña lo que la base de datos rechazaría.
   */
  readonly roles?: readonly RolConfiguracion[];
  /**
   * Otras palabras con las que la propietaria busca esto en el buscador del
   * inicio («nif», «no viene»). Solo si el ajuste está DE VERDAD en esta
   * tarjeta: un sinónimo que lleva a otra cosa es un enlace que miente.
   */
  readonly palabras?: readonly string[];
}

export interface SeccionConfiguracion {
  readonly id: SeccionId;
  readonly titulo: string;
  /** La línea corta de la lista, cuando no se sabe el valor de lo que hay dentro. */
  readonly resumen: string;
  /** Una sola frase: qué se decide aquí. */
  readonly frase: string;
  /** Quién abre la sección: los roles de sus tarjetas, juntos (lo comprueba su test). */
  readonly roles: readonly RolConfiguracion[];
  readonly tarjetas: readonly TarjetaConfiguracion[];
  readonly palabras?: readonly string[];
}

const SOLO_PROPIETARIA = ['PROPIETARIO'] as const;
/**
 * La operación de la sede: la gerencia la lleva con la propietaria (decisión del
 * fundador, 15-sep). Espejo de `puedeGestionarSede` (lib/permisos-reglas.ts) y de
 * `puede_gestionar_sede()` en la RLS: horario, cierres, salas y averías, tipos de
 * clase y horario de citas. El dinero, el contrato y la cuenta no entran.
 */
const SEDE = ['PROPIETARIO', 'MANAGER'] as const;

export const SECCIONES = [
  {
    id: 'estudio',
    titulo: 'Mi estudio',
    resumen: 'Datos, horario, salas y sedes',
    frase: 'Quién eres, dónde estás y cuándo abres: lo que ven tus alumnas y lo que usa la agenda.',
    roles: SEDE,
    // Cada tarjeta de Mi estudio es una FILA con su valor de hoy, y se cambia en
    // su cajón (15-sep, v2). «Datos y contacto» eran siete campos y un cajón
    // lleva como mucho seis: se partió en dos. Sus anclas de antes
    // (`#datos-y-contacto`, `#horario-y-cierres`) llevan aquí (destino.ts).
    tarjetas: [
      { id: 'nombre-y-direccion', titulo: 'Nombre y dirección', frase: 'Cómo se llama tu estudio y dónde está: sale en tu página de reservas y en tus correos.', guardado: 'barra', palabras: ['nombre', 'dirección', 'ciudad', 'código postal'] },
      { id: 'contacto', titulo: 'Contacto', frase: 'Dónde te escriben o te llaman tus alumnas, y tu web.', guardado: 'barra', palabras: ['teléfono', 'email', 'web'] },
      { id: 'horario', titulo: 'Horario', frase: 'Cuándo abres cada día: la agenda distingue un día cerrado de uno sin clases.', guardado: 'barra', roles: SEDE, palabras: ['apertura', 'abrir', 'días'] },
      { id: 'cerrar-el-centro', titulo: 'Cerrar el centro', frase: 'Vacaciones, un puente o una reforma: se cancelan sus clases, y aquí ves y quitas los cierres que pusiste.', guardado: 'barra', roles: SEDE, palabras: ['vacaciones', 'festivos', 'cierre'] },
      { id: 'salas', titulo: 'Salas', frase: 'Tus salas y cuántas personas caben: esa cifra es el tope de plazas de cada clase.', guardado: 'catalogo', ancho: 'amplio', herramienta: 'salas', roles: SEDE, palabras: ['aforo', 'capacidad', 'plazas', 'averías', 'máquinas'] },
      { id: 'sedes', titulo: 'Sedes', frase: 'Tus otras sedes: cámbiate a una o añade otra.', guardado: 'accion', condicion: 'multiSede', palabras: ['cambiar de sede', 'centros', 'cadena'] },
      { id: 'certificado', titulo: 'Certificado Tentare Verified Studio', frase: 'Un certificado oficial y verificable de que tu estudio está al día con Tentare: para imprimir o compartir.', guardado: 'accion', palabras: ['certificación', 'verificado', 'diploma', 'sello'] },
    ],
  },
  {
    id: 'clases',
    titulo: 'Mis clases y citas',
    resumen: 'Tipos de clase y citas individuales',
    frase: 'Lo que ofreces: los tipos de clase que programas en la agenda y las citas individuales.',
    roles: SEDE,
    // Los servicios de cita llevan precio y el catálogo de la cadena es de todas
    // las sedes: solo la propietaria.
    tarjetas: [
      { id: 'tipos-de-clase', titulo: 'Tipos de clase', frase: 'Reformer, Suelo, Embarazadas…: nombre, duración, plazas y, si quieres, sus propias reglas de reserva.', guardado: 'catalogo', ancho: 'amplio', herramienta: 'tipos-de-clase', roles: SEDE, palabras: ['reformer', 'suelo', 'mat', 'duración'] },
      { id: 'catalogo-de-la-cadena', titulo: 'Catálogo de la cadena', frase: 'Tipos de clase comunes a tus sedes. Se copian a cada sede al crearla o al pulsar «Aplicar catálogo».', guardado: 'catalogo', condicion: 'cadena' },
      { id: 'servicios-de-cita', titulo: 'Servicios de cita', frase: 'Sesiones individuales, como una clase privada o una valoración.', guardado: 'catalogo', ancho: 'amplio' },
      { id: 'horario-de-citas', titulo: 'Horario de citas', frase: 'Las horas en que cada instructora acepta citas.', guardado: 'barra', ancho: 'amplio', roles: SEDE },
    ],
  },
  {
    id: 'reservas',
    titulo: 'Cómo reservan mis alumnas',
    resumen: 'Reservar, cancelar, lista de espera y faltas',
    frase: 'Las reglas del estudio para reservar y cancelar; cada tipo de clase puede cambiar algunas.',
    roles: SOLO_PROPIETARIA,
    // Cada tarjeta es una FILA con su valor de hoy y se cambia en su cajón
    // (15-sep, v2). «Cuando algo cambia, Tentare…» ya no es una tarjeta: cada
    // frase va como consecuencia dentro del cajón de su regla. «Cancelar y
    // recuperar» eran siete campos y un cajón lleva seis: lo de la clase entera
    // salió a su propia fila.
    tarjetas: [
      { id: 'reservar', titulo: 'Reservar', frase: 'Quién puede reservar, con cuánta antelación y cuántas reservas a la vez.', guardado: 'barra', palabras: ['antelación', 'bono', 'plan', 'aprobar reservas', 'impago'] },
      { id: 'cancelar-y-recuperar', titulo: 'Cancelar y recuperar', frase: 'Hasta cuándo se cancela sin perder la sesión y cuánto dura una recuperación.', guardado: 'barra', palabras: ['cancelación', 'plazo', 'recuperaciones'] },
      { id: 'si-se-cancela-una-clase', titulo: 'Si se cancela una clase entera', frase: 'Si tus alumnas recuperan la sesión cuando una clase no sale, y cuántas hacen falta para que salga.', guardado: 'barra', palabras: ['mínimo de asistentes', 'clase cancelada'] },
      { id: 'lista-de-espera', titulo: 'Lista de espera', frase: 'Si una clase llena admite lista de espera y cuánto tiempo hay para aceptar una plaza que se libera.', guardado: 'barra', palabras: ['plaza libre', 'clase llena'] },
      { id: 'asistencia', titulo: 'Asistencia', frase: 'Si pasas lista en cada clase y si pides confirmación a quien suele faltar.', guardado: 'barra', palabras: ['pasar lista', 'check-in', 'qr'] },
      { id: 'si-cancela-tarde-o-no-viene', titulo: 'Si cancela tarde o no viene', frase: 'Un cargo fijo a su tarjeta guardada, si tiene una, cuando cancela tarde o no viene sin avisar.', guardado: 'barra', palabras: ['penalización', 'cargo', 'falta sin avisar'] },
      { id: 'si-se-queda-sin-cuota', titulo: 'Si se queda sin cuota', frase: 'Qué pasa con las clases de su plaza fija cuando su cuota se cancela, se pausa o no se renueva.', guardado: 'barra', palabras: ['plaza fija', 'clases fijas', 'cuota', 'baja', 'impago', 'pausa'] },
      { id: 'plaza-fija-desde-la-app', titulo: 'Peticiones desde su app', frase: 'Si tus alumnas pueden pedir una plaza fija o una pausa desde su app, para que lo apruebes tú.', guardado: 'barra', palabras: ['plaza fija', 'pausa', 'app', 'autoservicio', 'pedir'] },
      { id: 'si-pausa-su-plaza-fija', titulo: 'Si pausa su plaza fija', frase: 'Si durante una pausa su sitio queda libre para otra alumna, y qué pasa al terminar.', guardado: 'barra', palabras: ['plaza fija', 'pausa', 'vacaciones', 'sitio', 'volver'] },
      { id: 'ajuste-avisar-alumnas', titulo: 'Avisos a las alumnas', frase: 'Si por una baja una clase cambia de instructora, se mueve o se cancela, avisa a sus alumnas por email y en su app.', guardado: 'al-pulsar', palabras: ['sustitución', 'cambio de instructora'] },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cobros y facturas',
    resumen: 'Datos fiscales, Stripe, domiciliaciones y devoluciones',
    frase: 'Cómo te pagan tus alumnas y qué sale en tus facturas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'datos-fiscales', titulo: 'Datos fiscales e IVA', frase: 'Razón social, NIF e IVA de tus facturas. Cambiar el IVA solo afecta a las facturas nuevas.', guardado: 'barra', palabras: ['nif', 'cif', 'razón social', 'facturas', 'impuestos'] },
      { id: 'integracion-stripe', titulo: 'Cobro con tarjeta (Stripe)', frase: 'Cobra bonos y cuotas con tarjeta en tu propia cuenta de Stripe: el dinero entra directo en ella.', guardado: 'accion', palabras: ['pago online', 'tarjeta'] },
      { id: 'domiciliaciones', titulo: 'Domiciliaciones bancarias', frase: 'Los datos que pide tu banco para cobrar recibos domiciliados. Con ellos generas la remesa en Cobros.', guardado: 'barra', palabras: ['sepa', 'banco', 'remesa', 'recibos'] },
      { id: 'devoluciones', titulo: 'Devoluciones', frase: 'Permite devolver un cobro desde la ficha de la alumna; el dinero vuelve a su tarjeta.', guardado: 'barra', palabras: ['reembolso', 'devolver'] },
      { id: 'si-se-cancela-una-cuota', titulo: 'Si se cancela una cuota', frase: 'Qué pasa con su recibo pendiente al cancelarla, y si la alumna puede renovarla sola desde su app.', guardado: 'barra', palabras: ['recibo pendiente', 'deuda', 'anular recibo', 'reintentos', 'impago', 'renovar'] },
    ],
  },
  {
    id: 'altas',
    titulo: 'Alta de alumnas',
    resumen: 'Contrato, compra desde tu enlace, ficha y salud',
    frase: 'Lo que acepta y rellena una alumna nueva, y qué datos guardas de cada una.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'contrato-y-privacidad', titulo: 'Contrato y privacidad', frase: 'Los textos que acepta cada alumna al darse de alta. Se guarda qué aceptó, cuándo y con qué nombre.', guardado: 'barra', palabras: ['términos', 'condiciones', 'rgpd', 'firma'] },
      { id: 'compra-desde-tu-enlace', titulo: 'Compra desde tu enlace', frase: 'Si alguien que aún no es alumna compra un bono en tu página: que se registre antes de pagar o que pague directamente.', guardado: 'barra', palabras: ['registro', 'comprar un bono'] },
      { id: 'datos-extra-de-la-ficha', titulo: 'Datos extra de la ficha', frase: 'Preguntas tuyas, como su objetivo o cómo te conoció. Salen al darla de alta y en su ficha.', guardado: 'catalogo', palabras: ['campos', 'preguntas'] },
      { id: 'valoracion-inicial', titulo: 'Valoración inicial', frase: 'Tus alumnas te cuentan qué buscan antes de sus primeras clases.', guardado: 'al-pulsar', palabras: ['objetivos'] },
      { id: 'cuestionario-de-salud', titulo: 'Cuestionario de salud', frase: 'Preguntas de salud que rellenáis tú o tus instructoras en la ficha de cada alumna; ella no lo rellena.', guardado: 'catalogo', palabras: ['lesiones'] },
    ],
  },
  {
    id: 'comunicacion',
    titulo: 'Cómo me comunico',
    resumen: 'Correos, WhatsApp y Gmail',
    frase: 'Los correos que Tentare envía sola a tus alumnas y los canales para escribirles.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'correos-automaticos', titulo: 'Correos automáticos', frase: 'Bienvenida, reserva, recordatorio, cancelación…: apaga los que no quieras o cambia lo que dicen.', guardado: 'catalogo', herramienta: 'correos-automaticos', palabras: ['emails', 'recordatorio', 'bienvenida', 'plantillas'] },
      { id: 'avisos-del-movil', titulo: 'Avisos en el móvil', frase: 'Cuándo le llega a cada alumna el recordatorio de su clase y qué dicen los avisos de su móvil, con tus palabras.', guardado: 'catalogo', herramienta: 'avisos-del-movil', palabras: ['push', 'notificaciones', 'antelación', 'recordatorio de clase', 'textos'] },
      { id: 'integracion-resend', titulo: 'Nombre y respuesta de tus correos', frase: 'El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas.', guardado: 'catalogo', palabras: ['remitente', 'emails'] },
      { id: 'integracion-whatsapp', titulo: 'WhatsApp', frase: 'Recordatorios y avisos desde tu número de WhatsApp Business.', guardado: 'accion', palabras: ['mensajes'] },
      { id: 'integracion-gmail', titulo: 'Contactos de Gmail', frase: 'Trae los contactos de tu Gmail como alumnas nuevas. Los correos no salen desde tu Gmail.', guardado: 'accion' },
    ],
  },
  {
    id: 'motivacion',
    titulo: 'Motivación',
    resumen: 'Créditos, recompensas, logros y retos',
    frase: 'Premia la constancia de tus alumnas con créditos, logros y retos que ven en su app.',
    roles: SOLO_PROPIETARIA,
    palabras: ['gamificación', 'puntos'],
    // Las reglas se guardaban al salir de cada campo; desde el 15-sep (v2) son
    // dos filas con cajón y un solo «Guardar»: eran diez campos y un cajón
    // lleva unos seis, así que lo que se gana con cada cosa va aparte.
    tarjetas: [
      { id: 'reglas', titulo: 'Cómo funcionan tus créditos', frase: 'Cómo se llaman, cuánto duran y cuántas clases por semana mantienen la racha de una alumna.', guardado: 'barra', palabras: ['racha', 'puntos', 'caducidad'] },
      { id: 'creditos-por-accion', titulo: 'Créditos por acción', frase: 'Cuántos créditos gana una alumna con cada cosa: asistir, renovar, traer a alguien o comprar.', guardado: 'barra', palabras: ['referidos', 'asistencia', 'compra'] },
      { id: 'recompensas', titulo: 'Recompensas', frase: 'Lo que tus alumnas pueden canjear con sus créditos.', guardado: 'catalogo', herramienta: 'recompensas-y-logros', palabras: ['premios'] },
      { id: 'canjes', titulo: 'Canjes pendientes', frase: 'Recompensas pedidas que tienes que entregar.', guardado: 'accion', herramienta: 'recompensas-y-logros' },
      { id: 'logros', titulo: 'Logros', frase: 'Lo que desbloquean tus alumnas al llegar a una cifra que eliges, como 10 clases.', guardado: 'catalogo', herramienta: 'recompensas-y-logros', palabras: ['insignias'] },
      { id: 'niveles', titulo: 'Niveles', frase: 'El nivel sube con los créditos ganados en total; canjear nunca lo hace bajar.', guardado: 'catalogo', herramienta: 'recompensas-y-logros' },
      { id: 'retos', titulo: 'Retos', frase: 'Objetivos con fecha de inicio y fin: solo cuenta lo que pasa dentro de ese periodo.', guardado: 'catalogo', herramienta: 'recompensas-y-logros', palabras: ['desafíos'] },
      { id: 'codigos-descuento', titulo: 'Códigos de descuento', frase: 'Códigos que tus alumnas usan al pagar, o que canjeas tú en el mostrador.', guardado: 'catalogo', herramienta: 'codigos-descuento', palabras: ['descuento', 'promoción', 'cupón', 'oferta'] },
    ],
  },
  // «Marca» salió de «Mi app y mi web» el 15-sep (v2): el logo estaba en una
  // sección y el color en otra pantalla (/configuracion/apariencia/panel).
  {
    id: 'marca',
    titulo: 'Marca',
    resumen: 'Logo, color y textos de tu app',
    frase: 'Cómo te reconocen tus alumnas: tu logo, tu color y cómo te presentas en su app.',
    roles: SOLO_PROPIETARIA,
    palabras: ['imagen', 'identidad'],
    // Filas con su valor de hoy (16-sep, v2). Convivían TRES formas de guardar en
    // la misma pantalla —el logo al soltarlo, «Guardar colores» en línea y una
    // barra de sección abajo—, que es la queja del fundador. Ahora cada fila
    // declara la suya con su forma: el color y los textos esperan al «Guardar»
    // de su cajón, y solo las imágenes se guardan al elegirlas, porque el
    // archivo ya se sube a ese instante y ningún «Descartar» lo devolvería
    // (ver tab-marca.tsx). «Textos de tu app» eran SIETE campos y un cajón lleva
    // como mucho seis: se partió en dos por dónde se lee cada frase.
    tarjetas: [
      // Era `marca`, que ahora es el id de la sección: su ancla vieja lleva aquí (destino.ts).
      { id: 'logo-y-favicon', titulo: 'Logo y favicon', frase: 'Se aplican al momento: el logo, en la app de tus alumnas, y el favicon, en la pestaña de tu página de reservas.', guardado: 'al-pulsar', palabras: ['icono', 'imagen'] },
      { id: 'color-de-marca', titulo: 'El color de tu marca', frase: 'Tiñe tu panel, tu página de reservas y la app de tus alumnas. Lo ves aplicado mientras lo eliges.', guardado: 'barra', palabras: ['colores', 'tema', 'apariencia'] },
      // Su ancla y su id se quedan: los llevan enlaces de la guía, de la ayuda y
      // de correos ya enviados.
      { id: 'textos-de-tu-app', titulo: 'Cómo te presentas', frase: 'Tu descripción, tu lema, tu año de apertura y las normas de tu centro.', guardado: 'barra', palabras: ['presentación', 'lema', 'normas', 'textos de tu app'] },
      { id: 'textos-de-bienvenida', titulo: 'Textos de bienvenida', frase: 'Las frases que lee tu alumna al abrir su app: bajo el saludo, en la portada y a mano.', guardado: 'barra', palabras: ['bienvenida', 'frase a mano', 'portada'] },
    ],
  },
  {
    id: 'web',
    titulo: 'Mi app y mi web',
    resumen: 'Enlaces, Network, contenido de tu app y widgets',
    frase: 'Cómo se ve tu estudio por fuera: la app de tus alumnas, tu página de reservas y tu web.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'direccion-y-enlaces', titulo: 'Dirección y enlaces', frase: 'La dirección de tu página de reservas, el enlace a la app de tus alumnas y el código QR de cada uno para imprimir.', guardado: 'accion', palabras: ['enlace', 'página de reservas', 'url', 'qr', 'código qr', 'cartel', 'escaparate'] },
      { id: 'pagina-publica', titulo: 'Ocultar tu página', frase: 'Mientras la preparas, tu página de reservas y la app de tus alumnas enseñan un aviso en vez de tus clases.', guardado: 'barra', palabras: ['ocultar', 'privada', 'visible', 'esconder', 'clave'] },
      // El directorio NO mira si la página está oculta (lib/configuracion/pagina-publica.ts):
      // se dice aquí, que es donde las dos filas conviven, y no solo dentro del cajón de ocultarla.
      { id: 'network', titulo: 'Aparecer en Tentare Network', frase: 'Tu estudio sale en el buscador de estudios de Tentare. Aunque ocultes tu página, seguirá saliendo ahí.', guardado: 'al-pulsar', palabras: ['directorio', 'buscador de estudios'] },
      { id: 'contenido-de-tu-app', titulo: 'Contenido de tu app', frase: 'Tarjetas de «Descubre», mensaje destacado y avisos del tablón en el inicio de su app.', guardado: 'catalogo', ancho: 'amplio', herramienta: 'contenido-de-tu-app', palabras: ['descubre', 'tablón', 'mensaje destacado'] },
      { id: 'widgets', titulo: 'Widgets para tu web', frase: 'El horario, las citas o una clase concreta dentro de tu propia web, con un código para pegar.', guardado: 'accion', ancho: 'amplio', herramienta: 'widgets', palabras: ['incrustar', 'código', 'visitas'] },
    ],
  },
  {
    id: 'equipo',
    titulo: 'Mi equipo',
    resumen: 'Roles, sustituciones, pagos y la app de tus instructoras',
    frase: 'Qué puede hacer cada persona de tu equipo, cómo se cubren las bajas y cómo les pagas.',
    roles: SOLO_PROPIETARIA,
    // Filas con su valor de hoy (16-sep, v2), como el resto: el sí/no de crear
    // clases se guarda al tocarlo, y lo que se gestiona en otra pantalla
    // (Equipo, Sustituciones, Tarifas y liquidaciones) es una fila que lleva allí
    // (`FILAS_A_OTRA_PANTALLA`). Qué hace cada rol se cuenta en filas de solo
    // lectura (lib/configuracion/que-hace-cada-rol.ts): los roles se dan en Equipo.
    palabras: ['roles', 'permisos', 'sustituciones', 'tarifa', 'liquidación'],
    tarjetas: [
      // «siempre pueden editar las suyas» dejó de ser verdad al retirarse Tentare
      // Core (14-sep): la instructora solo trabaja en la app, y allí no edita clases.
      { id: 'ajuste-instructoras-crean-clases', titulo: 'Las instructoras crean sus clases', frase: 'Si pueden crear clases suyas desde su app o solo dan las que tú les asignas.', guardado: 'al-pulsar', palabras: ['profesoras', 'nueva clase'] },
      { id: 'app-de-tus-instructoras', titulo: 'La app de tus instructoras', frase: 'El enlace para que entren con su cuenta a su agenda, sus bajas, su disponibilidad y sus alumnas.', guardado: 'accion', palabras: ['app instructoras', 'profesoras', 'enlace'] },
    ],
  },
  {
    id: 'conexiones',
    titulo: 'Conexiones',
    resumen: 'Calendario, Zoom y otras apps',
    frase: 'Tentare conectado con otras herramientas que ya usas.',
    roles: SOLO_PROPIETARIA,
    // Cada conexión es una FILA con UN estado y se agrupan por cómo están (15-sep,
    // v2): «Más integraciones» juntaba cuatro tarjetas en una y su ancla lleva
    // ahora a la primera (destino.ts). Stripe, WhatsApp y Gmail viven en Cobros y
    // en Cómo me comunico.
    tarjetas: [
      { id: 'integracion-google_calendar', titulo: 'Google Calendar', frase: 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.', guardado: 'accion', palabras: ['calendario'] },
      { id: 'integracion-zoom', titulo: 'Zoom', frase: 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.', guardado: 'accion', palabras: ['online', 'videollamada'] },
      { id: 'integracion-kisi', titulo: 'Kisi', frase: 'Abre la puerta de tu estudio sola con cada check-in de tus alumnas.', guardado: 'accion', palabras: ['puerta', 'cerradura'] },
      { id: 'integracion-klaviyo', titulo: 'Klaviyo', frase: 'Lleva a Klaviyo las alumnas que aceptaron recibir marketing, cada vez que pulsas «Sincronizar ahora».', guardado: 'accion', palabras: ['marketing', 'listas'] },
      { id: 'integracion-mailchimp', titulo: 'Mailchimp', frase: 'Lleva a tu audiencia de Mailchimp las alumnas que aceptaron recibir marketing, al pulsar «Sincronizar ahora».', guardado: 'accion', palabras: ['marketing', 'newsletter', 'audiencia'] },
      { id: 'integracion-zapier', titulo: 'Zapier', frase: 'Conecta Tentare con miles de apps. La conexión se autoriza desde Zapier, no desde aquí.', guardado: 'accion', palabras: ['automatizar', 'apps'] },
      { id: 'aplicaciones-con-acceso', titulo: 'Aplicaciones con acceso', frase: 'Apps como Zapier con permiso para ver datos de tu estudio; puedes quitárselo.', guardado: 'accion', palabras: ['zapier', 'permisos'] },
    ],
  },
  {
    id: 'datos',
    titulo: 'Datos y seguridad',
    resumen: 'Exportar tus datos',
    frase: 'Llévate una copia de los datos de tu estudio cuando quieras.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      // La única forma de llevarte tus datos: «Exportar a Excel» se retiró el
      // 15-sep y su ancla vieja lleva aquí (lib/configuracion/destino.ts).
      { id: 'exportar', titulo: 'Exportar mis datos', frase: 'Un archivo CSV por tabla, que abre Excel: alumnas, reservas, suscripciones y bonos, recibos y pagos importados. No incluye ficha clínica ni notas de progreso.', guardado: 'accion', palabras: ['descargar', 'copia', 'csv', 'excel'] },
    ],
  },
  // «Mis avisos» y «Tu panel» eran pantallas sueltas que no enlazaba nadie
  // (/configuracion/notificaciones) o que se abrían desde Apariencia
  // (/configuracion/apariencia/panel). Sus URLs siguen llevando aquí (destino.ts).
  {
    id: 'avisos',
    titulo: 'Mis avisos',
    resumen: 'Qué avisos te llegan y por dónde',
    frase: 'Los avisos que te llegan a ti, no los de tus alumnas.',
    roles: SOLO_PROPIETARIA,
    palabras: ['notificaciones', 'alertas'],
    // La sección era el componente de preferencias entero, sin una sola línea
    // que dijera cómo están (16-sep, v2). Ahora es una fila con su valor y la
    // tabla se abre en su pantalla (`?tab=avisos&abrir=tus-avisos`): ahí cada
    // interruptor se guarda al tocarlo, sin mezclarse con el «Guardar» de un cajón.
    tarjetas: [
      { id: 'tus-avisos', titulo: 'Tipos de aviso', frase: 'Enciende o apaga cada tipo de aviso, dentro del panel o como notificación push.', guardado: 'al-pulsar', herramienta: 'tus-avisos', palabras: ['push', 'móvil'] },
    ],
  },
  {
    id: 'panel',
    titulo: 'Tu panel',
    resumen: 'Menú, Inicio y modo claro u oscuro',
    frase: 'Cómo se ordena tu panel: el menú y el Inicio los ve tu equipo; el modo oscuro, solo tú.',
    roles: SOLO_PROPIETARIA,
    palabras: ['personalizar'],
    // Filas con su valor de hoy (16-sep, v2): era la ÚLTIMA sección con barra de
    // guardar propia. Menú, Inicio y posición son campos del MISMO documento
    // (`studio_layout`), así que cada cajón manda solo el suyo gracias a que solo
    // se abre uno a la vez y cerrar sin guardar descarta (seccion-panel.tsx).
    tarjetas: [
      { id: 'menu-del-panel', titulo: 'Tu menú', frase: 'Ordena los módulos dentro de su grupo y esconde los que no uses. Inicio, Configuración y Suscripción siempre se ven.', guardado: 'barra', palabras: ['módulos', 'ocultar', 'orden'] },
      { id: 'inicio-del-panel', titulo: 'Tu Inicio', frase: 'Ordena y esconde las secciones de tu pantalla de Inicio. Los avisos de estado van siempre arriba.', guardado: 'barra', palabras: ['secciones', 'pantalla principal'] },
      { id: 'posicion-del-menu', titulo: 'Dónde va el menú', frase: 'A la izquierda o arriba, en el ordenador. En el móvil el menú no cambia.', guardado: 'barra', palabras: ['izquierda', 'arriba'] },
      { id: 'claro-u-oscuro', titulo: 'Claro u oscuro', frase: 'Solo para ti y en este navegador: no cambia nada a nadie más de tu equipo.', guardado: 'al-pulsar', palabras: ['modo oscuro', 'noche'] },
    ],
  },
] as const satisfies readonly SeccionConfiguracion[];

export type TarjetaId = (typeof SECCIONES)[number]['tarjetas'][number]['id'];

/** «Mi cuenta» no es una sección: es la última fila, que lleva a /mi-perfil. */
export const MI_CUENTA = { titulo: 'Mi cuenta', resumen: 'Tu nombre, tu foto y cómo entras.', href: '/mi-perfil' } as const;

export type FilaExternaId = 'plan' | 'mi-cuenta';

/** Una fila del inicio que lleva a OTRA pantalla del panel, no a una sección. */
export interface FilaExterna {
  readonly id: FilaExternaId;
  readonly titulo: string;
  /** La línea corta, cuando no se sabe cómo está. */
  readonly resumen: string;
  readonly href: string;
  readonly palabras?: readonly string[];
  /** Quién la ve. Sin esto, solo la propietaria. */
  readonly roles?: readonly RolConfiguracion[];
}

/**
 * «Plan de Tentare» enseña cómo está tu suscripción y lleva a /suscripcion, que
 * se queda como pantalla propia: a ella vuelve Stripe tras pagar, y su entrada
 * del menú no se puede esconder (`NO_OCULTABLES`).
 */
export const FILAS_EXTERNAS: Readonly<Record<FilaExternaId, FilaExterna>> = {
  // Lo que paga el estudio a Tentare: la cuenta es de la propietaria.
  plan: { id: 'plan', titulo: 'Plan de Tentare', resumen: 'Lo que pagas tú a Tentare, no tus alumnas', href: '/suscripcion', palabras: ['suscripción', 'prueba gratuita', 'precio'] },
  // Su propio perfil: a /mi-perfil llega todo el personal del panel.
  'mi-cuenta': { id: 'mi-cuenta', ...MI_CUENTA, resumen: 'Tu nombre, tu foto y cómo entras', palabras: ['perfil', 'foto'], roles: ['PROPIETARIO', 'MANAGER', 'RECEPCION'] },
};

/**
 * Filas DENTRO de una sección que llevan a otra pantalla del panel, con su icono
 * de salida: lo que se configura aquí y se usa allí. No son pantallas nuevas.
 */
export interface FilaAOtraPantalla {
  readonly id: string;
  readonly seccion: SeccionId;
  readonly titulo: string;
  /** La línea corta, cuando no se sabe cómo está. */
  readonly resumen: string;
  readonly href: string;
}

export const FILAS_A_OTRA_PANTALLA = [
  { id: 'fila-paquetes', seccion: 'cobros', titulo: 'Paquetes', resumen: 'Tus planes, bonos y precios', href: '/productos' },
  { id: 'fila-cobros', seccion: 'cobros', titulo: 'Cobros', resumen: 'Quién te debe, lo cobrado y tus facturas', href: '/cobros' },
  { id: 'fila-automatizaciones', seccion: 'comunicacion', titulo: 'Automatizaciones', resumen: 'Lo que Tentare hace solo y las reglas que enciendes tú', href: '/automatizaciones' },
  // El modo de autonomía y la tarifa se cambian en su pantalla: su único
  // escritor es su ruta de servidor (`/api/sustituciones`, `/api/equipo/tarifas`).
  { id: 'fila-sustituciones', seccion: 'equipo', titulo: 'Sustituciones', resumen: 'Cuánto decide Tentare cuando alguien no puede dar su clase', href: '/sustituciones' },
  { id: 'fila-liquidaciones', seccion: 'equipo', titulo: 'Tarifas y liquidaciones', resumen: 'Lo que cobra cada instructora y lo que le debes cada mes', href: '/equipo/liquidaciones' },
  { id: 'fila-equipo', seccion: 'equipo', titulo: 'Equipo', resumen: 'Da de alta a cada persona y elige su rol', href: '/equipo' },
] as const satisfies readonly FilaAOtraPantalla[];

export interface GrupoConfiguracion {
  readonly id: string;
  readonly titulo: string;
  readonly secciones: readonly SeccionId[];
  /** Filas que llevan a otra pantalla, detrás de las secciones del grupo. */
  readonly externas?: readonly FilaExternaId[];
}

/**
 * Los grupos del inicio de Configuración, de lo que abre el estudio a lo que se
 * toca una vez. Once secciones seguidas no se leían: «Mi app y mi web»,
 * «Conexiones» y «Datos» quedaban bajo el pliegue sin nada que dijera qué eran.
 * `SECCIONES` va en este mismo orden, para que la columna de la izquierda y el
 * inicio no cuenten dos órdenes distintos.
 */
export const GRUPOS: readonly GrupoConfiguracion[] = [
  { id: 'lo-basico', titulo: 'Lo básico', secciones: ['estudio', 'clases', 'reservas', 'cobros'] },
  { id: 'tus-alumnas', titulo: 'Tus alumnas', secciones: ['altas', 'comunicacion', 'motivacion'] },
  { id: 'tu-imagen', titulo: 'Tu imagen', secciones: ['marca', 'web'] },
  { id: 'equipo', titulo: 'Equipo', secciones: ['equipo'] },
  { id: 'conexiones-y-datos', titulo: 'Conexiones y datos', secciones: ['conexiones', 'datos'] },
  { id: 'tu-cuenta', titulo: 'Tu cuenta', secciones: ['avisos', 'panel'], externas: ['plan', 'mi-cuenta'] },
];

const SECCION_POR_ID = new Map<string, SeccionConfiguracion>(SECCIONES.map(s => [s.id, s]));
const TARJETA_POR_ID = new Map<string, { tarjeta: TarjetaConfiguracion; seccion: SeccionId }>(
  SECCIONES.flatMap(s => s.tarjetas.map(t => [t.id, { tarjeta: t as TarjetaConfiguracion, seccion: s.id }] as const)),
);

export function esSeccionId(v: string): v is SeccionId {
  return SECCION_POR_ID.has(v);
}

export function seccionPorId(id: SeccionId): SeccionConfiguracion {
  return SECCION_POR_ID.get(id)!;
}

export function tarjetaPorId(id: TarjetaId): TarjetaConfiguracion {
  return TARJETA_POR_ID.get(id)!.tarjeta;
}

export function esTarjetaId(v: string): v is TarjetaId {
  return TARJETA_POR_ID.has(v);
}

/** Quién ve la tarjeta: la propietaria siempre; el resto, si la tarjeta lo dice. */
export function rolesDeTarjeta(t: TarjetaConfiguracion): readonly RolConfiguracion[] {
  return t.roles ?? SOLO_PROPIETARIA;
}

/** ¿Este rol ve (y puede tocar) esa tarjeta? */
export function tarjetaVisible(id: TarjetaId, rol: RolConfiguracion | string): boolean {
  return (rolesDeTarjeta(TARJETA_POR_ID.get(id)!.tarjeta) as readonly string[]).includes(rol);
}

/** ¿Este rol ve esa fila de otra pantalla («Plan de Tentare», «Mi cuenta»)? */
export function externaVisible(f: FilaExterna, rol: RolConfiguracion | string): boolean {
  return ((f.roles ?? SOLO_PROPIETARIA) as readonly string[]).includes(rol);
}

/** La sección donde se pinta la tarjeta. */
export function seccionDeTarjeta(id: TarjetaId): SeccionId {
  return TARJETA_POR_ID.get(id)!.seccion;
}

// ─── Herramientas ────────────────────────────────────────────────────────────
//
// «Mi app y mi web» medía unas diez pantallas de móvil: un interruptor
// («Aparecer en Tentare Network») iba justo encima del constructor de widgets
// entero, con su vista previa y su código. El fundador: «secciones muy largas»,
// «mezcla de cosas muy distintas». Lo que es una herramienta de trabajo —un
// catálogo, un editor— sale a su propia pantalla, y en su sección queda una fila
// que dice cómo está (lib/configuracion/resumenes.ts).
//
// Una herramienta de una sola tarjeta se llama como ella, y su pantalla es esa
// tarjeta sin repetir el título. La de motivación junta cinco.

export interface HerramientaConfiguracion {
  readonly id: HerramientaId;
  readonly seccion: SeccionId;
  readonly titulo: string;
  /** Una sola frase, bajo el título de su pantalla. */
  readonly frase: string;
  /** La línea de su fila cuando no se sabe cómo está. */
  readonly resumen: string;
}

function deTarjeta(id: HerramientaId & TarjetaId, resumen: string): HerramientaConfiguracion {
  const { tarjeta, seccion } = TARJETA_POR_ID.get(id)!;
  return { id, seccion, titulo: tarjeta.titulo, frase: tarjeta.frase, resumen };
}

/** En el orden de las secciones, y dentro de cada una en el de sus tarjetas. */
export const HERRAMIENTAS: readonly HerramientaConfiguracion[] = [
  deTarjeta('salas', 'Tus salas, su aforo y las máquinas en avería'),
  deTarjeta('tipos-de-clase', 'Nombre, duración, plazas y sus propias reglas'),
  deTarjeta('correos-automaticos', 'Apágalos o cambia lo que dicen'),
  {
    id: 'recompensas-y-logros',
    seccion: 'motivacion',
    titulo: 'Recompensas, logros y retos',
    frase: 'Lo que tus alumnas canjean con sus créditos, lo que desbloquean y los retos con fecha que ven en su app.',
    resumen: 'Recompensas, canjes, logros, niveles y retos',
  },
  deTarjeta('codigos-descuento', 'Códigos que usan tus alumnas al pagar'),
  deTarjeta('contenido-de-tu-app', 'Mensaje destacado, tarjetas y avisos del tablón'),
  deTarjeta('widgets', 'Tu horario y tus reservas dentro de tu web'),
  deTarjeta('tus-avisos', 'Cada tipo de aviso, en el panel y en el móvil'),
  deTarjeta('avisos-del-movil', 'Cuándo llega el recordatorio y qué dice cada aviso'),
];

const HERRAMIENTA_POR_ID = new Map<string, HerramientaConfiguracion>(HERRAMIENTAS.map(h => [h.id, h]));

export function esHerramientaId(v: string): v is HerramientaId {
  return HERRAMIENTA_POR_ID.has(v);
}

export function herramientaPorId(id: HerramientaId): HerramientaConfiguracion {
  return HERRAMIENTA_POR_ID.get(id)!;
}

/** La herramienta en cuya pantalla se pinta la tarjeta, o `null` si va en su sección. */
export function herramientaDeTarjeta(id: TarjetaId): HerramientaId | null {
  return TARJETA_POR_ID.get(id)!.tarjeta.herramienta ?? null;
}

/** Las tarjetas de la pantalla de una herramienta, en su orden. */
export function tarjetasDeHerramienta(id: HerramientaId): TarjetaId[] {
  return [...TARJETA_POR_ID].filter(([, v]) => v.tarjeta.herramienta === id).map(([t]) => t as TarjetaId);
}

/** Una herramienta se abre si este rol ve alguna de sus tarjetas. */
export function herramientaVisible(id: HerramientaId, rol: RolConfiguracion | string): boolean {
  return tarjetasDeHerramienta(id).some(t => tarjetaVisible(t, rol));
}

export function herramientasDeSeccion(id: SeccionId): HerramientaConfiguracion[] {
  return HERRAMIENTAS.filter(h => h.seccion === id);
}

export function cumpleCondicion(
  condicion: CondicionTarjeta | undefined,
  ctx: { haySedes: boolean; esCadena: boolean },
): boolean {
  if (condicion === 'multiSede') return ctx.haySedes;
  if (condicion === 'cadena') return ctx.esCadena;
  return true;
}
