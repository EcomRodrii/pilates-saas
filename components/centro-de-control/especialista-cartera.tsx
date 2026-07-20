'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UsersRound, RefreshCw, ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InstructorDependencySnapshot, NivelRiesgoDependencia } from '@/lib/types';

// Estados alineados con SpecialistCard (Mi Equipo).
const ESTADO = {
  CRITICO: { label: 'Crítico', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
  ATENCION: { label: 'Atención', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))' },
  BUENO: { label: 'Bueno', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
} as const;

const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;

function porque(s: InstructorDependencySnapshot, nombre: string, ventana: number): string {
  const n = nombre.split(' ')[0];
  const base = `${s.alumnasCautivasCount} ${s.alumnasCautivasCount === 1 ? 'alumna asiste' : 'alumnas asisten'} casi en exclusiva a las clases de ${nombre} (≥80% de sus reservas) y ${s.alumnasCautivasCount === 1 ? 'genera' : 'generan'} ${eur(s.ingresosCautivos)} — el ${s.porcentajeFacturacion}% de tu facturación de los últimos ${ventana} días.`;
  const riesgo = s.nivelRiesgo === 'ALTO'
    ? ` Su fidelidad es hacia ${n}, no hacia el estudio: si se marchara, ese ${s.porcentajeFacturacion}% de ingresos es el que más papeletas tiene de irse con ${n}.`
    : ` Empieza a haber concentración de cartera en ${n}; todavía no es crítico, pero conviene vigilarlo antes de que crezca.`;
  return base + riesgo;
}

const accion = (nombre: string) => {
  const n = nombre.split(' ')[0];
  return `Reparte parte de las clases de ${n} entre otros instructores y crea vínculo de esas alumnas con el estudio (probar otra profe, eventos, retos) para que la relación no dependa solo de ${n}.`;
};

function TarjetaDetalle({ s, nombre, ventana }: { s: InstructorDependencySnapshot; nombre: string; ventana: number }) {
  const [abierto, setAbierto] = useState(false);
  const m = s.nivelRiesgo === 'ALTO' ? ESTADO.CRITICO : ESTADO.ATENCION;
  return (
    <div className="rounded-2xl border bg-card overflow-hidden" style={{ borderColor: m.bg }}>
      <div className="p-4" style={{ backgroundColor: m.bg }}>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-[14px] font-semibold text-foreground truncate">{nombre}</span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[15px] font-bold" style={{ color: m.color }}>{s.porcentajeFacturacion}%</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-card" style={{ color: m.color }}>{m.label === 'Crítico' ? 'Riesgo alto' : 'Riesgo medio'}</span>
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/90">{porque(s, nombre, ventana)}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Qué hacer: </span>{accion(nombre)}
        </p>
        {s.detalle.length > 0 && (
          <>
            <button onClick={() => setAbierto(v => !v)} className="mt-2.5 flex items-center gap-1 text-[12px] font-medium text-foreground hover:underline">
              <ChevronDown size={13} className={cn('transition-transform', abierto && 'rotate-180')} />
              {abierto ? 'Ocultar' : `Ver las ${s.detalle.length} alumnas cautivas`}
            </button>
            {abierto && (
              <ul className="mt-2 divide-y divide-border">
                {s.detalle.map(a => (
                  <li key={a.socioId} className="flex items-center justify-between py-1.5">
                    <span className="min-w-0 text-[13px] text-foreground truncate">
                      {a.nombre}<span className="text-[11px] text-muted-foreground"> · {a.pctConInstructor}% con {nombre.split(' ')[0]}</span>
                    </span>
                    <span className="text-[13px] font-semibold text-foreground shrink-0">{eur(a.gasto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function EspecialistaCartera() {
  const { dependencySnapshots, instructores, studio, recalcularDependencia } = useStudio();
  const [open, setOpen] = useState(false);
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

  if (conActividad.length === 0) return null; // sin análisis → sin tarjeta

  const hayAlto = riesgos.some(s => s.nivelRiesgo === 'ALTO');
  const estado = hayAlto ? ESTADO.CRITICO : riesgos.length > 0 ? ESTADO.ATENCION : ESTADO.BUENO;
  const enRiesgo = riesgos.reduce((a, s) => a + s.ingresosCautivos, 0);

  async function handleRecalcular() {
    setRecalculando(true);
    await recalcularDependencia();
    setRecalculando(false);
  }

  return (
    <>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <UsersRound size={16} className="shrink-0 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground truncate">Riesgo de cartera</span>
            </div>
            <Badge style={{ backgroundColor: estado.bg, color: estado.color }} className="shrink-0">
              {estado.label}
            </Badge>
          </div>

          <p className="text-[13px] text-muted-foreground">
            {riesgos.length === 0
              ? 'Cartera repartida entre el equipo.'
              : `${riesgos.length} ${riesgos.length === 1 ? 'instructor concentra' : 'instructores concentran'} demasiada facturación.`}
          </p>

          {enRiesgo > 0 && (
            <p className="text-[16px] font-bold text-foreground">{eur(enRiesgo)} en riesgo</p>
          )}

          <button onClick={() => setOpen(true)} className="text-[12px] font-semibold text-left" style={{ color: 'var(--brand-secondary)' }}>
            Revisar
          </button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <UsersRound size={17} /> Riesgo de cartera por instructor
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 mt-1 mb-1">
            <p className="text-[13px] text-muted-foreground">
              Alumnas que dependen de un instructor concreto (≥80% de sus asistencias), últimos {ventana} días.
            </p>
            <button onClick={handleRecalcular} disabled={recalculando}
              className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0">
              <RefreshCw size={13} className={cn(recalculando && 'animate-spin')} />
              {recalculando ? 'Calculando…' : 'Recalcular'}
            </button>
          </div>

          {riesgos.length > 0 ? (
            <div className="flex flex-col gap-3 max-h-[65vh] overflow-y-auto pr-1">
              {riesgos.map(s => (
                <TarjetaDetalle key={s.id} s={s} nombre={nombre.get(s.instructorId) ?? 'Instructor'} ventana={ventana} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <ShieldCheck size={18} className="text-success shrink-0" />
              <p className="text-[13px] text-muted-foreground">
                Ningún instructor concentra más del {studio?.depUmbralMedio ?? 15}% de la facturación en alumnas cautivas. Sin riesgo de fuga por dependencia.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
