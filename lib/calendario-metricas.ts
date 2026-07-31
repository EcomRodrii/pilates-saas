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

function mmA(minutos: number): string {
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
}

export function metricasSemana(sesiones: SesionMetricaAgregada[]): [MetricaCard, MetricaCard, MetricaCard] {
  const noCancel = sesiones.filter(s => s.estado !== 'CANCELADA');
  const totalPlazas = noCancel.reduce((a, s) => a + s.aforoMaximo, 0);
  const tomadas = noCancel.reduce((a, s) => a + s.confirmadas, 0);
  const flojas = noCancel.filter(s => ratioOcupacion(s.confirmadas, s.aforoMaximo) < 0.6).length;

  return [
    { titulo: 'Clases', valor: String(noCancel.length), pie: 'esta semana', barra: null },
    tarjetaOcupacion('Ocupación media', tomadas, totalPlazas, ''),
    {
      titulo: 'Por debajo del 60%', valor: String(flojas),
      pie: flojas > 0 ? 'clases que no llenan · revisa su hora' : 'ninguna clase floja', barra: null,
    },
  ];
}
