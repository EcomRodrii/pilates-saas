'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Rocket, X, Lightbulb } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { avisoVentaOnline, calcularOnboarding } from '@/lib/onboarding';
import { calcularProgresoGuia } from '@/lib/guia/progreso';

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

  const datos = {
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
    numPlanesActivos: planesTarifa.filter(p => p.activo).length,
    numPlanesBorrador: planesTarifa.filter(p => !p.activo || !(p.precio > 0)).length,
    reservaExigirPlan: studio.reservaExigirPlan ?? true,
    numSuscripcionesActivas: suscripciones.filter(s => s.estado === 'ACTIVA').length,
    contenidoPortalPersonalizado: !!contenidoPortal?.mensajeDestacado,
    automatizacionesActivas: new Set(automationRules.filter(r => r.activa).map(r => r.trigger)),
  };
  const { totalPasos, totalCompletados, categorias } = calcularOnboarding(datos);

  if (totalCompletados === totalPasos) return null;

  // ⚠️ EL MISMO NÚMERO QUE LA GUÍA. Esta tarjeta contaba los 10 pasos de
  // «Configuración inicial» (`calcularOnboarding().esencial`, incluidos
  // «Personaliza tu marca» y «Recibe tu primera reserva») y /primeros-pasos los
  // 7 de los capítulos «Para empezar» (`calcularProgresoGuia`). Una propietaria
  // leía «4 de 10» en el dashboard, pulsaba «Ver todos los pasos» y la guía le
  // decía «3 de 7 · te faltan 4» (evaluación del 13-sep). Ahora los dos salen
  // del mismo cálculo, así que no pueden volver a divergir.
  const progreso = calcularProgresoGuia(categorias);
  const pct = progreso.esencialPct;
  const listo = progreso.esencialTotal > 0 && progreso.esencialHechos === progreso.esencialTotal;
  const siguiente = progreso.siguientePaso;
  const aviso = avisoVentaOnline(datos);

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
              {listo ? 'Tu estudio ya puede recibir reservas' : `Tu estudio está al ${pct}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {listo
                ? 'Lo esencial está hecho.'
                : `${progreso.esencialHechos} de ${progreso.esencialTotal} para poder recibir reservas`}
            </p>
          </div>
        </div>
        <button onClick={handleDismiss} aria-label="Ocultar primeros pasos" className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors" title="Ocultar">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Lo que hace falta saber antes de compartir el enlace: va encima del
          siguiente paso porque rompe justo lo que el titular promete. */}
      {aviso && (
        <Link
          href="/configuracion?tab=integraciones"
          className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 transition-colors hover:bg-warning/15"
        >
          <AlertTriangle size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
          <span className="text-[12px] leading-snug text-foreground">{aviso}</span>
        </Link>
      )}

      {/* El siguiente paso concreto con su enlace, no un consejo. Antes aquí
          iba la recomendación más urgente («Vemos que todavía no has conectado
          Stripe»), que dice lo que falta pero no la lleva a hacerlo — y encima
          podía no ser el siguiente paso del camino. */}
      {siguiente && (
        <Link
          href={siguiente.href}
          className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <Lightbulb size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-foreground">{siguiente.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{siguiente.descripcion}</span>
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
