import type { CSSProperties, ReactNode } from 'react';
import type { IdTarjetaInicio } from '@/lib/inicio/tarjetas-configuracion';

// ─────────────────────────────────────────────────────────────────────────────
// Las ilustraciones de las tarjetas del Inicio de configuración (24-nov-2026, `SHELL_NUEVO`).
//
// ORIGINALES de Tentare: objetos de un estudio de Pilates (sala con reformer, calendario, tarjeta de cobro
// neutra, QR…) dibujados en SVG sobre el fondo gris suave, 286 × 140 como la imagen de las tarjetas del admin
// de Shopify. No se ha copiado ninguna imagen de nadie (ni la de Shopify ni logos de terceros).
//
// Movimiento, medido en el admin de Shopify: cada ilustración es un conjunto de CAPAS y una variable
// `--act` (0 en reposo, 1 con el cursor encima o el foco dentro). Cada capa se desplaza, gira o crece en
// proporción a `--act`, con `transition: .8 s cubic-bezier(.2,.8,0,1)`. Aquí cada capa es un `<g>` con sus
// `--dx --dy --rot --esc` (unidades del dibujo, grados y proporción); la tarjeta pone `--act` en
// `.ic-tarjeta:hover` / `:focus-within`. Sin «reducir movimiento», todo quieto. Decorativas (`aria-hidden`).
// ─────────────────────────────────────────────────────────────────────────────

export const ESTILOS_ILUSTRACION = `
.ic-tarjeta { --act: 0; }
.ic-tarjeta:hover, .ic-tarjeta:focus-within { --act: 1; }
.ic-capa { transform-box: fill-box; transform-origin: center;
  transform: translate(calc(var(--dx, 0) * var(--act) * 1px), calc(var(--dy, 0) * var(--act) * 1px)) rotate(calc(var(--rot, 0) * var(--act) * 1deg)) scale(calc(1 + var(--esc, 0) * var(--act)));
  transition: transform .8s cubic-bezier(.2, .8, 0, 1); }
.ic-capa-sombra { filter: drop-shadow(0 3px 5px rgba(0,0,0,.16)) drop-shadow(0 1px 1.5px rgba(0,0,0,.10)); }
@media (prefers-reduced-motion: reduce) { .ic-capa { transition: none; transform: none; } }
`;

const TINTA = '#141414';
const PAPEL = '#fff';
const GRIS = '#e4e6e8';
const GRIS2 = '#c9cdd1';
const LINEA = 'rgba(0,0,0,.15)';
const AZUL = 'var(--t-blue-500)';
const AZUL_S = 'var(--t-blue-100)';
const MAG = 'var(--t-magenta-500)';
const MAG_S = 'var(--t-magenta-100)';
const ARENA = '#e9dcc6';
const SALVIA = '#b9cdb4';

interface PropsCapa { dx?: number; dy?: number; rot?: number; esc?: number; sombra?: boolean; children: ReactNode }

/** Una capa que se mueve con `--act`. */
function Capa({ dx = 0, dy = 0, rot = 0, esc = 0, sombra = true, children }: PropsCapa) {
  const estilo = { '--dx': dx, '--dy': dy, '--rot': rot, '--esc': esc } as CSSProperties;
  return <g className={sombra ? 'ic-capa ic-capa-sombra' : 'ic-capa'} style={estilo}>{children}</g>;
}

/** Una pieza blanca con borde interior discontinuo, como las baldosas de las tarjetas de Shopify. */
function Baldosa({ x, y, w, h, r = 9, discontinuo = true }: { x: number; y: number; w: number; h: number; r?: number; discontinuo?: boolean }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={PAPEL} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke="rgba(20,24,28,.09)" />
      {discontinuo && <rect x={x + 3.5} y={y + 3.5} width={w - 7} height={h - 7} rx={r - 3} fill="none" stroke={LINEA} strokeDasharray="3 3" />}
    </>
  );
}

const Persona = ({ x, y, color, s = 1 }: { x: number; y: number; color: string; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cx="0" cy="-14" r="9" fill="#f3d9c4" />
    <path d="M-17 18c1-16 8-22 17-22s16 6 17 22z" fill={color} />
  </g>
);

const ESCENAS: Record<IdTarjetaInicio, () => ReactNode> = {
  // Datos del estudio: una hoja con líneas, un reloj y una etiqueta.
  estudio: () => (<>
    <Capa dx={-7} dy={5} rot={-4}><Baldosa x={64} y={26} w={86} h={92} /><rect x={78} y={42} width={40} height={6} rx={3} fill={TINTA} /><rect x={78} y={56} width={58} height={5} rx={2.5} fill={GRIS} /><rect x={78} y={67} width={50} height={5} rx={2.5} fill={GRIS} /><rect x={78} y={78} width={58} height={5} rx={2.5} fill={GRIS} /><rect x={78} y={96} width={26} height={10} rx={5} fill={AZUL_S} /></Capa>
    <Capa dx={8} dy={-6} rot={8}><circle cx={178} cy={58} r={26} fill={PAPEL} /><circle cx={178} cy={58} r={26} fill="none" stroke="rgba(20,24,28,.09)" /><path d="M178 42v17l11 7" stroke={TINTA} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Capa>
    <Capa dx={9} dy={7} rot={-6}><rect x={168} y={92} width={56} height={22} rx={11} fill={MAG} /><rect x={180} y={101} width={32} height={4} rx={2} fill="#fff" fillOpacity=".9" /></Capa>
  </>),
  // Sala: suelo, reformer y esterilla enrollada.
  salas: () => (<>
    <path d="M30 108 L143 84 L256 108 L143 132 Z" fill="#eceef0" />
    <Capa dx={-8} dy={5} rot={-6}><rect x={52} y={78} width={52} height={14} rx={7} fill={SALVIA} /><circle cx={58} cy={85} r={6} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={1.5} /></Capa>
    <Capa dx={0} dy={-2}><rect x={104} y={62} width={104} height={14} rx={7} fill={PAPEL} /><rect x={104} y={62} width={104} height={14} rx={7} fill="none" stroke="rgba(20,24,28,.12)" /><rect x={118} y={52} width={34} height={12} rx={6} fill={AZUL} /><rect x={196} y={46} width={6} height={22} rx={3} fill={TINTA} /><rect x={110} y={76} width={4} height={18} rx={2} fill={GRIS2} /><rect x={198} y={76} width={4} height={18} rx={2} fill={GRIS2} /><path d="M140 70h40" stroke={LINEA} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" /></Capa>
    <Capa dx={9} dy={-8} rot={10} esc={0.06}><circle cx={226} cy={92} r={14} fill={MAG_S} /><circle cx={226} cy={92} r={14} fill="none" stroke="rgba(0,0,0,.12)" /><path d="M215 88c8 4 14 4 22 0" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" /></Capa>
  </>),
  // Instructoras: dos personas y una insignia con tick.
  instructoras: () => (<>
    <Capa dx={-8} dy={4}><Baldosa x={64} y={30} w={70} h={86} /><Persona x={99} y={72} color={AZUL} /></Capa>
    <Capa dx={8} dy={-5}><Baldosa x={150} y={22} w={70} h={86} /><Persona x={185} y={64} color={MAG} /></Capa>
    <Capa dx={0} dy={-7} rot={8} esc={0.1}><circle cx={228} cy={96} r={14} fill={TINTA} /><path d="M221 96l5 5 9-10" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Capa>
  </>),
  // Tipos de clase: tres tarjetas en abanico.
  tipos: () => (<>
    <Capa dx={9} dy={-7} rot={4}><rect x={128} y={20} width={96} height={64} rx={9} fill={ARENA} /><rect x={140} y={34} width={44} height={6} rx={3} fill="#fff" fillOpacity=".8" /></Capa>
    <Capa dx={-9} dy={7} rot={-4}><rect x={64} y={52} width={96} height={64} rx={9} fill={SALVIA} /><rect x={76} y={66} width={44} height={6} rx={3} fill="#fff" fillOpacity=".8" /></Capa>
    <Capa dy={0} esc={0.03}><Baldosa x={92} y={36} w={104} h={68} /><rect x={106} y={50} width={52} height={7} rx={3.5} fill={TINTA} /><rect x={106} y={64} width={78} height={5} rx={2.5} fill={GRIS} /><rect x={106} y={75} width={64} height={5} rx={2.5} fill={GRIS} /><rect x={106} y={88} width={30} height={10} rx={5} fill={AZUL_S} /></Capa>
  </>),
  // Reglas: dos interruptores cuyas bolas se mueven.
  reglas: () => (<>
    <Capa sombra><Baldosa x={62} y={24} w={162} h={92} r={12} discontinuo={false} /></Capa>
    <rect x={78} y={42} width={64} height={6} rx={3} fill={GRIS} /><rect x={78} y={90} width={80} height={6} rx={3} fill={GRIS} />
    <rect x={172} y={36} width={38} height={20} rx={10} fill={AZUL} /><rect x={172} y={84} width={38} height={20} rx={10} fill={GRIS2} />
    <Capa dx={-18} sombra={false}><circle cx={200} cy={46} r={7} fill="#fff" /></Capa>
    <Capa dx={18} sombra={false}><circle cx={182} cy={94} r={7} fill="#fff" /></Capa>
    <Capa dx={6} dy={-6} rot={10}><circle cx={236} cy={104} r={14} fill={MAG} /><path d="M236 97v8l5 3" stroke="#fff" strokeWidth={2.5} fill="none" strokeLinecap="round" /></Capa>
  </>),
  // Tarifas: etiqueta de precio y bono de clases.
  tarifas: () => (<>
    <Capa dx={-9} dy={6} rot={-3}><rect x={58} y={44} width={118} height={62} rx={10} fill={PAPEL} /><rect x={58} y={44} width={118} height={62} rx={10} fill="none" stroke="rgba(20,24,28,.09)" /><path d="M136 44v62" stroke={LINEA} strokeDasharray="2 4" strokeLinecap="round" /><rect x={70} y={58} width={50} height={8} rx={4} fill={TINTA} />{[0, 1, 2, 3].map(i => <circle key={i} cx={74 + i * 14} cy={86} r={5} fill={i < 3 ? AZUL : GRIS} />)}<circle cx={156} cy={75} r={9} fill={AZUL_S} /></Capa>
    <Capa dx={10} dy={-8} rot={10}><path d="M178 34h38a8 8 0 0 1 8 8v32l-30 30a8 8 0 0 1-11 0L158 82a8 8 0 0 1 0-11z" fill={MAG} /><circle cx={208} cy={46} r={4} fill="#fff" /><rect x={186} y={62} width={22} height={5} rx={2.5} fill="#fff" fillOpacity=".9" /></Capa>
  </>),
  // Cobros: dos tarjetas neutras (sin marcas) y una moneda.
  cobros: () => (<>
    <Capa dx={10} dy={-8} rot={5}><rect x={114} y={26} width={104} height={64} rx={10} fill={AZUL_S} /><rect x={114} y={38} width={104} height={12} fill="rgba(20,24,28,.55)" /></Capa>
    <Capa dx={-9} dy={7} rot={-4}><rect x={68} y={52} width={104} height={64} rx={10} fill={PAPEL} /><rect x={68} y={52} width={104} height={64} rx={10} fill="none" stroke="rgba(20,24,28,.09)" /><rect x={82} y={66} width={22} height={16} rx={4} fill={ARENA} /><rect x={82} y={92} width={60} height={5} rx={2.5} fill={GRIS} /><rect x={82} y={102} width={36} height={5} rx={2.5} fill={GRIS} /><circle cx={150} cy={70} r={8} fill={MAG} fillOpacity=".85" /><circle cx={158} cy={70} r={8} fill={AZUL} fillOpacity=".7" /></Capa>
    <Capa dx={4} dy={-10} rot={-16} esc={0.08}><circle cx={226} cy={96} r={15} fill={ARENA} /><circle cx={226} cy={96} r={15} fill="none" stroke="rgba(0,0,0,.14)" /><text x={226} y={102} textAnchor="middle" fontSize="16" fontWeight="600" fill={TINTA} fontFamily="system-ui, sans-serif">€</text></Capa>
  </>),
  // Horario: calendario con una clase que se desliza.
  horario: () => (<>
    <Capa dx={-4} dy={2}><Baldosa x={60} y={22} w={166} h={98} r={12} discontinuo={false} /><rect x={60} y={22} width={166} height={22} rx={12} fill={TINTA} /><rect x={60} y={34} width={166} height={10} fill={TINTA} />{[0, 1, 2, 3].map(c => [0, 1].map(f => <rect key={`${c}${f}`} x={72 + c * 38} y={54 + f * 32} width={32} height={24} rx={5} fill={GRIS} fillOpacity=".7" />))}</Capa>
    <Capa dx={38} dy={0} sombra><rect x={72} y={54} width={32} height={24} rx={5} fill={AZUL} /><rect x={77} y={61} width={16} height={4} rx={2} fill="#fff" /></Capa>
    <Capa dx={-7} dy={-8} rot={-10}><circle cx={214} cy={104} r={15} fill={MAG} /><path d="M214 95v10l6 4" stroke="#fff" strokeWidth={2.5} fill="none" strokeLinecap="round" /></Capa>
  </>),
  // Clientes: tres personas y un «+».
  alumnas: () => (<>
    <Capa dx={-12} dy={4}><Baldosa x={58} y={38} w={64} h={78} /><Persona x={90} y={76} color={MAG} s={0.9} /></Capa>
    <Capa dx={12} dy={-4}><Baldosa x={150} y={26} w={70} h={78} /><Persona x={185} y={64} color={AZUL} s={0.9} /></Capa>
    <Capa dy={-4} esc={0.02}><Baldosa x={104} y={30} w={74} h={90} /><Persona x={141} y={74} color={SALVIA} /></Capa>
    <Capa dx={8} dy={-8} rot={90} esc={0.08}><circle cx={226} cy={100} r={14} fill={TINTA} /><path d="M219 100h14M226 93v14" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" /></Capa>
  </>),
  // Marca: un móvil con la cabecera de color y paleta.
  marca: () => (<>
    <Capa dx={-6} dy={3}><rect x={96} y={14} width={74} height={118} rx={13} fill={PAPEL} /><rect x={96} y={14} width={74} height={118} rx={13} fill="none" stroke="rgba(20,24,28,.12)" /><rect x={103} y={22} width={60} height={34} rx={8} fill={MAG} /><circle cx={133} cy={39} r={9} fill="#fff" fillOpacity=".95" /><rect x={103} y={64} width={60} height={9} rx={4.5} fill={GRIS} /><rect x={103} y={79} width={44} height={9} rx={4.5} fill={GRIS} /><rect x={103} y={98} width={60} height={22} rx={8} fill={AZUL_S} /></Capa>
    <Capa dx={12} dy={-4} rot={8}>{[ARENA, SALVIA, AZUL].map((c, i) => <circle key={i} cx={198} cy={42 + i * 26} r={11} fill={c} />)}</Capa>
    <Capa dx={-10} dy={8} rot={-10}><rect x={52} y={86} width={34} height={34} rx={9} fill={TINTA} /><path d="M62 108l7-14 7 14" stroke="#fff" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Capa>
  </>),
  // Abrir reservas: QR, enlace y avioncito.
  lanzamiento: () => (<>
    <Capa dx={-8} dy={4} rot={-3}><Baldosa x={68} y={26} w={78} h={88} />{[0, 1, 2, 3, 4].map(f => [0, 1, 2, 3, 4].map(c => ((f * 5 + c * 3 + f * c) % 3 !== 0 || (f < 2 && c < 2)) ? <rect key={`${f}${c}`} x={80 + c * 11} y={40 + f * 12} width={8} height={8} rx={1.5} fill={TINTA} /> : null))}</Capa>
    <Capa dx={9} dy={-4}><rect x={160} y={72} width={80} height={26} rx={13} fill={PAPEL} /><rect x={160} y={72} width={80} height={26} rx={13} fill="none" stroke="rgba(20,24,28,.1)" /><rect x={172} y={82} width={44} height={6} rx={3} fill={AZUL} /><circle cx={229} cy={85} r={4} fill={MAG} /></Capa>
    <Capa dx={13} dy={-11} rot={9} esc={0.05}><path d="M166 56l56-22-14 46-14-14-10 12-2-16z" fill={MAG} /><path d="M166 56l30 10 26-32z" fill="#fff" fillOpacity=".35" /></Capa>
  </>),
};

/** La imagen de una tarjeta: fondo #f5f6f7, radio 12, el bisel interior de las tarjetas de Shopify y las capas. */
export function IlustracionInicio({ id }: { id: IdTarjetaInicio }) {
  const Dibujo = ESCENAS[id];
  return (
    <div className="relative h-[140px] w-full overflow-hidden rounded-xl bg-[#f5f6f7]" aria-hidden="true">
      <svg viewBox="0 0 286 140" className="absolute inset-0 size-full" focusable="false" data-ilustracion={id}>
        <Dibujo />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_#14181c17,inset_0_1px_0_#ffffffe0,inset_1px_0_0_#ffffff85,inset_0_-1px_0_#14181c14,inset_-1px_0_0_#14181c0d]" />
    </div>
  );
}
