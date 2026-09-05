// ─────────────────────────────────────────────────────────────────────────────
// Centro de Ayuda (/ayuda) — FUENTE ÚNICA DE VERDAD del contenido.
//
// Mismo principio que lib/seo/paginas.ts: un registro de datos del que se
// derivan la home, las páginas de categoría, la búsqueda, las migas de pan, los
// "artículos relacionados" y el sitemap — nada de eso se mantiene a mano en dos
// sitios. A diferencia de /recursos (una carpeta por artículo, ~10 guías
// escritas a mano), aquí se espera crecer a decenas de artículos por
// categoría, así que las páginas de artículo son UNA ruta dinámica
// (app/ayuda/[categoria]/[articulo]) que resuelve metadata y contenido desde
// este registro — el cuerpo de cada artículo vive en su propio componente bajo
// components/ayuda/articulos/, referenciado aquí por `slug`.
//
// Un artículo con `estado: 'proximamente'` no tiene componente de contenido:
// aparece en la categoría como "en preparación" (mismo patrón que ARTICLES en
// app/recursos/page.tsx) para dejar la arquitectura completa sin publicar
// documentación inventada de algo que no se ha escrito todavía.
// ─────────────────────────────────────────────────────────────────────────────

export type GrupoAyuda =
  | 'empezar' | 'reservas' | 'clientes' | 'instructores' | 'pagos' | 'bonos'
  | 'portal' | 'widget' | 'automatizaciones' | 'integraciones' | 'app'
  | 'configuracion' | 'informes' | 'problemas';

export interface CategoriaAyuda {
  slug: GrupoAyuda;
  titulo: string;
  descripcion: string;
  /** Nombre de icono de lucide-react, resuelto en components/ayuda/iconos.ts. */
  icono: string;
}

export const CATEGORIAS: CategoriaAyuda[] = [
  { slug: 'empezar', titulo: 'Empezar con Tentare', descripcion: 'Crea tu cuenta, configura tu estudio y prepara tu primera semana de clases.', icono: 'Sparkles' },
  { slug: 'reservas', titulo: 'Reservas y calendario', descripcion: 'Clases, horarios, lista de espera, cancelaciones y las reglas con las que reserva cada alumna.', icono: 'CalendarDays' },
  { slug: 'clientes', titulo: 'Clientes y CRM', descripcion: 'Ficha de cada alumna, historial, notas e importación desde tu software anterior.', icono: 'Users' },
  { slug: 'instructores', titulo: 'Instructoras y equipo', descripcion: 'Altas, disponibilidad, tarifas, permisos y sustituciones cuando alguien no puede dar su clase.', icono: 'UserRound' },
  { slug: 'pagos', titulo: 'Pagos y facturación', descripcion: 'Stripe, tarjeta guardada, cobros fallidos, reembolsos y factura de cada cobro.', icono: 'CreditCard' },
  { slug: 'bonos', titulo: 'Bonos y membresías', descripcion: 'Bonos de sesiones, cuotas mensuales, plazas fijas, créditos y caducidades.', icono: 'Ticket' },
  { slug: 'portal', titulo: 'Portal de reservas', descripcion: 'La página pública donde tus alumnas reservan: personalización, marca y acceso.', icono: 'LayoutTemplate' },
  { slug: 'widget', titulo: 'Widget para tu web', descripcion: 'Incrusta las reservas de Tentare en tu propia web, con WordPress, Webflow o HTML.', icono: 'CodeXml' },
  { slug: 'automatizaciones', titulo: 'Automatizaciones y avisos', descripcion: 'Recordatorios, avisos de bono a punto de acabar y notificaciones automáticas por email y WhatsApp.', icono: 'Zap' },
  { slug: 'integraciones', titulo: 'Integraciones', descripcion: 'Qué conecta con Tentare hoy y cómo activarlo.', icono: 'Plug' },
  { slug: 'app', titulo: 'App de tus alumnas', descripcion: 'Lo que ve una clienta en su móvil: próxima clase, plan, progreso y recompensas.', icono: 'Smartphone' },
  { slug: 'configuracion', titulo: 'Configuración de tu cuenta', descripcion: 'Datos del estudio, usuarios y permisos, marca, idioma y seguridad.', icono: 'Settings2' },
  { slug: 'informes', titulo: 'Informes y analítica', descripcion: 'Ocupación, ingresos, retención y el rendimiento de cada instructora.', icono: 'BarChart3' },
  { slug: 'problemas', titulo: 'Problemas y soluciones', descripcion: 'Cuando algo no va: acceso, pagos, reservas y el widget.', icono: 'LifeBuoy' },
];

const CATEGORIA_SLUGS = new Set(CATEGORIAS.map((c) => c.slug));

export interface ArticuloAyuda {
  /** Único DENTRO de su categoría — la URL es /ayuda/{categoria}/{slug}. */
  slug: string;
  categoria: GrupoAyuda;
  tipo: 'guia' | 'problema';
  titulo: string;
  /** Un par de frases: subtítulo en pantalla y meta description. */
  descripcion: string;
  /** Términos adicionales para la búsqueda (sinónimos, nombres de menú). No se muestra. */
  terminos?: string[];
  actualizado: string;
  /** Slugs completos "categoria/articulo" de otros artículos de este registro. */
  relacionados?: string[];
  estado: 'publicado' | 'proximamente';
}

export const ARTICULOS: ArticuloAyuda[] = [
  // ─── Empezar ────────────────────────────────────────────────────────────
  {
    slug: 'crear-tu-cuenta', categoria: 'empezar', tipo: 'guia',
    titulo: 'Cómo crear tu cuenta y dar de alta tu estudio',
    descripcion: 'Los tres pasos de /crear-estudio: nombre del estudio, tu plan de prueba y tu acceso. Sin tarjeta, 7 días de prueba real.',
    terminos: ['registro', 'alta', 'prueba gratis', 'trial', 'primer acceso'],
    actualizado: '2026-08-28',
    relacionados: ['empezar/configurar-tu-estudio', 'empezar/primera-semana-de-clases', 'pagos/prueba-de-7-dias'],
    estado: 'publicado',
  },
  {
    slug: 'configurar-tu-estudio', categoria: 'empezar', tipo: 'guia',
    titulo: 'Configura los datos de tu estudio',
    descripcion: 'Nombre, NIF, dirección, color de marca y logo — todo lo que ven tus alumnas cuando reservan.',
    terminos: ['datos fiscales', 'marca', 'logo', 'color'],
    actualizado: '2026-08-28',
    relacionados: ['empezar/crear-tu-cuenta', 'configuracion/datos-del-estudio', 'portal/personalizar-tu-portal'],
    estado: 'publicado',
  },
  {
    slug: 'primera-semana-de-clases', categoria: 'empezar', tipo: 'guia',
    titulo: 'Prepara tu primera semana de clases',
    descripcion: 'Salas, tipos de clase y tu primer horario, antes de invitar a tu primera alumna.',
    actualizado: '2026-08-28',
    relacionados: ['reservas/crear-una-clase', 'instructores/dar-de-alta-una-instructora'],
    estado: 'publicado',
  },

  // ─── Reservas y calendario ──────────────────────────────────────────────
  {
    slug: 'crear-una-clase', categoria: 'reservas', tipo: 'guia',
    titulo: 'Cómo crear una clase',
    descripcion: 'Una clase suelta o una serie recurrente, con su sala, instructora y aforo.',
    terminos: ['nueva clase', 'horario', 'serie', 'recurrente'],
    actualizado: '2026-08-28',
    relacionados: ['reservas/editar-o-cancelar-una-clase', 'reservas/lista-de-espera', 'instructores/dar-de-alta-una-instructora'],
    estado: 'publicado',
  },
  {
    slug: 'editar-o-cancelar-una-clase', categoria: 'reservas', tipo: 'guia',
    titulo: 'Editar o cancelar una clase',
    descripcion: 'Qué le llega a cada alumna con reserva cuando cambias la hora, la sala o cancelas la clase entera.',
    actualizado: '2026-08-28',
    relacionados: ['reservas/crear-una-clase', 'reservas/no-shows', 'problemas/una-reserva-no-aparece'],
    estado: 'publicado',
  },
  {
    slug: 'lista-de-espera', categoria: 'reservas', tipo: 'guia',
    titulo: 'Cómo funciona la lista de espera',
    descripcion: 'Cuando se libera una plaza se ofrece sola a la primera de la lista, con un plazo para aceptarla antes de pasar a la siguiente.',
    terminos: ['espera', 'plaza liberada', 'oferta'],
    actualizado: '2026-08-28',
    relacionados: ['reservas/reglas-de-reserva-por-clase', 'reservas/crear-una-clase'],
    estado: 'publicado',
  },
  {
    slug: 'reglas-de-reserva-por-clase', categoria: 'reservas', tipo: 'guia',
    titulo: 'Reglas de reserva y cancelación por tipo de clase',
    descripcion: 'Antelación mínima y máxima, exigir plan activo, aprobación manual y lista de espera — cada tipo de clase puede tener las suyas.',
    terminos: ['antelación', 'ventana de cancelación', 'aprobación', 'penalización', 'no show'],
    actualizado: '2026-08-28',
    relacionados: ['reservas/lista-de-espera', 'reservas/no-shows', 'bonos/caducidad-de-un-bono'],
    estado: 'publicado',
  },
  {
    slug: 'clases-con-requisito', categoria: 'reservas', tipo: 'guia',
    titulo: 'Clases solo para alumnas autorizadas',
    descripcion: 'Marca una clase como avanzada o con requisitos y decide tú quién puede reservarla. Sin inventar niveles que tus actividades no tienen.',
    terminos: ['niveles', 'nivel', 'avanzado', 'intermedio', 'gentil', 'autorizar', 'permiso', 'requisitos'],
    actualizado: '2026-09-05',
    relacionados: ['reservas/reglas-de-reserva-por-clase', 'clientes/ficha-de-clienta'],
    estado: 'publicado',
  },
  {
    slug: 'no-shows', categoria: 'reservas', tipo: 'guia',
    titulo: 'No-shows y cancelaciones tardías',
    descripcion: 'Cómo se marcan, qué le pasa al bono de la alumna y cuándo puede haber una penalización económica.',
    actualizado: '2026-08-28',
    relacionados: ['reservas/reglas-de-reserva-por-clase', 'pagos/cobros-fallidos'],
    estado: 'publicado',
  },

  // ─── Clientes y CRM ─────────────────────────────────────────────────────
  {
    slug: 'crear-una-clienta', categoria: 'clientes', tipo: 'guia',
    titulo: 'Dar de alta una clienta',
    descripcion: 'A mano desde el panel, o dejando que se apunte sola desde tu página de reservas.',
    actualizado: '2026-08-28',
    relacionados: ['clientes/ficha-de-clienta', 'clientes/importar-clientes'],
    estado: 'publicado',
  },
  {
    slug: 'ficha-de-clienta', categoria: 'clientes', tipo: 'guia',
    titulo: 'La ficha de clienta: historial, bonos y notas',
    descripcion: 'Todo lo de cada alumna en un sitio — asistencia, plan activo, notas de progreso y, si la usas, su ficha de salud.',
    terminos: ['crm', 'historial', 'notas de progreso', 'ficha clínica'],
    actualizado: '2026-08-28',
    relacionados: ['clientes/crear-una-clienta', 'bonos/tipos-de-bono'],
    estado: 'publicado',
  },
  {
    slug: 'importar-clientes', categoria: 'clientes', tipo: 'guia',
    titulo: 'Importar tus clientes desde otro software',
    descripcion: 'Importación por CSV desde tu plataforma anterior — qué campos hacen falta y qué revisar después.',
    actualizado: '2026-08-28',
    relacionados: ['clientes/crear-una-clienta'],
    estado: 'publicado',
  },

  // ─── Instructoras y equipo ──────────────────────────────────────────────
  {
    slug: 'dar-de-alta-una-instructora', categoria: 'instructores', tipo: 'guia',
    titulo: 'Dar de alta a una instructora',
    descripcion: 'Su acceso, permisos y en qué sedes puede trabajar si tienes más de un centro.',
    actualizado: '2026-08-28',
    relacionados: ['instructores/disponibilidad-y-tarifas', 'instructores/permisos-por-rol'],
    estado: 'publicado',
  },
  {
    slug: 'disponibilidad-y-tarifas', categoria: 'instructores', tipo: 'guia',
    titulo: 'Disponibilidad, horario y tarifa por hora',
    descripcion: 'Cada instructora pone su propia disponibilidad; tú fijas su tarifa para la liquidación mensual.',
    actualizado: '2026-08-28',
    relacionados: ['instructores/dar-de-alta-una-instructora', 'instructores/sustituciones'],
    estado: 'publicado',
  },
  {
    slug: 'sustituciones', categoria: 'instructores', tipo: 'guia',
    titulo: 'Cómo funcionan las sustituciones',
    descripcion: 'Una instructora avisa de que no puede dar su clase y Tentare busca sustituta, la contacta y avisa a las alumnas.',
    terminos: ['baja', 'no puedo asistir', 'candidatas', 'autonomía'],
    actualizado: '2026-08-28',
    relacionados: ['instructores/disponibilidad-y-tarifas', 'reservas/editar-o-cancelar-una-clase'],
    estado: 'publicado',
  },
  {
    slug: 'horas-y-contrato', categoria: 'instructores', tipo: 'guia',
    titulo: 'Horas de contrato y horas de verdad',
    descripcion: 'Apunta las horas semanales que tienes contratadas y mira cada mes las asignadas, las realizadas y la diferencia.',
    terminos: ['horas', 'contrato', 'nomina', 'jornada', 'asignadas', 'realizadas'],
    actualizado: '2026-09-05',
    relacionados: ['instructores/disponibilidad-y-tarifas', 'instructores/pasar-clases-a-otra'],
    estado: 'publicado',
  },
  {
    slug: 'pasar-clases-a-otra', categoria: 'instructores', tipo: 'guia',
    titulo: 'Pasar las clases de una instructora a otra',
    descripcion: 'Una baja larga o un cambio de cuadrante, resuelto de una vez en lugar de clase por clase.',
    terminos: ['baja', 'reasignar', 'cambiar profesor', 'cambiar instructora', 'masivo', 'periodo'],
    actualizado: '2026-09-05',
    relacionados: ['instructores/sustituciones', 'instructores/horas-y-contrato'],
    estado: 'publicado',
  },
  {
    slug: 'permisos-por-rol', categoria: 'instructores', tipo: 'guia',
    titulo: 'Qué puede hacer cada rol: propietaria, recepción e instructora',
    descripcion: 'Quién ve qué en el panel — y por qué la ficha de salud no la ve cualquiera.',
    actualizado: '2026-08-28',
    relacionados: ['instructores/dar-de-alta-una-instructora', 'configuracion/usuarios-y-permisos'],
    estado: 'publicado',
  },

  // ─── Pagos y facturación ────────────────────────────────────────────────
  {
    slug: 'conectar-stripe', categoria: 'pagos', tipo: 'guia',
    titulo: 'Conectar Stripe para cobrar con tarjeta',
    descripcion: 'Sin Stripe conectado no hay cobro automático ni tarjeta guardada — cómo activarlo desde Configuración.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/tarjeta-guardada-y-cobro-automatico', 'pagos/cobros-fallidos'],
    estado: 'publicado',
  },
  {
    slug: 'tarjeta-guardada-y-cobro-automatico', categoria: 'pagos', tipo: 'guia',
    titulo: 'Tarjeta guardada y cobro automático',
    descripcion: 'Cómo guarda una alumna su tarjeta y qué pasa en cada renovación mensual.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/conectar-stripe', 'bonos/renovaciones'],
    estado: 'publicado',
  },
  {
    slug: 'cobros-fallidos', categoria: 'pagos', tipo: 'problema',
    titulo: 'Un cobro ha fallado: qué hacer',
    descripcion: 'Reintentos automáticos, cuándo se avisa a la alumna y cómo reintentarlo tú a mano.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/reembolsos', 'problemas/el-pago-falla-en-el-checkout'],
    estado: 'publicado',
  },
  {
    slug: 'reembolsos', categoria: 'pagos', tipo: 'guia',
    titulo: 'Cómo devolver un cobro',
    descripcion: 'Reembolsos totales o parciales desde el panel, con su factura rectificativa.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/cobros-fallidos', 'pagos/facturas'],
    estado: 'publicado',
  },
  {
    slug: 'facturas', categoria: 'pagos', tipo: 'guia',
    titulo: 'Facturas y Veri*Factu',
    descripcion: 'Cada cobro genera su factura, firmada y enviada a la AEAT — dónde encontrarlas y descargarlas.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/reembolsos'],
    estado: 'publicado',
  },
  {
    slug: 'prueba-de-7-dias', categoria: 'pagos', tipo: 'guia',
    titulo: 'Cómo funciona la prueba de 7 días',
    descripcion: 'Sin tarjeta desde el alta. Qué pasa cuando termina y cómo elegir un plan de pago.',
    actualizado: '2026-08-28',
    relacionados: ['empezar/crear-tu-cuenta'],
    estado: 'publicado',
  },

  // ─── Bonos y membresías ─────────────────────────────────────────────────
  {
    slug: 'tipos-de-bono', categoria: 'bonos', tipo: 'guia',
    titulo: 'Bonos, cuotas y plazas fijas: qué modelo elegir',
    descripcion: 'Bono de sesiones, cuota mensual, plan por tipo de clase o plaza fija con recuperaciones.',
    actualizado: '2026-08-28',
    relacionados: ['bonos/crear-un-plan', 'bonos/caducidad-de-un-bono'],
    estado: 'publicado',
  },
  {
    slug: 'crear-un-plan', categoria: 'bonos', tipo: 'guia',
    titulo: 'Cómo crear un plan o bono nuevo',
    descripcion: 'Nombre, tipo, precio y sesiones incluidas — desde Configuración > Planes y tarifas.',
    actualizado: '2026-08-28',
    relacionados: ['bonos/tipos-de-bono'],
    estado: 'publicado',
  },
  {
    slug: 'caducidad-de-un-bono', categoria: 'bonos', tipo: 'guia',
    titulo: 'Caducidad y congelación de un bono',
    descripcion: 'Cuándo caduca un bono y cómo congelarlo mientras una alumna está de baja, sin perder sus sesiones.',
    actualizado: '2026-08-28',
    relacionados: ['bonos/tipos-de-bono', 'problemas/un-bono-no-aparece'],
    estado: 'publicado',
  },
  {
    slug: 'recuperaciones', categoria: 'bonos', tipo: 'guia',
    titulo: 'Recuperaciones: las clases que le debes a una alumna',
    descripcion: 'Qué son, cuándo nacen solas, cuánto duran y cómo ponerle otra fecha a un caso concreto.',
    terminos: ['recuperacion', 'recuperaciones', 'clase a recuperar', 'compensar', 'caducidad'],
    actualizado: '2026-09-05',
    relacionados: ['bonos/plazas-fijas', 'bonos/caducidad-de-un-bono', 'reservas/reglas-de-reserva-por-clase'],
    estado: 'publicado',
  },
  {
    slug: 'plazas-fijas', categoria: 'bonos', tipo: 'guia',
    titulo: 'Plazas fijas: su hueco de cada semana',
    descripcion: 'Ana viene todos los martes a las 10. Cómo se asigna, qué pasa si cambias el horario y cómo se cambia sin perder su antigüedad.',
    terminos: ['plaza fija', 'hueco semanal', 'recurrente', 'sitio fijo', 'reserva recurrente'],
    actualizado: '2026-09-05',
    relacionados: ['bonos/recuperaciones', 'reservas/editar-o-cancelar-una-clase'],
    estado: 'publicado',
  },
  {
    slug: 'ampliar-caducidades-en-lote', categoria: 'bonos', tipo: 'guia',
    titulo: 'Ampliar caducidades a varias alumnas de una vez',
    descripcion: 'Cierras una semana por vacaciones y nadie debería perder días de bono. Cómo ampliarlo a todas de golpe, y qué no se toca.',
    terminos: ['vacaciones', 'cierre', 'festivos', 'prorrogar', 'masivo', 'en lote', 'ampliar'],
    actualizado: '2026-09-05',
    relacionados: ['bonos/caducidad-de-un-bono', 'bonos/recuperaciones'],
    estado: 'publicado',
  },
  {
    slug: 'renovaciones', categoria: 'bonos', tipo: 'guia',
    titulo: 'Renovaciones automáticas',
    descripcion: 'Cómo y cuándo se renueva un plan mensual, y qué avisa a la alumna antes de cobrarle.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/tarjeta-guardada-y-cobro-automatico'],
    estado: 'publicado',
  },

  // ─── Portal de reservas ─────────────────────────────────────────────────
  {
    slug: 'que-es-el-portal', categoria: 'portal', tipo: 'guia',
    titulo: 'Qué es el portal de reservas',
    descripcion: 'La página pública donde tus alumnas ven tu horario y reservan, con o sin cuenta.',
    actualizado: '2026-08-28',
    relacionados: ['portal/acceso-de-una-clienta', 'portal/personalizar-tu-portal', 'widget/que-es-el-widget'],
    estado: 'publicado',
  },
  {
    slug: 'acceso-de-una-clienta', categoria: 'portal', tipo: 'guia',
    titulo: 'Cómo entra una clienta al portal por primera vez',
    descripcion: 'Con su email y contraseña, un enlace mágico si la olvida, o con su cuenta de Google — todo desde una sola pantalla.',
    terminos: ['login clienta', 'primera vez', 'contraseña olvidada', 'acceso'],
    actualizado: '2026-08-28',
    relacionados: ['portal/que-es-el-portal', 'problemas/una-clienta-no-puede-entrar'],
    estado: 'publicado',
  },
  {
    slug: 'personalizar-tu-portal', categoria: 'portal', tipo: 'guia',
    titulo: 'Personaliza colores, tipografía y textos de tu portal',
    descripcion: 'El editor de temas: tu logo, tu paleta y el tono con el que hablas a tus alumnas.',
    actualizado: '2026-08-28',
    relacionados: ['portal/que-es-el-portal', 'configuracion/marca'],
    estado: 'publicado',
  },

  // ─── Widget ──────────────────────────────────────────────────────────────
  {
    slug: 'que-es-el-widget', categoria: 'widget', tipo: 'guia',
    titulo: 'Qué es el widget de reservas',
    descripcion: 'Tu calendario de Tentare, incrustado en tu propia web — sin que la alumna salga de tu dominio.',
    actualizado: '2026-08-28',
    relacionados: ['widget/instalar-en-wordpress', 'widget/instalar-con-html'],
    estado: 'publicado',
  },
  {
    slug: 'instalar-con-html', categoria: 'widget', tipo: 'guia',
    titulo: 'Instalar el widget con HTML o iframe',
    descripcion: 'El fragmento de código para pegar en cualquier web, y cómo hacerlo responsive.',
    actualizado: '2026-08-28',
    relacionados: ['widget/que-es-el-widget', 'problemas/el-widget-no-carga'],
    estado: 'publicado',
  },
  {
    slug: 'instalar-en-wordpress', categoria: 'widget', tipo: 'guia',
    titulo: 'Instalar el widget en WordPress',
    descripcion: 'Con el bloque HTML del editor — sin plugin adicional.',
    actualizado: '2026-08-28',
    relacionados: ['widget/instalar-con-html'],
    estado: 'publicado',
  },

  // ─── Automatizaciones y avisos ──────────────────────────────────────────
  {
    slug: 'recordatorios-automaticos', categoria: 'automatizaciones', tipo: 'guia',
    titulo: 'Recordatorios y avisos automáticos',
    descripcion: 'Qué avisa Tentare solo por email y WhatsApp: recordatorio de clase, bono a punto de acabar, clase confirmada tras sustitución y más.',
    actualizado: '2026-08-28',
    relacionados: ['problemas/no-llega-un-email', 'problemas/no-llega-un-whatsapp'],
    estado: 'publicado',
  },

  // ─── Integraciones ──────────────────────────────────────────────────────
  {
    slug: 'integraciones-disponibles', categoria: 'integraciones', tipo: 'guia',
    titulo: 'Integraciones disponibles hoy',
    descripcion: 'Stripe para cobros y el widget para tu web — el resto, según lo vayamos activando.',
    actualizado: '2026-08-28',
    relacionados: ['pagos/conectar-stripe', 'widget/que-es-el-widget'],
    estado: 'publicado',
  },

  // ─── App de tus alumnas ─────────────────────────────────────────────────
  {
    slug: 'que-ve-una-alumna', categoria: 'app', tipo: 'guia',
    titulo: 'Qué ve una alumna en su portal',
    descripcion: 'Su próxima clase, su plan y sesiones restantes, créditos, logros y nivel.',
    actualizado: '2026-08-28',
    relacionados: ['portal/que-es-el-portal', 'portal/acceso-de-una-clienta'],
    estado: 'publicado',
  },

  // ─── Configuración ──────────────────────────────────────────────────────
  {
    slug: 'datos-del-estudio', categoria: 'configuracion', tipo: 'guia',
    titulo: 'Datos del estudio y datos fiscales',
    descripcion: 'Nombre, NIF, dirección y los datos que aparecen en tus facturas.',
    actualizado: '2026-08-28',
    relacionados: ['empezar/configurar-tu-estudio'],
    estado: 'publicado',
  },
  {
    slug: 'usuarios-y-permisos', categoria: 'configuracion', tipo: 'guia',
    titulo: 'Usuarios, roles y permisos',
    descripcion: 'Quién tiene acceso a tu panel y qué puede hacer cada uno.',
    actualizado: '2026-08-28',
    relacionados: ['instructores/permisos-por-rol'],
    estado: 'publicado',
  },
  {
    slug: 'marca', categoria: 'configuracion', tipo: 'guia',
    titulo: 'Tu marca: logo y color',
    descripcion: 'El color y el logo que ven tus alumnas en el portal, el widget y tus emails.',
    actualizado: '2026-08-28',
    relacionados: ['portal/personalizar-tu-portal'],
    estado: 'publicado',
  },

  // ─── Informes y analítica ───────────────────────────────────────────────
  {
    slug: 'informes-disponibles', categoria: 'informes', tipo: 'guia',
    titulo: 'Informes de ocupación, ingresos y retención',
    descripcion: 'Qué mide cada informe y cómo leerlo con criterio.',
    actualizado: '2026-08-28',
    relacionados: ['reservas/reglas-de-reserva-por-clase'],
    estado: 'publicado',
  },

  // ─── Problemas y soluciones ─────────────────────────────────────────────
  {
    slug: 'no-puedo-iniciar-sesion', categoria: 'problemas', tipo: 'problema',
    titulo: 'No puedo iniciar sesión',
    descripcion: 'Contraseña olvidada, el enlace de acceso no llega, o el captcha se queda cargando.',
    terminos: ['login', 'acceso', 'contraseña', 'captcha'],
    actualizado: '2026-08-28',
    relacionados: ['portal/acceso-de-una-clienta', 'problemas/no-llega-un-email'],
    estado: 'publicado',
  },
  {
    slug: 'una-clienta-no-puede-entrar', categoria: 'problemas', tipo: 'problema',
    titulo: 'Una clienta no puede entrar al portal',
    descripcion: 'Las causas más comunes cuando una alumna te escribe diciendo que no consigue acceder.',
    actualizado: '2026-08-28',
    relacionados: ['portal/acceso-de-una-clienta', 'problemas/no-puedo-iniciar-sesion'],
    estado: 'publicado',
  },
  {
    slug: 'no-llega-un-email', categoria: 'problemas', tipo: 'problema',
    titulo: 'No llega un email',
    descripcion: 'Spam, dirección mal escrita o un dominio que bloquea remitentes nuevos — cómo comprobarlo.',
    actualizado: '2026-08-28',
    relacionados: ['automatizaciones/recordatorios-automaticos', 'problemas/no-llega-un-whatsapp'],
    estado: 'publicado',
  },
  {
    slug: 'no-llega-un-whatsapp', categoria: 'problemas', tipo: 'problema',
    titulo: 'No llega un WhatsApp',
    descripcion: 'Qué comprobar cuando un aviso por WhatsApp no le llega a una instructora o alumna.',
    actualizado: '2026-08-28',
    relacionados: ['automatizaciones/recordatorios-automaticos', 'problemas/no-llega-un-email'],
    estado: 'publicado',
  },
  {
    slug: 'el-pago-falla-en-el-checkout', categoria: 'problemas', tipo: 'problema',
    titulo: 'El pago falla en el checkout',
    descripcion: 'Tarjeta rechazada, el código postal no aparece, o se queda colgado en "Procesando el pago…".',
    actualizado: '2026-08-28',
    relacionados: ['pagos/cobros-fallidos', 'pagos/conectar-stripe'],
    estado: 'publicado',
  },
  {
    slug: 'una-reserva-no-aparece', categoria: 'problemas', tipo: 'problema',
    titulo: 'Una reserva no aparece',
    descripcion: 'La alumna dice que ha reservado y tú no la ves — las causas más frecuentes.',
    actualizado: '2026-08-28',
    relacionados: ['reservas/lista-de-espera', 'reservas/reglas-de-reserva-por-clase'],
    estado: 'publicado',
  },
  {
    slug: 'el-widget-no-carga', categoria: 'problemas', tipo: 'problema',
    titulo: 'El widget no carga o no se adapta al móvil',
    descripcion: 'Página en blanco, iframe cortado o que no cambia de tamaño con el contenido.',
    actualizado: '2026-08-28',
    relacionados: ['widget/instalar-con-html', 'widget/que-es-el-widget'],
    estado: 'publicado',
  },
  {
    slug: 'un-bono-no-aparece', categoria: 'problemas', tipo: 'problema',
    titulo: 'Un bono no aparece en la ficha de la clienta',
    descripcion: 'El pago se procesó pero el bono no se ve — qué comprobar antes de escribir a soporte.',
    actualizado: '2026-08-28',
    relacionados: ['bonos/caducidad-de-un-bono', 'pagos/cobros-fallidos'],
    estado: 'publicado',
  },
];

const CLAVE = (categoria: string, slug: string) => `${categoria}/${slug}`;
const PORCLAVE = new Map(ARTICULOS.map((a) => [CLAVE(a.categoria, a.slug), a]));

export function categoriaDe(slug: string): CategoriaAyuda | undefined {
  return CATEGORIAS.find((c) => c.slug === slug);
}

export function esGrupoValido(slug: string): slug is GrupoAyuda {
  return CATEGORIA_SLUGS.has(slug as GrupoAyuda);
}

export function articuloDe(categoria: string, slug: string): ArticuloAyuda | undefined {
  return PORCLAVE.get(CLAVE(categoria, slug));
}

export function articulosDe(categoria: string): ArticuloAyuda[] {
  return ARTICULOS.filter((a) => a.categoria === categoria);
}

export function articulosPublicadosDe(categoria: string): ArticuloAyuda[] {
  return articulosDe(categoria).filter((a) => a.estado === 'publicado');
}

/** Resuelve los `relacionados` de un artículo a sus fichas completas, ignorando slugs rotos. */
export function relacionadosDe(articulo: ArticuloAyuda): ArticuloAyuda[] {
  return (articulo.relacionados ?? [])
    .map((clave) => PORCLAVE.get(clave))
    .filter((a): a is ArticuloAyuda => Boolean(a) && a!.estado === 'publicado');
}

export function urlArticulo(a: Pick<ArticuloAyuda, 'categoria' | 'slug'>): string {
  return `/ayuda/${a.categoria}/${a.slug}`;
}

export function totalPublicados(): number {
  return ARTICULOS.filter((a) => a.estado === 'publicado').length;
}
