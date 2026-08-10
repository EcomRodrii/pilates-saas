'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
//
// "Reserva esta clase" es el 5º widget: mismo `tabParam` que el calendario
// (`clases`), pero con `&sesion=<id>` añadido — reusa el deep-link que YA
// existe en app/reservar/[slug]/page.tsx (pensado para el retorno del magic
// link), sin backend nuevo. `id` distingue las entradas en la UI de aquí
// (dos widgets pueden compartir `tabParam` sin colisionar).
const WIDGETS = [
  { id: 'clases', tabParam: 'clases', nombre: 'Horario y reserva de clases', desc: 'El calendario en vivo. Reservan sin salir de tu web.', alto: 640, requiereSesion: false },
  { id: 'citas', tabParam: 'citas', nombre: 'Citas', desc: 'Para servicios con hora concreta (valoraciones, sesiones 1 a 1...). Usa los servicios de cita que ya tengas configurados.', alto: 640, requiereSesion: false },
  { id: 'misreservas', tabParam: 'misreservas', nombre: 'Mis reservas', desc: 'Para clientas ya dadas de alta: ven y cancelan sus reservas sin entrar en la app completa.', alto: 520, requiereSesion: false },
  { id: 'estudio', tabParam: 'estudio', nombre: 'El estudio', desc: 'Descripción, horario general y políticas — para tu página "Sobre nosotras".', alto: 480, requiereSesion: false },
  { id: 'clase-concreta', tabParam: 'clases', nombre: 'Reserva esta clase', desc: 'Apunta directo a una clase concreta — para un post, una story o un newsletter, en vez de al calendario entero.', alto: 640, requiereSesion: true },
] as const;

export function TabApi({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();

  if (!studio?.slug) return null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">API</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Pon Tentare en tu propia web: cinco widgets, uno por cada cosa que
          hace tu estudio.
        </p>
      </div>
      <WidgetEmbebible slug={studio.slug} showToast={showToast} />
    </div>
  );
}

function WidgetEmbebible({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const { sesiones, tiposClase } = useStudio();
  const [activo, setActivo] = useState<(typeof WIDGETS)[number]['id']>('clases');
  const [copiado, setCopiado] = useState(false);
  const [sesionElegida, setSesionElegida] = useState('');
  // Compacto (480px, pensado para una barra lateral) vs ancho completo (100%
  // del contenedor anfitrión) — antes venía fijo a 480px sin más opción.
  const [anchoCompleto, setAnchoCompleto] = useState(false);
  const widget = WIDGETS.find(w => w.id === activo)!;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';

  // `Date.now()` no puede llamarse durante el render (regla de pureza del
  // React Compiler) — se fija tras montar, mismo patrón que `now` en
  // app/reservar/[slug]/page.tsx. No hace falta que se actualice sola: es
  // una pantalla de configuración, no el propio calendario en vivo.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: `Date.now()` no puede llamarse en render, así que se fija tras montar. El segundo render es el OBJETIVO.
    setAhora(Date.now());
  }, []);

  // Próximas sesiones del estudio, para el widget "Reserva esta clase" — mismo
  // dato que ya carga el resto del panel (useStudio), sin fetch nuevo.
  const tiposClasePorId = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  const proximasSesiones = useMemo(() => {
    if (ahora === null) return [];
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 50);
  }, [sesiones, ahora]);

  const maxWidth = anchoCompleto ? '100%' : '480px';
  const sesionQuery = widget.requiereSesion && sesionElegida ? `&sesion=${encodeURIComponent(sesionElegida)}` : '';
  const src = `${origen}/reservar/${slug}?embed=1&tab=${widget.tabParam}${sesionQuery}`;
  // Id único por widget (no solo por estudio): una web puede embeber varios
  // widgets del mismo estudio a la vez (clases + citas), y el listener de
  // abajo necesita distinguir qué iframe redimensionar. Para "Reserva esta
  // clase" hace falta ir un paso más allá: la propietaria puede embeber DOS
  // widgets de este tipo en la misma página (p. ej. un newsletter con 3
  // clases distintas) — sin la sesión en el id, ambos <iframe> compartirían
  // el mismo id y el auto-resize solo funcionaría para el primero.
  const iframeId = widget.requiereSesion
    ? `tentare-widget-${slug}-${widget.id}-${sesionElegida}`
    : `tentare-widget-${slug}-${widget.id}`;
  // Sin sesión elegida, "Reserva esta clase" no genera código — un widget
  // roto (calendario entero en vez de la clase concreta que se quería) es
  // peor que no ofrecer nada todavía, mismo criterio que ya usa este fichero
  // para no ofrecer vídeos/comunidad/tarjetas regalo.
  const listo = !widget.requiereSesion || sesionElegida !== '';
  // Auto-resize (audit de rendimiento): la página embebida avisa su altura
  // real por postMessage (ver useEffect de embedMode en
  // app/reservar/[slug]/page.tsx) — este script la escucha y ajusta el
  // iframe, así el contenido nunca queda cortado ni con hueco muerto. Se
  // incluye en el propio código a copiar porque un <iframe> suelto no puede
  // ejecutar nada en la página anfitriona.
  const codigo = `<iframe id="${iframeId}" src="${src}" style="width:100%;max-width:${maxWidth};height:${widget.alto}px;border:0;border-radius:12px;" title="${widget.nombre}"></iframe>
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
            key={w.id}
            onClick={() => setActivo(w.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
              activo === w.id ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {w.nombre}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">{widget.desc}</p>
      {widget.requiereSesion && (
        <div className="mb-4">
          <p className={labelCls}>Qué clase</p>
          <select
            value={sesionElegida}
            onChange={e => setSesionElegida(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
          >
            <option value="">Elige una clase próxima…</option>
            {proximasSesiones.map(s => {
              const tipo = tiposClasePorId.get(s.tipoClaseId);
              const fecha = new Date(s.inicio).toLocaleString('es-ES', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              });
              return (
                <option key={s.id} value={s.id}>
                  {tipo?.nombre ?? 'Clase'} — {fecha}
                </option>
              );
            })}
          </select>
          {proximasSesiones.length === 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">No hay clases próximas todavía — crea alguna en el calendario primero.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[12px] text-muted-foreground">Ancho:</span>
        <button
          onClick={() => setAnchoCompleto(false)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
            !anchoCompleto ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Compacto (480px)
        </button>
        <button
          onClick={() => setAnchoCompleto(true)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
            anchoCompleto ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Ancho completo
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
        <div className="rounded-xl border border-border overflow-y-auto bg-muted/30" style={{ maxHeight: 640 }}>
          {listo ? (
            <iframe ref={previewRef} key={`${activo}-${sesionElegida}`} src={src} title={`Vista previa: ${widget.nombre}`} className="w-full" style={{ border: 0, height: widget.alto }} />
          ) : (
            <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground text-center px-4">
              Elige una clase arriba para generar la vista previa.
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className={labelCls}>Código para pegar en tu web</p>
          {listo ? (
            <>
              <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-foreground">{codigo}</pre>
              <button
                onClick={copiar}
                className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                {copiado ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                {copiado ? 'Copiado' : 'Copiar código'}
              </button>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">Elige una clase arriba para generar el código.</p>
          )}
        </div>
      </div>
    </div>
  );
}
