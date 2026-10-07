// La HISTORIA de una clienta: una sola línea de tiempo con lo que ha pasado,
// que hoy está repartido por media docena de sitios (sus reservas, sus cobros,
// los correos que se le han mandado, las notas, sus planes, su alta…).
//
// Es de SOLO LECTURA: junta datos que ya existen, no guarda nada. Lo que ve cada
// rol lo decide quien llama (`verDinero`, `verNotas`): esta función no sabe de
// permisos, solo no incluye lo que no se le pide.
//
// Puro: se prueba con `node --test`.
import { hoyEnEstudio } from '../utils.ts';

import { euros } from './euros.ts';
export type GrupoHistoria = 'CONTACTOS' | 'CLASES' | 'PAGOS' | 'AVISOS' | 'NOTAS';

export interface EventoHistoria {
  id: string;
  /** Instante (ISO) o día ('YYYY-MM-DD'); se ordena por él. */
  cuando: string;
  /** `CLASES`: varias clases seguidas de una misma semana, juntas (`compactarHistoria`). */
  tipo: 'CLASE' | 'CLASES' | 'CANCELACION' | 'FALTA' | 'CLASE_CANCELADA' | 'COBRO' | 'COBRO_FALLIDO' | 'DEVOLUCION' | 'CORREO' | 'NOTA' | 'PLAN' | 'ALTA' | 'CONTACTO' | 'SEGUIMIENTO' | 'BAJA' | 'VUELTA';
  /** Para filtrar; `null` = solo sale en «Todo». */
  grupo: GrupoHistoria | null;
  titulo: string;
  detalle?: string;
  /** Quién lo hizo, si fue alguien del equipo. */
  quien?: string | null;
  /** Cómo se pinta: un contacto de alguien del equipo, dinero, o un problema. */
  tono?: 'contacto' | 'dinero' | 'problema' | null;
  /** El nombre de la clase, en las clases a las que vino (para juntarlas). */
  clase?: string;
}

export interface ReservaParaHistoria {
  id: string;
  estado: string;
  canceladaTardia?: boolean | null;
  /** Inicio de la clase (ISO). */
  inicio: string | null;
  claseCancelada?: boolean;
  tipoClase: string | null;
  instructora: string | null;
}

export interface ReciboParaHistoria {
  id: string;
  concepto: string;
  importe: number;
  estado: string;
  fechaVencimiento: string | null;
  fechaCobro: string | null;
  fechaDevolucion: string | null;
  metodoCobro?: string | null;
}

export interface ComunicacionParaHistoria {
  id: string;
  asunto: string;
  estado: 'ENVIADO' | 'FALLIDO';
  error: string | null;
  creadoEn: string;
  creadoPorNombre: string | null;
}

export interface NotaParaHistoria {
  id: string;
  texto: string;
  tipo: 'NOTA' | 'SISTEMA';
  creadoEn: string;
  autor?: string | null;
}

export interface PlanParaHistoria {
  id: string;
  plan: string;
  fechaInicio: string;
}

export interface SeguimientoParaHistoria {
  id: string;
  titulo: string;
  /** Cuándo se hizo (ISO). Los pendientes no son historia: están en su tarjeta. */
  completadoEn: string;
  quien: string | null;
}

export interface ContactoParaHistoria {
  id: string;
  canal: 'WHATSAPP' | 'LLAMADA' | 'EN_PERSONA' | 'EMAIL';
  resultado: 'VA_A_VOLVER' | 'SE_LO_PIENSA' | 'NO_CONTESTA' | 'NO_QUIERE_SEGUIR' | null;
  nota: string | null;
  creadoEn: string;
  autor: string | null;
}


// Con el género de la persona: «la llamó» / «lo llamó», «con ella» / «con él».
const COMO_CONTACTO: Record<ContactoParaHistoria['canal'], (hombre: boolean) => string> = {
  WHATSAPP: () => 'Le escribió por WhatsApp',
  LLAMADA: h => (h ? 'Lo llamó' : 'La llamó'),
  EN_PERSONA: h => `Habló con ${h ? 'él' : 'ella'} en el estudio`,
  EMAIL: () => 'Le escribió un correo',
};
const RESULTADO_CONTACTO: Record<NonNullable<ContactoParaHistoria['resultado']>, string> = {
  VA_A_VOLVER: 'va a volver',
  SE_LO_PIENSA: 'se lo piensa',
  NO_CONTESTA: 'no contesta',
  NO_QUIERE_SEGUIR: 'no quiere seguir',
};

export function historiaDeClienta(
  datos: {
    fechaAlta: string | null | undefined;
    reservas: readonly ReservaParaHistoria[];
    recibos: readonly ReciboParaHistoria[];
    comunicaciones: readonly ComunicacionParaHistoria[];
    notas: readonly NotaParaHistoria[];
    planes: readonly PlanParaHistoria[];
    contactos?: readonly ContactoParaHistoria[];
    seguimientos?: readonly SeguimientoParaHistoria[];
    /** Sus bajas (con el motivo ya en palabras) y, si volvió, cuándo. */
    bajas?: readonly { id: string; motivo: string | null; bajaEn: string; altaEn: string | null }[];
  },
  opciones: { verDinero: boolean; verNotas: boolean; ahora: Date; genero?: 'MUJER' | 'HOMBRE' | null },
): EventoHistoria[] {
  const ahoraIso = opciones.ahora.toISOString();
  const ev: EventoHistoria[] = [];

  for (const r of datos.reservas) {
    // Lo que está por venir no es historia: son sus próximas clases.
    if (!r.inicio || r.inicio > ahoraIso) continue;
    const clase = r.tipoClase ?? 'una clase';
    if (r.estado === 'ASISTIDA') {
      ev.push({ id: `res-${r.id}`, cuando: r.inicio, tipo: 'CLASE', grupo: 'CLASES', titulo: `Vino a ${clase}`, detalle: r.instructora ? `con ${r.instructora}` : undefined, clase });
    } else if (r.estado === 'NO_ASISTIO') {
      ev.push({ id: `res-${r.id}`, cuando: r.inicio, tipo: 'FALTA', grupo: 'CLASES', titulo: `No vino a ${clase}`, detalle: 'Reservó y no se presentó', tono: 'problema' });
    } else if (r.estado === 'CANCELADA' && r.claseCancelada) {
      ev.push({ id: `res-${r.id}`, cuando: r.inicio, tipo: 'CLASE_CANCELADA', grupo: 'CLASES', titulo: `Se canceló la clase de ${clase}`, detalle: 'La canceló el estudio' });
    } else if (r.estado === 'CANCELADA') {
      ev.push({
        id: `res-${r.id}`, cuando: r.inicio, tipo: 'CANCELACION', grupo: 'CLASES', titulo: `Canceló ${clase}`,
        // Solo se dice si se sabe: sin el dato, ni «a tiempo» ni «tarde».
        detalle: r.canceladaTardia === true ? 'Fuera de plazo' : r.canceladaTardia === false ? 'A tiempo' : undefined,
        tono: r.canceladaTardia === true ? 'problema' : null,
      });
    }
  }

  if (opciones.verDinero) {
    for (const r of datos.recibos) {
      if (r.estado === 'COBRADO' && r.fechaCobro) {
        ev.push({ id: `rec-${r.id}`, cuando: r.fechaCobro, tipo: 'COBRO', grupo: 'PAGOS', titulo: `Cobro de ${euros(r.importe)}`, detalle: r.concepto, tono: 'dinero' });
      } else if (r.estado === 'FALLIDO') {
        ev.push({ id: `rec-${r.id}`, cuando: r.fechaVencimiento ?? r.fechaCobro ?? '', tipo: 'COBRO_FALLIDO', grupo: 'PAGOS', titulo: `No se pudo cobrar ${euros(r.importe)}`, detalle: r.concepto, tono: 'problema' });
      } else if (r.estado === 'DEVUELTO' && r.fechaDevolucion) {
        ev.push({ id: `rec-${r.id}`, cuando: r.fechaDevolucion, tipo: 'DEVOLUCION', grupo: 'PAGOS', titulo: `Devolución de ${euros(r.importe)}`, detalle: r.concepto, tono: 'problema' });
      }
    }
    for (const p of datos.planes) {
      ev.push({ id: `plan-${p.id}`, cuando: p.fechaInicio, tipo: 'PLAN', grupo: 'PAGOS', titulo: `Empezó ${p.plan}` });
    }
  }

  for (const c of datos.comunicaciones) {
    // Lo que mandó alguien del equipo es un contacto; lo que salió solo, un aviso.
    const porAlguien = !!c.creadoPorNombre;
    ev.push({
      id: `com-${c.id}`, cuando: c.creadoEn, tipo: 'CORREO', grupo: porAlguien ? 'CONTACTOS' : 'AVISOS',
      titulo: `Correo: «${c.asunto}»`,
      detalle: c.estado === 'FALLIDO' ? `No le llegó${c.error ? `: ${c.error}` : ''}` : porAlguien ? undefined : 'Automático',
      quien: c.creadoPorNombre,
      tono: c.estado === 'FALLIDO' ? 'problema' : porAlguien ? 'contacto' : null,
    });
  }

  for (const c of datos.contactos ?? []) {
    const resultado = c.resultado ? ` · ${RESULTADO_CONTACTO[c.resultado]}` : '';
    ev.push({
      id: `con-${c.id}`, cuando: c.creadoEn, tipo: 'CONTACTO', grupo: 'CONTACTOS',
      titulo: `${COMO_CONTACTO[c.canal](opciones.genero === 'HOMBRE')}${resultado}`,
      detalle: c.nota ? `«${c.nota}»` : undefined,
      quien: c.autor, tono: 'contacto',
    });
  }

  for (const b of datos.bajas ?? []) {
    ev.push({ id: `baja-${b.id}`, cuando: b.bajaEn, tipo: 'BAJA', grupo: null, titulo: b.motivo ? `Se dio de baja: ${b.motivo.toLowerCase()}` : 'Se dio de baja', tono: 'problema' });
    if (b.altaEn) ev.push({ id: `vuelta-${b.id}`, cuando: b.altaEn, tipo: 'VUELTA', grupo: null, titulo: 'Volvió a darse de alta' });
  }

  for (const sg of datos.seguimientos ?? []) {
    ev.push({ id: `seg-${sg.id}`, cuando: sg.completadoEn, tipo: 'SEGUIMIENTO', grupo: 'CONTACTOS', titulo: `Hecho: ${sg.titulo}`, quien: sg.quien, tono: 'contacto' });
  }

  if (opciones.verNotas) {
    for (const n of datos.notas) {
      ev.push({
        id: `nota-${n.id}`, cuando: n.creadoEn, tipo: 'NOTA', grupo: 'NOTAS',
        titulo: n.tipo === 'SISTEMA' ? 'Nota automática' : 'Nota',
        detalle: n.texto, quien: n.autor ?? null,
      });
    }
  }

  // Sin fecha de alta (fichas importadas o muy antiguas) no se inventa una.
  if (datos.fechaAlta && !Number.isNaN(new Date(datos.fechaAlta).getTime())) {
    ev.push({ id: 'alta', cuando: datos.fechaAlta, tipo: 'ALTA', grupo: null, titulo: 'Se dio de alta en el estudio' });
  }

  return ev
    .filter(e => e.cuando)
    // Más reciente primero; un día suelto ('YYYY-MM-DD') va al final de ese día.
    .sort((a, b) => clave(b.cuando).localeCompare(clave(a.cuando)));
}

function clave(cuando: string): string {
  return cuando.length === 10 ? `${cuando}T23:59:59` : cuando;
}

// ─── Para pintarla ──────────────────────────────────────────────────────────

export type ItemHistoria =
  | { tipo: 'MES'; id: string; titulo: string }
  | { tipo: 'EVENTO'; evento: EventoHistoria };

const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Con el formateador de `hoyEnEstudio`, que se construye una vez: aquí se
// construía uno por evento (dos por clase al juntarlas por semana, y en cada
// render), y con una clienta de 119 clases eso eran 0,7 s al abrir su ficha
// (perfil de CPU a ×2).
function diaDeEvento(cuando: string, tz: string): string {
  return cuando.length === 10 ? cuando : hoyEnEstudio(new Date(cuando), tz);
}

function lunesDe(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Lo que se pinta, a partir de la historia ya ordenada (más reciente primero):
 *
 * · `agruparClases`: las clases a las que vino SEGUIDAS dentro de una misma
 *   semana van en una línea («Vino a 3 clases» · «lun 28 Mat · mié 30 Mat · vie 2
 *   Reformer»). A quien viene tres veces por semana, una línea por clase le
 *   enterraba lo que importa —una falta, un cobro que falló, un contacto— bajo
 *   treinta «Vino a Mat». Si entre dos clases pasó otra cosa, no se juntan: el
 *   orden de lo que pasó no se toca.
 * · `meses`: un separador cada vez que cambia el mes («Septiembre», «Agosto 2025»).
 */
export function compactarHistoria(
  eventos: readonly EventoHistoria[],
  opciones: { agruparClases: boolean; meses: boolean; hoyISO: string; tz?: string },
): ItemHistoria[] {
  const tz = opciones.tz ?? 'Europe/Madrid';
  const juntos: EventoHistoria[] = [];
  for (let i = 0; i < eventos.length; i++) {
    const e = eventos[i];
    if (!opciones.agruparClases || e.tipo !== 'CLASE') { juntos.push(e); continue; }
    const semana = lunesDe(diaDeEvento(e.cuando, tz));
    const grupo = [e];
    while (i + 1 < eventos.length && eventos[i + 1].tipo === 'CLASE' && lunesDe(diaDeEvento(eventos[i + 1].cuando, tz)) === semana) {
      grupo.push(eventos[++i]);
    }
    if (grupo.length === 1) { juntos.push(e); continue; }
    // Dentro de la línea, en el orden de la semana (de lunes a domingo).
    const detalle = [...grupo].reverse().map(g => {
      const ymd = diaDeEvento(g.cuando, tz);
      const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
      return `${DIAS_CORTOS[dow]} ${Number(ymd.slice(8, 10))} ${g.clase ?? 'clase'}`;
    }).join(' · ');
    juntos.push({
      id: `sem-${semana}-${grupo[0].id}`, cuando: grupo[0].cuando, tipo: 'CLASES', grupo: 'CLASES',
      titulo: `Vino a ${grupo.length} clases`, detalle,
    });
  }
  if (!opciones.meses) return juntos.map(evento => ({ tipo: 'EVENTO', evento }));

  const items: ItemHistoria[] = [];
  let mesAnterior = '';
  for (const evento of juntos) {
    const mes = diaDeEvento(evento.cuando, tz).slice(0, 7);
    if (mes !== mesAnterior) {
      const nombre = MESES_LARGOS[Number(mes.slice(5, 7)) - 1];
      items.push({ tipo: 'MES', id: `mes-${mes}`, titulo: mes.slice(0, 4) === opciones.hoyISO.slice(0, 4) ? nombre : `${nombre} ${mes.slice(0, 4)}` });
      mesAnterior = mes;
    }
    items.push({ tipo: 'EVENTO', evento });
  }
  return items;
}
