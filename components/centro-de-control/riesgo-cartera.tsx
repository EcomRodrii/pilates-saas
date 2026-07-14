'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { RefreshCw, ChevronDown, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { InstructorDependencySnapshot, NivelRiesgoDependencia } from '@/lib/types';

const META: Record<NivelRiesgoDependencia, { label: string; color: string; bg: string; border: string }> = {
  ALTO:  { label: 'Riesgo alto',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  MEDIO: { label: 'Riesgo medio', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  BAJO:  { label: 'Riesgo bajo',  color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
};

const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;

// Explica, en lenguaje llano, POR QUÉ este instructor es un riesgo y qué implica.
function porque(s: InstructorDependencySnapshot, nombre: string, ventana: number): string {
  const base = `${s.alumnasCautivasCount} ${s.alumnasCautivasCount === 1 ? 'alumna asiste' : 'alumnas asisten'} casi en exclusiva a las clases de ${nombre} (≥80% de sus reservas) y ${s.alumnasCautivasCount === 1 ? 'genera' : 'generan'} ${eur(s.ingresosCautivos)} — el ${s.porcentajeFacturacion}% de tu facturación de los últimos ${ventana} días.`;
  const riesgo = s.nivelRiesgo === 'ALTO'
    ? ` Su fidelidad es hacia ${nombre}, no hacia el estudio: si se marchara, ese ${s.porcentajeFacturacion}% de ingresos es el que más papeletas tiene de irse con ${nombre.split(' ')[0]}.`
    : ` Empieza a haber concentración de cartera en ${nombre.split(' ')[0]}; todavía no es crítico, pero conviene vigilarlo antes de que crezca.`;
  return base + riesgo;
}

function accion(nombre: string): string {
  const n = nombre.split(' ')[0];
  return `Reparte parte de las clases de ${n} entre otros instructores y crea vínculo de esas alumnas con el estudio (probar otra profe, eventos, retos) para que la relación no dependa solo de ${n}.`;
}

function TarjetaRiesgo({ s, nombre, ventana }: { s: InstructorDependencySnapshot; nombre: string; ventana: number }) {
  const [abierto, setAbierto] = useState(false);
  const m = META[s.nivelRiesgo];
  return (
    <div className="rounded-2xl border bg-card overflow-hidden" style={{ borderColor: m.border }}>
      <div className="p-4" style={{ backgroundColor: m.bg }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={15} style={{ color: m.color }} className="shrink-0" />
            <span className="text-[14px] font-semibold text-foreground truncate">{nombre}</span>
          </div>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[15px] font-bold" style={{ color: m.color }}>{s.porcentajeFacturacion}%</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: m.color, backgroundColor: '#fff' }}>{m.label}</span>
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/90">{porque(s, nombre, ventana)}</p>
      </div>
      <div className="px-4 py-3 border-t" style={{ borderColor: m.border }}>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Qué hacer: </span>{accion(nombre)}
        </p>
        {s.detalle.length > 0 && (
          <button onClick={() => setAbierto(v => !v)} className="mt-2.5 flex items-center gap-1 text-[12px] font-medium text-foreground hover:underline">
            <ChevronDown size={13} className={cn('transition-transform', abierto && 'rotate-180')} />
            {abierto ? 'Ocultar' : `Ver las ${s.detalle.length} alumnas cautivas`}
          </button>
        )}
        {abierto && (
          <ul className="mt-2 divide-y divide-border">
            {s.detalle.map(a => (
              <li key={a.socioId} className="flex items-center justify-between py-1.5">
                <span className="min-w-0">
                  <span className="text-[13px] text-foreground">{a.nombre}</span>
                  <span className="text-[11px] text-muted-foreground"> · {a.pctConInstructor}% con {nombre.split(' ')[0]}</span>
                </span>
                <span className="text-[13px] font-semibold text-foreground shrink-0">{eur(a.gasto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function RiesgoCartera() {
  const { dependencySnapshots, instructores, studio, recalcularDependencia } = useStudio();
  const [recalculando, setRecalculando] = useState(false);

  const nombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of instructores) m.set(i.id, i.nombre);
    return m;
  }, [instructores]);

  const ventana = studio?.depVentanaDias ?? 90;
  const conActividad = dependencySnapshots.filter(s => s.alumnasTotal > 0);
  const riesgos = conActividad
    .filter(s => s.nivelRiesgo === 'ALTO' || s.nivelRiesgo === 'MEDIO')
    .sort((a, b) => b.porcentajeFacturacion - a.porcentajeFacturacion);
  const analizado = conActividad.length > 0;

  async function handleRecalcular() {
    setRecalculando(true);
    await recalcularDependencia();
    setRecalculando(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Riesgo de cartera por instructor
        </h2>
        <button onClick={handleRecalcular} disabled={recalculando}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={cn(recalculando && 'animate-spin')} />
          {recalculando ? 'Calculando…' : 'Analizar'}
        </button>
      </div>

      {riesgos.length > 0 ? (
        <>
          <p className="text-[13px] text-muted-foreground -mt-1">
            {riesgos.length === 1 ? 'Un instructor concentra' : `${riesgos.length} instructores concentran`} una parte de tu
            facturación que dependería de que sigan en el estudio. Ordenado por exposición.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {riesgos.map(s => (
              <TarjetaRiesgo key={s.id} s={s} nombre={nombre.get(s.instructorId) ?? 'Instructor'} ventana={ventana} />
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <ShieldCheck size={18} className="text-[#059669] shrink-0" />
          <p className="text-[13px] text-muted-foreground">
            {analizado
              ? `Tu cartera está repartida: ningún instructor concentra más del ${studio?.depUmbralMedio ?? 15}% de la facturación en alumnas cautivas. Sin riesgo de fuga por dependencia.`
              : 'Pulsa «Analizar» para revisar si algún instructor concentra demasiada facturación en alumnas que dependen de él o ella.'}
          </p>
        </div>
      )}
    </div>
  );
}
