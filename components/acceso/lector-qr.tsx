'use client';

// La cámara que lee QR. Sacada del lector del panel (/calendario/pase) para que
// la use también la app de la instructora sin copiarla.
//
// Dos motores, porque la cámara falla más de lo que parece:
//
//  · `BarcodeDetector`, nativo en Chrome y Edge (escritorio y Android). **Safari
//    NO lo implementa en ninguna versión**, y en iOS todos los navegadores son
//    WebKit, así que en iPhone y iPad no existe — tampoco en «Chrome para
//    iPhone». Verificado el 2026-07-30 en vivo (el comentario anterior decía
//    «y Safari 17+» y era FALSO, escrito de memoria).
//  · jsQR sobre un canvas, en todos los demás. El mostrador de un estudio suele
//    ser un iPad: sin esto, en el dispositivo más probable la cámara nunca lee.

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface DetectorCodigos {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opciones?: { formats?: string[] }) => DetectorCodigos;
  }
}

export type EstadoCamara = 'apagada' | 'pidiendo' | 'activa' | 'sin-permiso';

/** El mismo QR vuelve a contar pasado este rato (otra alumna, o la misma otra vez). */
const REPETIR_TRAS_MS = 4000;

/**
 * `pausado` = hay un resultado en pantalla: la cámara sigue encendida (volver a
 * leer es instantáneo) pero no dispara lecturas nuevas.
 */
export function useLectorQr({ pausado, onLectura }: { pausado: boolean; onLectura: (valor: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camara, setCamara] = useState<EstadoCamara>('apagada');
  const ultimo = useRef<{ valor: string; en: number }>({ valor: '', en: 0 });
  const pausadoRef = useRef(pausado);
  const onLecturaRef = useRef(onLectura);
  useEffect(() => { pausadoRef.current = pausado; onLecturaRef.current = onLectura; });

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

  /** Tras cerrar un resultado: el mismo QR puede volver a leerse ya. */
  const olvidarUltimo = useCallback(() => { ultimo.current = { valor: '', en: 0 }; }, []);

  // Bucle de lectura con `requestAnimationFrame` y UN detector reutilizado:
  // crear uno por fotograma es lo que convierte esto en un calentador de móvil.
  useEffect(() => {
    if (camara !== 'activa') return;
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const lienzo = detector ? null : document.createElement('canvas');
    const ctx = lienzo ? lienzo.getContext('2d', { willReadFrequently: true }) : null;
    let vivo = true;
    let ultimoFotograma = 0;

    const leerConJsQR = (video: HTMLVideoElement): string | null => {
      if (!lienzo || !ctx) return null;
      // A 480 px de ancho como mucho: a resolución completa el bucle se come la
      // CPU de una tablet y baja de 8 lecturas por segundo.
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
      // Ocho lecturas por segundo bastan y dejan el resto al navegador.
      if (!pausadoRef.current && ts - ultimoFotograma > 125 && videoRef.current && videoRef.current.readyState >= 2) {
        ultimoFotograma = ts;
        try {
          const valor = detector
            ? (await detector.detect(videoRef.current))[0]?.rawValue
            : leerConJsQR(videoRef.current);
          const ahora = Date.now();
          // El mismo QR sigue delante de la cámara muchos fotogramas seguidos:
          // sin esta guarda saldrían decenas de peticiones por lectura.
          if (valor && (valor !== ultimo.current.valor || ahora - ultimo.current.en > REPETIR_TRAS_MS)) {
            ultimo.current = { valor, en: ahora };
            onLecturaRef.current(valor);
          }
        } catch { /* un fotograma ilegible no es un error */ }
      }
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
    return () => { vivo = false; };
  }, [camara]);

  // Apagar la cámara al salir. Sin esto el piloto se queda encendido y quien
  // escanea piensa que la estamos grabando — con razón.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      const s = video?.srcObject as MediaStream | null;
      s?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { videoRef, camara, encender, olvidarUltimo };
}
