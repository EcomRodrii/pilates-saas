'use client';

import { useState } from 'react';
import { Calendar as CalendarLinkIcon, Check, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { normalizarSlug, motivoSlugInvalido } from '@/lib/slug';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Enlaces públicos — dos cosas DISTINTAS que se confundían bajo el mismo
// nombre "portal": la página de reservas (sin cuenta, para captar) y la app
// de socias (con cuenta, instalable). Antes solo se enseñaba la primera,
// llamándola "portal", y la segunda no se podía copiar desde ningún sitio
// del panel — la propietaria no tenía forma de dársela a sus alumnas salvo
// que ellas la encontraran solas navegando.
export function TabEstudioEnlaces({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Enlaces públicos</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Páginas de tu estudio para compartir con tus clientas.
        </p>
        {/* La dirección se generaba con el nombre al crear el estudio y no se
            podía cambiar nunca más: quien se rebautizaba se quedaba con la
            vieja. Y ni siquiera se veía escrita — solo había un enlace para
            abrirla. */}
        <DireccionPublica />
        <div className="space-y-2">
          {/* F4·E5: enlace derivado de la sede activa; sin slug no se pinta (nunca un /reservar/ roto). */}
          {studio?.slug && (
          <a
            href={`/reservar/${studio.slug}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <CalendarLinkIcon size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Página pública de reservas</p>
              <p className="text-[11px] text-muted-foreground">Sin cuenta: cualquiera reserva una clase suelta. El enlace para Instagram, la puerta, los folletos.</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
          )}
          {/* La app de socias (app/portal/[slug]) es OTRA cosa: instalable, con
              su bono/plan, vídeos y progreso. No tiene botón de "abrir" aquí
              porque sin sesión de socia no lleva a ningún sitio útil — lo que
              hace falta es copiar el enlace para pasárselo. */}
          {studio?.slug && <EnlacePortalSocias slug={studio.slug} showToast={showToast} />}
          {/* CONGELADO (feature-freeze PMF): se quitó el enlace "Modo quiosco" →
              /kiosk/[slug]. Ver lib/frozen-features.ts. */}
        </div>
      </div>

      {studio?.slug && <WidgetEmbebible slug={studio.slug} showToast={showToast} />}
    </div>
  );
}

// ─── Widgets para la web del estudio ─────────────────────────────────────────
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

function WidgetEmbebible({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const [activo, setActivo] = useState<(typeof WIDGETS)[number]['tab']>('clases');
  const [copiado, setCopiado] = useState(false);
  const widget = WIDGETS.find(w => w.tab === activo)!;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `${origen}/reservar/${slug}?embed=1&tab=${widget.tab}`;
  const codigo = `<iframe src="${src}" style="width:100%;max-width:480px;height:${widget.alto}px;border:0;border-radius:12px;" title="${widget.nombre}"></iframe>`;

  function copiar() {
    navigator.clipboard.writeText(codigo);
    setCopiado(true);
    showToast('Código copiado');
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">Widgets para tu web</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Cuatro widgets, uno por cada cosa que hace tu estudio — elige cuál
        quieres y pega su código en WordPress, Squarespace, Wix o una web
        hecha a mano.
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
        <div className="rounded-xl border border-border overflow-hidden bg-muted/30" style={{ aspectRatio: '3/4' }}>
          <iframe key={activo} src={src} title={`Vista previa: ${widget.nombre}`} className="w-full h-full" style={{ border: 0 }} />
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

function EnlacePortalSocias({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    const link = `${window.location.origin}/portal/${slug}`;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    showToast('Enlace copiado');
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border">
      <Smartphone size={15} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">App de tus alumnas</p>
        <p className="text-[11px] text-muted-foreground">Para clientas ya dadas de alta: reservan, ven su bono, vídeos y progreso. Se instala en el móvil.</p>
      </div>
      <button
        onClick={copiar}
        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
      >
        {copiado ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// ─── Dirección pública del estudio ───────────────────────────────────────────
//
// Cambiarla afecta a todo lo ya compartido: la bio de Instagram, el QR de la
// puerta, los folletos. Por eso se dice ANTES —no después— que la anterior va a
// seguir funcionando: sin esa frase, nadie con un negocio en marcha se atreve a
// tocar el botón, y con ella el cambio deja de dar miedo porque deja de ser
// irreversible.
function DireccionPublica() {
  const { studio } = useStudio();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La confirmación viaja en la URL y no en un efecto: leerla al pintar evita
  // un setState dentro de useEffect (cascada de renders) y además sobrevive a
  // la recarga sin guardar nada en ningún sitio.
  const hecho = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('direccion-anterior');

  const slug = studio?.slug ?? '';
  const propuesto = normalizarSlug(valor);
  // El aviso sale mientras se escribe y con la MISMA función que valida el
  // servidor: si no, se ve algo válido que luego se rechaza al guardar.
  const motivo = valor ? motivoSlugInvalido(propuesto) : null;

  function abrir() {
    setValor(slug); setError(null); setEditando(true);
  }

  async function guardar() {
    if (guardando || motivo || !propuesto) return;
    setGuardando(true); setError(null);
    try {
      const res = await fetch('/api/estudio/direccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ slug: propuesto }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) { setError(cuerpo?.error ?? 'No se ha podido cambiar la dirección.'); return; }
      // Se recarga en vez de tocar el estado a mano: el enlace de «Página
      // pública de reservas» de justo debajo se deriva de `studio.slug`, y
      // verlo con la dirección vieja después de cambiarla es exactamente la
      // confusión que este cambio venía a quitar. Cambiar la dirección
      // pública se hace una vez cada mucho; una recarga ahí no molesta a nadie.
      // `sub=enlaces` para aterrizar en ESTA sub-pestaña, no en la que esté
      // activa por defecto — si no, la confirmación de abajo no se vería.
      const anterior = encodeURIComponent(cuerpo?.anterior ?? '');
      window.location.href = `/configuracion?tab=estudio&sub=enlaces&direccion-anterior=${anterior}`;
      return;
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (!slug && !editando) return null;

  return (
    <div className="mb-4 rounded-xl border border-border p-4">
      <p className={cn(labelCls, 'mb-1')}>Dirección de tu página de reservas</p>

      {!editando ? (
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[12px] text-foreground bg-muted rounded-lg px-2 py-1 break-all">
            /reservar/{slug}
          </code>
          <button onClick={abrir} className="text-[12px] font-semibold underline text-muted-foreground hover:text-foreground">
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-muted-foreground shrink-0">/reservar/</span>
            <input
              aria-label="Dirección de tu página de reservas"
              className={inputCls}
              value={valor}
              onChange={e => { setValor(e.target.value); setError(null); }}
              placeholder="mi-estudio"
            />
          </div>
          {propuesto && propuesto !== valor && (
            <p className="text-[11px] text-muted-foreground">Quedará así: <b>/reservar/{propuesto}</b></p>
          )}
          {motivo && <p role="alert" className="text-[11px] text-destructive">{motivo}</p>}
          {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tu dirección actual <b>/reservar/{slug}</b> seguirá funcionando: quien
            entre por ella llegará igual a tu página de reservas. Nada de lo
            que ya has compartido deja de servir.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={guardar} disabled={guardando || !!motivo || !propuesto} className={cn(btnPrimary, 'disabled:opacity-60')}>
              {guardando ? 'Cambiando…' : 'Cambiar dirección'}
            </button>
            <button onClick={() => setEditando(false)} className={btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {hecho && (
        <p role="status" className="mt-2 text-[11px] text-muted-foreground">
          Hecho. <b>/reservar/{hecho}</b> sigue llevando aquí, así que los enlaces
          que ya habías compartido siguen funcionando.
        </p>
      )}
    </div>
  );
}
