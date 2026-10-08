'use client';

import { useRef } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRol } from '@/lib/permisos';
import { cardCls } from '@/components/configuracion/estilos';
import { hrefDeSeccion, seccionesVisibles } from '@/lib/configuracion/destino';
import { VIDEO_DEMO, capitulosVisibles, formatoMinuto } from '@/lib/configuracion/demo';
import { seccionPorId, tarjetaPorId, type SeccionId, type TarjetaId } from '@/lib/configuracion/secciones';
import { esClicNormal, useNavegacionConfig } from '@/components/configuracion/shell/contexto';
import { FILA } from '@/components/configuracion/shell/fila-herramienta';

// La demo: el vídeo y, debajo, un capítulo por sección de Configuración. Cada
// capítulo salta al minuto del vídeo y lleva a la pantalla real, para hacer en
// la suya lo que acaba de ver. Lo que enseña cada rol es lo que ese rol puede
// abrir (la gerencia lleva la operación de su sede, no los cobros).
//
// El vídeo es de un estudio ficticio y vive fuera del repo (lib/configuracion/demo.ts).
export function SeccionDemo() {
  const rol = useRol();
  const nav = useNavegacionConfig();
  const video = useRef<HTMLVideoElement>(null);

  const visibles = seccionesVisibles(rol).map(s => s.id as SeccionId);
  const capitulos = capitulosVisibles(visibles);
  const hayVideo = VIDEO_DEMO.url !== null;

  function saltarA(seg: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = seg;
    void v.play().catch(() => {});
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section id="video-de-la-demo" aria-labelledby="demo-video" className="scroll-mt-32 space-y-2">
        <h3 id="demo-video" className="px-1 text-sm font-semibold text-foreground">{tarjetaPorId('video-de-la-demo').titulo}</h3>
        {hayVideo ? (
          <video
            ref={video}
            controls
            preload="metadata"
            playsInline
            poster={VIDEO_DEMO.portada ?? undefined}
            src={VIDEO_DEMO.url ?? undefined}
            className="aspect-video w-full rounded-xl border border-border bg-black"
          />
        ) : (
          <p className={cn(cardCls, 'px-4 py-3 text-sm text-muted-foreground text-pretty')}>
            El vídeo todavía no está publicado. Mientras tanto, cada capítulo te lleva a su pantalla para que puedas configurarla.
          </p>
        )}
        <p className="px-1 text-sm text-muted-foreground text-pretty">
          {tarjetaPorId('video-de-la-demo').frase} El estudio del vídeo es de ejemplo: no sale ninguna alumna real.
        </p>
      </section>

      <section aria-labelledby="demo-capitulos" className="space-y-2">
        <h3 id="demo-capitulos" className="px-1 text-sm font-semibold text-foreground">Capítulos</h3>
        <ul data-tarjeta-ajuste="" className={cn(cardCls, 'divide-y divide-border overflow-hidden')}>
          {(capitulos.length > 0 ? capitulos : visibles.filter(id => id !== 'demo').map(id => ({ seccion: id, inicioSeg: null, momentos: [] as const }))).map(c => {
            const s = seccionPorId(c.seccion);
            return (
              <li key={c.seccion} id={`capitulo-${c.seccion}`} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {hayVideo && c.inicioSeg !== null ? (
                    <button
                      type="button"
                      onClick={() => saltarA(c.inicioSeg!)}
                      aria-label={`Ver «${s.titulo}» en el vídeo, desde el minuto ${formatoMinuto(c.inicioSeg)}`}
                      className="mt-0.5 inline-flex min-h-9 w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-muted px-2.5 text-[13px] font-medium tabular-nums text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Play size={14} aria-hidden />
                      {formatoMinuto(c.inicioSeg)}
                    </button>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-foreground">{s.titulo}</span>
                    <span className="block text-sm text-muted-foreground text-pretty">{s.frase}</span>
                    <a
                      href={hrefDeSeccion(c.seccion)}
                      onClick={e => {
                        if (!nav || !esClicNormal(e)) return;
                        e.preventDefault();
                        nav.irA(c.seccion, { modo: 'push' });
                      }}
                      className={cn(FILA, 'mt-1 -mx-4 min-h-0 py-1.5 text-sm font-medium text-foreground')}
                    >
                      <span className="flex-1">Abrir «{s.titulo}»</span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    </a>
                  </span>
                </div>
                {hayVideo && c.momentos.length > 0 && (
                  <details className="mt-1 pl-0 sm:pl-[4.5rem]">
                    <summary className="cursor-pointer text-sm text-muted-foreground">Ir a un ajuste concreto</summary>
                    <ul className="mt-2 space-y-1">
                      {c.momentos.map(m => (
                        <li key={m.tarjeta}>
                          <button
                            type="button"
                            onClick={() => saltarA(m.inicioSeg)}
                            className="flex w-full min-h-9 items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{formatoMinuto(m.inicioSeg)}</span>
                            <span className="min-w-0 flex-1 text-foreground">{tarjetaPorId(m.tarjeta as TarjetaId).titulo}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
