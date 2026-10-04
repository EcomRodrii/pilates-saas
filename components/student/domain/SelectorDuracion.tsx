'use client';

import { DURACIONES_POR_DEFECTO, etiquetaDuracion, vigenciaHastaDeDuracion } from '@/lib/clases-fijas-reglas';
import { fechaDMY } from '@/lib/series-renovacion';
import { hoyEnEstudio } from '@/lib/utils';
import { TEXTOS_PLAZA_FIJA as TPF } from '@/lib/student/plaza-fija-textos';

// «¿Cuánto tiempo la quieres?»: una duración cerrada (la fecha de fin la pone el servidor) o «Sin fin», con la fecha exacta a
// la vista. Lo usa la hoja del interruptor «Clase fija».
export function SelectorDuracion({ meses, onChange }: { meses: number | null; onChange: (m: number | null) => void }) {
  return (
    <div data-testid="duracion-clase-fija" role="group" aria-label={TPF.cuantoTiempo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="t-label" style={{ margin: 0 }}>{TPF.cuantoTiempo}</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {/* «Sin fin» primero: es lo de serie (dura lo que dure su cuota). */}
        <button type="button" className="pill" aria-pressed={meses === null} onClick={() => onChange(null)}>{TPF.sinFecha}</button>
        {DURACIONES_POR_DEFECTO.map((m) => (
          <button key={m} type="button" className="pill" aria-pressed={meses === m} onClick={() => onChange(m)}>
            {etiquetaDuracion(m)}
          </button>
        ))}
      </div>
      <p className="t-meta" data-testid="clase-fija-hasta" style={{ margin: 0, minHeight: '1.3em' }}>
        {meses !== null ? TPF.hastaEl(fechaDMY(vigenciaHastaDeDuracion(hoyEnEstudio(), meses))) : TPF.sinFechaDetalle}
      </p>
    </div>
  );
}
