'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
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
  const { t } = useModo();

  const instructoresActivos = instructores.filter(i => i.activo);
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };
  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20 };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={microLabel}>Equipo</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>Nuestros instructores</h1>
      </div>

      {instructoresActivos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Users size={24} style={{ color: t.muted }} />
          </div>
          <p style={{ fontWeight: 800, color: t.ink }}>Sin instructores disponibles</p>
          <p style={{ fontSize: 14, color: t.muted, marginTop: 4 }}>El equipo se publicará próximamente</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {instructoresActivos.map(instructor => {
            const clasesInstructor = tiposClase.filter(tc => tc.studioId === instructor.studioId);
            return (
              <div
                key={instructor.id}
                style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 16, fontWeight: 800, backgroundColor: instructor.color }}
                  >
                    {getInitials(instructor.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, color: t.ink, fontSize: 15, lineHeight: 1.2 }}>{instructor.nombre}</p>
                    {instructor.email && (
                      <p style={{ fontSize: 12, color: t.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instructor.email}</p>
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

                <Link
                  href={`/portal/${slug}/clases`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, border: `1px solid ${t.heroAccent}4d`, color: t.heroAccent, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
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
