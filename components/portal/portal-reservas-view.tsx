'use client';

// RESERVAS — vista de presentación, desacoplada de la sesión real (Fase 4 del
// Theme Builder, mismo patrón que Home/Clases/Bonos/Perfil).
//
// `escribible = false` (solo en preview): cancelar/aceptar oferta de espera
// NO llaman a la API real — un socioId ficticio no tiene reservas propias
// (el filtro por `r.socioId === session.socioId` ya deja las listas vacías,
// mostrando los estados vacíos reales de cada pestaña), pero se guarda igual
// por si el estudio prueba con una sesión real desde otra pestaña del navegador.
//
// Valores literales (2026-09): esta pantalla pasa del sistema de tokens
// (`lib/portal-design.ts`, `useModo()`) al mismo sistema `--ap-*`/`.ap-*` de
// `app/portal/[slug]/portal-app.css` que ya usan Inicio/Horario/Bonos/Perfil,
// contra las capturas reales de "Tentare Studio App" — tarjeta de bono
// literal calcada de `PortalBonosView` (mismo número 48px/800, misma barra
// #EFEDE4/#4F8A5B), y el sheet de cancelación reemplaza al `BottomSheet`
// genérico de `components/portal/ui` para no tener dos hojas con dos
// lenguajes visuales distintos en la misma pantalla.
//
// ⚠️ El guard `studio?.requiereCheckinQr` de la tarjeta del pase es de HOY
// (mismo día que este rediseño) — se conserva tal cual, sin tocar su
// condición: sin QR obligatorio no hay nada que enseñar en la puerta.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { Calendar, Clock, MapPin, MessageCircle, Navigation, QrCode, Star, User as UserIcon } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { formatFechaCorta as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { Toast, type AvisoToast } from '@/components/portal/ui';
import { HojaPase, type DatosPase } from '@/components/portal/hoja-pase';
import { HojaOfertaEspera, type OfertaEspera } from '@/components/portal/hoja-oferta-espera';
import { BotonesCalendario } from '@/components/portal/botones-calendario';
import { pedirPaseDeAcceso } from '@/lib/api-client';
import type { PortalSession } from '@/lib/portal-auth';
import { useMensajesSinLeer } from '@/lib/use-mensajes-sin-leer.ts';
import { bonoActivo, fechaLarga, DIAS } from '@/lib/bonos-portal';
import { esCancelacionTardia, heredaOverride } from '@/lib/booking-logic';
import { tieneEntitlementActivo } from '@/lib/bono-logic';
import { EASE, dur, sans, cristal } from '@/lib/portal-design';

// Stub de "pedir pase" para preview: NO llama a la API real (socioId
// ficticio, 404/error garantizado) — mismo criterio que PortalClasesView.
async function pedirPaseDeMuestra(): Promise<DatosPase> {
  return {
    hayPase: true, vigente: true, yaAsistida: false, codigo: 'PREVIEW', token: null,
    paseHasta: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

type Tab = 'PROXIMAS' | 'PASADAS' | 'CANCELADAS' | 'ESPERA';

// Valor de "ahora" hasta que el efecto de montaje fija el de verdad (render del
// servidor y primer render del cliente). Es una constante de MÓDULO, no un
// `new Date()` en el cuerpo del componente: ese daba una referencia nueva en
// cada render y `porTab` —el reparto Próximas/Pasadas, los cuatro contadores de
// las pestañas y la tarjeta del pase— se recalculaba entero cada vez, con lo
// que su useMemo no memoizaba nada. Además servidor y navegador nunca coinciden
// en "ahora", así que un valor fijo es también lo único que garantiza que los
// dos pinten el mismo HTML. Qué fecha sea da igual: los datos del estudio
// (StudioProvider los carga en un efecto) todavía están vacíos en ese instante,
// así que las cuatro listas salen vacías con cualquier valor.
const FECHA_PLACEHOLDER_SSR = new Date('2026-06-29T00:00:00Z');

const ESTADO_LABEL: Record<string, { label: string; tono: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  CONFIRMADA: { label: 'Confirmada', tono: 'success' },
  LISTA_ESPERA: { label: 'Lista de espera', tono: 'warning' },
  ASISTIDA: { label: 'Asistida', tono: 'neutral' },
  CANCELADA: { label: 'Cancelada', tono: 'neutral' },
  NO_ASISTIO: { label: 'No asistió', tono: 'danger' },
};

// Copy específico por pestaña — antes las 4 compartían el mismo "Nada por
// aquí todavía" sin distinguir el motivo real de cada una.
const EMPTY_COPY: Record<Tab, { title: string; body: string }> = {
  PROXIMAS: { title: 'Sin clases reservadas', body: 'Mira los horarios de esta semana y reserva tu próxima sesión.' },
  PASADAS: { title: 'Aún no has asistido a ninguna clase', body: 'Cuando asistas a una clase, aparecerá aquí tu historial.' },
  CANCELADAS: { title: 'Sin reservas canceladas', body: 'Aquí verás las clases que hayas cancelado.' },
  ESPERA: { title: 'Sin lista de espera', body: 'Si una clase está completa, podrás apuntarte para el siguiente hueco libre.' },
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'PROXIMAS', label: 'Próximas' },
  { id: 'PASADAS', label: 'Pasadas' },
  { id: 'CANCELADAS', label: 'Canceladas' },
  { id: 'ESPERA', label: 'Lista de espera' },
];

/** Pastilla de estado — colores del bloque "Fila de clase"/badges del CHEATSHEET. */
function EstadoPill({ estado }: { estado: string }) {
  const info = ESTADO_LABEL[estado] ?? ESTADO_LABEL.CANCELADA;
  const colores = {
    success: { fg: '#2E5A3A', bg: '#EAF0E7' },
    warning: { fg: '#8A6A25', bg: '#F6EEDD' },
    danger: { fg: '#A04A3C', bg: '#F4E9E5' },
    neutral: { fg: '#5A5A52', bg: '#EFEDE4' },
  }[info.tono];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
        padding: '5px 11px', borderRadius: 999,
        fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.2em', paddingLeft: '.2em',
        textTransform: 'uppercase', color: colores.fg, background: colores.bg,
      }}
    >
      {info.label}
    </span>
  );
}

/** Bloque de fecha a la izquierda de cada tarjeta: día de la semana + número, mismo lenguaje que las tarjetas de "Esta semana" del Inicio. */
function BloqueFecha({ iso, apagado }: { iso: string; apagado: boolean }) {
  const d = new Date(iso);
  const diaSemana = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
  return (
    <div style={{ flex: '0 0 44px', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.2em', paddingLeft: '.2em',
        textTransform: 'uppercase', color: apagado ? '#98A093' : '#3E6B4A', textAlign: 'center',
      }}>
        {diaSemana}
      </div>
      <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, color: apagado ? '#98A093' : '#1A1A1A', marginTop: 4 }}>
        {d.getDate()}
      </div>
    </div>
  );
}

/** Estado vacío por pestaña: icono en círculo suave, titular bold, cuerpo sans, CTA cápsula si aplica. */
function EstadoVacio({ title, body, cta, onCta }: {
  title: string; body: string; cta?: string; onCta?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 8 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#EFEDE4', color: '#5A5A52', marginBottom: 6,
      }}>
        <Calendar size={20} strokeWidth={1.7} />
      </div>
      <p style={{ fontFamily: sans, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A' }}>{title}</p>
      <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', maxWidth: 240, lineHeight: 1.5 }}>{body}</p>
      {cta && onCta && (
        <button type="button" onClick={onCta} className="ap-btn ap-btn--primario" style={{ marginTop: 14, padding: '0 22px' }}>
          {cta}
        </button>
      )}
    </div>
  );
}

export function PortalReservasView({
  session, escribible = true, navegar,
}: { session: PortalSession | null; escribible?: boolean; navegar: (ruta: string) => void }) {
  const { slug } = useParams<{ slug: string }>();
  const {
    reservas, sesiones, tiposClase, salas, instructores, cancelarReserva, aceptarOfertaEspera,
    valorarExperienciaReserva, studio,
    // Gap 5 — bono/plaza fija/pagos, verificado en vivo contra el diseño
    // real: viven aquí, no en una pantalla "Bonos" aparte (esa pestaña
    // desapareció de la barra inferior en el rediseño — ver lib/portal-nav.ts).
    // Misma fuente de datos y mismos hooks de escritura que ya usa
    // PortalBonosView (components/portal/portal-bonos-view.tsx, que se deja
    // intacta: el editor de temas todavía la referencia para personalizar sus
    // bloques, así que no es código muerto a borrar, solo una pantalla sin
    // pestaña propia ya).
    suscripciones, planesTarifa, plazasFijas, recibos,
    pausarPlazaFijaPropia, reanudarPlazaFijaPropia, darDeBajaPlazaFijaPropia,
  } = useStudio();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  // "Cambiar hora" (Gap 2): no hay reprogramación real — se reutiliza el
  // MISMO sheet de cancelación, distinguiendo aquí si al confirmar hay que
  // además llevar a la socia a elegir otra clase.
  const [cambiandoHora, setCambiandoHora] = useState(false);
  const [paseAbierto, setPaseAbierto] = useState(false);
  // Si cancelar AHORA hace perder la sesión de verdad (fuera de ventana,
  // sin ser plaza fija ni "cambiar hora") — conduce el copy de los botones
  // del sheet de cancelación, verificado contra el diseño real.
  const cancelandoEsTardia = useMemo(() => {
    if (!cancelando || cambiandoHora || cancelando.id.startsWith('res-pf-')) return false;
    const s = sesiones.find(x => x.id === cancelando.sesionId);
    if (!s) return false;
    const ventana = heredaOverride(tiposClase.find(tc => tc.id === s.tipoClaseId)?.ventanaCancelacionHoras ?? null, studio?.cancelacionVentanaHoras ?? 0);
    return esCancelacionTardia(s.inicio, new Date(), ventana);
  }, [cancelando, cambiandoHora, sesiones, tiposClase, studio]);
  // Gap 1: mismo hook/criterio que Perfil — cero contador inventado.
  const mensajesSinLeer = useMensajesSinLeer(studio?.id ?? null);
  // Gap 4: id de la reserva cuya valoración está en vuelo, para deshabilitar
  // sus estrellas mientras se confirma con el servidor (sin escritura
  // optimista: la puntuación en pantalla solo cambia cuando `reservas` se
  // resincroniza con la respuesta real).
  const [valorandoId, setValorandoId] = useState<string | null>(null);
  // Gap 4 (fidelidad Tentare Studio App) — valorar abre un sheet de
  // confirmación en vez de guardar al primer toque de estrella: verificado
  // contra el diseño real ("¿Qué tal la clase del sábado?" + botón "Enviar
  // valoración" deshabilitado hasta elegir). `puntuacion` es la selección
  // EN CURSO dentro del sheet, no la valoración ya guardada.
  const [valorandoSheet, setValorandoSheet] = useState<{ reservaId: string; tituloClase: string; fecha: string } | null>(null);
  const [puntuacionElegida, setPuntuacionElegida] = useState<number | null>(null);
  // Id de la reserva cuya oferta la socia ya cerró tocando el fondo (sin
  // decidir) — para que el sheet no vuelva a abrirse solo en cada render
  // mientras la MISMA oferta siga viva. Si aparece una oferta distinta
  // (nueva reservaId), esto ya no la tapa: vuelve a abrirse sola, que es lo
  // urgente que tiene que ser.
  const [ofertaOcultaId, setOfertaOcultaId] = useState<string | null>(null);
  // Cancelar también puede fallar en el servidor. Cerrar la hoja sin mirar dejaba
  // a la socia creyendo que había cancelado, con la plaza todavía suya.
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const socioId = session?.socioId;

  // ── Bono, plaza fija, pagos (Gap 5) ───────────────────────────────────────
  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, socioId ?? null),
    [suscripciones, planesTarifa, tiposClase, socioId],
  );
  // ACTIVA o PAUSADA (para poder reanudarla); una en BAJA ya no cuenta como
  // "tiene plaza fija" — mismo criterio que PortalBonosView.
  const miPlazaFija = useMemo(
    () => plazasFijas.find(p => p.socioId === socioId && (p.estado === 'ACTIVA' || p.estado === 'PAUSADA')) ?? null,
    [plazasFijas, socioId],
  );
  const plaza = useMemo(() => {
    if (!miPlazaFija) return null;
    const hora = miPlazaFija.horaInicio.slice(0, 5);
    const sala = salas.find(s => s.id === miPlazaFija.salaId)?.nombre ?? null;
    const tipo = miPlazaFija.tipoClaseId ? tiposClase.find(tc => tc.id === miPlazaFija.tipoClaseId)?.nombre ?? null : null;
    const partes = [tipo, sala].filter(Boolean) as string[];
    return { cuando: `${DIAS[miPlazaFija.diaSemana] ?? ''} · ${hora}`.trim(), donde: partes.join(' · ') };
  }, [miPlazaFija, salas, tiposClase]);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [procesandoPlaza, setProcesandoPlaza] = useState(false);

  async function pausarOReanudar() {
    if (!miPlazaFija || procesandoPlaza) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); return; }
    setProcesandoPlaza(true);
    const r = miPlazaFija.estado === 'ACTIVA'
      ? await pausarPlazaFijaPropia(miPlazaFija.id)
      : await reanudarPlazaFijaPropia(miPlazaFija.id);
    setProcesandoPlaza(false);
    if (!r.ok) setAviso({ texto: r.error, error: true });
  }

  async function confirmarBajaPlaza() {
    setConfirmandoBaja(false);
    if (!miPlazaFija) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); return; }
    const r = await darDeBajaPlazaFijaPropia(miPlazaFija.id);
    setAviso(r.ok ? { texto: 'Plaza fija dada de baja.', error: false } : { texto: r.error, error: true });
  }

  // Pagos reales de ESTA socia, los últimos primero — nada de "recibo
  // enviado por email" (el diseño lo dice, pero este repo no rastrea ESO
  // como hecho verificable por pago; decirlo sin saberlo sería inventar).
  const pagos = useMemo(
    () => recibos
      .filter(r => r.socioId === socioId && r.estado === 'COBRADO' && r.fechaCobro)
      .sort((a, b) => new Date(b.fechaCobro as string).getTime() - new Date(a.fechaCobro as string).getTime())
      .slice(0, 5),
    [recibos, socioId],
  );
  // Sin `setInterval`, a diferencia del reloj del Inicio: aquí no se pinta
  // ninguna cuenta atrás, "ahora" solo decide de qué lado del corte cae cada
  // reserva. Basta con fijarlo una vez al montar.
  const [now, setNow] = useState(FECHA_PLACEHOLDER_SSR);
  useEffect(() => {
    // Un render de más al montar, a cambio de que servidor y cliente pinten lo
    // mismo: la hora real solo se puede leer ya en el navegador, y hacerlo en
    // el cuerpo del render es justo lo que rompía la memoización de `porTab`.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer el reloj del navegador exige estar montada; el valor inicial es la constante determinista que comparten servidor y cliente.
    setNow(new Date());
  }, []);

  const misReservas = useMemo(() =>
    reservas
      .filter(r => r.socioId === socioId)
      .map(r => ({ r, s: sesiones.find(x => x.id === r.sesionId) ?? null }))
      .filter((x): x is { r: Reserva; s: Sesion } => !!x.s),
  [reservas, sesiones, socioId]);

  const porTab = useMemo(() => {
    const proximas = misReservas
      .filter(x => x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) >= now)
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    const pasadas = misReservas
      .filter(x => x.r.estado === 'ASISTIDA' || x.r.estado === 'NO_ASISTIO' || (x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) < now))
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const canceladas = misReservas
      .filter(x => x.r.estado === 'CANCELADA')
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const espera = misReservas
      .filter(x => x.r.estado === 'LISTA_ESPERA')
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    return { PROXIMAS: proximas, PASADAS: pasadas, CANCELADAS: canceladas, ESPERA: espera };
  }, [misReservas, now]);

  const lista = porTab[tab];
  const proximaClase = porTab.PROXIMAS[0] ?? null;

  // "Hay N clases hoy cerca de ti que encajan con tu bono" — verificado
  // contra capturas reales de Claude Design: el estado vacío de PRÓXIMAS no
  // es genérico, cuenta clases de HOY que la socia puede reservar de verdad
  // con lo que ya tiene. Reutiliza `tieneEntitlementActivo` (el mismo check
  // que decide si puede reservar en `crearReservaPublica`), no una
  // aproximación aparte — sin comprobar aforo en tiempo real (una clase ya
  // llena cuenta igual), que es justo lo que "Verlas" deja ver de verdad.
  const clasesHoyConBono = useMemo(() => {
    if (!socioId) return 0;
    const hoyISO = now.toISOString().slice(0, 10);
    const finDia = new Date(now); finDia.setHours(23, 59, 59, 999);
    return sesiones.filter(s => {
      if (s.cancelada) return false;
      const inicio = new Date(s.inicio);
      if (inicio < now || inicio > finDia) return false;
      return tieneEntitlementActivo(socioId, suscripciones, planesTarifa, hoyISO, s.tipoClaseId);
    }).length;
  }, [sesiones, socioId, suscripciones, planesTarifa, now]);

  // Oferta de plaza liberada (Fase 2b) con plazo vivo — sea cual sea la
  // pestaña abierta, es urgente y se enseña en un sheet global (más abajo),
  // no solo dentro de la pestaña ESPERA. `now` es el mismo reloj fijado al
  // montar que usa `porTab` (no tickea): si la oferta caduca mientras la
  // pantalla lleva rato abierta sin recargarse, el propio sheet ya lo refleja
  // con su cuenta atrás en vivo — esto solo decide si hay algo que abrir.
  const ofertaActiva: OfertaEspera | null = useMemo(() => {
    const activa = misReservas.find(
      x => x.r.estado === 'LISTA_ESPERA' && !!x.r.ofertaExpiraEn && new Date(x.r.ofertaExpiraEn) > now,
    );
    if (!activa) return null;
    return {
      reservaId: activa.r.id,
      ofertaExpiraEn: activa.r.ofertaExpiraEn as string,
      sesion: activa.s,
      tipo: tiposClase.find(tc => tc.id === activa.s.tipoClaseId) ?? null,
      sala: salas.find(sl => sl.id === activa.s.salaId) ?? null,
      instr: instructores.find(i => i.id === activa.s.instructorId) ?? null,
    };
  }, [misReservas, now, tiposClase, salas, instructores]);

  // Cerrar el sheet tocando el fondo NO cuenta como "rechazar" — solo lo
  // oculta hasta que aparezca una oferta DISTINTA (otra reservaId). Mientras
  // tanto, la reserva sigue viéndose en la pestaña ESPERA con su pastilla de
  // estado — esa es la red de seguridad si se cierra sin decidir.
  const mostrarSheetOferta = ofertaActiva != null && ofertaActiva.reservaId !== ofertaOcultaId;

  async function onAceptarOferta(reservaId: string): Promise<ResultadoEscritura> {
    if (!escribible) {
      setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false });
      return { ok: true };
    }
    return aceptarOfertaEspera(reservaId);
  }

  // "Dejarla pasar" es `cancelarReserva` de siempre — cancelar una reserva en
  // LISTA_ESPERA con oferta viva libera el hueco y promueve a la siguiente en
  // el backend, sin necesitar ningún endpoint nuevo de "rechazar oferta".
  // Cierto SOLO desde la migración 20260829120000 (ver hoja-oferta-espera.tsx).
  async function onDejarPasarOferta(reservaId: string): Promise<ResultadoEscritura> {
    if (!escribible) {
      setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false });
      return { ok: true };
    }
    return cancelarReserva(reservaId);
  }

  // Gap 4 — valorar una clase ya ASISTIDA. Sin escritura optimista: se espera
  // la respuesta real (`postPublico` resincroniza `reservas` desde el
  // servidor) antes de soltar el spinner, así que la estrella que se ve tras
  // recargar es siempre la misma que la que se ve al momento.
  async function onValorar(reservaId: string, valoracion: number) {
    if (!escribible) {
      setAviso({ texto: 'Vista previa: esta valoración no se guarda de verdad.', error: false });
      setValorandoSheet(null);
      setPuntuacionElegida(null);
      return;
    }
    if (valorandoId) return;
    setValorandoId(reservaId);
    const r = await valorarExperienciaReserva(reservaId, valoracion);
    setValorandoId(null);
    if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
    setValorandoSheet(null);
    setPuntuacionElegida(null);
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)' }}>
      {/* Cabecera — mismo par volanta/titular que el resto de pantallas
          migradas: la micro-etiqueta cuenta el total, el titular dice qué es
          esto. */}
      <div style={{ padding: '28px 24px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ap-label">
            {misReservas.length} {misReservas.length === 1 ? 'reserva en total' : 'reservas en total'}
          </div>
          {/* El texto exacto "Mis reservas" se conserva a propósito — es el
              ancla de accesibilidad que usan los e2e de esta pantalla
              (`portal-preview-perfil-reservas.spec.ts`,
              `getByRole('heading', { name: 'Mis reservas' })`). */}
          <h1 style={{ fontFamily: sans, fontSize: 32, fontWeight: 800, letterSpacing: '-.035em', color: '#1A1A1A', marginTop: 10 }}>
            Mis reservas
          </h1>
        </div>
        {/* Gap 1 — acceso a Mensajes desde Reservas, mismo círculo con punto de
            "sin leer" que usa la campana del Inicio (mismo hook,
            `useMensajesSinLeer`, cero contador inventado). */}
        <button
          type="button"
          onClick={() => navegar(`/portal/${slug}/mensajes`)}
          aria-label={mensajesSinLeer > 0 ? `Mensajes, ${mensajesSinLeer} sin leer` : 'Mensajes'}
          style={{
            position: 'relative', width: 40, height: 40, flex: '0 0 40px', marginTop: 4,
            borderRadius: '50%', border: '1px solid #E5E3DA',
            background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 16px -8px rgba(26,26,26,.25)', cursor: 'pointer',
          }}
        >
          <MessageCircle size={18} strokeWidth={1.9} style={{ color: '#1A1A1A' }} />
          {mensajesSinLeer > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: '#4F8A5B' }} />
          )}
        </button>
      </div>

      <div style={{ padding: '20px 24px 24px' }}>
        {/* El pase vivía enterrado dentro de cada tarjeta de Clases — aquí, la
            pantalla dedicada a "mis reservas", no había ningún acceso a él en
            absoluto. Una tarjeta fija arriba (Fase 2, feedback de 49
            propietarias: "el pase de acceso debería destacar") en vez de una
            quinta pestaña: no es una lista más, es la acción que se repite
            cada vez que la socia entra al estudio. */}
        {proximaClase && (studio?.requiereCheckinQr ?? true) && (
          <button
            type="button"
            onClick={() => setPaseAbierto(true)}
            className="ap-card"
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              marginBottom: 16, padding: '16px 16px 16px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 15, flexShrink: 0,
              background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <QrCode size={19} color="#F1ECE1" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: sans, fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>Tu pase de acceso</p>
              <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tiposClase.find(tc => tc.id === proximaClase.s.tipoClaseId)?.nombre ?? 'Clase'} · {formatFecha(proximaClase.s.inicio)} {formatHora(proximaClase.s.inicio)}
              </p>
            </div>
            <span aria-hidden style={{ fontSize: 15, color: '#3E6B4A', flexShrink: 0 }}>→</span>
          </button>
        )}

        {/* "Tu plaza fija" — verificado en vivo contra el diseño real.
            Mismos datos y mismas acciones (autoservicio, Feature #2 de la
            ficha Lorari-vs-Tentare) que ya usa PortalBonosView; no se
            reimplementa la lógica, solo se repite el pintado aquí porque el
            diseño lo pone en Reservas, no en una pantalla propia. */}
        {plaza && miPlazaFija && (
          <div style={{
            marginBottom: 16, borderRadius: 20,
            background: '#EEF0EA', border: '1px solid rgba(44,53,44,.14)',
            padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1A1A1A' }} />
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.24em',
                  paddingLeft: '.24em', textTransform: 'uppercase', color: '#1A1A1A',
                }}>
                  Plaza fija
                </span>
              </div>
              {miPlazaFija.estado === 'PAUSADA' && (
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 8, fontWeight: 700, letterSpacing: '.2em',
                  paddingLeft: '.2em', textTransform: 'uppercase', color: '#5A5A52',
                }}>
                  En pausa
                </span>
              )}
            </div>
            <div style={{ fontFamily: sans, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05, color: '#1A1A1A', marginTop: 10, opacity: miPlazaFija.estado === 'PAUSADA' ? 0.55 : 1 }}>
              {plaza.cuando}
            </div>
            {plaza.donde && (
              <div style={{ fontFamily: sans, fontSize: 11.5, color: '#5A5A52', marginTop: 8 }}>{plaza.donde}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => void pausarOReanudar()}
                disabled={procesandoPlaza}
                style={{
                  flex: 1, height: 38, borderRadius: 12, border: '1px solid rgba(44,53,44,.2)',
                  background: 'none', color: '#1A1A1A', fontFamily: sans, fontSize: 11.5, fontWeight: 700,
                  cursor: procesandoPlaza ? 'default' : 'pointer', opacity: procesandoPlaza ? 0.6 : 1,
                }}
              >
                {miPlazaFija.estado === 'ACTIVA' ? 'Pausar' : 'Reanudar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoBaja(true)}
                disabled={procesandoPlaza}
                style={{
                  flex: 1, height: 38, borderRadius: 12, border: '1px solid rgba(44,53,44,.2)',
                  background: 'none', color: '#C2503A', fontFamily: sans, fontSize: 11.5, fontWeight: 700,
                  cursor: procesandoPlaza ? 'default' : 'pointer', opacity: procesandoPlaza ? 0.6 : 1,
                }}
              >
                Dar de baja
              </button>
            </div>
          </div>
        )}

        {/* "Bono"/"Tu plan" — mismo bloque literal que PortalBonosView,
            condensado (sin la lista expandida de bonos en cola: eso sigue
            siendo trabajo de la pantalla dedicada, /bonos, enlazada desde
            "Comprar otro"). */}
        {bono && (
          <div className="ap-card" style={{ marginBottom: 16, padding: '22px 20px' }}>
            {/* Cabecera: nombre + fecha (nunca "Activo" suelto) — verificado
                contra capturas reales. La fecha absoluta (caduca 12 oct) va
                arriba, junto al nombre; el texto de urgencia/caducado
                (cuando aplica) baja a su propia línea bajo la barra. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontFamily: sans, fontSize: 15.5, fontWeight: 800, color: '#1A1A1A' }}>
                {bono.bonos.length > 1 ? 'Tu saldo' : bono.nombre}
              </div>
              {bono.caducaEn && (
                <div style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.18em',
                  paddingLeft: '.18em', textTransform: 'uppercase', color: '#5A5A52', whiteSpace: 'nowrap',
                }}>
                  {bono.esMensual ? 'renueva' : 'caduca'} {fechaLarga(bono.caducaEn)}
                </div>
              )}
            </div>
            {bono.totalSesiones != null && bono.totalRestantes != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 20 }}>
                  <span style={{ fontFamily: sans, fontSize: 48, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', lineHeight: 0.9 }}>
                    {bono.totalRestantes}
                  </span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: '#5A5A52' }}>de {bono.totalSesiones} sesiones</span>
                </div>
                {/* CHEATSHEET-CSS.md, "Card bono": fondo #EFEDE4, relleno #4F8A5B. */}
                <div style={{ height: 5, borderRadius: 999, background: '#EFEDE4', marginTop: 18, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(0, Math.min(100, Math.round((bono.totalRestantes / bono.totalSesiones) * 100)))}%`,
                    height: '100%', borderRadius: 999,
                    background: bono.caducado ? '#C2503A' : bono.urgente ? '#C99A3C' : '#4F8A5B',
                    transition: 'width .6s',
                  }} />
                </div>
              </>
            ) : (
              <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: '#1A1A1A', marginTop: 20 }}>Sesiones ilimitadas</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: sans, fontSize: 11, fontWeight: bono.urgente || bono.caducado ? 700 : 400,
                color: bono.caducado ? '#C2503A' : bono.urgente ? '#C99A3C' : '#5A5A52',
              }}>
                {bono.textoCaducidad ?? (bono.caducaEn ? '' : bono.esMensual ? 'Activo' : 'Sin fecha de caducidad')}
              </span>
              <button
                type="button"
                onClick={() => navegar(`/portal/${slug}/compras`)}
                style={{
                  height: 36, padding: '0 16px', borderRadius: 999, border: 'none',
                  background: 'none', color: '#3E6B4A', fontFamily: sans, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {bono.esMensual ? 'Gestionar mi plan' : 'Comprar otro →'}
              </button>
            </div>
          </div>
        )}

        {/* "PAGOS" — recibos reales de esta socia (Recibo.estado === 'COBRADO'),
            verificado en vivo contra el diseño real. Sin la afirmación
            "recibo enviado por email" del diseño: este repo no rastrea eso
            como hecho verificable por pago, y decirlo sin saberlo sería
            inventar un dato. */}
        {pagos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="ap-label" style={{ marginBottom: 10 }}>Pagos</div>
            <div className="ap-card" style={{ padding: '4px 16px' }}>
              {pagos.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0',
                    borderTop: i > 0 ? '1px solid #E5E3DA' : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.concepto}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 2 }}>
                      {fechaLarga(r.fechaCobro as string)}
                    </div>
                  </div>
                  <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{r.importe} €</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pestañas — chips de cápsula deslizables, mismo lenguaje que los
            filtros de tipo de clase de PortalClasesView: nunca el segmented
            control gris del sistema saliente. */}
        <div
          role="tablist"
          aria-label="Filtrar reservas"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -24px', padding: '0 24px 4px', scrollbarWidth: 'none' } as React.CSSProperties}
        >
          {TABS.map(({ id, label }) => {
            const activo = id === tab;
            const n = porTab[id].length;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={activo}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  flex: '0 0 auto', height: 40, padding: '0 16px', borderRadius: 999,
                  background: activo ? '#1A1A1A' : '#FFFFFF',
                  color: activo ? '#F1ECE1' : '#5A5A52',
                  border: `1px solid ${activo ? 'transparent' : '#E5E3DA'}`,
                  fontFamily: sans, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                {label}{n > 0 ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>

        <div style={{ height: 20 }} />

        {lista.length === 0 && tab === 'PROXIMAS' ? (
          // Verificado contra capturas reales de Claude Design: tarjeta de
          // borde discontinuo con copy DINÁMICO ("Hay N clases hoy cerca de
          // ti..."), no el estado vacío genérico de las otras tres pestañas
          // (esas sí conservan `EstadoVacio` — el diseño no las cubre).
          <div style={{
            border: '1.5px dashed #E5E3DA', borderRadius: 16, padding: '28px 24px',
            textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <p style={{ fontFamily: sans, fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>No tienes clases próximas</p>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', lineHeight: 1.5 }}>
              {clasesHoyConBono > 0
                ? `Hay ${clasesHoyConBono} ${clasesHoyConBono === 1 ? 'clase hoy' : 'clases hoy'} cerca de ti que ${clasesHoyConBono === 1 ? 'encaja' : 'encajan'} con tu bono.`
                : 'Mira los horarios de esta semana y reserva tu próxima sesión.'}
            </p>
            <button type="button" onClick={() => navegar(`/portal/${slug}/clases`)} className="ap-btn ap-btn--primario" style={{ marginTop: 8, height: 44, padding: '0 22px', fontSize: 13 }}>
              {clasesHoyConBono > 0 ? 'Verlas' : 'Ver horarios'}
            </button>
          </div>
        ) : lista.length === 0 ? (
          <EstadoVacio {...EMPTY_COPY[tab]} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lista.map(({ r, s }) => {
              const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
              const sala = salas.find(x => x.id === s.salaId);
              const instr = instructores.find(i => i.id === s.instructorId);
              const puedeCancel = r.estado === 'CONFIRMADA' && new Date(s.inicio) > now;
              const apagado = r.estado === 'CANCELADA' || r.estado === 'NO_ASISTIO' || (r.estado !== 'LISTA_ESPERA' && new Date(s.inicio) < now);
              return (
                <div key={r.id} className="ap-card" style={{ padding: 18, opacity: apagado ? 0.72 : 1 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <BloqueFecha iso={s.inicio} apagado={apagado} />
                    <div style={{ width: 1, background: '#E5E3DA', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{
                          fontFamily: sans, fontSize: 15, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.15,
                          color: apagado ? '#98A093' : '#1A1A1A', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {tipo?.nombre ?? 'Clase'}
                        </div>
                        <EstadoPill estado={r.estado} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>
                        <Clock size={11} /> {formatHora(s.inicio)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 8, fontFamily: sans, fontSize: 11, color: '#98A093' }}>
                        {instr && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><UserIcon size={11} />{instr.nombre}</span>}
                        {sala && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={11} />{sala.nombre}</span>}
                      </div>
                    </div>
                  </div>

                  {/* La interacción real (aceptar/dejar pasar, con cuenta
                      atrás en vivo) vive ahora en el sheet global
                      `HojaOfertaEspera`, que se abre solo en cuanto hay una
                      oferta viva — sea cual sea la pestaña abierta. Esto es
                      la red de seguridad si esa socia cerró el sheet sin
                      decidir: sigue viendo aquí que hay una oferta y puede
                      reabrirlo, sin duplicar la cuenta atrás en dos sitios a
                      la vez. */}
                  {r.estado === 'LISTA_ESPERA' && r.ofertaExpiraEn && (
                    <button
                      type="button"
                      onClick={() => setOfertaOcultaId(null)}
                      style={{
                        width: '100%', height: 42, marginTop: 14, borderRadius: 21, border: 'none',
                        background: '#F6EEDD', color: '#8A6A25',
                        fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Se ha liberado una plaza — ver oferta
                    </button>
                  )}

                  {/* Gap 3 — posición real en la lista de espera. Dato YA
                      calculado y mantenido por el servidor (`posicionEspera`,
                      renumerado por la RPC en cada cancelación/promoción —
                      migr 0104), nunca una cuenta hecha en el cliente. Se
                      omite mientras hay una oferta viva: en ese momento ya no
                      está "en cola", se le está ofreciendo el hueco. */}
                  {r.estado === 'LISTA_ESPERA' && r.posicionEspera != null && !r.ofertaExpiraEn && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontFamily: sans, fontSize: 11, color: '#98A093' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
                        background: '#EFEDE4', fontSize: 9.5, fontWeight: 700, color: '#5A5A52',
                      }}>
                        #{r.posicionEspera}
                      </span>
                      {r.posicionEspera === 1 ? 'La próxima en entrar si se libera un hueco' : `Posición ${r.posicionEspera} en la lista de espera`}
                    </div>
                  )}

                  {/* Gap 4 — valorar una clase YA ASISTIDA, autoservicio.
                      Solo aparece sobre reservas ASISTIDA: el CHECK de la BD
                      (migr 20260828…) impide guardar sobre cualquier otro
                      estado, así que ni se ofrece aquí. Una vez valorada
                      (`r.valoracionExperiencia` ya no es null) se enseña la
                      puntuación dada, sin permitir tocarla otra vez — mismo
                      criterio "sin edición" que el resto de valoraciones del
                      producto (0044). */}
                  {r.estado === 'ASISTIDA' && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E3DA' }}>
                      {r.valoracionExperiencia != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 2 }} aria-hidden>
                            {[1, 2, 3, 4, 5].map(n => (
                              <Star
                                key={n}
                                size={16}
                                strokeWidth={1.7}
                                fill={n <= (r.valoracionExperiencia as number) ? '#4F8A5B' : 'none'}
                                style={{ color: n <= (r.valoracionExperiencia as number) ? '#4F8A5B' : '#98A093' }}
                              />
                            ))}
                          </div>
                          <span style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>Ya has valorado esta clase</span>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginBottom: 8 }}>¿Qué tal la clase?</p>
                          <div role="group" aria-label="Valorar esta clase" style={{ display: 'flex', gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => {
                                  setPuntuacionElegida(n);
                                  setValorandoSheet({ reservaId: r.id, tituloClase: tipo?.nombre ?? 'la clase', fecha: formatFecha(s.inicio) });
                                }}
                                aria-label={`${n} de 5 estrellas`}
                                style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer' }}
                              >
                                <Star size={22} strokeWidth={1.6} style={{ color: '#98A093' }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gap 2 — "Cómo llegar" (dirección real del estudio, sin
                      SDK nuevo) y "Cambiar hora" (sin reprogramación real:
                      reutiliza el MISMO sheet de cancelación de abajo y, tras
                      confirmar, lleva a elegir otra clase). Mismo criterio de
                      visibilidad que "Cancelar reserva": solo sobre una
                      reserva CONFIRMADA todavía futura. */}
                  {puedeCancel && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {studio?.direccion && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([studio.direccion, studio.ciudad].filter(Boolean).join(', '))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            flex: 1, height: 42, borderRadius: 21, border: '1px solid #E5E3DA',
                            background: 'transparent', color: '#1A1A1A', textDecoration: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <Navigation size={13} /> Cómo llegar
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => { setCambiandoHora(true); setCancelando(r); }}
                        style={{
                          flex: 1, height: 42, borderRadius: 21, border: '1px solid #E5E3DA',
                          background: 'transparent', color: '#1A1A1A',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Clock size={13} /> Cambiar hora
                      </button>
                    </div>
                  )}

                  {/* §6 — Añadir ESTA reserva al calendario de la alumna. Nada
                      que ver con la integración Google Calendar del ESTUDIO: esa
                      sincroniza la agenda del negocio con la cuenta de la
                      propietaria y no pone ni una clase en el calendario de su
                      alumna. Solo en las que aún no han pasado: añadir al
                      calendario una clase de la semana pasada no sirve de nada.
                      El evento se construye con el MISMO helper que el resto del
                      producto (lib/calendario-ics.ts), así que el .ics del portal
                      y el de la página pública no pueden decir cosas distintas. */}
                  {!apagado && r.estado !== 'CANCELADA' && (
                    <div style={{ marginTop: 14 }}>
                      <BotonesCalendario
                        evento={{
                          id: s.id,
                          // El instante real, no la hora de pared: un evento sin
                          // zona se corre de hora en un móvil de otro huso.
                          inicio: s.inicio,
                          fin: s.fin,
                          titulo: tipo?.nombre ?? 'Clase',
                          instructora: instr?.nombre,
                          sala: sala?.nombre,
                          estudioNombre: studio?.nombre ?? 'Tu estudio',
                          estudioDireccion: [studio?.direccion, studio?.ciudad].filter(Boolean).join(', '),
                        }}
                      />
                    </div>
                  )}

                  {puedeCancel && (
                    <button
                      type="button"
                      onClick={() => { setCambiandoHora(false); setCancelando(r); }}
                      style={{
                        width: '100%', height: 42, marginTop: 14, borderRadius: 21, border: 'none',
                        background: '#F4E9E5', color: '#A04A3C',
                        fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Cancelar reserva
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hoja de cristal de confirmación — mismo lenguaje que HojaPase: fondo
          desenfocado real, radio 24px arriba, sombra del bloque "Bottom
          sheet" del CHEATSHEET. */}
      <div
        onClick={() => { setCancelando(null); setCambiandoHora(false); }}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          opacity: cancelando ? 1 : 0, pointerEvents: cancelando ? 'auto' : 'none',
          background: 'rgba(15,15,15,.42)',
          ...cristal(18, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />
      <div
        role="dialog"
        aria-modal={!!cancelando}
        aria-hidden={!cancelando}
        aria-label={cambiandoHora ? '¿Cambiar de hora?' : '¿Cancelar esta clase?'}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
          background: '#FAF9F5', borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 50px rgba(15,15,15,.25)', padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
          opacity: cancelando ? 1 : 0,
          pointerEvents: cancelando ? 'auto' : 'none',
          transform: cancelando ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
          transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
        }}
      >
        <div style={{ width: 34, height: 4, borderRadius: 4, background: '#D9D6C9', margin: '0 auto 20px' }} />
        <h2 style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', textAlign: 'center' }}>
          {cambiandoHora ? '¿Cambiar de hora?' : '¿Cancelar esta clase?'}
        </h2>
        {(() => {
          if (cambiandoHora) return (
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              No podemos moverte de hora automáticamente: cancelamos esta y te llevamos a elegir otra que te venga mejor.
            </p>
          );
          if (cancelando?.id.startsWith('res-pf-')) return (
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              Es tu plaza fija: te guardaremos una recuperación para que la uses otro día. Liberas el hueco para otra socia.
            </p>
          );
          const s = cancelando ? sesiones.find(x => x.id === cancelando.sesionId) : null;
          if (!s) return (
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              Perderás tu plaza y liberarás el hueco para otra socia.
            </p>
          );
          const ventana = heredaOverride(tiposClase.find(tc => tc.id === s.tipoClaseId)?.ventanaCancelacionHoras ?? null, studio?.cancelacionVentanaHoras ?? 0);
          const tardia = esCancelacionTardia(s.inicio, new Date(), ventana);
          // Cuando la socia va a PERDER la sesión de verdad (no solo liberar
          // el hueco), el aviso se destaca en caja ámbar — verificado contra
          // el diseño real, que distingue visualmente "pierdes la sesión" de
          // "recuperas el hueco sin más" en vez de un párrafo gris igual.
          if (!tardia) return (
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              Perderás tu plaza y liberarás el hueco para otra socia.
            </p>
          );
          return (
            <div style={{ background: '#F6EEDD', borderRadius: 14, padding: '12px 16px', marginTop: 14 }}>
              <p style={{ fontFamily: sans, fontSize: 12.5, color: '#8A6A25', textAlign: 'center', lineHeight: 1.5, fontWeight: 700 }}>
                Quedan menos de {ventana} h para la clase. Según la política del estudio, puede que no se te devuelva la sesión.
              </p>
            </div>
          );
        })()}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={() => { setCancelando(null); setCambiandoHora(false); }}
            style={{
              flex: 1, height: 54, borderRadius: 27, border: '1px solid #E5E3DA',
              background: 'transparent', color: '#1A1A1A', fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {cancelandoEsTardia ? 'Mantener mi reserva' : 'Volver'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!cancelando) return;
              const id = cancelando.id;
              const irAElegirOtra = cambiandoHora;
              setCancelando(null);
              setCambiandoHora(false);
              if (!escribible) {
                setAviso({ texto: 'Vista previa: esta cancelación no se guarda de verdad.', error: false });
                if (irAElegirOtra) navegar(`/portal/${slug}/clases`);
                return;
              }
              void cancelarReserva(id).then(r => {
                if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
                // "Cambiar hora": solo se navega si la cancelación real la
                // confirmó el servidor — nunca por adelantado.
                if (irAElegirOtra) navegar(`/portal/${slug}/clases`);
              });
            }}
            style={{
              flex: 1, height: 54, borderRadius: 27, border: 'none',
              background: '#F4E9E5', color: '#A04A3C',
              fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {cambiandoHora ? 'Sí, cancelar y elegir otra' : cancelandoEsTardia ? 'Cancelar igualmente (pierdo la sesión)' : 'Sí, cancelar'}
          </button>
        </div>
      </div>

      {proximaClase && (
        <HojaPase
          abierta={paseAbierto}
          onClose={() => setPaseAbierto(false)}
          slug={slug}
          nombreEstudio={studio?.nombre ?? 'tu estudio'}
          tituloClase={tiposClase.find(tc => tc.id === proximaClase.s.tipoClaseId)?.nombre ?? 'Clase'}
          subtitulo={`${formatFecha(proximaClase.s.inicio)} · ${salas.find(s => s.id === proximaClase.s.salaId)?.nombre ?? ''}`}
          pedirPase={escribible ? pedirPaseDeAcceso : pedirPaseDeMuestra}
        />
      )}

      {/* Sheet global de oferta de plaza (Fase 2b) — se abre solo, sin
          depender de qué pestaña esté mirando la socia: es urgente por
          diseño. Cerrarlo tocando el fondo (`onClose`) NO es "rechazar", solo
          lo oculta hasta la siguiente oferta distinta (ver `ofertaOcultaId`
          arriba); la reserva sigue reflejada en la pestaña ESPERA. */}
      <HojaOfertaEspera
        oferta={mostrarSheetOferta ? ofertaActiva : null}
        onClose={() => setOfertaOcultaId(ofertaActiva?.reservaId ?? null)}
        onAceptar={onAceptarOferta}
        onDejarPasar={onDejarPasarOferta}
        onError={mensaje => setAviso({ texto: mensaje, error: true })}
      />

      {/* Confirmar baja de plaza fija — mismo lenguaje literal que la hoja de
          cancelación de arriba, en vez del `BottomSheet` genérico del
          sistema saliente.
          ⚠️ A diferencia de cancelando/cambiandoHora (entrada/salida animada,
          patrón ya establecido en HojaPase), este se monta/desmonta con la
          propia condición — SIN transición — igual que el BottomSheet
          original al que sustituye (`if (!open) return null`): un sheet
          siempre montado con solo opacidad/pointer-events rompe
          `getByText(...).toHaveCount(0)`, que es justo lo que comprueba el
          test que ya cubre este flujo. */}
      {confirmandoBaja && (
        <>
          <div
            onClick={() => setConfirmandoBaja(false)}
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(15,15,15,.42)',
              ...cristal(18, 120),
            }}
          />
          <div
            role="dialog"
            aria-modal
            aria-label="¿Dar de baja tu plaza fija?"
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
              background: '#FAF9F5', borderRadius: '24px 24px 0 0',
              boxShadow: '0 -18px 50px rgba(15,15,15,.25)', padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 34, height: 4, borderRadius: 4, background: '#D9D6C9', margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', textAlign: 'center' }}>
              ¿Dar de baja tu plaza fija?
            </h2>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              Dejará de reservarte el hueco cada semana. Las clases ya reservadas no se tocan.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                onClick={() => setConfirmandoBaja(false)}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: '1px solid #E5E3DA',
                  background: 'transparent', color: '#1A1A1A', fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Conservarla
              </button>
              <button
                type="button"
                onClick={() => void confirmarBajaPlaza()}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: 'none',
                  background: '#F4E9E5', color: '#A04A3C',
                  fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Sí, darla de baja
              </button>
            </div>
          </div>
        </>
      )}

      {/* Gap 4 (fidelidad Tentare Studio App) — sheet de confirmación al
          valorar, mismo patrón "montado solo mientras la condición es
          cierta, sin transición" que confirmandoBaja arriba. */}
      {valorandoSheet && (
        <>
          <div
            onClick={() => { setValorandoSheet(null); setPuntuacionElegida(null); }}
            aria-hidden
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,15,15,.42)', ...cristal(18, 120) }}
          />
          <div
            role="dialog"
            aria-modal
            aria-label={`¿Qué tal la clase del ${valorandoSheet.fecha}?`}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
              background: '#FAF9F5', borderRadius: '24px 24px 0 0',
              boxShadow: '0 -18px 50px rgba(15,15,15,.25)', padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 34, height: 4, borderRadius: 4, background: '#D9D6C9', margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', textAlign: 'center' }}>
              ¿Qué tal {valorandoSheet.tituloClase} del {valorandoSheet.fecha}?
            </h2>
            <div role="group" aria-label="Elegir puntuación" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPuntuacionElegida(n)}
                  aria-label={`${n} de 5 estrellas`}
                  aria-pressed={puntuacionElegida === n}
                  style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer' }}
                >
                  <Star
                    size={30}
                    strokeWidth={1.6}
                    fill={puntuacionElegida != null && n <= puntuacionElegida ? '#4F8A5B' : 'none'}
                    style={{ color: puntuacionElegida != null && n <= puntuacionElegida ? '#4F8A5B' : '#98A093' }}
                  />
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={() => { setValorandoSheet(null); setPuntuacionElegida(null); }}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: '1px solid #E5E3DA',
                  background: 'transparent', color: '#1A1A1A', fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={puntuacionElegida == null || valorandoId === valorandoSheet.reservaId}
                onClick={() => { if (puntuacionElegida != null) void onValorar(valorandoSheet.reservaId, puntuacionElegida); }}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: 'none',
                  background: '#1A1A1A', color: '#F1ECE1',
                  fontFamily: sans, fontSize: 14, fontWeight: 500,
                  cursor: puntuacionElegida == null ? 'default' : 'pointer',
                  opacity: puntuacionElegida == null || valorandoId === valorandoSheet.reservaId ? 0.5 : 1,
                }}
              >
                Enviar valoración
              </button>
            </div>
          </div>
        </>
      )}

      {/* Gap 4 (fidelidad Tentare Studio App) — sheet de confirmación al
          valorar, mismo patrón "montado solo mientras la condición es
          cierta, sin transición" que confirmandoBaja arriba. */}
      {valorandoSheet && (
        <>
          <div
            onClick={() => { setValorandoSheet(null); setPuntuacionElegida(null); }}
            aria-hidden
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,15,15,.42)', ...cristal(18, 120) }}
          />
          <div
            role="dialog"
            aria-modal
            aria-label={`¿Qué tal la clase del ${valorandoSheet.fecha}?`}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
              background: '#FAF9F5', borderRadius: '24px 24px 0 0',
              boxShadow: '0 -18px 50px rgba(15,15,15,.25)', padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 34, height: 4, borderRadius: 4, background: '#D9D6C9', margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: '#1A1A1A', textAlign: 'center' }}>
              ¿Qué tal {valorandoSheet.tituloClase} del {valorandoSheet.fecha}?
            </h2>
            <div role="group" aria-label="Elegir puntuación" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPuntuacionElegida(n)}
                  aria-label={`${n} de 5 estrellas`}
                  aria-pressed={puntuacionElegida === n}
                  style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer' }}
                >
                  <Star
                    size={30}
                    strokeWidth={1.6}
                    fill={puntuacionElegida != null && n <= puntuacionElegida ? '#4F8A5B' : 'none'}
                    style={{ color: puntuacionElegida != null && n <= puntuacionElegida ? '#4F8A5B' : '#98A093' }}
                  />
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={() => { setValorandoSheet(null); setPuntuacionElegida(null); }}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: '1px solid #E5E3DA',
                  background: 'transparent', color: '#1A1A1A', fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={puntuacionElegida == null || valorandoId === valorandoSheet.reservaId}
                onClick={() => { if (puntuacionElegida != null) void onValorar(valorandoSheet.reservaId, puntuacionElegida); }}
                style={{
                  flex: 1, height: 54, borderRadius: 27, border: 'none',
                  background: '#1A1A1A', color: '#F1ECE1',
                  fontFamily: sans, fontSize: 14, fontWeight: 500,
                  cursor: puntuacionElegida == null ? 'default' : 'pointer',
                  opacity: puntuacionElegida == null || valorandoId === valorandoSheet.reservaId ? 0.5 : 1,
                }}
              >
                Enviar valoración
              </button>
            </div>
          </div>
        </>
      )}

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
