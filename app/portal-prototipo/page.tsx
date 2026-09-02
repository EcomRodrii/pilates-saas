'use client';

// Referencia visual viva del prototipo "Tentare Studio App", montado tal cual
// (components/prototipo/StudioApp.jsx). NO es el portal real — el portal real
// es app/portal/[slug]. Esto existe para poder comparar pantalla a pantalla
// contra la implementación sin abrir un .html suelto en Downloads.
//
// Los datos son los de demo del prototipo, no los del estudio: nada de lo que
// se toque aquí escribe en ninguna parte.
//
// ⚠️ Pide sesión. No porque haya nada que proteger —los datos son inventados—
// sino porque es una MAQUETA colgando del dominio de producción, y cualquiera
// con el enlace se la encontraba sin más. Basta con estar identificado: no se
// pide rol, que sería prometer un control que esta pantalla no necesita.
//
// La guardia es de CLIENTE, y eso es una limitación real, no un descuido: en
// este repo la sesión del panel vive SOLO en localStorage, nunca en cookie
// (lib/auth-server-action.ts lo documenta, verificado en producción el
// 2026-08-25), así que un Server Component no puede leerla y no hay forma de
// decidir esto en servidor sin rearquitecturar la autenticación. Mismo
// criterio que app/interno/layout.tsx, cuyo comentario dice literalmente que
// su guardia es «de USABILIDAD, no de seguridad». Quien quiera el bundle lo
// tiene igual; lo que se corta es la visita casual.
//
// La ruta cuelga de `/portal-*` a propósito: PREFIJOS_NO_INDEXABLES usa
// semántica de prefijo de CADENA (lib/seo/paginas.ts), así que `/portal` ya
// cubre esta ruta igual que cubre `/portal-preview` — sin tocar el registro.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

// `ssr: false`: el prototipo es una clase de React con estado propio y estilos
// en línea pensada para navegador, nunca para render en servidor.
const StudioApp = dynamic(() => import('@/components/prototipo/StudioApp'), { ssr: false });

// El prototipo se diseñó sobre un lienzo FIJO de 390×844 (iPhone 14) y sus
// medidas son literales, así que no se estira: fuera de esa medida los valores
// dejan de cuadrar. De ahí las dos presentaciones:
//
//  - En pantalla ancha se enseña ese lienzo exacto, enmarcado como un teléfono.
//  - En un teléfono real (≤437px) el marco sobra y encima NO CABE: a 375–390px
//    el lienzo se salía por los dos lados (medido: izquierda −7px, derecha
//    383px con el viewport en 382px) y recortaba contenido. Ahí ocupa la
//    pantalla entera, que es exactamente como se vería la app de verdad.
//
// Se prefiere esto a escalar con `transform`: el ancho del móvil real ya está
// a un 4% del lienzo de diseño, así que la app se coloca sola con su propio
// layout en vez de verse un 96% empequeñecida.
const CSS_LIENZO = `
.prototipo-lienzo{min-height:100dvh;background:#E9E7DE;display:flex;align-items:center;justify-content:center;padding:24px}
.prototipo-marco{position:relative;flex:0 0 auto;width:390px;height:844px;overflow:hidden;border-radius:44px;box-shadow:0 30px 80px -20px rgba(15,15,15,.45)}
@media (max-width:437px){
.prototipo-lienzo{padding:0}
.prototipo-marco{width:100vw;height:100dvh;border-radius:0;box-shadow:none}
.prototipo-aviso{margin:24px}
}
.prototipo-aviso{max-width:340px;text-align:center;font-family:var(--font-jakarta),system-ui,sans-serif;color:#1A1A1A}
.prototipo-aviso-titulo{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em}
.prototipo-aviso-texto{margin:10px 0 0;font-size:13.5px;line-height:1.55;color:#5A5A52}
.prototipo-aviso-boton{display:inline-flex;align-items:center;justify-content:center;margin-top:22px;height:46px;padding:0 26px;border-radius:23px;background:#1A1A1A;color:#F1ECE1;font-size:13.5px;font-weight:700;text-decoration:none}
@media (hover:hover){.prototipo-aviso-boton:hover{background:#000}}
.prototipo-aviso-boton:active{transform:scale(.97)}`;

export default function PortalPrototipoPage() {
  const { user, loading } = useAuth();

  return (
    <div className="prototipo-lienzo">
      <style>{CSS_LIENZO}</style>
      {loading ? (
        // Sin texto: `loading` dura un parpadeo y anunciar «comprobando
        // sesión» daría un salto de contenido peor que el propio hueco.
        <div className="prototipo-marco" aria-busy="true" />
      ) : user ? (
        <div className="prototipo-marco">
          <StudioApp />
        </div>
      ) : (
        <div className="prototipo-aviso">
          <p className="prototipo-aviso-titulo">Referencia de diseño</p>
          <p className="prototipo-aviso-texto">
            Es la maqueta navegable de la app de la socia, con datos de ejemplo.
            Entra con tu cuenta para verla.
          </p>
          <Link href="/login" className="prototipo-aviso-boton">Entrar</Link>
        </div>
      )}
    </div>
  );
}
