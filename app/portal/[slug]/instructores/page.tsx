'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { Users, ChevronRight } from 'lucide-react';

function getInitials(nombre: string) {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

export default function InstructoresPage() {
  const { slug } = useParams<{ slug: string }>();
  const { instructores, tiposClase } = useStudio();

  const instructoresActivos = instructores.filter(i => i.activo);

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#A8A89E]">Equipo</p>
        <h1 className="text-xl font-bold text-[#171717] mt-0.5">Nuestros instructores</h1>
      </div>

      {instructoresActivos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F1F1EC] flex items-center justify-center mb-3">
            <Users size={24} className="text-[#A8A89E]" />
          </div>
          <p className="font-semibold text-[#171717]">Sin instructores disponibles</p>
          <p className="text-sm text-[#8E8E86] mt-1">El equipo se publicará próximamente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {instructoresActivos.map(instructor => {
            const clasesInstructor = tiposClase.filter(tc => tc.studioId === instructor.studioId);
            return (
              <div
                key={instructor.id}
                className="bg-white border border-[#E7E7E0] rounded-2xl p-4 flex flex-col gap-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-[16px] font-bold"
                    style={{ backgroundColor: instructor.color }}
                  >
                    {getInitials(instructor.nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#171717] text-[15px] leading-tight">{instructor.nombre}</p>
                    {instructor.email && (
                      <p className="text-[12px] text-[#8E8E86] mt-0.5 truncate">{instructor.email}</p>
                    )}
                  </div>
                </div>

                {clasesInstructor.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {clasesInstructor.slice(0, 4).map(tc => (
                      <span
                        key={tc.id}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: `${tc.color}20`, color: tc.color }}
                      >
                        {tc.nombre}
                      </span>
                    ))}
                  </div>
                )}

                <Link
                  href={`/portal/${slug}/clases`}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-portal-brand/30 text-portal-brand-secondary text-[13px] font-medium hover:bg-portal-brand/5 transition-colors"
                >
                  <span>Ver clases</span>
                  <ChevronRight size={15} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
