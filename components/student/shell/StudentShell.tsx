'use client';

import { useNoLeidas } from '@/lib/student/no-leidas';
import { useEstudio } from '@/components/student/contexto';

import type { CSSProperties, ReactNode } from 'react';
import { EsqueletoTarjetas, GuardiaSesion, useGuardiaSesion } from '@/components/student/GuardiaSesion';
import { PreguntasAlta } from '@/components/student/PreguntasAlta';
import { ScriptEnLinea } from '@/components/student/ui/ScriptEnLinea';
import { GuardiaInstructora } from '@/components/student/GuardiaInstructora';
import { StudioHeader } from './StudioHeader';
import { BottomNavigation } from './BottomNavigation';
import { OfflineBanner } from './OfflineBanner';

/**
 * Marco de toda pantalla autenticada. Del paquete (`components/shell/AppShell.tsx`).
 *
 * Dos diferencias con el paquete, las dos deliberadas:
 *
 *  · No llama a `aplicarTema()` en un efecto. El tema se inyecta en SERVIDOR
 *    (`app/portal/[slug]/layout.tsx` → `lib/student/tema.ts`), que es lo que
 *    evita que la primera pintura salga con la paleta de referencia y cambie
 *    a la vista de la alumna. Ver el DESIGN CONFLICT documentado en tema.ts.
 *
 *  · `noLeidas` y `badgeReservas` llegan por prop desde la pantalla, no de un
 *    contexto global. En el paquete son constantes de demostración; aquí cada
 *    pantalla pasa lo que ya ha cargado, y si no tiene el dato pasa 0 en vez
 *    de disparar una consulta propia solo para pintar un punto.
 *
 * Envuelve en `GuardiaSesion`: toda pantalla que use este marco exige sesión.
 * Las de acceso no lo usan — tienen su propio layout, precisamente porque son
 * las únicas a las que se llega sin haber entrado. La única excepción es
 * `vistaPrevia` (solo Inicio), y solo dentro de la vista previa del panel.
 *
 * `modo="instructora"` es el mismo marco para las pantallas de la instructora
 * (`/equipo/**`): una sola app para las dos (decisión del 14-sep-2026). Cambia
 * la guardia —exige ser instructora de este estudio— y los destinos de la barra.
 *
 * `sinNav` quita la barra inferior — mismo criterio que cualquier chat real
 * (WhatsApp, iMessage): dentro de una conversación no hay tabs debajo, solo
 * el compositor. No es solo estético: `BottomNavigation` es `position: fixed`
 * calculada contra `--nav-height`, y un compositor TAMBIÉN fijo intentando
 * flotar justo encima de ella es lo que se rompía de verdad al abrir el
 * teclado en iOS Safari — los dos elementos fijos se separan del viewport
 * visual y acaban flotando a mitad de pantalla, por encima del teclado. Con
 * `sinNav`, la pantalla que lo pide pasa a controlar su propio alto completo
 * (`.page` sin el padding inferior reservado para la nav) y puede poner su
 * compositor en el flujo normal en vez de en `position: fixed`.
 */
export function StudentShell({
  children,
  noLeidas = 0,
  badgeReservas = 0,
  headerTransparente = false,
  conLema = false,
  sinNav = false,
  modo = 'alumna',
  vistaPrevia = false,
  heroe,
}: {
  children: ReactNode;
  noLeidas?: number;
  badgeReservas?: number;
  headerTransparente?: boolean;
  /** Pinta el lema del estudio bajo su nombre. Solo sobre un héroe. */
  conLema?: boolean;
  sinNav?: boolean;
  modo?: 'alumna' | 'instructora';
  /** Se deja ver sin sesión dentro de la vista previa del panel. Ver `GuardiaSesion`. */
  vistaPrevia?: boolean;
  /**
   * La portada de Inicio. Con ella, la cabecera y la portada se pintan SIN
   * esperar a la guardia (van en el HTML): ver `ShellConHeroe`.
   */
  heroe?: ReactNode;
}) {
  if (heroe && modo === 'alumna') {
    return (
      <ShellConHeroe heroe={heroe} noLeidas={noLeidas} badgeReservas={badgeReservas}
        headerTransparente={headerTransparente} conLema={conLema} sinNav={sinNav} vistaPrevia={vistaPrevia}>
        {children}
      </ShellConHeroe>
    );
  }
  return (
    <ShellConGuardia noLeidas={noLeidas} badgeReservas={badgeReservas} headerTransparente={headerTransparente}
      conLema={conLema} sinNav={sinNav} modo={modo} vistaPrevia={vistaPrevia}>
      {children}
    </ShellConGuardia>
  );
}

interface PropsMarco {
  children: ReactNode;
  noLeidas: number;
  badgeReservas: number;
  headerTransparente: boolean;
  conLema: boolean;
  sinNav: boolean;
  vistaPrevia: boolean;
}

// Si en ESTE dispositivo no hay sesión de alumna (ni en localStorage ni en
// sessionStorage, que es donde la deja `lib/db/portal-almacen-sesion.ts`), marca
// el marco antes de pintar y el CSS (student.css) deja a la vista solo el
// esqueleto, sin cabecera ni portada: quien no ha
// entrado sigue sin ver la app antes del acceso (ver `GuardiaSesion`). Dentro de
// un marco (la vista previa del panel) no marca nada: allí se ve sin sesión.
// Si el almacenamiento no se deja leer, tampoco hay sesión que valga: la guardia
// manda a entrar igual que siempre.
const MARCAR_SIN_SESION = `(function(){try{var m=document.currentScript&&document.currentScript.parentElement;if(!m||window.self!==window.top)return;var k='sb-portal-auth';if(window.localStorage.getItem(k)||window.sessionStorage.getItem(k))return;m.setAttribute('data-sin-sesion','');}catch(e){}})();`;

/**
 * Inicio: cabecera y portada en el HTML, sin esperar a la sesión.
 *
 * Antes la guardia tapaba la pantalla ENTERA hasta que respondía
 * `/api/public/session`, aunque la marca y la portada ya venían del servidor:
 * con 4G, unos 2,5 s de pantalla en blanco (medido en producción el
 * 30-sep-2026). Ahora la guardia decide solo lo de debajo, y la portada no se
 * vuelve a montar al resolverse (misma posición en el árbol): ni se vuelve a
 * pedir ni repite su animación.
 *
 * El precio, aceptado por el fundador el 30-sep-2026: quien va de camino a otra
 * pantalla (una instructora a `/equipo`, alguien con preguntas del alta o una
 * invitación pendiente, un token caducado) ve un instante la portada antes de
 * irse. Quien no tiene sesión en el dispositivo NO la ve: el script de arriba.
 * Las preguntas del alta siguen ocupando la pantalla entera.
 */
function ShellConHeroe({ heroe, children, noLeidas, badgeReservas, headerTransparente, conLema, sinNav, vistaPrevia }: PropsMarco & { heroe: ReactNode }) {
  const { estudio } = useEstudio();
  const sinLeer = useNoLeidas(estudio.id);
  const { esperando, conPreguntas, completarPreguntas } = useGuardiaSesion(vistaPrevia);
  if (conPreguntas) return <PreguntasAlta estado={conPreguntas} onCompletada={completarPreguntas} />;
  const estiloPage: CSSProperties = {};
  if (headerTransparente) estiloPage.paddingTop = 0;
  if (sinNav) estiloPage.paddingBottom = 'var(--safe-bottom)';
  return (
    // `suppressHydrationWarning`: el script puede haberle puesto `data-sin-sesion`.
    <div className="shell" suppressHydrationWarning>
      <ScriptEnLinea js={MARCAR_SIN_SESION} />
      <StudioHeader noLeidas={noLeidas || sinLeer} transparente={headerTransparente} conLema={conLema} />
      <main className="page" style={Object.keys(estiloPage).length ? estiloPage : undefined} aria-busy={esperando || undefined}>
        <OfflineBanner />
        {heroe}
        {esperando ? <div className="px esqueleto-inicio"><EsqueletoTarjetas /></div> : children}
      </main>
      {!sinNav && !esperando && <BottomNavigation badgeReservas={badgeReservas} modo="alumna" />}
      <div id="student-portal-host" />
    </div>
  );
}

function ShellConGuardia({ children, noLeidas, badgeReservas, headerTransparente, conLema, sinNav, modo, vistaPrevia }: PropsMarco & { modo: 'alumna' | 'instructora' }) {
  // El punto de la campana era una rama muerta: ninguna pantalla pasaba
  // `noLeidas`. Lo pide el marco, una vez y compartido. Una pantalla puede
  // seguir pasándolo explícitamente y entonces manda el suyo.
  const { estudio } = useEstudio();
  const sinLeer = useNoLeidas(estudio.id);
  const estiloPage: CSSProperties = {};
  if (headerTransparente) estiloPage.paddingTop = 0;
  if (sinNav) estiloPage.paddingBottom = 'var(--safe-bottom)';
  const contenido = (
    <div className="shell">
      <StudioHeader noLeidas={noLeidas || sinLeer} transparente={headerTransparente} conLema={conLema} />
      <main className="page" style={Object.keys(estiloPage).length ? estiloPage : undefined}>
        <OfflineBanner />
        {children}
      </main>
      {!sinNav && <BottomNavigation badgeReservas={badgeReservas} modo={modo} />}
      {/* Anfitrión de las hojas (`Sheet`). Existe por dos motivos a la vez, y
          hacen falta LOS DOS:
            · fuera de `main`, para que ningún `.a-up` —cuyo `transform`
              queda en matriz identidad al terminar— le robe el
              `position: fixed`;
            · DENTRO de `.student-app`, porque todo el kit está scopeado ahí
              (`.student-app .pill`, `.student-app .t-h2`, y los tokens de
              color del estudio). Al portar a `document.body` la hoja salía
              bien colocada y COMPLETAMENTE sin estilo: texto plano, sin
              píldoras, sin el tono de la marca. */}
      <div id="student-portal-host" />
    </div>
  );
  return modo === 'instructora'
    ? <GuardiaInstructora>{contenido}</GuardiaInstructora>
    : <GuardiaSesion vistaPrevia={vistaPrevia}>{contenido}</GuardiaSesion>;
}
