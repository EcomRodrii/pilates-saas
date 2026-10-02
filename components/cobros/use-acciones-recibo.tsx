'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se puede hacer con UN recibo, en un solo sitio: lo usan la ficha de
// «Quién me debe», «En el banco» y «Lo que he cobrado» (pantalla nueva de Cobros,
// 2-oct-2026). Qué acciones tiene cada recibo lo decide `accionesDeRecibo`
// (lib/cobros/acciones-de-recibo.ts); aquí solo se ejecutan, con las mismas
// funciones de siempre del contexto (todas por el servidor) y sus diálogos.
//
// Los manejadores vienen tal cual del panel anterior (el `panel-pendientes.tsx` de antes del rediseño):
//   · lo que no se deshace con un clic pide confirmar;
//   · un recibo con su acción en vuelo no se vuelve a lanzar (doble toque);
//   · «Cobrar con su tarjeta» sin método guardado no es un error: ofrece pedirle
//     la tarjeta (el enlace se copia, y se enseña por si el navegador no deja);
//   · el justificante solo sale si el cobro se registró AHORA.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { MetodoCobro, Recibo } from '@/lib/types';
import type { IdAccionRecibo } from '@/lib/cobros/acciones-de-recibo';
import { MENSAJE_YA_ESTABA } from '@/lib/cobros/marcar-cobrado';
import { MOTIVOS_ELIMINAR_RECIBO } from '@/lib/recibos-eliminar';
import { cobrarOnlineDirecto, crearEnlaceTarjeta, enviarEmailRecibo } from '@/lib/api-client';
import { copiarAlPortapapeles, formatEuro } from '@/lib/utils';
import { anfitrionPortal } from '@/lib/panel-portal';
import { DialogoMetodoCobro } from '@/components/cobros/dialogo-metodo-cobro';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface AvisosCobros {
  ok: (mensaje: string) => void;
  error: (mensaje: string) => void;
}

interface Confirmacion {
  titulo: string; descripcion: string; textoConfirmar: string; destructivo?: boolean; accion: () => Promise<void>;
}

export interface AccionesRecibo {
  ejecutar: (accion: IdAccionRecibo, r: Recibo) => void;
  /**
   * «Cobrar con su tarjeta» de la ficha, con todos sus recibos: pide confirmar y los
   * cobra de uno en uno (son cargos reales), parando en el primero que no entre.
   */
  cobrarSinEllaTodo: (rs: Recibo[], boton: string) => void;
  /** «Pedirle la tarjeta / una nueva / Cambiar su tarjeta» de la ficha. */
  pedirTarjeta: (socioId: string) => void;
  /** ¿Tiene este recibo una acción en marcha? (para apagar su botón) */
  enVuelo: (reciboId: string) => boolean;
  /** Los diálogos: se pintan una vez, donde se use el hook. */
  dialogos: ReactNode;
}

export function useAccionesRecibo(avisos: AvisosCobros): AccionesRecibo {
  const router = useRouter();
  const {
    studio, recibos, socios, facturas,
    marcarCobrado, marcarCobradoPorElBanco, marcarDevuelto, reembolsarAMano, reintentar,
    reintentarSelladoFactura, devolverRecibosAPendientesTrasRemesa, deleteRecibo, resetDatosPilates,
  } = useStudio();

  const nombre = (socioId: string | null) => {
    if (!socioId) return 'Venta de mostrador';
    const s = socios.find(x => x.id === socioId);
    return s ? `${s.nombre} ${s.apellidos ?? ''}`.trim() : 'Clienta eliminada';
  };

  // Un recibo con su acción en vuelo no se vuelve a lanzar (doble toque).
  const enVueloRef = useRef<Set<string>>(new Set());
  const [, setVersion] = useState(0);
  async function enUnaVez(reciboId: string, accion: () => Promise<void>) {
    if (enVueloRef.current.has(reciboId)) return;
    enVueloRef.current.add(reciboId);
    setVersion(v => v + 1);
    try { await accion(); } finally {
      enVueloRef.current.delete(reciboId);
      setVersion(v => v + 1);
    }
  }

  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [reembolsando, setReembolsando] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<{ id: string; motivo: string | null; error: string | null; enCurso: boolean } | null>(null);
  const [pedirTarjetaA, setPedirTarjetaA] = useState<{ socioId: string; nombre: string } | null>(null);
  const [enlaceTarjeta, setEnlaceTarjeta] = useState<{ url: string; copiado: boolean } | null>(null);
  const [generandoEnlace, setGenerandoEnlace] = useState(false);

  async function cobrarYEmail(reciboId: string, metodo?: MetodoCobro) {
    const marcado = await marcarCobrado(reciboId, metodo);
    // `cobroRegistrado`: el dinero entró y solo falló el sellado de la factura; la
    // clienta SÍ pagó, así que el justificante sale igual. Si no se registró, no.
    if (!marcado.ok && !('cobroRegistrado' in marcado)) { avisos.error(marcado.error); return; }
    // Ya estaba cobrado (otra pestaña, Stripe): no se manda otro justificante.
    if (marcado.ok && marcado.yaEstaba) { avisos.ok(MENSAJE_YA_ESTABA); return; }
    const r = recibos.find(x => x.id === reciboId);
    const socio = r?.socioId ? socios.find(s => s.id === r.socioId) : null;
    if (marcado.ok) avisos.ok(r ? `Cobro registrado: ${formatEuro(r.importe)} de ${nombre(r.socioId)}.` : 'Cobro registrado.');
    else avisos.error(`${marcado.error} Si no aparece, hazle la factura desde «Lo que he cobrado».`);
    if (socio?.email && r) enviarEmailRecibo({ to: socio.email, toName: `${socio.nombre} ${socio.apellidos}`, reciboId });
  }

  // Con la tarjeta o la domiciliación que la clienta ya tiene guardada, sin ella delante.
  async function cobrarSinElla(r: Recibo) {
    if (!r.socioId || !studio) return;
    const result = await cobrarOnlineDirecto({ reciboId: r.id, socioId: r.socioId });
    if ('error' in result) {
      if (result.errorCode === 'SIN_TARJETA') { abrirPedirTarjeta(r.socioId); return; }
      avisos.error(result.error);
      return;
    }
    if (result.aviso === 'COBRADO_SIN_PERSISTIR') {
      avisos.error(result.detalle ?? 'Cobrado en Stripe, pero sin guardarlo aquí: revísalo.');
      return;
    }
    // El servidor ya dejó el recibo escrito (cobrado, o en el banco si es un adeudo
    // que tarda días): se relee en vez de replicar aquí esa lógica.
    avisos.ok('Cobro intentado con lo que tiene guardado. Actualizando…');
    resetDatosPilates();
  }

  // Varios recibos de la misma clienta: de uno en uno (el cobro es por recibo, cada uno con su
  // clave de idempotencia), parando en el primero que no entra, y releyendo el estudio UNA vez.
  async function cobrarSinEllaVarios(rs: Recibo[]) {
    let cobrados = 0;
    let fallo: string | null = null;
    for (const r of rs) {
      if (!r.socioId) continue;
      const result = await cobrarOnlineDirecto({ reciboId: r.id, socioId: r.socioId });
      if ('error' in result) {
        if (result.errorCode === 'SIN_TARJETA') { abrirPedirTarjeta(r.socioId); fallo = ''; break; }
        fallo = result.error;
        break;
      }
      if (result.aviso === 'COBRADO_SIN_PERSISTIR') { fallo = result.detalle ?? 'Cobrado en Stripe, pero sin guardarlo aquí: revísalo.'; break; }
      cobrados++;
    }
    if (cobrados > 0) resetDatosPilates();
    if (fallo) avisos.error(cobrados > 0 ? `${cobrados} cobrado${cobrados === 1 ? '' : 's'}; el siguiente no: ${fallo}` : fallo);
    else if (fallo === null) avisos.ok(cobrados === 1 ? 'Cobro intentado con lo que tiene guardado. Actualizando…' : `${cobrados} cobros intentados con lo que tiene guardado. Actualizando…`);
  }

  function abrirPedirTarjeta(socioId: string) {
    setPedirTarjetaA({ socioId, nombre: nombre(socioId) });
    setEnlaceTarjeta(null);
  }

  // Se copia en vez de abrirlo: quien lo rellena es la clienta. `copiarAlPortapapeles`
  // y no `navigator.clipboard` directo: en Safari este último resuelve sin copiar nada.
  async function generarEnlaceTarjeta() {
    if (!pedirTarjetaA || !studio) return;
    setGenerandoEnlace(true);
    const res = await crearEnlaceTarjeta({ studioId: studio.id, socioId: pedirTarjetaA.socioId, slug: studio.slug ?? undefined });
    setGenerandoEnlace(false);
    if ('error' in res) { avisos.error(res.error); return; }
    setEnlaceTarjeta({ url: res.url, copiado: await copiarAlPortapapeles(res.url) });
  }

  function ejecutar(accion: IdAccionRecibo, r: Recibo) {
    const quien = nombre(r.socioId);
    switch (accion) {
      case 'COBRAR':
        setCobrando(r.id);
        return;
      case 'COBRAR_SIN_ELLA':
        setConfirmacion({
          titulo: `¿Cobrar ${formatEuro(r.importe)} a ${quien}?`,
          descripcion: 'Se le cobra ahora con la tarjeta o la domiciliación que tiene guardada. Si no tiene ninguna, te diremos cómo pedírsela.',
          textoConfirmar: `Cobrar ${formatEuro(r.importe)}`,
          accion: () => enUnaVez(r.id, () => cobrarSinElla(r)),
        });
        return;
      case 'EL_BANCO_LO_DEVOLVIO':
        setConfirmacion({
          titulo: '¿Lo devolvió el banco?',
          descripcion: r.estado === 'COBRADO'
            ? `El banco ha devuelto el cobro de ${quien}: vuelve a deber ${formatEuro(r.importe)} («${r.concepto}»). Si se lo has devuelto tú, usa «Le he devuelto el dinero».`
            : `${quien} sigue debiendo ${formatEuro(r.importe)}: «${r.concepto}» pasa a «Devuelto por el banco».`,
          textoConfirmar: 'Sí, lo devolvió el banco',
          destructivo: true,
          accion: () => enUnaVez(r.id, async () => {
            const res = await marcarDevuelto(r.id, r.estado);
            if (!res.ok) avisos.error(res.error);
          }),
        });
        return;
      case 'REINTENTAR_POR_EL_BANCO':
        setConfirmacion({
          titulo: '¿Volver a pasarlo por el banco?',
          descripcion: `«${r.concepto}» de ${quien} vuelve a «Sin cobrar» y entra en la próxima remesa que prepares.`,
          textoConfirmar: 'Sí, a la próxima remesa',
          accion: () => enUnaVez(r.id, async () => {
            const res = await reintentar(r.id);
            if (!res.ok) avisos.error(res.error);
          }),
        });
        return;
      case 'EL_BANCO_LO_HA_COBRADO':
        setConfirmacion({
          titulo: '¿El banco lo ha cobrado?',
          descripcion: `«${r.concepto}» de ${quien}, ${formatEuro(r.importe)}: pasa a cobrado por domiciliación, con lo que eso entrega (la renovación de su plan, si es una cuota).`,
          textoConfirmar: 'Sí, lo ha cobrado',
          accion: () => enUnaVez(r.id, async () => {
            const res = await marcarCobradoPorElBanco(r.id);
            if (!res.ok && !('cobroRegistrado' in res)) { avisos.error(res.error); return; }
            if (res.ok) avisos.ok(res.yaEstaba ? MENSAJE_YA_ESTABA : `Cobro registrado: ${formatEuro(r.importe)} de ${quien}.`);
            else avisos.error(res.error);
          }),
        });
        return;
      case 'NO_LLEGO_AL_BANCO':
        setConfirmacion({
          titulo: '¿No llegó a ir al banco?',
          descripcion: `«${r.concepto}» de ${quien} vuelve a «Sin cobrar», como si no se hubiera mandado nunca. Usa esto si no salió en ninguna remesa que hayas subido al banco.`,
          textoConfirmar: 'Sí, vuelve a sin cobrar',
          accion: () => enUnaVez(r.id, async () => {
            const res = await devolverRecibosAPendientesTrasRemesa([r.id]);
            if (!res.ok) { avisos.error(res.error); return; }
            if (!(res.idsActualizados ?? []).includes(r.id)) avisos.error('Este recibo acaba de cambiar. Recarga y vuelve a intentarlo.');
          }),
        });
        return;
      case 'VER_FACTURA': {
        const f = facturas.find(x => x.reciboId === r.id);
        if (f) router.push(`/facturas?ver=${f.id}`);
        return;
      }
      case 'HACERLE_FACTURA':
        void enUnaVez(r.id, async () => {
          const res = await reintentarSelladoFactura(r.id);
          if (res.ok) avisos.ok('Factura hecha.');
          else avisos.error(`No se ha podido hacer la factura: ${res.error}`);
        });
        return;
      case 'LE_HE_DEVUELTO_EL_DINERO':
        setReembolsando(r.id);
        return;
      case 'DEVOLVER_DESDE_SU_FICHA':
        if (r.socioId) router.push(`/clientas/${r.socioId}`);
        return;
      case 'ELIMINAR':
        setEliminar({ id: r.id, motivo: null, error: null, enCurso: false });
        return;
      case 'LO_CIERRA_STRIPE':
        return;
    }
  }

  async function confirmarEliminar() {
    if (!eliminar?.motivo || eliminar.enCurso) return;
    setEliminar({ ...eliminar, enCurso: true, error: null });
    const res = await deleteRecibo(eliminar.id, eliminar.motivo);
    if (res.ok) { setEliminar(null); avisos.ok('Recibo eliminado.'); return; }
    setEliminar(e => (e ? { ...e, enCurso: false, error: res.error } : e));
  }

  const reciboDe = (id: string | null) => (id ? recibos.find(x => x.id === id) : undefined);
  const enCobro = reciboDe(cobrando);
  const enReembolso = reciboDe(reembolsando);

  const dialogos = (
    <>
      <ConfirmDialog
        open={!!confirmacion}
        onOpenChange={v => { if (!v) setConfirmacion(null); }}
        titulo={confirmacion?.titulo ?? ''}
        descripcion={confirmacion?.descripcion}
        textoConfirmar={confirmacion?.textoConfirmar}
        destructivo={confirmacion?.destructivo}
        onConfirm={() => { const c = confirmacion; setConfirmacion(null); if (c) void c.accion(); }}
      />

      <DialogoMetodoCobro
        abierto={!!cobrando}
        detalle={enCobro ? <>{nombre(enCobro.socioId)} — <span className="font-semibold text-foreground">{formatEuro(enCobro.importe)}</span> · {enCobro.concepto}</> : null}
        onCerrar={() => setCobrando(null)}
        onElegir={m => {
          const id = cobrando;
          setCobrando(null);
          if (id) void enUnaVez(id, () => cobrarYEmail(id, m));
        }}
      />

      {/* «Le he devuelto el dinero»: por dónde salió (decide la caja). Elegirlo es la
          confirmación. Lo que compró no se le quita solo (decisión del fundador). */}
      <DialogoMetodoCobro
        abierto={!!reembolsando}
        titulo="¿Cómo le has devuelto el dinero?"
        sinEspecificar={false}
        detalle={enReembolso ? (
          <>
            <p>{nombre(enReembolso.socioId)} — <span className="font-semibold text-foreground">{formatEuro(enReembolso.importe)}</span> · {enReembolso.concepto}</p>
            <p className="mt-1.5 text-[12.5px]">Ya no lo debe. Lo que compró con este cobro no se le quita: si hay que quitárselo, hazlo desde su ficha.</p>
          </>
        ) : null}
        onCerrar={() => setReembolsando(null)}
        onElegir={m => {
          const id = reembolsando;
          setReembolsando(null);
          if (!id || !m) return;
          void enUnaVez(id, async () => {
            const res = await reembolsarAMano(id, m);
            if (!res.ok) { avisos.error(res.error); return; }
            const r = recibos.find(x => x.id === id);
            const caja = res.caja === 'APUNTADA' ? ' Apuntado en la caja.'
              : res.caja === 'SIN_CAJA' ? ' No hay caja abierta: no se ha apuntado.'
              : res.caja === 'NO_APUNTADA' ? ' No se ha podido apuntar en la caja: apúntalo a mano.' : '';
            const msg = `Devolución registrada${r ? `: ${formatEuro(r.importe)} a ${nombre(r.socioId)}` : ''}.${caja}`;
            if (res.caja === 'NO_APUNTADA') avisos.error(msg); else avisos.ok(msg);
          });
        }}
      />

      <Dialog open={!!eliminar} onOpenChange={open => { if (!open && !eliminar?.enCurso) setEliminar(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialogo-eliminar-recibo">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar recibo</h3>
                <p className="text-sm text-muted-foreground">No se puede deshacer. Se guarda quién lo elimina, cuándo y por qué.</p>
              </div>
            </div>
            <fieldset className="space-y-1.5" disabled={eliminar?.enCurso}>
              <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">¿Por qué lo eliminas?</legend>
              {MOTIVOS_ELIMINAR_RECIBO.map(m => (
                <label key={m.codigo} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio" name="motivo-eliminar-recibo" value={m.codigo}
                    checked={eliminar?.motivo === m.codigo}
                    onChange={() => setEliminar(e => (e ? { ...e, motivo: m.codigo } : e))}
                  />
                  {m.etiqueta}
                </label>
              ))}
            </fieldset>
            {eliminar?.error && <p role="alert" data-testid="error-eliminar-recibo" className="text-[13px] text-destructive">{eliminar.error}</p>}
            <div className="flex w-full gap-3">
              <button
                onClick={() => setEliminar(null)} disabled={eliminar?.enCurso}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-background disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                data-testid="confirmar-eliminar-recibo"
                onClick={confirmarEliminar} disabled={!eliminar?.motivo || eliminar?.enCurso}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {eliminar?.enCurso ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sin método guardado: la salida real, no un error. Se explica POR QUÉ no se
          puede cobrar y qué hace el enlace: se lo va a reenviar a la clienta. */}
      {pedirTarjetaA && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="titulo-pedir-tarjeta">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 id="titulo-pedir-tarjeta" className="text-[17px] font-bold text-foreground">Pedirle la tarjeta a {pedirTarjetaA.nombre}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Para cobrarle sin que esté delante hace falta que ella autorice una tarjeta una vez.
              Genera el enlace y mándaselo por donde habléis normalmente: lo rellena en Stripe,
              no aquí, y su tarjeta no pasa en ningún momento por Tentare.
            </p>
            {enlaceTarjeta && (
              <div className="mt-4 space-y-2">
                <p className="text-[12px] font-semibold text-success">
                  {enlaceTarjeta.copiado ? 'Enlace copiado — pégalo en tu WhatsApp o correo.' : 'Enlace listo. Cópialo a mano: tu navegador no ha dejado copiarlo solo.'}
                </p>
                <input
                  readOnly value={enlaceTarjeta.url} onFocus={e => e.currentTarget.select()}
                  aria-label="Enlace para guardar la tarjeta"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">Cuando lo complete, su tarjeta queda guardada y «Cobrar con su tarjeta» ya funcionará.</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => { setPedirTarjetaA(null); setEnlaceTarjeta(null); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"
              >
                Cerrar
              </button>
              {!enlaceTarjeta && (
                <button
                  onClick={generarEnlaceTarjeta} disabled={generandoEnlace}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-brand-foreground transition-colors hover:brightness-95 disabled:opacity-60"
                >
                  {generandoEnlace ? 'Generando…' : 'Generar enlace'}
                </button>
              )}
            </div>
          </div>
        </div>,
        anfitrionPortal(),
      )}
    </>
  );

  function cobrarSinEllaTodo(rs: Recibo[], boton: string) {
    if (rs.length === 0) return;
    if (rs.length === 1) { ejecutar('COBRAR_SIN_ELLA', rs[0]); return; }
    const total = rs.reduce((t, r) => t + r.importe, 0);
    const clave = `varios:${rs.map(r => r.id).join(',')}`;
    setConfirmacion({
      titulo: `¿Cobrar ${formatEuro(total)} a ${nombre(rs[0].socioId)}?`,
      descripcion: `Se le cobran ahora sus ${rs.length} recibos con lo que tiene guardado, uno detrás de otro. Si uno no entra, se para ahí y te lo decimos.`,
      textoConfirmar: boton,
      accion: () => enUnaVez(clave, () => cobrarSinEllaVarios(rs)),
    });
  }

  return { ejecutar, cobrarSinEllaTodo, pedirTarjeta: abrirPedirTarjeta, enVuelo: id => enVueloRef.current.has(id), dialogos };
}
