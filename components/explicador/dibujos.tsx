// Los dibujos de los explicadores: esquemas con los tokens del panel (tinta,
// borde, tarjeta), nunca ilustraciones de bienestar ni personas genéricas, y
// nunca Tenti (los explicadores viven junto a cifras de dinero). Van con
// `aria-hidden`: la idea de cada uno está contada en el texto del paso.

import { useId, type ReactNode } from 'react';
import type { IdDibujo } from '@/lib/ayuda/explicadores';
import { TINTA_POR_NIVEL } from '@/lib/informes/euro-por-plaza';

const TINTA = 'var(--foreground)';
const SUAVE = 'var(--muted-foreground)';
const BORDE = 'var(--border)';
const FONDO = 'var(--card)';

function Lienzo({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" aria-hidden focusable="false" fontFamily="inherit">
      {children}
    </svg>
  );
}

function Pastilla({ x, y, w = 46, texto, lleno = false }: { x: number; y: number; w?: number; texto: string; lleno?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={24} rx={12} fill={lleno ? TINTA : FONDO} stroke={TINTA} strokeWidth={1.2} />
      <text x={x + w / 2} y={y + 16.5} textAnchor="middle" fontSize={13} fontWeight={600} fill={lleno ? FONDO : TINTA}>{texto}</text>
    </g>
  );
}

function Plaza({ x, y, ocupada }: { x: number; y: number; ocupada: boolean }) {
  return <rect x={x} y={y} width={18} height={18} rx={5} fill={ocupada ? TINTA : FONDO} stroke={ocupada ? TINTA : SUAVE} strokeWidth={1.2} strokeDasharray={ocupada ? undefined : '3 2'} />;
}

export const DIBUJOS: Record<IdDibujo, () => ReactNode> = {
  // 60 € que se parten en cuatro clases de 15 €.
  repartoAlumna: () => (
    <Lienzo>
      <Pastilla x={83} y={14} w={54} texto="60 €" lleno />
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <line x1={110} y1={36} x2={30 + i * 53} y2={84} stroke={BORDE} strokeWidth={1.5} />
          <Pastilla x={10 + i * 53} y={86} w={42} texto="15 €" />
        </g>
      ))}
      <text x={110} y={136} textAnchor="middle" fontSize={12} fill={SUAVE}>4 clases</text>
    </Lienzo>
  ),
  // 15 + 20 + 10 = 45 € en la misma hora.
  sumaHora: () => (
    <Lienzo>
      <text x={110} y={22} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={SUAVE}>Martes · 18:00</text>
      <Pastilla x={18} y={46} texto="15 €" />
      <Pastilla x={88} y={46} texto="20 €" />
      <Pastilla x={158} y={46} texto="10 €" />
      <line x1={18} y1={92} x2={202} y2={92} stroke={TINTA} strokeWidth={1.2} />
      <Pastilla x={83} y={104} w={54} texto="45 €" lleno />
    </Lienzo>
  ),
  // Seis plazas, tres ocupadas: 45 € ÷ 6.
  sillas: () => (
    <Lienzo>
      {[0, 1, 2, 3, 4, 5].map(i => <Plaza key={i} x={40 + i * 24} y={40} ocupada={i < 3} />)}
      <text x={110} y={86} textAnchor="middle" fontSize={12.5} fill={SUAVE}>6 plazas, también las vacías</text>
      <Pastilla x={70} y={100} w={80} texto="7,50 € / plaza" lleno />
    </Lienzo>
  ),
  // Una sala pequeña llena frente a una grande a medias.
  dosSalas: () => (
    <Lienzo>
      <text x={52} y={18} textAnchor="middle" fontSize={12} fill={SUAVE}>4 plazas · 100 %</text>
      {[0, 1, 2, 3].map(i => <Plaza key={i} x={16 + (i % 2) * 24} y={28 + Math.floor(i / 2) * 24} ocupada />)}
      <Pastilla x={18} y={92} w={68} texto="5 € / plaza" />
      <text x={160} y={18} textAnchor="middle" fontSize={12} fill={SUAVE}>10 plazas · 70 %</text>
      {Array.from({ length: 10 }, (_, i) => <Plaza key={i} x={104 + (i % 5) * 23} y={28 + Math.floor(i / 5) * 24} ocupada={i < 7} />)}
      <Pastilla x={124} y={92} w={72} texto="7 € / plaza" lleno />
    </Lienzo>
  ),
  // Un trozo de mapa con los mismos tres tonos que el de verdad, una casilla
  // con «—» y una sin clases (en gris, sin borde, como en el mapa).
  leerMapa: () => <LeerMapa />,
};

function LeerMapa() {
  const idFlecha = useId();
  // Nivel (0–2), -1 = «—», -2 = sin clases.
  const casillas = [[0, 1, 2, -2], [2, -2, 0, 1], [1, 2, -1, 0]];
  const fondo = (n: number) => (n >= 0 ? `color-mix(in oklab, ${TINTA} ${TINTA_POR_NIVEL[n]}%, ${FONDO})` : n === -2 ? 'var(--muted)' : FONDO);
  return (
    <Lienzo>
      {casillas.map((fila, f) => fila.map((n, c) => (
        <g key={`${f}-${c}`}>
          <rect
            x={34 + c * 40} y={10 + f * 32} width={36} height={28} rx={6} fill={fondo(n)}
            stroke={n === -2 ? 'none' : BORDE} strokeWidth={1} strokeDasharray={n === -1 ? '3 2' : undefined}
          />
          {n === -1 && <text x={52 + c * 40} y={29 + f * 32} textAnchor="middle" fontSize={13} fill={SUAVE}>—</text>}
        </g>
      )))}
      <text x={34} y={124} fontSize={12} fill={SUAVE}>menos</text>
      <text x={190} y={124} textAnchor="end" fontSize={12} fill={SUAVE}>más € por plaza</text>
      <line x1={34} y1={140} x2={186} y2={140} stroke={SUAVE} strokeWidth={1} markerEnd={`url(#${idFlecha})`} />
      <defs>
        <marker id={idFlecha} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <polygon points="0,0 6,3 0,6" fill={SUAVE} />
        </marker>
      </defs>
    </Lienzo>
  );
}
