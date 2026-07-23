'use client';

// F2 (B2.10) — Domiciliación SEPA de la socia: IBAN + referencia de mandato + fecha
// de firma. Con mandato VIGENTE, sus recibos pendientes entran en la remesa 19.14.

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { validarIBAN } from '@/lib/sepa-19-14';
import { Landmark } from 'lucide-react';

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

function isoHoy(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function FichaMandatoSepa({ socioId }: { socioId: string }) {
  const { mandatosSepa, ponerMandato, quitarMandato } = useStudio();
  const mandato = mandatosSepa.find(m => m.socioId === socioId && m.estado === 'VIGENTE');
  const [editando, setEditando] = useState(false);
  const [iban, setIban] = useState('');
  const [ref, setRef] = useState('');
  const [firma, setFirma] = useState(isoHoy());
  const [err, setErr] = useState<string | null>(null);

  function abrir() {
    setIban(mandato?.iban ?? '');
    setRef(mandato?.refMandato ?? '');
    setFirma(mandato?.fechaFirma?.slice(0, 10) ?? isoHoy());
    setErr(null);
    setEditando(true);
  }

  function guardar() {
    if (!validarIBAN(iban)) { setErr('IBAN no válido.'); return; }
    if (!ref.trim() || !firma) { setErr('Falta la referencia del mandato o la fecha de firma.'); return; }
    ponerMandato(socioId, iban, ref.trim(), firma);
    setEditando(false);
    setErr(null);
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <Landmark size={15} className="text-muted-foreground shrink-0" /> Domiciliación SEPA
      </p>

      {mandato && !editando ? (
        <>
          <p className="text-xs text-muted-foreground mt-1">
            IBAN ····{mandato.iban.slice(-4)} · mandato <span className="font-mono">{mandato.refMandato}</span> · firmado {mandato.fechaFirma.slice(0, 10).split('-').reverse().join('/')}
          </p>
          <p className="text-[11px] text-emerald-600 mt-1">Entra en la remesa del banco (cuaderno 19.14).</p>
          <div className="flex gap-2 mt-3">
            <button onClick={abrir} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Editar</button>
            <button onClick={() => quitarMandato(mandato.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-600">Quitar</button>
          </div>
        </>
      ) : editando ? (
        <div className="space-y-3 mt-3">
          <div>
            <label className={labelCls}>IBAN de la socia</label>
            <input className={inputCls} value={iban} onChange={e => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Referencia del mandato</label>
              <input className={inputCls} value={ref} onChange={e => setRef(e.target.value)} placeholder="MND-001" />
            </div>
            <div>
              <label className={labelCls}>Fecha de firma</label>
              <input type="date" className={inputCls} value={firma} onChange={e => setFirma(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-xs font-medium text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={guardar} className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95">Guardar mandato</button>
            <button onClick={() => setEditando(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Sin mandato. Añádelo para domiciliar sus cobros por remesa bancaria.</p>
          <button onClick={abrir} className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95">Añadir mandato SEPA</button>
        </>
      )}
    </div>
  );
}
