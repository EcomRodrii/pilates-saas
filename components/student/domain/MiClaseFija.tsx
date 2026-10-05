'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { vibrar } from '@/lib/nativo/puente';
import type { PlazaFijaVista, RecuperacionesVista } from '@/lib/student/tipos';
import type { CalendarioClaseFija as DatosCalendario } from '@/lib/student/mapeo';
import { etiquetaDia, euros, fechaCorta, fechaLarga, horaAhora } from '@/lib/student/formato';
import { nombreDia } from '@/lib/student/plaza-fija';
import { TEXTOS_PLAZA_FIJA, losDias } from '@/lib/student/plaza-fija-textos';
import {
  avisoPenalizacionTardia, comoConseguirla, estadoTarjetaFija, proximasSemanas, resumenDelMes, trasNoIr,
  type EstadoSemana, type SemanaFija,
} from '@/lib/student/clase-fija-vista';
import { anularPeticionPlazaFija, pedirPausaPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { cancelarReserva } from '@/lib/student/reservas-acciones';
import { avisoCancelacion } from '@/lib/student/maquina-reserva';
import { tileFecha } from '@/lib/student/agenda-proximas';
import { useOnline } from '@/lib/student/useOnline';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { validarPausa } from '@/lib/plazas-fijas-pausa';
import { hoyEnEstudio } from '@/lib/utils';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { Input } from '@/components/student/ui/Input';
import { Sheet } from '@/components/student/ui/Sheet';
import { useToast } from '@/components/student/ui/Toast';
import { Icono } from '@/components/student/ui/Icono';
import { InterruptorAuto } from '@/components/student/ui/InterruptorAuto';
// La fila de acción con baldosa vive en ui/: la comparte la cuota de Bonos.
import { FilaAccion as Fila } from '@/components/student/ui/FilaAccion';
import { CalendarioClaseFija } from '@/components/student/domain/CalendarioClaseFija';
import { DialogoDejarClaseFija } from '@/components/student/domain/DialogoDejarClaseFija';

// «Mis clases → Fija» (rediseño aprobado por el fundador el 5-oct-2026, maqueta
// `FijaNueva`). Su clase arriba, en el color del estudio; debajo las próximas
// semanas, donde un toque en un día es «no voy»; y lo demás como filas: clases
// por recuperar, pausar, el mes entero y dejarla.
//
// Nada de lo que había se ha quitado (tabla «Dónde queda cada cosa» de la
// maqueta): «No puedo asistir» es la píldora de cada semana, con su MISMA
// confirmación y su misma vía (`cancelarReserva`); la pausa es la misma hoja; el
// calendario es el mismo, ahora en una hoja; dejarla, el mismo diálogo.
//
// ⚠️ Nada optimista. Una píldora cambia solo cuando el servidor ha contestado que
// sí; con un no, se queda como estaba y el diálogo sigue abierto con el motivo.
//
// Sin «Deshacer» tras «no voy» (ver `trasNoIr`): volver a reservarla por la reserva
// normal no deja las cosas como estaban. Se le dice lo que pasó y, solo cuando
// volver no le regala ni le esconde nada, el enlace a la ficha de esa clase.

type PausaPedida = { id: string; desde: string; hasta: string } | null;
type Resultado = { plazaClave: string; fecha: string; sesionId: string; texto: string; invitarAReservar: boolean };

const clave = (p: PlazaFijaVista) => `${p.diaSemana}-${p.hora}-${p.sala}`;
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function MiClaseFija({ plazas, recuperaciones, calendario, hrefHorario, onCambio }: {
  plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista; calendario: DatosCalendario;
  hrefHorario: string;
  /** Tras un cambio que el servidor ha confirmado: la pantalla vuelve a leer sus datos SIN desmontar esto. */
  onCambio: () => void;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  // El reloj compartido, que AVANZA: con `useState(() => hoyEnEstudio())` el día
  // se congelaba al montar, y la app que se queda abierta de noche enseñaba por la
  // mañana la clase de ayer como próxima. `hoy` y la hora salen del MISMO instante.
  const ahoraMs = useAhoraMs();
  const instante = ahoraMs === null ? null : new Date(ahoraMs);
  const hoy = instante ? hoyEnEstudio(instante) : '';
  const ahora = instante ? horaAhora(instante) : '00:00';

  // «No voy»: UNA semana de su clase fija. No toca la recurrencia.
  const [noVoy, setNoVoy] = useState<{
    plaza: PlazaFijaVista; semana: SemanaFija & { ventanaCancelacionHoras: number | null; penalizacionTardiaEur: number | null; penalizacionTardiaHoras: number | null };
  } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // Lo que ya ha contestado el servidor, por clase: manda sobre los datos hasta que la pantalla los vuelve a leer.
  const [confirmadas, setConfirmadas] = useState<Record<string, EstadoSemana>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Tras confirmar, la semana deja de ser un botón (pasa a enlace) y el foco se
  // perdía en el <body>: se lleva a lo que contestó el servidor, que se lee entero.
  const resultadoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resultado) resultadoRef.current?.focus();
  }, [resultado]);

  // Pausa: pedirla NO la aplica; lo que cambia aquí es lo que ella ya ha pedido (confirmado por el servidor).
  const [pedidas, setPedidas] = useState<Record<string, PausaPedida>>({});
  const [pidiendo, setPidiendo] = useState<PlazaFijaVista | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const [dejando, setDejando] = useState<PlazaFijaVista | null>(null);
  const [verMes, setVerMes] = useState(false);

  const pausaPedidaDe = (p: PlazaFijaVista): PausaPedida => (p.id && p.id in pedidas ? pedidas[p.id] : p.pausaPedida);
  const avisoPausa = hasta ? validarPausa(desde, hasta, hoy) : null;

  function abrirPausa(p: PlazaFijaVista) {
    setPidiendo(p); setDesde(hoy); setHasta(''); setError('');
  }

  async function enviarPausa() {
    if (!pidiendo?.id || enviando) return;
    setEnviando(true); setError('');
    const r = await pedirPausaPlazaFija(estudio.slug, estudio.id, pidiendo.id, { desde, hasta });
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setPedidas((prev) => ({ ...prev, [pidiendo.id as string]: r.solicitudId ? { id: r.solicitudId, desde, hasta } : null }));
    setPidiendo(null);
  }

  async function anularPausa(p: PlazaFijaVista, peticionId: string) {
    if (!p.id || enviando) return;
    setEnviando(true); setError('');
    const r = await anularPeticionPlazaFija(estudio.slug, estudio.id, peticionId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setPedidas((prev) => ({ ...prev, [p.id as string]: null }));
  }

  async function confirmarNoVoy() {
    if (!noVoy?.semana.reservaId || cancelando) return;
    setCancelando(true);
    const r = await cancelarReserva(estudio.slug, estudio.id, noVoy.semana.reservaId, { online });
    setCancelando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      // La reserva SIGUE ACTIVA: la píldora no cambia y el diálogo sigue abierto para reintentar.
      toast(r.error);
      return;
    }
    const { plaza, semana } = noVoy;
    setNoVoy(null);
    void vibrar('aviso');
    setConfirmadas((prev) => ({ ...prev, [semana.sesionId]: 'no-va' }));
    setResultado({ plazaClave: clave(plaza), fecha: semana.fecha, sesionId: semana.sesionId, ...trasNoIr(r, fechaCorta) });
    onCambio();
  }

  const avisoNoVoy = noVoy && instante ? avisoCancelacion(noVoy.semana, estudio.politicaCancelacionHoras, instante) : null;
  // Solo junto al «tarde» del propio diálogo: las dos ventanas salen de fuentes que pueden
  // desfasarse (la del estudio se lee al abrir la app), y no pueden contradecirse.
  const penalizacionNoVoy = noVoy && instante && avisoNoVoy && !avisoNoVoy.devolveriaCredito
    ? avisoPenalizacionTardia(noVoy.semana, instante, euros) : null;
  const resumenMes = hoy ? resumenDelMes(calendario, hoy) : null;

  return (
    <div data-testid="plaza-fija" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {plazas.map((plaza) => {
        const pedida = pausaPedidaDe(plaza);
        const e = estadoTarjetaFija(plaza, pedida, fechaCorta);
        const semanas = (hoy ? proximasSemanas(plaza, calendario, hoy, ahora) : [])
          .map((s) => ({ ...s, estado: confirmadas[s.sesionId] ?? s.estado }));
        const res = resultado?.plazaClave === clave(plaza) ? resultado : null;
        const siguiente = plaza.proximas[0];
        return (
          <section key={clave(plaza)} aria-label={`Tu clase fija de ${losDias(plaza.diaSemana)} a las ${plaza.hora}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <article
              data-testid="clase-fija-mia" data-estado={e.tono} className="a-pop"
              style={{ borderRadius: 'var(--radius-hero)', background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', boxShadow: 'var(--shadow-hero)', padding: '16px 18px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <p className="t-label" style={{ color: 'var(--accent-deep-muted)' }}>{TEXTOS_PLAZA_FIJA.tarjetaUna}</p>
                <span
                  data-testid="clase-fija-estado"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-micro)', fontWeight: 800,
                    borderRadius: 999, padding: '4px 10px',
                    background: e.tono === 'activa' ? 'color-mix(in srgb, var(--accent-deep-foreground) 16%, transparent)' : 'var(--on-dark)',
                    color: e.tono === 'activa' ? 'var(--on-dark)' : 'var(--accent-deep)',
                  }}
                >
                  {e.tono === 'activa' && <Icono nombre="hecho" tamano={13} grosor={2.4} />}
                  {e.tono === 'pausa' || e.tono === 'pedida' ? <Icono nombre="reloj" tamano={13} grosor={2} /> : null}
                  {e.texto}
                </span>
              </div>
              {/* El día y la hora abren la ficha de su próxima clase, como en el horario. */}
              {siguiente ? (
                <Link
                  href={href(`/reservar/${siguiente.sesionId}`)} data-testid="enlace-clase-fija"
                  aria-label={`Ver tu próxima clase: ${etiquetaDia(siguiente.fecha).toLowerCase()} a las ${siguiente.hora}`}
                  style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
                >
                  <TituloClase plaza={plaza} />
                </Link>
              ) : <TituloClase plaza={plaza} />}
              <p data-testid="clase-fija-hasta" style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>{e.hasta}</p>
              <p data-testid="plaza-fija-reservada-sola" style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.45, color: 'color-mix(in srgb, var(--accent-deep-foreground) 88%, transparent)' }}>
                {e.frase}
              </p>
              {plaza.pausa && !plaza.pausa.enCurso && (
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 88%, transparent)' }}>
                  Pausa del {fechaCorta(plaza.pausa.desde)} al {fechaCorta(plaza.pausa.hasta)}.
                </p>
              )}
              {pedida && (
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 88%, transparent)' }}>
                  Pausa pedida del {fechaCorta(pedida.desde)} al {fechaCorta(pedida.hasta)} · esperando a tu estudio
                </p>
              )}
            </article>

            {e.tono !== 'sin-clase' && plaza.estado === 'ACTIVA' && (
              <div className="card" data-testid="proximas-clases-fijas" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <p className="t-label">Próximas semanas</p>
                  {semanas.some((s) => s.estado === 'va') && <span className="t-meta">Toca un día si no vas</span>}
                </div>
                {semanas.length === 0 ? (
                  <p className="t-meta" style={{ margin: '8px 0 0' }}>{TEXTOS_PLAZA_FIJA.sinProximas}</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', gap: 7 }}>
                    {semanas.map((s) => (
                      <li key={s.sesionId} style={{ flex: '1 1 0', minWidth: 0, display: 'flex' }}>
                        <Pildora
                          semana={s}
                          hrefFicha={href(`/reservar/${s.sesionId}`)}
                          puedeNoIr={online && s.estado === 'va' && !!s.reservaId && avisoCancelacion({ fecha: s.fecha, hora: s.hora, ventanaCancelacionHoras: null }, estudio.politicaCancelacionHoras, instante ?? undefined).puede}
                          onNoVoy={() => {
                            const p = plaza.proximas.find((x) => x.sesionId === s.sesionId);
                            setNoVoy({ plaza, semana: { ...s, ventanaCancelacionHoras: p?.ventanaCancelacionHoras ?? null, penalizacionTardiaEur: p?.penalizacionTardiaEur ?? null, penalizacionTardiaHoras: p?.penalizacionTardiaHoras ?? null } });
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {/* Montada siempre (vacía hasta que el servidor contesta): una región
                    `status` que aparece ya con el texto puede no anunciarse. */}
                <div
                  role="status" tabIndex={-1} ref={res ? resultadoRef : undefined}
                  data-testid={res ? 'no-voy-resultado' : undefined}
                  style={res
                    ? { marginTop: 12, background: 'var(--muted)', color: 'var(--foreground)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 'var(--t-small)', lineHeight: 1.45, outline: 'none' }
                    : { outline: 'none' }}
                >
                  {res && (
                    <>
                      <b>{mayuscula(etiquetaDia(res.fecha, hoy || undefined))}: no vas.</b> {res.texto}
                      {res.invitarAReservar && (
                        <span style={{ display: 'block', marginTop: 4 }}>
                          Si cambias de idea,{' '}
                          {/* `--foreground` subrayado y no el acento: el acento se calibra contra la tarjeta, no contra `--muted`. */}
                          <Link href={href(`/reservar/${res.sesionId}`)} data-testid="volver-a-reservarla" style={{ color: 'var(--foreground)', fontWeight: 800, textDecoration: 'underline' }}>
                            vuelve a reservarla desde el horario
                          </Link>.
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="card" style={{ padding: '0 16px', overflow: 'hidden' }}>
        {recuperaciones.disponibles > 0 && (
          <Fila
            icono="plaza" acento testId="fila-recuperaciones"
            titulo={recuperaciones.disponibles === 1 ? '1 clase por recuperar' : `${recuperaciones.disponibles} clases por recuperar`}
            detalle={[
              recuperaciones.proximaCaducidad ? `La primera caduca el ${fechaCorta(recuperaciones.proximaCaducidad)}` : null,
              // De cuáles se acuerda: las que se ganó. El nombre sale del VÍNCULO con el canje, nunca del motivo libre del mostrador.
              ...recuperaciones.detalle.filter((r) => r.deRecompensa).map((r) => `Una es tu ${r.deRecompensa}`),
            ].filter(Boolean).join(' · ')}
            accion={<Link href={hrefHorario} className="btn btn--secondary btn--sm tap">Elegir clase</Link>}
          />
        )}
        {plazas.map((plaza) => {
          const pedida = pausaPedidaDe(plaza);
          // Una pausa se pide sobre una plaza activa que no tenga ya una (el servidor lo vuelve a mirar).
          const puedePedir = estudio.puedePedirPausa === true && !!plaza.id && plaza.estado === 'ACTIVA' && !plaza.pausa && !pedida;
          if (!puedePedir && !pedida) return null;
          const deQue = plazas.length > 1 ? ` de ${losDias(plaza.diaSemana)}` : '';
          return pedida ? (
            <Fila
              key={`pausa-${clave(plaza)}`} icono="reloj"
              titulo={`Pausa pedida${deQue}`}
              detalle={`Del ${fechaCorta(pedida.desde)} al ${fechaCorta(pedida.hasta)} · esperando a tu estudio`}
              accion={<Button variant="ghost" size="sm" loading={enviando} onClick={() => void anularPausa(plaza, pedida.id)}>{TEXTOS_PLAZA_FIJA.botonAnular}</Button>}
            />
          ) : (
            <Fila
              key={`pausa-${clave(plaza)}`} icono="reloj" testId="pausar-clase-fija"
              titulo={`Pausar unas semanas${deQue}`}
              detalle="Vacaciones, lesión… Tu estudio la confirma"
              onClick={() => abrirPausa(plaza)}
            />
          );
        })}
        {plazas.length > 0 && (
          <Fila
            icono="calendario" testId="ver-mes-clase-fija"
            titulo="Ver el mes entero"
            detalle={resumenMes ?? 'Tus días, mes a mes'}
            onClick={() => setVerMes(true)}
          />
        )}
        {plazas.filter((p) => (estudio.puedePedirPlazaFija === true || p.deClaseFija) && !!p.id).map((plaza) => (
          <Fila
            key={`dejar-${clave(plaza)}`} icono="cerrar" peligro testId="dejar-clase-fija"
            titulo={plazas.length > 1 ? `${TEXTOS_PLAZA_FIJA.dejarBoton} de ${losDias(plaza.diaSemana)}` : TEXTOS_PLAZA_FIJA.dejarBoton}
            disabled={!online}
            onClick={() => setDejando(plaza)}
          />
        ))}
      </div>

      {plazas.length > 0 && (
        <p className="t-meta" style={{ margin: '0 4px' }}>
          {estudio.puedePedirPlazaFija === true || plazas.some((p) => p.deClaseFija) ? TEXTOS_PLAZA_FIJA.cambiarlaDeDiaHora : TEXTOS_PLAZA_FIJA.cambiarla}{' '}
          <Link href={href('/mensajes')} style={{ fontWeight: 800, color: 'var(--accent)' }}>{TEXTOS_PLAZA_FIJA.escribir}</Link>
        </p>
      )}

      {error && !pidiendo && <p role="alert" className="t-meta" style={{ margin: 0 }}>{error}</p>}

      <ConfirmationDialog
        open={noVoy !== null}
        onClose={() => { if (!cancelando) setNoVoy(null); }}
        titulo={TEXTOS_PLAZA_FIJA.noPuedoTitulo}
        cuerpo={noVoy ? `${[noVoy.plaza.tipo, noVoy.plaza.sala].filter(Boolean).join(' · ')} · ${etiquetaDia(noVoy.semana.fecha)} ${noVoy.semana.hora}` : ''}
        confirmar={TEXTOS_PLAZA_FIJA.noPuedoConfirmar}
        cancelar={TEXTOS_PLAZA_FIJA.noPuedoMantener}
        tono="danger"
        loading={cancelando}
        onConfirm={() => void confirmarNoVoy()}
      >
        {noVoy && avisoNoVoy && (
          <div data-testid="no-puedo-aviso" style={{ background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>
              {TEXTOS_PLAZA_FIJA.noPuedoSolo(noVoy.plaza.diaSemana)}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--accent-soft-foreground)' }}>
              {avisoNoVoy.devolveriaCredito ? TEXTOS_PLAZA_FIJA.noPuedoATiempo : TEXTOS_PLAZA_FIJA.noPuedoTarde(avisoNoVoy.horasVentana)}
            </p>
            {/* Tarde y con penalización en su estudio (o en ese tipo de clase): se dice ANTES de confirmar. */}
            {penalizacionNoVoy && (
              <p data-testid="no-puedo-penalizacion" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>
                {penalizacionNoVoy}
              </p>
            )}
          </div>
        )}
      </ConfirmationDialog>

      <DialogoDejarClaseFija plaza={dejando} onClose={() => setDejando(null)} onDejada={onCambio} />

      <Sheet open={pidiendo !== null} onClose={() => { if (!enviando) setPidiendo(null); }} label="Pedir una pausa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>Pedir una pausa</p>
          <p className="t-meta" style={{ margin: 0 }}>
            Tu estudio la revisa y te contesta aquí. Hasta entonces tu clase fija sigue igual.
          </p>
          <Input label="Desde" type="date" min={hoy} value={desde} onChange={(ev) => { setError(''); setDesde(ev.target.value); }} />
          <Input
            label="Hasta" type="date" min={desde || hoy} value={hasta}
            onChange={(ev) => { setError(''); setHasta(ev.target.value); }}
            error={avisoPausa ?? undefined}
          />
          {error && <p role="alert" className="t-meta" style={{ margin: 0 }}>{error}</p>}
          <Button full loading={enviando} disabled={!desde || !hasta || !!avisoPausa} onClick={() => void enviarPausa()}>
            Pedir la pausa
          </Button>
        </div>
      </Sheet>

      <Sheet open={verMes} onClose={() => setVerMes(false)} label="Tu clase fija, mes a mes">
        {verMes && <CalendarioClaseFija datos={calendario} hoy={hoy} soportaListaEspera={estudio.soportaListaEspera} suelto />}
      </Sheet>
    </div>
  );
}

function TituloClase({ plaza }: { plaza: PlazaFijaVista }) {
  return (
    <>
      <p className="t-num" style={{ margin: '10px 0 0', fontSize: 'var(--t-h2)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.05, color: 'var(--on-dark)' }}>
        {mayuscula(nombreDia(plaza.diaSemana))} {plaza.hora}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--on-dark)' }}>
        {[plaza.tipo, plaza.sala, plaza.instructora ? `con ${plaza.instructora}` : null].filter(Boolean).join(' · ')}
      </p>
    </>
  );
}

const TEXTO_SEMANA: Record<EstadoSemana, string> = {
  // «Sin reservar» y no «Sin plaza»: no se sabe si está llena o si su cuota no la cubre (lo mismo que dice el calendario).
  va: 'Vas', 'va-a-mano': 'Vas', 'no-va': 'No vas', pausa: 'Pausa', 'sin-reservar': 'Sin reservar',
};

/** Una semana. Con su reserva de clase fija, un toque = «no voy» (con confirmación). Si no, abre la ficha de ese día. */
function Pildora({ semana, hrefFicha, puedeNoIr, onNoVoy }: {
  semana: SemanaFija; hrefFicha: string; puedeNoIr: boolean; onNoVoy: () => void;
}) {
  const t = tileFecha(semana.fecha);
  const va = semana.estado === 'va' || semana.estado === 'va-a-mano';
  const estilo: React.CSSProperties = {
    display: 'block', width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '9px 2px 8px', textAlign: 'center', font: 'inherit',
    border: `1.5px ${semana.estado === 'sin-reservar' ? 'dashed' : 'solid'} ${va ? 'var(--accent)' : 'var(--border)'}`,
    background: va ? 'var(--accent-soft)' : 'var(--muted)',
    color: va ? 'var(--accent-soft-foreground)' : 'var(--muted-foreground)',
    textDecoration: 'none',
  };
  const largo = fechaLarga(semana.fecha);
  const dentro = (
    <>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.06em' }}>{t.semana}</span>
      <span className="t-num" style={{ display: 'block', fontSize: 21, fontWeight: 800, lineHeight: 1.1, textDecoration: semana.estado === 'no-va' ? 'line-through' : 'none' }}>{t.dia}</span>
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 2, maxWidth: '100%', fontSize: 10.5, fontWeight: 800, lineHeight: 1.15 }}>
        {va && <Icono nombre="hecho" tamano={11} grosor={2.6} />}
        {TEXTO_SEMANA[semana.estado]}
      </span>
    </>
  );
  if (semana.estado === 'va' && semana.reservaId) {
    return (
      <button
        type="button" className="tap" data-testid="semana-clase-fija" data-estado={semana.estado}
        aria-label={`${mayuscula(largo)}, ${semana.hora}: vas. ${TEXTOS_PLAZA_FIJA.noPuedo}`}
        disabled={!puedeNoIr} onClick={onNoVoy}
        style={{ ...estilo, cursor: puedeNoIr ? 'pointer' : 'default', opacity: puedeNoIr ? 1 : 0.7 }}
      >
        {dentro}
      </button>
    );
  }
  if (semana.estado === 'pausa') {
    return <span data-testid="semana-clase-fija" data-estado={semana.estado} aria-label={`${mayuscula(largo)}: en pausa`} style={estilo}>{dentro}</span>;
  }
  return (
    <Link
      href={hrefFicha} data-testid="semana-clase-fija" data-estado={semana.estado}
      aria-label={`${mayuscula(largo)}, ${semana.hora}: ${semana.estado === 'no-va' ? 'no vas' : semana.estado === 'sin-reservar' ? 'sin reservar' : 'vas (reservada a mano)'}. Ver la clase`}
      style={estilo}
    >
      {dentro}
    </Link>
  );
}

// ── Sin clase fija (maqueta `FijaVacia`) ─────────────────────────────────────

/**
 * Qué es una clase fija, cómo se consigue EN ESTE estudio Y CON LO QUE ELLA TIENE
 * (`comoConseguirla`), y cómo se ve el interruptor en la ficha de la clase. Si el
 * estudio no deja pedirla desde la app, o si no tiene una cuota que cubra sus
 * clases, no se le enseña un interruptor que no va a encontrar.
 */
export function ClaseFijaVacia({ hrefHorario, tieneCuota }: { hrefHorario: string; tieneCuota: boolean }) {
  const { estudio } = useEstudio();
  const { pasos, muestraInterruptor, conBono } = comoConseguirla(estudio, tieneCuota);
  return (
    <div data-testid="clase-fija-vacia" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card a-up" style={{ textAlign: 'center', padding: '22px 20px' }}>
        <span aria-hidden style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre="calendario" tamano={30} />
        </span>
        <h2 style={{ fontSize: 'var(--t-h3, 1.25rem)', fontWeight: 800, margin: '12px 0 6px', letterSpacing: '-.02em' }}>Tu hueco, cada semana</h2>
        <p className="t-meta" style={{ margin: 0, fontSize: 'var(--t-small)', lineHeight: 1.5 }}>
          Con una clase fija tu plaza se reserva sola cada semana. Sin estar pendiente de que se llene.
        </p>
      </div>
      <p className="t-label" style={{ margin: '4px 4px 0' }}>Así se pide</p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pasos.map((p, i) => (
          <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden className="t-num" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 99, background: 'var(--foreground)', color: 'var(--background)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <span style={{ fontSize: 'var(--t-body)' }}>{p}</span>
          </li>
        ))}
      </ol>
      {conBono && <p data-testid="clase-fija-con-bono" className="t-meta" style={{ margin: '0 4px' }}>{conBono}</p>}
      {muestraInterruptor && (
        // Cómo se verá en la ficha de la clase: el interruptor de verdad, de muestra (no hace nada aquí).
        <figure style={{ margin: 0 }}>
          <div className="card" aria-hidden inert style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 'var(--t-body)' }}>{TEXTOS_PLAZA_FIJA.autoTitulo}</b>
              <span className="t-meta">{TEXTOS_PLAZA_FIJA.autoPuede(3, '10:00')}</span>
            </span>
            <InterruptorAuto estado="encendido" onClick={() => {}} label={TEXTOS_PLAZA_FIJA.autoTitulo} />
          </div>
          <figcaption className="t-meta" style={{ margin: '6px 4px 0' }}>Así lo verás en la ficha de la clase (un ejemplo).</figcaption>
        </figure>
      )}
      <Link href={hrefHorario} className="btn btn--primary btn--full tap">Ver el horario</Link>
    </div>
  );
}
