'use client';

// El control de imagen del panel: miniatura, subir un archivo, o pegar un
// enlace.
//
// Existía ya, pero solo para los campos `tipo: 'imagen'` de los bloques del
// portal (dentro del Inspector). Los cinco sitios escritos a mano —logo,
// favicon, foto del portal, imagen para compartir y foto de una clase— tenían
// cada uno su propia versión, todas con el mismo botón de subir y ninguna con
// el «o pegar un enlace» que el Inspector sí tenía. Esto es ese control, en un
// solo sitio.
//
// ⚠️ La miniatura enseña la foto POR DEFECTO cuando no hay ninguna propia, no
// un cartel de «Sin imagen»: es lo que están viendo las alumnas ahora mismo, y
// esconderlo aquí le haría creer a la propietaria que su portal está vacío
// cuando no lo está. El botón sigue diciendo «Subir…» — la foto no es suya.

import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { normalizarUrlImagen } from '@/lib/imagen-url';
import { alFallarImagen } from '@/lib/imagenes-por-defecto';

// Escritas enteras y no con `object-${ajuste}`: Tailwind lee las clases del
// código fuente, y una interpolada no existe hasta que corre el navegador —
// se quedaría fuera del CSS y la miniatura saldría deformada.
const AJUSTE = { cover: 'object-cover', contain: 'object-contain' } as const;

export function CampoImagen({
  etiqueta,
  valor,
  respaldo,
  onSubir,
  onCambiar,
  ocupado = false,
  ajuste = 'cover',
  clasePreview = 'w-16 h-10',
  textoSubir = 'Subir imagen',
  textoCambiar = 'Cambiar imagen',
  ayuda,
}: {
  /** Para los `aria-label`. No se pinta: el título ya lo pone quien llama. */
  etiqueta: string;
  /** Lo que hay guardado hoy. `null`/'' = no ha puesto ninguna. */
  valor: string | null | undefined;
  /** La foto por defecto, para que la miniatura enseñe lo que se ve de verdad. */
  respaldo?: string;
  onSubir: (file: File) => Promise<{ url: string } | { error: string }>;
  /** `null` = quitar la suya y volver a la de por defecto. */
  onCambiar: (url: string | null) => void | Promise<void>;
  /** Estado de carga de quien llama (cada panel lleva ya el suyo). */
  ocupado?: boolean;
  /** `contain` para el logo, que no se puede recortar. */
  ajuste?: 'cover' | 'contain';
  clasePreview?: string;
  textoSubir?: string;
  textoCambiar?: string;
  ayuda?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [verEnlace, setVerEnlace] = useState(false);
  const [enlace, setEnlace] = useState('');
  const propia = !!(valor ?? '').trim();
  const enPantalla = propia ? (valor as string).trim() : respaldo;
  const enlaceListo = normalizarUrlImagen(enlace);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Se limpia SIEMPRE el input: sin esto, elegir el mismo fichero dos veces
    // seguidas (tras un error, que es justo cuando se reintenta) no dispara
    // `change` y parece que el botón se ha quedado muerto.
    e.target.value = '';
    if (!file) return;
    setError('');
    const r = await onSubir(file);
    if ('error' in r) { setError(r.error); return; }
    await onCambiar(r.url);
  }

  async function alUsarEnlace() {
    if (!('url' in enlaceListo)) { setError(enlaceListo.error); return; }
    setError('');
    await onCambiar(enlaceListo.url);
    setEnlace('');
    setVerEnlace(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`${clasePreview} rounded-lg border border-border bg-muted overflow-hidden shrink-0 flex items-center justify-center`}>
          {enPantalla ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enPantalla}
              alt={propia ? etiqueta : `${etiqueta} — foto por defecto`}
              className={`w-full h-full ${AJUSTE[ajuste]}`}
              onError={respaldo ? alFallarImagen(respaldo) : undefined}
            />
          ) : (
            <span className="text-[9px] text-muted-foreground text-center px-1">Sin imagen</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={ocupado}
          className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border disabled:opacity-50"
        >
          <Upload size={14} /> {ocupado ? 'Subiendo…' : propia ? textoCambiar : textoSubir}
        </button>

        {propia && !ocupado && (
          <button
            type="button"
            onClick={() => onCambiar(null)}
            aria-label={`Quitar ${etiqueta}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={16} />
          </button>
        )}

        <input ref={ref} type="file" accept="image/*" hidden onChange={alElegir} aria-label={`Archivo de ${etiqueta}`} />
      </div>

      <button
        type="button"
        onClick={() => { setVerEnlace((v) => !v); setError(''); }}
        className="text-[11px] text-muted-foreground underline mt-1.5"
      >
        {verEnlace ? 'Ocultar el enlace' : 'o pegar un enlace'}
      </button>

      {verEnlace && (
        <div className="mt-1.5 space-y-1.5">
          <input
            className="w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background"
            value={enlace}
            placeholder="https://…"
            onChange={(e) => { setEnlace(e.target.value); setError(''); }}
            // Enter guarda: pegar un enlace y tener que buscar el botón es un
            // paso de más en el gesto más obvio del formulario.
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void alUsarEnlace(); } }}
            aria-label={`Enlace de ${etiqueta}`}
          />
          {/* Previsualización ANTES de guardar: un enlace que no carga se ve
              aquí, no en el portal de las alumnas. */}
          {'url' in enlaceListo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enlaceListo.url}
              alt=""
              className={`${clasePreview} rounded-lg border border-border ${AJUSTE[ajuste]}`}
              // Avisa, pero no bloquea: puede que el enlace no cargue aquí y sí
              // en otro sitio. Lo que hay que decirle es qué pasa si lo guarda
              // igualmente, no impedírselo.
              onError={() => setError('Ese enlace no carga aquí. Comprueba que la imagen sea pública — si la guardas así, tus alumnas verán la foto por defecto.')}
            />
          )}
          <button
            type="button"
            onClick={alUsarEnlace}
            disabled={!('url' in enlaceListo)}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
          >
            Usar este enlace
          </button>
        </div>
      )}

      {error && <span className="text-[11px] text-destructive block mt-1">{error}</span>}
      {ayuda}
    </div>
  );
}
