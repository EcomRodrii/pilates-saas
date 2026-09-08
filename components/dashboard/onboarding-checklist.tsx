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
    reservas,
  } = useStudio();

  if (!studio || studio.onboardingDescartadoEn) return null;

  const { totalPasos, totalCompletados, esencial } = calcularOnboarding({
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
    numReservas: reservas.length,
    numSalas: salas.length,
    // P1-6 (auditoría de producto): contar CUALQUIER fila marcaba «✓ Configura
    // tus bonos» tachado aunque fuera el borrador que crea el wizard de
    // bienvenida (`activo:false, precio:0` a propósito — nadie ha decidido el
    // precio todavía). Falsa sensación de "ya puedo cobrar": el bono no
    // aparece en la reserva pública hasta que la propietaria lo activa de
    // verdad.
    numPlanesTarifa: planesTarifa.filter(p => p.activo && p.precio > 0).length,
    numSuscripcionesActivas: suscripciones.filter(s => s.estado === 'ACTIVA').length,
    contenidoPortalPersonalizado: !!contenidoPortal?.mensajeDestacado,
    automatizacionesActivas: new Set(automationRules.filter(r => r.activa).map(r => r.trigger)),
  });

  if (totalCompletados === totalPasos) return null;

  // ⚠️ El porcentaje mide la ESENCIAL, no los 17 pasos. Contándolos todos, un
  // estudio con su página ya abierta veía «40 %»: había terminado lo que le
  // hacía falta para operar y el panel le decía que iba por la mitad. El resto
  // de categorías (equipo, portal, automatizaciones) siguen en /primeros-pasos,
  // que es donde tienen sentido.
  const pct = esencial.pct;

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
            <p className="text-[13px] font-semibold text-foreground">
              {pct === 100 ? 'Tu estudio ya puede recibir reservas' : `Tu estudio está al ${pct}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">{esencial.hechos} de {esencial.total} para poder recibir reservas</p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* El siguiente paso concreto con su enlace, no un consejo. Antes aquí
          iba la recomendación más urgente («Vemos que todavía no has conectado
          Stripe»), que dice lo que falta pero no la lleva a hacerlo — y encima
          podía no ser el siguiente paso del camino. */}
      {esencial.siguiente && (
        <Link
          href={esencial.siguiente.href}
          className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <Lightbulb size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-foreground">{esencial.siguiente.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{esencial.siguiente.descripcion}</span>
          </span>
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
