'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { useStudio } from '@/lib/studio-context';
import { DIAS } from '@/lib/sustituciones/franjas';
import type { DisponibilidadCita } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Plus, X, Clock, Copy } from 'lucide-react';

type Franja = { horaInicio: string; horaFin: string };
type Draft = Record<number, Franja[]>;

// Une franjas que se solapan o son contiguas, ordenadas por hora de inicio.
function mergeFranjas(list: Franja[]): Franja[] {
  const orden = [...list].filter(f => f.horaFin > f.horaInicio).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const out: Franja[] = [];
  for (const f of orden) {
    const last = out[out.length - 1];
    if (last && f.horaInicio <= last.horaFin) {
      if (f.horaFin > last.horaFin) last.horaFin = f.horaFin;
    } else {
      out.push({ ...f });
    }
  }
  return out;
}

function draftFromDisponibilidad(disp: DisponibilidadCita[], instructorId: string): Draft {
  const byDow: Draft = {};
  for (const d of disp) {
    if (d.instructorId !== instructorId) continue;
    (byDow[d.diaSemana] ??= []).push({ horaInicio: d.horaInicio, horaFin: d.horaFin });
  }
  for (const k of Object.keys(byDow)) byDow[+k] = mergeFranjas(byDow[+k]);
  return byDow;
}

function totalHoras(draft: Draft): number {
  let mins = 0;
  for (const dow of Object.keys(draft)) {
    for (const f of draft[+dow]) {
      const [h1, m1] = f.horaInicio.split(':').map(Number);
      const [h2, m2] = f.horaFin.split(':').map(Number);
      mins += (h2 * 60 + m2) - (h1 * 60 + m1);
    }
  }
  return Math.round((mins / 60) * 10) / 10;
}

export function TabHorarioCitas({ showToast }: { showToast: (m: string) => void }) {
  const { instructores, citasDisponibilidad, setDisponibilidadCitas } = useStudio();
  const activos = useMemo(() => instructores.filter(i => i.activo), [instructores]);

  const [selected, setSelected] = useState<string>(activos[0]?.id ?? '');
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Si aún no hay instructora elegida pero ya cargaron, elige la primera.
  useEffect(() => {
    if (!selected && activos.length > 0) setSelected(activos[0].id);
  }, [activos, selected]);

  // Carga el borrador desde la BD al cambiar de instructora (no pisa ediciones:
  // solo recarga cuando cambia la instructora seleccionada).
  useEffect(() => {
    if (!selected || loadedFor.current === selected) return;
    setDraft(draftFromDisponibilidad(citasDisponibilidad, selected));
    setDirty(false);
    loadedFor.current = selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const addFranja = useCallback((dow: number) => {
    setDraft(prev => ({ ...prev, [dow]: mergeFranjas([...(prev[dow] ?? []), { horaInicio: '09:00', horaFin: '10:00' }]) }));
    setDirty(true);
  }, []);

  const updateFranja = useCallback((dow: number, idx: number, campo: 'horaInicio' | 'horaFin', valor: string) => {
    setDraft(prev => {
      const lista = [...(prev[dow] ?? [])];
      lista[idx] = { ...lista[idx], [campo]: valor };
      return { ...prev, [dow]: lista };
    });
    setDirty(true);
  }, []);

  const removeFranja = useCallback((dow: number, idx: number) => {
    setDraft(prev => ({ ...prev, [dow]: (prev[dow] ?? []).filter((_, i) => i !== idx) }));
    setDirty(true);
  }, []);

  // Copia las franjas del lunes a los días laborables (M–V).
  const copiarLunes = useCallback(() => {
    setDraft(prev => {
      const lun = prev[1] ?? [];
      const next = { ...prev };
      for (const dow of [2, 3, 4, 5]) next[dow] = lun.map(f => ({ ...f }));
      return next;
    });
    setDirty(true);
  }, []);

  const guardar = useCallback(() => {
    const franjas: Array<{ diaSemana: number; horaInicio: string; horaFin: string }> = [];
    for (const dowStr of Object.keys(draft)) {
      const dow = Number(dowStr);
      for (const f of mergeFranjas(draft[dow])) {
        franjas.push({ diaSemana: dow, horaInicio: f.horaInicio, horaFin: f.horaFin });
      }
    }
    setDisponibilidadCitas(selected, franjas);
    setDraft(prev => {
      const norm: Draft = {};
      for (const dowStr of Object.keys(prev)) { const d = Number(dowStr); const m = mergeFranjas(prev[d]); if (m.length) norm[d] = m; }
      return norm;
    });
    setDirty(false);
    showToast('Horario guardado');
  }, [draft, selected, setDisponibilidadCitas, showToast]);

  if (activos.length === 0) {
    return (
      <div className={cn(cardCls, 'px-5 py-10 text-center text-[13px] text-muted-foreground max-w-4xl')}>
        No hay instructoras activas. Añade instructoras en Configuración → Estudio para definir su horario de citas.
      </div>
    );
  }

  const horas = totalHoras(draft);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-[13px] text-muted-foreground">
        Define las franjas en las que cada instructora acepta citas. Los huecos reservables se calculan sobre estas franjas (restando clases y citas ya ocupadas).
      </p>

      {/* Selector de instructora */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activos.map(i => (
          <button
            key={i.id}
            onClick={() => setSelected(i.id)}
            className={cn(
              'shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border',
              selected === i.id ? 'bg-brand text-brand-foreground border-brand' : 'bg-card text-muted-foreground border-border hover:text-foreground',
            )}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selected === i.id ? 'rgba(255,255,255,0.8)' : (i.color ?? '#8B5CF6') }} />
            {i.nombre}
          </button>
        ))}
      </div>

      {/* Rejilla por día */}
      <div className={cn(cardCls, 'divide-y divide-background')}>
        {DIAS.map(dia => {
          const franjas = draft[dia.dow] ?? [];
          return (
            <div key={dia.dow} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-24 shrink-0 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">{dia.label}</span>
              </div>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                {franjas.length === 0 && (
                  <span className="text-[12px] text-muted-foreground italic">Sin disponibilidad</span>
                )}
                {franjas.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
                    <input type="time" value={f.horaInicio}
                      onChange={e => updateFranja(dia.dow, idx, 'horaInicio', e.target.value)}
                      className="bg-transparent text-[12px] text-foreground focus:outline-none w-[62px]" />
                    <span className="text-muted-foreground text-[12px]">–</span>
                    <input type="time" value={f.horaFin}
                      onChange={e => updateFranja(dia.dow, idx, 'horaFin', e.target.value)}
                      className={cn('bg-transparent text-[12px] focus:outline-none w-[62px]', f.horaFin > f.horaInicio ? 'text-foreground' : 'text-destructive')} />
                    <button onClick={() => removeFranja(dia.dow, idx)} className="ml-0.5 text-muted-foreground hover:text-destructive" aria-label="Quitar franja">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addFranja(dia.dow)}
                  className="flex items-center gap-1 text-[12px] font-medium text-brand hover:brightness-90 px-1.5 py-1">
                  <Plus size={13} />Franja
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className={cn(btnSecondary, 'flex items-center gap-1.5')} onClick={copiarLunes}>
            <Copy size={13} />Copiar lunes a L–V
          </button>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Clock size={13} />{horas} h/semana
          </span>
        </div>
        <button className={btnPrimary} onClick={guardar} disabled={!dirty}>
          Guardar horario
        </button>
      </div>
    </div>
  );
}
