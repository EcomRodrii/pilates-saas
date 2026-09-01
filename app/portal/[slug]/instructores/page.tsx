'use client';
import { queImparten } from '@/lib/equipo';

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
  const { instructores, sesiones, tiposClase } = useStudio();

  const instructoresActivos = queImparten(instructores);

  return (
    <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p className="ap-label">Equipo</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A', marginTop: 4, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>Nuestros instructores</h1>
      </div>

      {instructoresActivos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Users size={24} style={{ color: '#98A093' }} />
          </div>
          <p style={{ fontWeight: 800, color: '#1A1A1A' }}>Sin instructores disponibles</p>
          <p style={{ fontSize: 14, color: '#98A093', marginTop: 4 }}>El equipo se publicará próximamente</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {instructoresActivos.map(instructor => {
            const idsImpartidos = new Set(
              sesiones.filter(s => s.instructorId === instructor.id && !s.cancelada).map(s => s.tipoClaseId),
            );
            const clasesInstructor = tiposClase.filter(tc => idsImpartidos.has(tc.id));
            return (
              <div
                key={instructor.id}
                className="ap-card"
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 16, fontWeight: 800, backgroundColor: instructor.color }}
                  >
                    {getInitials(instructor.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, color: '#1A1A1A', fontSize: 15, lineHeight: 1.2 }}>{instructor.nombre}</p>
                    {instructor.email && (
                      <p style={{ fontSize: 12, color: '#98A093', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instructor.email}</p>
                    )}
                  </div>
                </div>

                {clasesInstructor.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {clasesInstructor.slice(0, 4).map(tc => (
                      <span
                        key={tc.id}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, backgroundColor: `${tc.color}20`, color: tc.color }}
                      >
                        {tc.nombre}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    href={`/portal/${slug}/instructores/${instructor.id}`}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, border: '1px solid #E5E3DA', color: '#1A1A1A', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                  >
                    <span>Su perfil</span>
                    <ChevronRight size={15} />
                  </Link>
                  <Link
                    href={`/portal/${slug}/clases`}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, border: '1px solid rgba(62,107,74,.3)', color: '#3E6B4A', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                  >
                    <span>Ver clases</span>
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
