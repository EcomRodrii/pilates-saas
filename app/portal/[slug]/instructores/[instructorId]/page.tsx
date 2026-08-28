'use client';

// PERFIL DE INSTRUCTORA — vista de la socia (portal blanco).
//
// ⚠️ No confundir con app/network/instructoras/[slug]: aquel es el perfil de
// Tentare Network donde un ESTUDIO contrata a una instructora freelance,
// negocio opuesto. Este es siempre una socia mirando a SU instructora.
//
// Reutiliza lo que ya existe en vez de inventar estado nuevo:
//  - Rating: `Instructor.valoracion` + `valoracionParaPantalla()` (mismo
//    criterio y mínimo de reseñas que ya usa hoja-reserva.tsx — nunca un
//    porcentaje sin respaldo, ver [[porcentaje-sin-respaldo-en-pantalla]]).
//  - Bio: `Instructor.bio`, campo real. Si no existe, no se pinta nada — cero
//    texto de relleno.
//  - "Escribir un mensaje": SOLO si la socia tuvo de verdad una clase con esta
//    instructora (`instructorasConRelacion`, el mismo criterio que la bandeja
//    de Mensajes), vía `abrirConversacion('ALUMNA_INSTRUCTORA', instructorId)`
//    ya en producción — nunca un "Proponer sustitución": eso es gestión de
//    plantilla, cosa de STAFF, jamás de una socia.
//
// El punto de entrada real es "Ver perfil" en hoja-reserva.tsx (y "Su perfil"
// en la lista de instructores/page.tsx) — no se duplica aquí.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, MessageCircle, Star } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { useModo } from '@/lib/portal-modo';
import { altura, dur, display, EASE, micro, radio, sombra, texto, transicion } from '@/lib/portal-design';
import { semantic } from '@/lib/portal-tokens';
import { Button, Card } from '@/components/portal/ui';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';
import { portalAuthHeader } from '@/lib/api-client';
import { abrirConversacion, instructorasConRelacion, recordarInstructorDeConversacion } from '@/lib/mensajeria-portal.ts';
import { formatFechaCorta, formatHoraCorta } from '@/lib/utils';

export default function InstructoraPerfilPage() {
  const router = useRouter();
  const { slug, instructorId } = useParams<{ slug: string; instructorId: string }>();
  const { studio, instructores, sesiones, tiposClase, reservas } = useStudio();
  const { session } = usePortalAuth();
  const { t } = useModo();

  const [abriendoMensaje, setAbriendoMensaje] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);

  const instructor = instructores.find(i => i.id === instructorId) ?? null;

  // Especialidades derivadas de lo que ha impartido de VERDAD (sesiones no
  // canceladas), no de todo el catálogo del estudio.
  const especialidades = useMemo(() => {
    if (!instructor) return [];
    const idsImpartidos = new Set(
      sesiones.filter(s => s.instructorId === instructor.id && !s.cancelada).map(s => s.tipoClaseId),
    );
    return tiposClase.filter(tc => idsImpartidos.has(tc.id));
  }, [instructor, sesiones, tiposClase]);

  // Lo único que una socia puede hacer con el horario de su instructora:
  // MIRAR sus próximas clases — nunca gestionarlas.
  const proximasClases = useMemo(() => {
    if (!instructor) return [];
    const ahora = Date.now();
    return sesiones
      .filter(s => s.instructorId === instructor.id && !s.cancelada && new Date(s.inicio).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 4)
      .map(s => ({ sesion: s, tipoClase: tiposClase.find(tc => tc.id === s.tipoClaseId) ?? null }));
  }, [instructor, sesiones, tiposClase]);

  const valoracion = valoracionParaPantalla(instructor?.valoracion ?? null);

  const puedeEscribir = useMemo(() => {
    if (!instructor) return false;
    return instructorasConRelacion(instructores, reservas, sesiones, session?.socioId ?? null)
      .some(i => i.id === instructor.id);
  }, [instructor, instructores, reservas, sesiones, session?.socioId]);

  const escribir = useCallback(async () => {
    if (!instructor || !studio?.id || abriendoMensaje) return;
    setAbriendoMensaje(true);
    setErrorMensaje(null);
    const headers = await portalAuthHeader();
    const r = await abrirConversacion(headers, studio.id, 'ALUMNA_INSTRUCTORA', instructor.id);
    setAbriendoMensaje(false);
    if ('error' in r) { setErrorMensaje(r.error); return; }
    recordarInstructorDeConversacion(r.id, instructor.id);
    router.push(`/portal/${slug}/mensajes/${r.id}`);
  }, [instructor, studio?.id, abriendoMensaje, slug, router]);

  const microLabel: React.CSSProperties = { ...micro(9.5, 0.28, 600), color: t.muted };
  const backLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, color: t.heroAccent,
    ...texto.metaFuerte, textDecoration: 'none', width: 'fit-content',
  };

  if (!instructor) {
    return (
      <div style={{ minHeight: '100%', background: t.bg, padding: '62px 20px 24px' }}>
        <Link href={`/portal/${slug}/instructores`} style={backLink}>
          <ChevronLeft size={16} /> Equipo
        </Link>
        <p style={{ marginTop: 24, ...texto.meta, color: t.muted }}>No hemos encontrado a esta instructora.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      <div style={{ padding: '62px 20px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link href={`/portal/${slug}/instructores`} style={backLink}>
          <ChevronLeft size={16} /> Equipo
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ProfileAvatar
            nombre={instructor.nombre}
            color={instructor.color}
            avatarId={instructor.avatar}
            fotoUrl={instructor.fotoUrl}
            size="xl"
          />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ ...display(28), color: t.ink, textWrap: 'balance' } as React.CSSProperties}>{instructor.nombre}</h1>
            {valoracion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Star size={14} fill={t.heroAccent} color={t.heroAccent} aria-hidden />
                <span style={{ ...texto.metaFuerte, color: t.ink }}>{valoracion.nota}</span>
                <span style={{ ...texto.nota, color: t.muted }}>({valoracion.respaldo})</span>
              </div>
            )}
          </div>
        </div>

        {instructor.bio && (
          <p style={{ ...texto.meta, lineHeight: 1.6, color: t.muted, margin: 0 }}>{instructor.bio}</p>
        )}

        {especialidades.length > 0 && (
          <div>
            <p style={microLabel}>Especialidades</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {especialidades.map(tc => (
                <span
                  key={tc.id}
                  style={{
                    ...texto.nota, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                    backgroundColor: `${tc.color}20`, color: tc.color,
                  }}
                >
                  {tc.nombre}
                </span>
              ))}
            </div>
          </div>
        )}

        {proximasClases.length > 0 && (
          <div>
            <p style={microLabel}>Próximas clases con {instructor.nombre.split(' ')[0]}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {proximasClases.map(({ sesion, tipoClase }) => (
                <Link key={sesion.id} href={`/portal/${slug}/clases/${sesion.id}`} style={{ textDecoration: 'none' }}>
                  <Card
                    style={{
                      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                      transition: transicion(['border-color'], dur.color),
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, backgroundColor: tipoClase?.color ?? t.heroAccent }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...texto.metaFuerte, color: t.ink }}>{tipoClase?.nombre ?? 'Clase'}</p>
                      <p style={{ ...texto.nota, color: t.muted, marginTop: 1 }}>
                        {formatFechaCorta(sesion.inicio)} · {formatHoraCorta(sesion.inicio)}
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <Link
            href={`/portal/${slug}/clases`}
            style={{
              height: altura.botonCta, borderRadius: radio.botonCta,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              ...texto.botonCta, display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', boxShadow: sombra.cta,
              transition: transicion(['transform', 'box-shadow'], dur.control),
            }}
          >
            Ver horario
          </Link>

          {puedeEscribir && (
            <Button
              variant="secondary"
              onClick={() => void escribir()}
              loading={abriendoMensaje}
              style={{ gap: 8, transition: `opacity ${dur.color}ms ${EASE}` }}
            >
              <MessageCircle size={16} aria-hidden />
              Escribir un mensaje
            </Button>
          )}

          {errorMensaje && (
            <p role="alert" style={{ ...texto.nota, color: semantic.danger.text }}>{errorMensaje}</p>
          )}
        </div>
      </div>
    </div>
  );
}
