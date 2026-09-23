'use client';

// El mes de la plaza fija de una clienta, en su ficha: qué días tiene sitio de
// verdad. La lógica es la misma que ve la alumna en su app
// (`lib/plazas-fijas-calendario.ts`); aquí además hay historial —el panel carga
// todas las clases—, así que se ve si vino, si no vino o si canceló.
//
// «Sin reservar» va en ámbar a propósito: es un día de su horario, con clase, en
// el que el motor NO le ha reservado sitio (sin cuota, clase llena, otra clase a
// esa hora). Para el estudio es un aviso, no un detalle.

import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Pause, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { horaEstudio, hoyEnEstudio } from '@/lib/utils';
import {
  INICIALES_SEMANA, marcasDelMes, nombreMes, semanasDelMes, sumarMeses, ultimoMesConClases,
  type DiaFijo, type MarcaDiaFijo, type PlazaCalendario,
} from '@/lib/plazas-fijas-calendario';
import type { PlazaFija } from '@/lib/types';

const NOMBRE: Record<MarcaDiaFijo, string> = {
  RESERVADA: 'Reservada', ASISTIDA: 'Vino', NO_ASISTIO: 'No vino', NO_VA: 'Canceló', PAUSA: 'En pausa', SIN_RESERVA: 'Sin reservar',
};
const ORDEN_LEYENDA: MarcaDiaFijo[] = ['RESERVADA', 'ASISTIDA', 'NO_ASISTIO', 'NO_VA', 'PAUSA', 'SIN_RESERVA'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const ESTILO: Record<MarcaDiaFijo, React.CSSProperties> = {
  RESERVADA: { backgroundColor: 'color-mix(in srgb, var(--primary) 14%, var(--card))', color: 'var(--primary)' },
  ASISTIDA: { backgroundColor: 'color-mix(in srgb, var(--success) 16%, var(--card))', color: 'var(--success)' },
  NO_ASISTIO: { backgroundColor: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' },
  NO_VA: { border: '1.5px solid var(--border)', color: 'var(--muted-foreground)' },
  PAUSA: { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' },
  SIN_RESERVA: { border: '1.5px dashed var(--warning)', color: 'var(--warning)' },
};

function Marca({ marca, tamano = 22 }: { marca: MarcaDiaFijo; tamano?: number }) {
  const icono = Math.round(tamano * 0.6);
  return (
    <span
      aria-hidden data-marca={marca}
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: tamano, height: tamano, ...ESTILO[marca] }}
    >
      {(marca === 'RESERVADA' || marca === 'ASISTIDA') && <Check size={icono} strokeWidth={2.6} />}
      {marca === 'NO_ASISTIO' && <X size={icono} strokeWidth={2.6} />}
      {marca === 'NO_VA' && <Minus size={icono} strokeWidth={2.6} />}
      {marca === 'PAUSA' && <Pause size={icono} strokeWidth={2.6} />}
    </span>
  );
}

function etiquetaDia(fecha: string, dia: DiaFijo[]): string {
  const col = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
  const mes = nombreMes(fecha.slice(0, 7)).split(' de ')[0];
  return `${DIAS_LARGOS[col]} ${Number(fecha.slice(8))} de ${mes}: ${dia.map(x => `${x.hora}, ${NOMBRE[x.marca].toLowerCase()}`).join('; ')}`;
}

export function CalendarioPlazaFija({ socioId, plazas, hoy }: { socioId: string; plazas: PlazaFija[]; hoy: string }) {
  const { sesiones, reservas } = useStudio();

  const datos = useMemo(() => {
    const suyas: PlazaCalendario[] = plazas.map(p => ({
      diaSemana: p.diaSemana, hora: p.horaInicio, salaId: p.salaId, tipoClaseId: p.tipoClaseId ?? null, estado: p.estado,
      vigenciaDesde: p.vigenciaDesde, vigenciaHasta: p.vigenciaHasta ?? null, pausaDesde: p.pausaDesde ?? null, pausaHasta: p.pausaHasta ?? null,
    }));
    // Solo las clases que caen en su horario: el panel tiene TODAS las del estudio.
    const enSuHorario = sesiones
      .filter(s => suyas.some(p => p.salaId === s.salaId))
      .map(s => ({ id: s.id, fecha: hoyEnEstudio(new Date(s.inicio)), hora: horaEstudio(s.inicio), salaId: s.salaId, tipoClaseId: s.tipoClaseId, cancelada: s.cancelada }))
      .filter(s => suyas.some(p => p.hora.slice(0, 5) === s.hora && p.diaSemana === new Date(`${s.fecha}T12:00:00Z`).getUTCDay()));
    const ids = new Set(enSuHorario.map(s => s.id));
    const suyasReservas = reservas.filter(r => r.socioId === socioId && ids.has(r.sesionId)).map(r => ({ sesionId: r.sesionId, estado: r.estado }));
    return { plazas: suyas, sesiones: enSuHorario, reservas: suyasReservas };
  }, [plazas, sesiones, reservas, socioId]);

  const primero = useMemo(
    () => datos.plazas.reduce((min, p) => (p.vigenciaDesde < min ? p.vigenciaDesde : min), hoy).slice(0, 7),
    [datos.plazas, hoy],
  );
  const ultimo = useMemo(() => {
    const u = ultimoMesConClases(datos.plazas, datos.sesiones, hoy);
    return u < hoy.slice(0, 7) ? hoy.slice(0, 7) : u;
  }, [datos, hoy]);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const mesReal = mes < primero ? primero : mes > ultimo ? ultimo : mes;

  const marcas = useMemo(() => marcasDelMes(mesReal, datos.plazas, datos.sesiones, datos.reservas, hoy), [mesReal, datos, hoy]);
  const presentes = new Set([...marcas.values()].flat().map(x => x.marca));
  const titulo = nombreMes(mesReal);

  return (
    <div data-testid="calendario-plaza-fija" className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-foreground">Sus días</p>
        <div className="flex items-center gap-1">
          <button
            type="button" aria-label="Mes anterior" disabled={mesReal <= primero} onClick={() => setMes(sumarMeses(mesReal, -1))}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft size={16} />
          </button>
          <p aria-live="polite" className="text-xs font-semibold text-foreground min-w-[112px] text-center">
            {titulo.charAt(0).toUpperCase() + titulo.slice(1)}
          </p>
          <button
            type="button" aria-label="Mes siguiente" disabled={mesReal >= ultimo} onClick={() => setMes(sumarMeses(mesReal, 1))}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{`Plaza fija: ${titulo}`}</caption>
        <thead>
          <tr>
            {INICIALES_SEMANA.map((l, i) => (
              <th key={l} scope="col" abbr={DIAS_LARGOS[i]} className="pb-1.5 text-[11px] font-semibold text-muted-foreground">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDelMes(mesReal).map((semana, i) => (
            <tr key={i}>
              {semana.map((fecha, j) => {
                if (!fecha) return <td key={j} />;
                const dia = marcas.get(fecha);
                const esHoy = fecha === hoy;
                return (
                  <td
                    key={j} data-fecha={fecha} aria-current={esHoy ? 'date' : undefined}
                    aria-label={dia ? etiquetaDia(fecha, dia) : undefined} title={dia ? etiquetaDia(fecha, dia) : undefined}
                    className="p-0 align-top text-center"
                  >
                    <div className="flex flex-col items-center gap-1 py-1 min-h-[46px]">
                      <span className={`text-xs leading-none ${esHoy ? 'font-bold text-foreground underline underline-offset-2' : fecha < hoy ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {Number(fecha.slice(8))}
                      </span>
                      {dia && (
                        <span className="flex gap-0.5">
                          {dia.slice(0, 2).map(x => <Marca key={x.hora} marca={x.marca} tamano={dia.length > 1 ? 16 : 22} />)}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {presentes.size > 0 && (
        <ul aria-label="Leyenda" className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2">
          {ORDEN_LEYENDA.filter(m => presentes.has(m)).map(m => (
            <li key={m} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Marca marca={m} tamano={14} />{NOMBRE[m]}
            </li>
          ))}
        </ul>
      )}
      {presentes.has('SIN_RESERVA') && (
        <p role="status" className="text-[11px] font-medium text-warning mt-2">
          Hay días de su horario sin reservar: la clase puede estar llena, o su cuota no la cubre.
        </p>
      )}
    </div>
  );
}
