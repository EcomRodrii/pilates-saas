'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Circle, Clock, Lightbulb, ArrowRight, ChevronDown,
  Rocket, CreditCard, Bot, Users, Smartphone, type LucideIcon,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding, type CategoriaOnboarding } from '@/lib/onboarding';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

// Página propia para el asistente de "Primeros pasos" — antes vivía entero
// como una tarjeta acordeón dentro del dashboard, compitiendo por espacio
// con el resto de tarjetas (KPIs, calendario, cobros...). Un asistente de
// configuración de 15 pasos en 5 categorías no cabe como una tarjeta más:
// necesita su propia pantalla. El dashboard ahora solo enseña un resumen
// compacto (ver onboarding-checklist.tsx) con un botón hacia aquí.
const ICONOS_CATEGORIA: Record<string, LucideIcon> = {
  'configuracion-inicial': Rocket,
  pagos: CreditCard,
  automatizaciones: Bot,
  equipo: Users,
  portal: Smartphone,
};

export default function PrimerosPasosPage() {
  const {
    studio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  } = useStudio();

  if (!studio) return null;

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

  const pct = totalPasos === 0 ? 0 : Math.round((totalCompletados / totalPasos) * 100);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/dashboard', label: 'Volver al inicio' }}
        title="Primeros pasos con tu estudio"
        description="Todo lo que puedes configurar para sacarle el máximo partido a Tentare — no hace falta hacerlo todo hoy."
        badge={<span className="text-[12px] font-semibold text-muted-foreground">{totalCompletados} de {totalPasos} completados</span>}
      />

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {totalCompletados === totalPasos ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <CheckCircle2 size={28} className="text-brand-secondary mx-auto mb-2" />
          <p className="text-[15px] font-semibold text-foreground">Configuración inicial completada</p>
          <p className="text-[13px] text-muted-foreground mt-1">Tu estudio ya está preparado para recibir reservas.</p>
        </div>
      ) : recomendaciones.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Merece la pena mirar esto</p>
          {recomendaciones.map(r => (
            <Link key={r.id} href={r.href} className="flex items-start gap-2 text-[13px] text-foreground hover:underline">
              <Lightbulb size={14} className="text-warning shrink-0 mt-[2px]" />
              <span>{r.texto}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {categorias.map(cat => <Categoria key={cat.id} categoria={cat} />)}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">Ya en marcha, para cuando quieras mirarlas</p>
        {enlaces.map(e => (
          <Link key={e.id} href={e.href} className="flex items-center justify-between gap-3 text-[13px] text-foreground hover:bg-muted rounded-xl px-3 py-2.5 transition-colors">
            <span className="min-w-0">
              <span className="font-medium">{e.label}</span>
              <span className="text-muted-foreground"> — {e.descripcion}</span>
            </span>
            <ArrowRight size={14} className="text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Categoria({ categoria }: { categoria: CategoriaOnboarding }) {
  const completados = categoria.pasos.filter(p => p.done).length;
  const total = categoria.pasos.length;
  const [abierta, setAbierta] = useState(completados < total);
  const Icono = ICONOS_CATEGORIA[categoria.id] ?? Circle;

  return (
    <Collapsible open={abierta} onOpenChange={setAbierta} className="rounded-2xl border border-border bg-card overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-3">
          <span className={cn(
            'flex size-8 items-center justify-center rounded-lg shrink-0',
            completados === total ? 'bg-brand-secondary/15 text-brand-secondary' : 'bg-brand/10 text-brand-secondary',
          )}>
            <Icono size={16} />
          </span>
          <span className="text-[14px] font-semibold text-foreground">{categoria.label}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-muted-foreground">{completados}/{total}</span>
          <ChevronDown size={16} className={cn('text-muted-foreground transition-transform', abierta && 'rotate-180')} />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="divide-y divide-muted border-t border-border">
          {categoria.pasos.map(paso => (
            <Link
              key={paso.id}
              href={paso.href}
              target={paso.externo ? '_blank' : undefined}
              rel={paso.externo ? 'noreferrer' : undefined}
              className="flex items-start gap-3 px-4 py-3 pl-[52px] hover:bg-muted/50 transition-colors"
            >
              {paso.done
                ? <CheckCircle2 size={18} className="text-brand-secondary shrink-0 mt-[1px]" />
                : <Circle size={18} className="text-[#D4D4CC] shrink-0 mt-[1px]" />}
              <span className="min-w-0">
                <span className={cn('block text-[13px]', paso.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium')}>
                  {paso.label}
                </span>
                {!paso.done && paso.descripcion && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                    {paso.descripcion}
                    <span className="inline-flex items-center gap-0.5 shrink-0 ml-1">
                      <Clock size={10} /> {paso.minutos} min
                    </span>
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
