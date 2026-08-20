'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  puedeMostrar,
  leerRegistro,
  vistoEnEstaSesion,
  anotarVista,
  anotarCierre,
  anotarConversion,
} from '@/lib/landing/popup-frecuencia';

// El popup de «Empieza gratis» de la landing.
//
// La diferencia entre una invitación y un anuncio es CUÁNDO aparece, así que lo
// importante de este componente no es su aspecto sino sus disparadores:
//
//  · Nunca al entrar. Aparecer encima de alguien que todavía no ha leído el
//    titular es lo que hace que se cierre por reflejo, sin leerlo.
//  · Se enseña cuando ya ha demostrado interés: 30 segundos en la página, o
//    haber bajado más de la mitad. Lo que ocurra primero.
//  · No se enseña si ya está a punto de convertir por su cuenta — el pie de la
//    página ya tiene su propio CTA grande (SeccionCtaFinal), y saltarle un
//    modal justo ahí es interrumpir a quien iba a pulsar.
//  · Las reglas de repetición (una por sesión, silencio de 30 días al cerrar,
//    3 como máximo, nunca más si convierte) viven en lib/landing/popup-frecuencia.ts.

const SEGUNDOS_ANTES = 30;
const SCROLL_MINIMO = 0.5;
/** A partir de aquí ya está en el CTA final: no se le interrumpe. */
const SCROLL_DEMASIADO = 0.9;

export function PopupEmpezar() {
  const { session, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const yaSalio = useRef(false);
  const tituloId = useId();
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const antesDelPopup = useRef<Element | null>(null);

  const abrir = useCallback(() => {
    if (yaSalio.current) return;
    if (!puedeMostrar({
      registro: leerRegistro(),
      vistoEnEstaSesion: vistoEnEstaSesion(),
      autenticado: !!session,
      ahora: Date.now(),
    })) return;
    yaSalio.current = true;
    antesDelPopup.current = document.activeElement;
    anotarVista();
    setVisible(true);
  }, [session]);

  const cerrar = useCallback((convertido = false) => {
    if (convertido) anotarConversion();
    else anotarCierre();
    // Se anima la salida antes de desmontar. 180 ms es lo que dura la
    // animación de abajo; con `prefers-reduced-motion` el CSS global la deja
    // en 0,01 ms y el retardo es imperceptible.
    setCerrando(true);
    setTimeout(() => {
      setVisible(false);
      setCerrando(false);
      // El foco vuelve donde estaba. Sin esto, cerrar el modal deja el foco en
      // la nada y el teclado empieza otra vez desde arriba de la página.
      (antesDelPopup.current as HTMLElement | null)?.focus?.();
    }, 180);
  }, []);

  // Disparadores: tiempo y scroll, lo que llegue antes.
  useEffect(() => {
    if (loading || session) return;

    const porTiempo = setTimeout(abrir, SEGUNDOS_ANTES * 1000);

    const alHacerScroll = () => {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      if (alto <= 0) return;
      const recorrido = window.scrollY / alto;
      if (recorrido >= SCROLL_MINIMO && recorrido < SCROLL_DEMASIADO) abrir();
    };
    window.addEventListener('scroll', alHacerScroll, { passive: true });

    return () => {
      clearTimeout(porTiempo);
      window.removeEventListener('scroll', alHacerScroll);
    };
  }, [abrir, loading, session]);

  // Escape cierra, y el foco entra al modal al abrirse.
  useEffect(() => {
    if (!visible) return;
    cerrarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [visible, cerrar]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      style={{
        background: 'rgba(26,26,26,.42)',
        backdropFilter: 'blur(3px)',
        animation: `${cerrando ? 'pop-fondo-fuera' : 'pop-fondo-dentro'} .18s ease both`,
      }}
      onClick={() => cerrar()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[26rem] overflow-hidden rounded-3xl bg-card p-6 text-center shadow-[0_30px_70px_-20px_rgba(26,26,26,.5)] sm:p-8"
        style={{ animation: `${cerrando ? 'pop-hoja-fuera' : 'pop-hoja-dentro'} .26s cubic-bezier(.16,1,.3,1) both` }}
      >
        {/* Halo de marca detrás del contenido. Decorativo y muy suave: lo que
            tiene que destacar es el botón, no el fondo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(90,97,66,.16), transparent 65%)' }}
        />

        <button
          ref={cerrarRef}
          type="button"
          onClick={() => cerrar()}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X size={17} aria-hidden="true" />
        </button>

        <div className="relative">
          <h2 id={tituloId} className="px-6 text-[24px] font-extrabold leading-tight tracking-tight text-foreground sm:px-4 sm:text-[27px]">
            Empieza gratis en 2 minutos
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">
            Sin tarjeta de crédito • Configuración en 2 minutos
          </p>

          <Link
            href="/crear-estudio"
            onClick={() => cerrar(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[16px] font-bold text-brand-foreground transition-all duration-200 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            Empezar gratis
            <ArrowRight size={17} aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={() => cerrar()}
            className="mt-3 w-full py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Ahora no
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pop-fondo-dentro { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop-fondo-fuera  { from { opacity: 1 } to { opacity: 0 } }
        @keyframes pop-hoja-dentro {
          from { opacity: 0; transform: translateY(18px) scale(.96) }
          to   { opacity: 1; transform: none }
        }
        @keyframes pop-hoja-fuera {
          from { opacity: 1; transform: none }
          to   { opacity: 0; transform: translateY(10px) scale(.98) }
        }
      `}</style>
    </div>
  );
}
