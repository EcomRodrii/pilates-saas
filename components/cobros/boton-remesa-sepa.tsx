'use client';

// F2 (B2.10) — Generar la remesa del cuaderno 19.14 (pain.008) y descargarla para
// subirla al banco. Todo en cliente con los datos del contexto; sin pasarela.
//
// En dos pasos (rediseño de Cobros, 2-oct-2026): primero se ENSEÑA qué entraría
// (`vistaPreviaRemesa`, sin marcar nada) y por qué se queda fuera cada recibo; al
// pulsar «Generar el fichero» se vuelve a leer y a decidir TODO desde cero —la
// vista previa solo se enseña, nunca decide lo que va al banco—.

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Landmark, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { Recibo } from '@/lib/types';
import { construirRemesa } from '@/lib/sepa-19-14';
import { dbEstadosPenalizacionDeRecibos, dbLeerRecibosParaRemesa } from '@/lib/supabase-data';
import { avisoPenalizacionesFueraDeRemesa, recibosParaRemesa } from '@/lib/billing/penalizacion-aprobar-reglas';
import {
  DIAS_HASTA_CARGO_REMESA, avisoCobrosEnMarchaFueraDeRemesa, avisoXmlFallido, avisoYaNoPendientes, prepararRemesa, recibosSinCobroEnMarcha,
  vistaPreviaRemesa, type VistaPreviaRemesa,
} from '@/lib/billing/remesa-sepa-reglas';
import { fechaCorta } from '@/lib/clientas/textos';
import { cn, formatEuro, hoyEnEstudio, masDias } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CifraPrivada } from '@/components/ui/cifra-privada';

const TEXTO_BOTON = 'Preparar recibos para el banco';

export function BotonRemesaSepa() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Genera el fichero de domiciliaciones (SEPA, cuaderno 19.14) con los recibos pendientes de quien tenga la domiciliación firmada. Se sube al banco desde su web."
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Landmark size={15} aria-hidden />
        {TEXTO_BOTON}
      </button>
      <DialogoRemesaSepa abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}

type Fase =
  | { tipo: 'cargando' }
  | { tipo: 'vista'; vista: VistaPreviaRemesa<Recibo> }
  | { tipo: 'sin_leer' }
  | { tipo: 'generando' }
  | { tipo: 'hecho'; texto: string; ok: boolean };

/** También lo abre el ⋯ de la cabecera en pantallas táctiles. */
export function DialogoRemesaSepa({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !ocupado) onCerrar(); }}>
      <DialogContent className="max-w-lg" data-testid="dialogo-remesa-sepa">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">{TEXTO_BOTON}</DialogTitle>
        </DialogHeader>
        {abierto && <Remesa onCerrar={onCerrar} onOcupado={setOcupado} />}
      </DialogContent>
    </Dialog>
  );
}

function Remesa({ onCerrar, onOcupado }: { onCerrar: () => void; onOcupado: (o: boolean) => void }) {
  const {
    studio, recibos, socios, mandatosSepa, estadoMandatosSepa, marcarRecibosEnviadosAlBanco, devolverRecibosAPendientesTrasRemesa,
  } = useStudio();
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' });
  const generando = useRef(false);
  const generado = useRef(false);
  const sinConfigurar = !studio?.sepaAcreedorId || !studio?.sepaIban || !studio?.sepaTitular;
  const hoyIso = hoyEnEstudio();

  useEffect(() => { onOcupado(fase.tipo === 'generando'); }, [fase.tipo, onOcupado]);

  // Paso 1: qué entraría. Se lee de la base lo que el arranque no trae (cobros en
  // marcha, estado de las penalizaciones). No se marca nada.
  useEffect(() => {
    // Tras pulsar «Generar» los recibos cambian: la vista previa no se recalcula
    // encima del resultado.
    if (sinConfigurar || estadoMandatosSepa !== 'listo' || generado.current) return;
    let vivo = true;
    const conMandato = new Set(mandatosSepa.filter(m => m.estado === 'VIGENTE').map(m => m.socioId));
    const pendientes = recibos.filter(r => r.estado === 'PENDIENTE');
    const ids = pendientes.filter(r => r.socioId && conMandato.has(r.socioId)).map(r => r.id);
    void Promise.all([dbEstadosPenalizacionDeRecibos(ids), dbLeerRecibosParaRemesa(ids)])
      .then(([penalizaciones, cobrosEnMarcha]) => {
        if (!vivo) return;
        setFase({ tipo: 'vista', vista: vistaPreviaRemesa({ pendientes, conMandatoVigente: id => conMandato.has(id), penalizaciones, cobrosEnMarcha }) });
      })
      .catch(() => { if (vivo) setFase({ tipo: 'sin_leer' }); });
    return () => { vivo = false; };
  }, [sinConfigurar, estadoMandatosSepa, mandatosSepa, recibos]);

  const nombreDe = (id: string | null) => {
    const s = id ? socios.find(x => x.id === id) : null;
    return s ? `${s.nombre} ${s.apellidos}` : 'Venta de mostrador';
  };

  async function generar() {
    if (generando.current) return;
    if (!studio?.sepaAcreedorId || !studio?.sepaIban || !studio?.sepaTitular) return;
    const acreedor = { nombre: studio.nombre, titular: studio.sepaTitular, iban: studio.sepaIban, idAcreedor: studio.sepaAcreedorId };
    generando.current = true;
    generado.current = true;
    setFase({ tipo: 'generando' });
    const setAviso = (texto: string, ok = false) => setFase({ tipo: 'hecho', texto, ok });
    const nombreSocio = (id: string) => {
      const s = socios.find(x => x.id === id);
      return s ? `${s.nombre} ${s.apellidos}` : 'Socia';
    };
    const hoy = new Date();
    try {
      // Los recibos de una penalización solo entran con su cobro aprobado (la
      // misma regla que «Cobrar online»), y ninguno con un cobro ya en marcha
      // (leído de la base ahora). Lo que va en el XML es lo que el banco carga.
      const pendientes = recibos.filter(r => r.estado === 'PENDIENTE');
      const remesa = recibosParaRemesa(pendientes, await dbEstadosPenalizacionDeRecibos(pendientes.map(r => r.id)));
      const libres = recibosSinCobroEnMarcha(remesa.entran, await dbLeerRecibosParaRemesa(remesa.entran.map(r => r.id)));
      const porId = new Map(libres.entran.map(r => [r.id, r]));
      // El día de cargo lo fija la base de datos al marcar (y vuelve en el propio UPDATE):
      // el fichero lleva ese, no el del reloj de este dispositivo.
      const construir = (ids: string[], fechaCobro: string) => construirRemesa({
        acreedor,
        // Un id que no esté aquí no entra, y `generarXml` lo detecta por la cuenta.
        recibosPendientes: ids.flatMap(id => {
          const r = porId.get(id);
          return r ? [{ id: r.id, socioId: r.socioId, importe: r.importe, concepto: r.concepto }] : [];
        }),
        mandatosVigentes: mandatosSepa
          .filter(m => m.estado === 'VIGENTE')
          .map(m => ({ socioId: m.socioId, iban: m.iban, refMandato: m.refMandato, fechaFirma: m.fechaFirma })),
        nombreSocio,
        msgId: `TENTARE-${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getHours())}${String(hoy.getMinutes())}`,
        creDtTm: hoy.toISOString().slice(0, 19),
        fechaCobro,
      });
      // Solo para saber quién tiene mandato: este fichero NO se descarga (su fecha da igual).
      const previa = construir(libres.entran.map(r => r.id), masDias(hoyEnEstudio(), DIAS_HASTA_CARGO_REMESA));

      const extras = [avisoPenalizacionesFueraDeRemesa(remesa), avisoCobrosEnMarchaFueraDeRemesa(libres)].filter(Boolean);
      const extra = (caidos = 0) => [...(caidos > 0 ? [avisoYaNoPendientes(caidos)] : []), ...extras].map(t => ` ${t}`).join('');
      if (previa.nAdeudos === 0) {
        setAviso((previa.sinMandato > 0
          ? `Ningún recibo pendiente tiene mandato SEPA (${previa.sinMandato} sin domiciliar). Añade el mandato en la ficha de cada clienta.`
          : 'No hay recibos pendientes que remesar.') + extra());
        return;
      }

      // Se marca ANTES de generar el fichero, y el fichero lleva SOLO lo que se
      // marcó: si otro canal lo cobró entre medias, no va al banco dos veces.
      const r = await prepararRemesa(previa.idsIncluidos, {
        marcar: async ids => {
          const res = await marcarRecibosEnviadosAlBanco(ids);
          return res.ok ? { ok: true, idsActualizados: res.idsActualizados ?? [], cargoPedidoPara: res.cargoPedidoPara ?? new Map() } : { ok: false };
        },
        generarXml: (ids, fechaCargo) => {
          const final = construir(ids, fechaCargo);
          if (final.nAdeudos !== ids.length) throw new Error('remesa: el fichero no lleva todos los recibos marcados');
          return final.xml;
        },
        desmarcar: async ids => {
          const res = await devolverRecibosAPendientesTrasRemesa(ids);
          return res.ok ? { ok: true, idsActualizados: res.idsActualizados ?? [] } : { ok: false };
        },
      });
      if (r.paso === 'SIN_MARCAR') {
        setAviso('No se pudo preparar la remesa. Inténtalo de nuevo.');
        return;
      }
      if (r.paso === 'NINGUNO_PENDIENTE') {
        setAviso(`No hay recibos pendientes que remesar.${extra(r.caidos)}`);
        return;
      }
      if (r.paso === 'XML_FALLIDO' || r.paso === 'SIN_FECHA_DE_CARGO') {
        setAviso(avisoXmlFallido(r.sinDeshacer.length));
        return;
      }

      const blob = new Blob([r.xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remesa-sepa-${r.fechaCargo}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAviso(`Fichero listo: ${r.ids.length} recibo(s), cargo pedido para el ${fechaCorta(r.fechaCargo, hoyEnEstudio())}.${previa.sinMandato > 0 ? ` (${previa.sinMandato} recibo(s) sin mandato quedaron fuera.)` : ''}${extra(r.caidos)} Súbelo a la web de tu banco.`, true);
    } catch {
      // Antes de marcar (lecturas o la previa del fichero): no se ha tocado nada.
      setAviso('No se pudo preparar la remesa. Inténtalo de nuevo.');
    } finally {
      generando.current = false;
    }
  }


  if (sinConfigurar) {
    return (
      <Cuerpo onCerrar={onCerrar}>
        <p className="text-sm text-foreground">
          Falta configurar los datos de acreedor SEPA en Configuración → Cobros y facturas → Domiciliaciones bancarias.
        </p>
      </Cuerpo>
    );
  }
  if (estadoMandatosSepa === 'error' || fase.tipo === 'sin_leer') {
    return (
      <Cuerpo onCerrar={onCerrar}>
        <p className="text-sm text-foreground">No hemos podido leer las domiciliaciones. No se ha preparado nada: cierra y vuelve a intentarlo.</p>
      </Cuerpo>
    );
  }
  if (fase.tipo === 'cargando' || fase.tipo === 'generando') {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin" aria-hidden />
        {fase.tipo === 'generando' ? 'Preparando el fichero…' : 'Mirando qué recibos pueden ir al banco…'}
      </div>
    );
  }
  if (fase.tipo === 'hecho') {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', fase.ok ? 'bg-success/10' : 'bg-warning/10')}>
          {fase.ok ? <CheckCheck size={28} className="text-success" /> : <AlertTriangle size={28} className="text-warning" />}
        </div>
        <p role="status" className="max-w-sm text-sm text-foreground">{fase.texto}</p>
        <button type="button" onClick={onCerrar} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-95">
          Cerrar
        </button>
      </div>
    );
  }

  const { vista } = fase;
  const n = vista.entran.length;
  return (
    <Cuerpo
      onCerrar={onCerrar}
      principal={(
        <button
          type="button" onClick={() => void generar()} disabled={n === 0}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {n === 0 ? 'Nada que enviar' : `Generar el fichero (${n})`}
        </button>
      )}
    >
      {n > 0 ? (
        <>
          <p className="text-sm text-foreground">
            Entran <strong>{n} {n === 1 ? 'recibo' : 'recibos'}</strong> por <CifraPrivada inline>{formatEuro(vista.total)}</CifraPrivada>.
            {' '}Se pedirá el cargo para el {fechaCorta(masDias(hoyIso, DIAS_HASTA_CARGO_REMESA), hoyIso)}; el banco puede moverlo a un día hábil.
          </p>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Recibos que entran">
            {vista.entran.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate"><span className="font-medium text-foreground">{nombreDe(r.socioId)}</span> <span className="text-muted-foreground">· {r.concepto}</span></span>
                <span className="tabular-nums text-foreground"><CifraPrivada>{formatEuro(r.importe)}</CifraPrivada></span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted-foreground">
            Al generarlo, estos recibos pasan a «En el banco» y se descarga el fichero para subirlo a la web de tu banco.
            Antes se vuelve a comprobar cada uno: si alguno se ha cobrado mientras tanto, no va.
          </p>
        </>
      ) : (
        <p className="text-sm text-foreground">Ahora mismo no hay ningún recibo que pueda ir al banco.</p>
      )}
      {vista.fuera.length > 0 && (
        <div>
          <p className="mb-1 text-[12.5px] font-semibold text-foreground">No entran ({vista.fuera.length})</p>
          <ul className="space-y-0.5 text-[12.5px] text-muted-foreground">
            {vista.fuera.map(f => <li key={f.recibo.id}>{nombreDe(f.recibo.socioId)}: {f.detalle}.</li>)}
          </ul>
        </div>
      )}
      {vista.sinDomiciliar.recibos > 0 && (
        <p className="text-[12.5px] text-muted-foreground">
          {vista.sinDomiciliar.recibos} {vista.sinDomiciliar.recibos === 1 ? 'recibo' : 'recibos'}
          {vista.sinDomiciliar.clientas > 0 ? ` de ${vista.sinDomiciliar.clientas} ${vista.sinDomiciliar.clientas === 1 ? 'clienta' : 'clientas'}` : ''}
          {' '}sin la domiciliación firmada (<CifraPrivada inline>{formatEuro(vista.sinDomiciliar.importe)}</CifraPrivada>) no van al banco: se cobran a mano.
        </p>
      )}
    </Cuerpo>
  );
}

function Cuerpo({ children, onCerrar, principal }: { children: React.ReactNode; onCerrar: () => void; principal?: React.ReactNode }) {
  return (
    <div className="mt-1 space-y-4">
      {children}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCerrar} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-background">
          {principal ? 'Cancelar' : 'Cerrar'}
        </button>
        {principal}
      </div>
    </div>
  );
}
