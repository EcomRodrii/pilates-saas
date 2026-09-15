'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PlazaFijaVista, RecuperacionesVista } from '@/lib/student/tipos';
import { etiquetaDia, fechaCorta } from '@/lib/student/formato';
import { nombreDia } from '@/lib/student/plaza-fija';
import { anularPeticionPlazaFija, pedirPausaPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { validarPausa } from '@/lib/plazas-fijas-pausa';
import { hoyEnEstudio } from '@/lib/utils';
import { useEstudio } from '@/components/student/contexto';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { Input } from '@/components/student/ui/Input';
import { Sheet } from '@/components/student/ui/Sheet';

// «Tu plaza fija» + «Recuperaciones» (F2, el caso canónico del producto).
// Mismo idioma que CreditCard: tarjeta, rótulo t-label, cifra grande, meta.
// No decide nada: el servidor es quien materializa la plaza y quien acepta
// una recuperación al reservar.
//
// Todas sus plazas, no una: quien viene lunes y miércoles veía solo una de las
// dos. Y si en su hueco ya no hay clase, lo dice en vez de enseñar una
// «próxima» que no existe (lib/student/plaza-fija.ts).
type PausaPedida = { id: string; desde: string; hasta: string } | null;

export function PlazaFijaCard({ plazas, recuperaciones, hrefHorario, compacta = false }: {
  plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista; hrefHorario: string; compacta?: boolean;
}) {
  const { estudio } = useEstudio();
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

  if (plazas.length === 0 && recuperaciones.disponibles === 0) return null;
  return (
    <div className="card" data-testid="plaza-fija" style={{ padding: compacta ? '13px 15px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plazas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="t-label" style={{ margin: 0 }}>{plazas.length === 1 ? 'Tu plaza fija' : 'Tus plazas fijas'}</p>
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
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: compacta ? 14 : 16, fontWeight: 800, letterSpacing: '-.02em' }}>
                    {dia.charAt(0).toUpperCase() + dia.slice(1)} · {plaza.hora}
                  </p>
                  <p className="t-meta" style={{ margin: '2px 0 0' }}>
                    {[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}
                    {plaza.proximaFecha ? ` · próxima ${etiquetaDia(plaza.proximaFecha).toLowerCase()}` : ''}
                    {plaza.vigenciaHasta ? ` · hasta el ${fechaCorta(plaza.vigenciaHasta)}` : ''}
                  </p>
                  {plaza.sinClase && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      Ahora no hay clase en ese horario: pregúntale al estudio.
                    </p>
                  )}
                  {plaza.pausa && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      {plaza.pausa.enCurso
                        ? `En pausa hasta el ${fechaCorta(plaza.pausa.hasta)}`
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

      <Sheet open={pidiendo !== null} onClose={() => { if (!enviando) setPidiendo(null); }} label="Pedir una pausa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>Pedir una pausa</p>
          <p className="t-meta" style={{ margin: 0 }}>
            Tu estudio la revisa y te contesta aquí. Hasta entonces tu plaza fija sigue igual.
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
