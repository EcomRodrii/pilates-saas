'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Coins, Gift, TrendingUp, ChevronRight } from 'lucide-react';

export default function CreditosPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { rewardHistory, rewardCatalog, saldoCreditos } = useStudio();
  const socioId = session?.socioId;

  const saldo = socioId ? saldoCreditos(socioId) : 0;

  const historial = useMemo(() =>
    rewardHistory
      .filter(h => h.socioId === socioId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
  [rewardHistory, socioId]);

  const proximaRecompensa = useMemo(() => {
    const disponibles = rewardCatalog.filter(c => c.activo && c.costeCreditos > saldo);
    return disponibles.sort((a, b) => a.costeCreditos - b.costeCreditos)[0] ?? null;
  }, [rewardCatalog, saldo]);

  // Gráfico simple de progreso hacia la próxima recompensa (nada de charting
  // libs para esto — un arco de barra basta y no añade peso al bundle).
  const progresoProxima = proximaRecompensa
    ? Math.min(100, Math.round((saldo / proximaRecompensa.costeCreditos) * 100))
    : 100;

  const ultimos6Meses = useMemo(() => {
    const now = new Date();
    const meses: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const total = historial
        .filter(h => {
          const hd = new Date(h.creadoEn);
          return hd.getMonth() === d.getMonth() && hd.getFullYear() === d.getFullYear();
        })
        .reduce((s, h) => s + h.creditos, 0);
      meses.push({ label: d.toLocaleDateString('es-ES', { month: 'short' }), total });
    }
    return meses;
  }, [historial]);
  const maxMes = Math.max(...ultimos6Meses.map(m => m.total), 1);

  const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-8" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Coins size={16} className="text-white/60" />
          <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest">Mis créditos</p>
        </div>
        <p className="text-white text-[44px] font-extrabold leading-none tracking-tight">{saldo}</p>
        <p className="text-white/50 text-[13px] mt-1">créditos disponibles</p>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-5">
        {/* Próxima recompensa */}
        {proximaRecompensa && (
          <Link
            href={`/portal/${slug}/recompensas`}
            className="block bg-white rounded-3xl border border-black/[0.06] p-5 active:scale-[0.98] transition-transform"
            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">Próxima recompensa</p>
              <ChevronRight size={15} className="text-[#C7C7CC]" />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-[#FFF2F7] flex items-center justify-center text-[20px] shrink-0">
                {proximaRecompensa.icono}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-[#171717] truncate">{proximaRecompensa.nombre}</p>
                <p className="text-[12px] text-[#8E8E93]">{proximaRecompensa.costeCreditos - saldo} créditos más</p>
              </div>
            </div>
            <div className="h-2.5 bg-[#F1F1EC] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#FFC8E2] transition-all" style={{ width: `${progresoProxima}%` }} />
            </div>
          </Link>
        )}

        {/* Gráfico de progreso */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-[#8E8E93]" />
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">Créditos ganados por mes</p>
          </div>
          <div className="flex items-end justify-between gap-2 h-24">
            {ultimos6Meses.map(m => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-lg bg-[#FFC8E2] transition-all"
                    style={{ height: `${Math.max(4, Math.round((m.total / maxMes) * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#A8A89E] font-semibold capitalize">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Botón canjear */}
        <Link
          href={`/portal/${slug}/recompensas`}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FFC8E2] text-[#171717] font-bold text-[14px] active:scale-[0.98] transition-transform"
        >
          <Gift size={16} />Canjear créditos
        </Link>

        {/* Historial */}
        <div>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Historial</p>
          {historial.length === 0 ? (
            <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
              <p className="text-[14px] text-[#8E8E93]">Todavía no has ganado créditos — ¡ven a entrenar!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map(h => (
                <div key={h.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] flex items-center justify-center shrink-0">
                    <Coins size={16} className="text-[#059669]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#171717] truncate">{h.descripcion}</p>
                    <p className="text-[11px] text-[#8E8E93] mt-0.5">{formatFecha(h.creadoEn)}</p>
                  </div>
                  <p className="text-[15px] font-extrabold text-[#059669] shrink-0">+{h.creditos}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
