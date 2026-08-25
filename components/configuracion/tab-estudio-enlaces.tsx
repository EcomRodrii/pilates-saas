'use client';

import { useState } from 'react';
import { Calendar as CalendarLinkIcon, Check, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { normalizarSlug, motivoSlugInvalido } from '@/lib/slug';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls, Toggle } from '@/app/(dashboard)/configuracion/page';
import { copiarAlPortapapeles } from '@/lib/utils';

// Los widgets embebibles (antes aquí) viven ahora en su propio tab de
// primer nivel — ver components/configuracion/tab-api.tsx.

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
            <ExternalLink size={14} className="text-muted-foreground shrink-0" />
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

      <TarjetaVisibilidadNetwork showToast={showToast} />
    </div>
  );
}

// Tentare Network F4 — opt-in al directorio público (`visible_en_network`,
// migr 20260824230506). Apagado por defecto: distinto de los enlaces de
// arriba, que solo los encuentra quien ya los tiene — este además pone al
// estudio delante de gente que todavía no lo conocía, así que lo enciende
// la propietaria a propósito, nunca por defecto. Mismo patrón de guardado
// inmediato al tocar el interruptor que el resto del panel (p. ej. los
// `Toggle` de tab-campos-personalizados.tsx), sin botón "Guardar" aparte.
function TarjetaVisibilidadNetwork({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const [guardando, setGuardando] = useState(false);
  const visible = studio?.visibleEnNetwork ?? false;

  async function cambiar(v: boolean) {
    if (guardando) return;
    setGuardando(true);
    const res = await updateStudio({ visibleEnNetwork: v });
    setGuardando(false);
    showToast(res.ok
      ? (v ? 'Tu estudio ya aparece en el directorio de Network' : 'Tu estudio ha dejado de aparecer en el directorio de Network')
      : res.error);
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">Tentare Network</h3>
      <p className="text-[12px] text-muted-foreground mb-3">
        El directorio donde alumnas e instructoras buscan estudios en Tentare.
      </p>
      <div className="flex items-start justify-between gap-3 px-3.5 py-3 rounded-xl border border-border">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Aparecer en el directorio público de Network</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
            Las alumnas podrán encontrar tu estudio buscando en Tentare Network,
            aunque no tengan todavía el enlace de tu página de reservas.
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <Toggle on={visible} onChange={cambiar} ariaLabel="Aparecer en el directorio público de Network" />
        </div>
      </div>
    </div>
  );
}

function EnlacePortalSocias({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const link = `${window.location.origin}/portal/${slug}`;
    if (!(await copiarAlPortapapeles(link))) {
      showToast('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
      return;
    }
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
        {copiado ? <Check size={14} className="text-success" /> : <Copy size={14} />}
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
