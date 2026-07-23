'use client';

// F2 (B2.10) — Generar la remesa del cuaderno 19.14 (pain.008) y descargarla para
// subirla al banco. Todo en cliente con los datos del contexto; sin pasarela.

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { construirRemesa } from '@/lib/sepa-19-14';
import { Landmark } from 'lucide-react';

export function BotonRemesaSepa() {
  const { studio, recibos, socios, mandatosSepa } = useStudio();
  const [aviso, setAviso] = useState<string | null>(null);

  function generar() {
    setAviso(null);
    if (!studio?.sepaAcreedorId || !studio?.sepaIban || !studio?.sepaTitular) {
      setAviso('Falta configurar los datos de acreedor SEPA en Configuración → Mi estudio.');
      return;
    }
    const nombreSocio = (id: string) => {
      const s = socios.find(x => x.id === id);
      return s ? `${s.nombre} ${s.apellidos}` : 'Socia';
    };
    const hoy = new Date();
    const cobro = new Date(hoy.getTime() + 5 * 24 * 3600_000); // D+5 (margen SEPA CORE)
    const { xml, nAdeudos, sinMandato } = construirRemesa({
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

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remesa-sepa-${cobro.toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setAviso(`Remesa generada: ${nAdeudos} adeudo(s), cargo el ${cobro.toLocaleDateString('es-ES')}.${sinMandato > 0 ? ` (${sinMandato} recibo(s) sin mandato quedaron fuera.)` : ''} Súbela a tu banco.`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={generar}
        title="Genera el fichero SEPA (cuaderno 19.14) de los recibos pendientes domiciliados"
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-border bg-card text-foreground hover:bg-background transition-colors"
      >
        <Landmark size={15} />
        Generar remesa SEPA (19.14)
      </button>
      {aviso && <span className="text-[11px] text-muted-foreground max-w-xs text-right">{aviso}</span>}
    </div>
  );
}
