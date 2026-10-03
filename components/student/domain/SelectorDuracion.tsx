'use client';

import { DURACIONES_POR_DEFECTO, etiquetaDuracion, vigenciaHastaDeDuracion } from '@/lib/clases-fijas-reglas';
import { fechaDMY } from '@/lib/series-renovacion';
import { hoyEnEstudio } from '@/lib/utils';
import { TEXTOS_PLAZA_FIJA as TPF } from '@/lib/student/plaza-fija-textos';

// «¿Cuánto tiempo la quieres?»: una duración cerrada (la fecha de fin la pone el servidor) o «Sin fin», con la fecha exacta a
// la vista. Lo usan la ficha de la clase fija y la hoja de «Auto reservable»: un solo sitio para las pastillas y su texto.
// Con `opciones` son las duraciones de una clase fija CON NOMBRE (las que eligió el estudio, cada una con la fecha que calculó el
// servidor) y no hay «Sin fin»: la oferta no lo ofrece.
export function SelectorDuracion({ meses, onChange, opciones }: {
  meses: number | null; onChange: (m: number | null) => void;
  opciones?: { meses: number; etiqueta: string; hasta: string }[];
}) {
  if (opciones) {
    const elegida = opciones.find((o) => o.meses === meses) ?? null;
    return (
      <div data-testid="duracion-clase-fija" role="group" aria-label={TPF.cuantoTiempo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p className="t-label" style={{ margin: 0 }}>{TPF.cuantoTiempo}</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {opciones.map((o) => (
            <button key={o.meses} type="button" className="pill" aria-pressed={meses === o.meses} onClick={() => onChange(o.meses)}>{o.etiqueta}</button>
          ))}
        </div>
        <p className="t-meta" data-testid="clase-fija-hasta" style={{ margin: 0, minHeight: '1.3em' }}>
          {elegida ? TPF.hastaEl(fechaDMY(elegida.hasta)) : ''}
        </p>
      </div>
    );
  }
  return (
    <div data-testid="duracion-clase-fija" role="group" aria-label={TPF.cuantoTiempo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="t-label" style={{ margin: 0 }}>{TPF.cuantoTiempo}</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {DURACIONES_POR_DEFECTO.map((m) => (
          <button key={m} type="button" className="pill" aria-pressed={meses === m} onClick={() => onChange(m)}>
            {etiquetaDuracion(m)}
          </button>
        ))}
        <button type="button" className="pill" aria-pressed={meses === null} onClick={() => onChange(null)}>{TPF.sinFecha}</button>
      </div>
      <p className="t-meta" data-testid="clase-fija-hasta" style={{ margin: 0, minHeight: '1.3em' }}>
        {meses !== null ? TPF.hastaEl(fechaDMY(vigenciaHastaDeDuracion(hoyEnEstudio(), meses))) : TPF.sinFechaDetalle}
      </p>
    </div>
  );
}
