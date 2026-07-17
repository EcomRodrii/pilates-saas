'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { UserPlus, Copy, Check, Share2, Users } from 'lucide-react';

export default function InvitarPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const { socios, rewardRules, studio } = useStudio();
  const { t } = useModo();
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

  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20 };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 32px', background: t.hero, borderBottom: `1px solid ${t.heroLine}` }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <UserPlus size={22} style={{ color: t.heroAccent }} />
        </div>
        <h1 style={{ color: t.heroText, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Invita a una amiga</h1>
        <p style={{ color: t.heroSub, fontSize: 13, marginTop: 4 }}>
          {creditosPorAmiga > 0
            ? `Gana ${creditosPorAmiga} créditos por cada amiga que se una y reserve su primera clase.`
            : 'Comparte tu enlace y ayúdanos a crecer juntas.'}
        </p>
      </div>

      <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Link card */}
        <div style={{ ...card, padding: 16 }}>
          <p style={{ ...microLabel, marginBottom: 8 }}>Tu enlace personal</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 14, background: t.surface2, marginBottom: 12 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: t.muted2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
            <button onClick={copiarLink} style={{ flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: 'none' }}>
              {copiado ? <Check size={14} style={{ color: '#3E9B6C' }} /> : <Copy size={14} style={{ color: t.muted }} />}
            </button>
          </div>
          <button
            onClick={compartir}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 16, background: 'var(--portal-brand)', color: t.accentInk, fontSize: 13.5, fontWeight: 800, textTransform: 'uppercase', border: 'none' }}
          >
            <Share2 size={15} />
            Compartir invitación
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, background: 'rgba(217,119,6,0.1)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={18} style={{ color: t.heroAccent }} />
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 800, color: t.ink, lineHeight: 1 }}>{amigasReferidas.length}</p>
            <p style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>
              {amigasReferidas.length === 1 ? 'amiga se ha unido gracias a ti' : 'amigas se han unido gracias a ti'}
            </p>
          </div>
        </div>

        {/* Referred list */}
        {amigasReferidas.length > 0 && (
          <div>
            <p style={{ ...microLabel, marginBottom: 12 }}>Tus referidas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {amigasReferidas.map(a => (
                <div key={a.id} style={{ ...card, borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: t.heroAccent, flexShrink: 0 }}>
                    {a.nombre[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</p>
                    <p style={{ fontSize: 11, color: t.muted }}>
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
