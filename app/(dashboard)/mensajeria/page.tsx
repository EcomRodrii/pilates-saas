'use client';

import { useState, useMemo } from 'react';
import { useStudio } from '@/lib/studio-context';
import {
  Inbox, Bell, MessageCircle, Send, Search, Check, CheckCheck,
  Info, AlertTriangle, CheckCircle, XCircle, Users, Heart, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

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

const TIPO_ICON = {
  INFO: { Icon: Info, color: '#1D4ED8', bg: '#DBEAFE' },
  AVISO: { Icon: AlertTriangle, color: '#B45309', bg: '#FEF3C7' },
  ERROR: { Icon: XCircle, color: '#B91C1C', bg: '#FEE2E2' },
  EXITO: { Icon: CheckCircle, color: '#15803D', bg: '#DCFCE7' },
} as const;

// ── Message composer ──────────────────────────────────────────────────────────

function Compositor({ socios }: { socios: { id: string; nombre: string; apellidos: string; email: string }[] }) {
  const [destinatario, setDestinatario] = useState<'todos' | string>('todos');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviado, setEnviado] = useState(false);

  function enviar() {
    if (!asunto.trim() || !mensaje.trim()) return;
    setEnviado(true);
    setTimeout(() => {
      setEnviado(false);
      setAsunto('');
      setMensaje('');
      setDestinatario('todos');
    }, 3000);
  }

  if (enviado) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#DCFCE7' }}>
          <CheckCheck size={24} style={{ color: '#15803D' }} />
        </div>
        <p className="font-bold text-[#15161B]">Mensaje enviado</p>
        <p className="text-sm text-[#71727A]">
          {destinatario === 'todos'
            ? `Enviado a todos los miembros (${socios.length})`
            : `Enviado a ${socios.find(s => s.id === destinatario)?.nombre ?? '—'}`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-[#71727A] mb-1.5 block">Destinatario</label>
        <select
          value={destinatario}
          onChange={e => setDestinatario(e.target.value)}
          className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] bg-white outline-none focus:border-[#6355FF]"
        >
          <option value="todos">Todos los miembros ({socios.length})</option>
          {socios.map(s => (
            <option key={s.id} value={s.id}>{s.nombre} {s.apellidos}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-[#71727A] mb-1.5 block">Asunto</label>
        <input
          value={asunto}
          onChange={e => setAsunto(e.target.value)}
          placeholder="Ej. Nuevo horario de verano"
          className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-[#71727A] mb-1.5 block">Mensaje</label>
        <textarea
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={6}
          placeholder="Escribe el mensaje que recibirán tus miembros..."
          className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF] resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-xs text-[#A2A3AC]">
          <Info size={12} />
          <span>El envío real requiere integración Resend (P6)</span>
        </div>
        <button
          onClick={enviar}
          disabled={!asunto.trim() || !mensaje.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40"
          style={{ backgroundColor: '#6355FF' }}
        >
          <Send size={14} />
          Enviar mensaje
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Mensajeria() {
  const { notificaciones, postsComunidad, socios } = useStudio();
  const [tab, setTab] = useState<Tab>('notificaciones');
  const [busqueda, setBusqueda] = useState('');

  const noLeidas = notificaciones.filter(n => !n.leida).length;
  const [leidas, setLeidas] = useState<Set<string>>(new Set());

  const notifFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase();
    return notificaciones
      .filter(n => !q || n.titulo.toLowerCase().includes(q) || n.texto.toLowerCase().includes(q))
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  }, [notificaciones, busqueda]);

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
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#15161B] tracking-tight">Mensajería</h1>
          <p className="text-sm font-medium mt-0.5 text-[#71727A]">
            Notificaciones, comunidad y comunicación con miembros
          </p>
        </div>
        <Link href="/socios"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#ECECF1] text-sm font-semibold text-[#3A3B44] hover:bg-gray-50 transition-colors">
          <Users size={14} />
          Ver miembros
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F1F1F6] p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setBusqueda(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={tab === t.id
              ? { backgroundColor: '#fff', color: '#15161B', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#71727A' }}>
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#EF4444' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── NOTIFICACIONES ── */}
      {tab === 'notificaciones' && (
        <div className="bg-white rounded-2xl border border-[#ECECF1] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECECF1]">
            <div className="flex items-center gap-2 bg-[#F4F4F8] border border-[#ECECF1] rounded-xl px-3 py-2 flex-1">
              <Search size={13} className="text-[#A2A3AC] shrink-0" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar notificaciones..."
                className="bg-transparent text-sm text-[#15161B] placeholder:text-[#A2A3AC] outline-none flex-1" />
            </div>
            {noLeidas > 0 && (
              <button onClick={() => setLeidas(new Set(notificaciones.map(n => n.id)))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#71727A] hover:bg-gray-50 border border-[#ECECF1] transition-colors shrink-0">
                <Check size={12} />
                Marcar todas leídas
              </button>
            )}
          </div>
          {notifFiltradas.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#A2A3AC]">No hay notificaciones</div>
          ) : (
            <ul className="divide-y divide-[#F1F1F6]">
              {notifFiltradas.map(n => {
                const isRead = n.leida || leidas.has(n.id);
                const { Icon, color, bg } = TIPO_ICON[n.tipo] ?? TIPO_ICON.INFO;
                return (
                  <li key={n.id}
                    onClick={() => setLeidas(prev => new Set([...prev, n.id]))}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    style={{ backgroundColor: isRead ? undefined : '#FAFBFF' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: bg }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-[#6355FF] shrink-0" />}
                        <p className={`text-sm leading-tight ${isRead ? 'font-medium text-[#3A3B44]' : 'font-bold text-[#15161B]'}`}>
                          {n.titulo}
                        </p>
                        <span className="ml-auto text-[11px] text-[#A2A3AC] shrink-0">{timeAgo(n.creadaEn)}</span>
                      </div>
                      <p className="text-xs text-[#71727A] mt-1 leading-relaxed">{n.texto}</p>
                      {n.enlace && (
                        <Link href={n.enlace} className="inline-flex items-center gap-1 text-xs text-[#6355FF] mt-1.5 hover:underline">
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
            <div className="flex items-center gap-2 bg-white border border-[#ECECF1] rounded-xl px-3 py-2 flex-1">
              <Search size={13} className="text-[#A2A3AC] shrink-0" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar en comunidad..."
                className="bg-transparent text-sm text-[#15161B] placeholder:text-[#A2A3AC] outline-none flex-1" />
            </div>
            <span className="text-xs text-[#A2A3AC]">{postsFiltrados.length} posts</span>
          </div>

          {postsFiltrados.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#ECECF1] py-16 text-center text-sm text-[#A2A3AC]">
              No hay posts en la comunidad
            </div>
          ) : (
            postsFiltrados.map(post => (
              <div key={post.id} className="bg-white rounded-2xl border border-[#ECECF1] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: '#6355FF' }}>
                    {post.autorInicial}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#15161B]">{post.autorNombre}</p>
                    <p className="text-[11px] text-[#A2A3AC]">{timeAgo(post.creadoEn)}</p>
                  </div>
                </div>
                <p className="text-sm text-[#3A3B44] leading-relaxed">{post.texto}</p>
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#F1F1F6]">
                  <button className="flex items-center gap-1.5 text-xs text-[#71727A] hover:text-red-500 transition-colors">
                    <Heart size={13} />
                    <span>{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-xs text-[#71727A] hover:text-[#6355FF] transition-colors">
                    <MessageCircle size={13} />
                    <span>{post.comentariosCount} comentarios</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ENVIAR MENSAJE ── */}
      {tab === 'enviar' && (
        <div className="bg-white rounded-2xl border border-[#ECECF1] p-6">
          <Compositor socios={socios} />
        </div>
      )}
    </div>
  );
}
