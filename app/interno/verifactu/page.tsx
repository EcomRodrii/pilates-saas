'use client';

// Veri*Factu — lo que hace el productor del software y apoderado, en persona:
// suscribir la declaración responsable del SIF (y, desde la PR 3, verificar
// los poderes IZ860 que otorgan los estudios).
//
// La declaración se construye en el servidor con los datos del productor de la
// configuración; desde aquí solo se ponen la fecha y el lugar de suscripción.

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import {
  fetchDeclaracionVerifactu, suscribirDeclaracionVerifactu, type DeclaracionVerifactuInterna,
} from '@/lib/interno/client';

function hoyDdMmAaaa(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export default function VerifactuInternoPage() {
  const [dr, setDr] = useState<DeclaracionVerifactuInterna | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyDdMmAaaa());
  const [lugar, setLugar] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDr(await fetchDeclaracionVerifactu());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido cargar.');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const d = await fetchDeclaracionVerifactu();
        if (vivo) setDr(d);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se ha podido cargar.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const suscribir = async () => {
    setGuardando(true);
    setError(null);
    try {
      await suscribirDeclaracionVerifactu(fecha.trim(), lugar.trim());
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido suscribir.');
    } finally {
      setGuardando(false);
    }
  };

  const faltaProductor = (dr?.falta ?? []).filter(f => !f.startsWith('fecha y lugar'));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-bold">Veri*Factu</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Declaración responsable del sistema de facturación. Sin una declaración suscrita para la versión actual, no se transmite ningún registro.
        </p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">{error}</p>}

      {dr && (
        <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-[15px] font-bold">Declaración responsable · versión {dr.version}</h2>
          </div>

          {dr.suscrita ? (
            <p className="mt-2 text-[13.5px]">
              Suscrita el <strong>{dr.suscrita.fecha}</strong> en <strong>{dr.suscrita.lugar}</strong>.
              <span className="block mt-1 text-[11.5px] text-muted-foreground break-all">Huella del texto: {dr.suscrita.sha256}</span>
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {faltaProductor.length > 0 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.06] px-3 py-2 text-[13px]">
                  <p className="font-semibold">Faltan datos del productor en la configuración del servidor:</p>
                  <ul className="mt-1 list-disc pl-5">{faltaProductor.map(f => <li key={f}>{f}</li>)}</ul>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12.5px] font-semibold">
                  Fecha de suscripción (dd-mm-aaaa)
                  <input value={fecha} onChange={e => setFecha(e.target.value)} inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] font-normal" />
                </label>
                <label className="text-[12.5px] font-semibold">
                  Lugar («Localidad, País»)
                  <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Localidad, España"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] font-normal" />
                </label>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Al suscribirla declaras, como productor, que esta versión del sistema cumple el art. 29.2.j) LGT, el RD 1007/2023 y la Orden HAC/1177/2024. Queda guardada tal cual, con su huella, y no se puede editar: si cambia algo, se suscribe otra.
              </p>
              <button type="button" onClick={() => void suscribir()} disabled={guardando || faltaProductor.length > 0 || !lugar.trim()}
                className="rounded-xl bg-brand px-4 py-2 text-[13.5px] font-bold text-brand-foreground disabled:opacity-50">
                {guardando ? 'Suscribiendo…' : 'Suscribir declaración'}
              </button>
            </div>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] font-semibold">Ver el texto</summary>
            <dl className="mt-3 space-y-3">
              {dr.apartados.map((a, i) => (
                <div key={`${a.letra}-${i}`}>
                  <dt className="text-[12px] font-semibold text-muted-foreground">{a.letra}) {a.etiqueta}{a.valor === '' ? '' : ':'}</dt>
                  {a.valor !== '' && <dd className="mt-0.5 text-[13px] whitespace-pre-line">{a.valor ?? 'PENDIENTE'}</dd>}
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}
    </div>
  );
}
