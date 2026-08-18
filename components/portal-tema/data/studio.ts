/**
 * Los datos de muestra que entregó diseño.
 *
 * Ya NO es la fuente del portal: lo que se pinta llega por `PortalProvider`
 * (`datos`), y esto es solo el valor por defecto — lo que se ve en la
 * previsualización de temas, donde no hay estudio ni sesión. El adaptador que
 * produce los de verdad es `lib/portal-tema/datos.ts`.
 *
 * Los tipos viven en `lib/portal-tema/tipos.ts` para que el adaptador (puro y
 * con tests) no tenga que importar nada de `components/`.
 */

import { imagenDeClase, IMAGENES_POR_DEFECTO } from "@/lib/imagenes-por-defecto";
import type { DatosPortal, PlazaPortal, StudioClass } from "@/lib/portal-tema/tipos";

export type { DatosPortal, StudioClass } from "@/lib/portal-tema/tipos";

// La semana de muestra. `fecha` va junto al `num` por el mismo motivo que en
// `StudioClass`: comparar por número de día miente en cuanto hay dos meses en
// juego, y la rejilla del mes siempre trae celdas de los vecinos.
export const DAYS = [
  { key: "lun", label: "LUN", num: 3, fecha: "2026-09-03" },
  { key: "mar", label: "MAR", num: 4, fecha: "2026-09-04" },
  { key: "mie", label: "MIÉ", num: 5, fecha: "2026-09-05" },
  { key: "jue", label: "JUE", num: 6, fecha: "2026-09-06" },
  { key: "vie", label: "VIE", num: 7, fecha: "2026-09-07" },
  { key: "sab", label: "SÁB", num: 8, fecha: "2026-09-08" },
  { key: "dom", label: "DOM", num: 9, fecha: "2026-09-09" },
] as const;


/**
 * Una sala de reformers para la muestra: 8 plazas en dos filas de 4.
 *
 * Está aquí y no vacío para que la rejilla de «Elige tu sitio» se VEA al mirar
 * temas — es la mitad de los estudios de Pilates y, sin esto, la pantalla que
 * más decisiones tiene encima no aparecería nunca en la previsualización.
 * Las de suelo se quedan sin plazas a propósito: ahí no se asigna sitio, y así
 * la muestra enseña los dos casos.
 */
const salaReformer = (ocupadas: readonly number[]): PlazaPortal[] =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `sp${i + 1}`,
    nombre: String(i + 1),
    // Desde 0, como en producción (`spots` del estudio piloto: fila 0-1,
    // columna 0-3). Ver `columnasDeSala`.
    fila: i < 4 ? 0 : 1,
    columna: i % 4,
    ocupada: ocupadas.includes(i + 1),
  }));

export const CLASSES: StudioClass[] = [
  { id: "c1", name: "Pilates Reformer", fotoUrl: imagenDeClase({ nombre: "Pilates Reformer" }), type: "reformer", day: 4, fecha: "2026-09-04", time: "18:00", end: "19:00", startsAt: "2026-09-04T16:00:00.000Z", endsAt: "2026-09-04T17:00:00.000Z", duration: "50 min", room: "Sala 2", level: "Intermedio", teacher: "Marta Gómez", initial: "M", teacherFoto: "", seats: 3, plazas: salaReformer([2, 3, 5, 6, 8]),
    description: "Clase dinámica para trabajar fuerza, flexibilidad y control. Enfoque en técnica y respiración.", benefits: ["Mejorar fuerza", "Reformer"], cancelHoras: 6 },
  { id: "c2", name: "Pilates de suelo", fotoUrl: imagenDeClase({ nombre: "Pilates de suelo" }), type: "suelo", day: 4, fecha: "2026-09-04", time: "10:00", end: "10:50", startsAt: "2026-09-04T08:00:00.000Z", endsAt: "2026-09-04T08:50:00.000Z", duration: "50 min", room: "Sala A", level: "Todos", teacher: "Emma Ruiz", initial: "E", teacherFoto: "", seats: 6, plazas: [],
    description: "Trabajo de cuerpo completo sobre colchoneta. Control del centro y movilidad de columna.", benefits: ["Pilates suelo", "Mejorar movilidad"], cancelHoras: 6 },
  { id: "c3", name: "Reformer fuerza", fotoUrl: imagenDeClase({ nombre: "Reformer fuerza" }), type: "reformer", day: 5, fecha: "2026-09-05", time: "09:00", end: "09:50", startsAt: "2026-09-05T07:00:00.000Z", endsAt: "2026-09-05T07:50:00.000Z", duration: "50 min", room: "Sala 2", level: "Avanzado", teacher: "Sofía Marín", initial: "S", teacherFoto: "", seats: 12, plazas: salaReformer([4]),
    description: "Sesión de cuerpo completo en reformer. Trabajo de control, resistencia y alineación.", benefits: ["Entrenamiento avanzado", "Reformer"], cancelHoras: 6 },
  { id: "c4", name: "Pilates prenatal", fotoUrl: imagenDeClase({ nombre: "Pilates prenatal" }), type: "prenatal", day: 5, fecha: "2026-09-05", time: "11:30", end: "12:15", startsAt: "2026-09-05T09:30:00.000Z", endsAt: "2026-09-05T10:15:00.000Z", duration: "45 min", room: "Sala A", level: "Suave", teacher: "Nuria Peña", initial: "N", teacherFoto: "", seats: 4, plazas: [],
    description: "Adaptada a cada trimestre. Suelo pélvico, respiración y alivio de la zona lumbar.", benefits: ["Empezar desde cero", "Mejorar movilidad"], cancelHoras: 6 },
  { id: "c5", name: "Reformer suave", fotoUrl: imagenDeClase({ nombre: "Reformer suave" }), type: "reformer", day: 6, fecha: "2026-09-06", time: "19:00", end: "19:50", startsAt: "2026-09-06T17:00:00.000Z", endsAt: "2026-09-06T17:50:00.000Z", duration: "50 min", room: "Sala 2", level: "Iniciación", teacher: "Marta Gómez", initial: "M", teacherFoto: "", seats: 0, plazas: salaReformer([1, 2, 3, 4, 5, 6, 7, 8]),
    description: "Ritmo pausado y muchas correcciones. La mejor puerta de entrada al reformer.", benefits: ["Empezar desde cero", "Reformer"], cancelHoras: 6 },
  { id: "c6", name: "Abdomen y espalda", fotoUrl: imagenDeClase({ nombre: "Abdomen y espalda" }), type: "suelo", day: 7, fecha: "2026-09-07", time: "08:00", end: "08:40", startsAt: "2026-09-07T06:00:00.000Z", endsAt: "2026-09-07T06:40:00.000Z", duration: "40 min", room: "Sala A", level: "Intermedio", teacher: "Emma Ruiz", initial: "E", teacherFoto: "", seats: 5, plazas: [],
    description: "Cuarenta minutos centrados en el core y la cadena posterior. Empieza bien el día.", benefits: ["Mejorar fuerza", "Pilates suelo"], cancelHoras: 6 },
];

/**
 * Clases ya asistidas, SOLO para la previsualización de temas.
 *
 * En el portal real esto llega del endpoint `/api/public/historial`, que
 * deriva la socia del JWT. Aquí no hay socia, así que sin esta muestra la
 * sección «Completadas» no se podría revisar nunca al mirar un tema.
 */
export const HISTORIAL_DE_MUESTRA = [
  { reservaId: 'h1', sesionId: 's-h1', inicio: '2026-08-28T16:00:00.000Z', nombre: 'Pilates Reformer', instructora: 'Marta Gómez' },
  { reservaId: 'h2', sesionId: 's-h2', inicio: '2026-08-21T08:00:00.000Z', nombre: 'Pilates de suelo', instructora: 'Emma Ruiz' },
  { reservaId: 'h3', sesionId: 's-h3', inicio: '2026-08-14T17:00:00.000Z', nombre: 'Reformer suave', instructora: 'Marta Gómez' },
];

/**
 * Bandeja de avisos, SOLO para la previsualización de temas.
 *
 * En el portal real llega de `fetchNotificaciones` (tabla `notification`,
 * acotada por el JWT de la socia). Aquí no hay socia, y sin muestra la pantalla
 * de Avisos no se podría revisar nunca al mirar un tema.
 */
export const AVISOS_DE_MUESTRA = [
  { id: 'a1', tipo: 'Lista de espera', leido: false, cuando: 'Hace 5 min', accion: 'Confirmar mi plaza',
    texto: 'Se ha liberado una plaza en Reformer fuerza, mañana a las 18:00. Tienes 45 minutos para confirmarla.' },
  { id: 'a2', tipo: 'Recordatorio', leido: false, cuando: 'Hace 2 h', accion: null,
    texto: 'Pilates Reformer hoy a las 18:00 con Marta, en la Sala 2.' },
  { id: 'a3', tipo: 'Del estudio', leido: true, cuando: 'Ayer', accion: null,
    texto: 'La semana que viene abrimos huecos nuevos de mañana en reformer. Se publican el viernes.' },
  { id: 'a4', tipo: 'Reserva', leido: true, cuando: 'Ayer', accion: null,
    texto: 'Tu reserva de Pilates Reformer quedó confirmada.' },
];

export const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "reformer", label: "Reformer" },
  { key: "suelo", label: "Suelo" },
  { key: "prenatal", label: "Prenatal" },
] as const;

export const EXERCISES = [
  { name: "Flexión lateral sentada", seconds: 50 },
  { name: "Puente de hombros", seconds: 45 },
  { name: "Cien clásico", seconds: 60 },
  { name: "Estiramiento de columna", seconds: 40 },
];

export const NOTIFICATIONS = [
  { key: "recordatorio", label: "Recordatorio de clase", note: "2 horas antes", on: true },
  { key: "hueco", label: "Si se libera una plaza", note: "De la lista de espera", on: true },
  { key: "novedades", label: "Novedades del estudio", note: "Como mucho una al mes", on: false },
];

export const CHALLENGES = [
  { key: "core", label: "Core Pilates", days: "14 días", members: "156 K apuntadas", tone: "mint" },
  { key: "cara", label: "Face Yoga", days: "7 días", members: "42 K apuntadas", tone: "rose" },
];

export const WEEK_BARS = [
  { label: "L", height: 10 }, { label: "M", height: 26 }, { label: "X", height: 34 },
  { label: "J", height: 26 }, { label: "V", height: 30 }, { label: "S", height: 8 }, { label: "D", height: 8 },
];

export const QUICK_LINKS = [
  { key: "reservar", label: "Reservar", icon: "calendar", action: "goSchedule" },
  { key: "reservas", label: "Mis reservas", icon: "bookmark", action: "goBookings" },
  { key: "favoritas", label: "Favoritas", icon: "heart", action: "showFavourites" },
  { key: "bono", label: "Mi bono", icon: "pass", action: "goProfile" },
] as const;

export const TABS = [
  { key: "inicio", label: "Inicio", icon: "home" },
  { key: "clases", label: "Clases", icon: "calendar" },
  { key: "reservas", label: "Reservas", icon: "bookmark" },
  { key: "perfil", label: "Perfil", icon: "user" },
] as const;

/**
 * Las mismas cuatro de `TABS`, pero la tercera es «Agenda» con un reloj — la
 * barra de Sereno (`tab_set: "agenda"`, ver `TabSet` en tipos-tema.ts).
 *
 * La pantalla es la MISMA (`reservas`): lo que cambia es cómo la llama el
 * tema. Sereno la titula «Mi agenda» porque enseña la semana y el mes, no solo
 * la lista de lo reservado.
 */
export const TABS_AGENDA = [
  { key: "inicio", label: "Inicio", icon: "home" },
  { key: "clases", label: "Clases", icon: "calendar" },
  { key: "reservas", label: "Agenda", icon: "clock" },
  { key: "perfil", label: "Perfil", icon: "user" },
] as const;

/**
 * La barra de cinco de Tentada: Inicio · Reservas · Mi centro · Bonos · Perfil.
 *
 * Dos diferencias con `TABS` que no son cosméticas:
 *
 *  · «Reservas» aquí es el HORARIO (`clases`), donde se reserva — no la lista
 *    de las tuyas. Es como lo nombra el diseño, y encaja: la lista de las tuyas
 *    vive en el Inicio, con «Ver todas» llevando a `/reservas`, que sigue
 *    existiendo como ruta. No se pierde ninguna pantalla.
 *  · «Bonos» entra en la barra (era un acceso desde dentro) y «Mi centro» es
 *    pantalla nueva.
 *
 * ⚠️ Esto NO toca `NAV_SEG_IDS` (lib/portal-nav.ts), que es la barra del portal
 * de siempre y lo que la propietaria configura con ocultar/renombrar. Son dos
 * barras distintas conviviendo mientras dure el despliegue por fases; tocar
 * aquella cambiaría la config guardada de cada estudio.
 */
export const TABS_CON_CENTRO = [
  { key: "inicio", label: "Inicio", icon: "home" },
  { key: "clases", label: "Reservas", icon: "calendar" },
  { key: "centro", label: "Mi centro", icon: "pin" },
  { key: "bonos", label: "Bonos", icon: "pass" },
  { key: "perfil", label: "Perfil", icon: "user" },
] as const;

export const PLANS = [
  { key: "suelta", name: "Clase suelta", classes: 1, price: 18, badge: "", perks: ["Válida 30 días", "Cualquier sala"] },
  { key: "bono10", name: "Bono 10 clases", classes: 10, price: 145, badge: "La más elegida", perks: ["Caduca a los 3 meses", "Reserva con 15 días de antelación", "Cancelación gratis hasta 6 h antes"] },
  { key: "mensual", name: "Mensual ilimitado", classes: 999, price: 189, badge: "", perks: ["Clases sin límite", "Incluye prenatal", "Invita a una amiga al mes"] },
];

export const TEACHERS = [
  { name: "Marta Gómez", role: "Reformer · Fundadora", photo: "instructora-1.svg" },
  { name: "Emma Ruiz", role: "Suelo · Movilidad", photo: "instructora-2.svg" },
  { name: "Nuria Peña", role: "Prenatal · Suelo pélvico", photo: "instructora-3.svg" },
];

export const TESTIMONIALS = [
  { text: "Llevo ocho meses y he dejado de tener dolor lumbar. Las correcciones son constantes y eso se nota.", name: "Cristina R.", role: "Bono 10 clases" },
  { text: "Reservo desde el móvil en veinte segundos. Antes lo hacía por WhatsApp y siempre se liaba.", name: "Lucía M.", role: "Mensual ilimitado" },
  { text: "Empecé en prenatal y he seguido después del parto. El trato es de estudio pequeño, no de gimnasio.", name: "Alba T.", role: "Prenatal" },
];

export const FAQ = [
  { q: "¿Necesito experiencia previa?", a: "No. Las clases de iniciación empiezan por lo básico y la instructora corrige durante toda la sesión. Si nunca has hecho reformer, empieza por «Reformer suave»." },
  { q: "¿Con cuánta antelación puedo reservar?", a: "Con el bono de 10 clases puedes reservar hasta 15 días antes. Con la mensual ilimitada, hasta 30." },
  { q: "¿Qué pasa si no puedo ir?", a: "Puedes cancelar sin coste hasta 6 horas antes de la clase. La clase vuelve a tu bono al instante y avisamos a la lista de espera." },
  { q: "¿Qué llevo a la primera clase?", a: "Calcetines antideslizantes y ropa cómoda. El material lo pone el estudio." },
  { q: "¿Puedo cambiar de bono?", a: "Sí, en cualquier momento desde Perfil → Mi bono. Lo que te quede se descuenta del nuevo." },
];

export const PASS = { name: "Bono 10 clases", total: 10, expires: "30 de septiembre" };
export const MEMBER = {
  // `id` vacío a propósito: en la previsualización no hay socia, y sin id el
  // formulario de «Mis datos» no guarda nada — lo dice en pantalla.
  id: "", name: "Laura Ortega", short: "Laura", initial: "L",
  apellidos: "Ortega", email: "laura@correo.com", telefono: "+34 600 000 000",
  fechaNacimiento: "", direccion: "", domiciliado: false,
  // La previsualización SÍ enseña una tarjeta: es lo que deja ver la hoja de
  // métodos de pago con su forma real. No es de nadie — no hay socia aquí.
  tarjeta: { marca: "Visa", ultimos4: "4242", caduca: "04/27" },
};

/**
 * ⚠️ Devuelve `null` y no "la primera clase" como hacía la versión de muestra.
 *
 * Con los datos inventados siempre había una primera clase; con los de un
 * estudio real la lista puede estar VACÍA (una semana sin programar, un
 * estudio recién dado de alta), y `CLASSES[0]` habría sido `undefined` — con
 * la pantalla de detalle reventando al leerle el nombre.
 */
export const buscarClase = (datos: DatosPortal, id: string): StudioClass | null =>
  datos.clases.find((c) => c.id === id) ?? null;

export const etiquetaDia = (datos: DatosPortal, num: number): string =>
  datos.dias.find((d) => d.num === num)?.label ?? "";

export const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);

/** Lo que ve la previsualización de temas: no hay estudio del que tirar. */
export const DATOS_DE_MUESTRA: DatosPortal = {
  // La previsualización no tiene estudio, así que enseña las de por defecto:
  // exactamente lo que ve una socia cuya propietaria aún no ha subido ninguna.
  fotos: { portada: IMAGENES_POR_DEFECTO.portada[0], vertical: IMAGENES_POR_DEFECTO.vertical[0] },
  clases: CLASSES,
  // La política más común (`studios.cancelacion_devolver_bono_tardia` es
  // `false` por defecto): cancelando tarde no se recupera la sesión. Así la
  // previsualización enseña el aviso ámbar de la hoja de cancelar, que es el
  // caso que hay que poder mirar.
  devolverBonoTardia: false,
  // Coherente con `DAYS` (mar → 4) y con el día que la previsualización trae
  // seleccionado. En el portal real lo calcula `hoyDe()` en la zona del
  // estudio; aquí es de muestra, como el resto de este objeto.
  // Fecha de referencia de los datos de MUESTRA. Fija a propósito: la vista
  // previa tiene que verse igual hoy que dentro de un mes.
  // ⚠️ Tiene que ser el MISMO día que `hoy` y que la semana de `DAYS`. Estaba
  // en agosto mientras la semana y las clases eran de septiembre, y nadie lo
  // notó porque hasta ahora nada comparaba una fecha COMPLETA contra este
  // instante: la rejilla del mes de la agenda salía en agosto y el día
  // seleccionado no casaba con ninguna clase. Los datos de muestra tienen que
  // ser coherentes entre sí o la previsualización miente.
  ahoraISO: '2026-09-04T09:00:00.000Z',
  hoy: { num: 4, largo: "martes, 4 de septiembre", mes: "septiembre" },
  // De muestra, como el resto: en el portal real viene de `calcularRacha`
  // (`lib/engines/streak-engine.ts`), la misma que alimenta los logros.
  racha: { semanas: 6, esMejor: true },
  estudio: {
    nombre: "Estudio Tentada", anioFundacion: 2019,
    direccion: "Carrer de la Pau, 12", ciudad: "Barcelona", codigoPostal: "08001",
    telefono: "+34 600 123 456", email: "hola@estudiotentada.com",
    fotoUrl: null, imagenBienvenidaUrl: null,
    normas: [
      "Llega 5 minutos antes: las clases empiezan puntuales.",
      "Calcetines antideslizantes obligatorios en todas las salas.",
      "Cancela con 6 h de antelación para recuperar tu clase.",
    ],
    horario: [
      { dia: "Lunes", cuando: "8:00 – 21:00" }, { dia: "Martes", cuando: "8:00 – 21:00" },
      { dia: "Miércoles", cuando: "8:00 – 21:00" }, { dia: "Jueves", cuando: "8:00 – 21:00" },
      { dia: "Viernes", cuando: "8:00 – 21:00" }, { dia: "Sábado", cuando: "9:00 – 14:00" },
      { dia: "Domingo", cuando: "Cerrado" },
    ],
    privacidad: "Tus datos pertenecen a tu estudio y solo se usan para gestionar tus reservas, bonos y comunicaciones de clase.",
  },
  dias: [...DAYS],
  filtros: [...FILTERS],
  planes: PLANS,
  bono: PASS,
  // Dos, y uno ilimitado: el caso que `bonoDe` descarta a propósito y que
  // hasta ahora no se veía en ninguna pantalla.
  bonos: [
    { id: "b10", planKey: "bono10", name: "Bono 10 clases", unlimited: false, left: 8, total: 10,
      subline: "8 clases restantes", footline: "Caduca el 30 de septiembre", percent: 80,
      terminos: ["Caduca a los 90 días de comprarlo", "Máximo 3 clases por semana"] },
    { id: "plan", planKey: "mensual", name: "Plan Mensual", unlimited: true, left: 0, total: 0,
      subline: "Clases ilimitadas", footline: "Renovación el 1 de octubre", percent: 0,
      // Sin condiciones: así se ve también el bono que NO ofrece «Ver detalles».
      terminos: [] },
  ],
  compras: [
    { id: "r1", concepto: "Bono 10 clases", cuando: "Comprado el 12 de marzo", importe: "145,00 €" },
    { id: "r2", concepto: "Plan Mensual", cuando: "Comprado el 1 de septiembre", importe: "189,00 €" },
  ],
  socia: MEMBER,
  profesores: [
    { id: "i1", nombre: "Marta Gómez", inicial: "M", bio: "Fundadora del estudio. Más de diez años enseñando método clásico y contemporáneo.", foto: "" },
    { id: "i2", nombre: "Emma Ruiz", inicial: "E", bio: "Formada en método clásico. Precisión técnica y muy buen ritmo.", foto: "" },
    // Sin bio: la ficha no pinta un párrafo vacío ni texto de relleno.
    { id: "i3", nombre: "Nuria Peña", inicial: "N", bio: "", foto: "" },
  ],
};
