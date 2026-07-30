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
import { useModo } from '@/lib/portal-modo';
import {
  EASE, dur, display, micro, texto, radio, sombra, cristal, desenfoque,
} from '@/lib/portal-design';

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
  const { t, noche } = useModo();
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
    position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 21,
    background: t.bg, borderRadius: radio.hoja,
    border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.8)'}`,
    boxShadow: sombra.sheet, padding: '16px 26px 28px',
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
          background: noche ? 'rgba(8,9,6,.44)' : 'rgba(34,38,31,.24)',
          ...cristal(desenfoque.backdrop, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />

      <div role="dialog" aria-modal={abierta} aria-label="Tu pase de acceso" style={hoja}>
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          style={{ width: 40, height: 4, borderRadius: 4, background: noche ? '#3A3F33' : '#D8D4C9', border: 'none', padding: 0 }}
        />

        <span style={{ ...micro(8.5, 0.3, 600), color: t.heroAccent, marginTop: 24, textAlign: 'center' }}>
          Acceso · {nombreEstudio}
        </span>

        <Contenido pase={pase} fallo={fallo} t={t} noche={noche} />

        <div style={{ ...display(30, true), color: t.ink, marginTop: 24, textAlign: 'center' }}>{tituloClase}</div>
        <div style={{ ...texto.meta, color: t.muted, marginTop: 8, textAlign: 'center' }}>{subtitulo}</div>

        <span style={{ width: 24, height: 1, background: t.line, margin: '20px 0' }} />

        {/* Entrar es un CAMBIO DE ESTADO, no un matiz: antes esto era un
            renglón de gris pequeño en el mismo hueco donde ponía «enséñaselo»,
            con el QR intacto al lado. Nadie se enteraba. */}
        {yaDentro ? (
          <p style={{ ...display(21, true), color: t.heroAccent, textAlign: 'center', marginTop: 4 }}>
            Que vaya muy bien.
          </p>
        ) : (
          <p style={{ ...texto.pie, color: t.muted2, textAlign: 'center', lineHeight: 1.5 }}>
            Enséñaselo a tu instructora al entrar.
          </p>
        )}

        <button
          type="button" onClick={onClose}
          style={{ ...micro(10, 0.26, 600), color: t.micro, marginTop: 24, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cerrar
        </button>
      </div>
    </>
  );
}

/** El cuadro central: el QR, o lo que toque cuando no hay QR que enseñar. */
function Contenido({
  pase, fallo, t, noche,
}: {
  pase: DatosPase | null;
  fallo: boolean;
  t: ReturnType<typeof useModo>['t'];
  noche: boolean;
}) {
  const caja: React.CSSProperties = {
    position: 'relative', overflow: 'hidden', marginTop: 22,
    width: 228, height: 228, borderRadius: radio.qr, background: '#FFFFFF',
    boxShadow: sombra.qr, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const aviso = (texto1: string, texto2?: string) => (
    <div style={{ ...caja, background: noche ? t.surface : t.surface2, flexDirection: 'column', gap: 8, padding: 28 }}>
      <span style={{ ...display(22, true), color: t.ink, textAlign: 'center', lineHeight: 1.15 }}>{texto1}</span>
      {texto2 && <span style={{ ...texto.nota, color: t.muted, textAlign: 'center' }}>{texto2}</span>}
    </div>
  );

  if (fallo) return aviso('No hemos podido abrir tu pase', 'Inténtalo en unos segundos');
  if (!pase) return <div style={{ ...caja, background: noche ? t.surface : t.surface2 }} aria-busy />;
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
        background: 'var(--portal-brand)',
        flexDirection: 'column', gap: 10, padding: 28,
      }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 12.5l5.2 5.2L20 7" stroke={t.accentInk} strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ ...display(26, true), color: t.accentInk, textAlign: 'center', lineHeight: 1.15 }}>
          Ya estás dentro
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={caja}>
        {/* El QR se pinta como SVG en el cliente con el generador que ya usan las
            facturas Veri*Factu — cero dependencias nuevas. */}
        <div
          style={{ width: 182, height: 182 }}
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
          <div style={{ ...micro(8.5, 0.26, 600), color: t.micro }}>o dile este código</div>
          <div style={{ ...display(26), color: t.ink, letterSpacing: '.14em', paddingLeft: '.14em', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {pase.codigo}
          </div>
        </div>
      )}
    </>
  );
}
