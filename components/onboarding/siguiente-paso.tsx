'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Siguiente paso» (P1.4): una banda arriba del contenido, justo después de
// hacer algo clave del arranque, que dice qué toca ahora y lleva al sitio.
//
// No decide nada: el paso hecho y el siguiente salen de `siguientePaso`
// (`lib/onboarding/arranque.ts`) sobre el MISMO progreso que la lista de
// arranque y /primeros-pasos. Como es función del estado (y el estado del panel
// solo cambia cuando el servidor confirma), no puede adelantarse al servidor, y
// desaparece sola cuando el dato existe.
//
// Solo JUSTO DESPUÉS: lo hecho al abrir el panel es la línea base, y la banda
// sale cuando un paso pasa a hecho después de eso. Sin ella salía en todas las
// pantallas durante días, y tras el asistente de alta celebraba unas salas que
// la propietaria no había creado (07 §3: «repetirse en cada visita»).
//
// Llega con `dynamic()` y solo para la propietaria de un estudio NUEVO (lo
// decide el armazón, `dashboard-shell.tsx`). Nunca dos a la vez, nunca con la
// visita o un tutorial abiertos, nunca en el Resumen ni en /primeros-pasos
// (ahí está la lista) ni en la pantalla a la que lleva. Descartada, no vuelve
// (por persona y estudio).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { useTutorial } from '@/lib/tutorial-context';
import { calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { calcularProgresoGuia } from '@/lib/guia/progreso';
import { claveSiguientePaso, guardarDescartados, leerDescartados, pasosHechos, siguientePaso } from '@/lib/onboarding/arranque';
import type { ProgresoGuia } from '@/lib/guia/progreso';

function almacen(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** La ruta (sin query ni ancla) de un enlace del panel. */
function rutaDe(href: string): string {
  return href.split(/[?#]/)[0];
}

/** Donde ya está la lista de arranque: la banda repetiría lo mismo. */
const CON_LISTA = new Set(['/dashboard', '/primeros-pasos']);

// Lo hecho la primera vez que esta persona vio este estudio en esta pestaña. En
// el módulo y no en el estado: si el panel vuelve a cargar los datos (cambio de
// sede y vuelta), la banda no debe tomar lo recién hecho por «ya estaba».
const LINEA_BASE = new Map<string, Set<string>>();
function lineaBaseDe(clave: string, progreso: ProgresoGuia): Set<string> {
  let base = LINEA_BASE.get(clave);
  if (!base) { base = pasosHechos(progreso); LINEA_BASE.set(clave, base); }
  return base;
}

export function SiguientePaso() {
  const { user } = useAuth();
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  } = useStudio();
  const tour = useTour();
  const tutorial = useTutorial();
  const pathname = usePathname();
  const clave = user?.id && studio?.id ? claveSiguientePaso(user.id, studio.id) : null;
  // Sin storage, lo descartado se recuerda mientras dure la sesión del panel.
  const [descartados, setDescartados] = useState(() => (clave ? leerDescartados(almacen(), clave) : new Set<string>()));

  if (!studio || !clave) return null;
  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  });
  const progreso = calcularProgresoGuia(calcularOnboarding(datos).categorias);
  // La línea base se toma ANTES de mirar si toca enseñarla: con un tutorial
  // abierto al llegar, tomarla después se tragaría lo hecho mientras tanto.
  const base = lineaBaseDe(clave, progreso);
  if (tour.activo || tutorial?.abierto) return null;
  const s = siguientePaso(progreso, descartados, base);
  if (!s || CON_LISTA.has(pathname) || pathname === rutaDe(s.siguiente.href)) return null;

  function descartar(id: string) {
    const nuevos = new Set(descartados).add(id);
    setDescartados(nuevos);
    if (clave) guardarDescartados(almacen(), clave, nuevos);
  }

  return (
    <section
      aria-label="Siguiente paso"
      data-testid="siguiente-paso"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground" aria-hidden>
        <Check size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted-foreground">{s.hecho.frase}</p>
        <p className="mt-0.5 text-[13px] text-foreground">
          <span className="font-semibold">Ahora: </span>
          <Link href={s.siguiente.href} className="inline-flex items-center gap-1 font-semibold text-brand-medio underline-offset-2 hover:underline">
            {s.siguiente.label} <ArrowRight size={13} aria-hidden />
          </Link>
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{s.siguiente.descripcion}</p>
      </div>
      <button
        type="button"
        onClick={() => descartar(s.siguiente.id)}
        aria-label="Ocultar este aviso"
        className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X size={14} className="text-muted-foreground" />
      </button>
    </section>
  );
}
