'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClases, getInstructoras, getPlazaFija, getReservas } from '@/lib/student/datos';
import { PlazaFijaCard } from '@/components/student/domain/PlazaFijaCard';
import { cancelarReserva, aceptarOfertaEspera } from '@/lib/student/reservas-acciones';
import { avisoCancelacion } from '@/lib/student/maquina-reserva';
import { etiquetaDia, fechaCorta, hoyISO, horaFin } from '@/lib/student/formato';
import { acotarFijasProximas, diaSemanaDe } from '@/lib/student/plaza-fija';
import { TEXTOS_PLAZA_FIJA } from '@/lib/student/plaza-fija-textos';
import { mensajeTrasCancelar } from '@/lib/student/cancelar-mensajes';
import { alCalendario } from '@/lib/student/calendario-dispositivo';
import { Badge, EnCursoBadge } from '@/components/student/ui/Badge';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso } from '@/lib/student/estado-clase';
import { etiquetaHistorial } from '@/lib/student/etiqueta-historial';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { CaraInstructora } from '@/components/student/domain/InstructorCard';
import { agruparAgenda, faltaTexto, tileFecha } from '@/lib/student/agenda-proximas';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { vibrar } from '@/lib/nativo/puente';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';

// Feedback real de una propietaria en prueba (14-sep): una socia no sabía que
// podía cancelar SOLO un día de su clase fija sin perder el hueco semanal — esta
// tarjeta usaba el mismo badge «Reservada ✓» que cualquier otra clase.
//
// ⚠️ Una reserva es de su clase fija por su ID (`res-pf-`, la crea el motor), NO
// por coincidir con el horario de una plaza. Antes se comparaba por sala, día y
// hora: una reserva hecha a mano en el mismo horario también salía como «Tu plaza
// fija», y el aviso de cancelar le prometía «seguirás apuntada cada semana» a
// quien no lo estaba por ese camino. Misma regla que el panel
// (`marcaReserva`, lib/plazas-fijas-cancelacion.ts).
const esClaseFija = (reservaId: string) => reservaId.startsWith('res-pf-');

// Mis clases (§A.9): próximas / historial, con cancelación y salida de la lista
// de espera.
//
// ⚠️ La diferencia de fondo con el paquete: allí la cancelación se da por buena
// en el cliente (`setCanceladas([...c, id])`) y el aviso de si se devuelve el
// bono lo calcula el navegador. Aquí no se toca la lista a mano: se RECARGA
// desde el servidor, y lo que se le dice a la alumna sale de `bonoDevuelto`,
// que es una columna que devuelve `cancelar_reserva_plaza`. Anunciar «sesión
// devuelta» y que no lo esté es un problema de dinero, no de UI.
export default function MisReservasPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();

  // `?tab=fijas`: llegan desde la tarjeta de Inicio y desde la ficha de una clase
  // fija. Cualquier otro valor cae en «Próximas».
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(sp.get('tab') === 'fijas' ? 'fijas' : sp.get('tab') === 'hist' ? 'hist' : 'prox');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [aceptandoId, setAceptandoId] = useState<string | null>(null);
  // El reloj compartido de la app, que AVANZA (ver `useAhoraMs`).
  //
  // Antes era `useState(() => Date.now())`, congelado al montar. Eso ya no basta
  // por dos motivos: «en curso» tiene que aparecer y desaparecer sola mientras la
  // pantalla está abierta, y ese inicializador corre TAMBIÉN en el SSR de este
  // componente de cliente, así que servidor y cliente capturaban instantes
  // distintos — un desajuste de hidratación latente. `null` hasta que hidrata.
  const ahoraMs = useAhoraMs();

  const cargar = useCallback(async () => {
    const [reservas, clases, instructoras, plazaFija] = await Promise.all([
      getReservas(estudio.slug), getClases(estudio.slug), getInstructoras(estudio.slug), getPlazaFija(estudio.slug),
    ]);
    return { reservas, clases, instructoras, plazaFija };
  }, [estudio.slug]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false, `alumna:${estudio.slug}:mis-clases`);
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);
  // «+ Calendario»: en la app (iOS 17+), la hoja de iOS ya rellena; si no, el
  // .ics / Google de siempre (lib/student/calendario-dispositivo.ts).
  const alCal = (c: Clase, instructora?: string) => void alCalendario({ slug: estudio.slug, nombre: estudio.nombre, direccion: estudio.direccion }, c, instructora)
    .then((r) => { if (r === 'añadida') toast('Añadida a tu calendario'); });
  const actualizar = useCallback(async () => {
    invalidarCatalogo(estudio.slug, { conservarVistas: true });
    await refrescar();
  }, [estudio.slug, refrescar]);

  const items = (data?.reservas ?? [])
    .map((r) => ({ r, c: data?.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c));

  // ⚠️ «Próximas» filtra también por FECHA, no solo por estado. El paquete solo
  // mira el estado porque sus datos de ejemplo son siempre futuros; con datos
  // reales hay reservas CONFIRMADA de meses atrás que nadie marcó como asistida
  // ni como ausencia, y sin este filtro aparecían como próximas: en la primera
  // prueba, «Lun 29 · 11:00 · Confirmada ✓» de un 29 de junio.
  //
  // Las pasadas no se pierden: caen al historial, que es donde se buscan.
  const hoy = hoyISO();
  const activa = (e: string) => e === 'confirmada' || e === 'en-espera';
  const proxTodas = items.filter((x) => activa(x.r.estado) && x.c.fecha >= hoy);
  // El motor reserva la clase fija con meses de antelación: se enseñan las
  // primeras y se dice cuántas más hay, en vez de una lista de medio año.
  const { visibles: prox, ocultas: fijasOcultas } = acotarFijasProximas(proxTodas);
  const hist = items.filter((x) => !activa(x.r.estado) || x.c.fecha < hoy);
  // P-5: la oferta vive hasta `ofertaExpiraEn` — pasado ese instante el cron
  // ya la ha caducado y el sitio no es suyo, aunque el catálogo todavía no se
  // haya recargado.
  const ofertaViva = (r: { estado: string; ofertaExpiraEn?: string | null }) =>
    r.estado === 'en-espera' && !!r.ofertaExpiraEn && ahoraMs !== null && new Date(r.ofertaExpiraEn).getTime() > ahoraMs;
  const ofertas = prox.filter((x) => ofertaViva(x.r));
  // Por fecha y hora: la agenda agrupa por semana, y un bloque solo es uno si
  // sus clases llegan seguidas.
  const [siguiente, ...agenda] = prox
    .filter((x) => !ofertaViva(x.r))
    .sort((a, b) => `${a.c.fecha} ${a.c.hora}`.localeCompare(`${b.c.fecha} ${b.c.hora}`));

  const sel = items.find((x) => x.r.id === cancelId);
  const aviso = sel ? avisoCancelacion(sel.c, estudio.politicaCancelacionHoras) : null;
  const selEsFija = !!sel && sel.r.estado !== 'en-espera' && esClaseFija(sel.r.id);

  // Sin `useCallback` a propósito: cierra sobre `sel`, que se deriva en el
  // render a partir de `data`, y el compilador de React no puede preservar esa
  // memoización manual (`react-hooks/preserve-manual-memoization`). Memoizarla
  // a mano aquí no ahorra nada —el diálogo se repinta igual cuando cambia
  // `cancelando`— y sí rompe el lint.
  const confirmarCancelacion = async () => {
    if (!sel) return;
    setCancelando(true);
    const res = await cancelarReserva(estudio.slug, estudio.id, sel.r.id, { online });
    setCancelando(false);

    if (!res.ok) {
      if (res.sesionCaducada) { router.push(href('/acceso/login')); return; }
      // La reserva SIGUE ACTIVA: no se toca la lista y se deja el diálogo
      // abierto para que pueda reintentar sin volver a buscarla.
      toast(res.error);
      return;
    }

    setCancelId(null);
    // Después de que el servidor diga que sí, nunca antes (ver `vibrar`).
    void vibrar('aviso');
    // El mensaje sale de lo que dijo el SERVIDOR, no de lo que calculó el aviso
    // previo: la ventana real puede diferir (tipo de clase con la suya propia).
    toast(mensajeTrasCancelar(res, { esClaseFija: !!sel && esClaseFija(sel.r.id), fechaCorta }));
    // Y se recarga: la plaza vuelve al aforo y puede haber promocionado a
    // alguien de la cola. Tachar la fila a mano enseñaría un estado inventado.
    reintentar();
  };

  // P-5 (auditoría 23ª pasada): hasta ahora no había NINGUNA vía en la PWA
  // para aceptar una oferta de lista de espera — el aviso llegaba, y la
  // única acción posible era esperar a que el cron se la quitara al caducar.
  async function handleAceptarOferta(reservaId: string) {
    setAceptandoId(reservaId);
    const res = await aceptarOfertaEspera(estudio.slug, estudio.id, reservaId, { online });
    setAceptandoId(null);

    if (!res.ok) {
      if (res.sesionCaducada) { router.push(href('/acceso/login')); return; }
      toast(res.error);
      // ⚠️ 26ª pasada: aquí no se recargaba nada, y no era cosmético. El camino
      // de fallo de `aceptarOfertaListaEspera` NO deja las cosas como estaban:
      // la RPC YA canceló la reserva (lo dice su propio comentario, «PIERDE EL
      // SITIO — ya la ha cancelado la RPC») y le ha creado una recuperación.
      // Sin recargar, la socia se queda leyendo «en lista de espera» sobre una
      // reserva que ya no existe, y sin ver la recuperación que acaba de ganar.
      //
      // `refrescar`, no `reintentar`: `reintentar` pasa por `loading`, y la
      // lista está gateada a `estado !== 'loading'`, así que desmontaría la
      // pantalla entera bajo un esqueleto —y taparía con un `ErrorState` el
      // toast que acaba de explicar la recuperación— justo en el momento en
      // que la socia necesita leerlo. `refrescar` sustituye los datos si va
      // bien y conserva los que había si falla, que es para lo que existe.
      //
      // Sin red no se pide nada: `aceptarOfertaEspera` sale antes de tocar el
      // servidor, así que ahí no ha cambiado nada que recargar.
      if (online) void refrescar();
      return;
    }
    if (res.confirmada) void vibrar('exito');
    toast(res.confirmada
      ? '¡Plaza confirmada! ✓'
      : 'Alguien se te adelantó por segundos — te hemos dado una clase de recuperación.');
    reintentar();
  }

  return (
    <StudentShell>
      <TirarParaActualizar onRefrescar={actualizar} />
      <PageHeader titulo="Mis clases" />

      {/* Segmentado con píldora deslizante (§I). `tablist` alrededor: unas
          pestañas sueltas (`role="tab"`) sin su lista no se anuncian como tales. */}
      <div
        role="tablist"
        aria-label="Mis clases"
        className="px"
        style={{ position: 'relative', display: 'flex', background: 'var(--muted)', borderRadius: 999, padding: 4, margin: '14px 18px 0' }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc((100% - 8px) / 3)',
            background: 'var(--card)', borderRadius: 999, boxShadow: '0 3px 10px rgba(26,26,26,.1)',
            transform: `translateX(${TABS.indexOf(tab) * 100}%)`,
            transition: 'transform .32s var(--ease-spring)',
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            // 9 px arriba y abajo dejaban la pestaña en 34 px de alto. `tap`
            // la lleva a 44 sin mover ni un píxel de lo que se ve.
            className="tap"
            style={{
              flex: 1, position: 'relative', border: 'none', background: 'none', padding: '9px 0',
              fontSize: 'var(--t-small)', fontWeight: 800,
              // ⚠️ `--subtle-foreground` NO vale aquí. Está calibrado contra el
              // crema del fondo (4,55:1) y contra la tarjeta blanca (4,80),
              // pero la pista de este control es `--muted`, que es más oscura:
              // ahí cae a **4,09:1** y «Historial» quedaba por debajo de AA.
              // Es el mismo error que ya documenta DC-7 —un token calibrado
              // contra un fondo y usado sobre otro—, así que la salida no es
              // retocar el token (rompería las 21 pantallas donde sí cumple)
              // sino usar aquí el que sí contrasta: 5,93:1.
              color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
              transition: 'color .25s',
            }}
          >
            {ETIQUETA_TAB[t]}
          </button>
        ))}
      </div>

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={110} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && tab === 'fijas' && (
          data.plazaFija.plazas.length === 0 ? (
            <EmptyState
              ilustracion="calendario"
              titulo="Aún no tienes clase fija"
              cuerpo={TEXTOS_PLAZA_FIJA.vacia}
              accion="Ver el horario"
              href={href('/reservar')}
            />
          ) : (
            // Las recuperaciones se quedan en Bonos, junto a su saldo: aquí solo sus clases fijas.
            <PlazaFijaCard
              plazas={data.plazaFija.plazas} calendario={data.plazaFija.calendario}
              recuperaciones={{ disponibles: 0, proximaCaducidad: null, detalle: [] }}
              hrefHorario={href('/reservar')} onCambio={reintentar}
            />
          )
        )}

        {data && estado !== 'loading' && estado !== 'error' && tab !== 'fijas' && (
          tab === 'prox' ? (
            prox.length === 0 ? (
              <EmptyState
                ilustracion="postura"
                titulo="No tienes clases próximas"
                cuerpo="Reserva tu siguiente sesión — puede que hoy queden plazas."
                accion="Ver horario"
                href={href('/reservar')}
              />
            ) : (
              <>
              {/* ⚠️ Rediseño del 30-sep (el fundador: «muy pobre, poco
                  intuitivo»). Antes cada clase era la MISMA tarjeta grande con
                  tres botones, así que una clase fija semanal llenaba la
                  pantalla de seis bloques idénticos con seis «Cancelar» rojos.
                  Ahora: lo urgente arriba (una plaza ofrecida de la lista de
                  espera), la próxima clase destacada con sus acciones, y el
                  resto como agenda compacta agrupada por semana. La lógica de
                  cancelar y aceptar es la de siempre: solo cambia cómo se pinta. */}
              {ofertas.map(({ r, c }) => (
                <TarjetaOferta
                  key={r.id} c={c} r={r} instructora={data.instructoras.find((x) => x.id === c.instructoraId)?.nombre}
                  online={online} aceptando={aceptandoId === r.id}
                  onAceptar={() => handleAceptarOferta(r.id)} onSalir={() => setCancelId(r.id)}
                />
              ))}
              {siguiente && (
                <HeroProxima
                  r={siguiente.r} c={siguiente.c}
                  instructora={data.instructoras.find((x) => x.id === siguiente.c.instructoraId)}
                  hrefDetalle={href(`/mis-reservas/${siguiente.r.id}`)}
                  enCurso={estaEnCurso(siguiente.c, ahoraMs)}
                  esFija={siguiente.r.estado !== 'en-espera' && esClaseFija(siguiente.r.id)}
                  puedeCancelar={online && avisoCancelacion(siguiente.c, estudio.politicaCancelacionHoras).puede}
                  motivoNoCancelar={!online ? 'Necesitas conexión' : 'La clase ya ha empezado'}
                  onCalendario={() => alCal(siguiente.c, data.instructoras.find((x) => x.id === siguiente.c.instructoraId)?.nombre)}
                  onCancelar={() => setCancelId(siguiente.r.id)}
                />
              )}
              {agruparAgenda(agenda, hoy).map((g) => (
                <section key={g.titulo} aria-label={g.titulo} style={{ marginTop: 8 }}>
                  <p className="t-label" style={{ margin: '0 4px 7px' }}>{g.titulo}</p>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {g.items.map(({ r, c }, idx) => (
                      <FilaAgenda
                        key={r.id} r={r} c={c} primera={idx === 0}
                        instructora={data.instructoras.find((x) => x.id === c.instructoraId)?.nombre}
                        hrefDetalle={href(`/mis-reservas/${r.id}`)}
                        enCurso={estaEnCurso(c, ahoraMs)}
                        esFija={r.estado !== 'en-espera' && esClaseFija(r.id)}
                        puedeCancelar={online && avisoCancelacion(c, estudio.politicaCancelacionHoras).puede}
                        motivoNoCancelar={!online ? 'Necesitas conexión' : 'La clase ya ha empezado'}
                        onCancelar={() => setCancelId(r.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {fijasOcultas > 0 && (
                <p data-testid="fijas-ocultas" className="t-meta" style={{ margin: '4px 4px 0', textAlign: 'center' }}>
                  {TEXTOS_PLAZA_FIJA.masReservadas(fijasOcultas)}
                </p>
              )}
              </>
            )
          ) : (
            hist.length === 0 ? (
              <EmptyState ilustracion="recibo" titulo="Aún no hay historial" cuerpo="Aquí verás las clases a las que has ido." />
            ) : (
              hist.map(({ r, c }) => (
                <Link
                  key={r.id}
                  href={href(`/mis-reservas/${r.id}`)}
                  transitionTypes={TRANSICION_ADELANTE}
                  className="card card--tap"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>{c.nombre}</p>
                    <p className="t-meta" style={{ marginTop: 1 }}>{fechaCorta(c.fecha)} · {c.hora}</p>
                  </div>
                  {/* ⚠️ La etiqueta sale de `etiquetaHistorial`, no de un
                      ternario con `else`. El `else` decía «Cancelada», y aquí
                      caen también las CONFIRMADA de clases ya pasadas en las
                      que el estudio no pasó lista —ver el filtro de `hist`
                      más arriba—: a una socia que reservó y fue se le decía
                      que había cancelado. */}
                  <Badge tone={etiquetaHistorial(r.estado).tono}>
                    {etiquetaHistorial(r.estado).texto}
                  </Badge>
                </Link>
              ))
            )
          )
        )}
      </div>

      <ConfirmationDialog
        open={Boolean(cancelId)}
        onClose={() => { if (!cancelando) setCancelId(null); }}
        titulo={sel?.r.estado === 'en-espera' ? '¿Salir de la lista de espera?' : selEsFija ? TEXTOS_PLAZA_FIJA.noPuedoTitulo : '¿Cancelar esta clase?'}
        cuerpo={sel ? `${sel.c.nombre} · ${etiquetaDia(sel.c.fecha)} ${sel.c.hora}` : ''}
        confirmar={sel?.r.estado === 'en-espera'
          ? 'Sí, salir'
          : selEsFija ? TEXTOS_PLAZA_FIJA.noPuedoConfirmar
          : aviso?.devolveriaCredito ? 'Sí, cancelar y recuperar sesión' : 'Sí, cancelar igualmente'}
        cancelar={selEsFija ? TEXTOS_PLAZA_FIJA.noPuedoMantener : 'Mantener mi reserva'}
        tono="danger"
        loading={cancelando}
        onConfirm={confirmarCancelacion}
      >
        {/* Una clase fija NO descuenta sesión de ningún bono: hablarle de «recuperar
            la sesión de tu bono» era falso. Se le dice qué toca de verdad. */}
        {sel && selEsFija && aviso && (
          <div data-testid="cancelar-clase-fija-aviso" style={{ background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>
              {TEXTOS_PLAZA_FIJA.noPuedoSolo(diaSemanaDe(sel.c.fecha))}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--accent-soft-foreground)' }}>
              {aviso.devolveriaCredito ? TEXTOS_PLAZA_FIJA.noPuedoATiempo : TEXTOS_PLAZA_FIJA.noPuedoTarde(aviso.horasVentana)}
            </p>
          </div>
        )}
        {sel && sel.r.estado !== 'en-espera' && !selEsFija && (
          <div
            style={{
              background: aviso?.devolveriaCredito ? 'var(--accent-soft)' : 'var(--warning-soft)',
              borderRadius: 'var(--radius-sm)', padding: '11px 14px', marginTop: 13,
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: aviso?.devolveriaCredito ? 'var(--accent-soft-foreground)' : 'var(--warning-foreground)' }}>
              {aviso?.devolveriaCredito
                ? 'Estás dentro del plazo: deberías recuperar la sesión de tu bono.'
                : `Quedan menos de ${aviso?.horasVentana ?? estudio.politicaCancelacionHoras} h: es probable que la sesión no se devuelva.`}
            </p>
            {/* ⚠️ El número sale de `aviso.horasVentana`, que es la ventana YA
                RESUELTA (la del tipo de clase manda sobre la del estudio), no de
                `estudio.politicaCancelacionHoras`. Escribir la del estudio era
                el número equivocado en cuanto un tipo de clase tuviera la suya:
                con 24 h propias y 12 del estudio, cancelar 18 h antes pintaba
                este aviso ámbar —bien— y a la vez decía «quedan menos de 12 h»,
                que es falso y se contradice solo.
                Se conserva el «deberías» / «es probable»: el navegador aplica la
                MISMA regla que el servidor, pero quien decide sigue siendo la
                base de datos y lo que de verdad pasó se dice después, con su
                respuesta. */}
          </div>
        )}
      </ConfirmationDialog>
    </StudentShell>
  );
}

type Tab = 'prox' | 'fijas' | 'hist';
const TABS: Tab[] = ['prox', 'fijas', 'hist'];
const ETIQUETA_TAB: Record<Tab, string> = { prox: 'Próximas', fijas: 'Fijas', hist: 'Historial' };

// ── Piezas de «Próximas» ─────────────────────────────────────────────────────

const BOTON_OSCURO: React.CSSProperties = {
  height: 34,
  background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)',
  color: 'var(--accent-deep-foreground)',
  border: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 35%, transparent)',
};

function Estado({ r, enCurso, esFija, c }: { r: Reserva; c: Clase; enCurso: boolean; esFija: boolean }) {
  // En curso manda sobre el estado de la reserva: si la clase está dándose,
  // «Lista de espera · 2ª» ya no es la noticia.
  if (enCurso) return <EnCursoBadge terminaA={horaFin(c.hora, c.duracionMin)} />;
  if (r.estado === 'en-espera') return <Badge tone="wait">{`Lista de espera${r.posicionEspera ? ` · ${r.posicionEspera}ª` : ''}`}</Badge>;
  return <Badge tone="ok">{esFija ? 'Tu clase fija ✓' : 'Reservada ✓'}</Badge>;
}

/** Una plaza ofrecida de la lista de espera: lo único que caduca solo. Va arriba. */
function TarjetaOferta({ r, c, instructora, online, aceptando, onAceptar, onSalir }: {
  r: Reserva; c: Clase; instructora?: string; online: boolean; aceptando: boolean; onAceptar: () => void; onSalir: () => void;
}) {
  return (
    <div className="a-pop" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-card)', padding: '13px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800 }}>{etiquetaDia(c.fecha)} · {c.hora}</p>
        <Badge tone="few">¡Plaza libre!</Badge>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--warning-foreground)' }}>
        Tienes hasta las {new Date(r.ofertaExpiraEn as string).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} para aceptarla — si no, pasa a la siguiente de la lista.
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--t-body)', fontWeight: 700 }}>{c.nombre}</p>
      <p className="t-meta" style={{ marginTop: 2 }}>{unirMeta(instructora, c.sala)}</p>
      <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--primary btn--sm tap" style={{ height: 34 }} disabled={!online || aceptando} title={!online ? 'Necesitas conexión' : undefined} onClick={onAceptar}>
          {aceptando ? 'Aceptando…' : 'Aceptar plaza'}
        </button>
        <button type="button" className="btn btn--light btn--sm tap" style={{ height: 34 }} disabled={!online || aceptando} title={!online ? 'Necesitas conexión' : undefined} onClick={onSalir}>
          Salir de la lista
        </button>
      </div>
    </div>
  );
}

/**
 * La siguiente clase, destacada. Mismo lenguaje que «Tu próxima clase» de
 * Inicio (`NextClassCard`): verde noche sobre la foto de la clase.
 */
function HeroProxima({ r, c, instructora, hrefDetalle, enCurso, esFija, puedeCancelar, motivoNoCancelar, onCalendario, onCancelar }: {
  r: Reserva; c: Clase; instructora?: Instructora; hrefDetalle: string; enCurso: boolean; esFija: boolean;
  puedeCancelar: boolean; motivoNoCancelar: string; onCalendario: () => void; onCancelar: () => void;
}) {
  const espera = r.estado === 'en-espera';
  const falta = faltaTexto(c.fecha, hoyISO());
  return (
    <section
      aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'}
      data-testid="proxima-clase"
      className="a-pop"
      style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--accent-deep-foreground)' }}
    >
      {c.fotoUrl && <div aria-hidden style={{ position: 'absolute', inset: 0, background: `url(${c.fotoUrl}) center/cover` }} />}
      {/* El velo es del COLOR DEL ESTUDIO (`--accent-deep`), no un verde fijo:
          un estudio terracota veía aquí una tarjeta verde. */}
      <div aria-hidden className="velo-marca" style={{ ['--velo-desde' as string]: '96%', ['--velo-hasta' as string]: '74%' }} />
      <div style={{ position: 'relative', padding: '15px 16px 14px' }}>
        <Link href={hrefDetalle} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <p className="t-label" style={{ color: 'var(--accent-deep-muted)' }}>
              {/* «Hoy»/«Mañana» ya los dice el titular: cuánto falta solo se
                  añade cuando aporta («En 5 días»). */}
              {enCurso ? 'Tu clase, en curso' : unirMeta('Tu próxima clase', falta.startsWith('En ') ? falta : undefined)}
            </p>
            <Estado r={r} c={c} enCurso={enCurso} esFija={esFija} />
          </div>
          <p className="t-num" style={{ margin: '10px 0 0', fontSize: 'var(--t-h2)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.05, color: 'var(--on-dark)' }}>
            {etiquetaDia(c.fecha)} · {c.hora}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--on-dark)' }}>
            {c.nombre} <span style={{ fontWeight: 500, color: 'var(--accent-deep-muted)' }}>· {c.duracionMin} min</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {instructora && <CaraInstructora i={instructora} lado={26} />}
            <span className="t-meta" style={{ color: 'color-mix(in srgb, var(--accent-deep-foreground) 85%, transparent)' }}>
              {unirMeta(instructora ? `con ${instructora.nombre}` : undefined, c.sala)}
            </span>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 7, marginTop: 13, flexWrap: 'wrap' }}>
          {!espera && (
            <button type="button" onClick={onCalendario} className="btn btn--sm tap" style={{ height: 34, background: 'var(--on-dark)', color: 'var(--accent-deep)' }}>
              + Calendario
            </button>
          )}
          <button
            type="button" onClick={onCancelar} className="btn btn--sm tap" style={BOTON_OSCURO}
            disabled={!puedeCancelar} title={!puedeCancelar ? motivoNoCancelar : undefined}
          >
            {espera ? 'Salir de la lista' : 'Cancelar'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Una fila de la agenda: fecha, qué y con quién. Tocarla abre la reserva. */
function FilaAgenda({ r, c, instructora, hrefDetalle, primera, enCurso, esFija, puedeCancelar, motivoNoCancelar, onCancelar }: {
  r: Reserva; c: Clase; instructora?: string; hrefDetalle: string; primera: boolean; enCurso: boolean; esFija: boolean;
  puedeCancelar: boolean; motivoNoCancelar: string; onCancelar: () => void;
}) {
  const t = tileFecha(c.fecha);
  const espera = r.estado === 'en-espera';
  return (
    <div data-testid="fila-agenda" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderTop: primera ? 'none' : '1px solid var(--border)' }}>
      <Link href={hrefDetalle} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
        <span
          aria-hidden
          style={{
            width: 46, flexShrink: 0, borderRadius: 12, padding: '6px 0 7px', textAlign: 'center',
            background: espera ? 'var(--muted)' : 'var(--accent-soft)',
            color: espera ? 'var(--foreground)' : 'var(--accent-soft-foreground)',
          }}
        >
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.06em' }}>{t.semana}</span>
          <span className="t-num" style={{ display: 'block', fontSize: 19, fontWeight: 800, lineHeight: 1.05 }}>{t.dia}</span>
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="trunc" style={{ fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-.01em' }}>{c.nombre}</span>
          <span className="t-meta trunc">{unirMeta(c.hora, instructora, c.sala)}</span>
          <span style={{ display: 'flex' }}><Estado r={r} c={c} enCurso={enCurso} esFija={esFija} /></span>
        </span>
      </Link>
      <button
        type="button" onClick={onCancelar} className="btn btn--sm tap"
        style={{ height: 30, flexShrink: 0, padding: '0 11px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
        disabled={!puedeCancelar} title={!puedeCancelar ? motivoNoCancelar : undefined}
      >
        {espera ? 'Salir de la lista' : 'Cancelar'}
      </button>
    </div>
  );
}

function unirMeta(...partes: Array<string | undefined>): string {
  return partes.filter(Boolean).join(' · ');
}
