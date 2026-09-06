// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — las cifras hablan de lo que se está MIRANDO (I-8).
//
// Antes el panel de cifras siempre decía "hoy" aunque estuvieras mirando otra
// semana. Dos juegos de cifras, uno por vista: Día → Ahora/Después/Ocupación
// del día. Semana → Clases/Ocupación media/Por debajo del 60%.
// ─────────────────────────────────────────────────────────────────────────────

import { ratioOcupacion, colorOcupacion, etiquetaOcupacion } from './ocupacion.ts';
import type { EstadoSesion } from './calendario-estado.ts';

export interface MetricaCard {
  titulo: string;
  valor: string;
  pie: string;
  /** Barra de ocupación bajo la cifra — null si esta tarjeta no la lleva. */
  barra: { pct: number; color: string } | null;
}

// Exportada: lib/calendario-arrastre.ts (y su caller en page.tsx) la
// reutilizan para convertir el nuevo horario arrastrado a "HH:MM" — evita
// duplicar esta conversión ya escrita.
export function mmA(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function faltaTexto(minutos: number): string {
  if (minutos < 60) return `en ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const r = minutos % 60;
  return `en ${h} h${r ? ` ${r}` : ''}`;
}

function tarjetaOcupacion(titulo: string, confirmadas: number, aforo: number, pieExtra: string): MetricaCard {
  const ratio = ratioOcupacion(confirmadas, aforo);
  return {
    titulo, valor: `${Math.round(ratio * 100)}%`,
    pie: `${confirmadas} de ${aforo} plazas · ${etiquetaOcupacion(ratio)}${pieExtra}`,
    barra: { pct: Math.min(100, Math.round(ratio * 100)), color: colorOcupacion(ratio) },
  };
}

export interface SesionMetricaDia {
  estado: EstadoSesion;
  inicioMin: number;
  finMin: number;
  nombre: string;
  lugar: string;
  confirmadas: number;
  aforoMaximo: number;
}

// Solo tiene sentido cuando el día que se mira es HOY — para cualquier otro
// día la vista de Día usa las mismas tres tarjetas que la Semana (no hay un
// "ahora" que contar en un día que no es hoy). El caller decide cuál pintar.
export function metricasDia(sesiones: SesionMetricaDia[], ahoraMin: number): [MetricaCard, MetricaCard, MetricaCard] {
  const noCancel = sesiones.filter(s => s.estado !== 'CANCELADA');
  const enCurso = noCancel.filter(s => s.estado === 'EN_CURSO');
  const siguiente = noCancel
    .filter(s => s.inicioMin > ahoraMin)
    .sort((a, b) => a.inicioMin - b.inicioMin)[0] ?? null;

  const totalPlazas = noCancel.reduce((a, s) => a + s.aforoMaximo, 0);
  const tomadas = noCancel.reduce((a, s) => a + s.confirmadas, 0);

  const ahora: MetricaCard = enCurso.length
    ? {
        titulo: 'Ahora', valor: enCurso.map(s => s.nombre).join(' · '),
        pie: enCurso.map(s => `${s.lugar} · acaba ${mmA(s.finMin)}`).join(' | '),
        barra: null,
      }
    : {
        titulo: 'Ahora', valor: 'Nada en marcha',
        pie: siguiente ? `Próxima a las ${mmA(siguiente.inicioMin)}` : 'Se acabó el día',
        barra: null,
      };

  const despues: MetricaCard = siguiente
    ? {
        titulo: 'Después', valor: `${mmA(siguiente.inicioMin)} · ${siguiente.nombre}`,
        pie: `${siguiente.lugar} · ${faltaTexto(siguiente.inicioMin - ahoraMin)}`, barra: null,
      }
    : { titulo: 'Después', valor: 'Se acabó el día', pie: '', barra: null };

  const ocupacion = tarjetaOcupacion('Ocupación del día', tomadas, totalPlazas, '');

  return [ahora, despues, ocupacion];
}

export interface SesionMetricaAgregada {
  estado: EstadoSesion;
  confirmadas: number;
  aforoMaximo: number;
  /**
   * Inicio de la clase, para saber si su ocupación ya significa algo.
   *
   * Opcional por compatibilidad: sin él, la clase se cuenta como siempre (es
   * decir, se la considera ya juzgable). Los callers de esta página sí lo pasan.
   */
  inicioISO?: string;
}

/**
 * Cuánto antes de empezar tiene sentido llamar «floja» a una clase.
 *
 * Una clase creada hace un minuto para dentro de cuatro días tiene 0 reservas
 * porque acaba de nacer, no porque no interese a nadie: contarla como floja
 * hacía que el calendario regañara por clases que no habían abierto todavía —
 * al programar el trimestre, el contador saltaba a decenas y dejaba de mirarse.
 * Y un contador que nadie mira no avisa el día que sí hay una clase floja.
 *
 * 24 h es el margen en el que todavía se puede hacer algo (un mensaje al grupo,
 * mover la hora); más allá, la ocupación aún no dice nada.
 */
const HORAS_ANTES_PARA_JUZGAR = 24;

function ocupacionYaSignifica(s: SesionMetricaAgregada, ahora: Date): boolean {
  if (!s.inicioISO) return true;
  const inicio = new Date(s.inicioISO).getTime();
  if (Number.isNaN(inicio)) return true;
  return inicio - ahora.getTime() <= HORAS_ANTES_PARA_JUZGAR * 3_600_000;
}

// `esSemanaActual` distingue "esta semana" (la que se vive ahora) de "esa
// semana" (navegando a otra) — I-8: los números hablan de lo que se mira, no
// siempre de hoy. Por defecto `true` para las llamadas que reutilizan estas
// tres tarjetas fuera de la vista de Semana (p.ej. un día que no es hoy).
export function metricasSemana(
  sesiones: SesionMetricaAgregada[],
  esSemanaActual: boolean = true,
  ahora: Date = new Date(),
): [MetricaCard, MetricaCard, MetricaCard] {
  const noCancel = sesiones.filter(s => s.estado !== 'CANCELADA');
  const totalPlazas = noCancel.reduce((a, s) => a + s.aforoMaximo, 0);
  const tomadas = noCancel.reduce((a, s) => a + s.confirmadas, 0);
  const flojas = noCancel.filter(s =>
    ocupacionYaSignifica(s, ahora) && ratioOcupacion(s.confirmadas, s.aforoMaximo) < 0.6,
  ).length;
  const cuando = esSemanaActual ? 'esta semana' : 'esa semana';

  return [
    { titulo: 'Clases', valor: String(noCancel.length), pie: cuando, barra: null },
    tarjetaOcupacion('Ocupación media', tomadas, totalPlazas, ''),
    {
      titulo: 'Por debajo del 60%', valor: String(flojas),
      pie: flojas > 0 ? 'clases que no llenan · revisa su hora' : 'ninguna clase floja', barra: null,
    },
  ];
}
