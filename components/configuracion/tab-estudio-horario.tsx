'use client';

import { useState } from 'react';
import { CalendarOff, Copy, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { Toggle, cardCls, btnPrimary, btnSecondary } from '@/app/(dashboard)/configuracion/page';
import type { DiaHorario } from '@/lib/types';

// El calendario decía "Cerrado" en cualquier día sin clases, aunque el
// estudio SÍ trabajara ese día — porque hasta ahora no había ningún dato de
// horario real por día que cruzar (ver lib/calendario-columnas.ts, campo
// `cerrado`). Esta pantalla es ese dato que faltaba.
//
// Convención local de esta UI: 0=lunes..6=domingo (igual que vista-semana.tsx
// y lib/calendario-columnas.ts). `DiaHorario.diaSemana` de la BD usa
// EXTRACT(DOW), 0=domingo..6=sábado — la conversión vive solo aquí, en los
// bordes de entrada/salida del componente.
const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const LUNES_A_VIERNES = [0, 1, 2, 3, 4];
const FIN_DE_SEMANA = [5, 6];

const diaSemanaALocal = (d: number) => (d + 6) % 7;
const localADiaSemana = (l: number) => (l + 1) % 7;

interface FilaHorario {
  abierto: boolean;
  horaApertura: string; // 'HH:MM', para <input type="time">
  horaCierre: string;
}

const FILA_DEFAULT: FilaHorario = { abierto: true, horaApertura: '08:00', horaCierre: '22:00' };

function aHHMM(t: string | null): string {
  return t ? t.slice(0, 5) : FILA_DEFAULT.horaApertura;
}

function horarioAForm(horario: DiaHorario[] | undefined): FilaHorario[] {
  const porLocal = new Map(horario?.map(h => [diaSemanaALocal(h.diaSemana), h]));
  return Array.from({ length: 7 }, (_, local) => {
    const h = porLocal.get(local);
    if (!h) return { ...FILA_DEFAULT };
    return h.abierto
      ? { abierto: true, horaApertura: aHHMM(h.horaApertura), horaCierre: aHHMM(h.horaCierre) }
      : { abierto: false, horaApertura: FILA_DEFAULT.horaApertura, horaCierre: FILA_DEFAULT.horaCierre };
  });
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Barra 24h con la franja abierta pintada — de un vistazo se ve la semana
// entera como 7 barras apiladas, en vez de leer 14 horas sueltas.
function BarraDia({ fila }: { fila: FilaHorario }) {
  if (!fila.abierto) {
    return <div className="h-2 w-full rounded-full bg-muted" />;
  }
  const ini = minutos(fila.horaApertura);
  const fin = minutos(fila.horaCierre);
  const left = Math.max(0, Math.min(100, (ini / 1440) * 100));
  const width = Math.max(0, Math.min(100 - left, ((fin - ini) / 1440) * 100));
  return (
    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="absolute inset-y-0 rounded-full"
        style={{ left: `${left}%`, width: `${width}%`, background: 'var(--brand-medio)' }}
      />
    </div>
  );
}

export function TabEstudioHorario({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateHorarioEstudio } = useStudio();
  const [filas, setFilas] = useState<FilaHorario[]>(() => horarioAForm(studio?.horarioSemana));
  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setFilas(horarioAForm(studio?.horarioSemana));
  }
  const [guardando, setGuardando] = useState(false);

  function actualizarFila(local: number, cambios: Partial<FilaHorario>) {
    setFilas(prev => prev.map((f, i) => (i === local ? { ...f, ...cambios } : f)));
  }

  function copiarATodos(local: number) {
    const origen = filas[local];
    setFilas(prev => prev.map(() => ({ ...origen })));
    showToast(`${NOMBRES_DIA[local]} copiado a los 7 días`);
  }

  function igualarGrupo(dias: number[], etiqueta: string) {
    const [primero, ...resto] = dias;
    const origen = filas[primero];
    setFilas(prev => prev.map((f, i) => (resto.includes(i) ? { ...origen } : f)));
    showToast(`${etiqueta}: mismo horario aplicado`);
  }

  function presetEstandar() {
    setFilas(Array.from({ length: 7 }, () => ({ ...FILA_DEFAULT })));
    showToast('Horario estándar aplicado — recuerda guardar');
  }

  async function guardar() {
    const invalida = filas.find(f => f.abierto && minutos(f.horaApertura) >= minutos(f.horaCierre));
    if (invalida) { showToast('La hora de cierre tiene que ser posterior a la de apertura.'); return; }
    setGuardando(true);
    const dias: DiaHorario[] = filas.map((f, local) => ({
      diaSemana: localADiaSemana(local),
      abierto: f.abierto,
      horaApertura: f.abierto ? `${f.horaApertura}:00` : null,
      horaCierre: f.abierto ? `${f.horaCierre}:00` : null,
    }));
    const res = await updateHorarioEstudio(dias);
    setGuardando(false);
    showToast(res.ok ? 'Horario guardado' : res.error);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-[14px] font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={14} className="text-brand-medio" />
            Horario del estudio
          </h3>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4">
          El calendario usa esto para saber si un día sin clases está{' '}
          <span className="font-medium text-foreground">cerrado</span> o simplemente{' '}
          <span className="font-medium text-foreground">libre</span>. Vale todo el año, los 12 meses.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          <button type="button" onClick={presetEstandar} className={btnSecondary}>
            Horario estándar (08:00–22:00)
          </button>
          <button type="button" onClick={() => igualarGrupo(LUNES_A_VIERNES, 'Lunes a viernes')} className={btnSecondary}>
            Lunes a viernes igual
          </button>
          <button type="button" onClick={() => igualarGrupo(FIN_DE_SEMANA, 'Fin de semana')} className={btnSecondary}>
            Fin de semana igual
          </button>
        </div>

        <div className="space-y-1.5">
          {filas.map((fila, local) => (
            <div
              key={local}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-opacity',
                fila.abierto ? 'border-border' : 'border-transparent opacity-50'
              )}
            >
              <Toggle on={fila.abierto} onChange={v => actualizarFila(local, { abierto: v })} />
              <span className="w-[76px] shrink-0 text-[12.5px] font-medium text-foreground">
                {NOMBRES_DIA[local]}
              </span>

              {fila.abierto ? (
                <>
                  <input
                    type="time"
                    value={fila.horaApertura}
                    onChange={e => actualizarFila(local, { horaApertura: e.target.value })}
                    className="rounded-md border border-border px-2 py-1 text-[12px] w-[118px] shrink-0 tabular-nums focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">–</span>
                  <input
                    type="time"
                    value={fila.horaCierre}
                    onChange={e => actualizarFila(local, { horaCierre: e.target.value })}
                    className="rounded-md border border-border px-2 py-1 text-[12px] w-[118px] shrink-0 tabular-nums focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <div className="flex-1 min-w-[60px] hidden sm:block">
                    <BarraDia fila={fila} />
                  </div>
                </>
              ) : (
                <span className="flex-1 text-[12px] text-muted-foreground">Cerrado</span>
              )}

              <button
                type="button"
                onClick={() => copiarATodos(local)}
                title={`Copiar ${NOMBRES_DIA[local]} a todos los días`}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
          ))}
        </div>

        <button onClick={guardar} disabled={guardando} className={cn(btnPrimary, 'mt-5')}>
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
      </div>

      <CierreDelCentro showToast={showToast} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cierre del centro: la semana de vacaciones, el puente, la reforma.
//
// Va debajo del horario semanal y no en una pantalla propia porque es la misma
// pregunta —cuándo abre este estudio— contestada para una fecha concreta en vez
// de para un día de la semana.
// ─────────────────────────────────────────────────────────────────────────────
function CierreDelCentro({ showToast }: { showToast: (m: string) => void }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const rangoInvalido = !!desde && !!hasta && hasta < desde;
  const listo = !!desde && !!hasta && !rangoInvalido;

  async function aplicar() {
    setAplicando(true);
    try {
      const res = await fetch('/api/cierres', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde, hasta, motivo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { showToast(data?.error ?? 'No se pudo aplicar el cierre'); return; }
      const partes = [`${data.dias} día${data.dias === 1 ? '' : 's'} cerrados`];
      if (data.clasesCanceladas) partes.push(`${data.clasesCanceladas} clase${data.clasesCanceladas === 1 ? '' : 's'} cancelada${data.clasesCanceladas === 1 ? '' : 's'}`);
      if (data.bonosAmpliados) partes.push(`${data.bonosAmpliados} bono${data.bonosAmpliados === 1 ? '' : 's'} prorrogado${data.bonosAmpliados === 1 ? '' : 's'}`);
      showToast(partes.join(' · '));
      // Las incidencias no se esconden detrás del mensaje de éxito.
      if (data.incidencias?.length) showToast(`Con avisos: ${data.incidencias[0]}`);
      setDesde(''); setHasta(''); setMotivo(''); setConfirmando(false);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground flex items-center gap-1.5 mb-1">
        <CalendarOff size={14} className="text-brand-medio" />
        Cerrar el centro unos días
      </h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Vacaciones, un puente, una reforma. Se cancelan las clases de esas fechas avisando a quien tuviera reserva, se les devuelve el bono, y a todo el estudio se le suman esos días a la caducidad de bonos y recuperaciones. Nadie podrá reservar en ese rango.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[12px] text-muted-foreground">Desde</span>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setConfirmando(false); }}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[12px] text-muted-foreground">Hasta (incluido)</span>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setConfirmando(false); }}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-[12px] text-muted-foreground">Motivo (opcional)</span>
        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Vacaciones de agosto"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]" />
      </label>

      {rangoInvalido && (
        <p className="mt-2 text-[12px] text-destructive">La fecha de fin no puede ser anterior a la de inicio.</p>
      )}

      {/* Cancela clases y toca la caducidad de TODOS los bonos del estudio: no
          es un guardado más, así que no se hace de un solo clic. */}
      {confirmando ? (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-[12.5px] text-foreground">
            Se van a cancelar las clases del {desde} al {hasta} y a avisar a quien tuviera reserva. Esto no se deshace solo.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={aplicar} disabled={aplicando} className={cn(btnPrimary)}>
              {aplicando ? 'Aplicando…' : 'Sí, cerrar esos días'}
            </button>
            <button onClick={() => setConfirmando(false)} disabled={aplicando} className={cn(btnSecondary)}>
              Volver
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)} disabled={!listo} className={cn(btnPrimary, 'mt-4')}>
          Cerrar el centro esos días
        </button>
      )}
    </div>
  );
}
