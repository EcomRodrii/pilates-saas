'use client';

import { useRef, useState } from 'react';
import { subirFoto, quitarFoto } from '@/lib/student/foto-perfil';
import { motivoFotoInvalida } from '@/lib/foto-perfil-regla';
import { Button } from '@/components/student/ui/Button';

// La foto de perfil de la alumna.
//
// Antes no había ninguna forma de poner una: el avatar era siempre las
// iniciales. Las funciones de subida existían, pero subían con el cliente del
// panel — desde esta app la RLS las habría rechazado. Ver `lib/student/foto-perfil.ts`.
//
// ⚠️ Se enseña una PREVISUALIZACIÓN local en cuanto elige el archivo, antes de
// que termine la subida, y se REVIERTE si el servidor dice que no. Sin eso, la
// alumna elige una foto y no pasa nada visible durante segundos en móvil.
export function FotoPerfil({ studioId, url, iniciales, onCambio }: {
  studioId: string;
  /** La que tiene ahora, o `null` si nunca puso ninguna. */
  url: string | null;
  iniciales: string;
  onCambio: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mostrada = previa ?? url;

  const elegir = async (file: File | undefined) => {
    if (!file || subiendo) return;
    setError(null);
    // Se comprueba antes de enseñar nada: una previsualización de algo que va a
    // ser rechazado es peor que decirlo ya.
    const malo = motivoFotoInvalida(file.type, file.size);
    if (malo) { setError(malo); return; }

    const local = URL.createObjectURL(file);
    setPrevia(local);
    setSubiendo(true);
    const r = await subirFoto(studioId, file);
    setSubiendo(false);
    URL.revokeObjectURL(local);

    if (r.ok) { setPrevia(null); onCambio(r.url); return; }
    // Se revierte: dejar la previsualización sería enseñarle una foto que no
    // está guardada en ninguna parte.
    setPrevia(null);
    setError(r.error);
  };

  const quitar = async () => {
    if (subiendo) return;
    setError(null);
    setSubiendo(true);
    const r = await quitarFoto(studioId);
    setSubiendo(false);
    if (r.ok) { onCambio(null); return; }
    setError(r.error ?? 'No hemos podido quitar la foto.');
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-3)', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={subiendo}
        aria-label={mostrada ? 'Cambiar tu foto' : 'Añadir una foto'}
        data-testid="avatar-boton"
        className="avatar tap tap--icono"
        style={{
          ['--size' as string]: '96px',
          border: 'none', padding: 0, position: 'relative',
          // ⚠️ `.avatar` recorta (`overflow: hidden`) para que una foto de
          // fondo no se salga del círculo. El distintivo de editar va PEGADO
          // al borde y sobresale a propósito, así que con el recorte salía
          // cortado por la mitad. Se ve en la captura, no en los tipos.
          overflow: 'visible',
          cursor: subiendo ? 'progress' : 'pointer',
          opacity: subiendo ? 0.6 : 1,
          transition: 'opacity .2s',
        }}
      >
        {/* La foto va en una capa propia PORQUE el botón ya no recorta: sin
            esto, un fondo con imagen se saldría del círculo. */}
        {mostrada && (
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0, borderRadius: 'var(--radius-pill)',
              background: `url(${mostrada}) center/cover`,
            }}
          />
        )}
        {!mostrada && iniciales}
        {/* El indicador de que se puede tocar. Sin él, un círculo con iniciales
            no se lee como un control. */}
        <span
          aria-hidden
          style={{
            position: 'absolute', right: 0, bottom: 0, width: 30, height: 30,
            borderRadius: 'var(--radius-pill)', background: 'var(--primary)',
            color: 'var(--primary-foreground)', fontSize: 'var(--t-small)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--background)',
          }}
        >
          ✎
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
      />

      {subiendo && <p className="t-meta" role="status">Guardando tu foto…</p>}

      {!subiendo && url && (
        <Button variant="secondary" size="sm" onClick={() => void quitar()}>Quitar la foto</Button>
      )}

      {error && (
        <p role="alert" className="note note--warn" data-testid="foto-error">{error}</p>
      )}
    </div>
  );
}
