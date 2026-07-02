'use client';

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { CategoriaVideo, NivelClase, VideoOnDemand } from '@/lib/types';
import { X, Play } from 'lucide-react';

const CATEGORIAS: { value: CategoriaVideo | 'TODOS'; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'REFORMER', label: 'Reformer' },
  { value: 'MAT', label: 'Mat' },
  { value: 'BARRE', label: 'Barre' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'MEDITACION', label: 'Meditación' },
  { value: 'ESTIRAMIENTO', label: 'Estiramiento' },
];

const CATEGORIA_GRADIENTS: Record<CategoriaVideo, string> = {
  REFORMER: 'from-[#4F46E5] to-[#7C3AED]',
  MAT: 'from-[#059669] to-[#10B981]',
  BARRE: 'from-[#EC4899] to-[#F472B6]',
  CARDIO: 'from-[#EF4444] to-[#F97316]',
  MEDITACION: 'from-[#6366F1] to-[#8B5CF6]',
  ESTIRAMIENTO: 'from-[#0EA5E9] to-[#38BDF8]',
};

const NIVEL_LABELS: Record<NivelClase, string> = {
  TODOS: 'Todos los niveles',
  PRINCIPIANTE: 'Principiante',
  MEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
};

const NIVEL_COLORS: Record<NivelClase, string> = {
  TODOS: 'bg-[#F3F4F6] text-[#6B7280]',
  PRINCIPIANTE: 'bg-[#DCFCE7] text-[#16A34A]',
  MEDIO: 'bg-[#FEF3C7] text-[#D97706]',
  AVANZADO: 'bg-[#FEE2E2] text-[#DC2626]',
};

export default function VideosPage() {
  const { videosOnDemand, instructores } = useStudio();
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaVideo | 'TODOS'>('TODOS');
  const [videoSeleccionado, setVideoSeleccionado] = useState<VideoOnDemand | null>(null);

  const videosFiltrados = categoriaActiva === 'TODOS'
    ? videosOnDemand.filter(v => v.activo)
    : videosOnDemand.filter(v => v.activo && v.categoria === categoriaActiva);

  function getInstructorNombre(instructorId: string) {
    return instructores.find(i => i.id === instructorId)?.nombre ?? 'Instructor';
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF]">Biblioteca</p>
        <h1 className="text-xl font-bold text-[#111827] mt-0.5">Videos on demand</h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIAS.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoriaActiva(cat.value)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
              categoriaActiva === cat.value
                ? 'bg-[#4F46E5] text-white'
                : 'bg-white border border-[#E8EAED] text-[#6B7280] hover:border-[#4F46E5] hover:text-[#4F46E5]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {videosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mb-3">
            <Play size={24} className="text-[#9CA3AF]" />
          </div>
          <p className="font-semibold text-[#111827]">Sin videos en esta categoría</p>
          <p className="text-sm text-[#6B7280] mt-1">Prueba con otra categoría</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {videosFiltrados.map(video => (
            <button
              key={video.id}
              onClick={() => setVideoSeleccionado(video)}
              className="bg-white border border-[#E8EAED] rounded-2xl overflow-hidden text-left hover:shadow-md transition-shadow"
            >
              <div className={`w-full h-24 bg-gradient-to-br ${CATEGORIA_GRADIENTS[video.categoria]} flex items-center justify-center`}>
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Play size={18} className="text-white fill-white" />
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[13px] font-semibold text-[#111827] leading-snug line-clamp-2">{video.titulo}</p>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${NIVEL_COLORS[video.nivel]}`}>
                    {NIVEL_LABELS[video.nivel]}
                  </span>
                  <span className="text-[11px] text-[#9CA3AF]">{video.duracionMinutos} min</span>
                </div>
                <p className="text-[11px] text-[#6B7280] truncate">{getInstructorNombre(video.instructorId)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {videoSeleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          onClick={() => setVideoSeleccionado(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className={`w-full h-40 bg-gradient-to-br ${CATEGORIA_GRADIENTS[videoSeleccionado.categoria]} flex items-center justify-center relative`}>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <Play size={28} className="text-white fill-white" />
              </div>
              <button
                onClick={() => setVideoSeleccionado(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"
              >
                <X size={16} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${NIVEL_COLORS[videoSeleccionado.nivel]}`}>
                    {NIVEL_LABELS[videoSeleccionado.nivel]}
                  </span>
                  <span className="text-[11px] text-[#9CA3AF]">{videoSeleccionado.duracionMinutos} min</span>
                </div>
                <h2 className="text-[17px] font-bold text-[#111827] leading-snug">{videoSeleccionado.titulo}</h2>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Con {getInstructorNombre(videoSeleccionado.instructorId)}</p>
              </div>
              {videoSeleccionado.descripcion && (
                <p className="text-[13px] text-[#374151] leading-relaxed">{videoSeleccionado.descripcion}</p>
              )}
              <button
                onClick={() => alert('¡Próximamente disponible!')}
                className="w-full py-3.5 rounded-xl bg-[#4F46E5] text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-[#4338CA] transition-colors"
              >
                <Play size={18} className="fill-white" />
                Ver video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
