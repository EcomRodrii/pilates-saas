'use client';

// La píldora «Paso n de 10» de la barra: la guía paso a paso siempre a un toque. Lleva a la
// explicación del paso que toca. No sale en el Resumen (ahí está la tarjeta entera), en la propia
// guía, en el chat de Tentare, con la visita guiada en marcha, ni con la lista oculta o terminada.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { RUTA_GUIA, hrefPaso } from '@/lib/guia/ruta-puesta-en-marcha';
import { useGuiaPasoAPaso } from './use-guia-paso-a-paso';

function Anillo({ hechas, total }: { hechas: number; total: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--muted)" strokeWidth="3" />
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--t-blue-500)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - hechas / total)} />
    </svg>
  );
}

export function PildoraGuia({ variante }: { variante: 'escritorio' | 'movil' }) {
  const { studio } = useStudio();
  const { ruta, ocultada } = useGuiaPasoAPaso();
  const pathname = usePathname();
  const { activo: visitaEnMarcha } = useTour();
  if (pathname === '/dashboard' || pathname === '/asistente' || pathname.startsWith(RUTA_GUIA)) return null;
  if (visitaEnMarcha || !studio || !ruta || ocultada || ruta.terminada || !ruta.ahora) return null;
  const t = ruta.ahora;
  return (
    <Link
      href={hrefPaso(t.id)}
      data-primeros-pasos-pildora=""
      data-variante={variante}
      aria-label={`Seguir con la guía: ${ruta.etiqueta}, ${t.titulo}`}
      className="zona-tactil mr-1 inline-flex h-9 max-w-[17rem] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Anillo hechas={ruta.hechos} total={ruta.total} />
      <span className="hidden min-w-0 truncate lg:inline">Siguiente: {t.titulo}</span>
      <span className="font-t-mono text-[12px] text-muted-foreground">{ruta.corto}</span>
      <ArrowRight size={14} aria-hidden className="text-muted-foreground" />
    </Link>
  );
}
