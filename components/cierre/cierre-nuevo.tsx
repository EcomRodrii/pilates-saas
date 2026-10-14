'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Cierre de año en el panel nuevo (14-oct-2026): las cuatro cifras de arriba
// con su tono y la facturación de cada mes en barras con el degradado del logo.
//
// Pantalla de dinero: aquí no se calcula nada. Todo llega hecho de
// `computeCierreAnual` (lib/fiscal/cierre-engine.ts) y del mismo `eur` de la
// página, así que cada importe es, céntimo a céntimo, el de la versión de
// siempre, el del PDF y el del CSV.
// ─────────────────────────────────────────────────────────────────────────────

import { Euro, FileText, Landmark, Percent, ShieldCheck } from 'lucide-react';
import { TarjetaCifra } from '@/components/dashboard/vivo';
import type { CierreSellado, CierreTotales } from '@/lib/fiscal/cierre-engine';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Un importe que cabe en su tarjeta. La cifra grande de la home mide 34–40 px,
 * pensada para «12» o «87 %»: «123.456,78 €» a ese tamaño se sale de una tarjeta
 * de 165 px (dos por fila en el móvil) y hasta de una de las cuatro del
 * escritorio. Mengua con el ancho de SU tarjeta (`cqi`, el contenedor lo pone
 * quien la envuelve), nunca por encima del tamaño de siempre y sin recortar
 * ningún céntimo: ~0,62 em por carácter y el relleno de la tarjeta fuera.
 */
function Importe({ texto }: { texto: string }) {
  return (
    <span className="whitespace-nowrap" style={{ fontSize: `min(1em, calc((100cqi - 2.75rem) / ${(texto.length * 0.62).toFixed(2)}))` }}>
      {texto}
    </span>
  );
}

/** Las cuatro cifras del año, como las de la home: el total en verde. */
export function CifrasCierre({ totales, sellado, conVerifactu, anio, eur }: {
  totales: CierreTotales;
  sellado: CierreSellado;
  conVerifactu: boolean;
  anio: number;
  eur: (n: number) => string;
}) {
  const ingresos = totales.numFacturas + totales.numManuales;
  return (
    // 2 × 2 hasta que caben cuatro con aire, como en la home. Cada tarjeta es
    // su propio contenedor (`@container`): de su ancho sale el de su importe; y
    // `grid` para que la tarjeta llene la fila, como cuando va suelta en ella.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      <div className="@container grid min-w-0 grid-cols-1">
        <TarjetaCifra
          etiqueta="Total facturado" tono="verde" Icono={Euro} href={null}
          valor={<Importe texto={eur(totales.total)} />}
          abajo={`IVA incluido · ${ingresos} ${ingresos === 1 ? 'ingreso' : 'ingresos'}`}
        />
      </div>
      <div className="@container grid min-w-0 grid-cols-1">
        <TarjetaCifra
          etiqueta="Base imponible" tono="azul" Icono={Landmark} href={null}
          valor={<Importe texto={eur(totales.base)} />}
          abajo="lo que declaras como ingreso"
        />
      </div>
      <div className="@container grid min-w-0 grid-cols-1">
        <TarjetaCifra
          etiqueta="IVA repercutido" tono="magenta" Icono={Percent} href={null}
          valor={<Importe texto={eur(totales.cuota)} />}
          abajo="para cuadrar tus 303 / 390"
        />
      </div>
      <div className="@container grid min-w-0 grid-cols-1">
        <TarjetaCifra
          etiqueta="Facturas emitidas" tono="indigo" Icono={FileText} href={null}
          valor={String(totales.numFacturas)}
          arriba={conVerifactu ? (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <ShieldCheck size={13} aria-hidden /> {sellado.selladas}/{sellado.totalFacturas} selladas
            </span>
          ) : undefined}
          abajo={conVerifactu ? 'con Verifactu' : `desde Tentare en ${anio}`}
        />
      </div>
    </div>
  );
}

/**
 * Lo facturado cada mes, en barras con el degradado del logo (como «Dinero» en
 * Informes). Escaladas al mejor mes del año, igual que las de siempre. La cifra
 * de cada barra va encima; la exacta, al pasar por encima y en la tabla para
 * lectores de pantalla.
 */
export function BarrasMensualesNuevas({ meses, anio, formato, completo }: {
  meses: number[];
  anio: number;
  formato: (n: number) => string;
  /** Los ingresos a mano ya han llegado bien: solo entonces «no hay nada» es verdad. */
  completo: boolean;
}) {
  const max = Math.max(1, ...meses);
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k` : String(Math.round(n));
  const vacio = completo && meses.every(v => v <= 0);
  return (
    <div className="relative">
      <div role="img" aria-label={`Lo facturado cada mes de ${anio}, IVA incluido`} className="grid grid-cols-12 gap-1 border-b border-border sm:gap-2">
        {meses.map((v, i) => (
          <div key={i} className="flex min-w-0 flex-col items-center">
            {/* El `pt` deja sitio a la cifra encima de la barra más alta: el
                100 % de la barra es el alto SIN ese relleno. */}
            <div className="flex h-[176px] w-full items-end justify-center pt-5">
              <div
                className="relative w-full max-w-[34px] rounded-t-[6px]"
                style={{
                  height: `${Math.max(1.5, (v / max) * 100)}%`,
                  minHeight: 3,
                  ...(v > 0
                    ? { backgroundImage: 'linear-gradient(180deg, var(--t-magenta-500), var(--t-blue-500))', boxShadow: '0 8px 16px -12px var(--t-magenta-500)' }
                    : { backgroundColor: 'color-mix(in srgb, var(--foreground) 9%, transparent)' }),
                }}
                title={`${MESES_LARGOS[i]}: ${formato(v)}`}
              >
                {v > 0 && (
                  <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-muted-foreground tabular-nums sm:text-[10.5px]">
                    {fmtK(v)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-12 gap-1 sm:gap-2" aria-hidden>
        {MESES.map(m => (
          <span key={m} className="text-center text-[10px] text-muted-foreground sm:text-[11px]">
            <span className="sm:hidden">{m[0]}</span><span className="hidden sm:inline">{m}</span>
          </span>
        ))}
      </div>
      {vacio && (
        <p className="pointer-events-none absolute inset-x-0 top-[38%] mx-auto w-fit max-w-[90%] rounded-2xl border border-border bg-card/95 px-4 py-2 text-center text-[12.5px] text-muted-foreground shadow-t-card">
          Aún no hay nada facturado en {anio}.
        </p>
      )}
      <table className="sr-only">
        <caption>Lo facturado cada mes de {anio}, IVA incluido</caption>
        <tbody>
          {meses.map((v, i) => (
            <tr key={i}><th scope="row">{MESES_LARGOS[i]}</th><td>{formato(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
