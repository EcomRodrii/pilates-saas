'use client';

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { TARJETAS_REGLAS, queCambiaElTipo, type ReglasReserva, type TipoConReglas } from '@/lib/configuracion/reglas-reserva';
import { claseDeEjemplo, instante, lineaDeTiempoReserva, reglasEfectivasDeTipo } from '@/lib/configuracion/linea-de-tiempo-reserva';

type SesionMin = { inicio: string; cancelada: boolean; tipoClaseId: string };

/**
 * «Así lo vive tu alumna»: las reglas guardadas, contadas sobre la próxima clase
 * de verdad (o una de ejemplo), en el orden en que le pasan las cosas. Con un
 * selector por tipo de clase: la forma de ver qué cambia cada uno sin abrirlo.
 * La cuenta la hace `lineaDeTiempoReserva` (lib/configuracion/linea-de-tiempo-reserva.ts).
 */
export function AsiLoViveTuAlumna({ reglas, tipos, sesiones }: {
  /** `null` mientras carga: no se cuenta nada con valores de fábrica. */
  reglas: ReglasReserva | null;
  tipos: readonly TipoConReglas[];
  sesiones: readonly SesionMin[];
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  // El instante se fija al montar: calcularlo en cada render movería la clase de
  // ejemplo mientras se mira.
  const [ahora] = useState(() => new Date());

  const propias = useMemo(() => (reglas
    ? tipos
      .map(t => ({ t, cambios: TARJETAS_REGLAS.map(id => queCambiaElTipo(id, t, reglas)).filter((c): c is string => !!c) }))
      .filter(x => x.cambios.length > 0)
    : []), [reglas, tipos]);

  if (!reglas) {
    return <div aria-hidden className={cn(cardCls, 'h-56 animate-pulse bg-muted/40')} />;
  }

  const conPropias = new Set(propias.map(p => p.t.id));
  const tipo = elegido ? tipos.find(t => t.id === elegido) ?? null : null;
  const efectivas = reglasEfectivasDeTipo(reglas, tipo);
  const nombreDe = (id: string) => tipos.find(t => t.id === id)?.nombre ?? null;
  // «Todo el estudio» se cuenta sobre una clase que siga SUS reglas: una de un
  // tipo con reglas propias contaría otra cosa.
  const clase = claseDeEjemplo(sesiones, nombreDe, ahora, id => (elegido ? id === elegido : !conPropias.has(id)));
  const pasos = lineaDeTiempoReserva(efectivas, clase.inicio);

  return (
    <section aria-labelledby="asi-lo-vive" className={cn(cardCls, 'max-w-2xl overflow-hidden')}>
      <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h3 id="asi-lo-vive" className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Así lo vive tu alumna</h3>
          <p className="text-[16px] font-semibold text-foreground">
            {clase.deEjemplo ? `Una clase de ejemplo · ${instante(clase.inicio)}` : `${clase.nombre ?? 'Tu clase'} · ${instante(clase.inicio)}`}
          </p>
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            {clase.deEjemplo
              ? 'No hay ninguna clase así en tu horario: lo contamos sobre una de ejemplo, con tus reglas guardadas.'
              : tipo ? 'Tu próxima clase de este tipo, con sus reglas guardadas.' : 'Tu próxima clase que sigue las reglas del estudio.'}
          </p>
        </div>
        {tipos.length > 0 && (
          <div role="group" aria-label="Ver las reglas de" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip activo={elegido === null} onClick={() => setElegido(null)}>Todo el estudio</Chip>
            {tipos.map(t => (
              <Chip key={t.id} activo={elegido === t.id} onClick={() => setElegido(t.id)}>
                {t.nombre}{conPropias.has(t.id) ? ' · reglas propias' : ''}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <ol className="grid px-4 py-3 sm:grid-cols-2 sm:px-5">
        {pasos.map((p, i) => (
          <li key={p.id} className="flex gap-3 py-2.5 pr-3">
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-foreground',
                p.tono === 'bien' ? 'bg-success/20' : p.tono === 'aviso' ? 'bg-warning/25' : 'bg-muted',
              )}
            >{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-muted-foreground">{p.cuando}</span>
              <span className="block text-[14px] font-semibold text-foreground">{p.que}</span>
              <span className="block text-[12.5px] text-muted-foreground text-pretty">{p.detalle}</span>
            </span>
          </li>
        ))}
      </ol>

      {elegido === null && propias.length > 0 && (
        <p className="flex items-start gap-2 border-t border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground sm:px-5">
          <Layers size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span className="text-pretty">
            <strong className="font-semibold text-foreground">
              {propias.length === 1 ? '1 tipo de clase tiene' : `${propias.length} tipos de clase tienen`} reglas propias:
            </strong>{' '}
            {propias.slice(0, 3).map(p => `${p.t.nombre} (${p.cambios.join('; ')})`).join(', ')}
            {propias.length > 3 ? ` y ${propias.length - 3} más` : ''}. Elígelo arriba para verlo.
          </span>
        </p>
      )}
    </section>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        activo ? 'border-transparent bg-brand text-brand-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
