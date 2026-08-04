'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio, REFRESCO_ACTIVO_MS } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { useModo } from '@/lib/portal-modo';
import { ChevronLeft, Clock, Users, MapPin, BarChart2, Star, CheckCircle, AlertCircle } from 'lucide-react';
import { Button, BottomSheet, Toast, AforoIndicator, type AvisoToast } from '@/components/portal/ui';
import { HojaReserva, type ClaseParaReservar, type ResultadoConfirmar } from '@/components/portal/hoja-reserva';

// Reservar desde aquí (llegando por el carrusel de Inicio) no dejaba elegir
// plaza numerada, mientras que reservar desde la Agenda (HojaReserva) sí —
// misma clase, misma sala, dos resultados distintos según el camino que
// tomara la socia. Se reutiliza el mismo componente/flujo de reserva, no uno
// nuevo, para no duplicar la lógica de elegir plaza.
const OCUPA_PLAZA = ['CONFIRMADA', 'ASISTIDA'];

const NIVEL_LABEL: Record<string, string> = {
  TODOS: 'Todos los niveles', PRINCIPIANTE: 'Iniciación', MEDIO: 'Intermedio', AVANZADO: 'Avanzado',
};

export default function ClaseDetallePage() {
  const router = useRouter();
  const { slug, sesionId } = useParams<{ slug: string; sesionId: string }>();
  const { session } = usePortalAuth();
  const { sesiones, reservas, tiposClase, salas, instructores, spots, planesTarifa, suscripciones, addReserva, cancelarReserva, favoritos, toggleFavorito, recargarPublico } = useStudio();
  const { t } = useModo();

  // Mismo parche de Fase 1/3 que PortalClasesView (ver REFRESCO_ACTIVO_MS en
  // studio-context.tsx): esta pantalla también deja reservar, así que
  // también necesita el aforo fresco mientras está abierta.
  const recargarRef = useRef(recargarPublico);
  useEffect(() => { recargarRef.current = recargarPublico; });
  useEffect(() => {
    const id = setInterval(() => recargarRef.current(), REFRESCO_ACTIVO_MS);
    return () => clearInterval(id);
  }, []);
  // El servidor puede decir que no (sin bono, clase empezada, tope de reservas).
  // Sin esto, pulsar «Reservar» no hacía nada visible y la reserva no existía.
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  // "Cancelar reserva" cancelaba directo en el onClick, sin confirmar — un
  // toque accidental con el pulgar (scrolleando en móvil) perdía la plaza sin
  // poder deshacerlo. Mismo patrón de confirmación que /reservas.
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [reservando, setReservando] = useState(false);

  const ses = sesiones.find(s => s.id === sesionId);
  const tipo = ses ? tiposClase.find(t2 => t2.id === ses.tipoClaseId) : undefined;
  const sala = ses ? salas.find(s => s.id === ses.salaId) : undefined;
  const instr = ses ? instructores.find(i => i.id === ses.instructorId) : undefined;
  const color = tipo?.color ?? 'var(--portal-brand)';
  const esFavorita = tipo ? favoritos.some(f => f.tipoClaseId === tipo.id) : false;

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;
  const activeSus = useMemo(() =>
    suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA') ?? null,
  [suscripciones, session?.socioId]);
  const planActivo = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) ?? null : null;
  const cubierta = tieneCoberturaPlan(activeSus, planActivo);

  const libres = useMemo(() => {
    if (!ses) return 0;
    return ses.aforoMaximo - reservas.filter(r => r.sesionId === ses.id && r.estado === 'CONFIRMADA').length;
  }, [ses, reservas]);

  const miReserva = useMemo(() => {
    if (!ses || !session?.socioId) return null;
    return reservas.find(r => r.sesionId === ses.id && r.socioId === session.socioId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;
  }, [ses, reservas, session?.socioId]);

  const spotsDeLaSala = useMemo(
    () => (ses ? spots.filter(sp => sp.activo && sp.salaId === ses.salaId) : []),
    [spots, ses],
  );
  const spotsOcupados = useMemo(
    () => (ses ? reservas.filter(r => r.sesionId === ses.id && OCUPA_PLAZA.includes(r.estado) && r.spotId).map(r => r.spotId as string) : []),
    [reservas, ses],
  );
  const claseParaReservar: ClaseParaReservar | null = useMemo(() => {
    if (!ses) return null;
    return {
      id: ses.id, inicio: ses.inicio, fin: ses.fin,
      nombre: tipo?.nombre ?? 'Clase',
      nivel: tipo?.nivel === 'TODOS' ? 'Todos los niveles' : tipo?.nivel ?? null,
      salaNombre: sala?.nombre ?? null,
      instructorNombre: instr?.nombre ?? null,
      aforoMaximo: ses.aforoMaximo,
      ocupadas: reservas.filter(r => r.sesionId === ses.id && OCUPA_PLAZA.includes(r.estado)).length,
      spots: spotsDeLaSala,
      spotsOcupados,
      precio: cubierta ? null : precioClaseSuelta,
      sesionesTrasReservar: cubierta && activeSus?.sesionesRestantes != null
        ? Math.max(0, activeSus.sesionesRestantes - 1)
        : null,
    };
  }, [ses, tipo, sala, instr, reservas, spotsDeLaSala, spotsOcupados, cubierta, precioClaseSuelta, activeSus]);

  async function confirmar(spotId: string | null): Promise<ResultadoConfirmar> {
    if (!ses || !session?.socioId) return { ok: false, error: 'No se ha podido confirmar la reserva.' };
    const r = await addReserva(ses.id, session.socioId, spotId);
    if (!r.ok) return { ok: false, error: r.error };
    setAviso({
      texto: r.estado === 'LISTA_ESPERA' ? 'Estás en la lista de espera. Te avisaremos si se libera una plaza.' : 'Reservada. Te esperamos.',
      error: false,
    });
    return { ok: true, estado: r.estado };
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDayFull = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!ses) {
    return (
      <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>Esta clase ya no está disponible</p>
        <button
          onClick={() => router.push(`/portal/${slug}/clases`)}
          style={{ marginTop: 16, fontSize: 13, fontWeight: 800, color: t.heroAccent, background: 'none', border: 'none' }}
        >
          Volver a Clases
        </button>
      </div>
    );
  }

  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 40px', position: 'relative', overflow: 'hidden', background: tipo?.fotoUrl ? undefined : `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
        {tipo?.fotoUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tipo.fotoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${color}ee, ${color}66)` }} />
          </>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
          >
            <ChevronLeft size={18} style={{ color: '#fff' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {session?.socioId && tipo && (
              <button
                type="button"
                aria-label={esFavorita ? `Quitar ${tipo.nombre} de favoritas` : `Marcar ${tipo.nombre} como favorita`}
                aria-pressed={esFavorita}
                onClick={() => void toggleFavorito(tipo.id, esFavorita ? 'desmarcar' : 'marcar')}
                style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
              >
                <Star size={16} style={{ color: '#fff' }} fill={esFavorita ? '#fff' : 'none'} />
              </button>
            )}
            <div style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={16} style={{ color: '#fff' }} />
            </div>
          </div>
        </div>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '4px 12px', marginBottom: 12 }}>
          {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
        </span>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{tipo?.nombre ?? 'Clase'}</h1>
      </div>

      <div style={{ padding: '0 16px 32px', marginTop: -20 }}>
        <div style={{ background: t.surface, borderRadius: 26, padding: 20, border: `1px solid ${t.line}`, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Instructor */}
          {instr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${t.line}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15, flexShrink: 0, backgroundColor: instr.color }}>
                {instr.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {instr.nombre}{sala ? ` · ${sala.nombre}` : ''}
                </p>
                <p style={{ fontSize: 12, color: t.muted }}>{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
              </div>
            </div>
          )}

          {/* Info row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 0', borderBottom: `1px solid ${t.line}` }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.muted, marginBottom: 4 }}>
                <Clock size={13} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horario</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{formatTime(ses.inicio)}–{formatTime(ses.fin)}</p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.muted, marginBottom: 4 }}>
                <Users size={13} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plazas</span>
              </div>
              <AforoIndicator libres={libres} style={{ fontSize: 14, fontWeight: 800 }} />
            </div>
          </div>

          <div style={{ padding: '16px 0', borderBottom: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.muted2 }}>
            <MapPin size={13} style={{ color: t.muted, flexShrink: 0 }} />
            <span style={{ textTransform: 'capitalize' }}>{formatDayFull(ses.inicio)}</span>
            {sala && <span>· {sala.nombre}</span>}
          </div>

          {/* Sobre la clase */}
          {tipo?.descripcion && (
            <div style={{ paddingTop: 16 }}>
              <p style={{ ...microLabel, marginBottom: 8 }}>Sobre la clase</p>
              <p style={{ fontSize: 14, color: t.muted2, lineHeight: 1.5 }}>{tipo.descripcion}</p>
            </div>
          )}

          {/* Reservada badge */}
          {miReserva && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 18, padding: '12px 16px', backgroundColor: miReserva.estado === 'CONFIRMADA' ? 'rgba(62,155,108,0.12)' : 'rgba(217,119,6,0.12)' }}>
              {miReserva.estado === 'CONFIRMADA'
                ? <CheckCircle size={15} style={{ color: '#3E9B6C', flexShrink: 0 }} />
                : <AlertCircle size={15} style={{ color: '#8F6215', flexShrink: 0 }} />}
              <p style={{ fontSize: 13, fontWeight: 700, color: miReserva.estado === 'CONFIRMADA' ? '#3E9B6C' : '#8F6215' }}>
                {miReserva.estado === 'CONFIRMADA' ? 'Ya tienes esta clase reservada' : 'Estás en lista de espera'}
              </p>
            </div>
          )}

          {/* Solo con plaza CONFIRMADA — nunca en lista de espera, coherente
              con lo que este mismo bloque ya distingue arriba. */}
          {miReserva?.estado === 'CONFIRMADA' && (
            <button
              type="button"
              onClick={() => router.push(`/portal/${slug}/clases/${sesionId}/sesion-guiada`)}
              style={{ marginTop: 12, width: '100%', height: 44, borderRadius: 16, border: `1px solid ${t.line}`, background: 'none', color: t.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              Empezar la sesión guiada
            </button>
          )}
        </div>

        {/* Acción — con holgura inferior para la tab bar flotante del portal
            (position:absolute, ~96px desde abajo). Sin ella, en clases con
            descripción media la página no llega a hacer scroll (el root es
            minHeight:100%) y el botón "Reservar" quedaba tapado por el menú. */}
        <div style={{ marginTop: 20, paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
          {miReserva ? (
            <Button
              variant="danger"
              onClick={() => setConfirmandoCancelar(true)}
              style={{ width: '100%' }}
            >
              Cancelar reserva
            </Button>
          ) : (
            <Button
              onClick={() => { if (session?.socioId) setReservando(true); }}
              style={{ width: '100%' }}
            >
              {libres > 0
                ? (cubierta || precioClaseSuelta == null ? 'Reservar' : `Reservar · ${precioClaseSuelta} €`)
                : 'Unirme a la lista de espera'}
            </Button>
          )}
        </div>
      </div>

      <BottomSheet open={confirmandoCancelar} onClose={() => setConfirmandoCancelar(false)}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: t.ink }}>¿Cancelar esta clase?</h2>
        <p style={{ fontSize: 13, color: t.muted }}>
          Perderás tu plaza y liberarás el hueco para otra socia.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setConfirmandoCancelar(false)} style={{ flex: 1 }}>Volver</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmandoCancelar(false);
              if (!miReserva) return;
              void cancelarReserva(miReserva.id).then(r => setAviso(r.ok ? { texto: 'Reserva cancelada.', error: false } : { texto: r.error, error: true }));
            }}
            style={{ flex: 1 }}
          >
            Sí, cancelar
          </Button>
        </div>
      </BottomSheet>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />

      <HojaReserva
        clase={reservando ? claseParaReservar : null}
        onClose={() => setReservando(false)}
        onConfirmar={confirmar}
      />
    </div>
  );
}
