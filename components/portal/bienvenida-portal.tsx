'use client';

// Pantalla de bienvenida a pantalla completa. Se muestra UNA vez por
// dispositivo, antes del login, para los temas que la piden (eje `bienvenida`
// de lib/theme-variantes.ts). Ver app/portal/[slug]/login/page.tsx (gate) y
// lib/portal-bienvenida.ts (lógica pura de "¿ya la vio?").
//
// Dos variantes, como el prototipo:
//  · `foto` — sobre la foto del estudio, lavada hacia el fondo (Editorial,
//    Oliva). Es lo que ya hacía antes de existir este eje.
//  · `marca` — sobre el color de marca, con la segunda línea del titular en el
//    color destacado (Bloom, Noir). Sin foto: los estudios que no han subido
//    ninguna son mayoría el primer día.
//
// El COPY sale del estudio, no del prototipo: sus frases ("Muévete con
// propósito") son de una maqueta de diseño, no de este producto.
//
// Una sola pantalla, no un wizard de varios pasos — el resto del contenido
// (horario, mis reservas, perfil...) ya vive en sus propias pantallas del
// portal, no hace falta reconstruirlo aquí.

import { useModo } from '@/lib/portal-modo';
import { display, texto, altura, radio, sombra, transicion, dur, escala } from '@/lib/portal-design';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { MARCA, MARCA_FG, MARCA_ETIQUETA } from '@/components/portal/acceso/piezas';

export function BienvenidaPortal({
  nombreEstudio, fotoUrl, onSiguiente, variante = 'foto',
}: {
  nombreEstudio: string; fotoUrl: string | null; onSiguiente: () => void;
  /** `foto` (default) = el look de siempre. Ver comentario de arriba. */
  variante?: 'foto' | 'marca';
}) {
  const { t } = useModo();
  const enMarca = variante === 'marca';

  if (enMarca) {
    return (
      <div style={{
        height: '100%', position: 'relative', overflow: 'hidden',
        background: MARCA, color: MARCA_FG,
      }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(255,255,255,.10) 0%, transparent 46%, rgba(0,0,0,.18) 100%)',
          }}
        />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
          padding: '0 24px calc(26px + env(safe-area-inset-bottom))',
        }}>
          {/* Dos líneas, la segunda en el acento — la forma del prototipo
              (el dorado de Noir, el contraste de Bloom). El acento cae a
              `--ap-verde-claro`, la etiqueta sobre oscuro del kit (mismo
              token que usa la portada de acceso). */}
          <h1 style={{ ...display(escala('bienvenida', 38), false, 1.08), marginBottom: 12 }}>
            Bienvenida a<br />
            <span style={{ color: MARCA_ETIQUETA }}>{nombreEstudio}</span>
          </h1>
          <p style={{ ...texto.meta, opacity: 0.86, marginBottom: 26 }}>
            Reserva tu clase, lleva tu bono y entra con el pase.
          </p>
          <button
            onClick={onSiguiente}
            style={{
              width: '100%', height: altura.botonAcceso,
              borderRadius: radio.pill,
              background: MARCA_FG, color: MARCA,
              border: 'none', cursor: 'pointer', padding: '0 8px 0 26px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: transicion(['transform']),
            }}
          >
            <span style={{ ...texto.boton }}>Siguiente</span>
            <span aria-hidden style={{
              width: 50, height: 50, borderRadius: '50%', background: MARCA,
              color: MARCA_FG, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 17, transition: transicion(['transform'], dur.color),
            }}>
              →
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: t.bg, color: t.ink }}>
      {/* Sin foto propia entra la de por defecto (vertical, pensada justo para
          esta pantalla a sangre). El `t.hero` de antes era el vacío que veía
          toda propietaria recién dada de alta. */}
      <div style={{ position: 'absolute', inset: 0, background: t.surface2 }}>
        {
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenDeEstudio('vertical', fotoUrl)}
            alt=""
            onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)', display: 'block' }}
          />
        }
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 34%, rgba(246,244,239,.96) 78%, rgba(246,244,239,1) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
          padding: '0 22px calc(22px + env(safe-area-inset-bottom))',
        }}
      >
        <h1 style={{ ...display(escala('bienvenida', 38), false, 1.08), color: t.ink, marginBottom: 10 }}>
          Empieza donde estás.
        </h1>
        <p style={{ ...texto.meta, color: t.muted, marginBottom: 24 }}>
          Reserva tu clase, lleva tu bono y entra con el pase — todo en {nombreEstudio}.
        </p>

        <button
          onClick={onSiguiente}
          style={{
            width: '100%', height: altura.botonAcceso, borderRadius: radio.hoja,
            background: '#FFFFFF', boxShadow: sombra.hojaAcceso,
            border: 'none', cursor: 'pointer', padding: '0 8px 0 26px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: transicion(['transform']),
          }}
        >
          <span style={{ ...texto.boton, color: t.ink }}>Siguiente</span>
          <span
            aria-hidden
            style={{
              width: 50, height: 50, borderRadius: '50%', background: MARCA,
              color: MARCA_FG, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 17, transition: transicion(['transform'], dur.color),
            }}
          >
            →
          </span>
        </button>
      </div>
    </div>
  );
}
