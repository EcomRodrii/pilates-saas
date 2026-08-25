'use client';

import { useState, useMemo, useId, useEffect, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { mapLimit } from '@/lib/concurrency';
import {
  Bell, MessageCircle, Send, Search, Check, CheckCheck,
  Info, AlertTriangle, CheckCircle2, XCircle, Users, Heart, ChevronRight, Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import type { LeadStage } from '@/lib/types';
import { fetchNotificaciones, accionNotificacion, type NotifItem, type AmbitoNotif } from '@/lib/notifications/client';

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

type SocioParaBroadcast = { id: string; nombre: string; apellidos: string; email: string; leadStage?: LeadStage; tags?: string[] };
type ModoDestinatario = 'todos' | 'etapa' | 'etiqueta' | 'persona';

type Tab = 'notificaciones' | 'comunidad' | 'enviar';

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
  // P2 (auditoría "Veredicto de Marta"): antes solo "todas" o una persona —
  // sin forma de avisar solo a las "En riesgo" o solo a quienes llevan la
  // etiqueta "VIP". Reutiliza leadStage/tags, ya presentes en Socio y ya
  // filtrables en /clientas — mismo modelo, sin dato nuevo.
  const [modo, setModo] = useState<ModoDestinatario>('todos');
  const [etapaSel, setEtapaSel] = useState<LeadStage | ''>('');
  const [etiquetaSel, setEtiquetaSel] = useState('');
  const [personaSel, setPersonaSel] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; fallidos: number } | null>(null);

  const etiquetasDisponibles = useMemo(
    () => Array.from(new Set(socios.flatMap(s => s.tags ?? []))).sort((a, b) => a.localeCompare(b, 'es')),
    [socios],
  );

  const destinatarios = useMemo(() => {
    if (modo === 'persona') return socios.filter(s => s.id === personaSel);
    if (modo === 'etapa') return etapaSel ? socios.filter(s => s.leadStage === etapaSel) : [];
    if (modo === 'etiqueta') return etiquetaSel ? socios.filter(s => (s.tags ?? []).includes(etiquetaSel)) : [];
    return socios;
  }, [modo, socios, etapaSel, etiquetaSel, personaSel]);

  async function enviar() {
    if (!asunto.trim() || !mensaje.trim() || destinatarios.length === 0) return;
    setEnviando(true);
    // P0-33: concurrencia acotada en vez de un fetch por socio simultáneo (con
    // 200k socios, cientos de miles de promesas en vuelo cuelgan la pestaña y
    // saturan el backend de envío).
    const resultados = await mapLimit(destinatarios, 8, async s => {
      try {
        const res = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ tipo: 'automatizacion', to: s.email, toName: s.nombre, data: { titulo: asunto, mensaje } }),
        });
        return res.ok;
      } catch {
        return false;
      }
    });
    setResultado({ ok: resultados.filter(Boolean).length, fallidos: resultados.filter(r => !r).length });
    setEnviando(false);
  }

  function reset() {
    setResultado(null);
    setAsunto('');
    setMensaje('');
    setModo('todos');
    setEtapaSel('');
    setEtiquetaSel('');
    setPersonaSel('');
  }

  if (resultado) {
    const huboFallos = resultado.fallidos > 0;
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: huboFallos ? 'color-mix(in srgb, var(--warning) 12%, var(--card))' : 'color-mix(in srgb, var(--success) 12%, var(--card))' }}>
          <CheckCheck size={24} style={{ color: huboFallos ? 'var(--warning)' : 'var(--success)' }} />
        </div>
        <p className="font-bold text-foreground">
          {resultado.ok > 0 ? `Enviado a ${resultado.ok} miembro${resultado.ok !== 1 ? 's' : ''}` : 'No se pudo enviar'}
        </p>
        {huboFallos && (
          <p className="text-sm text-warning">
            {resultado.fallidos} envío{resultado.fallidos !== 1 ? 's' : ''} fallaron
            {resultado.ok === 0 ? ' — no hemos podido enviar ninguno. Inténtalo de nuevo en unos minutos; si sigue fallando, escríbenos a soporte@tentare.app.' : ''}
          </p>
        )}
        <button onClick={reset} className="text-xs font-semibold text-brand-medio hover:underline mt-2">Enviar otro mensaje</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <label htmlFor={`${uid}-1`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Destinatario</label>
        <select id={`${uid}-1`}
          value={modo}
          onChange={e => setModo(e.target.value as ModoDestinatario)}
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none focus:border-brand"
        >
          <option value="todos">Todas las clientas ({socios.length})</option>
          <option value="etapa">Por etapa del embudo…</option>
          {etiquetasDisponibles.length > 0 && <option value="etiqueta">Por etiqueta…</option>}
          <option value="persona">Una persona…</option>
        </select>
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
        {modo !== 'todos' && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {destinatarios.length === 0
              ? 'Nadie coincide con este filtro todavía.'
              : `Se enviará a ${destinatarios.length} clienta${destinatarios.length === 1 ? '' : 's'}.`}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${uid}-2`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Asunto</label>
        <input id={`${uid}-2`}
          value={asunto}
          onChange={e => setAsunto(e.target.value)}
          placeholder="Ej. Nuevo horario de verano"
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
        />
      </div>
      <div>
        <label htmlFor={`${uid}-3`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Mensaje</label>
        <textarea id={`${uid}-3`}
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={6}
          placeholder="Escribe el mensaje que recibirán tus miembros..."
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info size={12} />
          <span>Se envía por email a través de Resend</span>
        </div>
        <button
          onClick={enviar}
          disabled={enviando || !asunto.trim() || !mensaje.trim() || destinatarios.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Send size={14} />
          {enviando ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Mensajeria() {
  const { postsComunidad, socios } = useStudio();
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

  const postsFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return postsComunidad
      .filter(p => !q || p.texto.toLowerCase().includes(q) || p.autorNombre.toLowerCase().includes(q))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }, [postsComunidad, busqueda]);

  const TABS = [
    { id: 'notificaciones' as Tab, label: 'Notificaciones', icon: Bell, count: noLeidas },
    { id: 'comunidad' as Tab, label: 'Comunidad', icon: MessageCircle, count: 0 },
    { id: 'enviar' as Tab, label: 'Enviar mensaje', icon: Send, count: 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensajería"
        description="Notificaciones, comunidad y comunicación con miembros"
        actions={
          <Link href="/clientas"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            <Users size={14} />
            Ver miembros
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

      {/* ── COMUNIDAD ── */}
      {tab === 'comunidad' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 flex-1">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar en comunidad..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
            </div>
            <span className="text-xs text-muted-foreground">{postsFiltrados.length} posts</span>
          </div>

          {postsFiltrados.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border">
              <EmptyState compacto icono={MessageCircle} titulo="No hay posts en la comunidad" />
            </div>
          ) : (
            postsFiltrados.map(post => (
              <div key={post.id} className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: 'var(--brand)' }}>
                    {post.autorInicial}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{post.autorNombre}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(post.creadoEn)}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{post.texto}</p>
                {/* Son CONTADORES, no acciones: aquí no se da a me gusta ni se
                    comenta (eso pasa en el portal de la clienta). Estaban puestos
                    como <button> sin onClick, así que se veían pulsables y no
                    hacían nada. Al no ser botones ya no prometen lo que no
                    cumplen, y dejan de anunciarse como controles. */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-muted">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Heart size={14} aria-hidden="true" />
                    {post.likes} me gusta
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageCircle size={14} aria-hidden="true" />
                    {post.comentariosCount} comentarios
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ENVIAR MENSAJE ── */}
      {tab === 'enviar' && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <Compositor socios={socios} />
        </div>
      )}
    </div>
  );
}
