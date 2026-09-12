'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Circle, CircleDot, Clock, ArrowRight, Play, Compass, Lightbulb, BookOpen,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { calcularOnboarding } from '@/lib/onboarding';
import { calcularProgresoGuia, porNivel, type CapituloConEstado } from '@/lib/guia/progreso';
import { ETIQUETA_NIVEL, EXPLICACION_NIVEL, type NivelGuia } from '@/lib/guia/curriculo';
import { useTour } from '@/lib/tour-context';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// La portada de la guía.
//
// Antes esto era la lista de 17 tareas pendientes. Seguía siendo útil —y su
// cálculo de «hecho» a partir de datos reales se conserva entero, ver
// lib/guia/progreso.ts— pero respondía a una sola pregunta: ¿qué me falta? Una
// propietaria que no conoce el producto necesita antes otra: ¿qué es esto?
//
// Ahora son quince capítulos en tres niveles. El porcentaje cuenta SOLO el
// nivel «Para empezar», que es el camino hasta la primera reserva: contar los
// quince le diría «20 %» a un estudio que ya está funcionando, y un número que
// la propietaria no reconoce es un número que deja de mirar.
// ─────────────────────────────────────────────────────────────────────────────

const ILUSTRACION_NIVEL: Record<NivelGuia, string> = {
  esencial: '/ilustraciones/configuracion.svg',
  recomendado: '/ilustraciones/pagos.svg',
  avanzado: '/ilustraciones/automatizaciones.svg',
};

export default function PrimerosPasosPage() {
  const {
    studio, instructores, tiposClase, sesiones, socios,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal, reservas,
  } = useStudio();
  const { iniciarTour } = useTour();

  // Sin `studio` no hay nada que calcular, pero el early return NO puede ir
  // aquí: los hooks de abajo dejarían de ejecutarse en el primer render y
  // volverían en cuanto el contexto resuelve — el «Rendered more hooks than
  // during the previous render» que ya tumbó esta pantalla una vez.
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

  const progreso = datos ? calcularProgresoGuia(datos.categorias) : null;
  const pct = progreso?.esencialPct ?? 0;
  const listo = progreso !== null && progreso.esencialTotal > 0 && progreso.esencialHechos === progreso.esencialTotal;

  // El instante en que se pasa de incompleto a listo, para celebrarlo una vez.
  // No se persiste: si recarga después, ya no hay un «antes» que comparar, y
  // eso es correcto — la enhorabuena es un momento, no un estado.
  const prevRef = useRef<number | null>(null);
  const [recienListo, setRecienListo] = useState(false);
  const hayDatos = progreso !== null;
  const hechos = progreso?.esencialHechos ?? 0;
  const totalEsencial = progreso?.esencialTotal ?? 0;
  useEffect(() => {
    if (!hayDatos || totalEsencial === 0) return;
    const prev = prevRef.current;
    if (prev !== null && prev < totalEsencial && hechos === totalEsencial) setRecienListo(true);
    prevRef.current = hechos;
  }, [hayDatos, hechos, totalEsencial]);

  if (!studio || !datos || !progreso) return null;
  const bloques = porNivel(progreso);
  const siguiente = progreso.siguiente;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/dashboard', label: 'Volver al inicio' }}
        title="Aprende a llevar tu estudio con Tentare"
        description="Quince capítulos que explican el producto entero. No hace falta hacerlos hoy, ni en orden — pero el orden está pensado."
      />

      {/* ── Lo primero: dónde estoy y qué hago ahora ──────────────────────── */}
      <div className={cn(
        'rounded-2xl border border-border bg-card p-6',
        recienListo && 'animate-in fade-in-0 zoom-in-95 duration-300',
      )}>
        <div className="flex items-center gap-6">
          <div className="flex-1 min-w-0">
            {listo ? (
              <>
                <p className="text-[15px] font-semibold text-foreground">Tu estudio ya puede recibir reservas</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Lo esencial está hecho. A partir de aquí, cada capítulo te quita trabajo de encima.
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-foreground">
                  Te faltan {totalEsencial - hechos} {totalEsencial - hechos === 1 ? 'cosa' : 'cosas'} para poder recibir reservas
                </p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Es lo único que corre prisa. El resto puede esperar a la semana que viene.
                </p>
              </>
            )}
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-4">
              <div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">{hechos} de {totalEsencial} · {pct}%</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listo ? '/ilustraciones/completado.svg' : '/ilustraciones/hero.svg'} alt="" className="hidden sm:block w-32 shrink-0" />
        </div>

        {/* Un solo siguiente paso, con su enlace. Mandarla a una lista a buscar
            cuál era lo siguiente es justo lo que hace que no vuelva. */}
        {siguiente && (
          <Link
            href={`/primeros-pasos/${siguiente.capitulo.id}`}
            className="mt-5 flex items-center gap-3 rounded-xl bg-brand px-4 py-3 text-brand-foreground hover:brightness-95 transition-all"
          >
            <BookOpen size={16} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold">Sigue por: {siguiente.capitulo.titulo}</span>
              {progreso.siguientePaso && (
                <span className="block text-[12px] opacity-80 truncate">{progreso.siguientePaso.label}</span>
              )}
            </span>
            <ArrowRight size={16} className="shrink-0" />
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          onClick={iniciarTour}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-[13px] font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <Play size={15} /> Ver un tour del panel (3 min)
        </button>
        <Link
          href="/explorar-funciones"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-[13px] font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <Compass size={15} /> Ver todas las funciones
        </Link>
      </div>

      {datos.recomendaciones.length > 0 && !listo && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Merece la pena mirar esto</p>
          {datos.recomendaciones.map(r => (
            <Link key={r.id} href={r.href} className="flex items-start gap-2 text-[13px] text-foreground hover:underline">
              <Lightbulb size={14} className="text-warning shrink-0 mt-[2px]" />
              <span>{r.texto}</span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Los capítulos, por nivel ──────────────────────────────────────── */}
      {bloques.map(({ nivel, capitulos }) => (
        <section key={nivel} className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ILUSTRACION_NIVEL[nivel]} alt="" className="w-10 h-10 object-contain shrink-0" />
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-foreground">{ETIQUETA_NIVEL[nivel]}</h2>
              <p className="text-[12px] text-muted-foreground">{EXPLICACION_NIVEL[nivel]}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-muted">
            {capitulos.map(c => <FilaCapitulo key={c.capitulo.id} item={c} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilaCapitulo({ item }: { item: CapituloConEstado }) {
  const { capitulo, estado, hechos, total } = item;

  // Un capítulo sin pasos (Conoce Tentare, Entiende tu negocio) NO lleva
  // círculo de tarea: no hay nada que completar, y marcarlo como pendiente
  // dejaría una guía imposible de terminar.
  const icono =
    estado === 'hecho' ? <CheckCircle2 size={18} className="text-brand-secondary shrink-0" />
    : estado === 'a-medias' ? <CircleDot size={18} className="text-brand-secondary shrink-0" />
    : estado === 'pendiente' ? <Circle size={18} className="text-[#D4D4CC] shrink-0" />
    : <BookOpen size={16} className="text-muted-foreground shrink-0" />;

  return (
    <Link
      href={`/primeros-pasos/${capitulo.id}`}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
    >
      {icono}
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{capitulo.numero}</span>
          <span className={cn('text-[13px] font-medium', estado === 'hecho' ? 'text-muted-foreground' : 'text-foreground')}>
            {capitulo.titulo}
          </span>
        </span>
        <span className="block text-[12px] text-muted-foreground mt-0.5">{capitulo.resumen}</span>
      </span>
      <span className="flex items-center gap-2.5 shrink-0">
        {estado === 'a-medias' && (
          <span className="text-[11px] font-semibold text-brand-secondary tabular-nums">{hechos}/{total}</span>
        )}
        <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock size={10} /> {capitulo.minutos} min
        </span>
        <ArrowRight size={14} className="text-muted-foreground" />
      </span>
    </Link>
  );
}
