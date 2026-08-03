'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { queImparten } from '@/lib/equipo';
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

// 'HH:MM' + 1 hora, saturado a '23:00' (no cruza medianoche).
function sumaUnaHora(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(23 * 60, h * 60 + m + 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// 'HH:MM' - 1 hora, saturado a '00:00' (no cruza al día anterior).
function restaUnaHora(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.max(0, h * 60 + m - 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
  const activos = useMemo(() => queImparten(instructores), [instructores]);

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

  // Antes se insertaba SIEMPRE 09:00-10:00 y se pasaba por mergeFranjas: si ya
  // había una franja que cubría o tocaba ese rango (muy común, ej. "09:00-14:00"),
  // la nueva se fusionaba en silencio con la existente y no aparecía ningún
  // campo nuevo — el botón "+ Franja" parecía no hacer nada. Ahora se propone
  // un rango libre después de la última franja del día (o 09:00-10:00 si el
  // día está vacío), y se añade sin pasar por el merge — el merge solo se
  // aplica al guardar, no al insertar. Si el día ya llega hasta las 23:00 (sin
  // hueco después), se prueba antes de la primera franja; si tampoco hay
  // hueco ahí (día completo de 00:00 a 23:00), se avisa en vez de repetir el
  // mismo bug con un 09:00-10:00 que vuelve a solaparse en silencio.
  const addFranja = useCallback((dow: number) => {
    const actuales = draft[dow] ?? [];
    if (actuales.length === 0) {
      setDraft(prev => ({ ...prev, [dow]: [{ horaInicio: '09:00', horaFin: '10:00' }] }));
      setDirty(true);
      return;
    }
    const ultima = [...actuales].sort((a, b) => a.horaFin.localeCompare(b.horaFin)).pop()!;
    if (ultima.horaFin < '23:00') {
      const nueva = { horaInicio: ultima.horaFin, horaFin: sumaUnaHora(ultima.horaFin) };
      setDraft(prev => ({ ...prev, [dow]: [...(prev[dow] ?? []), nueva] }));
      setDirty(true);
      return;
    }
    const primera = [...actuales].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))[0];
    if (primera.horaInicio > '00:00') {
      const nueva = { horaInicio: restaUnaHora(primera.horaInicio), horaFin: primera.horaInicio };
      setDraft(prev => ({ ...prev, [dow]: [...(prev[dow] ?? []), nueva] }));
      setDirty(true);
      return;
    }
    showToast('Este día ya está completo (00:00-23:00) — no hay hueco libre para una franja nueva.');
  }, [draft, showToast]);

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

  const guardar = useCallback(async () => {
    const franjas: Array<{ diaSemana: number; horaInicio: string; horaFin: string }> = [];
    for (const dowStr of Object.keys(draft)) {
      const dow = Number(dowStr);
      for (const f of mergeFranjas(draft[dow])) {
        franjas.push({ diaSemana: dow, horaInicio: f.horaInicio, horaFin: f.horaFin });
      }
    }
    const res = await setDisponibilidadCitas(selected, franjas);
    if (!res.ok) { showToast(res.error); return; }
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
        {/* Decía "en Configuración → Estudio", donde no hay ninguna instructora:
            el equipo se gestiona en su propia pantalla. Un cartel que manda al
            sitio equivocado es peor que no poner cartel. */}
        No hay instructoras activas. Añádelas en{' '}
        <Link href="/equipo" className="font-semibold text-brand-medio hover:underline underline-offset-2">Equipo</Link>
        {' '}y luego vuelve aquí para definir su horario de citas.
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
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selected === i.id ? 'rgba(255,255,255,0.8)' : (i.color ?? '#6E7650') }} />
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
                  className="flex items-center gap-1 text-[12px] font-medium text-brand-medio hover:brightness-90 px-1.5 py-1">
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
