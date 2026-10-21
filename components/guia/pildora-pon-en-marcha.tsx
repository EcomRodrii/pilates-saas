'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La píldora «Primeros pasos · n/5» del alta nueva (PR-5), en el resto del panel
// nuevo: en el Resumen está la tarjeta entera (pon-en-marcha.tsx).
//
//   · Escritorio: en la barra de arriba; se abre al tocarla como un menú, solo
//     para esa pantalla, y se cierra con Esc, fuera o al cambiar de pantalla. Las
//     mismas reglas que la de siempre (nunca se abre sola, nunca flota encima
//     de un formulario).
//   · Móvil: en la cabecera; se abre en una hoja desde abajo, con «¿Te atascas?
//     Escríbenos por WhatsApp» (maqueta, «Móvil · Primeros pasos en hoja»).
//   · No sale con la visita guiada en marcha, con la lista oculta o terminada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { cn } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { AyudaPersona, ListaTareasAlta, ProgresoAlta } from './pon-en-marcha';
import { usePonEnMarcha } from './use-pon-en-marcha';

const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

/** El anillo de avance de la píldora (maqueta: «pill-pp»). */
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

export function PildoraPonEnMarcha({ variante }: { variante: 'escritorio' | 'movil' }) {
  const { studio } = useStudio();
  const { pasos, ocultada, omitir, estado } = usePonEnMarcha();
  const pathname = usePathname();
  const { activo: visitaEnMarcha } = useTour();
  const [abiertaEn, setAbiertaEn] = useState<string | null>(null);
  const [compartir, setCompartir] = useState(false);
  const abierta = abiertaEn === pathname;
  const caja = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const idTitulo = useId();

  // El menú de escritorio se cierra con Esc o tocando fuera (la hoja del móvil lo hace sola).
  useEffect(() => {
    if (!abierta || variante !== 'escritorio') return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbiertaEn(null); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbiertaEn(null); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierta, variante]);

  // En el Resumen está la tarjeta entera; el chat de Tentare ocupa toda la pantalla.
  if (pathname === '/dashboard' || pathname === '/asistente') return null;
  if (visitaEnMarcha || !studio || !pasos || ocultada || pasos.terminada) return null;

  const cerrar = () => setAbiertaEn(null);
  const alCompartir = () => { cerrar(); setCompartir(true); };

  const lista = (
    <>
      <ProgresoAlta pasos={pasos} />
      <ListaTareasAlta pasos={pasos} onCompartir={alCompartir} onOmitir={omitir} alNavegar={cerrar} compacta />
    </>
  );

  return (
    <div ref={caja} className="relative mr-1">
      <button
        type="button"
        data-primeros-pasos-pildora=""
        aria-expanded={abierta}
        aria-controls={abierta ? idMenu : undefined}
        onClick={() => setAbiertaEn(abierta ? null : pathname)}
        aria-label={`Abrir «Pon en marcha tu estudio»: ${pasos.hechas} de ${pasos.total} hechos`}
        className="zona-tactil inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Anillo hechas={pasos.hechas} total={pasos.total} />
        <span className="hidden sm:inline">Primeros pasos</span><span className="sm:hidden">Pasos</span>
        <span className="font-t-mono text-[12px] text-muted-foreground">{pasos.corto}</span>
        {variante === 'escritorio' && <ChevronDown size={14} aria-hidden className={cn('transition-transform', abierta && 'rotate-180')} />}
      </button>

      {abierta && variante === 'escritorio' && (
        <section
          id={idMenu}
          data-primeros-pasos-lista=""
          aria-labelledby={idTitulo}
          className="absolute right-0 top-full z-50 mt-2 max-h-[75vh] w-[360px] overflow-y-auto rounded-[16px] border border-border bg-card p-4 shadow-t-floating"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 id={idTitulo} className="text-[16px] font-bold leading-tight text-foreground">Pon en marcha tu estudio</h2>
            <button type="button" onClick={cerrar} aria-label="Plegar «Pon en marcha tu estudio»" className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          {lista}
          <Link href="/dashboard" onClick={cerrar} className="mt-3 inline-block text-[13px] font-medium text-[color:var(--t-text-link)] hover:underline">
            Ver la lista entera en el Resumen
          </Link>
        </section>
      )}

      {variante === 'movil' && (
        <DashboardSheet
          open={abierta}
          onClose={cerrar}
          label="Pon en marcha tu estudio"
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center"
          sheetClassName="bg-card w-full max-w-lg rounded-t-[24px] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl max-h-[88vh] overflow-y-auto"
        >
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border" />
          <div className="mb-3 flex items-start justify-between gap-3" data-primeros-pasos-lista="">
            <h2 className="text-[17px] font-bold leading-tight text-foreground">Pon en marcha tu estudio</h2>
            <button type="button" onClick={cerrar} aria-label="Cerrar «Pon en marcha tu estudio»" className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={18} />
            </button>
          </div>
          {lista}
          <AyudaPersona nombreEstudio={studio.nombre} compacta />
        </DashboardSheet>
      )}

      {compartir && studio.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartir(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(estado)}
        />
      )}
    </div>
  );
}
