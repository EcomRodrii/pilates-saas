'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La gráfica de área de la home nueva, como las de Bonsai (b-71/b-72): curva
// suave con el área rellena, cuadrícula, el eje Y con valores redondos, un punto
// en cada dato y, al pasar por encima, la cifra de ese punto.
//
// SVG medido en píxeles (ResizeObserver), no estirado con `viewBox`: estirado,
// los textos de los ejes se deforman. La curva es monótona (Fritsch–Carlson):
// nunca baja de cero ni se pasa del dato entre dos puntos, que es lo que hace
// una Bézier a pelo y lo que en una gráfica de dinero se lee como un error.
// Accesible: una tabla con los mismos datos para lectores de pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import { marcasEje } from '@/lib/inicio/cifras';

export interface PuntoGrafica {
  /** Lo que sale en el eje X («oct», «12»). */
  eje: string;
  /** Lo que sale en la etiqueta al pasar por encima («octubre de 2026»). */
  nombre: string;
  valor: number;
}

const M = { izq: 44, der: 14, arr: 14, abajo: 28 };

export function GraficaArea({
  puntos, alto = 210, formato = n => String(n), formatoEje, color = 'var(--t-blue-500)', colorPunto = 'var(--t-magenta-500)', titulo,
  enteros = false, vacio,
}: {
  puntos: PuntoGrafica[];
  alto?: number;
  formato?: (n: number) => string;
  formatoEje?: (n: number) => string;
  color?: string;
  colorPunto?: string;
  /** Nombre accesible de la gráfica. */
  titulo: string;
  /** Cuenta cosas (reservas, altas): el eje va sin decimales. */
  enteros?: boolean;
  /** Con todo a cero, lo que se dice encima de la gráfica plana (qué se verá aquí). */
  vacio?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(560);
  const [sobre, setSobre] = useState<number | null>(null);
  const idDegradado = `area-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = puntos.length;
  const max = Math.max(0, ...puntos.map(p => p.valor));
  const marcas = marcasEje(max, 4, enteros);
  const tope = marcas[marcas.length - 1] || 1;
  const anchoUtil = ancho - M.izq - M.der;
  const altoUtil = alto - M.arr - M.abajo;
  const x = (i: number) => M.izq + (n <= 1 ? anchoUtil / 2 : (i / (n - 1)) * anchoUtil);
  const y = (v: number) => M.arr + altoUtil - (v / tope) * altoUtil;
  const pts = puntos.map((p, i) => [x(i), y(p.valor)] as const);
  const linea = curvaMonotona(pts);
  const base = M.arr + altoUtil;
  const area = n > 0 ? `${linea} L${pts[n - 1][0]},${base} L${pts[0][0]},${base} Z` : '';
  // Cuántas etiquetas caben en el eje X sin pisarse (≈ 48 px cada una). La
  // última siempre sale; la de justo antes, solo si no la pisa.
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(anchoUtil / 48))));
  const conEtiqueta = (i: number) => i === n - 1 || (i % cada === 0 && n - 1 - i >= cada);
  // El eje lleva números solos («5», no «5 reservas»): con la unidad no cabe.
  const fmtEje = formatoEje ?? ((v: number) => v.toLocaleString('es-ES'));

  function alMover(ev: React.PointerEvent<SVGSVGElement>) {
    if (n === 0) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round(((px - M.izq) / anchoUtil) * (n - 1));
    setSobre(Math.min(n - 1, Math.max(0, i)));
  }

  const activo = sobre !== null ? puntos[sobre] : null;

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={ancho}
        height={alto}
        role="img"
        aria-label={titulo}
        onPointerMove={alMover}
        onPointerLeave={() => setSobre(null)}
        className="block touch-pan-y"
      >
        <defs>
          <linearGradient id={idDegradado} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.38 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.04 }} />
          </linearGradient>
        </defs>

        {/* Cuadrícula y eje Y */}
        {marcas.map(m => (
          <g key={m}>
            <line x1={M.izq} x2={ancho - M.der} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.izq - 8} y={y(m)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">
              {fmtEje(m)}
            </text>
          </g>
        ))}
        {puntos.map((_, i) => (
          <line key={i} x1={x(i)} x2={x(i)} y1={M.arr} y2={base} stroke="var(--border)" strokeWidth={1} strokeOpacity={0.6} />
        ))}

        {/* Área y curva */}
        {n > 0 && <path d={area} fill={`url(#${idDegradado})`} />}
        {n > 0 && <path d={linea} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />}

        {/* Guía del punto señalado */}
        {sobre !== null && (
          <line x1={x(sobre)} x2={x(sobre)} y1={M.arr} y2={base} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
        )}

        {/* Puntos */}
        {pts.map(([px, py], i) => (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={sobre === i ? 5.5 : 3.6}
            fill={colorPunto}
            stroke="var(--card)"
            strokeWidth={2}
          />
        ))}

        {/* Eje X */}
        {puntos.map((p, i) => conEtiqueta(i) && (
          <text key={i} x={x(i)} y={alto - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[11px]">
            {p.eje}
          </text>
        ))}
      </svg>

      {vacio && max === 0 && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-6" style={{ top: M.arr + altoUtil / 2 - 24 }}>
          <p className="max-w-sm rounded-2xl border border-border bg-card/95 px-4 py-2.5 text-center text-[12.5px] leading-snug text-muted-foreground shadow-t-card text-pretty">{vacio}</p>
        </div>
      )}

      {activo && sobre !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-foreground px-2.5 py-1.5 text-center shadow-lg"
          style={{ left: Math.min(Math.max(x(sobre), 60), ancho - 60), top: y(activo.valor) - 10 }}
        >
          <p className="whitespace-nowrap text-[13px] font-bold text-background tabular-nums">{formato(activo.valor)}</p>
          <p className="whitespace-nowrap text-[11px] text-background/70">{activo.nombre}</p>
        </div>
      )}

      <table className="sr-only">
        <caption>{titulo}</caption>
        <tbody>
          {puntos.map(p => (
            <tr key={p.nombre}><th scope="row">{p.nombre}</th><td>{formato(p.valor)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Curva monótona (Fritsch–Carlson) por los puntos, como ruta SVG. */
function curvaMonotona(p: readonly (readonly [number, number])[]): string {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0][0]},${p[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1][0] - p[i][0]);
    m.push((p[i + 1][1] - p[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}
