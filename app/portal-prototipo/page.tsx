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

export default function PortalPrototipoPage() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#E9E7DE',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      {/* 390×844 es el lienzo con el que se diseñó el prototipo (iPhone 14).
          Fuera de esa medida los valores literales dejan de cuadrar. */}
      <div style={{
        width: 390, height: 844, position: 'relative', overflow: 'hidden',
        borderRadius: 44, boxShadow: '0 30px 80px -20px rgba(15,15,15,.45)', flex: '0 0 auto',
      }}>
        <StudioApp />
      </div>
    </div>
  );
}
