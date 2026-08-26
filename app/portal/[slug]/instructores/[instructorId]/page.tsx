'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';
import { ChevronLeft, Star } from 'lucide-react';

function getInitials(nombre: string) {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

export default function InstructoraPerfilPage() {
  const { slug, instructorId } = useParams<{ slug: string; instructorId: string }>();
  const { instructores, sesiones, tiposClase } = useStudio();
  const { t } = useModo();

  const instructor = instructores.find(i => i.id === instructorId) ?? null;

  // Especialidades derivadas de lo que ha impartido de VERDAD (sesiones no
  // canceladas), no de todo el catálogo de tipos de clase del estudio — ese
  // era el bug de app/portal/[slug]/instructores/page.tsx (todas las
  // instructoras enseñaban ahí las mismas etiquetas, las del estudio entero).
  const especialidades = useMemo(() => {
    if (!instructor) return [];
    const idsImpartidos = new Set(
      sesiones.filter(s => s.instructorId === instructor.id && !s.cancelada).map(s => s.tipoClaseId),
    );
    return tiposClase.filter(tc => idsImpartidos.has(tc.id));
  }, [instructor, sesiones, tiposClase]);

  const valoracion = valoracionParaPantalla(instructor?.valoracion ?? null);

  if (!instructor) {
    return (
      <div style={{ minHeight: '100%', background: t.bg, padding: '20px 16px' }}>
        <Link href={`/portal/${slug}/instructores`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t.heroAccent, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Equipo
        </Link>
        <p style={{ marginTop: 24, color: t.muted }}>No hemos encontrado a esta instructora.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href={`/portal/${slug}/instructores`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t.heroAccent, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Equipo
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#fff', fontSize: 22, fontWeight: 800, backgroundColor: instructor.color,
          }}
        >
          {getInitials(instructor.nombre)}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>{instructor.nombre}</h1>
          {valoracion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Star size={14} fill={t.heroAccent} color={t.heroAccent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{valoracion.nota}</span>
              <span style={{ fontSize: 12, color: t.muted }}>({valoracion.respaldo})</span>
            </div>
          )}
        </div>
      </div>

      {instructor.bio && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: t.muted, margin: 0 }}>{instructor.bio}</p>
      )}

      {especialidades.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted, margin: '0 0 8px' }}>
            Especialidades
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {especialidades.map(tc => (
              <span
                key={tc.id}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, backgroundColor: `${tc.color}20`, color: tc.color }}
              >
                {tc.nombre}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/portal/${slug}/clases`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 999,
          background: t.heroAccent, color: '#fff', fontSize: 14, fontWeight: 800, textDecoration: 'none', marginTop: 8,
        }}
      >
        Ver horario
      </Link>
    </div>
  );
}
