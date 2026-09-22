import { qrPathData } from '@/lib/qr-svg.ts';
import { tamanoNombreCertificado } from '@/lib/certificados/tamano-nombre.ts';
import { TRAZADOS } from '@/components/marca/trazados.ts';

// El certificado «Tentare Verified Studio», como JSX para `ImageResponse`
// (next/og, motor Satori) — no como cadena HTML/SVG: Satori renderiza React
// real, no `dangerouslySetInnerHTML`, así que el QR (lib/qr-svg.ts) y el
// logotipo (components/marca/trazados.ts) se reconstruyen aquí como
// elementos <svg>/<path>, no importando LogoTentare (que es 'use client').
//
// El isotipo lleva los MISMOS tres colores que `logo-tentare.tsx` en tinta
// `color` (`components/marca/logo-tentare.tsx`, objeto `TINTA.color`):
// hojas y palabra en `--marca-solido` (#222A33), disco en `--marca-disco`
// (#B4537E) y el TALLO en el degradado real `--marca-a` → `--marca-b`
// (#4C9CB0 → #B4537E, 135°) — no un color sólido: el tallo es la pieza más
// grande del isotipo y sin el degradado no se reconoce como el logo real.
//
// ⚠️ Un `style` con `top`/`left`/`right`/`bottom` en `undefined` (para que un
// blob solo fije dos de los cuatro lados) tumba a Satori con
// `Cannot read properties of undefined (reading 'trim')` — a diferencia del
// DOM real, no ignora la clave en `undefined`. Por eso `Blob` solo añade la
// clave cuando el valor viene dado, nunca la clave con `undefined` dentro.

// A4 apaisado a ~240 ppp: de sobra para pantalla, redes e impresión.
export const CERTIFICADO_IMAGE_SIZE = { width: 2000, height: 1414 };

const SOLIDO = '#222A33';
const GRIS = '#6B6B6B';
const DISCO = '#B4537E';
const MARCA_A = '#4C9CB0';
const MARCA_B = '#B4537E';

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un blob de color muy suave para una esquina — el «morado-rosa sutil» del kit, sin depender de `filter: blur()`. */
function Blob({ top, left, right, bottom, size, from, to }: {
  top?: number; left?: number; right?: number; bottom?: number; size: number; from: string; to: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        ...(top !== undefined ? { top } : {}),
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `radial-gradient(circle at 35% 35%, ${from} 0%, ${to} 55%, rgba(255,255,255,0) 75%)`,
        display: 'flex',
      }}
    />
  );
}

function LogotipoTentare({ alto }: { alto: number }) {
  // viewBox del kit para el horizontal, encuadre ceñido al dibujo (components/marca/logo-tentare.tsx).
  return (
    <svg width={alto * (369.08 / 111.22)} height={alto} viewBox="7 17 369.08 111.22" style={{ display: 'flex' }}>
      <defs>
        <linearGradient id="certTalloGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARCA_A} />
          <stop offset="1" stopColor={MARCA_B} />
        </linearGradient>
      </defs>
      <path d={TRAZADOS.hojaIzquierda} fill={SOLIDO} />
      <path d={TRAZADOS.hojaDerecha} fill={SOLIDO} />
      <path d={TRAZADOS.disco} fill={DISCO} />
      <path d={TRAZADOS.tallo} fill="url(#certTalloGrad)" />
      <path d={TRAZADOS.entare80} fill={SOLIDO} />
    </svg>
  );
}

function QrVerificacion({ url, tamano }: { url: string; tamano: number }) {
  const { dim, path } = qrPathData(url, { margen: 2 });
  return (
    <svg width={tamano} height={tamano} viewBox={`0 0 ${dim} ${dim}`} shape-rendering="crispEdges" style={{ display: 'flex' }}>
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill={SOLIDO} />
    </svg>
  );
}

export function certificadoJsx({
  studioName, codigo, emitidoEnIso, verifyUrl,
}: {
  studioName: string;
  codigo: string;
  emitidoEnIso: string;
  verifyUrl: string;
}) {
  const { width, height } = CERTIFICADO_IMAGE_SIZE;
  const tamanoNombre = Math.round(tamanoNombreCertificado(studioName) * 1.25);

  return (
    <div
      style={{
        width, height,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: '#FFFFFF',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
      }}
    >
      <Blob top={-200} left={-200} size={650} from="rgba(180,83,126,0.24)" to="rgba(180,83,126,0.06)" />
      <Blob top={-250} right={-225} size={600} from="rgba(76,156,176,0.22)" to="rgba(76,156,176,0.05)" />
      <Blob bottom={-275} left={-175} size={550} from="rgba(180,83,126,0.16)" to="rgba(180,83,126,0.04)" />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flex: 1,
          padding: '95px 130px 70px',
        }}
      >
        <div style={{ display: 'flex', fontSize: 74, fontWeight: 800, color: SOLIDO, letterSpacing: -2, textAlign: 'center' }}>
          CERTIFICADO TENTARE VERIFIED STUDIO
        </div>
        <div style={{ display: 'flex', marginTop: 20, fontSize: 30, fontWeight: 700, color: GRIS, letterSpacing: 10 }}>
          CERTIFICACIÓN OFICIAL
        </div>

        <div style={{ display: 'flex', marginTop: 90, fontSize: 32, color: GRIS }}>Se certifica que</div>

        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: tamanoNombre,
            fontWeight: 800,
            color: SOLIDO,
            textAlign: 'center',
            lineHeight: 1.15,
            maxWidth: 1650,
            justifyContent: 'center',
          }}
        >
          {studioName}
        </div>

        <div style={{ display: 'flex', marginTop: 40, fontSize: 32, color: SOLIDO, textAlign: 'center', maxWidth: 1200, lineHeight: 1.5 }}>
          ha completado satisfactoriamente el proceso de digitalización y configuración operativa de Tentare.
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 22, color: GRIS, textAlign: 'center', maxWidth: 1000, lineHeight: 1.5 }}>
          Este reconocimiento acredita la integración del estudio en el ecosistema digital de Tentare.
        </div>
        <div style={{ display: 'flex', marginTop: 30, fontSize: 20, fontWeight: 600, color: GRIS, letterSpacing: 4, textAlign: 'center' }}>
          RESERVAS · ALUMNAS · PAGOS · AGENDA · ASISTENCIA · OPERACIONES
        </div>

        <div style={{ display: 'flex', marginTop: 64 }}>
          <LogotipoTentare alto={62} />
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '0 110px 70px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, color: GRIS, letterSpacing: 3 }}>CERTIFICADO Nº</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 30, fontWeight: 700, color: SOLIDO }}>{codigo}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, color: GRIS, letterSpacing: 3 }}>FECHA DE EMISIÓN</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 30, fontWeight: 700, color: SOLIDO }}>{fechaLarga(emitidoEnIso)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, color: GRIS, letterSpacing: 3, marginBottom: 10 }}>VERIFICACIÓN</div>
          <QrVerificacion url={verifyUrl} tamano={125} />
        </div>
      </div>
    </div>
  );
}
