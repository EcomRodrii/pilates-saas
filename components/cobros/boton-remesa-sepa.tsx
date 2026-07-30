'use client';

// F2 (B2.10) — Generar la remesa del cuaderno 19.14 (pain.008) y descargarla para
// subirla al banco. Todo en cliente con los datos del contexto; sin pasarela.

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { construirRemesa } from '@/lib/sepa-19-14';
import { Landmark } from 'lucide-react';

export function BotonRemesaSepa() {
  const { studio, recibos, socios, mandatosSepa, marcarRecibosEnviadosAlBanco } = useStudio();
  const [aviso, setAviso] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  async function generar() {
    if (generando) return;
    setAviso(null);
    if (!studio?.sepaAcreedorId || !studio?.sepaIban || !studio?.sepaTitular) {
      setAviso('Falta configurar los datos de acreedor SEPA en Configuración → Mi estudio.');
      return;
    }
    setGenerando(true);
    const nombreSocio = (id: string) => {
      const s = socios.find(x => x.id === id);
      return s ? `${s.nombre} ${s.apellidos}` : 'Socia';
    };
    const hoy = new Date();
    const cobro = new Date(hoy.getTime() + 5 * 24 * 3600_000); // D+5 (margen SEPA CORE)
    try {
      const { xml, nAdeudos, sinMandato, idsIncluidos } = construirRemesa({
        acreedor: { nombre: studio.nombre, titular: studio.sepaTitular, iban: studio.sepaIban, idAcreedor: studio.sepaAcreedorId },
        recibosPendientes: recibos
          .filter(r => r.estado === 'PENDIENTE')
          .map(r => ({ id: r.id, socioId: r.socioId, importe: r.importe, concepto: r.concepto })),
        mandatosVigentes: mandatosSepa
          .filter(m => m.estado === 'VIGENTE')
          .map(m => ({ socioId: m.socioId, iban: m.iban, refMandato: m.refMandato, fechaFirma: m.fechaFirma })),
        nombreSocio,
        msgId: `TENTARE-${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getHours())}${String(hoy.getMinutes())}`,
        creDtTm: hoy.toISOString().slice(0, 19),
        fechaCobro: cobro.toISOString().slice(0, 10),
      });

      if (nAdeudos === 0) {
        setAviso(sinMandato > 0
          ? `Ningún recibo pendiente tiene mandato SEPA (${sinMandato} sin domiciliar). Añade el mandato en la ficha de cada socia.`
          : 'No hay recibos pendientes que remesar.');
        return;
      }

      // Se marcan ANTES de disparar la descarga: si el marcado falla, no se
      // ofrece un fichero que luego se podría volver a generar con los mismos
      // recibos duplicados en una segunda remesa (doble cargo en el banco).
      const res = await marcarRecibosEnviadosAlBanco(idsIncluidos);
      if (!res.ok) {
        setAviso('No se pudo preparar la remesa. Inténtalo de nuevo.');
        return;
      }

      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remesa-sepa-${cobro.toISOString().slice(0, 10)}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAviso(`Fichero listo: ${nAdeudos} recibo(s), cargo el ${cobro.toLocaleDateString('es-ES')}.${sinMandato > 0 ? ` (${sinMandato} recibo(s) sin mandato quedaron fuera.)` : ''} Súbelo a tu banco.`);
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
