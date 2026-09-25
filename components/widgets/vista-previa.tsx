'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Monitor, Moon, Smartphone, Sun, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Segmentado } from './piezas';

// La vista previa. ⚠️ Nunca una imagen ni una maqueta: es el MISMO motor que
// verá la visitante —la página incrustada real en un iframe, o el componente
// real de la integración nativa— pintado al ancho REAL del dispositivo y
// escalado para caber en la columna. Un móvil es 390 px de verdad (con su
// maquetación de móvil), no la versión de escritorio encogida.

export type Dispositivo = 'escritorio' | 'tablet' | 'movil';

const ANCHO: Record<Dispositivo, number> = { escritorio: 1200, tablet: 820, movil: 390 };
const ALTO_VISIBLE_MAX = 720;
// La vista incrustada no mide nunca menos que el iframe que la contiene
// (`min-height: 100dvh` en /reservar): al cambiar de dispositivo se vuelve al
// alto inicial para que pueda encoger.

export type Contenido =
  | { tipo: 'iframe'; src: string; titulo: string; altoInicial: number; origen: string; slug: string }
  | { tipo: 'componente'; nodo: ReactNode };

export function VistaPrevia({ contenido, anchoWidget, abrirEn, dispositivo, onDispositivo }: {
  contenido: Contenido;
  /** Ancho máximo del widget dentro de la web (`null` = todo el ancho). */
  anchoWidget: number | null;
  /** Para «Abrir en una pestaña»: la URL real (sin el marcador de previa). */
  abrirEn?: string;
  dispositivo: Dispositivo;
  onDispositivo: (d: Dispositivo) => void;
}) {
  const [fondoWeb, setFondoWeb] = useState<'claro' | 'oscuro'>('claro');
  const marco = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(0);
  useLayoutEffect(() => {
    const el = marco.current;
    if (!el) return;
    const medir = () => setDisponible(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ancho = ANCHO[dispositivo];
  const escala = disponible > 0 ? Math.min(1, disponible / ancho) : 1;

  return (
    <section aria-label="Vista previa" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmentado
          etiqueta="Dispositivo de la vista previa"
          tamano="compacto"
          valor={dispositivo}
          onChange={onDispositivo}
          opciones={[
            { valor: 'escritorio', nombre: 'Escritorio', icono: <Monitor size={13} aria-hidden /> },
            { valor: 'tablet', nombre: 'Tablet', icono: <Tablet size={13} aria-hidden /> },
            { valor: 'movil', nombre: 'Móvil', icono: <Smartphone size={13} aria-hidden /> },
          ]}
        />
        <div className="flex items-center gap-1">
          <Segmentado
            etiqueta="Fondo de tu web en la vista previa"
            tamano="compacto"
            valor={fondoWeb}
            onChange={setFondoWeb}
            opciones={[
              { valor: 'claro', nombre: 'Web clara', icono: <Sun size={13} aria-hidden /> },
              { valor: 'oscuro', nombre: 'Web oscura', icono: <Moon size={13} aria-hidden /> },
            ]}
          />
          {abrirEn && (
            <a
              href={abrirEn}
              target="_blank"
              rel="noopener"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Abrir el widget en una pestaña nueva"
              title="Abrir en una pestaña nueva"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden border border-border shadow-sm',
          dispositivo === 'movil' ? 'mx-auto max-w-[430px] rounded-[30px] border-[6px] border-foreground/85' : dispositivo === 'tablet' ? 'rounded-[20px] border-[5px] border-foreground/80' : 'rounded-xl',
        )}
      >
        {dispositivo === 'escritorio' && (
          <div aria-hidden className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="ml-3 h-5 flex-1 max-w-72 rounded-md bg-background/80" />
          </div>
        )}
        <div
          ref={marco}
          className="overflow-y-auto overflow-x-hidden transition-colors"
          style={{ maxHeight: ALTO_VISIBLE_MAX, background: fondoWeb === 'oscuro' ? '#1C1D1A' : '#FFFFFF' }}
          data-vista-previa=""
        >
          <Lienzo ancho={ancho} escala={escala} anchoWidget={anchoWidget} dispositivo={dispositivo} contenido={contenido} />
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Es el widget real con tus datos de hoy: lo que ves aquí es lo que verá tu alumna.
      </p>
    </section>
  );
}

function Lienzo({ ancho, escala, anchoWidget, dispositivo, contenido }: {
  ancho: number;
  escala: number;
  anchoWidget: number | null;
  dispositivo: Dispositivo;
  contenido: Contenido;
}) {
  const interior = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(contenido.tipo === 'iframe' ? contenido.altoInicial : 400);
  const [cargando, setCargando] = useState(contenido.tipo === 'iframe');
  const iframe = useRef<HTMLIFrameElement>(null);

  // Cambiar de dispositivo o de widget: vuelta al alto inicial para que pueda
  // encoger (ver ALTO arriba).
  const clave = contenido.tipo === 'iframe' ? `${dispositivo}|${contenido.altoInicial}` : dispositivo;
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    if (contenido.tipo === 'iframe') setAlto(contenido.altoInicial);
  }

  // Iframe: la página incrustada anuncia su alto real. Solo se atiende a ESTE
  // iframe y a este estudio.
  const origen = contenido.tipo === 'iframe' ? contenido.origen : '';
  const slug = contenido.tipo === 'iframe' ? contenido.slug : '';
  useEffect(() => {
    if (!origen) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origen || e.source !== iframe.current?.contentWindow) return;
      if (e.data?.tentareSlug !== slug || !e.data?.tentareEmbedAltura) return;
      setAlto(Math.min(Number(e.data.tentareEmbedAltura) || 0, 6000));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origen, slug]);

  // Componente: se mide lo que ocupa de verdad.
  useEffect(() => {
    if (contenido.tipo !== 'componente' || !interior.current) return;
    const el = interior.current;
    const obs = new ResizeObserver(() => setAlto(el.scrollHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, [contenido.tipo]);

  // Un cambio de ajuste cambia el `src`: se recarga, y mientras tanto se dice.
  const src = contenido.tipo === 'iframe' ? contenido.src : null;
  const [srcAnterior, setSrcAnterior] = useState(src);
  if (src !== srcAnterior) {
    setSrcAnterior(src);
    if (src) setCargando(true);
  }

  const padding = dispositivo === 'movil' ? 0 : 24;
  return (
    <div style={{ height: alto * escala + padding * 2 * escala, position: 'relative' }}>
      <div
        style={{
          width: ancho, transform: `scale(${escala})`, transformOrigin: 'top left',
          position: 'absolute', top: 0, left: 0, padding,
        }}
      >
        <div ref={interior} style={{ width: '100%', maxWidth: anchoWidget ?? undefined, marginInline: 'auto' }}>
          {contenido.tipo === 'iframe' ? (
            <div className="relative">
              <iframe
                ref={iframe}
                src={contenido.src}
                title={`Vista previa: ${contenido.titulo}`}
                onLoad={() => setCargando(false)}
                allow="payment"
                style={{ display: 'block', width: '100%', height: alto, border: 0, borderRadius: dispositivo === 'movil' ? 0 : 12, background: 'transparent' }}
              />
              {cargando && (
                <div role="status" aria-live="polite" className="absolute inset-x-0 top-0 flex justify-center pt-6">
                  <span className="rounded-full bg-card/95 px-3 py-1 text-[12px] text-muted-foreground shadow-sm ring-1 ring-border">
                    Actualizando…
                  </span>
                </div>
              )}
            </div>
          ) : contenido.nodo}
        </div>
      </div>
    </div>
  );
}
