'use client';

// La hoja del pase de acceso — pieza del diseño "Tentare App Cliente v2".
//
// El QR se pide al servidor y caduca en dos minutos, así que mientras la hoja
// está abierta se renueva sola cada 75 s. No es adorno: validar el pase abre la
// puerta del estudio, y sin caducidad una captura reenviada por WhatsApp vale
// como llave.
//
// Debajo del QR va el mismo pase en seis caracteres. Existe porque la cámara
// falla más de lo que parece —cristal sucio, contraluz en la puerta, un Android
// viejo sin BarcodeDetector— y una clienta esperando en la calle no puede
// depender de eso.

import { useCallback, useEffect, useRef, useState } from 'react';
import { qrSvgMarkup } from '@/lib/qr-svg';
import { EASE, dur, sans, cristal } from '@/lib/portal-design';

const RENUEVA_MS = 75_000;

// Mientras el pase está PENDIENTE se pregunta cada pocos segundos, no cada 75.
// Probándolo en vivo (2026-07-30) el usuario tuvo que RECARGAR la página: la
// recepción escaneó, y su pantalla siguió enseñando el mismo QR hasta un minuto
// y cuarto después, sin ninguna señal de que ya estaba dentro. Quien acaba de
// enseñar el móvil está mirándolo fijamente: ese es justo el momento en el que
// no se puede tardar. En cuanto entra, se deja de preguntar.
const ESPERANDO_MS = 4_000;

export interface DatosPase {
  hayPase: boolean;
  vigente?: boolean;
  yaAsistida?: boolean;
  minutosParaActivarse?: number;
  seActivaA?: string | null;
  paseHasta?: string | null;
  inicio?: string;
  token?: string | null;
  codigo?: string | null;
}

export function HojaPase({
  abierta, onClose, slug, nombreEstudio, tituloClase, subtitulo, pedirPase,
}: {
  abierta: boolean;
  onClose: () => void;
  slug: string;
  nombreEstudio: string;
  tituloClase: string;
  subtitulo: string;
  pedirPase: (slug: string) => Promise<DatosPase | null>;
}) {
  const [pase, setPase] = useState<DatosPase | null>(null);
  const [fallo, setFallo] = useState(false);
  const vivo = useRef(false);
  const yaDentro = pase?.yaAsistida === true;

  const cargar = useCallback(async () => {
    const d = await pedirPase(slug);
    if (!vivo.current) return;
    if (!d) { setFallo(true); return; }
    setFallo(false);
    setPase(d);
  }, [pedirPase, slug]);

  // Solo se pide mientras la hoja está abierta: un pase que nadie mira no
  // necesita renovarse, y cada renovación es una petición.
  useEffect(() => {
    vivo.current = abierta;
    if (!abierta) return;
    // El compilador lo marca porque `cargar` acaba llamando a setState. Aquí es
    // lo correcto: la hoja se abre y hay que ir a buscar el pase — no hay forma
    // de tenerlo antes de que exista la intención de mirarlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    const id = setInterval(() => void cargar(), yaDentro ? RENUEVA_MS : ESPERANDO_MS);
    return () => { vivo.current = false; clearInterval(id); };
  }, [abierta, cargar, yaDentro]);

  const hoja: React.CSSProperties = {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21,
    background: '#12291A', borderRadius: '24px 24px 0 0',
    boxShadow: '0 -18px 50px rgba(15,15,15,.25)', padding: '16px 26px 28px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    opacity: abierta ? 1 : 0,
    pointerEvents: abierta ? 'auto' : 'none',
    transform: abierta ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
    transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: 20,
          opacity: abierta ? 1 : 0, pointerEvents: abierta ? 'auto' : 'none',
          background: 'rgba(15,15,15,.42)',
          ...cristal(18, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />

      <div role="dialog" aria-modal={abierta} aria-label="Tu pase de acceso" style={hoja}>
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          style={{ width: 34, height: 4, borderRadius: 4, background: 'rgba(241,236,225,.3)', border: 'none', padding: 0 }}
        />

        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.24em',
          paddingLeft: '.24em', textTransform: 'uppercase', color: '#A8D0A9', marginTop: 24, textAlign: 'center',
        }}>
          Acceso · {nombreEstudio}
        </span>

        <Contenido pase={pase} fallo={fallo} />

        <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', color: '#F1ECE1', marginTop: 24, textAlign: 'center' }}>
          {tituloClase}
        </div>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: 'rgba(241,236,225,.65)', marginTop: 8, textAlign: 'center' }}>
          {subtitulo}
        </div>

        <span style={{ width: 24, height: 1, background: 'rgba(241,236,225,.18)', margin: '20px 0' }} />

        {/* Entrar es un CAMBIO DE ESTADO, no un matiz: antes esto era un
            renglón de gris pequeño en el mismo hueco donde ponía «enséñaselo»,
            con el QR intacto al lado. Nadie se enteraba. */}
        {yaDentro ? (
          <p style={{ fontFamily: sans, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: '#A8D0A9', textAlign: 'center', marginTop: 4 }}>
            Que vaya muy bien.
          </p>
        ) : (
          <p style={{ fontFamily: sans, fontSize: 11.5, color: 'rgba(241,236,225,.55)', textAlign: 'center', lineHeight: 1.5 }}>
            Enséñaselo a tu instructora al entrar.
          </p>
        )}

        <button
          type="button" onClick={onClose}
          style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '.26em', paddingLeft: '.26em',
            textTransform: 'uppercase', color: 'rgba(241,236,225,.55)', marginTop: 24, background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          Cerrar
        </button>
      </div>
    </>
  );
}

/** El cuadro central: el QR, o lo que toque cuando no hay QR que enseñar. */
function Contenido({ pase, fallo }: { pase: DatosPase | null; fallo: boolean }) {
  const caja: React.CSSProperties = {
    position: 'relative', overflow: 'hidden', marginTop: 22,
    width: 168, height: 168, borderRadius: 24, background: '#FFFFFF',
    boxShadow: '0 20px 44px -18px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const aviso = (texto1: string, texto2?: string) => (
    <div style={{ ...caja, background: '#0E2216', flexDirection: 'column', gap: 6, padding: 20 }}>
      <span style={{ fontFamily: sans, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: '#F1ECE1', textAlign: 'center', lineHeight: 1.15 }}>
        {texto1}
      </span>
      {texto2 && (
        <span style={{ fontFamily: sans, fontSize: 11, color: 'rgba(241,236,225,.6)', textAlign: 'center' }}>{texto2}</span>
      )}
    </div>
  );

  if (fallo) return aviso('No hemos podido abrir tu pase', 'Inténtalo en unos segundos');
  if (!pase) return <div style={{ ...caja, background: '#0E2216' }} aria-busy />;
  if (!pase.hayPase) return aviso('No tienes ninguna clase cerca', 'El pase aparece una hora antes');
  if (!pase.vigente) {
    const hora = pase.seActivaA
      ? new Date(pase.seActivaA).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : null;
    return aviso('Tu pase se abre a las ' + (hora ?? 'su hora'), 'Una hora antes de empezar');
  }

  // Ya dentro: el QR SE VA. Dejarlo puesto era lo que hacía que nadie se
  // enterara — la pantalla seguía pidiendo que lo enseñaras cuando ya no hacía
  // falta, y el único cambio era un renglón gris debajo.
  if (pase.yaAsistida) {
    return (
      <div style={{
        ...caja,
        background: '#4F8A5B',
        flexDirection: 'column', gap: 8, padding: 20,
        animation: 'apPop .5s both',
      }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden style={{ animation: 'apCheck .5s both' }}>
          <path d="M4 12.5l5.2 5.2L20 7" stroke="#FFFFFF" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15 }}>
          Ya estás dentro
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={caja}>
        {/* El QR se pinta como SVG en el cliente con el generador que ya usan las
            facturas Veri*Factu — cero dependencias nuevas. Tamaño proporcional
            a la caja (168px, diseño "Tentare Studio App"): misma proporción
            interior/caja que tenía la versión anterior (182/228 ≈ .8). */}
        <div
          style={{ width: 134, height: 134 }}
          dangerouslySetInnerHTML={{ __html: qrSvgMarkup(pase.token ?? '') }}
          aria-hidden
        />
        <span className="sr-only">Código de acceso {pase.codigo}</span>
        {/* El brillo que cruza el código: además de bonito, es la señal de que
            el pase está vivo y renovándose. */}
        <span
          aria-hidden
          style={{
            position: 'absolute', top: '-30%', left: 0, width: '44%', height: '160%', pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.8) 50%, rgba(255,255,255,0) 100%)',
            animation: 'paseBrillo 4.8s cubic-bezier(.45,0,.55,1) infinite',
          }}
        />
      </div>

      {pase.codigo && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 600, letterSpacing: '.26em',
            paddingLeft: '.26em', textTransform: 'uppercase', color: 'rgba(241,236,225,.55)',
          }}>
            o dile este código
          </div>
          <div style={{
            fontFamily: sans, fontSize: 22, fontWeight: 800, color: '#F1ECE1', letterSpacing: '.34em',
            paddingLeft: '.34em', marginTop: 4, fontVariantNumeric: 'tabular-nums',
          }}>
            {pase.codigo}
          </div>
        </div>
      )}

      {/* Antes esto solo lo insinuaba el brillo animado de la caja — bonito,
          pero implícito. El diseño pide el texto explícito, con la hora real
          en que `paseVigente` deja de dar `true` (misma `ventanaDelPase` que
          ya decidía el resto de la pantalla), no un aviso genérico. */}
      {pase.paseHasta && (
        <span style={{ fontFamily: sans, fontSize: 11, color: 'rgba(241,236,225,.6)', marginTop: 14, textAlign: 'center' }}>
          Válido hasta las {new Date(pase.paseHasta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </>
  );
}
