'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, Clock, ArrowRight, ArrowLeft, Lightbulb, Play, ExternalLink } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding } from '@/lib/onboarding';
import { calcularProgresoGuia } from '@/lib/guia/progreso';
import { CAPITULOS, capituloPorId, ETIQUETA_NIVEL } from '@/lib/guia/curriculo';
import { useTour } from '@/lib/tour-context';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Un capítulo de la guía.
//
// El orden de la pantalla es el orden en que se decide si vale la pena: primero
// POR QUÉ importa, luego qué vas a aprender, luego la explicación, y al final
// los botones. Al revés —botones arriba— se convierte otra vez en una lista de
// tareas, que es exactamente lo que había.
//
// Los pasos concretos van marcados con su estado real (sale del checklist, ver
// lib/guia/progreso.ts). Leer el capítulo NO marca nada: leer no es haber hecho.
// ─────────────────────────────────────────────────────────────────────────────

export default function CapituloPage({ params }: { params: Promise<{ capitulo: string }> }) {
  const { capitulo: id } = use(params);
  const {
    studio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal, reservas,
  } = useStudio();
  const { iniciarTour } = useTour();

  const capitulo = capituloPorId(id);
  if (!capitulo) notFound();

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
    numReservas: reservas.length,
    numSalas: salas.length,
    numPlanesTarifa: planesTarifa.filter(p => p.activo && p.precio > 0).length,
    numSuscripcionesActivas: suscripciones.filter(s => s.estado === 'ACTIVA').length,
    contenidoPortalPersonalizado: !!contenidoPortal?.mensajeDestacado,
    automatizacionesActivas: new Set(automationRules.filter(r => r.activa).map(r => r.trigger)),
  }) : null;

  const item = datos
    ? calcularProgresoGuia(datos.categorias).capitulos.find(c => c.capitulo.id === id) ?? null
    : null;

  const indice = CAPITULOS.findIndex(c => c.id === id);
  const anterior = indice > 0 ? CAPITULOS[indice - 1] : null;
  const siguiente = indice < CAPITULOS.length - 1 ? CAPITULOS[indice + 1] : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/primeros-pasos', label: 'Volver a la guía' }}
        title={capitulo.titulo}
        description={capitulo.resumen}
        badge={
          <span className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <span className="tabular-nums">{capitulo.numero}</span>
            <span aria-hidden>·</span>
            <span>{ETIQUETA_NIVEL[capitulo.nivel]}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {capitulo.minutos} min</span>
          </span>
        }
      />

      {/* Por qué, antes que nada. Es lo que decide si sigue leyendo. */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Por qué importa</p>
        <p className="text-[15px] text-foreground mt-2 leading-relaxed">{capitulo.porQue}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Qué vas a aprender</p>
        <ul className="mt-3 space-y-2">
          {capitulo.queAprendes.map(q => (
            <li key={q} className="flex items-start gap-2.5 text-[13px] text-foreground">
              <span aria-hidden className="mt-[7px] size-1.5 rounded-full bg-brand-secondary shrink-0" />
              <span className="leading-relaxed">{q}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        {capitulo.apartados.map(ap => (
          <section key={ap.titulo} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">{ap.titulo}</h2>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{ap.texto}</p>
          </section>
        ))}
      </div>

      {capitulo.consejo && (
        <div className="rounded-2xl border border-border bg-muted/40 p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <Lightbulb size={13} className="text-warning" /> Consejo de Tentare
          </p>
          <p className="text-[13px] text-foreground mt-2 leading-relaxed">{capitulo.consejo}</p>
        </div>
      )}

      {/* Lo que falta de verdad en ESTE estudio, con su estado real. */}
      {item && item.pasos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <p className="text-[13px] font-semibold text-foreground">
              {item.hechos === item.total ? 'Lo tienes hecho' : 'Lo que te falta de este capítulo'}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{item.hechos} de {item.total}</p>
          </div>
          <div className="divide-y divide-muted">
            {item.pasos.map(paso => (
              <div key={paso.id} className="flex items-center gap-3 px-5 py-3">
                {paso.done
                  ? <CheckCircle2 size={18} className="text-brand-secondary shrink-0" />
                  : <Circle size={18} className="text-[#D4D4CC] shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-[13px]', paso.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium')}>
                    {paso.label}
                  </span>
                  {!paso.done && <span className="block text-[12px] text-muted-foreground mt-0.5">{paso.descripcion}</span>}
                </span>
                {!paso.done && (
                  <Link
                    href={paso.href}
                    target={paso.externo ? '_blank' : undefined}
                    rel={paso.externo ? 'noreferrer' : undefined}
                    className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground hover:brightness-95 transition-all"
                  >
                    Hacerlo
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        {capitulo.acciones.map(accion => accion.tour ? (
          <button
            key={accion.label}
            onClick={iniciarTour}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[13px] font-semibold text-brand-foreground hover:brightness-95 transition-all"
          >
            <Play size={15} /> {accion.label}
          </button>
        ) : (
          <Link
            key={accion.label}
            href={accion.href ?? '/primeros-pasos'}
            target={accion.externo ? '_blank' : undefined}
            rel={accion.externo ? 'noreferrer' : undefined}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[13px] font-semibold text-foreground hover:bg-muted transition-colors"
          >
            {accion.label} {accion.externo ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
          </Link>
        ))}
      </div>

      <nav className="flex items-stretch gap-2.5 pt-2">
        {anterior ? (
          <Link
            href={`/primeros-pasos/${anterior.id}`}
            className="flex-1 min-w-0 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><ArrowLeft size={11} /> Anterior</span>
            <span className="block text-[13px] font-medium text-foreground truncate mt-0.5">{anterior.titulo}</span>
          </Link>
        ) : <span className="flex-1" />}
        {siguiente ? (
          <Link
            href={`/primeros-pasos/${siguiente.id}`}
            className="flex-1 min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-right hover:bg-muted transition-colors"
          >
            <span className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">Siguiente <ArrowRight size={11} /></span>
            <span className="block text-[13px] font-medium text-foreground truncate mt-0.5">{siguiente.titulo}</span>
          </Link>
        ) : <span className="flex-1" />}
      </nav>
    </div>
  );
}
