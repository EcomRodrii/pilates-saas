'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw, ShieldAlert, Users2 } from 'lucide-react';
import type { InstructorDependencySnapshot, NivelRiesgoDependencia } from '@/lib/types';

const NIVEL_ORDEN: Record<NivelRiesgoDependencia, number> = { ALTO: 0, MEDIO: 1, BAJO: 2 };

const NIVEL_META: Record<NivelRiesgoDependencia, { label: string; color: string; bg: string }> = {
  ALTO:  { label: 'Riesgo alto',  color: '#DC2626', bg: '#FEE2E2' },
  MEDIO: { label: 'Riesgo medio', color: '#D97706', bg: '#FEF3C7' },
  BAJO:  { label: 'Riesgo bajo',  color: '#059669', bg: '#D1FAE5' },
};

function eur(n: number) {
  return `${Math.round(n).toLocaleString('es-ES')} €`;
}

export function InstructorDependencyWidget() {
  const { dependencySnapshots, instructores, studio, recalcularDependencia } = useStudio();
  const [recalculando, setRecalculando] = useState(false);
  const [abierta, setAbierta] = useState<InstructorDependencySnapshot | null>(null);

  const nombrePorInstructor = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of instructores) m.set(i.id, i.nombre);
    return m;
  }, [instructores]);

  // Ordena ALTO→MEDIO→BAJO y, dentro de cada nivel, por % desc. Oculta los que no
  // tienen actividad (0 alumnas) para no ensuciar la lista.
  const ordenados = useMemo(() =>
    [...dependencySnapshots]
      .filter(s => s.alumnasTotal > 0)
      .sort((a, b) => {
        const n = NIVEL_ORDEN[a.nivelRiesgo] - NIVEL_ORDEN[b.nivelRiesgo];
        return n !== 0 ? n : b.porcentajeFacturacion - a.porcentajeFacturacion;
      }),
    [dependencySnapshots]);

  async function handleRecalcular() {
    setRecalculando(true);
    await recalcularDependencia();
    setRecalculando(false);
  }

  const hayAlto = ordenados.some(s => s.nivelRiesgo === 'ALTO');

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={18} className={cn('mt-0.5 shrink-0', hayAlto ? 'text-[#DC2626]' : 'text-muted-foreground')} />
          <div>
            <p className="font-heading text-base font-medium text-foreground leading-snug">Riesgo de concentración por instructor</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Facturación en alumnas "cautivas" (≥80% de sus asistencias con un instructor), últimos {studio?.depVentanaDias ?? 90} días.
              Umbrales: alto &gt;{studio?.depUmbralAlto ?? 25}%, medio ≥{studio?.depUmbralMedio ?? 15}%.
            </p>
          </div>
        </div>
        <button
          onClick={handleRecalcular}
          disabled={recalculando}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={13} className={cn(recalculando && 'animate-spin')} />
          {recalculando ? 'Calculando…' : 'Recalcular'}
        </button>
      </CardContent>

      <CardContent>
        {ordenados.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-6">
            <Users2 size={22} className="text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">Aún no hay datos. Pulsa «Recalcular» para analizar la concentración de cartera.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {ordenados.map(s => {
              const meta = NIVEL_META[s.nivelRiesgo];
              return (
                <li key={s.id}>
                  <button onClick={() => setAbierta(s)} className="w-full text-left group">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[13px] font-medium text-foreground truncate group-hover:underline">
                        {nombrePorInstructor.get(s.instructorId) ?? 'Instructor'}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-[13px] font-bold" style={{ color: meta.color }}>{s.porcentajeFacturacion}%</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: meta.color, backgroundColor: meta.bg }}>
                          {meta.label}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, s.porcentajeFacturacion)}%`, backgroundColor: meta.color }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {s.alumnasCautivasCount} cautivas · {eur(s.ingresosCautivos)} de {eur(s.ingresosTotalEstudio)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Detalle: alumnas cautivas y su gasto */}
      <Dialog open={abierta !== null} onOpenChange={o => { if (!o) setAbierta(null); }}>
        <DialogContent className="max-w-md">
          {abierta && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  {abierta.nivelRiesgo === 'ALTO' && <AlertTriangle size={16} className="text-[#DC2626]" />}
                  {nombrePorInstructor.get(abierta.instructorId) ?? 'Instructor'}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2 my-3">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">% factura</p>
                  <p className="text-[16px] font-bold" style={{ color: NIVEL_META[abierta.nivelRiesgo].color }}>{abierta.porcentajeFacturacion}%</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cautivas</p>
                  <p className="text-[16px] font-bold text-foreground">{abierta.alumnasCautivasCount}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ingreso</p>
                  <p className="text-[16px] font-bold text-foreground">{eur(abierta.ingresosCautivos)}</p>
                </div>
              </div>
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Alumnas cautivas</p>
              {abierta.detalle.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Ninguna alumna cautiva en la ventana.</p>
              ) : (
                <ul className="divide-y divide-border max-h-72 overflow-y-auto">
                  {abierta.detalle.map(a => (
                    <li key={a.socioId} className="flex items-center justify-between py-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{a.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">{a.pctConInstructor}% de sus clases con este instructor</p>
                      </div>
                      <span className="text-[13px] font-semibold text-foreground shrink-0">{eur(a.gasto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
