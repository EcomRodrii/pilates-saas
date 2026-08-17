'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeGestionarAppsOAuth } from '@/lib/permisos';
import { authHeader } from '@/lib/api-client';
import { labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';
import { copiarAlPortapapeles } from '@/lib/utils';
import { TabCrecimientoWeb } from '@/components/configuracion/tab-crecimiento-web';

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
//
// El 6º, "Calendario embebido", es de otra naturaleza: no es un <iframe> de
// /reservar/[slug] — es el bundle compilado aparte (public/widget.js, ver
// scripts/build-widget-bundle.mjs) que se monta DENTRO de la web del estudio
// (Shadow DOM, mismo componente <ReservaCalendario> que usan los iframes).
// `modo: 'script'` lo distingue de los otros cinco, que siguen siendo
// `modo: 'iframe'` (implícito) — el código a copiar y la vista previa se
// generan distinto más abajo.
const WIDGETS = [
  { id: 'clases', tabParam: 'clases', nombre: 'Horario y reserva de clases', desc: 'El calendario en vivo. Reservan sin salir de tu web.', alto: 640, requiereSesion: false, modo: 'iframe' },
  { id: 'citas', tabParam: 'citas', nombre: 'Citas', desc: 'Para servicios con hora concreta (valoraciones, sesiones 1 a 1...). Usa los servicios de cita que ya tengas configurados.', alto: 640, requiereSesion: false, modo: 'iframe' },
  { id: 'misreservas', tabParam: 'misreservas', nombre: 'Mis reservas', desc: 'Para clientas ya dadas de alta: ven y cancelan sus reservas sin entrar en la app completa.', alto: 520, requiereSesion: false, modo: 'iframe' },
  { id: 'estudio', tabParam: 'estudio', nombre: 'El estudio', desc: 'Descripción, horario general y políticas — para tu página "Sobre nosotras".', alto: 480, requiereSesion: false, modo: 'iframe' },
  { id: 'clase-concreta', tabParam: 'clases', nombre: 'Reserva esta clase', desc: 'Apunta directo a una clase concreta — para un post, una story o un newsletter, en vez de al calendario entero.', alto: 640, requiereSesion: true, modo: 'iframe' },
  { id: 'embed-script', tabParam: 'clases', nombre: 'Calendario embebido (sin iframe)', desc: 'El mismo calendario, pero integrado de verdad en tu web — sin marco, con tu tipografía alrededor. Requiere autorizar tu dominio abajo.', alto: 0, requiereSesion: false, modo: 'script' },
] as const;

// "Crecimiento web" vivía como pestaña propia de primer nivel (Fase 8) — se
// mueve aquí dentro porque es la misma superficie de negocio que "API": el
// widget público es el canal, esto es su cuadro de mando. Sub-navegación
// local (no el `sub` de page.tsx, que reconstruye la URL con `?tab=`): esta
// pantalla no tenía deep-link propio antes y no hace falta inventarlo ahora.
type Seccion = 'widgets' | 'crecimiento';

export function TabApi({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const rol = useRol();
  const [seccion, setSeccion] = useState<Seccion>('widgets');

  if (!studio?.slug) return null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">API</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Pon Tentare en tu propia web: seis widgets, uno por cada cosa que
          hace tu estudio, y qué tal les está yendo.
        </p>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => setSeccion('widgets')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
            seccion === 'widgets' ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Widgets
        </button>
        <button
          onClick={() => setSeccion('crecimiento')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
            seccion === 'crecimiento' ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Crecimiento web
        </button>
      </div>
      {seccion === 'widgets' ? (
        <>
          <WidgetEmbebible slug={studio.slug} showToast={showToast} />
          {puedeGestionarAppsOAuth(rol) && <AppsConectadas showToast={showToast} />}
        </>
      ) : (
        <TabCrecimientoWeb showToast={showToast} />
      )}
    </div>
  );
}

// Apps de terceros con acceso OAuth al estudio (Zapier, y quien se registre
// después). Solo PROPIETARIO/MANAGER — mismo criterio que quién puede
// autorizar la conexión (puedeGestionarAppsOAuth, ver lib/permisos-reglas.ts).
interface AppConectada {
  clienteId: string;
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  scopes: string[];
  otorgadoEn: string;
}

function AppsConectadas({ showToast }: { showToast: (m: string) => void }) {
  const [apps, setApps] = useState<AppConectada[] | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const headers = await authHeader();
      const res = await fetch('/api/oauth/consentimientos', { headers });
      if (!res.ok || cancelado) return;
      const data = await res.json();
      if (!cancelado) setApps(data.apps);
    })();
    return () => { cancelado = true; };
  }, []);

  async function revocar(clienteId: string) {
    setRevocando(clienteId);
    const headers = await authHeader();
    const res = await fetch('/api/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ clienteId }),
    });
    setRevocando(null);
    if (!res.ok) { showToast('No se pudo revocar el acceso'); return; }
    setApps(prev => (prev ?? []).filter(a => a.clienteId !== clienteId));
    showToast('Acceso revocado');
  }

  if (apps === null) return null;

  return (
    <div className={cn(cardCls, 'p-6')}>
      <div className="flex items-center gap-2 mb-1">
        <Plug size={15} className="text-muted-foreground" />
        <h3 className="text-[14px] font-semibold text-foreground">Aplicaciones conectadas</h3>
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">
        Apps de terceros (como Zapier) con permiso para acceder a los datos de tu estudio.
      </p>
      {apps.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Ninguna aplicación conectada todavía.</p>
      ) : (
        <div className="space-y-2">
          {apps.map(a => (
            <div key={a.clienteId} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{a.nombre}</p>
                <p className="text-[11px] text-muted-foreground truncate">{a.scopes.join(', ')}</p>
              </div>
              <button
                onClick={() => revocar(a.clienteId)}
                disabled={revocando === a.clienteId}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[12px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {revocando === a.clienteId ? 'Revocando…' : 'Revocar acceso'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetEmbebible({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const { sesiones, tiposClase, studio, updateStudio } = useStudio();
  const [activo, setActivo] = useState<(typeof WIDGETS)[number]['id']>('clases');
  const [copiado, setCopiado] = useState(false);
  const [sesionElegida, setSesionElegida] = useState('');
  // Compacto (480px, pensado para una barra lateral) vs ancho completo (100%
  // del contenedor anfitrión) — antes venía fijo a 480px sin más opción.
  const [anchoCompleto, setAnchoCompleto] = useState(false);
  // Fase 7 "Widget Experience Builder": `solo-pestana=1` ya existe y ya lo
  // respeta app/reservar/[slug]/page.tsx — solo faltaba un checkbox aquí para
  // activarlo sin editar el HTML a mano. Nace en `false` para no cambiar
  // ningún snippet ya pegado en una web real.
  const [soloEstaPestana, setSoloEstaPestana] = useState(false);
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
  const soloPestanaQuery = widget.modo !== 'script' && soloEstaPestana ? '&solo-pestana=1' : '';
  const src = `${origen}/reservar/${slug}?embed=1&tab=${widget.tabParam}${sesionQuery}${soloPestanaQuery}`;
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
  // para no ofrecer vídeos/comunidad/tarjetas regalo. Igual con el embebido
  // sin iframe: sin al menos un dominio autorizado, CORS lo bloqueará en
  // silencio en cuanto lo peguen — mejor no dar el código todavía.
  const dominiosAutorizados = studio?.widgetDominiosAutorizados ?? [];
  const listo = widget.modo === 'script'
    ? dominiosAutorizados.length > 0
    : !widget.requiereSesion || sesionElegida !== '';
  // Auto-resize (audit de rendimiento): la página embebida avisa su altura
  // real por postMessage (ver useEffect de embedMode en
  // app/reservar/[slug]/page.tsx) — este script la escucha y ajusta el
  // iframe, así el contenido nunca queda cortado ni con hueco muerto. Se
  // incluye en el propio código a copiar porque un <iframe> suelto no puede
  // ejecutar nada en la página anfitriona.
  // El bundle embebible (public/widget.js) NO usa iframe/postMessage — se
  // monta en Shadow DOM dentro de la propia página del estudio, así que su
  // código a copiar es un `<div>`+`<script>` sueltos, sin el listener de
  // auto-resize (no hace falta: es contenido normal de la página, no un
  // documento aparte con su propia altura que comunicar).
  const codigoScript = `<div data-tentare-booking data-studio="${slug}" data-color="TU-COLOR-HEX"></div>
<script src="${origen}/widget.js" async></script>`;
  const codigoIframe = `<iframe id="${iframeId}" src="${src}" style="width:100%;max-width:${maxWidth};height:${widget.alto}px;border:0;border-radius:12px;" title="${widget.nombre}"></iframe>
<script>window.addEventListener('message',function(e){if(e.data&&e.data.tentareEmbedAltura&&e.data.tentareSlug==='${slug}'){var f=document.getElementById('${iframeId}');if(f)f.style.height=e.data.tentareEmbedAltura+'px';}});</script>`;
  const codigo = widget.modo === 'script' ? codigoScript : codigoIframe;

  async function copiar() {
    if (!(await copiarAlPortapapeles(codigo))) {
      // Decir «copiado» y que no lo esté es peor que decir que no: se iría a su
      // web a pegar nada y daría por roto el widget.
      showToast('No se pudo copiar. Selecciona el código y cópialo a mano.');
      return;
    }
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
      {widget.modo === 'script' && (
        <GestionDominios
          dominios={dominiosAutorizados}
          onGuardar={dominios => updateStudio({ widgetDominiosAutorizados: dominios })}
          showToast={showToast}
        />
      )}
      {widget.modo !== 'script' && (
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
      )}
      {widget.modo !== 'script' && (
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Pestañas:</span>
          <button
            onClick={() => setSoloEstaPestana(false)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
              !soloEstaPestana ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            Todas
          </button>
          <button
            onClick={() => setSoloEstaPestana(true)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
              soloEstaPestana ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            Solo esta pestaña
          </button>
        </div>
        {soloEstaPestana && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Enseña solo esta pestaña, sin las otras cuatro — para cuando el
            widget va dentro de una sección de tu web y no quieres que la
            visitante se vaya a Mi cuenta sin querer.
          </p>
        )}
      </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
        <div className="rounded-xl border border-border overflow-y-auto bg-muted/30" style={{ maxHeight: 640 }}>
          {widget.modo === 'script' ? (
            <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground text-center px-4">
              Este widget vive dentro de TU web — no hay vista previa aquí.
              Pega el código y ábrela para verlo.
            </div>
          ) : listo ? (
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
              {widget.modo === 'script' && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Cambia <code className="font-mono">TU-COLOR-HEX</code> por el
                  color de marca de tu estudio (o quita el atributo entero para
                  usar el de Tentare por defecto).
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {widget.modo === 'script'
                ? 'Autoriza al menos un dominio arriba para generar el código.'
                : 'Elige una clase arriba para generar el código.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Lista blanca de orígenes para el bundle embebible (studios.widget_dominios_autorizados,
// lib/cors-widget.ts) — sin esto configurado, el navegador de cualquier
// visitante bloquea las peticiones del widget por CORS, en silencio (la
// consola del NAVEGADOR de la visitante, no algo que la propietaria vea).
function GestionDominios({ dominios, onGuardar, showToast }: {
  dominios: string[];
  onGuardar: (dominios: string[]) => Promise<{ ok: boolean; error?: string }>;
  showToast: (m: string) => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  function normalizar(valor: string): string | null {
    const v = valor.trim().replace(/\/+$/, '');
    if (!v) return null;
    try {
      const u = new URL(v.includes('://') ? v : `https://${v}`);
      return u.origin;
    } catch {
      return null;
    }
  }

  async function anadir() {
    const origenNuevo = normalizar(nuevo);
    if (!origenNuevo) { showToast('Escribe un dominio válido, p. ej. midominio.com'); return; }
    if (dominios.includes(origenNuevo)) { setNuevo(''); return; }
    setGuardando(true);
    const r = await onGuardar([...dominios, origenNuevo]);
    setGuardando(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar el dominio'); return; }
    setNuevo('');
  }

  async function quitar(origenAQuitar: string) {
    setGuardando(true);
    const r = await onGuardar(dominios.filter(d => d !== origenAQuitar));
    setGuardando(false);
    if (!r.ok) showToast(r.error ?? 'No se pudo quitar el dominio');
  }

  return (
    <div className="mb-4">
      <p className={labelCls}>Dominios autorizados</p>
      <p className="text-[11px] text-muted-foreground mb-2">
        Solo estas webs podrán cargar el widget — protege contra que otro sitio lo copie sin permiso.
      </p>
      {dominios.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {dominios.map(d => (
            <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-foreground bg-muted/40">
              {d}
              <button onClick={() => quitar(d)} disabled={guardando} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${d}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
          placeholder="midominio.com"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
        />
        <button
          onClick={anadir}
          disabled={guardando}
          className="px-3 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
