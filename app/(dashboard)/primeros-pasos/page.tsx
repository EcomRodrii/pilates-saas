'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Circle, Clock, Lightbulb, ArrowRight, ChevronDown,
  Rocket, CreditCard, Bot, Users, Smartphone, Play, Compass, type LucideIcon,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding, type CategoriaOnboarding } from '@/lib/onboarding';
import { useTour } from '@/lib/tour-context';
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

// Ilustraciones (unDraw, recoloreadas al verde de marca) — de icono suelto a
// algo con la cara que pide el spec original. Solo en esta página: la
// tarjeta compacta del dashboard (onboarding-checklist.tsx) sigue siendo
// solo icono, no hay sitio para una ilustración en una tira tan estrecha.
const ILUSTRACIONES_CATEGORIA: Record<string, string> = {
  'configuracion-inicial': '/ilustraciones/configuracion.svg',
  pagos: '/ilustraciones/pagos.svg',
  automatizaciones: '/ilustraciones/automatizaciones.svg',
  equipo: '/ilustraciones/equipo.svg',
  portal: '/ilustraciones/portal.svg',
};

export default function PrimerosPasosPage() {
  const {
    studio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  } = useStudio();
  const { iniciarTour } = useTour();

  // Sin `studio` no hay nada que calcular, pero el early return NO puede ir
  // aquí: los hooks de gamificación de más abajo dejarían de ejecutarse en el
  // primer render y volverían a hacerlo en cuanto el contexto resuelve, que es
  // exactamente el "Rendered more hooks than during the previous render" que
  // tumba la pantalla. Se calcula condicionalmente y se sale DESPUÉS de todos
  // los hooks.
  const datos = studio ? calcularOnboarding({
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
  }) : null;

  const totalPasos = datos?.totalPasos ?? 0;
  const totalCompletados = datos?.totalCompletados ?? 0;
  const pct = totalPasos === 0 ? 0 : Math.round((totalCompletados / totalPasos) * 100);

  // Gamificación: detecta el instante en que se pasa de incompleto a
  // completo (nunca al revés, y nunca en la primera carga) para disparar la
  // confirmación con animación. Derivado en cliente por comparación de
  // renders — no hay nada que persistir en BD: si recarga la página después
  // de completarlo, ya no hay "antes" que comparar, y eso es correcto, la
  // confirmación es un momento, no un estado.
  const prevTotalRef = useRef<number | null>(null);
  const [recienCompletado, setRecienCompletado] = useState(false);
  const hayDatos = datos !== null;
  useEffect(() => {
    // Mientras el contexto no ha resuelto, los totales valen 0 y NO cuentan
    // como un "antes": sin esta guarda, un estudio que ya lo tenía todo hecho
    // vería la animación de recién completado nada más abrir la página (0 → 15
    // se lee como si lo acabara de terminar), justo lo que dice el comentario
    // de arriba que no debe pasar.
    if (!hayDatos) return;
    const prev = prevTotalRef.current;
    if (prev !== null && prev < totalPasos && totalCompletados === totalPasos) setRecienCompletado(true);
    prevTotalRef.current = totalCompletados;
  }, [hayDatos, totalCompletados, totalPasos]);

  if (!studio || !datos) return null;
  const { categorias, enlaces, recomendaciones } = datos;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/dashboard', label: 'Volver al inicio' }}
        title="Primeros pasos con tu estudio"
        description="Todo lo que puedes configurar para sacarle el máximo partido a Tentare — no hace falta hacerlo todo hoy."
        badge={<span className="text-[12px] font-semibold text-muted-foreground">{totalCompletados} de {totalPasos} completados</span>}
      />

      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          onClick={iniciarTour}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand text-brand-foreground text-[13px] font-semibold hover:brightness-95 transition-colors"
        >
          <Play size={15} /> Ver un tour guiado (3 minutos)
        </button>
        <Link
          href="/explorar-funciones"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-[13px] font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <Compass size={15} /> Explorar todas las funciones
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-6 overflow-hidden">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-foreground">{pct}% de tu estudio está listo</p>
          <p className="text-[13px] text-muted-foreground mt-1">Ve completando lo que te falta a tu ritmo — no hace falta hacerlo todo hoy.</p>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-4">
            <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ilustraciones/hero.svg" alt="" className="hidden sm:block w-40 shrink-0" />
      </div>

      {totalCompletados === totalPasos ? (
        <div className={cn(
          'rounded-2xl border border-border bg-card p-6 text-center',
          recienCompletado && 'animate-in fade-in-0 zoom-in-95 duration-300',
        )}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ilustraciones/completado.svg" alt="" className="w-32 h-32 mx-auto mb-2" />
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
          <Link key={e.id} href={e.href} title={e.descripcion} className="flex items-center justify-between gap-3 text-[13px] font-medium text-foreground hover:bg-muted rounded-xl px-3 py-2.5 transition-colors">
            {e.label}
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

  // Misma gamificación que a nivel de página, pero por categoría: un
  // pequeño "✔ completada" que aparece una vez, al pasar de incompleta a
  // completa, sin tocar lib/onboarding.ts (que sigue puro).
  const prevRef = useRef<number | null>(null);
  const [recienCompletada, setRecienCompletada] = useState(false);
  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== null && prev < total && completados === total) setRecienCompletada(true);
    prevRef.current = completados;
  }, [completados, total]);

  const ilustracion = ILUSTRACIONES_CATEGORIA[categoria.id];

  return (
    <Collapsible open={abierta} onOpenChange={setAbierta} className="rounded-2xl border border-border bg-card overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
        {ilustracion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ilustracion} alt="" className={cn('w-16 h-16 object-contain shrink-0', recienCompletada && 'animate-in zoom-in-50 duration-300')} />
        ) : (
          <span className={cn('flex size-16 items-center justify-center rounded-xl shrink-0', 'bg-brand/10 text-brand-secondary')}>
            <Icono size={24} />
          </span>
        )}
        <span className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{categoria.label}</span>
            {recienCompletada && (
              <span className="text-[11px] font-semibold text-brand-secondary animate-in fade-in-0 slide-in-from-left-1 duration-300">
                ¡Completada!
              </span>
            )}
          </span>
          <span className="block text-[12px] text-muted-foreground mt-0.5">{completados} de {total} hechos</span>
        </span>
        <ChevronDown size={18} className={cn('text-muted-foreground transition-transform shrink-0', abierta && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="divide-y divide-muted border-t border-border">
          {categoria.pasos.map(paso => (
            <Link
              key={paso.id}
              href={paso.href}
              target={paso.externo ? '_blank' : undefined}
              rel={paso.externo ? 'noreferrer' : undefined}
              title={paso.descripcion}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              {paso.done
                ? <CheckCircle2 size={18} className="text-brand-secondary shrink-0" />
                : <Circle size={18} className="text-[#D4D4CC] shrink-0" />}
              <span className={cn('flex-1 min-w-0 text-[13px]', paso.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium')}>
                {paso.label}
              </span>
              {!paso.done && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  <Clock size={10} /> {paso.minutos} min
                </span>
              )}
            </Link>
          ))}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
