'use client';

import { useState, useMemo, useId, useEffect, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import {
  Bell, MessageCircle, Send, Search, Check, CheckCheck,
  Info, AlertTriangle, CheckCircle2, XCircle, Users, ChevronRight, Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import type { Socio, LeadStage, DestinatariosCampana, TipoCampana } from '@/lib/types';
import { SEGMENTOS_AUDIENCIA, resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import { fetchNotificaciones, accionNotificacion, type NotifItem, type AmbitoNotif } from '@/lib/notifications/client';
import { ConversacionesTab } from '@/components/mensajeria/conversaciones-tab';
import { ComunidadFeed } from '@/components/comunidad/comunidad-feed';

// Misma fuente que la campana del topbar (components/notifications/notification-bell.tsx):
// tabla `notification` vía /api/notifications, ámbito `staff`. Antes esta
// pestaña leía `useStudio().notificaciones` (tabla legacy `notificaciones`,
// sin consumidor real del motor de avisos actual) y por eso nunca coincidía
// con lo que la campana mostraba de verdad.
const AMBITO_STAFF: AmbitoNotif = { ambito: 'staff' };

// P2 (auditoría "Veredicto de Marta"): mismas etiquetas de etapa que
// /clientas (app/(dashboard)/clientas/page.tsx) — un texto por rol en cada
// sitio sería fácil de dejar divergir.
const ETAPA_OPTIONS: { id: LeadStage; label: string }[] = [
  { id: 'LEAD', label: 'Lead (primer contacto)' },
  { id: 'INTERESADA', label: 'Interesada' },
  { id: 'PRUEBA', label: 'En prueba' },
  { id: 'ACTIVA', label: 'Activa (convertida)' },
  { id: 'EN_RIESGO', label: 'En riesgo' },
  { id: 'PERDIDA', label: 'Perdida' },
];

// La ficha COMPLETA, no un subconjunto a medida. `resolverDestinatariasCampana`
// mira `activo`, `tags`, `leadStage` y `fechaNacimiento` según el segmento: con
// un tipo recortado el compilador dejaba pasar un objeto sin `activo` y los
// segmentos «Solo socias activas» o «Cumpleañeras del mes» habrían devuelto
// cualquier cosa sin que nada avisara.
type SocioParaBroadcast = Socio;
type ModoDestinatario = 'todos' | 'etapa' | 'etiqueta' | 'persona';

type Tab = 'notificaciones' | 'comunidad' | 'conversaciones' | 'enviar';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

const PRIORIDAD_ICON = {
  CRITICA: { Icon: XCircle, color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
  ALTA: { Icon: AlertTriangle, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))' },
  MEDIA: { Icon: Info, color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 12%, var(--card))' },
  BAJA: { Icon: CheckCircle2, color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
  SILENCIOSA: { Icon: CheckCircle2, color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
} as const;

// ── Message composer ──────────────────────────────────────────────────────────

function Compositor({ socios }: { socios: SocioParaBroadcast[] }) {
  const uid = useId();
  // ⚠️ Esta pantalla mandaba los emails UNO A UNO desde el navegador
  // (`mapLimit(8)` sobre `/api/emails/send`) — sin filtro de consentimiento de
  // marketing, sin enlace de baja y sin quedar registrado en ninguna parte.
  // Para un aviso a una persona vale; para escribir a 300 socias es una
  // comunicación comercial, y esas dos cosas no son opcionales (RGPD art. 7.4,
  // LSSI). El motor que sí las hace ya existía entero (lib/inngest/campanas.ts:
  // por canal, con consentimiento, con baja y con acuse) — lo único que faltaba
  // era que esta pantalla, que es donde se busca «escribir a mis alumnas»,
  // llegara a él.
  //
  // El envío a UNA persona se queda como estaba, a propósito: un «te cambio la
  // clase del jueves» es transaccional, no comercial, y pasarlo por el filtro
  // de consentimiento lo haría desaparecer en silencio.
  const { addCampana, enviarCampana, suscripciones, recibos } = useStudio();

  const [canal, setCanal] = useState<TipoCampana>('EMAIL');
  const [modo, setModo] = useState<ModoDestinatario>('todos');
  const [segmentoSel, setSegmentoSel] = useState<DestinatariosCampana>('TODAS');
  const [etapaSel, setEtapaSel] = useState<LeadStage | ''>('');
  const [etiquetaSel, setEtiquetaSel] = useState('');
  const [personaSel, setPersonaSel] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: number; fallidos: number; enCola?: boolean } | null>(null);

  const etiquetasDisponibles = useMemo(
    () => Array.from(new Set(socios.flatMap(s => s.tags ?? []))).sort((a, b) => a.localeCompare(b, 'es')),
    [socios],
  );

  // El segmento tal y como lo entiende el motor de campañas. Es la MISMA
  // cadena que se guarda y que resuelve el envío en servidor: lo que se cuenta
  // aquí y lo que se manda allí no pueden divergir.
  const segmento: DestinatariosCampana | null = useMemo(() => {
    if (modo === 'persona') return null;
    if (modo === 'etapa') return etapaSel ? (`ETAPA:${etapaSel}` as DestinatariosCampana) : null;
    if (modo === 'etiqueta') return etiquetaSel ? (`ETIQUETA:${etiquetaSel}` as DestinatariosCampana) : null;
    return segmentoSel;
  }, [modo, segmentoSel, etapaSel, etiquetaSel]);

  // Recuento con el MISMO resolver del envío real. Ojo: aquí no se descuenta
  // el consentimiento (el panel no trae el texto guardado por socia, ver
  // `contarDestinatariasCampana` en studio-context) — por eso el aviso de
  // abajo dice que el número final puede ser menor, en vez de prometer uno
  // exacto que luego no se cumple.
  const destinatarias = useMemo(() => {
    if (modo === 'persona') return socios.filter(s => s.id === personaSel);
    if (!segmento) return [];
    const base = resolverDestinatariasCampana(segmento, { socios, suscripciones, recibos });
    return canal === 'EMAIL'
      ? base.filter(s => s.email && s.email.includes('@'))
      : base.filter(s => !!s.telefono?.trim());
  }, [modo, personaSel, segmento, socios, suscripciones, recibos, canal]);

  const esUnaPersona = modo === 'persona';
  const faltaAsunto = canal === 'EMAIL' && !asunto.trim();

  async function enviar() {
    if (faltaAsunto || !mensaje.trim() || destinatarias.length === 0 || enviando) return;
    setEnviando(true);
    setError(null);

    // Uno a uno: transaccional, como siempre.
    if (esUnaPersona) {
      const s = destinatarias[0];
      try {
        const res = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ tipo: 'automatizacion', to: s.email, toName: s.nombre, data: { titulo: asunto, mensaje } }),
        });
        setResultado({ ok: res.ok ? 1 : 0, fallidos: res.ok ? 0 : 1 });
      } catch {
        setResultado({ ok: 0, fallidos: 1 });
      } finally {
        setEnviando(false);
      }
      return;
    }

    // Muchas: campaña de verdad. Se crea, se busca por id y se encola — el
    // envío corre en servidor y esta pestaña no lo espera (se puede cerrar).
    const nombreCampana = (asunto.trim() || mensaje.trim().slice(0, 40)) || 'Mensaje a mis clientas';
    const res = await addCampana({
      nombre: nombreCampana,
      tipo: canal,
      asunto: asunto.trim(),
      contenido: mensaje.trim(),
      estado: 'BORRADOR',
      destinatarios: segmento ?? 'TODAS',
      enviadaEn: null,
      programadaEn: null,
    });
    if (!res.ok || !res.campana) {
      setError(res.ok ? 'La campaña se ha guardado pero no hemos podido encolarla. Inténtalo otra vez.' : res.error);
      setEnviando(false);
      return;
    }
    const envio = await enviarCampana(res.campana);
    setEnviando(false);
    if (!envio.ok) { setError(envio.error); return; }
    setResultado({ ok: destinatarias.length, fallidos: 0, enCola: true });
  }

  function reset() {
    setResultado(null);
    setError(null);
    setAsunto('');
    setMensaje('');
    setModo('todos');
    setSegmentoSel('TODAS');
    setEtapaSel('');
    setEtiquetaSel('');
    setPersonaSel('');
  }

  if (resultado) {
    const huboFallos = resultado.fallidos > 0;
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: huboFallos ? 'color-mix(in srgb, var(--warning) 12%, var(--card))' : 'color-mix(in srgb, var(--success) 12%, var(--card))' }}>
          <CheckCheck size={24} style={{ color: huboFallos ? 'var(--warning)' : 'var(--success)' }} />
        </div>
        <p className="font-bold text-foreground">
          {resultado.enCola
            ? `Saliendo hacia ${resultado.ok} clienta${resultado.ok !== 1 ? 's' : ''}`
            : resultado.ok > 0 ? 'Enviado' : 'No se pudo enviar'}
        </p>
        {resultado.enCola && (
          <p className="text-sm text-muted-foreground max-w-sm">
            Se está enviando desde el servidor: puedes cerrar esta pantalla. Quien no haya dado su
            consentimiento de marketing queda fuera, así que el número final puede ser menor.
          </p>
        )}
        {huboFallos && !resultado.enCola && (
          <p className="text-sm text-warning">
            No hemos podido enviarlo. Inténtalo de nuevo en unos minutos; si sigue fallando, escríbenos a soporte@tentare.app.
          </p>
        )}
        <button onClick={reset} className="text-xs font-semibold text-brand-medio hover:underline mt-2">Escribir otro mensaje</button>
      </div>
    );
  }

  const chip = (activo: boolean) =>
    `px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition-colors ${
      activo ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted/50'
    }`;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Cómo se lo mandas</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCanal('EMAIL')} aria-pressed={canal === 'EMAIL'} className={chip(canal === 'EMAIL')}>
            Email
          </button>
          <button
            type="button"
            onClick={() => { setCanal('WHATSAPP'); setModo(m => (m === 'persona' ? 'todos' : m)); }}
            aria-pressed={canal === 'WHATSAPP'}
            className={chip(canal === 'WHATSAPP')}
          >
            WhatsApp
          </button>
        </div>
        {canal === 'WHATSAPP' && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Solo llega a quien tenga teléfono guardado. Necesitas tu número conectado en{' '}
            <Link href="/configuracion?tab=integraciones" className="underline underline-offset-2">Integraciones</Link>.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${uid}-1`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">A quién</label>
        <select id={`${uid}-1`}
          value={modo}
          onChange={e => setModo(e.target.value as ModoDestinatario)}
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
        >
          <option value="todos">Un grupo de clientas…</option>
          <option value="etapa">Por etapa del embudo…</option>
          {etiquetasDisponibles.length > 0 && <option value="etiqueta">Por etiqueta…</option>}
          {canal === 'EMAIL' && <option value="persona">Una persona…</option>}
        </select>
        {modo === 'todos' && (
          <>
            <select
              value={segmentoSel}
              onChange={e => setSegmentoSel(e.target.value as DestinatariosCampana)}
              className="w-full mt-2 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
            >
              {SEGMENTOS_AUDIENCIA.map(seg => (
                <option key={seg.id} value={seg.id}>{seg.etiqueta}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              {SEGMENTOS_AUDIENCIA.find(s => s.id === segmentoSel)?.descripcion}
            </p>
          </>
        )}
        {modo === 'etapa' && (
          <select
            value={etapaSel}
            onChange={e => setEtapaSel(e.target.value as LeadStage | '')}
            className="w-full mt-2 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
          >
            <option value="">Elige una etapa</option>
            {ETAPA_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label} ({socios.filter(s => s.leadStage === o.id).length})
              </option>
            ))}
          </select>
        )}
        {modo === 'etiqueta' && (
          <select
            value={etiquetaSel}
            onChange={e => setEtiquetaSel(e.target.value)}
            className="w-full mt-2 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
          >
            <option value="">Elige una etiqueta</option>
            {etiquetasDisponibles.map(tag => (
              <option key={tag} value={tag}>
                {tag} ({socios.filter(s => (s.tags ?? []).includes(tag)).length})
              </option>
            ))}
          </select>
        )}
        {modo === 'persona' && (
          <select
            value={personaSel}
            onChange={e => setPersonaSel(e.target.value)}
            className="w-full mt-2 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
          >
            <option value="">Elige una clienta</option>
            {socios.map(s => (
              <option key={s.id} value={s.id}>{s.nombre} {s.apellidos}</option>
            ))}
          </select>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          {destinatarias.length === 0
            ? 'Nadie coincide con este filtro todavía.'
            : esUnaPersona
              ? `Se lo mandas solo a ${destinatarias[0].nombre}.`
              : `Llega a ${destinatarias.length} clienta${destinatarias.length === 1 ? '' : 's'}${canal === 'WHATSAPP' ? ' con teléfono' : ''} — menos las que no hayan dado su consentimiento de marketing.`}
        </p>
      </div>

      {canal === 'EMAIL' && (
        <div>
          <label htmlFor={`${uid}-2`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Asunto</label>
          <input id={`${uid}-2`}
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            placeholder="Ej. Nuevo horario de verano"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
          />
        </div>
      )}
      <div>
        <label htmlFor={`${uid}-3`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Mensaje</label>
        <textarea id={`${uid}-3`}
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={6}
          placeholder="Escribe el mensaje que recibirán tus clientas..."
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand resize-none"
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
        <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-sm">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            {esUnaPersona
              ? 'Aviso directo a una clienta, por email.'
              : 'Sale como campaña: lleva enlace de baja y no se manda a quien no haya dado su consentimiento.'}
          </span>
        </div>
        <button
          onClick={enviar}
          disabled={enviando || faltaAsunto || !mensaje.trim() || destinatarias.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Send size={14} />
          {enviando ? 'Enviando…' : esUnaPersona ? 'Enviar mensaje' : `Enviar a ${destinatarias.length}`}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Mensajeria() {
  const { socios } = useStudio();
  const [tab, setTab] = useState<Tab>('notificaciones');
  const [busqueda, setBusqueda] = useState('');

  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);

  const cargarNotif = useCallback(async () => {
    const { items, unread } = await fetchNotificaciones(authHeader, AMBITO_STAFF);
    setNotifItems(items); setNoLeidas(unread);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarNotif();
  }, [cargarNotif]);

  async function marcarLeida(n: NotifItem) {
    if (n.readAt != null) return;
    setNotifItems(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
    setNoLeidas(u => Math.max(0, u - 1));
    await accionNotificacion(authHeader, AMBITO_STAFF, 'read', n.id);
  }

  async function marcarTodasLeidas() {
    setNotifItems(prev => prev.map(x => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setNoLeidas(0);
    await accionNotificacion(authHeader, AMBITO_STAFF, 'read-all');
  }

  const notifFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase();
    return notifItems
      .filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notifItems, busqueda]);

  const TABS = [
    { id: 'notificaciones' as Tab, label: 'Notificaciones', icon: Bell, count: noLeidas },
    { id: 'comunidad' as Tab, label: 'Comunidad', icon: MessageCircle, count: 0 },
    { id: 'conversaciones' as Tab, label: 'Conversaciones', icon: Inbox, count: 0 },
    { id: 'enviar' as Tab, label: 'Enviar mensaje', icon: Send, count: 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensajería"
        description="Notificaciones, comunidad y conversaciones con tus alumnas"
        actions={
          <Link href="/clientas"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            <Users size={14} />
            Ver alumnas
          </Link>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setBusqueda(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={tab === t.id
              ? { backgroundColor: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: 'var(--muted-foreground)' }}>
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#B85436' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── NOTIFICACIONES ── */}
      {tab === 'notificaciones' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2 bg-muted border border-border rounded-xl px-3 py-2 flex-1">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar notificaciones..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
            </div>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted border border-border transition-colors shrink-0">
                <Check size={12} />
                Marcar todas leídas
              </button>
            )}
          </div>
          {notifFiltradas.length === 0 ? (
            <EmptyState compacto icono={Inbox} titulo="No hay notificaciones" />
          ) : (
            <ul className="divide-y divide-muted">
              {notifFiltradas.map(n => {
                const isRead = n.readAt != null;
                const { Icon, color, bg } = PRIORIDAD_ICON[n.priority] ?? PRIORIDAD_ICON.MEDIA;
                return (
                  <li key={n.id}
                    onClick={() => marcarLeida(n)}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-muted transition-colors cursor-pointer"
                    style={{ backgroundColor: isRead ? undefined : '#FAFBFF' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: bg }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
                        <p className={`text-sm leading-tight ${isRead ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>
                          {n.title}
                        </p>
                        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                      {n.deepLink && (
                        <Link href={n.deepLink} className="inline-flex items-center gap-1 text-xs text-brand-medio mt-1.5 hover:underline">
                          Ver más <ChevronRight size={10} />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── COMUNIDAD ──
          Mismo componente real que /comunidad (compositor, audiencia,
          likes/comentarios, lateral) — antes esta pestaña tenía su propia
          vista de solo lectura, congelada desde antes del rediseño visual,
          que nunca dejaba publicar ni interactuar. */}
      {tab === 'comunidad' && <ComunidadFeed />}

      {/* ── CONVERSACIONES ── */}
      {tab === 'conversaciones' && <ConversacionesTab />}

      {/* ── ENVIAR MENSAJE ── */}
      {tab === 'enviar' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <Compositor socios={socios} />
        </div>
      )}
    </div>
  );
}
