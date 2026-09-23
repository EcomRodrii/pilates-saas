'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlazaFijaVista, ProximaClaseFijaVista, RecuperacionesVista } from '@/lib/student/tipos';
import { etiquetaDia, fechaCorta } from '@/lib/student/formato';
import { nombreDia } from '@/lib/student/plaza-fija';
import { TEXTOS_PLAZA_FIJA } from '@/lib/student/plaza-fija-textos';
import { anularPeticionPlazaFija, pedirPausaPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { cancelarReserva } from '@/lib/student/reservas-acciones';
import { mensajeTrasCancelar } from '@/lib/student/cancelar-mensajes';
import { avisoCancelacion } from '@/lib/student/maquina-reserva';
import { useOnline } from '@/lib/student/useOnline';
import { validarPausa } from '@/lib/plazas-fijas-pausa';
import { hoyEnEstudio } from '@/lib/utils';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { Input } from '@/components/student/ui/Input';
import { Sheet } from '@/components/student/ui/Sheet';
import { useToast } from '@/components/student/ui/Toast';
import { Icono } from '@/components/student/ui/Icono';
import { CalendarioClaseFija } from '@/components/student/domain/CalendarioClaseFija';
import type { CalendarioClaseFija as DatosCalendario } from '@/lib/student/mapeo';

// «Tu clase fija» + «Recuperaciones» (F2, el caso canónico del producto).
// Mismo idioma que CreditCard: tarjeta, rótulo t-label, cifra grande, meta.
// No decide nada: el servidor es quien materializa la plaza y quien acepta
// una recuperación al reservar.
//
// Todas sus plazas, no una: quien viene lunes y miércoles veía solo una de las
// dos. Y si en su hueco ya no hay clase, lo dice en vez de enseñar una
// «próxima» que no existe (lib/student/plaza-fija.ts).
type PausaPedida = { id: string; desde: string; hasta: string } | null;

/**
 * Lleva a la ficha de esa clase, como una clase del horario. Sin clase a la que
 * ir, pinta lo mismo sin enlace: nunca un enlace a una ficha que no existe.
 */
function EnlaceClase({ sesionId, etiqueta, flex = false, children }: { sesionId: string | null; etiqueta: string; flex?: boolean; children: React.ReactNode }) {
  const href = usePortalHref();
  const estilo: React.CSSProperties = { display: 'block', minWidth: 0, color: 'inherit', ...(flex ? { flex: 1 } : {}) };
  if (!sesionId) return <div style={estilo}>{children}</div>;
  return <Link href={href('/reservar/' + sesionId)} aria-label={etiqueta} data-testid="enlace-clase-fija" style={estilo}>{children}</Link>;
}

export function PlazaFijaCard({ plazas, recuperaciones, hrefHorario, compacta = false, onCambio, calendario }: {
  plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista; hrefHorario: string; compacta?: boolean;
  /** El mes con sus días reservados. Solo en la tarjeta entera: en Inicio (compacta) no cabe. */
  calendario?: DatosCalendario;
  /** Se llama tras cancelar una semana, para que la pantalla recargue lo suyo. */
  onCambio?: () => void;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  // «No puedo asistir»: UNA semana de su clase fija. No toca la recurrencia.
  const [noPuedo, setNoPuedo] = useState<{ plaza: PlazaFijaVista; proxima: ProximaClaseFijaVista } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // Pedir una pausa NO la aplica: hasta que el estudio contesta, la plaza sigue
  // igual. Lo que cambia aquí es solo lo que ella ya ha pedido (lo confirmado por
  // el servidor, nunca optimista), por si la pantalla no se recarga.
  const [pedidas, setPedidas] = useState<Record<string, PausaPedida>>({});
  const [pidiendo, setPidiendo] = useState<PlazaFijaVista | null>(null);
  const [hoy] = useState(() => hoyEnEstudio());
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const pausaPedidaDe = (p: PlazaFijaVista): PausaPedida =>
    (p.id && p.id in pedidas ? pedidas[p.id] : p.pausaPedida);
  // Hasta que no hay «hasta» no se riñe: es el campo que falta, no un error.
  const aviso = hasta ? validarPausa(desde, hasta, hoy) : null;

  function abrir(p: PlazaFijaVista) {
    setPidiendo(p);
    setDesde(hoy);
    setHasta('');
    setError('');
  }

  async function enviar() {
    if (!pidiendo?.id || enviando) return;
    setEnviando(true);
    setError('');
    const r = await pedirPausaPlazaFija(estudio.slug, estudio.id, pidiendo.id, { desde, hasta });
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setPedidas((prev) => ({ ...prev, [pidiendo.id as string]: r.solicitudId ? { id: r.solicitudId, desde, hasta } : null }));
    setPidiendo(null);
  }

  async function anular(p: PlazaFijaVista, peticionId: string) {
    if (!p.id || enviando) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionPlazaFija(estudio.slug, estudio.id, peticionId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setPedidas((prev) => ({ ...prev, [p.id as string]: null }));
  }

  async function confirmarNoPuedo() {
    if (!noPuedo || cancelando) return;
    setCancelando(true);
    const r = await cancelarReserva(estudio.slug, estudio.id, noPuedo.proxima.reservaId, { online });
    setCancelando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      // La reserva SIGUE ACTIVA: se deja el diálogo abierto para reintentar.
      toast(r.error);
      return;
    }
    setNoPuedo(null);
    toast(mensajeTrasCancelar(r, { esClaseFija: true, fechaCorta }));
    onCambio?.();
  }

  const avisoNoPuedo = noPuedo ? avisoCancelacion(noPuedo.proxima, estudio.politicaCancelacionHoras) : null;

  if (plazas.length === 0 && recuperaciones.disponibles === 0) return null;
  return (
    <div className="card" data-testid="plaza-fija" style={{ padding: compacta ? '13px 15px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plazas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="t-label" style={{ margin: 0 }}>{plazas.length === 1 ? TEXTOS_PLAZA_FIJA.tarjetaUna : TEXTOS_PLAZA_FIJA.tarjetaVarias}</p>
          {plazas.map((plaza, i) => {
            const activa = plaza.estado === 'ACTIVA' && !plaza.pausa?.enCurso;
            const dia = nombreDia(plaza.diaSemana);
            const pedida = pausaPedidaDe(plaza);
            // Una pausa se pide sobre una plaza activa que no tenga ya una.
            const puedePedirPausa = estudio.puedePedirPausa === true && !!plaza.id
              && plaza.estado === 'ACTIVA' && !plaza.pausa && !pedida;
            return (
              <div
                key={`${plaza.diaSemana}-${plaza.hora}-${plaza.sala}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? '1px solid var(--muted)' : 'none' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Su clase fija se abre como cualquier clase: la ficha de la
                      próxima que ya tiene reservada. Sin ninguna, no hay adónde ir. */}
                  <EnlaceClase sesionId={plaza.proximas[0]?.sesionId ?? null} etiqueta={`Ver tu clase del ${dia} a las ${plaza.hora}`}>
                    <p style={{ margin: 0, fontSize: compacta ? 14 : 16, fontWeight: 800, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {dia.charAt(0).toUpperCase() + dia.slice(1)} · {plaza.hora}
                      {plaza.proximas[0] && <span aria-hidden style={{ display: 'flex', color: 'var(--subtle-foreground)' }}><Icono nombre="chevron-derecha" tamano={16} /></span>}
                    </p>
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      {[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}
                      {plaza.proximaFecha ? ` · próxima ${etiquetaDia(plaza.proximaFecha).toLowerCase()}` : ''}
                      {plaza.vigenciaHasta ? ` · hasta el ${fechaCorta(plaza.vigenciaHasta)}` : ''}
                    </p>
                  </EnlaceClase>
                  {/* Lo que la alumna tiene que saber: no reserva nada, se lo hace Tentare. */}
                  {activa && !plaza.sinClase && (
                    <p data-testid="plaza-fija-reservada-sola" style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, lineHeight: 1.45 }}>
                      {TEXTOS_PLAZA_FIJA.reservadaSola}
                    </p>
                  )}
                  {plaza.sinClase && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      Ahora no hay clase en ese horario: pregúntale al estudio.
                    </p>
                  )}
                  {!compacta && activa && !plaza.sinClase && (
                    <div data-testid="proximas-clases-fijas" style={{ margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p className="t-label" style={{ margin: 0 }}>{TEXTOS_PLAZA_FIJA.proximas}</p>
                      {plaza.proximas.length === 0 ? (
                        <p className="t-meta" style={{ margin: 0 }}>{TEXTOS_PLAZA_FIJA.sinProximas}</p>
                      ) : plaza.proximas.map((x) => {
                        const av = avisoCancelacion(x, estudio.politicaCancelacionHoras);
                        return (
                          <div key={x.reservaId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <EnlaceClase sesionId={x.sesionId} etiqueta={`Ver la clase del ${etiquetaDia(x.fecha).toLowerCase()} a las ${x.hora}`} flex>
                              <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                {etiquetaDia(x.fecha)} · {x.hora}
                                <span aria-hidden style={{ display: 'flex', color: 'var(--subtle-foreground)' }}><Icono nombre="chevron-derecha" tamano={14} /></span>
                              </p>
                              <p className="t-meta" style={{ margin: '1px 0 0' }}>{TEXTOS_PLAZA_FIJA.reservada}</p>
                            </EnlaceClase>
                            {av.puede && (
                              <Button variant="ghost" size="sm" disabled={!online} onClick={() => setNoPuedo({ plaza, proxima: x })}>
                                {TEXTOS_PLAZA_FIJA.noPuedo}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {plaza.pausa && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      {plaza.pausa.enCurso
                        ? `En pausa hasta el ${fechaCorta(plaza.pausa.hasta)}. ${TEXTOS_PLAZA_FIJA.enPausa}`
                        : `Pausa del ${fechaCorta(plaza.pausa.desde)} al ${fechaCorta(plaza.pausa.hasta)}`}
                    </p>
                  )}
                  {pedida && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      Pausa pedida del {fechaCorta(pedida.desde)} al {fechaCorta(pedida.hasta)} · esperando a tu estudio
                    </p>
                  )}
                  {(puedePedirPausa || pedida) && (
                    <div style={{ marginTop: 6 }}>
                      {pedida
                        ? <Button variant="ghost" size="sm" loading={enviando} onClick={() => void anular(plaza, pedida.id)}>Anular la petición</Button>
                        : <Button variant="secondary" size="sm" onClick={() => abrir(plaza)}>Pedir una pausa</Button>}
                    </div>
                  )}
                </div>
                <Badge tone={plaza.sinClase ? 'few' : activa ? 'ok' : 'neutral'}>
                  {plaza.sinClase ? 'Sin clase' : activa ? 'Activa' : 'En pausa'}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
      {!compacta && calendario && plazas.length > 0 && (
        <CalendarioClaseFija datos={calendario} hoy={hoy} soportaListaEspera={estudio.soportaListaEspera} />
      )}
      {!compacta && plazas.length > 0 && (
        <p className="t-meta" style={{ margin: 0 }}>
          {TEXTOS_PLAZA_FIJA.cambiarla}{' '}
          <Link href={href('/mensajes')} style={{ fontWeight: 800, color: 'var(--accent)' }}>{TEXTOS_PLAZA_FIJA.escribir}</Link>
        </p>
      )}
      {recuperaciones.disponibles > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: plazas.length > 0 ? 10 : 0, borderTop: plazas.length > 0 ? '1px solid var(--muted)' : 'none' }}>
          <div>
            <p className="t-label" style={{ margin: 0 }}>Recuperaciones</p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-body)', fontWeight: 800 }}>
              {recuperaciones.disponibles === 1 ? '1 clase por recuperar' : `${recuperaciones.disponibles} clases por recuperar`}
            </p>
            {recuperaciones.proximaCaducidad && (
              <p className="t-meta" style={{ margin: '2px 0 0' }}>La primera caduca el {fechaCorta(recuperaciones.proximaCaducidad)}</p>
            )}
            {/* De cuáles se acuerda uno: las que se ganó. Antes veía un número
                y no sabía cuál de esas clases había pagado con sus créditos.
                ⚠️ El nombre sale del VÍNCULO con el canje, nunca de
                `recuperaciones.motivo` — eso es texto libre que escribe el
                mostrador, y en producción hay uno que pone «mm». */}
            {recuperaciones.detalle.filter((r) => r.deRecompensa).map((r, i) => (
              <p key={i} className="t-meta" style={{ margin: '2px 0 0', color: 'var(--accent)' }}>
                🎁 Una es tu {r.deRecompensa}
              </p>
            ))}
          </div>
          <Link href={hrefHorario} style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>Reservar →</Link>
        </div>
      )}

      {error && !pidiendo && <p role="alert" className="t-meta" style={{ margin: 0 }}>{error}</p>}

      <ConfirmationDialog
        open={noPuedo !== null}
        onClose={() => { if (!cancelando) setNoPuedo(null); }}
        titulo={TEXTOS_PLAZA_FIJA.noPuedoTitulo}
        cuerpo={noPuedo ? `${[noPuedo.plaza.tipo, noPuedo.plaza.sala].filter(Boolean).join(' · ')} · ${etiquetaDia(noPuedo.proxima.fecha)} ${noPuedo.proxima.hora}` : ''}
        confirmar={TEXTOS_PLAZA_FIJA.noPuedoConfirmar}
        cancelar={TEXTOS_PLAZA_FIJA.noPuedoMantener}
        tono="danger"
        loading={cancelando}
        onConfirm={() => void confirmarNoPuedo()}
      >
        {noPuedo && avisoNoPuedo && (
          <div data-testid="no-puedo-aviso" style={{ background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>
              {TEXTOS_PLAZA_FIJA.noPuedoSolo(noPuedo.plaza.diaSemana)}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--accent-soft-foreground)' }}>
              {avisoNoPuedo.devolveriaCredito ? TEXTOS_PLAZA_FIJA.noPuedoATiempo : TEXTOS_PLAZA_FIJA.noPuedoTarde(avisoNoPuedo.horasVentana)}
            </p>
          </div>
        )}
      </ConfirmationDialog>

      <Sheet open={pidiendo !== null} onClose={() => { if (!enviando) setPidiendo(null); }} label="Pedir una pausa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>Pedir una pausa</p>
          <p className="t-meta" style={{ margin: 0 }}>
            Tu estudio la revisa y te contesta aquí. Hasta entonces tu clase fija sigue igual.
          </p>
          <Input label="Desde" type="date" min={hoy} value={desde} onChange={(e) => { setError(''); setDesde(e.target.value); }} />
          <Input
            label="Hasta" type="date" min={desde || hoy} value={hasta}
            onChange={(e) => { setError(''); setHasta(e.target.value); }}
            error={aviso ?? undefined}
          />
          {error && <p role="alert" className="t-meta" style={{ margin: 0 }}>{error}</p>}
          <Button full loading={enviando} disabled={!desde || !hasta || !!aviso} onClick={() => void enviar()}>
            Pedir la pausa
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
