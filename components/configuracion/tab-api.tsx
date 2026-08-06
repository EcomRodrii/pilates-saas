'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

// Antes vivía escondido dentro de Estudio → Enlaces, una sub-pestaña que
// nadie mira buscando "cómo pongo Tentare en mi web". Movido a su propio
// tab de primer nivel porque es la única superficie de "API" que existe hoy
// — no hay claves ni endpoints públicos, solo estos widgets.
//
// Cada "widget" es la MISMA página pública de reservas de siempre
// (/reservar/[slug]), en modo compacto (?embed=1 esconde la cabecera/hero
// grandes) y abierta directamente en una de sus pestañas reales (?tab=…).
// Cero backend nuevo, cero maqueta: es la reserva, el calendario, "Mis
// reservas" y la ficha del estudio de siempre — solo cambia dónde se pintan.
// A propósito NO hay widget de vídeos ni de comunidad (ambos módulos están
// congelados, ver lib/frozen-features.ts) ni de tarjetas regalo (no existe
// esa función en el producto) — un widget que no hace nada de verdad es
// peor que no tenerlo.
const WIDGETS = [
  { tab: 'clases', nombre: 'Horario y reserva de clases', desc: 'El calendario en vivo. Reservan sin salir de tu web.', alto: 640 },
  { tab: 'citas', nombre: 'Citas', desc: 'Para servicios con hora concreta (valoraciones, sesiones 1 a 1...). Usa los servicios de cita que ya tengas configurados.', alto: 640 },
  { tab: 'misreservas', nombre: 'Mis reservas', desc: 'Para clientas ya dadas de alta: ven y cancelan sus reservas sin entrar en la app completa.', alto: 520 },
  { tab: 'estudio', nombre: 'El estudio', desc: 'Descripción, horario general y políticas — para tu página "Sobre nosotras".', alto: 480 },
] as const;

export function TabApi({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();

  if (!studio?.slug) return null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">API</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Pon Tentare en tu propia web: cuatro widgets, uno por cada cosa que
          hace tu estudio.
        </p>
      </div>
      <WidgetEmbebible slug={studio.slug} showToast={showToast} />
    </div>
  );
}

function WidgetEmbebible({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const [activo, setActivo] = useState<(typeof WIDGETS)[number]['tab']>('clases');
  const [copiado, setCopiado] = useState(false);
  const widget = WIDGETS.find(w => w.tab === activo)!;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `${origen}/reservar/${slug}?embed=1&tab=${widget.tab}`;
  // Id único por widget (no solo por estudio): una web puede embeber varios
  // widgets del mismo estudio a la vez (clases + citas), y el listener de
  // abajo necesita distinguir qué iframe redimensionar.
  const iframeId = `tentare-widget-${slug}-${widget.tab}`;
  // Auto-resize (audit de rendimiento): la página embebida avisa su altura
  // real por postMessage (ver useEffect de embedMode en
  // app/reservar/[slug]/page.tsx) — este script la escucha y ajusta el
  // iframe, así el contenido nunca queda cortado ni con hueco muerto. Se
  // incluye en el propio código a copiar porque un <iframe> suelto no puede
  // ejecutar nada en la página anfitriona.
  const codigo = `<iframe id="${iframeId}" src="${src}" style="width:100%;max-width:480px;height:${widget.alto}px;border:0;border-radius:12px;" title="${widget.nombre}"></iframe>
<script>window.addEventListener('message',function(e){if(e.data&&e.data.tentareEmbedAltura&&e.data.tentareSlug==='${slug}'){var f=document.getElementById('${iframeId}');if(f)f.style.height=e.data.tentareEmbedAltura+'px';}});</script>`;

  function copiar() {
    navigator.clipboard.writeText(codigo);
    setCopiado(true);
    showToast('Código copiado');
    setTimeout(() => setCopiado(false), 2000);
  }

  // Misma auto-resize para la vista previa DENTRO del panel — el listener de
  // arriba solo se activa en la web anfitriona una vez pegado el código.
  const previewRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.tentareEmbedAltura && e.data?.tentareSlug === slug && previewRef.current) {
        previewRef.current.style.height = `${Math.min(e.data.tentareEmbedAltura, 900)}px`;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [slug]);

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">Widgets para tu web</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Elige cuál quieres y pega su código en WordPress, Squarespace, Wix o
        una web hecha a mano.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {WIDGETS.map(w => (
          <button
            key={w.tab}
            onClick={() => setActivo(w.tab)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
              activo === w.tab ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {w.nombre}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">{widget.desc}</p>
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
        <div className="rounded-xl border border-border overflow-y-auto bg-muted/30" style={{ maxHeight: 640 }}>
          <iframe ref={previewRef} key={activo} src={src} title={`Vista previa: ${widget.nombre}`} className="w-full" style={{ border: 0, height: widget.alto }} />
        </div>
        <div className="min-w-0">
          <p className={labelCls}>Código para pegar en tu web</p>
          <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-foreground">{codigo}</pre>
          <button
            onClick={copiar}
            className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            {copiado ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            {copiado ? 'Copiado' : 'Copiar código'}
          </button>
        </div>
      </div>
    </div>
  );
}
