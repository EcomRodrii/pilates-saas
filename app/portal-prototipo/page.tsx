'use client';

// Referencia visual viva del prototipo "Tentare Studio App", montado tal cual
// (components/prototipo/StudioApp.jsx). NO es el portal real — el portal real
// es app/portal/[slug]. Esto existe para poder comparar pantalla a pantalla
// contra la implementación sin abrir un .html suelto en Downloads.
//
// Los datos son los de demo del prototipo, no los del estudio: nada de lo que
// se toque aquí escribe en ninguna parte.
//
// La ruta cuelga de `/portal-*` a propósito: PREFIJOS_NO_INDEXABLES usa
// semántica de prefijo de CADENA (lib/seo/paginas.ts), así que `/portal` ya
// cubre esta ruta igual que cubre `/portal-preview` — sin tocar el registro.

import dynamic from 'next/dynamic';

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
}`;

export default function PortalPrototipoPage() {
  return (
    <div className="prototipo-lienzo">
      <style>{CSS_LIENZO}</style>
      <div className="prototipo-marco">
        <StudioApp />
      </div>
    </div>
  );
}
