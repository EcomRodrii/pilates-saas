'use client';

// La cabecera de la página suelta /reservar/[slug] (F3 del rediseño «/reservar
// = estilo de la app de la alumna», 29-sep-2026).
//
// El lenguaje es el de la cabecera de la app de sus alumnas
// (components/student/shell/StudioHeader.tsx): su marca a la izquierda —logo o
// inicial, nombre y, discreta debajo, la ciudad— y a la derecha lo mínimo.
// Dos caras, igual que allí:
//
//   · `sobreFoto`: flota sobre la portada, en crema y con botones «de cristal».
//     Los colores fijos salen de lib/reservar/portada.ts, con su test de
//     contraste contra el peor píxel de foto posible.
//   · Sin foto (la portada oculta, o la ficha, el acceso, los datos y el pago):
//     sobre el fondo de la página, con los tokens `--portal-*` de siempre y
//     «Acceder» en el color de la marca.
//
// ⚠️ Qué se fue de la barra, y adónde: el teléfono y «Mis reservas» en el
// móvil pasan al menú. En 390 px la barra de antes partía «Mis reservas» en
// dos líneas y bajaba «Acceder» a una segunda fila; aquí la regla es una fila
// siempre, con el nombre del estudio recortándose si hace falta. En escritorio
// «Mis reservas» sigue a la vista (sitio hay), y el teléfono también va al
// menú: el pie ya lo enseña, y en la barra competía con la marca.
//
// Nunca se monta en el widget incrustado (`embed=1`): allí la web del estudio
// ya tiene su cabecera, y la página pinta la suya compacta de siempre.

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Phone, X } from 'lucide-react';
import { cq, sans } from '@/lib/reservar-publico-tokens';
import { inicialDe } from '@/lib/monograma-estudio';
import {
  ANCHO_PAGINA, BORDE_CRISTAL_SOBRE_FOTO, CRISTAL_SOBRE_FOTO, TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO, TINTA_SUAVE_SOBRE_FOTO,
} from '@/lib/reservar/portada';
import { alFallarImagenServida } from '@/lib/imagenes-por-defecto';
import { urlServida } from '@/lib/student/imagen-servida';

/** El margen lateral de la página: el mismo que las pestañas, el contenido y el pie. */
export const MARGEN_PAGINA = cq(20, 3.8, 48);

/** Alto de los controles de la barra. 42 y no los 46 de antes: la barra entera mide menos, y sigue por encima de los 24 px de WCAG 2.5.8. */
const ALTO_CONTROL = 42;

/** Una entrada del menú «Más secciones» que cambia de pestaña. */
export interface EntradaMenu {
  id: string;
  label: string;
  activa: boolean;
  onElegir: () => void;
}

export interface NavegacionCabecera {
  /** Citas, El estudio, Mi cuenta… las que el estudio tenga activas. */
  secciones: readonly EntradaMenu[];
  misReservas: { cuantas: number; onAbrir: () => void };
  telefono: string | null;
}

export function CabeceraReservar({
  nombre, ciudad, logoUrl, sobreFoto, navegacion, socia, onAcceder, onCerrarSesion,
}: {
  nombre: string;
  ciudad: string | null | undefined;
  logoUrl: string | null;
  sobreFoto: boolean;
  /**
   * `null` mientras se ve una reserva (la ficha, el acceso, los datos, el
   * pago): ahí la barra se queda con la marca y el acceso. Es lo que ya hacía
   * la de antes, y lo que vigila e2e/reservar-p6-callejones-y-doble-alta.spec.ts.
   */
  navegacion: NavegacionCabecera | null;
  socia: { nombre: string } | null;
  onAcceder: () => void;
  onCerrarSesion: () => void;
}) {
  const tinta = sobreFoto ? TINTA_SOBRE_FOTO : 'var(--portal-ink)';
  const tintaSuave = sobreFoto ? TINTA_SUAVE_SOBRE_FOTO : 'var(--portal-muted)';
  // Los botones «secundarios»: cristal sobre la foto, tarjeta sin ella.
  const secundario: CSSProperties = sobreFoto
    ? {
      background: CRISTAL_SOBRE_FOTO, border: `1px solid ${BORDE_CRISTAL_SOBRE_FOTO}`, color: TINTA_SOBRE_FOTO,
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    }
    : { background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', color: 'var(--portal-ink)' };
  // «Acceder»: en el color de la marca sobre el fondo de la página. Sobre la
  // foto va de cristal, como el resto: la acción principal de la portada es
  // «Ver el horario», y dos píldoras rellenas competirían entre sí.
  const primario: CSSProperties = sobreFoto
    ? secundario
    : { background: 'var(--portal-brand)', border: '1px solid var(--portal-brand)', color: 'var(--portal-brand-foreground)' };
  const pildora: CSSProperties = {
    height: ALTO_CONTROL, padding: '0 16px', borderRadius: 999,
    display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
    fontFamily: sans, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
  };
  const cuantas = navegacion?.misReservas.cuantas ?? 0;
  // En escritorio el menú puede quedarse vacío (sin más pestañas ni teléfono):
  // «Mis reservas» ya está en la barra. En el móvil nunca, porque la lleva él.
  const menuSoloMovil = !!navegacion && navegacion.secciones.length === 0 && !navegacion.telefono;

  return (
    <header
      style={{
        maxWidth: ANCHO_PAGINA, marginInline: 'auto',
        padding: `calc(${cq(12, 1.6, 20)} + env(safe-area-inset-top, 0px)) ${MARGEN_PAGINA} ${sobreFoto ? cq(6, 0.8, 10) : cq(12, 1.4, 16)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        color: tinta,
      }}
    >
      {/* ⚠️ `minWidth: 0` en toda la cadena: sin él, un nombre largo empuja los
          botones fuera de la pantalla en vez de recortarse (medido en la app de
          la alumna a 320 px, StudioHeader.tsx). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <MarcaEstudio logoUrl={logoUrl} nombre={nombre} sobreFoto={sobreFoto} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{
            fontFamily: sans, fontSize: 15, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {nombre}
          </span>
          {ciudad && (
            <span style={{
              fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase',
              lineHeight: 1.2, color: tintaSuave, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {ciudad}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {navegacion && (
          <button
            type="button"
            onClick={navegacion.misReservas.onAbrir}
            className="reservar-solo-ancho reservar-boton reservar-foco"
            style={{ ...pildora, ...secundario }}
          >
            Mis reservas
            {cuantas > 0 && (
              <>
                <span aria-hidden="true" style={insignia(sobreFoto)}>{cuantas}</span>
                <span className="sr-only">, {cuantas} {cuantas === 1 ? 'próxima' : 'próximas'}</span>
              </>
            )}
          </button>
        )}

        {socia ? (
          // Quién ha entrado: su inicial y, en escritorio, su nombre. En el
          // móvil solo la inicial —con el nombre, el del estudio se quedaba en
          // cuatro letras—; el lector de pantalla lo oye entero siempre.
          <div style={{ ...pildora, ...secundario, padding: '0 4px 0 6px', gap: 8, cursor: 'default' }}>
            <span aria-hidden="true" style={{
              width: 30, height: 30, borderRadius: 999, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontSize: 12, fontWeight: 800,
            }}>
              {inicialDe(socia.nombre)}
            </span>
            <span aria-hidden="true" className="reservar-solo-ancho" style={{ fontWeight: 600, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {socia.nombre.split(' ')[0]}
            </span>
            <span className="sr-only">Has entrado como {socia.nombre}</span>
            <button
              type="button"
              onClick={onCerrarSesion}
              aria-label="Cerrar sesión"
              className="reservar-foco"
              style={{
                width: 32, height: 32, borderRadius: 999, border: 'none', background: 'transparent', color: tintaSuave,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onAcceder} className="reservar-boton reservar-foco" style={{ ...pildora, ...primario }}>
            Acceder
          </button>
        )}

        {navegacion && (
          <MenuSecciones
            navegacion={navegacion}
            soloMovil={menuSoloMovil}
            estiloBoton={secundario}
            sobreFoto={sobreFoto}
          />
        )}
      </div>
    </header>
  );
}

/** El numerito de «Mis reservas». Sobre la foto, crema: la marca de un estudio oscuro no se distinguiría del cristal. */
function insignia(sobreFoto: boolean): CSSProperties {
  return {
    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10.5, fontWeight: 800, lineHeight: 1,
    background: sobreFoto ? TINTA_SOBRE_FOTO : 'var(--portal-brand)',
    color: sobreFoto ? TINTA_SOBRE_CREMA : 'var(--portal-brand-foreground)',
  };
}

/** A partir de esta proporción un logo es un lockup apaisado (el mismo umbral que la app de la alumna). */
const PROPORCION_LOGO_APAISADO = 3.2;
const LADO_MARCA = 36;

/**
 * Su logo, o su inicial sobre el color de su marca. Un logo apaisado (el
 * logotipo con el nombre al lado) se pinta como una raya a este tamaño y
 * además repetiría el nombre, que va escrito justo al lado: pasa a la inicial,
 * igual que en la app (`MarcaEstudio` de StudioHeader.tsx). La proporción solo
 * se sabe al cargar, así que hasta entonces se pinta el logo.
 */
function MarcaEstudio({ logoUrl, nombre, sobreFoto }: { logoUrl: string | null; nombre: string; sobreFoto: boolean }) {
  const [apaisado, setApaisado] = useState<{ src: string; si: boolean } | null>(null);
  const esApaisado = apaisado?.src === logoUrl && apaisado.si;
  if (logoUrl && !esApaisado) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        // Al doble de su lado (pantallas retina), no el original de 1.280 px.
        src={urlServida(logoUrl, LADO_MARCA * 2)}
        onError={alFallarImagenServida(logoUrl)}
        // Decorativo: el nombre va escrito justo al lado. Con `alt` se leía dos veces.
        alt=""
        decoding="async"
        width={LADO_MARCA}
        height={LADO_MARCA}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          setApaisado({ src: logoUrl, si: h > 0 && w / h > PROPORCION_LOGO_APAISADO });
        }}
        style={{
          width: LADO_MARCA, height: LADO_MARCA, flexShrink: 0, padding: 3, borderRadius: 10,
          // Un logo se diseña sobre blanco: su propio fondo, en los ocho estilos.
          objectFit: 'contain', background: '#FFFFFF',
          boxShadow: sobreFoto ? '0 1px 4px rgba(0,0,0,.28)' : '0 0 0 1px var(--portal-line)',
        }}
      />
    );
  }
  return (
    <span aria-hidden="true" style={{
      width: LADO_MARCA, height: LADO_MARCA, flexShrink: 0, borderRadius: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
      fontFamily: sans, fontSize: 15, fontWeight: 800,
      boxShadow: sobreFoto ? `0 0 0 1.5px ${BORDE_CRISTAL_SOBRE_FOTO}` : 'none',
    }}>
      {/* Mientras llega el estudio el nombre está vacío, y `inicialDe` daría
          «?»: el disco se queda liso ese instante. */}
      {nombre.trim() ? inicialDe(nombre) : null}
    </span>
  );
}

/** Los elementos del menú que se ven ahora (el de «Mis reservas» solo existe en el móvil). */
function entradasVisibles(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(el => el.offsetParent !== null);
}

/**
 * «Más secciones»: Citas, El estudio y Mi cuenta —las que el estudio tenga—,
 * más «Mis reservas» en el móvil y el teléfono del estudio.
 *
 * Un botón y un `<div role="menu">` en vez de un `<select>`: cada opción lleva
 * su estado activo y el teléfono es un enlace, que un `<select>` no permite.
 *
 * ⚠️ El menú se porta a `document.body` con `position: fixed`, calculado desde
 * el botón: la caja de la cabecera y la portada lleva `overflow: hidden` (la
 * foto de la portada se recorta en ella) y cualquier hijo `absolute` se
 * cortaba en su borde — encontrado en producción con el menú de antes.
 *
 * Teclado (patrón «menu button» de WAI-ARIA): al abrir, el foco va a la
 * primera opción; flechas, Inicio y Fin la mueven; Escape y Tab cierran y
 * devuelven el foco al botón.
 */
function MenuSecciones({ navegacion, soloMovil, estiloBoton, sobreFoto }: {
  navegacion: NavegacionCabecera;
  soloMovil: boolean;
  estiloBoton: CSSProperties;
  sobreFoto: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const { secciones, misReservas, telefono } = navegacion;

  useEffect(() => {
    if (!abierto) return;
    // `preventScroll`: el menú es fijo y ya está a la vista; sin esto, algún
    // navegador desplaza la página al enfocar y el menú se despega del botón.
    entradasVisibles(menuRef.current)[0]?.focus({ preventScroll: true });
    function fuera(e: PointerEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    }
    // Calculado al abrir: si la página se mueve, el menú se quedaría flotando
    // lejos de su botón. Se cierra, que es lo que se espera de un desplegable.
    function alMoverse() { setAbierto(false); }
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('resize', alMoverse);
    window.addEventListener('scroll', alMoverse, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', fuera);
      window.removeEventListener('resize', alMoverse);
      window.removeEventListener('scroll', alMoverse);
    };
  }, [abierto]);

  function abrir() {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    // `clientWidth` y no `innerWidth`: el `right` de un fijo se mide sin la
    // barra de desplazamiento, y con `innerWidth` el menú salía corrido.
    setRect({ top: r.bottom + 8, right: document.documentElement.clientWidth - r.right });
    setAbierto(true);
  }

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) btnRef.current?.focus();
  }

  function alTeclado(e: KeyboardEvent<HTMLDivElement>) {
    const items = entradasVisibles(menuRef.current);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const ir = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length].focus(); };
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); cerrar(true); }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label="Más secciones"
        onClick={() => (abierto ? cerrar(false) : abrir())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !abierto) { e.preventDefault(); abrir(); } }}
        className={`reservar-boton reservar-foco${soloMovil ? ' reservar-solo-movil' : ''}`}
        style={{
          position: 'relative', width: ALTO_CONTROL, height: ALTO_CONTROL, borderRadius: 999, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          ...estiloBoton,
        }}
      >
        <Menu size={18} aria-hidden="true" />
        {/* En el móvil «Mis reservas» vive aquí dentro: si tiene alguna próxima,
            un punto lo dice sin abrir el menú. En escritorio ya lo dice su botón. */}
        {misReservas.cuantas > 0 && (
          <span
            aria-hidden="true"
            className="reservar-solo-movil"
            style={{
              position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 99,
              background: sobreFoto ? TINTA_SOBRE_FOTO : 'var(--portal-brand)',
              boxShadow: sobreFoto ? 'none' : '0 0 0 2px var(--portal-surface)',
            }}
          />
        )}
      </button>

      {abierto && rect && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={idMenu}
          role="menu"
          aria-label="Más secciones"
          onKeyDown={alTeclado}
          className="reservar-menu"
          style={{
            position: 'fixed', top: rect.top, right: rect.right, zIndex: 100,
            minWidth: 220, maxWidth: 'calc(100vw - 24px)', padding: 6,
            display: 'flex', flexDirection: 'column', gap: 2,
            background: 'var(--portal-surface)', color: 'var(--portal-ink)',
            border: '1px solid var(--portal-line)', borderRadius: 16,
            boxShadow: '0 18px 40px -16px rgba(15,15,15,.35)', fontFamily: sans,
          }}
        >
          <button
            type="button"
            role="menuitem"
            // El foco vuelve al botón del menú y no se pierde en el `body` al
            // desmontarse la opción (la hoja que se abre lo toma si lo necesita).
            onClick={() => { cerrar(true); misReservas.onAbrir(); }}
            className="reservar-menu-item reservar-solo-movil"
            style={ITEM}
          >
            <span style={{ flex: 1 }}>Mis reservas</span>
            {misReservas.cuantas > 0 && (
              <>
                <span aria-hidden="true" style={insignia(false)}>{misReservas.cuantas}</span>
                <span className="sr-only">, {misReservas.cuantas} {misReservas.cuantas === 1 ? 'próxima' : 'próximas'}</span>
              </>
            )}
          </button>
          {secciones.map(s => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              aria-current={s.activa ? 'page' : undefined}
              onClick={() => { cerrar(true); s.onElegir(); }}
              className="reservar-menu-item"
              style={{ ...ITEM, fontWeight: s.activa ? 800 : 600 }}
            >
              {s.label}
            </button>
          ))}
          {telefono && (
            <>
              <div
                role="separator"
                className={secciones.length === 0 ? 'reservar-solo-movil' : undefined}
                style={{ height: 1, margin: '4px 10px', background: 'var(--portal-line)' }}
              />
              {/* El número a la vista y en el nombre accesible (WCAG 2.5.3):
                  quien lo dicta por voz dice lo que ve. */}
              <a
                role="menuitem"
                href={`tel:${telefono.replace(/\s+/g, '')}`}
                aria-label={`Llamar al ${telefono}`}
                onClick={() => cerrar(false)}
                className="reservar-menu-item"
                style={{ ...ITEM, color: 'var(--portal-muted)' }}
              >
                <Phone size={15} aria-hidden="true" />
                <span style={{ color: 'var(--portal-ink)', fontVariantNumeric: 'tabular-nums' }}>{telefono}</span>
              </a>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Una opción del menú. 44 px de alto: es lo que se toca con el pulgar en el
 * móvil (antes medían 34). El fondo NO va aquí sino en la clase
 * `.reservar-menu-item` (app/globals.css), para que el `:hover` y la activa
 * puedan pintarlo — un `background` en línea les ganaría.
 */
const ITEM: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 12px',
  borderRadius: 10, border: 'none', color: 'var(--portal-ink)',
  fontFamily: sans, fontSize: 14, fontWeight: 600, textAlign: 'left', textDecoration: 'none', cursor: 'pointer',
};
