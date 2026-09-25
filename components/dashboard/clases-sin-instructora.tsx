'use client';

import { useMemo, useRef, useState } from 'react';
import { UserX } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { clasesSinInstructora, ETIQUETA_INSTRUCTORA_NO_DISPONIBLE } from '@/lib/equipo/clases-sin-instructora';
import { TZ_ESTUDIO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// RES-8. Clases futuras de una instructora dada de baja. Nada las cancela solo:
// hay alumnas apuntadas a algo que nadie va a dar, y decide el estudio, por
// clase o por serie (se marcan las que valgan): pasarlas a otra instructora,
// dejarlas sin instructora (siguen en pie) o cancelarlas. Cancelar avisa a las
// alumnas y devuelve el bono según la política del estudio, con el mismo
// circuito que cancelar una serie.
//
// Solo se monta con `puedeGestionarCalendario`. Se oculta sola si no hay nada.

const fmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO,
});
const cuando = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : fmt.format(d); };

export function ClasesSinInstructora({ onToast }: { onToast: (m: string) => void }) {
  const { sesiones, reservas, instructores, tiposClase, cancelarSesionesConAviso, asignarInstructoraASesiones } = useStudio();
  const grupos = useMemo(
    () => clasesSinInstructora(sesiones, instructores, new Date()),
    [sesiones, instructores],
  );
  // Las que se DESmarcan (por defecto entran todas: lo habitual es decidir por la baja entera).
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [confirmaCancelar, setConfirmaCancelar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const enviandoRef = useRef(false);

  const apuntadas = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA') m.set(r.sesionId, (m.get(r.sesionId) ?? 0) + 1);
    }
    return m;
  }, [reservas]);

  if (grupos.length === 0) return null;
  const candidatas = instructores.filter(i => i.activo);

  async function ejecutar(instructorId: string, accion: 'pasar' | 'sin' | 'cancelar') {
    if (enviandoRef.current) return;
    const g = grupos.find(x => x.instructorId === instructorId);
    if (!g) return;
    const elegidas = g.sesiones.filter(s => !fuera.has(s.id));
    if (elegidas.length === 0) return;
    if (accion === 'pasar' && !destino[instructorId]) return;
    enviandoRef.current = true;
    setEnviando(instructorId + accion);
    setAviso(({ [instructorId]: _v, ...resto }) => resto);
    try {
      const ids = elegidas.map(s => s.id);
      if (accion === 'cancelar') {
        const res = await cancelarSesionesConAviso(sesiones.filter(s => ids.includes(s.id)));
        if (!res.ok) { setAviso(p => ({ ...p, [instructorId]: res.error ?? 'No se han podido cancelar.' })); return; }
        onToast(`${ids.length} clase${ids.length === 1 ? '' : 's'} cancelada${ids.length === 1 ? '' : 's'}`);
      } else {
        const res = await asignarInstructoraASesiones(ids, accion === 'pasar' ? destino[instructorId] : null);
        if (!res.ok) { setAviso(p => ({ ...p, [instructorId]: res.error ?? 'No se ha podido guardar.' })); return; }
        onToast(accion === 'pasar'
          ? `${ids.length} clase${ids.length === 1 ? '' : 's'} pasada${ids.length === 1 ? '' : 's'} a otra instructora`
          : `${ids.length} clase${ids.length === 1 ? '' : 's'} sin instructora`);
      }
      setConfirmaCancelar(null);
      invalidarEstadoEstudio();
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  }

  return (
    <div id={ANCLA_DECIDIR.clasesSinInstructora} tabIndex={-1} data-testid="clases-sin-instructora"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <UserX className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">Clases de una instructora dada de baja</p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {ETIQUETA_INSTRUCTORA_NO_DISPONIBLE}. Ninguna se cancela sola ni se toca la reserva de nadie: decide qué hacer con las que marques.
      </p>
      <ul className="flex flex-col gap-3">
        {grupos.map((g) => {
          const elegidas = g.sesiones.filter(s => !fuera.has(s.id));
          const nAlumnas = elegidas.reduce((n, s) => n + (apuntadas.get(s.id) ?? 0), 0);
          const ocupado = enviando !== null;
          return (
            <li key={g.instructorId} data-testid="grupo-clases-sin-instructora" className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[13px] text-foreground">
                {g.nombre} · {g.sesiones.length} clase{g.sesiones.length === 1 ? '' : 's'}
              </p>
              <ul className="my-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {g.sesiones.map((s) => {
                  const tipo = tiposClase.find(t => t.id === sesiones.find(x => x.id === s.id)?.tipoClaseId)?.nombre ?? 'Clase';
                  const n = apuntadas.get(s.id) ?? 0;
                  return (
                    <li key={s.id}>
                      <label className="flex items-center gap-2 text-[12px] text-foreground">
                        <input type="checkbox" checked={!fuera.has(s.id)}
                          onChange={(e) => setFuera(prev => { const x = new Set(prev); if (e.target.checked) x.delete(s.id); else x.add(s.id); return x; })} />
                        <span className="truncate">{cuando(s.inicio)} · {tipo}{s.serieId ? ' · se repite' : ''}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">{n === 0 ? 'sin alumnas' : `${n} alumna${n === 1 ? '' : 's'}`}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <select aria-label={`Instructora que se queda con las clases de ${g.nombre}`}
                  value={destino[g.instructorId] ?? ''} onChange={(e) => setDestino(p => ({ ...p, [g.instructorId]: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-[12px]">
                  <option value="">Elegir instructora…</option>
                  {candidatas.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                <Button size="sm" disabled={ocupado || elegidas.length === 0 || !destino[g.instructorId]}
                  onClick={() => void ejecutar(g.instructorId, 'pasar')}>
                  {enviando === g.instructorId + 'pasar' ? 'Guardando…' : 'Pasar a ella'}
                </Button>
                <Button size="sm" variant="outline" disabled={ocupado || elegidas.length === 0}
                  onClick={() => void ejecutar(g.instructorId, 'sin')}>
                  {enviando === g.instructorId + 'sin' ? 'Guardando…' : 'Mantener sin instructora'}
                </Button>
                {confirmaCancelar === g.instructorId ? (
                  <Button size="sm" variant="destructive" disabled={ocupado || elegidas.length === 0}
                    onClick={() => void ejecutar(g.instructorId, 'cancelar')}>
                    {enviando === g.instructorId + 'cancelar' ? 'Cancelando…' : `Sí, cancelar ${elegidas.length} y avisar${nAlumnas > 0 ? ` a ${nAlumnas}` : ''}`}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={ocupado || elegidas.length === 0}
                    onClick={() => setConfirmaCancelar(g.instructorId)}>
                    Cancelar clases…
                  </Button>
                )}
              </div>
              {aviso[g.instructorId] && <p role="alert" className="mt-1 text-[12px] text-destructive">{aviso[g.instructorId]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
