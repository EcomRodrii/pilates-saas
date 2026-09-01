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
//
// Estilos: sistema literal `--ap-*`/`.ap-*` de app/portal/[slug]/portal-app.css
// (mismo que components/portal/portal-clases-view.tsx y la card "Tu equipo" de
// portal-home-view.tsx), no useModo()/lib/portal-design.ts. No hay captura de
// referencia dedicada para esta pantalla en docs/diseno-referencia-portal/ —
// esta conversión es por consistencia/extrapolación con las pantallas ya
// convertidas, no un calco 1:1 de un diseño visto.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, MessageCircle, Star } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
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

  // `ahora` aislado en su propio memo con deps vacías (mismo patrón que
  // portal-clases-view.tsx: "Estable durante la vida de la página: con
  // Date.now() la dependencia sería nueva en cada render y no se
  // memoizaría nada"). `Date.now()` suelto SÍ lo marca el React Compiler
  // como llamada impura durante el render; `new Date()` no.
  const ahora = useMemo(() => new Date(), []);

  // Lo único que una socia puede hacer con el horario de su instructora:
  // MIRAR sus próximas clases — nunca gestionarlas.
  const proximasClases = useMemo(() => {
    if (!instructor) return [];
    return sesiones
      .filter(s => s.instructorId === instructor.id && !s.cancelada && new Date(s.inicio) > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 4)
      .map(s => ({ sesion: s, tipoClase: tiposClase.find(tc => tc.id === s.tipoClaseId) ?? null }));
  }, [instructor, sesiones, tiposClase, ahora]);

  const valoracion = valoracionParaPantalla(instructor?.valoracion ?? null);

  const puedeEscribir = useMemo(() => {
    if (!instructor) return false;
    return instructorasConRelacion(instructores, reservas, sesiones, session?.socioId ?? null)
      .some(i => i.id === instructor.id);
  }, [instructor, instructores, reservas, sesiones, session?.socioId]);

  // Función plana, no useCallback — mismo criterio que `abrir()` en
  // mensajes/page.tsx: el React Compiler la memoiza sola, y una dependencia
  // manual mal inferida (studio?.id vs. studio) es justo lo que hace saltar
  // react-hooks/preserve-manual-memoization.
  async function escribir() {
    if (!instructor || !studio?.id || abriendoMensaje) return;
    setAbriendoMensaje(true);
    setErrorMensaje(null);
    const headers = await portalAuthHeader();
    const r = await abrirConversacion(headers, studio.id, 'ALUMNA_INSTRUCTORA', instructor.id);
    setAbriendoMensaje(false);
    if ('error' in r) { setErrorMensaje(r.error); return; }
    recordarInstructorDeConversacion(r.id, instructor.id);
    router.push(`/portal/${slug}/mensajes/${r.id}`);
  }

  const backLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3E6B4A',
    fontSize: 13, fontWeight: 700, textDecoration: 'none', width: 'fit-content',
  };

  if (!instructor) {
    return (
      <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)', padding: '62px 20px 24px' }}>
        <Link href={`/portal/${slug}/instructores`} style={backLink}>
          <ChevronLeft size={16} /> Equipo
        </Link>
        <p style={{ marginTop: 24, fontSize: 13, color: '#98A093' }}>No hemos encontrado a esta instructora.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)' }}>
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
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1, color: '#1A1A1A', textWrap: 'balance' } as React.CSSProperties}>{instructor.nombre}</h1>
            {valoracion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Star size={14} fill="#3E6B4A" color="#3E6B4A" aria-hidden />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{valoracion.nota}</span>
                <span style={{ fontSize: 11, color: '#98A093' }}>({valoracion.respaldo})</span>
              </div>
            )}
          </div>
        </div>

        {instructor.bio && (
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#5A5A52', margin: 0 }}>{instructor.bio}</p>
        )}

        {especialidades.length > 0 && (
          <div>
            <p className="ap-label">Especialidades</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {especialidades.map(tc => (
                <span
                  key={tc.id}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
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
            <p className="ap-label">Próximas clases con {instructor.nombre.split(' ')[0]}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {proximasClases.map(({ sesion, tipoClase }) => (
                <Link key={sesion.id} href={`/portal/${slug}/clases/${sesion.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    className="ap-card"
                    style={{
                      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, backgroundColor: tipoClase?.color ?? '#3E6B4A' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1A1A' }}>{tipoClase?.nombre ?? 'Clase'}</p>
                      <p style={{ fontSize: 11, color: '#98A093', marginTop: 1 }}>
                        {formatFechaCorta(sesion.inicio)} · {formatHoraCorta(sesion.inicio)}
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: '#98A093', flexShrink: 0 }} aria-hidden />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <Link
            href={`/portal/${slug}/clases`}
            className="ap-btn ap-btn--primario"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
          >
            Ver horario
          </Link>

          {puedeEscribir && (
            <button
              type="button"
              onClick={() => void escribir()}
              disabled={abriendoMensaje}
              aria-busy={abriendoMensaje || undefined}
              className="ap-btn"
              style={{
                height: 52, background: '#FFFFFF', color: '#1A1A1A', border: '1px solid #E5E3DA',
                fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: abriendoMensaje ? 0.7 : 1, cursor: abriendoMensaje ? 'default' : 'pointer',
              }}
            >
              {abriendoMensaje ? (
                <span
                  aria-hidden
                  className="animate-spin"
                  style={{
                    width: 14, height: 14, borderRadius: 999, display: 'inline-block', flexShrink: 0,
                    border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.8,
                  }}
                />
              ) : (
                <MessageCircle size={16} aria-hidden />
              )}
              Escribir un mensaje
            </button>
          )}

          {errorMensaje && (
            <p role="alert" style={{ fontSize: 11, color: '#C2503A' }}>{errorMensaje}</p>
          )}
        </div>
      </div>
    </div>
  );
}
