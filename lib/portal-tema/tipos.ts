// La forma de los datos que consume el portal en React.
//
// Vive en `lib/` y no junto a los componentes por dos motivos: el adaptador que
// los produce (`datos.ts`) es puro y se prueba con `node --test lib/**/*.test.ts`,
// y así la dependencia va en un solo sentido — `components/` tira de `lib/`,
// nunca al revés.
//
// Es DELIBERADAMENTE la forma que entregó diseño, no la del dominio. El portal
// nuevo no debe aprender qué es un `tipoClaseId` ni una `Suscripcion`: eso lo
// traduce el adaptador una vez, y aquí llega ya masticado.

/** Una clase del horario, tal y como la pinta el portal. */
export interface StudioClass {
  id: string;
  name: string;
  /** Clave del filtro superior. Sale del tipo de clase, no de un enum fijo. */
  type: string;
  /** Día del MES (no día de la semana): es lo que casa con la rejilla. */
  day: number;
  time: string;
  end: string;
  /**
   * Inicio y fin en ISO. `time`/`end` son la hora de PARED en Madrid, que sirve
   * para pintar pero no para exportar: un `.ics` necesita el instante real.
   */
  startsAt: string;
  endsAt: string;
  duration: string;
  room: string;
  level: string;
  teacher: string;
  initial: string;
  /** Plazas libres. 0 = completa, y entonces la UI ofrece lista de espera. */
  seats: number;
  /**
   * La foto que se pinta en el detalle y en la tarjeta de «próxima clase». Ya
   * resuelta: la del TIPO de clase si la propietaria la subió, y si no la de
   * su familia (`imagenDeClase`). Nunca vacía — quien la pinta no decide.
   */
  fotoUrl: string;
  /**
   * Las plazas físicas de la sala, en orden de sala. `[]` = este estudio no
   * asigna sitio (la mayoría) y se reserva sin elegir — NO es «sala llena».
   */
  plazas: PlazaPortal[];
  description: string;
  /**
   * Para qué sirve esta clase, en palabras. Sale de `tipos_clase.objetivos`
   * (lista FIJA, `lib/reservar/objetivos.ts`) resuelto a sus etiquetas — no es
   * texto libre ni una lista inventada por pantalla. Vacío = el estudio no ha
   * marcado ninguno, y el detalle no pinta la sección.
   */
  benefits: string[];
  /**
   * Horas de antelación para cancelar sin perder la sesión, YA resueltas para
   * esta clase: el override del tipo si lo tiene, y si no la del estudio
   * (`heredaOverride`). `null` = el estudio no fija ninguna.
   *
   * ⚠️ Es un dato, no el «6 horas» que el prototipo escribe a mano. Prometerle
   * a la socia una ventana que no es la de su estudio la deja pagando una
   * cancelación que creía gratis.
   */
  cancelHoras: number | null;
}

export interface DiaPortal {
  key: string;
  label: string;
  /** Día del mes, para casar con `StudioClass.day`. */
  num: number;
}

export interface FiltroPortal {
  key: string;
  label: string;
}

export interface PlanPortal {
  key: string;
  name: string;
  classes: number;
  price: number;
  badge: string;
  perks: string[];
}

export interface BonoPortal {
  name: string;
  /** Sesiones que traía el bono. 0 = no hay bono que enseñar. */
  total: number;
  /** Ya formateada para leerse ("30 de septiembre"), no una fecha ISO. */
  expires: string;
}

/**
 * Un bono o plan de la cartera de la socia, tal y como lo lista «Mis bonos».
 *
 * ⚠️ Distinto de `BonoPortal`, que es UNO —el que se está consumiendo— y sirve
 * para la tarjeta del Inicio. Aquí están TODOS los activos, incluidos los
 * ilimitados, que `bonoDe` descarta a propósito (no tienen sesiones que
 * contar) y que hasta ahora no se veían en ninguna pantalla.
 */
export interface BonoCartera {
  id: string;
  name: string;
  /** Plan sin sesiones que contar. Entonces no hay barra ni «quedan N». */
  unlimited: boolean;
  left: number;
  total: number;
  /** «Caduca el 12 de junio» o «Renovación el 1 de junio», ya redactado. */
  footline: string;
  subline: string;
  percent: number;
}

/** Una compra de la socia, para el historial. Sale de `recibos`. */
export interface CompraPortal {
  id: string;
  concepto: string;
  /** «Comprado el 12 de marzo», ya redactado. */
  cuando: string;
  importe: string;
}

/** Una profesora del estudio, tal y como la pinta el portal. */
export interface ProfesorPortal {
  id: string;
  nombre: string;
  inicial: string;
  /** Bio pública (`instructores.bio`). Vacía = no se pinta nada, no un hueco. */
  bio: string;
}

export interface SociaPortal {
  /** `id` vacío = nadie identificado (la previsualización). Sin él no se guarda. */
  id: string;
  name: string;
  short: string;
  initial: string;
  /**
   * Los campos que la socia edita en «Mis datos». Son SEIS y no los tres del
   * prototipo: los otros tres ya existen en el portal de siempre
   * (`PortalPerfilView`) y quitárselos sería que el rediseño le costara sitio
   * donde escribir su dirección.
   */
  apellidos: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  direccion: string;
  /** Tiene mandato SEPA vivo. Es lo que el perfil de siempre resume como
   *  «Domiciliado» en Métodos de pago. */
  domiciliado: boolean;
}

/**
 * Todo lo que cambia de un estudio a otro.
 *
 * Lo que NO está aquí sigue siendo constante del portal (`TABS`,
 * `QUICK_LINKS`, `NOTIFICATIONS`) o dato de muestra todavía sin origen real
 * (`CHALLENGES`, `WEEK_BARS`, `EXERCISES`, `TEACHERS`, `TESTIMONIALS`, `FAQ`).
 * Se irán moviendo aquí según tengan de dónde salir; meterlos antes solo
 * disfrazaría de real algo que sigue inventado.
 */
/** Una reserva viva de la socia, atada a la clase que ocupa. */
export interface ReservaPortal {
  /** El id de la SESIÓN, que es lo que el portal llama "clase". */
  classId: string;
  /** El id de la RESERVA, que es lo que hay que mandar para cancelarla. */
  reservaId: string;
  /**
   * ⚠️ Tener plaza y estar en la cola NO son lo mismo, y hasta ahora el portal
   * no los distinguía: `reservadasDe` mete las dos (ver `VIVAS`) y quien las
   * leía las pintaba a todas como «Reservada». Con esto, la pestaña de lista
   * de espera es real y el detalle puede decir la verdad.
   */
  estado: 'CONFIRMADA' | 'ASISTIDA' | 'LISTA_ESPERA' | 'PENDIENTE_APROBACION';
  /** Su puesto en la cola. `null` salvo en `LISTA_ESPERA`. */
  posicion: number | null;
}

/** Una plaza de la sala (un reformer, una camilla) para la pantalla de detalle. */
export interface PlazaPortal {
  id: string;
  /** Lo que se pinta encima. El nombre del estudio si lo tiene; si no, el número. */
  nombre: string;
  fila: number;
  columna: number;
  ocupada: boolean;
}

export interface DatosPortal {
  clases: StudioClass[];
  /**
   * Las fotos del ESTUDIO que pinta el kit, ya resueltas: la que subió la
   * propietaria, o la de por defecto (`lib/imagenes-por-defecto.ts`).
   *
   * ⚠️ Se resuelven aquí y no en el componente porque son el mismo hueco en
   * varias pantallas a la vez, y porque `imagenes-por-defecto.ts` ya es la
   * ÚNICA fuente de este repo: un segundo juego de marcadores dentro del kit
   * es exactamente lo que había —`public/media/*.svg`— y lo que esto retira.
   *
   * ⚠️ `vertical` cae sobre una foto OSCURA a propósito: la bienvenida pinta
   * su titular en blanco sobre un velo que apenas la tiñe en dos de los cuatro
   * temas. Una foto clara ahí deja la pantalla ilegible con el CSS intacto.
   */
  fotos: { portada: string; vertical: string };
  /**
   * El instante desde el que se calcula todo lo que depende de «ahora», en ISO.
   *
   * ⚠️ Va como dato y no se llama a `new Date()` en los componentes a
   * propósito: la vista previa y los tests fijan la fecha, y un reloj leído
   * dentro del render la haría depender del momento de ejecutarlo.
   */
  ahoraISO: string;
  /**
   * Hoy en la zona del estudio. `num` es el día del MES (casa con
   * `StudioClass.day`) y `largo` la fecha en palabras que pinta la cabecera
   * del Inicio. Van juntas para que no puedan discrepar — ver `hoyDe`.
   */
  hoy: { num: number; largo: string; mes: string };
  /**
   * Semanas seguidas asistiendo, y si es su mejor marca. `null` = no hay
   * racha que enseñar (menos de dos seguidas, o nadie identificado). Ver
   * `calcularRacha` (`lib/engines/streak-engine.ts`) — el prototipo la traía
   * como texto fijo, y no se recalcula aquí: esa cifra ya tenía dueño.
   */
  racha: { semanas: number; esMejor: boolean } | null;
  /**
   * El estudio: quién firma la pantalla y cómo se le llega. Todo sale de
   * columnas reales de `studios` — `anioFundacion` y `fotoUrl` son nullable de
   * verdad, y cuando faltan la pantalla se calla en vez de rellenar el hueco.
   */
  estudio: {
    nombre: string;
    anioFundacion: number | null;
    direccion: string;
    ciudad: string;
    codigoPostal: string;
    telefono: string;
    email: string;
    fotoUrl: string | null;
    /** La foto a pantalla completa de la bienvenida. `null` = sin subir. */
    imagenBienvenidaUrl: string | null;
    /**
     * Las normas del centro, una por línea (migr 20260813004723). Array vacío
     * = la propietaria no las ha escrito, y la pantalla no pinta la sección.
     */
    normas: string[];
    /**
     * El horario de apertura, ya redactado: «Lunes» / «8:00 – 21:00» o
     * «Cerrado». Vacío = el estudio no lo ha rellenado, y la pantalla no pinta
     * la sección en vez de siete filas vacías.
     */
    horario: { dia: string; cuando: string }[];
    /** El texto legal que la propietaria escribe. `null` = no lo ha escrito. */
    privacidad: string | null;
  };
  dias: DiaPortal[];
  filtros: FiltroPortal[];
  planes: PlanPortal[];
  bono: BonoPortal;
  /** Todos sus bonos y planes activos. `bono` es solo el que se consume. */
  bonos: BonoCartera[];
  /** Sus compras cobradas, de la más reciente a la más antigua. */
  compras: CompraPortal[];
  socia: SociaPortal;
  /** Quien da clase, activas y que imparten. Mismo criterio que `/instructores`. */
  profesores: ProfesorPortal[];
  /**
   * Las reservas VIVAS de la socia.
   *
   * ⚠️ `undefined` = no hay nadie identificado (la previsualización de temas),
   * y solo entonces el portal usa su lista de demostración. Un array vacío es
   * un dato: "no tiene ninguna reserva". Confundir los dos es lo que hacía que
   * la pantalla de Reservas del kit saliera SIEMPRE vacía en el portal de
   * verdad, con las reservas de la socia perfectamente guardadas en la base de
   * datos.
   */
  reservadas?: ReservaPortal[];
}
