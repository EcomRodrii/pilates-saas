'use client';

// F2 (B2.10) — Generar la remesa del cuaderno 19.14 (pain.008) y descargarla para
// subirla al banco. Todo en cliente con los datos del contexto; sin pasarela.

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { construirRemesa } from '@/lib/sepa-19-14';
import { dbEstadosPenalizacionDeRecibos, dbLeerRecibosParaRemesa } from '@/lib/supabase-data';
import { avisoPenalizacionesFueraDeRemesa, recibosParaRemesa } from '@/lib/billing/penalizacion-aprobar-reglas';
import {
  avisoCobrosEnMarchaFueraDeRemesa, avisoXmlFallido, avisoYaNoPendientes, prepararRemesa, recibosSinCobroEnMarcha,
} from '@/lib/billing/remesa-sepa-reglas';
import { Landmark } from 'lucide-react';

export function BotonRemesaSepa() {
  const {
    studio, recibos, socios, mandatosSepa, marcarRecibosEnviadosAlBanco, devolverRecibosAPendientesTrasRemesa,
  } = useStudio();
  const [aviso, setAviso] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  async function generar() {
    if (generando) return;
    setAviso(null);
    if (!studio?.sepaAcreedorId || !studio?.sepaIban || !studio?.sepaTitular) {
      setAviso('Falta configurar los datos de acreedor SEPA en Configuración → Cobros y facturas → Domiciliaciones bancarias.');
      return;
    }
    const acreedor = { nombre: studio.nombre, titular: studio.sepaTitular, iban: studio.sepaIban, idAcreedor: studio.sepaAcreedorId };
    setGenerando(true);
    const nombreSocio = (id: string) => {
      const s = socios.find(x => x.id === id);
      return s ? `${s.nombre} ${s.apellidos}` : 'Socia';
    };
    const hoy = new Date();
    const cobro = new Date(hoy.getTime() + 5 * 24 * 3600_000); // D+5 (margen SEPA CORE)
    try {
      // Los recibos de una penalización solo entran con su cobro aprobado (la
      // misma regla que «Cobrar online»), y ninguno con un cobro ya en marcha
      // (leído de la base ahora). Lo que va en el XML es lo que el banco carga.
      const pendientes = recibos.filter(r => r.estado === 'PENDIENTE');
      const remesa = recibosParaRemesa(pendientes, await dbEstadosPenalizacionDeRecibos(pendientes.map(r => r.id)));
      const libres = recibosSinCobroEnMarcha(remesa.entran, await dbLeerRecibosParaRemesa(remesa.entran.map(r => r.id)));
      const porId = new Map(libres.entran.map(r => [r.id, r]));
      const construir = (ids: string[]) => construirRemesa({
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
        fechaCobro: cobro.toISOString().slice(0, 10),
      });
      // Solo para saber quién tiene mandato: este fichero NO se descarga.
      const previa = construir(libres.entran.map(r => r.id));

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
          return res.ok ? { ok: true, idsActualizados: res.idsActualizados ?? [] } : { ok: false };
        },
        generarXml: ids => {
          const final = construir(ids);
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
      if (r.paso === 'XML_FALLIDO') {
        setAviso(avisoXmlFallido(r.sinDeshacer.length));
        return;
      }

      const blob = new Blob([r.xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remesa-sepa-${cobro.toISOString().slice(0, 10)}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAviso(`Fichero listo: ${r.ids.length} recibo(s), cargo el ${cobro.toLocaleDateString('es-ES')}.${previa.sinMandato > 0 ? ` (${previa.sinMandato} recibo(s) sin mandato quedaron fuera.)` : ''}${extra(r.caidos)} Súbelo a tu banco.`);
    } catch {
      // Antes de marcar (lecturas o la previa del fichero): no se ha tocado nada.
      setAviso('No se pudo preparar la remesa. Inténtalo de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={generar}
        disabled={generando}
        title="Genera el fichero de domiciliaciones (SEPA, cuaderno 19.14) con los recibos pendientes de quien tenga la domiciliación firmada. Se sube al banco desde su web."
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-border bg-card text-foreground hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Landmark size={15} />
        {generando ? 'Preparando…' : 'Preparar recibos para el banco'}
      </button>
      {aviso && <span className="text-[11px] text-muted-foreground max-w-xs text-right">{aviso}</span>}
    </div>
  );
}
