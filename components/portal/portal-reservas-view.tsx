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

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Calendar, Clock, MapPin, QrCode, User as UserIcon } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';
import { formatFechaCorta as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { Toast, type AvisoToast } from '@/components/portal/ui';
import { semantic } from '@/lib/portal-tokens';
import { HojaPase, type DatosPase } from '@/components/portal/hoja-pase';
import { BotonesCalendario } from '@/components/portal/botones-calendario';
import { pedirPaseDeAcceso } from '@/lib/api-client';
import type { PortalSession } from '@/lib/portal-auth';
import {
  EASE, dur, transicion, display, micro, texto, radio, sombra, cristal, desenfoque,
} from '@/lib/portal-design';

// Stub de "pedir pase" para preview: NO llama a la API real (socioId
// ficticio, 404/error garantizado) — mismo criterio que PortalClasesView.
async function pedirPaseDeMuestra(): Promise<DatosPase> {
  return { hayPase: true, vigente: true, yaAsistida: false, codigo: 'PREVIEW', token: null };
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
  const { reservas, sesiones, tiposClase, salas, instructores, cancelarReserva, aceptarOfertaEspera, studio } = useStudio();
  const { t, noche } = useModo();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const [aceptandoId, setAceptandoId] = useState<string | null>(null);
  const [paseAbierto, setPaseAbierto] = useState(false);
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

  async function aceptarOferta(reservaId: string) {
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); return; }
    setAceptandoId(reservaId);
    const r = await aceptarOfertaEspera(reservaId);
    setAceptandoId(null);
    if (!r.ok) setAviso({ texto: r.error, error: true });
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      {/* Cabecera — mismo par volanta/titular que el resto de pantallas
          migradas: la micro-etiqueta cuenta el total, el titular serif dice
          qué es esto, con la cursiva como voz, no como énfasis. */}
      <div style={{ padding: '28px 24px 8px' }}>
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
                  flex: '0 0 auto', height: 40, padding: '0 16px', borderRadius: radio.pill,
                  background: activo ? 'var(--portal-brand)' : (noche ? 'rgba(28,31,23,.7)' : 'rgba(255,255,255,.7)'),
                  color: activo ? 'var(--portal-brand-foreground)' : t.muted2,
                  border: `1px solid ${activo ? 'transparent' : t.line}`,
                  ...texto.tab, textTransform: 'none', letterSpacing: 0,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                  transition: transicion(['background', 'color'], dur.color),
                }}
              >
                {label}{n > 0 ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>

        <div style={{ height: 20 }} />

        {lista.length === 0 ? (
          <EstadoVacio
            {...EMPTY_COPY[tab]}
            cta={tab === 'PROXIMAS' ? 'Ver horarios' : undefined}
            onCta={tab === 'PROXIMAS' ? () => navegar(`/portal/${slug}/clases`) : undefined}
            t={t}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lista.map(({ r, s }) => {
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

                  {r.estado === 'LISTA_ESPERA' && r.ofertaExpiraEn && (
                    <div style={{
                      marginTop: 14, padding: '13px 15px', borderRadius: 16,
                      background: noche ? 'rgba(224,148,43,.10)' : semantic.warning.soft,
                    }}>
                      <p style={{ ...texto.metaFuerte, fontSize: 12.5, color: t.ink, marginBottom: 10, lineHeight: 1.4 }}>
                        ¡Se ha liberado una plaza! Tienes hasta las {formatHora(r.ofertaExpiraEn)} para aceptarla.
                      </p>
                      <button
                        type="button"
                        disabled={aceptandoId === r.id}
                        onClick={() => aceptarOferta(r.id)}
                        style={{
                          width: '100%', height: 44, borderRadius: 22, border: 'none',
                          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                          ...texto.botonCta, fontSize: 13.5, cursor: aceptandoId === r.id ? 'default' : 'pointer',
                          opacity: aceptandoId === r.id ? 0.6 : 1,
                          transition: transicion(['opacity']),
                        }}
                      >
                        {aceptandoId === r.id ? 'Aceptando…' : 'Aceptar plaza'}
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
                      onClick={() => setCancelando(r)}
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
            })}
          </div>
        )}
      </div>

      {/* Hoja de cristal de confirmación — mismo lenguaje que HojaPase: fondo
          desenfocado real, cápsula de 34 de radio, sombra tirada de verde
          oscuro. Reemplaza el BottomSheet genérico del sistema saliente. */}
      <div
        onClick={() => setCancelando(null)}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          opacity: cancelando ? 1 : 0, pointerEvents: cancelando ? 'auto' : 'none',
          background: noche ? 'rgba(8,9,6,.44)' : 'rgba(34,38,31,.24)',
          ...cristal(desenfoque.backdrop, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />
      <div
        role="dialog"
        aria-modal={!!cancelando}
        aria-label="¿Cancelar esta clase?"
        style={{
          position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 41,
          maxWidth: 456, margin: '0 auto',
          background: t.bg, borderRadius: radio.hoja,
          border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.8)'}`,
          boxShadow: sombra.sheet, padding: '16px 26px calc(26px + env(safe-area-inset-bottom))',
          opacity: cancelando ? 1 : 0,
          pointerEvents: cancelando ? 'auto' : 'none',
          transform: cancelando ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
          transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 4, background: noche ? '#3A3F33' : '#D8D4C9', margin: '0 auto 20px' }} />
        <h2 style={{ ...display(26, true), color: t.ink, textAlign: 'center' }}>¿Cancelar esta clase?</h2>
        <p style={{ ...texto.meta, color: t.muted, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
          {cancelando?.id.startsWith('res-pf-')
            ? 'Es tu plaza fija: te guardaremos una recuperación para que la uses otro día. Liberas el hueco para otra socia.'
            : 'Perderás tu plaza y liberarás el hueco para otra socia.'}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={() => setCancelando(null)}
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
              if (!cancelando) return;
              const id = cancelando.id;
              setCancelando(null);
              if (!escribible) { setAviso({ texto: 'Vista previa: esta cancelación no se guarda de verdad.', error: false }); return; }
              void cancelarReserva(id).then(r => { if (!r.ok) setAviso({ texto: r.error, error: true }); });
            }}
            style={{
              flex: 1, height: 54, borderRadius: 27, border: 'none',
              background: noche ? 'rgba(232,106,95,.14)' : semantic.danger.soft,
              color: noche ? semantic.danger.textNoche : semantic.danger.text,
              ...texto.botonCta, fontSize: 14, cursor: 'pointer',
            }}
          >
            Sí, cancelar
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

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
