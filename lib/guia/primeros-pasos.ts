// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» (panel nuevo, 14-oct-2026): la lista corta de
// Bonsai («Mis primeros pasos», cinco tareas con progreso) hecha con lo que ya
// sabe el panel. Puro, sin `@/`.
//
// NO decide qué está hecho: lo dice `calcularOnboarding` (lib/onboarding.ts),
// con datos reales, igual que la lista de arranque y /primeros-pasos. Aquí solo
// se elige QUÉ seis cosas se enseñan, en qué orden y con qué palabras: cada
// tarea es un verbo y una línea de para qué sirve, como en Bonsai.
//
// El orden es el del camino a la primera reserva (medido en producción el
// 12-sep: donde se cae la mitad es en programar clases). El NIF no está: no
// hace falta para que alguien reserve, y ya lo pide la bandeja. Stripe va
// aparte y marcado como opcional: un estudio que cobra en el mostrador no debe
// ver su lista «a medias» para siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTRADA_PRIMERA_CLASE } from '../alta/bienvenida-nueva.ts';
import { otrasSedes, PRECIO_CADENA_MES, type TotalSedes } from '../alta/tu-estudio.ts';

export interface TareaPrimerosPasos {
  /** Id del paso en `calcularOnboarding`, que es quien dice si está hecho. */
  id: string;
  titulo: string;
  /** Para qué sirve, en una línea. */
  para: string;
  href: string;
  /** Un segundo camino, cuando lo hay («Importar»). */
  otro?: { label: string; href: string };
  opcional?: boolean;
}

export const TAREAS: readonly TareaPrimerosPasos[] = [
  {
    id: 'instructor',
    titulo: 'Añade a quien da las clases',
    para: 'Toda clase necesita a alguien asignado, aunque seas tú.',
    href: '/equipo?nuevo=1',
  },
  {
    id: 'clase',
    titulo: 'Crea tu primer tipo de clase',
    para: 'Reformer, Mat…: se define una vez y sirve para todo tu horario.',
    href: '/configuracion?tab=clases&abrir=tipos-de-clase',
  },
  {
    id: 'horario',
    titulo: 'Programa tus clases',
    para: 'Sin clases en el calendario, nadie puede reservar.',
    href: '/calendario?nueva=1',
  },
  {
    id: 'bonos',
    titulo: 'Pon a la venta una cuota o un bono',
    para: 'Para que tus alumnas paguen por adelantado y no clase a clase.',
    href: '/productos',
  },
  {
    id: 'clientes',
    titulo: 'Trae a tus alumnas',
    para: 'Dalas de alta o tráelas de tu programa anterior.',
    href: '/clientas?nuevo=1',
    otro: { label: 'Importar', href: '/migracion' },
  },
  {
    id: 'primera-reserva',
    titulo: 'Recibe tu primera reserva',
    para: 'Comparte el enlace de tu app: ahí empieza Tentare a trabajar por ti.',
    href: '/configuracion?tab=web#direccion-y-enlaces',
  },
];

export const OPCIONAL: TareaPrimerosPasos = {
  id: 'stripe',
  titulo: 'Cobra online',
  para: 'Con tarjeta o domiciliación. Si cobras en el mostrador, no te hace falta.',
  href: '/configuracion?tab=conexiones#integracion-stripe',
  opcional: true,
};

export interface TareaConEstado extends TareaPrimerosPasos {
  hecha: boolean;
}

export interface PrimerosPasos {
  tareas: TareaConEstado[];
  opcional: TareaConEstado;
  hechas: number;
  total: number;
  /** La primera tarea sin hacer; `null` = las seis hechas. */
  siguiente: TareaConEstado | null;
}

/**
 * Las seis tareas con su estado. Un paso que `calcularOnboarding` no conozca
 * cuenta como NO hecho: mejor una tarea de más que dar por hecha una que no lo
 * está (lo vigila el test contra el catálogo real).
 */
export function primerosPasos(categorias: readonly { pasos: readonly { id: string; done: boolean }[] }[]): PrimerosPasos {
  const hecho = new Map<string, boolean>();
  for (const c of categorias) for (const p of c.pasos) hecho.set(p.id, p.done);
  const tareas = TAREAS.map(t => ({ ...t, hecha: hecho.get(t.id) === true }));
  const hechas = tareas.filter(t => t.hecha).length;
  return {
    tareas,
    opcional: { ...OPCIONAL, hecha: hecho.get(OPCIONAL.id) === true },
    hechas,
    total: tareas.length,
    siguiente: tareas.find(t => !t.hecha) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» del ALTA NUEVA (PR-5, maqueta aprobada del
// 21-oct-2026, «08 · El panel después»). Tras `ALTA_NUEVA`, o para el estudio
// que nació de ella; sin eso, la lista de arriba, como siempre.
//
// Cinco tareas en el orden del valor —cuenta, primera clase, compartir,
// alumnas, primera reserva— y no las seis de arriba: la instructora, el tipo de
// clase y la tarifa ya van DENTRO de la primera clase (una sola operación, el
// PR-4). Se marcan SOLAS, con datos reales:
//   · la cuenta, hecha: quien la ve ya tiene estudio;
//   · la primera clase = clase RESERVABLE, el «sí» del servidor (nunca «tiene un
//     tipo de clase», el fallo de `calcularOnboarding`);
//   · compartir = el embudo dice que copió, mandó o bajó el QR de su enlace;
//   · alumnas = alguna ficha (importada o no: importar crea fichas);
//   · primera reserva = el hito 2, el «activado» de siempre (`estudioActivado`).
//
// Guía en orden (fundador, 21-oct: «automáticamente hacer los primeros pasos,
// lo de omitir está bien»): la primera sin hacer es la que se ofrece, con su
// botón; al quedar hecha, se ofrece la siguiente. Cada una se puede OMITIR, y
// entonces se ofrece la siguiente; omitir no la da por hecha (eso solo lo dicen
// los datos) y se recuerda en el navegador, que es una comodidad de quien mira.
// ─────────────────────────────────────────────────────────────────────────────

export type IdTareaAlta = 'cuenta' | 'primera-clase' | 'compartir' | 'alumnas' | 'primera-reserva';

/** El botón de una tarea: lleva a otra pantalla o abre «Compartir mi enlace» ahí mismo. */
export type AccionTareaAlta = { label: string; href: string } | { label: string; abre: 'compartir' };

export interface TareaAlta {
  id: IdTareaAlta;
  titulo: string;
  para: string;
  /** Sin botón, la tarea se marca sola (la cuenta, la primera reserva): no se puede omitir. */
  accion?: AccionTareaAlta;
  /** Un segundo camino, cuando lo hay. */
  otro?: { label: string; href: string };
  /** Lo que se tarda, para «Ya casi está: unos N minutos». */
  minutos?: number;
}

/** Los textos de la maqueta, tal cual. */
export const TAREAS_ALTA_NUEVA: readonly TareaAlta[] = [
  { id: 'cuenta', titulo: 'Crea tu cuenta', para: 'Hecho: la app de tus alumnas ya existe.' },
  {
    id: 'primera-clase', titulo: 'Crea tu primera clase', para: 'Con una clase y su precio, tus alumnas ya pueden reservar.',
    accion: { label: 'Crear mi primera clase', href: ENTRADA_PRIMERA_CLASE }, minutos: 5,
  },
  {
    id: 'compartir', titulo: 'Comparte el enlace de tu app', para: 'Por WhatsApp, en Instagram o con el QR en recepción.',
    accion: { label: 'Compartir mi enlace', abre: 'compartir' }, minutos: 2,
  },
  {
    id: 'alumnas', titulo: 'Trae a tus alumnas', para: 'Impórtalas de tu programa o de tu Excel, o añádelas una a una.',
    // La Migración Mágica lee el export de su programa y un Excel; una a una, en Clientas.
    accion: { label: 'Importar', href: '/migracion' }, otro: { label: 'Añadir una', href: '/clientas?nuevo=1' }, minutos: 3,
  },
  { id: 'primera-reserva', titulo: 'Recibe tu primera reserva', para: 'Se marca sola cuando una alumna reserve desde tu app.' },
];

/** «Recibe tu primera reserva» cuando el enlace ya está compartido y nadie ha reservado: qué ayuda, no «espera». */
export const TEXTO_PRIMERA_RESERVA_TRAS_COMPARTIR =
  'Suele hacer falta pedírselo: escribe a tus alumnas con el enlace, deja el QR en recepción y date de alta a las que ya tienes, con su correo.';

export type IdOpcionalAlta = 'marca' | 'stripe' | 'fiscales' | 'equipo' | 'sedes';

export interface OpcionalAlta {
  id: IdOpcionalAlta;
  titulo: string;
  /** Lo de la derecha: lo que se tarda o cuándo no hace falta. */
  nota: string;
  href: string;
  hecha: boolean;
}

/**
 * Los opcionales, «cuando quieras». Sin la palabra «SEPA» (la domiciliación no
 * se vende aquí) y con «si cobras en el estudio, no»: a quien cobra en el
 * mostrador, Stripe no le hace falta para recibir reservas. Los enlaces van
 * escritos (no con `hrefDeTarjeta`, que trae el catálogo entero de
 * Configuración al marco del panel); el test los cruza con él.
 */
const OPCIONALES_ALTA_NUEVA: readonly Omit<OpcionalAlta, 'hecha'>[] = [
  { id: 'marca', titulo: 'Pon tu logo y tu color', nota: '2 min', href: '/configuracion?tab=marca' },
  { id: 'stripe', titulo: 'Cobra online con Stripe', nota: 'si cobras en el estudio, no', href: '/configuracion?tab=conexiones#integracion-stripe' },
  { id: 'fiscales', titulo: 'Tus datos fiscales, para facturar', nota: '3 min', href: '/configuracion?tab=cobros#datos-fiscales' },
  { id: 'equipo', titulo: 'Invita a tu equipo', nota: '2 min', href: '/equipo' },
];

/** «Abre tu otra sede» / «Abre tus otras 2 sedes» / «Abre tus otras 4 o más sedes». */
export function tituloOtrasSedes(total: TotalSedes): string {
  return total === 2 ? 'Abre tu otra sede' : `Abre tus otras ${otrasSedes(total)} sedes`;
}

export type EstadoTareaAlta = 'hecha' | 'ahora' | 'pendiente';

export interface TareaAltaConEstado extends TareaAlta {
  estado: EstadoTareaAlta;
  /** La omitió: sigue sin hacer, pero ya no es la que se ofrece. */
  omitida: boolean;
}

export interface DatosAltaNueva {
  claseReservable: boolean;
  /** Hay clase, pero una alumna nueva aún no puede reservarla (lib/alta/estado.ts). */
  avisoClase?: { texto: string; href: string } | null;
  enlaceCompartido: boolean;
  alumnas: boolean;
  primeraReserva: boolean;
  marca: boolean;
  stripe: boolean;
  fiscales: boolean;
  equipo: boolean;
  /** «¿Tienes varias sedes?» del alta: cuántas dijo y cuántas tiene ya. `null` = solo esta. */
  sedes: { total: TotalSedes; abiertas: number } | null;
  omitidas?: readonly string[];
}

export interface PrimerosPasosAltaNueva {
  tareas: TareaAltaConEstado[];
  hechas: number;
  total: number;
  /** Las cinco hechas: «Tu estudio está en marcha». */
  terminada: boolean;
  /** La que se ofrece ahora: la primera sin hacer y sin omitir. */
  ahora: TareaAltaConEstado | null;
  /** «Paso 2 de 5» / «5 de 5 hechos». */
  paso: string;
  /** «Ya casi está: unos 10 minutos» / «Tu estudio está en marcha». */
  queda: string;
  /** «1/5», para la píldora. */
  corto: string;
  opcionales: OpcionalAlta[];
  opcionalesHechos: number;
}

export function primerosPasosAltaNueva(d: DatosAltaNueva): PrimerosPasosAltaNueva {
  const hecho: Record<IdTareaAlta, boolean> = {
    cuenta: true,
    'primera-clase': d.claseReservable,
    compartir: d.enlaceCompartido,
    alumnas: d.alumnas,
    'primera-reserva': d.primeraReserva,
  };
  const omitidas = new Set(d.omitidas ?? []);
  const base = TAREAS_ALTA_NUEVA.map((t): TareaAlta => (
    // Con una clase que aún no se puede reservar, crear otra no es lo que falta:
    // se dice qué pasa y se lleva a donde se arregla.
    t.id === 'primera-clase' && !d.claseReservable && d.avisoClase
      ? { ...t, para: d.avisoClase.texto, accion: { label: 'Ver qué falta', href: d.avisoClase.href } }
      // Con el enlace ya compartido y ninguna reserva, «se marca sola» deja a quien mira sin
      // saber qué hacer (31-oct-2026: dos estudios compartieron el enlace y nadie reservó). Se
      // dice qué ayuda y se vuelve a abrir su enlace y su QR. Omitir aquí no cuenta como hecho.
      : t.id === 'primera-reserva' && d.enlaceCompartido && !d.primeraReserva
        ? { ...t, para: TEXTO_PRIMERA_RESERVA_TRAS_COMPARTIR, accion: { label: 'Ver mi enlace y mi QR', abre: 'compartir' } }
        : t
  ));
  // Omitir solo vale en lo que tiene botón: lo que se marca solo no se salta.
  const omitida = (t: TareaAlta) => !hecho[t.id] && !!t.accion && omitidas.has(t.id);
  const idAhora = base.find(t => !hecho[t.id] && !omitida(t))?.id ?? null;
  const tareas: TareaAltaConEstado[] = base.map(t => ({
    ...t,
    estado: hecho[t.id] ? 'hecha' : t.id === idAhora ? 'ahora' : 'pendiente',
    omitida: omitida(t),
  }));
  const hechas = tareas.filter(t => t.estado === 'hecha').length;
  const total = tareas.length;
  const terminada = hechas === total;
  const minutos = tareas.filter(t => t.estado !== 'hecha').reduce((s, t) => s + (t.minutos ?? 0), 0);

  const opcionales: OpcionalAlta[] = OPCIONALES_ALTA_NUEVA.map(o => ({ ...o, hecha: d[o.id as Exclude<IdOpcionalAlta, 'sedes'>] }));
  if (d.sedes && d.sedes.total > 1) {
    opcionales.push({
      id: 'sedes',
      titulo: tituloOtrasSedes(d.sedes.total),
      nota: `plan Cadena, ${PRECIO_CADENA_MES} €/mes`,
      href: '/suscripcion',
      hecha: d.sedes.abiertas >= d.sedes.total,
    });
  }

  return {
    tareas,
    hechas,
    total,
    terminada,
    ahora: tareas.find(t => t.estado === 'ahora') ?? null,
    paso: terminada ? `${total} de ${total} hechos` : `Paso ${hechas + 1} de ${total}`,
    queda: terminada ? 'Tu estudio está en marcha' : minutos > 0 ? `Ya casi está: unos ${minutos} minutos` : 'Ya casi está',
    corto: `${hechas}/${total}`,
    opcionales,
    opcionalesHechos: opcionales.filter(o => o.hecha).length,
  };
}
