'use client';

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { CategoriaVideo, NivelClase, VideoOnDemand } from '@/lib/types';
import { urlIframeStream } from '@/lib/stream-playback';
import { useModo } from '@/lib/portal-modo';
import { X, Play, Clock, Eye } from 'lucide-react';

const CATEGORIAS: { value: CategoriaVideo | 'TODOS'; label: string; emoji: string }[] = [
  { value: 'TODOS', label: 'Todos', emoji: '✨' },
  { value: 'REFORMER', label: 'Reformer', emoji: '🛏️' },
  { value: 'MAT', label: 'Mat', emoji: '🧘' },
  { value: 'BARRE', label: 'Barre', emoji: '🩰' },
  { value: 'CARDIO', label: 'Cardio', emoji: '🏃' },
  { value: 'MEDITACION', label: 'Meditación', emoji: '🌙' },
  { value: 'ESTIRAMIENTO', label: 'Estiramiento', emoji: '🌿' },
];

const GRADIENTS: Record<CategoriaVideo, string> = {
  REFORMER: 'linear-gradient(135deg, #1A1A1A, var(--portal-brand-secondary))',
  MAT: 'linear-gradient(135deg, #059669, #10B981)',
  BARRE: 'linear-gradient(135deg, #EC4899, #F472B6)',
  CARDIO: 'linear-gradient(135deg, #EF4444, #F97316)',
  MEDITACION: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
  ESTIRAMIENTO: 'linear-gradient(135deg, #0EA5E9, #38BDF8)',
};

const NIVEL_LABEL: Record<NivelClase, string> = {
  TODOS: 'Todos', PRINCIPIANTE: 'Inicio', MEDIO: 'Medio', AVANZADO: 'Avanzado',
};
const NIVEL_COLOR: Record<NivelClase, string> = {
  TODOS: '#8E8E86', PRINCIPIANTE: '#059669', MEDIO: '#D97706', AVANZADO: '#DC2626',
};

export default function VideosPage() {
  const { videosOnDemand, instructores } = useStudio();
  const { t } = useModo();
  const [cat, setCat] = useState<CategoriaVideo | 'TODOS'>('TODOS');
  const [selected, setSelected] = useState<VideoOnDemand | null>(null);
  const [avisoPendiente, setAvisoPendiente] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);

  const filtrados = cat === 'TODOS'
    ? videosOnDemand.filter(v => v.activo)
    : videosOnDemand.filter(v => v.activo && v.categoria === cat);

  const totalVistas = videosOnDemand.reduce((s, v) => s + v.vistas, 0);

  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20 };
  const NIVEL_BG: Record<NivelClase, string> = {
    TODOS: t.surface2, PRINCIPIANTE: 'rgba(5,150,105,0.15)', MEDIO: 'rgba(217,119,6,0.15)', AVANZADO: 'rgba(220,38,38,0.15)',
  };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '24px 20px 16px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Vídeos</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{videosOnDemand.filter(v => v.activo).length} videos · {totalVistas} visualizaciones</p>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' } as React.CSSProperties}>
          {CATEGORIAS.map(c => {
            const active = cat === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 16, fontSize: 12, fontWeight: 800,
                  border: `1px solid ${active ? 'var(--portal-brand)' : t.line}`, background: active ? 'var(--portal-brand)' : t.surface, color: active ? t.accentInk : t.muted,
                }}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '0 16px 24px' }}>
        {filtrados.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>🎬</span>
            <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>Sin videos en esta categoría</p>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>Prueba con otra</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {filtrados.map(v => {
              const instr = instructores.find(i => i.id === v.instructorId);
              const gradient = GRADIENTS[v.categoria];
              return (
                <button
                  key={v.id}
                  onClick={() => { setAvisoPendiente(false); setSelected(v); }}
                  style={{ ...card, overflow: 'hidden', textAlign: 'left' }}
                >
                  {/* Thumbnail */}
                  <div style={{ width: '100%', height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: gradient }}>
                    <div style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={18} style={{ color: '#fff', fill: '#fff', marginLeft: 2 }} />
                    </div>
                    <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={9} style={{ color: '#fff' }} />
                      <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>{v.duracionMinutos}m</span>
                    </div>
                  </div>
                  {/* Info */}
                  <div style={{ padding: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.2, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{v.titulo}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, backgroundColor: NIVEL_BG[v.nivel], color: NIVEL_COLOR[v.nivel] }}>
                        {NIVEL_LABEL[v.nivel]}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Eye size={10} style={{ color: t.muted }} />
                        <span style={{ fontSize: 10, color: t.muted }}>{v.vistas}</span>
                      </div>
                    </div>
                    {instr && <p style={{ fontSize: 11, color: t.muted, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instr.nombre}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.6)' }} onClick={() => { setSelected(null); setReproduciendo(false); setAvisoPendiente(false); }}>
          <div
            style={{ background: t.bg, width: '100%', borderRadius: '24px 24px 0 0', overflow: 'hidden', maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Reproductor / Thumbnail */}
            {reproduciendo && selected.streamUid ? (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', position: 'relative' }}>
                <iframe
                  src={urlIframeStream(selected.streamUid)}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                  title={selected.titulo}
                />
                <button
                  onClick={() => { setSelected(null); setReproduciendo(false); }}
                  style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, border: 'none' }}
                >
                  <X size={17} style={{ color: '#fff' }} />
                </button>
              </div>
            ) : (
              <div style={{ width: '100%', height: 176, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: GRADIENTS[selected.categoria] }}>
                <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={26} style={{ color: '#fff', fill: '#fff', marginLeft: 4 }} />
                </div>
                <button
                  onClick={() => { setSelected(null); setAvisoPendiente(false); }}
                  style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 999, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
                >
                  <X size={17} style={{ color: '#fff' }} />
                </button>
                <div style={{ position: 'absolute', bottom: 12, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                    {NIVEL_LABEL[selected.nivel]}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600 }}>{selected.duracionMinutos} min</span>
                </div>
              </div>
            )}

            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: t.ink, lineHeight: 1.1, textTransform: 'uppercase' }}>{selected.titulo}</p>
              {instructores.find(i => i.id === selected.instructorId) && (
                <p style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>
                  con {instructores.find(i => i.id === selected.instructorId)!.nombre}
                </p>
              )}
              {selected.descripcion && (
                <p style={{ fontSize: 14, color: t.muted2, lineHeight: 1.5, marginTop: 12 }}>{selected.descripcion}</p>
              )}
              {reproduciendo ? null : avisoPendiente ? (
                <div style={{ width: '100%', marginTop: 20, borderRadius: 16, background: t.surface2, padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>Reproducción en preparación</p>
                  <p style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Este contenido estará disponible muy pronto en tu portal.</p>
                </div>
              ) : (
                <button
                  style={{ width: '100%', padding: '16px 0', borderRadius: 16, color: '#fff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, border: 'none', background: GRADIENTS[selected.categoria] }}
                  onClick={() => { if (selected.streamUid) setReproduciendo(true); else setAvisoPendiente(true); }}
                >
                  <Play size={18} style={{ fill: '#fff' }} />
                  {selected.streamUid ? 'Reproducir' : 'Empezar video'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
