'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Ponle tu logo» — el cierre de las pantallas de valor.
//
// ⚠️ POR QUÉ EXISTE. El criterio del fundador era que «nombre + logo bastan»
// para terminar el onboarding… y el logo NO SE PEDÍA EN NINGÚN SITIO. El alta
// solo recoge el nombre, y el asistente pregunta once cosas de las que ninguna
// es la marca. La propietaria acababa entrando al panel con el checklist
// diciéndole «personaliza tu marca» como tarea pendiente el primer día.
//
// ⚠️ POR QUÉ AQUÍ Y NO COMO UNA PREGUNTA MÁS DEL ASISTENTE. Ese asistente es un
// motor de botones de opción con auto-avance y atajos de teclado numéricos: un
// paso que en vez de opciones necesita un selector de archivo no encaja sin
// romperle el modelo (y el manejador de teclado). Aquí es React normal.
//
// Se puede saltar, como todo lo demás. Un logo no es un requisito para usar el
// producto; es lo que hace que su página de reservas y sus correos dejen de
// parecer de otra empresa.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { subirLogoEstudio } from '@/lib/portal-storage';

export function PasoLogo({
  studioId,
  studioNombre,
  logoActual,
  onGuardar,
}: {
  studioId: string;
  studioNombre: string;
  logoActual: string | null;
  /** Persiste la URL en `studios.logo_url`. Lo hace el llamador porque es quien
   *  tiene el contexto del estudio; aquí solo se sube el fichero. */
  onGuardar: (url: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(logoActual);

  const elegir = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      const r = await subirLogoEstudio(studioId, file);
      if ('error' in r) { setError(r.error); return; }
      setUrl(r.url);
      await onGuardar(r.url);
    } catch {
      // Mensaje en la voz del producto: qué ha pasado y qué hacer, sin
      // disculparse y sin un código que no le dice nada a nadie.
      setError('No hemos podido subir la imagen. Prueba otra vez o hazlo luego desde Configuración.');
    } finally {
      setSubiendo(false);
    }
  }, [studioId, onGuardar]);

  return (
    <div style={{ width: '100%', maxWidth: 430 }}>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
        style={{ display: 'none' }}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={subiendo}
        style={{
          width: '100%', minHeight: 168,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'var(--valor-superficie)',
          border: `1.5px dashed ${url ? 'var(--valor-marca)' : 'var(--valor-linea)'}`,
          borderRadius: 16, cursor: subiendo ? 'progress' : 'pointer',
          padding: 18, fontFamily: 'inherit',
        }}
      >
        {subiendo ? (
          <>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--valor-marca)' }} aria-hidden />
            <span style={{ fontSize: 13, color: 'var(--valor-tenue)' }}>Subiendo…</span>
          </>
        ) : url ? (
          <>
            {/* `<img>` y no next/image: la URL sale de Supabase Storage con un
                `?v=` de cache-busting y no está en `remotePatterns`. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Logo de ${studioNombre}`}
              style={{ maxHeight: 84, maxWidth: '100%', objectFit: 'contain' }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--valor-marca)', fontWeight: 600 }}>
              Cambiar el logo
            </span>
          </>
        ) : (
          <>
            <ImagePlus size={24} style={{ color: 'var(--valor-marca)' }} aria-hidden />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--valor-tinta)' }}>
              Elige tu logo
            </span>
            <span style={{ fontSize: 12, color: 'var(--valor-tenue)', textAlign: 'center', lineHeight: 1.45 }}>
              PNG, JPG, WebP o SVG, hasta 2 MB.<br />Si tiene fondo transparente, mejor.
            </span>
          </>
        )}
      </button>

      {error && (
        <p role="alert" style={{ margin: '9px 2px 0', fontSize: 12, color: 'var(--valor-aviso)', lineHeight: 1.45 }}>
          {error}
        </p>
      )}
      <p style={{ margin: '10px 2px 0', fontSize: 12.5, color: 'var(--valor-tenue)', lineHeight: 1.45 }}>
        Sale en tu página de reservas, en la app de tus alumnas y en los correos que reciben.
      </p>
    </div>
  );
}
