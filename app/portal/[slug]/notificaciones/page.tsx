'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { ChevronLeft, CheckCircle2, CreditCard } from 'lucide-react';
import { buildPortalNotifications, markPortalNotifsRead } from '@/lib/portal-notifications';

export default function NotificacionesPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { reservas, recibos, sesiones, tiposClase, instructores } = useStudio();

  const items = useMemo(() => {
    if (!session?.socioId) return [];
    return buildPortalNotifications({ socioId: session.socioId, reservas, recibos, sesiones, tiposClase, instructores });
  }, [session?.socioId, reservas, recibos, sesiones, tiposClase, instructores]);

  useEffect(() => {
    if (session?.socioId && items.length > 0) markPortalNotifsRead(session.socioId, items);
  }, [session?.socioId, items]);

  const grouped = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const groups: { label: string; items: typeof items }[] = [];
    for (const it of items) {
      const d = new Date(it.fecha);
      const dayKey = d.toISOString().slice(0, 10);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      const label = dayKey === todayKey ? 'Hoy' : diffDays <= 7 ? 'Esta semana' : 'Anteriores';
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(it);
      else groups.push({ label, items: [it] });
    }
    return groups;
  }, [items]);

  return (
    <div className="bg-[#F7F7F2] min-h-full">
      <div className="px-5 pt-6 pb-4 bg-white flex items-center gap-3 sticky top-0 z-10 border-b border-black/[0.04]">
        <button
          onClick={() => router.push(`/portal/${slug}/home`)}
          className="w-9 h-9 rounded-full bg-[#F1F1EC] flex items-center justify-center active:opacity-70 shrink-0"
        >
          <ChevronLeft size={18} className="text-[#171717]" />
        </button>
        <h1 className="text-[20px] font-extrabold text-[#171717] tracking-tight">Notificaciones</h1>
      </div>

      <div className="px-4 pt-4 pb-8 space-y-6">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-bold text-[#171717] text-[16px]">Sin novedades por ahora</p>
            <p className="text-[13px] text-[#8E8E93] mt-1">Aquí verás tus reservas y pagos.</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-2 px-1">{group.label}</p>
              <div className="space-y-2">
                {group.items.map(it => (
                  <div key={it.id} className="bg-white rounded-2xl p-4 flex gap-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${it.tipo === 'RESERVA' ? 'bg-green-50' : 'bg-[#FFF2F7]'}`}>
                      {it.tipo === 'RESERVA'
                        ? <CheckCircle2 size={18} className="text-green-600" />
                        : <CreditCard size={18} className="text-[#B57A8E]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#171717] leading-tight">{it.titulo}</p>
                      <p className="text-[13px] text-[#5A5A52] mt-0.5 leading-snug">{it.texto}</p>
                      <p className="text-[11px] text-[#A8A89E] mt-1.5">{formatRelative(it.fecha)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
