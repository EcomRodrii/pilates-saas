'use client';

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { CategoriaVideo, NivelClase, VideoOnDemand } from '@/lib/types';
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
  REFORMER: 'linear-gradient(135deg, #1A1A1A, #3F5200)',
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
const NIVEL_BG: Record<NivelClase, string> = {
  TODOS: '#F1F1EC', PRINCIPIANTE: '#DCFCE7', MEDIO: '#FEF3C7', AVANZADO: '#FEE2E2',
};

export default function VideosPage() {
  const { videosOnDemand, instructores } = useStudio();
  const [cat, setCat] = useState<CategoriaVideo | 'TODOS'>('TODOS');
  const [selected, setSelected] = useState<VideoOnDemand | null>(null);
  const [avisoPendiente, setAvisoPendiente] = useState(false);

  const filtrados = cat === 'TODOS'
    ? videosOnDemand.filter(v => v.activo)
    : videosOnDemand.filter(v => v.activo && v.categoria === cat);

  const totalVistas = videosOnDemand.reduce((s, v) => s + v.vistas, 0);

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-4" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #8FBF12 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Videos</h1>
        <p className="text-white/50 text-[13px] mt-0.5">{videosOnDemand.filter(v => v.activo).length} videos · {totalVistas} visualizaciones</p>

        {/* Category pills */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIAS.map(c => (
            <button
              key={c.value}
              onClick={() => setCat(c.value)}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[12px] font-bold transition-all"
              style={{
                backgroundColor: cat === c.value ? 'white' : 'rgba(255,255,255,0.12)',
                color: cat === c.value ? '#171717' : 'rgba(255,255,255,0.75)',
              }}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="px-4 pt-4 pb-6">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🎬</span>
            <p className="font-bold text-[#171717] text-[16px]">Sin videos en esta categoría</p>
            <p className="text-[13px] text-[#8E8E93] mt-1">Prueba con otra</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtrados.map(v => {
              const instr = instructores.find(i => i.id === v.instructorId);
              const gradient = GRADIENTS[v.categoria];
              return (
                <button
                  key={v.id}
                  onClick={() => { setAvisoPendiente(false); setSelected(v); }}
                  className="bg-white rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-transform"
                  style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.09)' }}
                >
                  {/* Thumbnail */}
                  <div className="w-full h-28 flex items-center justify-center relative" style={{ background: gradient }}>
                    <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center">
                      <Play size={18} className="text-white fill-white ml-0.5" />
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/40 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <Clock size={9} className="text-white" />
                      <span className="text-white text-[10px] font-bold">{v.duracionMinutos}m</span>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <p className="text-[13px] font-bold text-[#171717] leading-tight line-clamp-2 mb-2">{v.titulo}</p>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: NIVEL_BG[v.nivel], color: NIVEL_COLOR[v.nivel] }}
                      >
                        {NIVEL_LABEL[v.nivel]}
                      </span>
                      <div className="flex items-center gap-1">
                        <Eye size={10} className="text-[#8E8E93]" />
                        <span className="text-[10px] text-[#8E8E93]">{v.vistas}</span>
                      </div>
                    </div>
                    {instr && <p className="text-[11px] text-[#8E8E93] mt-1.5 truncate">{instr.nombre}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            className="bg-white w-full rounded-t-3xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: '85vh' }}
          >
            {/* Thumbnail */}
            <div className="w-full h-44 flex items-center justify-center relative" style={{ background: GRADIENTS[selected.categoria] }}>
              <div className="w-16 h-16 rounded-full bg-white/25 flex items-center justify-center">
                <Play size={26} className="text-white fill-white ml-1" />
              </div>
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center"
              >
                <X size={17} className="text-white" />
              </button>
              <div className="absolute bottom-3 left-4 flex items-center gap-2">
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                >
                  {NIVEL_LABEL[selected.nivel]}
                </span>
                <span className="text-white/80 text-[12px] font-medium">{selected.duracionMinutos} min</span>
              </div>
            </div>

            <div className="p-5">
              <p className="text-[20px] font-extrabold text-[#171717] leading-tight">{selected.titulo}</p>
              {instructores.find(i => i.id === selected.instructorId) && (
                <p className="text-[13px] text-[#8E8E86] mt-1">
                  con {instructores.find(i => i.id === selected.instructorId)!.nombre}
                </p>
              )}
              {selected.descripcion && (
                <p className="text-[14px] text-[#3A3A32] leading-relaxed mt-3">{selected.descripcion}</p>
              )}
              {avisoPendiente ? (
                <div className="w-full mt-5 rounded-2xl bg-[#F1F1EC] px-4 py-4 text-center">
                  <p className="text-[14px] font-bold text-[#171717]">Reproducción en preparación</p>
                  <p className="text-[12px] text-[#8E8E93] mt-1">Este contenido estará disponible muy pronto en tu portal.</p>
                </div>
              ) : (
                <button
                  className="w-full py-4 rounded-2xl text-white font-bold text-[16px] flex items-center justify-center gap-2 mt-5"
                  style={{ background: GRADIENTS[selected.categoria] }}
                  onClick={() => setAvisoPendiente(true)}
                >
                  <Play size={18} className="fill-white" />
                  Empezar video
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
