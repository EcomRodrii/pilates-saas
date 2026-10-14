'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La ayuda de una pantalla en el panel nuevo, como el panel lateral de Bonsai
// (capturas b-64/b-65): arriba, qué es en una frase destacada; luego los pasos
// rápidos, lo que te quita de encima, las guías de la sección y, al pie, que te
// responde una persona.
//
// No se escribe nada nuevo: todo sale de lo que ya existe y ya se ha comprobado.
// La ficha de la pantalla (`lib/ayuda/pantallas.ts`), los pasos de su tutorial
// (`tutoriales-pasos.ts`, los mismos que enseña «Cómo funciona») y los artículos
// publicados del centro de ayuda de su categoría (`registro.ts`).
//
// Llega con `dynamic()` desde el ⓘ: estos textos no viajan en el chunk de cada
// pantalla (la misma regla que la tarjeta del tutorial).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { ArrowUpRight, CirclePlay, Lightbulb, ListChecks, BookOpen, X } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { urlDeAyuda, tutorialDePantalla, type AyudaPantalla } from '@/lib/ayuda/pantallas';
import { PASOS_TUTORIAL, pasosVisibles } from '@/lib/ayuda/tutoriales-pasos';
import { articulosPublicadosDe, urlArticulo } from '@/lib/ayuda/registro';
import { useTutorial } from '@/lib/tutorial-context';
import { usePermisos } from '@/lib/permisos';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/components/layout/whatsapp-fab';
import { WhatsAppIcon } from '@/components/icons/brand-icons';

export function CajonAyuda({ ayuda, ruta, abierto, onCerrar }: {
  ayuda: AyudaPantalla;
  ruta: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { rol } = usePermisos();
  const tutorial = useTutorial();
  const conTutorial = tutorialDePantalla(ruta);
  const pasos = conTutorial
    ? pasosVisibles(PASOS_TUTORIAL[conTutorial.ruta], { escritorio: true, moverDinero: puedeMoverDinero(rol) })
    : [];
  // La guía de la ficha primero; luego el resto de su categoría.
  const guias = articulosPublicadosDe(ayuda.destino.categoria)
    .sort((a, b) => Number(b.slug === ayuda.destino.slug) - Number(a.slug === ayuda.destino.slug))
    .slice(0, 6);
  const soporte = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, tengo una duda con «${ayuda.titulo}» en Tentare:`);

  return (
    <DashboardDrawer open={abierto} onClose={onCerrar} label={`Ayuda: ${ayuda.titulo}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-[18px] font-bold text-foreground">{ayuda.titulo}</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la ayuda"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <p
          className="rounded-[12px] border-l-[3px] px-4 py-3 text-[14px] leading-relaxed text-foreground text-pretty"
          style={{ borderColor: 'var(--t-blue-500)', backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 9%, var(--card))' }}
        >
          {ayuda.resumen}
        </p>

        {pasos.length > 0 && (
          <section aria-labelledby="ayuda-pasos">
            <h3 id="ayuda-pasos" className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <ListChecks size={16} aria-hidden style={{ color: 'var(--t-blue-500)' }} /> Pasos rápidos
            </h3>
            <ol className="mt-3 space-y-2.5">
              {pasos.map((p, i) => (
                <li key={`${p.selector}-${i}`} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: 'var(--t-blue-500)' }}>{i + 1}</span>
                  <span className="min-w-0 text-[13.5px] leading-snug text-foreground text-pretty">
                    <span className="font-semibold">{p.titulo}.</span> <span className="text-muted-foreground">{p.texto}</span>
                  </span>
                </li>
              ))}
            </ol>
            {conTutorial && tutorial && (
              <button
                type="button"
                onClick={() => { onCerrar(); tutorial.abrir(conTutorial.ruta); }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <CirclePlay size={15} aria-hidden style={{ color: 'var(--t-magenta-500)' }} /> Enséñamelo en la pantalla
              </button>
            )}
          </section>
        )}

        <section aria-labelledby="ayuda-ahorra">
          <h3 id="ayuda-ahorra" className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <Lightbulb size={16} aria-hidden style={{ color: 'var(--warning)' }} /> Te quita de encima
          </h3>
          <p className="mt-2.5 rounded-[12px] border-l-[3px] bg-card px-4 py-3 text-[13.5px] leading-relaxed text-foreground text-pretty" style={{ borderColor: 'var(--success)' }}>
            {ayuda.ahorra}
          </p>
        </section>

        {guias.length > 0 && (
          <section aria-labelledby="ayuda-guias">
            <h3 id="ayuda-guias" className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <BookOpen size={16} aria-hidden style={{ color: 'var(--t-blue-500)' }} /> Guías paso a paso
            </h3>
            <ul className="mt-2.5 space-y-2">
              {guias.map(a => (
                <li key={a.slug}>
                  <Link
                    href={urlArticulo(a)}
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-4 py-3 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 text-pretty">{a.titulo}</span>
                    <ArrowUpRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={urlDeAyuda({ categoria: ayuda.destino.categoria })} className="mt-2.5 inline-block text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
              Ver todas las guías de esta parte
            </Link>
          </section>
        )}
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="text-[13px] font-semibold text-foreground">¿Sigues con dudas?</p>
        <p className="text-[12.5px] text-muted-foreground">Te responde una persona, no una IA.</p>
        {soporte && (
          <a
            href={soporte}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <WhatsAppIcon size={16} /> Escríbenos por WhatsApp
          </a>
        )}
      </div>
    </DashboardDrawer>
  );
}
