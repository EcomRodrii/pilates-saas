'use client';

import { useCallback, useEffect, useState } from 'react';
import { getQrAcceso } from '@/lib/student/qr-acceso';
import { qrSvgMarkup } from '@/lib/qr-svg';
import { brilloAlMaximo } from '@/lib/nativo/puente';

// El QR de acceso de la alumna: la caja blanca que lee la cámara y el hook que
// lo trae. Lo comparten Perfil → QR de acceso y el detalle de una reserva, para
// que la alumna vea SIEMPRE el mismo QR, esté donde esté.

export type EstadoQr = 'cargando' | 'listo' | 'error' | 'apagado';

export function useQrAcceso(slug: string, activo: boolean) {
  // `activo` puede llegar en falso y encenderse después (el detalle de una
  // reserva sabe si está activa cuando carga): el estado se deriva abajo.
  const [estado, setEstado] = useState<EstadoQr>('cargando');
  const [qr, setQr] = useState<string | null>(null);

  const cargar = useCallback(async (regenerar = false) => {
    const r = await getQrAcceso(slug, { regenerar });
    // Si falla al CAMBIARLO, el de ahora sigue en pantalla: o no se llegó a
    // revocar, o al volver a entrar verá el nuevo. Nunca un hueco por eso.
    if (!r) { if (!regenerar) setEstado('error'); return false; }
    if (!r.activo) { setEstado('apagado'); setQr(null); return false; }
    setQr(r.qr);
    setEstado('listo');
    return true;
  }, [slug]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void getQrAcceso(slug).then(r => {
      if (!vivo) return;
      if (!r) setEstado('error');
      else if (!r.activo) setEstado('apagado');
      else { setQr(r.qr); setEstado('listo'); }
    });
    return () => { vivo = false; };
  }, [slug, activo]);

  return {
    estado: activo ? estado : 'apagado' as EstadoQr,
    qr,
    reintentar: () => { setEstado('cargando'); void cargar(); },
    regenerar: () => cargar(true),
  };
}

/**
 * La caja del QR. Blanca SOLO cuando hay QR que leer: la cámara necesita el
 * contraste, y un cuadrado blanco vacío es la cara de una imagen rota. Sin QR,
 * un hueco del mismo tamaño (nada salta al llegar) con el porqué dentro.
 */
export function CajaQr({ qr, estado, tamano = 168, onReintentar }: {
  qr: string | null; estado: EstadoQr; tamano?: number; onReintentar?: () => void;
}) {
  const hay = estado === 'listo' && !!qr;
  // En miniatura (la fila de Perfil) no cabe ninguna frase: el hueco va vacío.
  const mini = tamano < 90;
  return (
    <div
      data-testid={hay ? 'qr-acceso' : 'qr-acceso-hueco'}
      style={{
        width: tamano, height: tamano, margin: mini ? 0 : '0 auto', flexShrink: 0, boxSizing: 'border-box',
        background: hay ? '#fff' : 'transparent',
        border: hay ? 'none' : '1.5px dashed var(--accent-deep-muted)',
        borderRadius: mini ? 10 : 18, padding: hay ? Math.round(tamano * 0.07) : mini ? 0 : 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {hay ? (
        <div
          style={{ width: '100%', height: '100%' }}
          // Marcado que construye `lib/qr-svg.ts` a partir del token opaco: no es HTML de usuario.
          // El SVG ya es `role="img"` con su nombre: el envoltorio no repite ninguno.
          dangerouslySetInnerHTML={{ __html: qrSvgMarkup(qr, { etiqueta: 'Tu código QR de acceso' }) }}
        />
      ) : mini ? null : (
        <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-deep-foreground)', lineHeight: 1.5 }}>
          {estado === 'error' ? (
            <>
              No hemos podido cargar tu QR.{' '}
              {onReintentar && (
                <button type="button" onClick={onReintentar} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
                  Reintentar
                </button>
              )}
            </>
          ) : 'Preparando tu QR…'}
        </p>
      )}
    </div>
  );
}

/**
 * Mientras se enseña el QR dentro de la app de iOS, la pantalla a tope de
 * brillo: el lector del estudio lo lee a la primera. Al salir de la pantalla
 * (o si el QR deja de estar), vuelve el brillo que había. En la web no hace nada.
 */
export function useBrilloAlMaximo(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    let restaurar: (() => Promise<void>) | null = null;
    let vivo = true;
    void brilloAlMaximo().then((r) => { if (vivo) restaurar = r; else void r(); });
    return () => { vivo = false; void restaurar?.(); };
  }, [activo]);
}
