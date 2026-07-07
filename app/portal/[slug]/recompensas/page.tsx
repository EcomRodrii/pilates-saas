'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Coins, Lock, Check } from 'lucide-react';
import type { RewardCatalogItem } from '@/lib/types';

type EstadoTarjeta = 'DISPONIBLE' | 'BLOQUEADA' | 'CANJEADA';

export default function RecompensasPage() {
  const { session } = usePortalAuth();
  const { rewardCatalog, rewardRedemptions, saldoCreditos, canjearRecompensa } = useStudio();
  const socioId = session?.socioId;
  const saldo = socioId ? saldoCreditos(socioId) : 0;

  const [canjeando, setCanjeando] = useState<RewardCatalogItem | null>(null);
  const [error, setError] = useState('');
  const [exito, setExito] = useState<string | null>(null);

  if (!socioId) return null;
  const sid: string = socioId;

  function estadoDe(item: RewardCatalogItem): EstadoTarjeta {
    const yaCanjeada = rewardRedemptions.some(r => r.socioId === socioId && r.catalogItemId === item.id && r.estado !== 'CANCELADO');
    if (yaCanjeada && item.stock === 0) return 'CANJEADA';
    if (saldo < item.costeCreditos) return 'BLOQUEADA';
    if (item.stock != null && item.stock <= 0) return 'BLOQUEADA';
    return 'DISPONIBLE';
  }

  function confirmarCanje() {
    if (!canjeando) return;
    const result = canjearRecompensa(sid, canjeando.id);
    if ('error' in result) {
      setError(result.error);
    } else {
      setExito(canjeando.nombre);
      setTimeout(() => setExito(null), 2500);
    }
    setCanjeando(null);
  }

  const activos = rewardCatalog.filter(c => c.activo).sort((a, b) => a.costeCreditos - b.costeCreditos);

  return (
    <div className="bg-white min-h-full">
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Recompensas</h1>
        <div className="flex items-center gap-1.5 mt-1">
          <Coins size={13} className="text-white/60" />
          <p className="text-white/60 text-[13px]">{saldo} créditos disponibles</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-6">
        {exito && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#171717] text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg">
            <Check size={13} />Has canjeado {exito}
          </div>
        )}

        {activos.length === 0 ? (
          <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
            <p className="text-[14px] text-[#8E8E93]">Todavía no hay recompensas disponibles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {activos.map(item => {
              const estado = estadoDe(item);
              const bloqueada = estado === 'BLOQUEADA';
              const canjeada = estado === 'CANJEADA';
              return (
                <button
                  key={item.id}
                  disabled={bloqueada || canjeada}
                  onClick={() => { setError(''); setCanjeando(item); }}
                  className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col items-start gap-2 text-left active:scale-[0.97] transition-transform disabled:active:scale-100"
                  style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)', opacity: bloqueada ? 0.55 : 1 }}
                >
                  <div className="w-11 h-11 rounded-2xl bg-[#FFF2F7] flex items-center justify-center text-[20px]">
                    {item.icono}
                  </div>
                  <p className="text-[14px] font-bold text-[#171717] leading-tight">{item.nombre}</p>
                  {item.descripcion && <p className="text-[11px] text-[#8E8E93] leading-snug">{item.descripcion}</p>}
                  <div className="flex items-center gap-1 mt-1">
                    {canjeada ? (
                      <span className="text-[11px] font-bold text-[#059669] flex items-center gap-1"><Check size={12} />Canjeada</span>
                    ) : bloqueada ? (
                      <span className="text-[11px] font-bold text-[#A8A89E] flex items-center gap-1"><Lock size={11} />{item.costeCreditos} créditos</span>
                    ) : (
                      <span className="text-[11px] font-bold text-[#B57A8E] flex items-center gap-1"><Coins size={11} />{item.costeCreditos} créditos</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmar canje */}
      {canjeando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCanjeando(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-[#FFF2F7] flex items-center justify-center text-[26px] mb-3">
                {canjeando.icono}
              </div>
              <h2 className="text-[17px] font-bold text-[#171717]">¿Canjear {canjeando.nombre}?</h2>
              <p className="text-[13px] text-[#8E8E86] mt-1">Se descontarán {canjeando.costeCreditos} créditos de tu saldo.</p>
            </div>
            {error && <p className="text-[13px] text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setCanjeando(null)} className="flex-1 py-3 rounded-2xl border border-[#E7E7E0] text-[#3A3A34] text-[14px] font-semibold">
                Cancelar
              </button>
              <button onClick={confirmarCanje} className="flex-1 py-3 rounded-2xl bg-[#FFC8E2] text-[#171717] text-[14px] font-bold active:scale-[0.98] transition-transform">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
