'use client';

import Link from 'next/link';
import { ArrowRight, Rocket, X, Lightbulb } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding } from '@/lib/onboarding';

// Resumen compacto para el dashboard — el asistente completo (categorías,
// ayuda contextual, enlaces) vive en su propia página, /primeros-pasos. Antes
// esto era una tarjeta-acordeón de 15 pasos en 5 categorías compitiendo por
// espacio con el resto del dashboard (KPIs, calendario, cobros); ahora es una
// tarjeta más, del mismo tamaño que las demás, con un botón hacia la guía
// completa.
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

  const { recomendaciones, totalPasos, totalCompletados } = calcularOnboarding({
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

  const pct = totalPasos === 0 ? 0 : Math.round((totalCompletados / totalPasos) * 100);
  // Solo la más urgente aquí — el resto se ve dentro de la página completa.
  const topRecomendacion = recomendaciones[0];

  async function handleDismiss() {
    await updateStudio({ onboardingDescartadoEn: new Date().toISOString() });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand-secondary shrink-0">
            <Rocket size={16} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Primeros pasos con tu estudio</p>
            <p className="text-[11px] text-muted-foreground">{totalCompletados} de {totalPasos} pasos completados · {pct}%</p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {topRecomendacion && (
        <Link href={topRecomendacion.href} className="flex items-start gap-2 text-[12px] text-foreground mt-3 hover:underline">
          <Lightbulb size={14} className="text-warning shrink-0 mt-[1px]" />
          <span>{topRecomendacion.texto}</span>
        </Link>
      )}

      <Link
        href="/primeros-pasos"
        className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-brand-secondary hover:underline mt-3"
      >
        Ver todos los pasos <ArrowRight size={14} />
      </Link>
    </div>
  );
}
