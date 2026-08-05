'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, Rocket, Lightbulb, ArrowRight, ChevronDown } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding, type CategoriaOnboarding } from '@/lib/onboarding';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// Rediseño del checklist de "Primeros pasos": antes una lista plana de 7
// pasos, ahora agrupada por categoría (lib/onboarding.ts tiene la lista
// completa y el porqué de cada "done"). Aquí solo queda el render, el
// descarte y qué categorías están abiertas.
//
// Lo único persistido es si se ha descartado: vive en el estudio
// (studio.onboardingDescartadoEn), no en localStorage — cada persona del
// equipo vería lo mismo si no, y antes se perdía al cambiar de navegador.
export function OnboardingChecklist() {
  const {
    studio, updateStudio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  } = useStudio();

  if (!studio || studio.onboardingDescartadoEn) return null;

  const { categorias, enlaces, recomendaciones, totalPasos, totalCompletados } = calcularOnboarding({
    nif: studio.nif,
    stripeAccountId: studio.stripeAccountId,
    slug: studio.slug,
    colorPrimario: studio.colorPrimario,
    temaPortal: studio.temaPortal,
    logoUrl: studio.logoUrl,
    numInstructores: instructores.length,
    numInstructoresConCuenta: instructores.filter(i => i.authUserId).length,
    numTiposClase: tiposClase.length,
    numSesiones: sesiones.length,
    numSocios: socios.length,
    numSalas: salas.length,
    numPlanesTarifa: planesTarifa.length,
    numSuscripcionesActivas: suscripciones.filter(s => s.estado === 'ACTIVA').length,
    contenidoPortalPersonalizado: !!contenidoPortal?.mensajeDestacado,
    automatizacionesActivas: new Set(automationRules.filter(r => r.activa).map(r => r.trigger)),
  });

  if (totalCompletados === totalPasos) return null;

  async function handleDismiss() {
    await updateStudio({ onboardingDescartadoEn: new Date().toISOString() });
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#F0F0EA]">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand-secondary">
            <Rocket size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Primeros pasos con tu estudio</p>
            <p className="text-[11px] text-muted-foreground">{totalCompletados} de {totalPasos} pasos completados</p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <BarraProgreso completados={totalCompletados} total={totalPasos} />

      {recomendaciones.length > 0 && (
        <div className="px-4 py-3 border-b border-[#F0F0EA] bg-[#FAFAF7] space-y-1.5">
          {recomendaciones.map(r => (
            <Link key={r.id} href={r.href} className="flex items-start gap-2 text-[12px] text-foreground hover:underline">
              <Lightbulb size={13} className="text-warning shrink-0 mt-[1px]" />
              <span>{r.texto}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="divide-y divide-muted">
        {categorias.map(cat => <Categoria key={cat.id} categoria={cat} />)}
      </div>

      <div className="px-4 py-3 border-t border-[#F0F0EA] space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ya en marcha, para cuando quieras mirarlas</p>
        {enlaces.map(e => (
          <Link key={e.id} href={e.href} className="flex items-center justify-between gap-2 text-[12px] text-foreground hover:bg-muted rounded-lg px-2 py-1.5 -mx-2 transition-colors">
            <span className="min-w-0">
              <span className="font-medium">{e.label}</span>
              <span className="text-muted-foreground"> — {e.descripcion}</span>
            </span>
            <ArrowRight size={13} className="text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function BarraProgreso({ completados, total }: { completados: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completados / total) * 100);
  return (
    <div className="px-4 pt-3">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Categoria({ categoria }: { categoria: CategoriaOnboarding }) {
  const completados = categoria.pasos.filter(p => p.done).length;
  const total = categoria.pasos.length;
  // Abierta por defecto solo mientras quede algo pendiente dentro: una vez
  // completada, no hace falta ver de nuevo lo que ya está resuelto.
  const [abierta, setAbierta] = useState(completados < total);

  return (
    <Collapsible open={abierta} onOpenChange={setAbierta}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-2.5 hover:bg-[#FAFAF7] transition-colors">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span aria-hidden="true">{categoria.emoji}</span>
          {categoria.label}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{completados}/{total}</span>
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', abierta && 'rotate-180')} />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="divide-y divide-muted border-t border-[#F0F0EA]">
          {categoria.pasos.map(paso => (
            <Link
              key={paso.id}
              href={paso.href}
              target={paso.externo ? '_blank' : undefined}
              rel={paso.externo ? 'noreferrer' : undefined}
              className="flex items-start gap-2.5 px-4 py-2.5 pl-8 hover:bg-[#FAFAF7] transition-colors"
            >
              {paso.done
                ? <CheckCircle2 size={16} className="text-brand-secondary shrink-0 mt-[1px]" />
                : <Circle size={16} className="text-[#D4D4CC] shrink-0 mt-[1px]" />}
              <span className="min-w-0">
                <span className={cn('block text-[13px]', paso.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium')}>
                  {paso.label}
                </span>
                {!paso.done && paso.descripcion && (
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {paso.descripcion} · ⏱️ {paso.minutos} min
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
