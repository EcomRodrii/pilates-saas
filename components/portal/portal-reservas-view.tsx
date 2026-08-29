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
// Rediseño (2026-08): esta pantalla vivía todavía en el sistema VIEJO
// (`components/portal/ui/*`, `lib/portal-tokens.ts`) — tarjetas blancas
// planas, pestañas grises genéricas, cero identidad de marca — mientras
// /login y /acceso ya hablaban el lenguaje nuevo de `lib/portal-design.ts`
// (serif display + cursiva como voz, cápsulas exactas, sombra siempre verde,
// cristal con blur real). Aquí se migra a ese mismo lenguaje, tomando como
// referencia directa los patrones YA en producción en PortalHomeView/
// PortalClasesView (tarjeta de "Esta semana", chips de pestaña, tarjeta de
// clase con bloque de fecha) en vez de inventar uno nuevo. `BottomSheet`/
// `Card`/`Badge`/`Tabs`/`EmptyState` de `components/portal/ui` se dejan de
// usar aquí — son el sistema saliente; `Toast` se conserva porque YA está
// escrito sobre los tokens de `portal-design.ts` (EASE/dur), no sobre el
// viejo.
//
// ⚠️ El guard `studio?.requiereCheckinQr` de la tarjeta del pase es de HOY
// (mismo día que este rediseño) — se conserva tal cual, sin tocar su
// condición: sin QR obligatorio no hay nada que enseñar en la puerta.
//
// Fase 3 (Tentare Studio App): el diseño literal de "Reservas" es UNA sola
// pantalla que baja — próxima reserva, lista de espera, plaza fija, bono/
// plan, pagos e historial — sin pestañas. Se sustituyen las 4 pestañas
// (Próximas/Pasadas/Canceladas/Espera) por ese scroll único; "Canceladas"
// deja de tener una vista propia aquí (decisión explícita, no se pierde el
// dato: sigue existiendo en el backend, solo no se lista en esta pantalla).
// Plaza fija/bono comparten los mismos hooks reales que PortalBonosView
// (`bonoActivo`, `plazasFijas`, `pausar/reanudar/darDeBajaPlazaFijaPropia`);
// "Comprar otro"/"Gestionar mi plan" y la factura en sí se quedan en
// /compras — no se duplica lógica de cobro aquí, solo el vistazo.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Calendar, Clock, MapPin, MessageCircle, Navigation, QrCode, Star, User as UserIcon } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { formatFechaCorta as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { Toast, type AvisoToast } from '@/components/portal/ui';
import { semantic } from '@/lib/portal-tokens';
import { HojaPase, type DatosPase } from '@/components/portal/hoja-pase';
import { HojaOfertaEspera, type OfertaEspera } from '@/components/portal/hoja-oferta-espera';
import { BotonesCalendario } from '@/components/portal/botones-calendario';
import { pedirPaseDeAcceso } from '@/lib/api-client';
import { bonoActivo, DIAS, fechaLarga } from '@/lib/bonos-portal';
import type { PortalSession } from '@/lib/portal-auth';
import { useMensajesSinLeer } from '@/lib/use-mensajes-sin-leer.ts';
import {
  EASE, dur, transicion, display, micro, texto, radio, sombra, cristal, desenfoque,
} from '@/lib/portal-design';

// Stub de "pedir pase" para preview: NO llama a la API real (socioId
// ficticio, 404/error garantizado) — mismo criterio que PortalClasesView.
async function pedirPaseDeMuestra(): Promise<DatosPase> {
  return {
    hayPase: true, vigente: true, yaAsistida: false, codigo: 'PREVIEW', token: null,
    paseHasta: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

// Valor de "ahora" hasta que el efecto de montaje fija el de verdad (render del
// servidor y primer render del cliente). Es una constante de MÓDULO, no un
// `new Date()` en el cuerpo del componente: ese daba una referencia nueva en
// cada render y `porTab` —el reparto Próximas/Historial/Espera y la tarjeta
// del pase— se recalculaba entero cada vez, con lo que su useMemo no
// memoizaba nada. Además servidor y navegador nunca coinciden en "ahora", así
// que un valor fijo es también lo único que garantiza que los dos pinten el
// mismo HTML. Qué fecha sea da igual: los datos del estudio (StudioProvider
// los carga en un efecto) todavía están vacíos en ese instante, así que las
// listas salen vacías con cualquier valor.
const FECHA_PLACEHOLDER_SSR = new Date('2026-06-29T00:00:00Z');

const ESTADO_LABEL: Record<string, { label: string; tono: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  CONFIRMADA: { label: 'Confirmada', tono: 'success' },
  LISTA_ESPERA: { label: 'Lista de espera', tono: 'warning' },
  ASISTIDA: { label: 'Asistida', tono: 'neutral' },
  CANCELADA: { label: 'Cancelada', tono: 'neutral' },
  NO_ASISTIO: { label: 'No asistió', tono: 'danger' },
};

// Único estado vacío que queda: sin pestañas, solo "próximas" necesita uno
// (lista de espera/plaza fija/bono/pagos/historial simplemente no aparecen
// si no hay nada — sin relleno inventado).
const VACIO_PROXIMAS = { title: 'Sin clases reservadas', body: 'Mira los horarios de esta semana y reserva tu próxima sesión.' };

/** Pastilla de estado — color semántico calibrado AA, forma de cápsula del sistema nuevo. */
function EstadoPill({ estado, noche, t }: { estado: string; noche: boolean; t: ReturnType<typeof useModo>['t'] }) {
  const info = ESTADO_LABEL[estado] ?? ESTADO_LABEL.CANCELADA;
  const colores = {
    success: { fg: noche ? semantic.success.textNoche : semantic.success.text, bg: semantic.success.soft },
    warning: { fg: noche ? semantic.warning.textNoche : semantic.warning.text, bg: semantic.warning.soft },
    danger: { fg: noche ? semantic.danger.textNoche : semantic.danger.text, bg: semantic.danger.soft },
    neutral: { fg: t.muted, bg: t.surface2 },
  }[info.tono];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
        padding: '5px 11px', borderRadius: radio.pill,
        ...micro(8.5, 0.2, 600),
        color: colores.fg,
        background: colores.bg,
      }}
    >
      {info.label}
    </span>
  );
}

/** Bloque de fecha a la izquierda de cada tarjeta: día de la semana + número, mismo lenguaje que las tarjetas de "Esta semana" del Inicio. */
function BloqueFecha({ iso, apagado }: { iso: string; apagado: boolean }) {
  const { t } = useModo();
  const d = new Date(iso);
  const diaSemana = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
  return (
    <div style={{ flex: '0 0 44px', textAlign: 'center' }}>
      <div style={{ ...micro(8.5, 0.2, 600), color: apagado ? t.micro : t.heroAccent, textAlign: 'center', paddingLeft: 0 }}>{diaSemana}</div>
      <div style={{ ...display(28, false, 1), color: apagado ? t.muted2 : t.ink, marginTop: 4 }}>{d.getDate()}</div>
    </div>
  );
}

/** Estado vacío por pestaña, en el lenguaje nuevo: icono en círculo suave, titular serif, cuerpo sans, CTA cápsula si aplica. */
function EstadoVacio({ title, body, cta, onCta, t }: {
  title: string; body: string; cta?: string; onCta?: () => void;
  t: ReturnType<typeof useModo>['t'];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', gap: 8 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.surface2, color: t.muted, marginBottom: 6,
      }}>
        <Calendar size={20} strokeWidth={1.7} />
      </div>
      <p style={{ ...display(21, true), color: t.ink }}>{title}</p>
      <p style={{ ...texto.meta, color: t.muted, maxWidth: 240, lineHeight: 1.5 }}>{body}</p>
      {cta && onCta && (
        <button
          type="button"
          onClick={onCta}
          style={{
            marginTop: 14, height: 46, padding: '0 22px', borderRadius: 23, border: 'none',
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
            ...texto.botonCta, boxShadow: sombra.botonClaro, cursor: 'pointer',
            transition: transicion(['transform', 'box-shadow']),
          }}
        >
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
    valorarExperienciaReserva, studio, suscripciones, planesTarifa, plazasFijas, recibos,
    pausarPlazaFijaPropia, reanudarPlazaFijaPropia, darDeBajaPlazaFijaPropia,
  } = useStudio();
  const { t, noche } = useModo();
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  // "Cambiar hora" (Gap 2): no hay reprogramación real — se reutiliza el
  // MISMO sheet de cancelación, distinguiendo aquí si al confirmar hay que
  // además llevar a la socia a elegir otra clase.
  const [cambiandoHora, setCambiandoHora] = useState(false);
  // "Tu plaza fija" (Fase 3): mismo sheet de cristal, un tercer motivo.
  const [confirmandoBajaPlaza, setConfirmandoBajaPlaza] = useState(false);
  const [procesandoPlaza, setProcesandoPlaza] = useState(false);
  const [paseAbierto, setPaseAbierto] = useState(false);
  // Gap 1: mismo hook/criterio que Perfil — cero contador inventado.
  const mensajesSinLeer = useMensajesSinLeer(studio?.id ?? null);
  // Gap 4: id de la reserva cuya valoración está en vuelo, para deshabilitar
  // sus estrellas mientras se confirma con el servidor (sin escritura
  // optimista: la puntuación en pantalla solo cambia cuando `reservas` se
  // resincroniza con la respuesta real).
  const [valorandoId, setValorandoId] = useState<string | null>(null);
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
    const historial = misReservas
      .filter(x => x.r.estado === 'ASISTIDA' || x.r.estado === 'NO_ASISTIO' || (x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) < now))
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const espera = misReservas
      .filter(x => x.r.estado === 'LISTA_ESPERA')
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    return { PROXIMAS: proximas, HISTORIAL: historial, ESPERA: espera };
  }, [misReservas, now]);

  const proximaClase = porTab.PROXIMAS[0] ?? null;

  // "Tu plaza fija" / bono·plan / pagos (Fase 3): mismos datos y hooks reales
  // que PortalBonosView — aquí solo el vistazo, la gestión de fondo (comprar,
  // domiciliar, ver factura) se queda en /compras.
  const miPlazaFija = useMemo(
    () => plazasFijas.find(p => p.socioId === socioId && (p.estado === 'ACTIVA' || p.estado === 'PAUSADA')) ?? null,
    [plazasFijas, socioId],
  );
  const plazaFijaDetalle = useMemo(() => {
    if (!miPlazaFija) return null;
    const sala = salas.find(x => x.id === miPlazaFija.salaId)?.nombre ?? null;
    const tipo = miPlazaFija.tipoClaseId ? tiposClase.find(x => x.id === miPlazaFija.tipoClaseId)?.nombre ?? null : null;
    return [tipo, sala].filter(Boolean).join(' · ') || null;
  }, [miPlazaFija, salas, tiposClase]);
  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, socioId ?? null),
    [suscripciones, planesTarifa, tiposClase, socioId],
  );
  // Solo lo ya cobrado: los estados PENDIENTE/EN_CURSO/FALLIDO llevan sus
  // propias acciones (reintentar, cambiar tarjeta) que viven en /compras, no
  // en este vistazo.
  const misRecibosPreview = useMemo(
    () => recibos
      .filter(r => r.socioId === socioId && r.estado === 'COBRADO')
      .sort((a, b) => (b.fechaCobro ?? b.fechaVencimiento).localeCompare(a.fechaCobro ?? a.fechaVencimiento))
      .slice(0, 3),
    [recibos, socioId],
  );

  async function pausarOReanudarPlaza() {
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
    setConfirmandoBajaPlaza(false);
    if (!miPlazaFija) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); return; }
    const r = await darDeBajaPlazaFijaPropia(miPlazaFija.id);
    setAviso(r.ok ? { texto: 'Plaza fija dada de baja.', error: false } : { texto: r.error, error: true });
  }

  // Oferta de plaza liberada (Fase 2b) con plazo vivo — sea cual sea la
  // sección que la socia esté mirando, es urgente y se enseña en un sheet
  // global (más abajo), no solo dentro de la lista de espera. `now` es el
  // mismo reloj fijado al montar que usa `porTab` (no tickea): si la oferta
  // caduca mientras la pantalla lleva rato abierta sin recargarse, el propio
  // sheet ya lo refleja con su cuenta atrás en vivo — esto solo decide si hay
  // algo que abrir.
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
  // tanto, la reserva sigue viéndose en la sección de lista de espera con su
  // pastilla de estado — esa es la red de seguridad si se cierra sin decidir.
  const mostrarSheetOferta = ofertaActiva != null && ofertaActiva.reservaId !== ofertaOcultaId;

  async function onAceptarOferta(reservaId: string): Promise<ResultadoEscritura> {
    if (!escribible) {
      setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false });
      return { ok: true };
    }
    return aceptarOfertaEspera(reservaId);
  }

  // "Dejarla pasar" es `cancelarReserva` de siempre — cancelar una reserva en
  // LISTA_ESPERA libera el hueco y promueve a la siguiente en el backend, sin
  // necesitar ningún endpoint nuevo de "rechazar oferta".
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
      return;
    }
    if (valorandoId) return;
    setValorandoId(reservaId);
    const r = await valorarExperienciaReserva(reservaId, valoracion);
    setValorandoId(null);
    if (!r.ok) setAviso({ texto: r.error, error: true });
  }

  // Tarjeta de reserva compartida por Próximas/Lista de espera/Historial —
  // agnóstica de "en qué sección está": decide sus propios botones mirando
  // `r.estado`/fecha, así que sirve igual en las tres.
  function tarjetaReserva(r: Reserva, s: Sesion) {
    const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
    const sala = salas.find(x => x.id === s.salaId);
    const instr = instructores.find(i => i.id === s.instructorId);
    const puedeCancel = r.estado === 'CONFIRMADA' && new Date(s.inicio) > now;
    const apagado = r.estado === 'CANCELADA' || r.estado === 'NO_ASISTIO' || (r.estado !== 'LISTA_ESPERA' && new Date(s.inicio) < now);
    return (
      <div
        key={r.id}
        style={{
          borderRadius: radio.card, padding: 18,
          background: t.surface, boxShadow: sombra.cardInterna,
          opacity: apagado ? 0.72 : 1,
        }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          <BloqueFecha iso={s.inicio} apagado={apagado} />
          <div style={{ width: 1, background: t.line, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ ...display(20, false, 1.15), color: apagado ? t.muted2 : t.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tipo?.nombre ?? 'Clase'}
              </div>
              <EstadoPill estado={r.estado} noche={noche} t={t} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, ...texto.nota, color: t.muted }}>
              <Clock size={11} /> {formatHora(s.inicio)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 8, ...texto.nota, color: t.muted2 }}>
              {instr && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><UserIcon size={11} />{instr.nombre}</span>}
              {sala && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={11} />{sala.nombre}</span>}
            </div>
          </div>
        </div>

        {/* La interacción real (aceptar/dejar pasar, con cuenta
            atrás en vivo) vive ahora en el sheet global
            `HojaOfertaEspera`, que se abre solo en cuanto hay una
            oferta viva — sea cual sea la sección abierta. Esto es
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
              background: noche ? 'rgba(224,148,43,.14)' : semantic.warning.soft,
              color: noche ? semantic.warning.textNoche : semantic.warning.text,
              ...texto.metaFuerte, fontSize: 12.5, cursor: 'pointer',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, ...texto.nota, color: t.muted2 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 20, height: 20, padding: '0 6px', borderRadius: radio.pill,
              background: t.surface2, ...micro(9.5, 0.1, 700), color: t.muted,
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
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
            {r.valoracionExperiencia != null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 2 }} aria-hidden>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star
                      key={n}
                      size={16}
                      strokeWidth={1.7}
                      fill={n <= (r.valoracionExperiencia as number) ? 'var(--portal-brand)' : 'none'}
                      style={{ color: n <= (r.valoracionExperiencia as number) ? 'var(--portal-brand)' : t.muted2 }}
                    />
                  ))}
                </div>
                <span style={{ ...texto.nota, color: t.muted }}>Ya has valorado esta clase</span>
              </div>
            ) : (
              <div>
                <p style={{ ...texto.nota, color: t.muted, marginBottom: 8 }}>¿Qué tal la clase?</p>
                <div role="group" aria-label="Valorar esta clase" style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      disabled={valorandoId === r.id}
                      onClick={() => void onValorar(r.id, n)}
                      aria-label={`${n} de 5 estrellas`}
                      style={{
                        border: 'none', background: 'transparent', padding: 4, cursor: valorandoId === r.id ? 'default' : 'pointer',
                        opacity: valorandoId === r.id ? 0.5 : 1,
                      }}
                    >
                      <Star size={22} strokeWidth={1.6} style={{ color: t.muted2 }} />
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
                  flex: 1, height: 42, borderRadius: 21, border: `1px solid ${t.line}`,
                  background: 'transparent', color: t.ink, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  ...texto.metaFuerte, fontSize: 12.5, cursor: 'pointer',
                }}
              >
                <Navigation size={13} /> Cómo llegar
              </a>
            )}
            <button
              type="button"
              onClick={() => { setCambiandoHora(true); setCancelando(r); }}
              style={{
                flex: 1, height: 42, borderRadius: 21, border: `1px solid ${t.line}`,
                background: 'transparent', color: t.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                ...texto.metaFuerte, fontSize: 12.5, cursor: 'pointer',
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
              t={t}
            />
          </div>
        )}

        {puedeCancel && (
          <button
            type="button"
            onClick={() => { setCambiandoHora(false); setCancelando(r); }}
            style={{
              width: '100%', height: 42, marginTop: 14, borderRadius: 21, border: 'none',
              background: noche ? 'rgba(232,106,95,.12)' : semantic.danger.soft,
              color: noche ? semantic.danger.textNoche : semantic.danger.text,
              ...texto.metaFuerte, fontSize: 12.5, cursor: 'pointer',
            }}
          >
            Cancelar reserva
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      {/* Cabecera — mismo par volanta/titular que el resto de pantallas
          migradas: la micro-etiqueta cuenta el total, el titular serif dice
          qué es esto, con la cursiva como voz, no como énfasis. */}
      <div style={{ padding: '28px 24px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...micro(9.5, 0.28), color: t.micro }}>
            {misReservas.length} {misReservas.length === 1 ? 'reserva en total' : 'reservas en total'}
          </div>
          {/* El texto exacto "Mis reservas" se conserva a propósito — es el
              ancla de accesibilidad que usan los e2e de esta pantalla
              (`portal-preview-perfil-reservas.spec.ts`,
              `getByRole('heading', { name: 'Mis reservas' })`). La cursiva va
              en el resto del titular, no en las dos palabras que hacen de id. */}
          <h1 style={{ ...display(38), color: t.ink, marginTop: 10 }}>
            Mis reservas<em style={{ fontStyle: 'italic' }}>.</em>
          </h1>
        </div>
        {/* Gap 1 — acceso a Mensajes desde Reservas, mismo círculo de cristal
            y punto de "sin leer" que usa la campana del Inicio (mismo hook,
            `useMensajesSinLeer`, cero contador inventado). */}
        <button
          type="button"
          onClick={() => navegar(`/portal/${slug}/mensajes`)}
          aria-label={mensajesSinLeer > 0 ? `Mensajes, ${mensajesSinLeer} sin leer` : 'Mensajes'}
          style={{
            position: 'relative', width: 40, height: 40, flex: '0 0 40px', marginTop: 4,
            borderRadius: '50%', border: `1px solid ${noche ? 'rgba(243,241,233,.14)' : 'rgba(34,38,31,.14)'}`,
            background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: sombra.circulo, cursor: 'pointer',
            transition: transicion(['transform']),
          }}
        >
          <MessageCircle size={18} strokeWidth={1.9} style={{ color: t.ink }} />
          {mensajesSinLeer > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: 'var(--portal-brand)' }} />
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
            style={{
              width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              marginBottom: 16, padding: '16px 16px 16px 14px', borderRadius: radio.card,
              background: t.surface, boxShadow: sombra.cardInterna,
              display: 'flex', alignItems: 'center', gap: 12,
              transition: transicion(['transform', 'box-shadow'], dur.card),
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 15, flexShrink: 0,
              background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <QrCode size={19} color="var(--portal-brand-foreground)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...display(18, true), color: t.ink }}>Tu pase de acceso</p>
              <p style={{ ...texto.nota, color: t.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tiposClase.find(tc => tc.id === proximaClase.s.tipoClaseId)?.nombre ?? 'Clase'} · {formatFecha(proximaClase.s.inicio)} {formatHora(proximaClase.s.inicio)}
              </p>
            </div>
            <span aria-hidden style={{ fontSize: 15, color: t.heroAccent, flexShrink: 0 }}>→</span>
          </button>
        )}

        {/* Próximas — sin pestañas (Fase 3): la pantalla es un solo scroll,
            como el diseño literal. */}
        {porTab.PROXIMAS.length === 0 ? (
          <EstadoVacio
            {...VACIO_PROXIMAS}
            cta="Ver horarios"
            onCta={() => navegar(`/portal/${slug}/clases`)}
            t={t}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {porTab.PROXIMAS.map(({ r, s }) => tarjetaReserva(r, s))}
          </div>
        )}

        {/* Lista de espera — mismas tarjetas, con su badge de posición y el
            reabridor de la oferta si hay una viva. */}
        {porTab.ESPERA.length > 0 && (
          <>
            <p style={{ ...micro(9, 0.2), color: t.micro, margin: '20px 2px 8px' }}>Lista de espera</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {porTab.ESPERA.map(({ r, s }) => tarjetaReserva(r, s))}
            </div>
          </>
        )}

        {/* Tu plaza fija — mismos datos y acciones reales que /bonos
            (pausar/reanudar/dar de baja), solo un vistazo aquí. */}
        {miPlazaFija && (
          <div style={{ marginTop: 20, borderRadius: radio.card, padding: 18, background: t.surface, boxShadow: sombra.cardInterna }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <p style={{ ...display(18, true), color: t.ink }}>Tu plaza fija</p>
              {miPlazaFija.estado === 'PAUSADA' && (
                <span style={{ ...micro(8.5, 0.2, 700), color: t.muted, background: t.surface2, padding: '4px 10px', borderRadius: radio.pill, flexShrink: 0 }}>
                  En pausa
                </span>
              )}
            </div>
            <p style={{ ...texto.nota, color: t.muted, marginTop: 6 }}>
              Todos los <b style={{ color: t.ink }}>{DIAS[miPlazaFija.diaSemana]?.toLowerCase()} · {miPlazaFija.horaInicio.slice(0, 5)}</b>
              {plazaFijaDetalle ? ` · ${plazaFijaDetalle}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => void pausarOReanudarPlaza()}
                disabled={procesandoPlaza}
                style={{
                  flex: 1, height: 38, borderRadius: 19, border: `1px solid ${t.line}`,
                  background: 'transparent', color: t.ink, ...texto.metaFuerte, fontSize: 11.5,
                  cursor: procesandoPlaza ? 'default' : 'pointer', opacity: procesandoPlaza ? 0.6 : 1,
                }}
              >
                {miPlazaFija.estado === 'ACTIVA' ? 'Pausar' : 'Reanudar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoBajaPlaza(true)}
                disabled={procesandoPlaza}
                style={{
                  flex: 1, height: 38, borderRadius: 19, border: 'none',
                  background: noche ? 'rgba(232,106,95,.12)' : semantic.danger.soft,
                  color: noche ? semantic.danger.textNoche : semantic.danger.text,
                  ...texto.metaFuerte, fontSize: 11.5, cursor: procesandoPlaza ? 'default' : 'pointer', opacity: procesandoPlaza ? 0.6 : 1,
                }}
              >
                Dar de baja
              </button>
            </div>
          </div>
        )}

        {/* Bono / plan — mismo `bonoActivo()` que /bonos: un mensual y un
            bono por sesiones son la MISMA tarjeta aquí (el diseño los separa
            en dos porque su demo no distingue, pero el dato real ya unifica
            ambos casos). "Comprar otro"/"Gestionar mi plan" llevan a
            /compras — el cobro en sí no se duplica en esta pantalla. */}
        {bono && (
          <div style={{ marginTop: 12, borderRadius: radio.card, padding: 18, background: t.surface, boxShadow: sombra.cardInterna }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <p style={{ ...display(18, true), color: t.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bono.bonos.length > 1 ? 'Tu saldo' : bono.nombre}
              </p>
              <span style={{ ...micro(8.5, 0.2, 600), color: t.heroAccent, flexShrink: 0 }}>Activo</span>
            </div>
            {bono.totalSesiones != null && bono.totalRestantes != null ? (
              <>
                <div style={{ height: 6, borderRadius: 99, background: t.surface2, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, width: `${(bono.progresoTotal ?? 0) * 100}%`,
                    background: 'var(--portal-brand)', transition: `width ${dur.card}ms ${EASE}`,
                  }} />
                </div>
                <p style={{ ...texto.nota, color: t.muted, marginTop: 8 }}>
                  Te quedan <b style={{ color: t.ink }}>{bono.totalRestantes} {bono.totalRestantes === 1 ? 'sesión' : 'sesiones'}</b>
                </p>
              </>
            ) : (
              <p style={{ ...texto.nota, color: t.muted, marginTop: 8 }}>Sesiones ilimitadas</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 10 }}>
              <span style={{
                ...texto.nota, fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: bono.caducado
                  ? (noche ? semantic.danger.textNoche : semantic.danger.text)
                  : bono.urgente
                  ? (noche ? semantic.warning.textNoche : semantic.warning.text)
                  : t.muted,
              }}>
                {bono.textoCaducidad
                  ?? (bono.caducaEn ? `${bono.esMensual ? 'Próxima renovación' : 'Caduca'} el ${fechaLarga(bono.caducaEn)}` : bono.esMensual ? 'Activo' : '')}
              </span>
              <button
                type="button"
                onClick={() => navegar(`/portal/${slug}/compras`)}
                style={{ border: 'none', background: 'none', padding: 0, flexShrink: 0, ...texto.metaFuerte, fontSize: 12, color: t.heroAccent, cursor: 'pointer' }}
              >
                {bono.esMensual ? 'Gestionar mi plan →' : 'Comprar otro →'}
              </button>
            </div>
          </div>
        )}

        {/* Pagos — solo los ya cobrados, de un vistazo; la factura, el
            reintento o cambiar de tarjeta se hacen en /compras. */}
        {misRecibosPreview.length > 0 && (
          <>
            <p style={{ ...micro(9, 0.2), color: t.micro, margin: '20px 2px 8px' }}>Pagos</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {misRecibosPreview.map(r => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    background: t.surface, borderRadius: 14, padding: '11px 14px', boxShadow: sombra.cardInterna,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ ...texto.metaFuerte, fontSize: 12.5, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.concepto}
                    </p>
                    <p style={{ ...micro(9, 0.1), color: t.muted, marginTop: 2 }}>
                      {formatFecha(r.fechaCobro ?? r.fechaVencimiento)} · recibo enviado por email
                    </p>
                  </div>
                  <span style={{ ...texto.metaFuerte, fontSize: 12.5, color: t.ink, flexShrink: 0 }}>{r.importe} €</span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => navegar(`/portal/${slug}/compras`)}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '2px 0 0', ...texto.metaFuerte, fontSize: 12, color: t.heroAccent, cursor: 'pointer' }}
              >
                Ver todos los pagos →
              </button>
            </div>
          </>
        )}

        {/* Historial — mismas tarjetas que Próximas (valorar incluido para
            ASISTIDA): el diseño las simplifica a una fila porque su demo no
            necesita valorar de verdad, aquí la funcionalidad real ya
            construida pesa más que el pixel. */}
        {porTab.HISTORIAL.length > 0 && (
          <>
            <p style={{ ...micro(9, 0.2), color: t.micro, margin: '20px 2px 8px' }}>Historial</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {porTab.HISTORIAL.map(({ r, s }) => tarjetaReserva(r, s))}
            </div>
          </>
        )}
      </div>

      {/* Hoja de cristal de confirmación — mismo lenguaje que HojaPase: fondo
          desenfocado real, cápsula de 34 de radio, sombra tirada de verde
          oscuro. Reemplaza el BottomSheet genérico del sistema saliente. Un
          tercer motivo (Fase 3): confirmar la baja de la plaza fija. */}
      <div
        onClick={() => { setCancelando(null); setCambiandoHora(false); setConfirmandoBajaPlaza(false); }}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          opacity: (cancelando || confirmandoBajaPlaza) ? 1 : 0, pointerEvents: (cancelando || confirmandoBajaPlaza) ? 'auto' : 'none',
          background: noche ? 'rgba(8,9,6,.44)' : 'rgba(34,38,31,.24)',
          ...cristal(desenfoque.backdrop, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />
      <div
        role="dialog"
        aria-modal={!!cancelando || confirmandoBajaPlaza}
        aria-label={confirmandoBajaPlaza ? '¿Dar de baja tu plaza fija?' : cambiandoHora ? '¿Cambiar de hora?' : '¿Cancelar esta clase?'}
        style={{
          position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 41,
          maxWidth: 456, margin: '0 auto',
          background: t.bg, borderRadius: radio.hoja,
          border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.8)'}`,
          boxShadow: sombra.sheet, padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
          opacity: (cancelando || confirmandoBajaPlaza) ? 1 : 0,
          pointerEvents: (cancelando || confirmandoBajaPlaza) ? 'auto' : 'none',
          transform: (cancelando || confirmandoBajaPlaza) ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
          transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 4, background: noche ? '#3A3F33' : '#D8D4C9', margin: '0 auto 20px' }} />
        <h2 style={{ ...display(26, true), color: t.ink, textAlign: 'center' }}>
          {confirmandoBajaPlaza ? '¿Dar de baja tu plaza fija?' : cambiandoHora ? '¿Cambiar de hora?' : '¿Cancelar esta clase?'}
        </h2>
        <p style={{ ...texto.meta, color: t.muted, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
          {confirmandoBajaPlaza
            ? 'Dejará de reservarte el hueco cada semana. Las clases ya reservadas no se tocan.'
            : cambiandoHora
              ? 'No podemos moverte de hora automáticamente: cancelamos esta y te llevamos a elegir otra que te venga mejor.'
              : cancelando?.id.startsWith('res-pf-')
                ? 'Es tu plaza fija: te guardaremos una recuperación para que la uses otro día. Liberas el hueco para otra socia.'
                : 'Perderás tu plaza y liberarás el hueco para otra socia.'}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={() => { setCancelando(null); setCambiandoHora(false); setConfirmandoBajaPlaza(false); }}
            style={{
              flex: 1, height: 54, borderRadius: 27, border: `1px solid ${t.line}`,
              background: 'transparent', color: t.ink, ...texto.botonCta, fontSize: 14, cursor: 'pointer',
            }}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmandoBajaPlaza) { void confirmarBajaPlaza(); return; }
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
              background: noche ? 'rgba(232,106,95,.14)' : semantic.danger.soft,
              color: noche ? semantic.danger.textNoche : semantic.danger.text,
              ...texto.botonCta, fontSize: 14, cursor: 'pointer',
            }}
          >
            {confirmandoBajaPlaza ? 'Sí, dar de baja' : cambiandoHora ? 'Sí, cancelar y elegir otra' : 'Sí, cancelar'}
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
          depender de qué sección esté mirando la socia: es urgente por
          diseño. Cerrarlo tocando el fondo (`onClose`) NO es "rechazar", solo
          lo oculta hasta la siguiente oferta distinta (ver `ofertaOcultaId`
          arriba); la reserva sigue reflejada en la sección de lista de
          espera. */}
      <HojaOfertaEspera
        oferta={mostrarSheetOferta ? ofertaActiva : null}
        onClose={() => setOfertaOcultaId(ofertaActiva?.reservaId ?? null)}
        onAceptar={onAceptarOferta}
        onDejarPasar={onDejarPasarOferta}
        onError={mensaje => setAviso({ texto: mensaje, error: true })}
      />

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
