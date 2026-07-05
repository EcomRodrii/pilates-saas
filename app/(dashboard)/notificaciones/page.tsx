'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  ExternalLink,
  UserPlus,
  Calendar,
  CalendarX,
  Clock,
  RefreshCw,
  ShoppingCart,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Notificacion, ActividadReciente } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${mins} minuto${mins !== 1 ? 's' : ''}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days !== 1 ? 's' : ''}`;
}

// ─── Notification icon ────────────────────────────────────────────────────────

function NotiIcon({ tipo, size = 16 }: { tipo: Notificacion['tipo']; size?: number }) {
  if (tipo === 'AVISO') return <AlertTriangle size={size} className="text-[#D97706]" />;
  if (tipo === 'ERROR') return <AlertCircle size={size} className="text-[#DC2626]" />;
  if (tipo === 'EXITO') return <CheckCircle size={size} className="text-[#059669]" />;
  return <Info size={size} className="text-[#7AA80E]" />;
}

function NotiIconBg({ tipo }: { tipo: Notificacion['tipo'] }) {
  const base = 'w-9 h-9 rounded-full flex items-center justify-center shrink-0';
  if (tipo === 'AVISO') return <div className={cn(base, 'bg-amber-50')}><AlertTriangle size={16} className="text-[#D97706]" /></div>;
  if (tipo === 'ERROR') return <div className={cn(base, 'bg-red-50')}><AlertCircle size={16} className="text-[#DC2626]" /></div>;
  if (tipo === 'EXITO') return <div className={cn(base, 'bg-emerald-50')}><CheckCircle size={16} className="text-[#059669]" /></div>;
  return <div className={cn(base, 'bg-blue-50')}><Info size={16} className="text-[#7AA80E]" /></div>;
}

// ─── Activity icon ────────────────────────────────────────────────────────────

function ActividadIcon({ tipo }: { tipo: ActividadReciente['tipo'] }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center shrink-0';
  switch (tipo) {
    case 'NUEVA_SOCIA':
      return <div className={cn(base, 'bg-emerald-50')}><UserPlus size={14} className="text-[#059669]" /></div>;
    case 'NUEVA_RESERVA':
      return <div className={cn(base, 'bg-blue-50')}><Calendar size={14} className="text-[#7AA80E]" /></div>;
    case 'CANCELACION':
      return <div className={cn(base, 'bg-red-50')}><CalendarX size={14} className="text-[#DC2626]" /></div>;
    case 'PAGO_COBRADO':
      return <div className={cn(base, 'bg-emerald-50')}><CheckCircle size={14} className="text-[#059669]" /></div>;
    case 'PAGO_PENDIENTE':
      return <div className={cn(base, 'bg-amber-50')}><Clock size={14} className="text-[#D97706]" /></div>;
    case 'NUEVA_SUSCRIPCION':
      return <div className={cn(base, 'bg-blue-50')}><RefreshCw size={14} className="text-[#7AA80E]" /></div>;
    case 'CITA_CREADA':
      return <div className={cn(base, 'bg-purple-50')}><Clock size={14} className="text-purple-600" /></div>;
    case 'VENTA_POS':
      return <div className={cn(base, 'bg-emerald-50')}><ShoppingCart size={14} className="text-[#059669]" /></div>;
    case 'MENSAJE_ENVIADO':
      return <div className={cn(base, 'bg-blue-50')}><Mail size={14} className="text-[#7AA80E]" /></div>;
    default:
      return <div className={cn(base, 'bg-[#F1F1EC]')}><Info size={14} className="text-[#8E8E86]" /></div>;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const { notificaciones, marcarNotificacionLeida, marcarTodasLeidas, actividadReciente } = useStudio();
  const [selected, setSelected] = useState<Notificacion | null>(null);

  const unreadCount = notificaciones.filter(n => !n.leida).length;

  function handleSelect(n: Notificacion) {
    setSelected(n);
    marcarNotificacionLeida(n.id);
  }

  return (
    <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Bandeja de entrada</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-[#7AA80E] text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={marcarTodasLeidas}
              className="px-4 py-2 rounded-lg bg-white border border-[#E7E7E0] text-[13px] font-medium text-[#8E8E86] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors"
            >
              Marcar todas leídas
            </button>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">

          {/* Left: notification list (40%) */}
          <div className="lg:w-[40%] space-y-1">
            {notificaciones.map(n => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                className={cn(
                  'w-full text-left rounded-xl border transition-all p-3 flex items-start gap-3',
                  selected?.id === n.id
                    ? 'border-[#1A1A1A] bg-white shadow-sm'
                    : n.leida
                    ? 'border-[#E7E7E0] bg-white hover:border-[#D1D5DB]'
                    : 'border-[#E7E7E0] bg-blue-50/40 hover:border-[#D1D5DB]'
                )}
              >
                {/* Unread dot */}
                <div className="mt-1 shrink-0 w-2 h-2 rounded-full transition-colors" style={{ background: n.leida ? 'transparent' : '#7AA80E' }} />

                <NotiIconBg tipo={n.tipo} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-[13px] leading-snug truncate',
                      n.leida ? 'font-medium text-[#1A1A1A]' : 'font-semibold text-[#1A1A1A]'
                    )}>
                      {n.titulo}
                    </p>
                    <span className="shrink-0 text-[11px] text-[#A8A89F]">{timeAgo(n.creadaEn)}</span>
                  </div>
                  <p className="text-[12px] text-[#8E8E86] mt-0.5 line-clamp-2 leading-relaxed">
                    {n.texto}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Right: detail view (60%) */}
          <div className="lg:w-[60%]">
            {selected ? (
              <div className="bg-white border border-[#E7E7E0] rounded-xl p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
                    selected.tipo === 'AVISO' && 'bg-amber-50',
                    selected.tipo === 'ERROR' && 'bg-red-50',
                    selected.tipo === 'EXITO' && 'bg-emerald-50',
                    selected.tipo === 'INFO' && 'bg-blue-50',
                  )}>
                    <NotiIcon tipo={selected.tipo} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[16px] font-semibold text-[#1A1A1A] leading-snug">
                      {selected.titulo}
                    </h2>
                    <p className="text-[12px] text-[#A8A89F] mt-1">{timeAgo(selected.creadaEn)}</p>
                  </div>
                </div>

                <p className="text-[14px] text-[#3A3A34] leading-relaxed mb-5">
                  {selected.texto}
                </p>

                {selected.enlace && (
                  <a
                    href={selected.enlace}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C6F94D] text-[#171717] text-[13px] font-medium hover:bg-[#BCEF3F] transition-colors"
                  >
                    Ver
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#E7E7E0] rounded-xl h-64 flex flex-col items-center justify-center gap-3 text-[#A8A89F]">
                <Mail size={32} strokeWidth={1.5} />
                <p className="text-[14px]">Selecciona una notificación</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-4">Actividad reciente</h2>
          <div className="bg-white border border-[#E7E7E0] rounded-xl divide-y divide-[#E7E7E0]">
            {actividadReciente.map((act, i) => (
              <div key={act.id} className="flex items-start gap-3 px-4 py-3">
                {/* Timeline line */}
                <div className="relative flex flex-col items-center">
                  <ActividadIcon tipo={act.tipo} />
                  {i < actividadReciente.length - 1 && (
                    <div className="w-px flex-1 bg-[#E7E7E0] mt-1" style={{ minHeight: 12 }} />
                  )}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-[13px] text-[#1A1A1A]">{act.texto}</p>
                  <p className="text-[12px] text-[#A8A89F] mt-0.5">{timeAgo(act.creadoEn)}</p>
                </div>

                {act.enlace && (
                  <a
                    href={act.enlace}
                    className="shrink-0 mt-1 text-[#A8A89F] hover:text-[#7AA80E] transition-colors"
                    title="Ver"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

    </div>
  );
}
