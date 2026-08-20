'use client';

// Leer el pase de una clienta.
//
// Vive bajo /calendario a propósito, no en una sección propia: la lista blanca
// de rutas se compara POR PREFIJO (lib/permisos-reglas.ts), así que colgar de
// ahí le da acceso a la instructora sin tocar los permisos. Y es lo correcto —
// hoy ya marca asistencia a mano en la pestaña Asistentes; esto solo le ahorra
// buscar el nombre en la lista.
//
// Dos formas de leer, porque la cámara falla más de lo que parece: cristal
// sucio, contraluz en la puerta, un Android viejo sin BarcodeDetector, o
// sencillamente que la clienta no encuentra el móvil. El código de seis
// caracteres no es el plan B: es la mitad del plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, XCircle, DoorOpen, QrCode } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { useStudio } from '@/lib/studio-context';

interface Resultado {
  ok: boolean;
  quien?: string;
  yaEstaba?: boolean;
  puerta?: 'abierta' | 'fallo' | 'sin-kisi';
  error?: string;
}

// `BarcodeDetector` es nativo en Chrome y Edge (escritorio y Android). **Safari
// NO lo implementa en ninguna versión**, y como en iOS todos los navegadores
// usan WebKit, en iPhone y iPad no existe — tampoco en "Chrome para iPhone".
// Firefox tampoco. Verificado 2026-07-30 tras probarlo en vivo; el comentario
// anterior decía "y Safari 17+" y era FALSO, escrito de memoria.
//
// Consecuencia real, no académica: el mostrador de un estudio de Pilates es un
// iPad con mucha frecuencia, así que en el dispositivo más probable la cámara
// NUNCA lee y el código de 6 caracteres deja de ser el plan B para ser el
// único plan. La pantalla tiene que estar a la altura de eso.
//
// No está en los tipos de TS, de ahí la declaración mínima.
interface DetectorCodigos {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opciones?: { formats?: string[] }) => DetectorCodigos;
  }
}

export default function LeerPasePage() {
  useParams();
  const { studio, dataLoaded } = useStudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Ya no hay estado «sin-soporte»: con el respaldo de jsQR la cámara lee en
  // cualquier navegador con `getUserMedia`. Lo único que puede faltar ahora es
  // el PERMISO, que sí es cosa de quien mira.
  const [camara, setCamara] = useState<'apagada' | 'pidiendo' | 'activa' | 'sin-permiso'>('apagada');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const ultimoLeido = useRef<string>('');

  const validar = useCallback(async (cuerpo: { token?: string; codigo?: string }) => {
    setEnviando(true);
    try {
      const res = await fetch('/api/checkin/pase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json().catch(() => null) as Resultado | null;
      setResultado(res.ok ? { ok: true, ...(data ?? {}) } : { ok: false, error: data?.error ?? 'No hemos podido leer el pase.' });
    } catch {
      setResultado({ ok: false, error: 'Sin conexión. Inténtalo otra vez.' });
    } finally {
      setEnviando(false);
    }
  }, []);

  const encender = useCallback(async () => {
    setCamara('pidiendo');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamara('activa');
    } catch {
      setCamara('sin-permiso');
    }
  }, []);

  // Bucle de lectura. Va con `requestAnimationFrame` y un detector reutilizado:
  // crear uno por fotograma es lo que convierte esto en un calentador de móvil.
  useEffect(() => {
    if (camara !== 'activa') return;
    // Nativo donde existe; donde no, jsQR sobre un canvas. NO es un capricho de
    // dependencia: Safari no implementa `BarcodeDetector` en NINGUNA versión y
    // en iOS todos los navegadores son WebKit, así que sin esto la cámara no
    // lee en iPhone ni en iPad — y el mostrador de un estudio suele ser un
    // iPad. Verificado en vivo el 2026-07-30: el lector se rendía y mandaba a
    // teclear el código a mano.
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const lienzo = detector ? null : document.createElement('canvas');
    const ctx = lienzo ? lienzo.getContext('2d', { willReadFrequently: true }) : null;
    let vivo = true;
    let ultimo = 0;

    const leerConJsQR = (video: HTMLVideoElement): string | null => {
      if (!lienzo || !ctx) return null;
      // Se decodifica a 480 px de ancho como mucho: a resolución completa el
      // bucle se come la CPU de una tablet y baja de 8 lecturas por segundo.
      const escala = Math.min(1, 480 / (video.videoWidth || 480));
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      if (!lienzo.width || !lienzo.height) return null;
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      return jsQR(datos.data, datos.width, datos.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };

    const mirar = async (ts: number) => {
      if (!vivo) return;
      // Ocho lecturas por segundo bastan de sobra y dejan el resto del tiempo
      // al navegador.
      if (ts - ultimo > 125 && videoRef.current && videoRef.current.readyState >= 2) {
        ultimo = ts;
        try {
          const valor = detector
            ? (await detector.detect(videoRef.current))[0]?.rawValue
            : leerConJsQR(videoRef.current);
          // El mismo QR sigue delante de la cámara muchos fotogramas seguidos:
          // sin esta guarda se dispararían decenas de peticiones por lectura.
          if (valor && valor !== ultimoLeido.current) {
            ultimoLeido.current = valor;
            void validar({ token: valor });
          }
        } catch { /* un fotograma ilegible no es un error */ }
      }
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
    return () => { vivo = false; };
  }, [camara, validar]);

  // Apagar la cámara al salir. Sin esto el piloto del móvil se queda encendido
  // y la instructora piensa que la estamos grabando — con razón.
  useEffect(() => () => {
    const s = videoRef.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
  }, []);

  const caja: React.CSSProperties = {
    background: 'var(--card, #fff)', border: '1px solid var(--border, #E7E7E0)', borderRadius: 18, padding: 20,
  };

  // Esta pantalla se alcanza por URL directa (favorito, atajo guardado en el
  // móvil de recepción) además de por el enlace del calendario — ese enlace ya
  // se oculta con el flag desactivado, pero si alguien llega aquí igual, mejor
  // explicarlo que dejar la cámara encendida sin ningún pase real que leer.
  if (dataLoaded && studio && !studio.requiereCheckinQr) {
    return (
      <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link href="/calendario" aria-label="Volver al calendario" className="p-2 -ml-2">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold">Leer un pase</h1>
        </div>
        <div style={caja} className="flex flex-col items-center gap-3 text-center py-10">
          <QrCode size={26} className="opacity-40" />
          <p className="text-sm font-semibold">El check-in por QR está desactivado</p>
          <p className="text-sm opacity-70">
            Este estudio da por asistida cada reserva confirmada al terminar la clase, sin pedir ningún pase.
            Puedes activarlo de nuevo en Configuración → Reservas y cancelaciones.
          </p>
          <Link href="/configuracion" className="text-sm font-bold underline mt-1">
            Ir a Configuración
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/calendario" aria-label="Volver al calendario" className="p-2 -ml-2">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Leer un pase</h1>
      </div>

      <div style={caja} className="flex flex-col gap-3">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {camara !== 'activa' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: 'var(--muted, #F1F1EC)' }}>
              <Camera size={26} className="opacity-60" />
              {camara === 'sin-permiso' && <p className="text-sm opacity-70">No nos has dado permiso para la cámara. Usa el código de abajo.</p>}
              {camara === 'apagada' && (
                <button type="button" onClick={encender} className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}>
                  Encender la cámara
                </button>
              )}
              {camara === 'pidiendo' && <p className="text-sm opacity-70">Pidiendo permiso…</p>}
            </div>
          )}
        </div>
        <p className="text-xs opacity-60 text-center">Apunta al código que te enseña la clienta en su móvil.</p>
      </div>

      <div style={caja} className="flex flex-col gap-3">
        <label htmlFor="codigo-pase" className="text-xs font-bold uppercase tracking-wide opacity-60">O teclea su código</label>
        <div className="flex gap-2">
          <input
            id="codigo-pase"
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase())}
            placeholder="A2C4E6"
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 px-4 py-3 rounded-xl text-lg tracking-[0.2em] font-bold"
            style={{ border: '1px solid var(--border, #E7E7E0)', background: 'var(--background, #fff)' }}
          />
          <button
            type="button"
            disabled={enviando || codigo.replace(/[\s-]/g, '').length < 6}
            onClick={() => void validar({ codigo })}
            className="px-5 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}
          >
            Marcar
          </button>
        </div>
      </div>

      {resultado && (
        <div
          role="status"
          style={{ ...caja, borderColor: resultado.ok ? '#2E7D46' : '#C0362D' }}
          className="flex items-start gap-3"
        >
          {resultado.ok
            ? <CheckCircle2 size={20} style={{ color: '#2E7D46', flexShrink: 0 }} />
            : <XCircle size={20} style={{ color: '#C0362D', flexShrink: 0 }} />}
          <div className="flex flex-col gap-1">
            {resultado.ok ? (
              <>
                <p className="font-bold">
                  {resultado.quien}{resultado.yaEstaba ? ' ya estaba dentro' : ' — dentro'}
                </p>
                {resultado.puerta === 'abierta' && (
                  <p className="text-xs opacity-70 inline-flex items-center gap-1.5"><DoorOpen size={14} />Puerta abierta</p>
                )}
                {resultado.puerta === 'fallo' && (
                  <p className="text-xs" style={{ color: '#A65A0A' }}>La asistencia está marcada, pero la puerta no ha respondido. Ábrela a mano.</p>
                )}
              </>
            ) : (
              <p className="text-sm">{resultado.error}</p>
            )}
            <button
              type="button"
              onClick={() => { setResultado(null); setCodigo(''); ultimoLeido.current = ''; }}
              className="text-xs font-bold underline self-start mt-1"
            >
              Leer otro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
