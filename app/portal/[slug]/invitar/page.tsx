'use client';

// INVITAR — "Invita a una amiga", programa de referidos. Destino del banner
// de Inicio (ya convertido a valores literales en portal-home-view.tsx).
//
// Valores literales del kit real ("Tentare Studio App", portal-app.css,
// `--ap-*`), mismo idioma que ya usan compras/mensajes/estudio: hex directo
// en vez de `useModo()`/`t.*`.
//
// ⚠️ Sin captura de referencia directa para esta pantalla (ninguna de las 20
// capturas de docs/diseno-referencia-portal/ cubre "Invitar" ni
// "Referidos") — tratamiento EXTRAPOLADO por consistencia con el resto del
// portal ya convertido (tarjeta `.ap-card`, icono en círculo suave como el
// vacío de Mensajes, botón `.ap-btn--primario`), no un calco 1:1 de un
// diseño visto.

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { UserPlus, Copy, Check, Share2, Users } from 'lucide-react';
import { copiarAlPortapapeles } from '@/lib/utils';
import { sans } from '@/lib/portal-design';

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

  async function copiarLink() {
    if (!link) return;
    // Solo se dice «copiado» si de verdad se copió: en Safari esto rechaza si
    // la llamada no cuelga de un gesto o falta el permiso. Si falla, el enlace
    // sigue en pantalla para copiarlo a mano — que es la salida que ya había.
    if (!(await copiarAlPortapapeles(link))) return;
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
    <div style={{ minHeight: '100%', background: '#FAF9F5', color: '#1A1A1A' }}>
      <div style={{ padding: '62px 20px 32px' }}>
        <div className="ap-label">{studio?.nombre ?? 'Tu estudio'}</div>

        <div
          style={{
            width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#EAF0E7', marginTop: 14, marginBottom: 14,
          }}
        >
          <UserPlus size={22} style={{ color: '#3E6B4A' }} aria-hidden />
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', color: '#1A1A1A' }}>Invita a una amiga</h1>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', marginTop: 10, lineHeight: 1.5 }}>
          {creditosPorAmiga > 0
            ? `Gana ${creditosPorAmiga} créditos por cada amiga que se una y reserve su primera clase.`
            : 'Comparte tu enlace y ayúdanos a crecer juntas.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 28 }}>
          {/* Enlace personal */}
          <div className="ap-card" style={{ padding: 16 }}>
            <p className="ap-label" style={{ marginBottom: 8 }}>Tu enlace personal</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 14, background: '#EFEDE4', marginBottom: 12 }}>
              <span style={{ flex: 1, fontFamily: sans, fontSize: 12, color: '#5A5A52', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {link}
              </span>
              <button
                type="button"
                onClick={copiarLink}
                aria-label="Copiar enlace"
                style={{
                  flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                {copiado ? <Check size={14} style={{ color: '#3E6B4A' }} /> : <Copy size={14} style={{ color: '#5A5A52' }} />}
              </button>
            </div>
            <button
              type="button"
              onClick={compartir}
              className="ap-btn ap-btn--primario"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Share2 size={15} />
              Compartir invitación
            </button>
          </div>

          {/* Contador de referidas */}
          <div className="ap-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#F6EEDD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={18} style={{ color: '#C99A3C' }} aria-hidden />
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', lineHeight: 1 }}>{amigasReferidas.length}</p>
              <p style={{ fontFamily: sans, fontSize: 11.5, color: '#5A5A52', marginTop: 4 }}>
                {amigasReferidas.length === 1 ? 'amiga se ha unido gracias a ti' : 'amigas se han unido gracias a ti'}
              </p>
            </div>
          </div>

          {/* Lista de referidas */}
          {amigasReferidas.length > 0 && (
            <div>
              <p className="ap-label" style={{ marginBottom: 12 }}>Tus referidas</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {amigasReferidas.map(a => (
                  <div key={a.id} className="ap-card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 999, background: '#EFEDE4', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#3E6B4A', flexShrink: 0,
                    }}>
                      {a.nombre[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.nombre}
                      </p>
                      <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>
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
    </div>
  );
}
