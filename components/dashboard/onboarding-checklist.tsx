'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularPasosOnboarding } from '@/lib/onboarding';

// Checklist de primeros pasos. Los siete pasos son los del documento de
// filosofía de producto, tal cual (lib/onboarding.ts tiene la lista y el
// porqué de cada "done"). Aquí solo queda el render y el descarte.
//
// Lo único persistido es si se ha descartado: vive en el estudio
// (studio.onboardingDescartadoEn), no en localStorage. Antes se perdía al
// cambiar de navegador y cada persona del equipo lo veía de forma distinta.
export function OnboardingChecklist() {
  const { studio, updateStudio, instructores, tiposClase, sesiones, socios } = useStudio();

  if (!studio || studio.onboardingDescartadoEn) return null;

  const pasos = calcularPasosOnboarding({
    nif: studio.nif,
    stripeAccountId: studio.stripeAccountId,
    slug: studio.slug,
    numInstructores: instructores.length,
    numTiposClase: tiposClase.length,
    numSesiones: sesiones.length,
    numSocios: socios.length,
  });

  const pendientes = pasos.filter(p => !p.done).length;
  if (pendientes === 0) return null;

  function handleDismiss() {
    updateStudio({ onboardingDescartadoEn: new Date().toISOString() });
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
            <p className="text-[11px] text-muted-foreground">{pasos.length - pendientes} de {pasos.length} completados</p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
      <div className="divide-y divide-muted">
        {pasos.map(paso => (
          <Link
            key={paso.id}
            href={paso.href}
            target={paso.externo ? '_blank' : undefined}
            rel={paso.externo ? 'noreferrer' : undefined}
            className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#FAFAF7] transition-colors"
          >
            {paso.done
              ? <CheckCircle2 size={16} className="text-brand-secondary shrink-0" />
              : <Circle size={16} className="text-[#D4D4CC] shrink-0" />}
            <span className={`text-[13px] ${paso.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>
              {paso.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
