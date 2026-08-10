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

import type { DatosPortal, StudioClass } from "@/lib/portal-tema/tipos";

export type { DatosPortal, StudioClass } from "@/lib/portal-tema/tipos";

export const DAYS = [
  { key: "lun", label: "LUN", num: 3 },
  { key: "mar", label: "MAR", num: 4 },
  { key: "mie", label: "MIÉ", num: 5 },
  { key: "jue", label: "JUE", num: 6 },
  { key: "vie", label: "VIE", num: 7 },
  { key: "sab", label: "SÁB", num: 8 },
  { key: "dom", label: "DOM", num: 9 },
] as const;

export const CLASSES: StudioClass[] = [
  { id: "c1", name: "Pilates Reformer", type: "reformer", day: 4, time: "18:00", end: "19:00", duration: "50 min", room: "Sala 2", level: "Intermedio", teacher: "Marta Gómez", initial: "M", seats: 3,
    description: "Clase dinámica para trabajar fuerza, flexibilidad y control. Enfoque en técnica y respiración." },
  { id: "c2", name: "Pilates de suelo", type: "suelo", day: 4, time: "10:00", end: "10:50", duration: "50 min", room: "Sala A", level: "Todos", teacher: "Emma Ruiz", initial: "E", seats: 6,
    description: "Trabajo de cuerpo completo sobre colchoneta. Control del centro y movilidad de columna." },
  { id: "c3", name: "Reformer fuerza", type: "reformer", day: 5, time: "09:00", end: "09:50", duration: "50 min", room: "Sala 2", level: "Avanzado", teacher: "Sofía Marín", initial: "S", seats: 12,
    description: "Sesión de cuerpo completo en reformer. Trabajo de control, resistencia y alineación." },
  { id: "c4", name: "Pilates prenatal", type: "prenatal", day: 5, time: "11:30", end: "12:15", duration: "45 min", room: "Sala A", level: "Suave", teacher: "Nuria Peña", initial: "N", seats: 4,
    description: "Adaptada a cada trimestre. Suelo pélvico, respiración y alivio de la zona lumbar." },
  { id: "c5", name: "Reformer suave", type: "reformer", day: 6, time: "19:00", end: "19:50", duration: "50 min", room: "Sala 2", level: "Iniciación", teacher: "Marta Gómez", initial: "M", seats: 0,
    description: "Ritmo pausado y muchas correcciones. La mejor puerta de entrada al reformer." },
  { id: "c6", name: "Abdomen y espalda", type: "suelo", day: 7, time: "08:00", end: "08:40", duration: "40 min", room: "Sala A", level: "Intermedio", teacher: "Emma Ruiz", initial: "E", seats: 5,
    description: "Cuarenta minutos centrados en el core y la cadena posterior. Empieza bien el día." },
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
export const MEMBER = { name: "Laura Ortega", short: "Laura", initial: "L" };

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
  clases: CLASSES,
  dias: [...DAYS],
  filtros: [...FILTERS],
  planes: PLANS,
  bono: PASS,
  socia: MEMBER,
};
