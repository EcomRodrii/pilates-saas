'use client';

import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio, REFRESCO_ACTIVO_MS } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { ChevronLeft, Clock, Users, MapPin, BarChart3, Star, CheckCircle2, AlertTriangle, UserPlus, Check } from 'lucide-react';
import { Button, BottomSheet, Toast, AforoIndicator, type AvisoToast } from '@/components/portal/ui';
import { HojaReserva, type ClaseParaReservar, type ResultadoConfirmar } from '@/components/portal/hoja-reserva';
import { formatFechaLarga } from '@/lib/utils';
import { esSlotRecurrente, yaTienePlazaFijaEnSlot } from '@/lib/plaza-fija-portal';
import { imagenDeClase, alFallarImagen, IMAGENES_CLASE } from '@/lib/imagenes-por-defecto';
import { portalAuthHeader } from '@/lib/api-client';
import { mensajeConfirmarReserva } from '@/lib/reserva-confirmacion-mensaje';
import {
  fetchQuienVaAEstaClase, enviarSolicitudCompanera, type QuienVaAEstaClase,
} from '@/lib/social-companeras-portal.ts';

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
  const { studio, sesiones, reservas, tiposClase, salas, instructores, spots, planesTarifa, suscripciones, plazasFijas, addReserva, cancelarReserva, crearPlazaFijaPropia, favoritos, toggleFavorito, refrescarAforo } = useStudio();

  // Mismo parche de Fase 1/3 que PortalClasesView (ver REFRESCO_ACTIVO_MS en
  // studio-context.tsx): esta pantalla también deja reservar, así que
  // también necesita el aforo fresco mientras está abierta. Igual que allí:
  // solo el aforo (`refrescarAforo`, no `recargarPublico`), y nada con la
  // pestaña oculta, porque entonces no lo mira nadie.
  const recargarRef = useRef(refrescarAforo);
  useEffect(() => { recargarRef.current = refrescarAforo; });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      recargarRef.current();
    }, REFRESCO_ACTIVO_MS);
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

  // El id se saca FUERA del memo a propósito: la guarda estrecha `session` y la
  // línea siguiente lo leía como `session.socioId` (ya sin `?.`), así que el
  // compilador de React deducía como dependencia el objeto `session` entero —
  // más ancha que el `session?.socioId` declarado a mano — y ante esa
  // discrepancia renunciaba a optimizar la pantalla COMPLETA.
  const socioId = session?.socioId;
  const miReserva = useMemo(() => {
    if (!ses || !socioId) return null;
    return reservas.find(r => r.sesionId === ses.id && r.socioId === socioId && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA')) ?? null;
  }, [ses, reservas, socioId]);

  // Feature #2 (ficha Lorari-vs-Tentare): "Hacer mi plaza fija" — solo se
  // ofrece cuando esta clase de verdad se repite cada semana a la misma hora
  // y sala. Lógica pura en lib/plaza-fija-portal.ts (testeada aparte).
  // Estable durante la vida de la página (mismo patrón que portal-clases-view.tsx):
  // con Date.now() a secas dentro del useMemo, el compilador de React lo marca
  // como función impura en un cuerpo que debe ser puro.
  const ahora = useMemo(() => new Date(), []);
  const esRecurrente = useMemo(() => (ses ? esSlotRecurrente(ses, sesiones, ahora) : false), [ses, sesiones, ahora]);
  const yaTienePlazaFijaAqui = useMemo(
    () => (ses && socioId ? yaTienePlazaFijaEnSlot(ses, socioId, plazasFijas) : false),
    [ses, socioId, plazasFijas],
  );
  const [creandoPlazaFija, setCreandoPlazaFija] = useState(false);

  // "Quién más va a esta clase" (social graph, última pieza de Community &
  // Messaging OS). Se omite la sección entera si no hay nada que enseñar —
  // ni "vas sola" ni un hueco vacío: podría ser información no deseada
  // también, así que por defecto no se dice nada.
  const [quienVa, setQuienVa] = useState<QuienVaAEstaClase | null>(null);
  const [solicitudEnCurso, setSolicitudEnCurso] = useState<string | null>(null);
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<Set<string>>(new Set());

  const sesionIdActual = ses?.id;
  const studioIdActual = studio?.id;
  useEffect(() => {
    if (!sesionIdActual || !studioIdActual || !socioId) return;
    let vivo = true;
    (async () => {
      const headers = await portalAuthHeader();
      const r = await fetchQuienVaAEstaClase(headers, studioIdActual, sesionIdActual);
      if (!vivo) return;
      if ('error' in r) return; // silencioso: es un extra, no un dato crítico de la clase.
      setQuienVa(r);
    })();
    return () => { vivo = false; };
  }, [sesionIdActual, studioIdActual, socioId]);

  async function pedirSerCompanera(destinatariaSocioId: string) {
    if (!studio?.id || solicitudEnCurso) return;
    setSolicitudEnCurso(destinatariaSocioId);
    const headers = await portalAuthHeader();
    const r = await enviarSolicitudCompanera(headers, studio.id, destinatariaSocioId);
    setSolicitudEnCurso(null);
    if ('error' in r) { setAviso({ texto: r.error, error: true }); return; }
    setSolicitudesEnviadas(prev => new Set(prev).add(destinatariaSocioId));
    setAviso({ texto: r.yaExistia ? 'Ya hay una solicitud con esta persona.' : 'Solicitud enviada.' });
  }

  async function hacerPlazaFija() {
    if (!ses || creandoPlazaFija) return;
    // Capturado ANTES de llamar: si ya tenía reserva en esta sesión,
    // `reservaEstaSemana` vuelve null porque no hacía falta tocar nada — no
    // porque el intento de esta semana fallara. Sin distinguir los dos casos,
    // un aforo lleno justo al crear la plaza fija se anunciaba con el mismo
    // "reservamos tu sitio" que si de verdad se hubiera reservado.
    const yaLaTeniaReservada = !!miReserva;
    setCreandoPlazaFija(true);
    const r = await crearPlazaFijaPropia(ses.id);
    setCreandoPlazaFija(false);
    if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
    const semanaFallida = !yaLaTeniaReservada && !r.reservaEstaSemana;
    setAviso({
      texto: semanaFallida
        ? 'Plaza fija creada, pero esta clase de hoy no se pudo reservar (sin hueco). A partir de la semana que viene, ya es automático.'
        : 'Plaza fija creada. Reservamos tu sitio cada semana a esta hora.',
      error: false,
    });
  }

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
    // F-16 (auditoría 20ª pasada): mensaje canónico compartido con las otras
    // dos pantallas que llaman a addReserva con un sitio elegido — esta no
    // distinguía PENDIENTE_APROBACION de CONFIRMADA, y nunca avisaba si el
    // sitio elegido se lo daban a otra persona antes.
    setAviso({ texto: mensajeConfirmarReserva(r, spotId), error: false });
    return { ok: true, estado: r.estado };
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const formatDayFull = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!ses) {
    return (
      <div style={{ background: '#FAF9F5', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ fontWeight: 800, color: '#1A1A1A', fontSize: 16 }}>Esta clase ya no está disponible</p>
        {/* ⚠️ `<Link>` y no un `<button onClick={router.push}>`, que es lo que
            había: un botón que navega con JavaScript NO HACE NADA hasta que la
            página hidrata. En un móvil lento la socia toca la flecha de volver
            y no pasa nada — la misma sensación de «la app no responde» que ya
            costó otros arreglos. Un enlace navega igual sin JS, y Next lo
            precarga.

            Es también la causa de que `portal-bonos-compras` fallara en la
            PRIMERA pasada de CI y pasara al relanzar: en frío la hidratación
            llega tarde y el clic se pierde. Se arregla en la app, no en el
            test. */}
        <Link
          href={`/portal/${slug}/clases`}
          style={{ marginTop: 16, fontSize: 13, fontWeight: 800, color: '#3E6B4A', background: 'none', border: 'none' }}
        >
          Volver a Clases
        </Link>
      </div>
    );
  }

  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#98A093' };

  return (
    <div style={{ minHeight: '100%', background: '#FAF9F5' }}>
      {/* Header */}
      {/* La foto es del TIPO de clase, no de esta sesión: todas las sesiones de
          «Reformer» la comparten. Sin foto propia entra la de su familia
          (reformer/mat/máquina/yoga/hiit, adivinada por el nombre), así que el
          degradado a secas ya no se ve nunca — pero el velo de color sigue
          encima y es lo que hace que la foto sea de ESTA clase. */}
      <div style={{ padding: '24px 20px 40px', position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenDeClase(tipo)}
          alt=""
          onError={alFallarImagen(IMAGENES_CLASE.generica)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${color}ee, ${color}66)` }} />
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
              <BarChart3 size={16} style={{ color: '#fff' }} />
            </div>
          </div>
        </div>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '4px 12px', marginBottom: 12 }}>
          {NIVEL_LABEL[tipo?.nivel ?? 'TODOS']}
        </span>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{tipo?.nombre ?? 'Clase'}</h1>
      </div>

      <div style={{ padding: '0 16px 32px', marginTop: -20 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, padding: 20, border: '1px solid #E5E3DA', boxShadow: '0 16px 40px -20px rgba(26,26,26,.18)' }}>
          {/* Instructor */}
          {instr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid #E5E3DA' }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15, flexShrink: 0, backgroundColor: instr.color }}>
                {instr.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {instr.nombre}{sala ? ` · ${sala.nombre}` : ''}
                </p>
                <p style={{ fontSize: 12, color: '#5A5A52' }}>{instr.rol === 'PROPIETARIO' ? 'Directora' : 'Instructora'}</p>
              </div>
            </div>
          )}

          {/* Info row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 0', borderBottom: '1px solid #E5E3DA' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#98A093', marginBottom: 4 }}>
                <Clock size={14} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horario</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>{formatTime(ses.inicio)}–{formatTime(ses.fin)}</p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#98A093', marginBottom: 4 }}>
                <Users size={14} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plazas</span>
              </div>
              <AforoIndicator libres={libres} style={{ fontSize: 14, fontWeight: 800 }} />
            </div>
          </div>

          <div style={{ padding: '16px 0', borderBottom: '1px solid #E5E3DA', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5A5A52' }}>
            <MapPin size={14} style={{ color: '#98A093', flexShrink: 0 }} />
            <span style={{ textTransform: 'capitalize' }}>{formatDayFull(ses.inicio)}</span>
            {sala && <span>· {sala.nombre}</span>}
          </div>

          {/* Sobre la clase */}
          {tipo?.descripcion && (
            <div style={{ paddingTop: 16 }}>
              <p style={{ ...microLabel, marginBottom: 8 }}>Sobre la clase</p>
              <p style={{ fontSize: 14, color: '#5A5A52', lineHeight: 1.5 }}>{tipo.descripcion}</p>
            </div>
          )}

          {/* Quién más va — omitido por completo si no hay nada que decir
              (ni nombres visibles ni "y N más" agregado), decisión de
              privacidad explícita. */}
          {quienVa && (quienVa.companeras.length > 0 || quienVa.otrasSinNombre > 0) && (
            <div style={{ paddingTop: 16 }}>
              <p style={{ ...microLabel, marginBottom: 10 }}>Quién más va</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {quienVa.companeras.map(c => (
                  <div key={c.socioId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 999, background: '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1A1A1A', fontSize: 12, flexShrink: 0 }}>
                      {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <p style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre}
                    </p>
                    {/* Ya `nombreCompleto` significa que ya es compañera aceptada —
                        no necesita el botón. Solo se ofrece para las visibles por
                        `visible_en_clase` con las que todavía no hay relación. */}
                    {!c.nombreCompleto && (
                      solicitudesEnviadas.has(c.socioId) ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#5A5A52' }}>
                          <Check size={13} aria-hidden /> Enviada
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void pedirSerCompanera(c.socioId)}
                          disabled={solicitudEnCurso !== null}
                          aria-label={`Agregar a ${c.nombre} como compañera`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, background: 'none',
                            border: '1px solid #E5E3DA', borderRadius: 999, padding: '6px 12px',
                            fontSize: 12, fontWeight: 700, color: '#1A1A1A',
                            cursor: solicitudEnCurso !== null ? 'default' : 'pointer',
                            opacity: solicitudEnCurso !== null && solicitudEnCurso !== c.socioId ? 0.5 : 1,
                          }}
                        >
                          <UserPlus size={13} aria-hidden />
                          {solicitudEnCurso === c.socioId ? 'Enviando…' : 'Agregar'}
                        </button>
                      )
                    )}
                  </div>
                ))}
                {quienVa.otrasSinNombre > 0 && (
                  <p style={{ fontSize: 12.5, color: '#98A093' }}>
                    Y {quienVa.otrasSinNombre} persona{quienVa.otrasSinNombre === 1 ? '' : 's'} más.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Reservada badge — mismos tokens de éxito/aviso que ap-badge--ok /
              ap-badge--pocas (portal-app.css), en formato de banda con icono
              en vez de píldora pequeña. */}
          {miReserva && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 18, padding: '12px 16px', backgroundColor: miReserva.estado === 'CONFIRMADA' ? '#EAF0E7' : '#F6EEDD' }}>
              {miReserva.estado === 'CONFIRMADA'
                ? <CheckCircle2 size={15} style={{ color: '#2E5A3A', flexShrink: 0 }} />
                : <AlertTriangle size={15} style={{ color: '#8A6A25', flexShrink: 0 }} />}
              <p style={{ fontSize: 13, fontWeight: 700, color: miReserva.estado === 'CONFIRMADA' ? '#2E5A3A' : '#8A6A25' }}>
                {miReserva.estado === 'CONFIRMADA' ? 'Ya tienes esta clase reservada' : 'Estás en lista de espera'}
              </p>
            </div>
          )}

          {/* Solo con plaza CONFIRMADA — nunca en lista de espera, coherente
              con lo que este mismo bloque ya distingue arriba. */}
          {miReserva?.estado === 'CONFIRMADA' && (
            <button
              type="button"
              className="ap-btn"
              onClick={() => router.push(`/portal/${slug}/clases/${sesionId}/sesion-guiada`)}
              style={{ marginTop: 12, width: '100%', height: 44, borderRadius: 16, border: '1px solid #E5E3DA', background: 'transparent', color: '#1A1A1A', fontSize: 13, fontWeight: 800 }}
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
                // "por", nunca interpunto pegado al importe — mismo criterio
                // que el CTA del widget (P0 checkout).
                ? (cubierta || precioClaseSuelta == null ? 'Reservar' : `Reservar por ${precioClaseSuelta} €`)
                : 'Unirme a la lista de espera'}
            </Button>
          )}
          {/* Feature #2: solo si de verdad se repite cada semana a esta hora
              y sala, y todavía no la tiene como plaza fija. */}
          {socioId && esRecurrente && !yaTienePlazaFijaAqui && (
            <button
              type="button"
              className="ap-btn"
              onClick={() => void hacerPlazaFija()}
              disabled={creandoPlazaFija}
              style={{ marginTop: 12, width: '100%', height: 44, borderRadius: 16, border: '1px solid #E5E3DA', background: 'transparent', color: '#1A1A1A', fontSize: 13, fontWeight: 800, cursor: creandoPlazaFija ? 'default' : 'pointer', opacity: creandoPlazaFija ? 0.6 : 1 }}
            >
              {creandoPlazaFija ? 'Creando…' : 'Hacer mi plaza fija'}
            </button>
          )}
        </div>
      </div>

      <BottomSheet open={confirmandoCancelar} onClose={() => setConfirmandoCancelar(false)}>
        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.025em', color: '#1A1A1A' }}>¿Cancelar esta clase?</h2>
        <p style={{ fontSize: 13, color: '#5A5A52' }}>
          Perderás tu plaza y liberarás el hueco para otra socia.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setConfirmandoCancelar(false)} style={{ flex: 1 }}>Volver</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmandoCancelar(false);
              if (!miReserva) return;
              void cancelarReserva(miReserva.id).then(r => {
                if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
                // Cancelar una ocurrencia de plaza fija genera un crédito de
                // recuperación (crear_recuperacion) — antes esto se perdía en
                // silencio en pantalla, aunque el crédito sí quedaba concedido.
                if (r.recuperacionCreada) {
                  const caduca = r.recuperacionCaducaEl ? ` Recupérala antes del ${formatFechaLarga(r.recuperacionCaducaEl)}.` : '';
                  setAviso({
                    texto: `Reserva cancelada.${caduca}`, error: false,
                    accion: { texto: 'Reagendar', onClick: () => router.push(`/portal/${slug}/clases`) },
                  });
                  return;
                }
                setAviso({ texto: 'Reserva cancelada.', error: false });
              });
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
        onComprar={() => router.push(`/portal/${slug}/compras`)}
      />
    </div>
  );
}
