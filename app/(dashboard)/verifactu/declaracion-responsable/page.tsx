'use client';

// La declaración responsable del sistema de facturación (Tentare), dentro del
// propio sistema, como exige la Orden HAC/1177/2024 (art. 15.3): «disponible de
// manera legible e individualizada dentro del propio sistema informático» y
// «accesible por el usuario de forma rápida, fácil e intuitiva».
//
// Se enseña la SUSCRITA para la versión actual del software. Si todavía no se ha
// suscrito, se enseña el borrador y se dice claramente qué falta: nada se
// rellena con datos inventados.

import { useEffect, useState } from 'react';
import { Download, FileCheck2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { authHeader } from '@/lib/api-client';
import { abrirDeclaracionPDF } from '@/lib/verifactu/declaracion-pdf';

interface Apartado { letra: string; etiqueta: string; valor: string | null }
interface Estado {
  titulo: string;
  version: string;
  suscrita: { fecha: string; lugar: string; suscritaEn: string; sha256: string } | null;
  apartados: Apartado[];
  falta: string[];
}

export default function DeclaracionResponsablePage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/verifactu/declaracion-responsable', { headers: await authHeader(), cache: 'no-store' });
        const cuerpo = await res.json().catch(() => null);
        if (!vivo) return;
        if (!res.ok) setError((cuerpo as { error?: string } | null)?.error ?? 'No se ha podido cargar la declaración.');
        else setEstado(cuerpo as Estado);
      } catch {
        if (vivo) setError('No se ha podido cargar la declaración.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Declaración responsable"
        description="La declaración del fabricante del programa con el que facturas: qué sistema es, qué versión, quién lo produce y que cumple el reglamento de Veri*Factu."
      />

      {error && (
        <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">{error}</p>
      )}

      {!estado && !error && <p className="text-[13.5px] text-muted-foreground">Cargando…</p>}

      {estado && (
        <>
          {!estado.suscrita && (
            <div role="status" className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.06] px-4 py-3 text-[13.5px] leading-relaxed">
              <p className="font-semibold">Pendiente de suscribir por el productor (versión {estado.version}).</p>
              <p className="mt-1 text-muted-foreground">
                Mientras no esté suscrita, Tentare no envía ningún registro a la AEAT. Falta:
              </p>
              <ul className="mt-1.5 list-disc pl-5 text-muted-foreground">
                {estado.falta.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          )}

          <article className="rounded-2xl border border-border bg-card px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-muted-foreground" aria-hidden />
                <h2 className="text-[15px] font-bold tracking-wide">{estado.titulo}</h2>
              </div>
              {estado.suscrita && (
                <button
                  type="button"
                  onClick={() => { if (estado.suscrita) abrirDeclaracionPDF({ ...estado, suscrita: estado.suscrita }); }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-semibold hover:bg-muted"
                >
                  <Download className="size-4" aria-hidden />
                  Descargar PDF
                </button>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Versión del sistema {estado.version}</p>
            <dl className="mt-5 space-y-4">
              {estado.apartados.map((a, i) => (
                <div key={`${a.letra}-${i}`}>
                  <dt className="text-[12.5px] font-semibold text-muted-foreground leading-snug">
                    {a.letra}) {a.etiqueta}{a.valor === '' ? '' : ':'}
                  </dt>
                  {a.valor !== '' && (
                    <dd className={`mt-1 text-[14px] leading-relaxed whitespace-pre-line ${a.valor === null ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}`}>
                      {a.valor ?? 'PENDIENTE — sin este dato la declaración no se puede suscribir'}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            {estado.suscrita && (
              <p className="mt-6 border-t border-border pt-3 text-[11.5px] text-muted-foreground break-all">
                Suscrita el {estado.suscrita.fecha} en {estado.suscrita.lugar}. Huella del texto: {estado.suscrita.sha256}
              </p>
            )}
          </article>
        </>
      )}
    </div>
  );
}
