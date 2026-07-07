'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { UserPlus, Copy, Check, Share2, Users } from 'lucide-react';

export default function InvitarPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { socios, rewardRules, studio } = useStudio();
  const socioId = session?.socioId;
  const [copiado, setCopiado] = useState(false);

  const reglaReferidos = rewardRules.find(r => r.trigger === 'REFERIDO_AMIGO' && r.activa) ?? null;
  const creditosPorAmiga = reglaReferidos?.creditos ?? 0;

  const amigasReferidas = useMemo(
    () => socios.filter(s => s.referidoPor === socioId),
    [socios, socioId],
  );

  const link = typeof window !== 'undefined' && socioId
    ? `${window.location.origin}/reservar/${slug}?ref=${socioId}`
    : '';

  function copiarLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function compartir() {
    if (!link) return;
    const texto = `¡Únete a ${studio?.nombre ?? 'nuestro estudio'} conmigo! Reserva tu primera clase aquí:`;
    if (navigator.share) {
      try { await navigator.share({ title: studio?.nombre ?? 'Tentare', text: texto, url: link }); } catch { /* usuario canceló */ }
    } else {
      copiarLink();
    }
  }

  if (!socioId) return null;

  return (
    <div className="bg-white min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-8" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-3">
          <UserPlus size={22} className="text-white" />
        </div>
        <h1 className="text-white text-[22px] font-extrabold tracking-tight">Invita a una amiga</h1>
        <p className="text-white/50 text-[13px] mt-1">
          {creditosPorAmiga > 0
            ? `Gana ${creditosPorAmiga} créditos por cada amiga que se una y reserve su primera clase.`
            : 'Comparte tu enlace y ayúdanos a crecer juntas.'}
        </p>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-6">
        {/* Link card */}
        <div className="rounded-2xl p-4 border border-[#EDEDE6]" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-2">Tu enlace personal</p>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F5F5F1] mb-3">
            <span className="flex-1 text-[12.5px] text-[#5A5A52] truncate">{link}</span>
            <button onClick={copiarLink} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#EEEEE8]">
              {copiado ? <Check size={14} className="text-[#2E7D4F]" /> : <Copy size={14} className="text-[#8E8E86]" />}
            </button>
          </div>
          <button
            onClick={compartir}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#171717] text-white text-[13.5px] font-bold"
          >
            <Share2 size={15} />
            Compartir invitación
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 rounded-2xl p-4 bg-[#FFF2F7]">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0">
            <Users size={18} className="text-[#B57A8E]" />
          </div>
          <div>
            <p className="text-[20px] font-extrabold text-[#171717] leading-none">{amigasReferidas.length}</p>
            <p className="text-[12px] text-[#8E8E86] mt-1">
              {amigasReferidas.length === 1 ? 'amiga se ha unido gracias a ti' : 'amigas se han unido gracias a ti'}
            </p>
          </div>
        </div>

        {/* Referred list */}
        {amigasReferidas.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Tus referidas</p>
            <div className="space-y-2">
              {amigasReferidas.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl p-3 border border-[#EDEDE6]">
                  <div className="w-9 h-9 rounded-full bg-[#FFF2F7] flex items-center justify-center text-[12px] font-bold text-[#B57A8E] shrink-0">
                    {a.nombre[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{a.nombre}</p>
                    <p className="text-[11px] text-[#8E8E86]">
                      Se unió el {new Date(a.fechaAlta).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
