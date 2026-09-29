// La foto de una clase con su velo, y encima el nivel, el nombre y los chips
// (F4 del rediseño «/reservar = estilo de la app de la alumna», 29-sep-2026).
//
// Es la cabecera de la ficha de la app de la alumna
// (components/student/domain/FichaClaseHero.tsx) ADAPTADA, no importada: aquella
// vive dentro de `StudentProvider` y de student.css, que fuera de /portal no
// existen. La comparten la ficha de /reservar (reserva-calendario.tsx) y «Tus
// datos» y el pago (pantalla-reserva.tsx), para que la misma clase se vea igual
// en los dos pasos del mismo camino.
//
// ⚠️ Solo estilos EN LÍNEA: reserva-calendario.tsx también lo compila esbuild
// para el widget nativo, que no tiene Tailwind ni PostCSS, y una clase nueva
// habría que duplicarla en app/widget-bundle/widget.css.
//
// Los colores fijos son los de lo que va SOBRE LA FOTO —la foto es la foto en
// los ocho estilos y en Carbón, así que lo que se lee encima tampoco cambia—, y
// su contraste está medido contra el peor píxel posible en
// lib/reservar/ficha-clase.test.ts. La forma sí es la del estudio: el radio de
// la foto lo pasa quien llama y el de los chips es el de los botones del widget
// (`--reservar-radio-boton`).

import type { CSSProperties, ReactNode, Ref } from 'react';
import { pesoTitular, sans, serif } from '@/lib/reservar-publico-tokens';
import {
  BORDE_CRISTAL_SOBRE_FOTO, CRISTAL_SOBRE_FOTO, FONDO_SIN_FOTO, TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO, TINTA_SUAVE_SOBRE_FOTO,
} from '@/lib/reservar/portada';
import { BOTON_SOBRE_FOTO, FUNDIDO_TEXTO_FICHA, fundidoTextoFichaCss, veloFichaCss } from '@/lib/reservar/ficha-clase';

/** Un chip de cristal sobre la foto («Hoy · 10:00», «50 min», «6 plazas»). */
export const estiloChipSobreFoto: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '0 10px',
  borderRadius: 'var(--reservar-radio-boton, 999px)',
  background: CRISTAL_SOBRE_FOTO, border: `1px solid ${BORDE_CRISTAL_SOBRE_FOTO}`, color: TINTA_SOBRE_FOTO,
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  fontFamily: sans, fontSize: 12, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap',
};

/**
 * El botón redondo de volver o de cerrar, arriba sobre la foto. 44 px: es lo que
 * se toca con el pulgar. Redondo siempre —como un avatar—, con la forma que
 * tenga el estudio: es un icono, no un botón de texto.
 */
export const estiloBotonSobreFoto: CSSProperties = {
  width: 44, height: 44, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: BOTON_SOBRE_FOTO, color: TINTA_SOBRE_CREMA,
  boxShadow: '0 6px 16px -8px rgba(0,0,0,.5)',
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
};

export function HeroeClase({
  foto, alto, radio, antetitulo, titulo, nivelTitulo, tituloId, tituloRef, tamanoTitulo, chips,
  arribaIzquierda, arribaDerecha,
}: {
  /** La imagen, ya montada por quien llama (cada pantalla resuelve la suya). Ocupa el recuadro entero. */
  foto: ReactNode;
  alto: number | string;
  radio: number | string;
  /** El nivel de la clase, en versales encima del nombre. Vacío = no se pinta. */
  antetitulo?: string | null;
  titulo: string;
  /**
   * `1` en «Tus datos» (la clase ES el título de esa pantalla: la portada no se
   * pinta mientras se reserva) y `2` en la ficha, que vive debajo del `h1` de
   * la página.
   */
  nivelTitulo: 1 | 2;
  tituloId?: string;
  /** La ficha le lleva el foco al abrirse (ver `BookingSheet`). */
  tituloRef?: Ref<HTMLHeadingElement>;
  tamanoTitulo: number | string;
  chips: readonly string[];
  arribaIzquierda?: ReactNode;
  arribaDerecha?: ReactNode;
}) {
  const estiloTitulo: CSSProperties = {
    margin: antetitulo ? '3px 0 0' : 0,
    fontFamily: serif, fontWeight: pesoTitular(800), fontSize: tamanoTitulo,
    lineHeight: 1.08, letterSpacing: '-.02em', color: TINTA_SOBRE_FOTO,
    overflowWrap: 'break-word', textWrap: 'balance',
    // El foco se lo da el código al abrir la ficha, para que el lector de
    // pantalla empiece por aquí; no es un control, así que sin anillo.
    outline: 'none',
  };
  return (
    <div style={{
      position: 'relative', height: alto, borderRadius: radio, overflow: 'hidden', flexShrink: 0,
      // Sin foto (o mientras carga), una tinta detrás: el texto es crema y sobre
      // el fondo claro de la página no se leería. La misma de la portada.
      background: FONDO_SIN_FOTO, color: TINTA_SOBRE_FOTO,
      // Su propio contexto de apilado: el cristal de los chips (`backdrop-filter`)
      // y el botón de arriba no se mezclan con nada de fuera.
      isolation: 'isolate',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>{foto}</div>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: veloFichaCss() }} />
      {arribaIzquierda && <div style={{ position: 'absolute', top: 12, left: 12 }}>{arribaIzquierda}</div>}
      {arribaDerecha && <div style={{ position: 'absolute', top: 12, right: 12 }}>{arribaDerecha}</div>}
      {/* El fundido va pegado al texto y crece con él: ver FUNDIDO_TEXTO_FICHA. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: `${FUNDIDO_TEXTO_FICHA.entrada}px 16px 14px`,
        background: fundidoTextoFichaCss(),
      }}>
        {antetitulo && (
          <p style={{
            margin: 0, fontFamily: sans, fontSize: 11, fontWeight: 700, lineHeight: 1.3,
            letterSpacing: '.12em', textTransform: 'uppercase', color: TINTA_SUAVE_SOBRE_FOTO,
          }}>
            {antetitulo}
          </p>
        )}
        {nivelTitulo === 1
          ? <h1 id={tituloId} ref={tituloRef} tabIndex={tituloRef ? -1 : undefined} style={estiloTitulo}>{titulo}</h1>
          : <h2 id={tituloId} ref={tituloRef} tabIndex={tituloRef ? -1 : undefined} style={estiloTitulo}>{titulo}</h2>}
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {chips.map((c, i) => <span key={i} style={estiloChipSobreFoto}>{c}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
