'use client';

// La BIENVENIDA en la vista previa del editor.
//
// ⚠️ Es la pantalla que menos se podía mirar y la que más falta hacía ver: es
// lo PRIMERO que ve una socia, cambia con el tema (`variantes.bienvenida`), y
// hasta ahora la única forma de comprobarla era publicarla — o sea, enseñársela
// antes a las clientas que a la propietaria. El editor listaba Inicio, Clases,
// Bonos, Reservas y Perfil, y esta no. Lo pidió el fundador después de que la
// pantalla morada de Bloom no fuera la que esperaba.
//
// Monta el MISMO `BienvenidaPortal` que la pantalla de acceso de verdad, con
// los mismos datos del estudio: no hay una segunda versión que pueda mentir.
// La variante sale de `useStudio()`, que ya prefiere el borrador del editor
// sobre lo publicado (`variantesEfectivas`) — así se ve lo que se está
// probando, no lo que ya está fuera.

import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { texto } from '@/lib/portal-design';
import { BienvenidaPortal } from './bienvenida-portal';

export function PortalPreviewBienvenidaClient() {
  const { studio, variantes } = useStudio();
  const { t } = useModo();

  // `ninguna` es una elección válida del tema: ese portal entra directo al
  // acceso. Decirlo es mejor que enseñar un marco vacío y que parezca roto.
  if (variantes.bienvenida === 'ninguna') {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 28px', textAlign: 'center', background: t.bg,
      }}>
        <p style={{ ...texto.nota, color: t.muted }}>
          Este tema entra directo al acceso, sin pantalla de bienvenida.
        </p>
      </div>
    );
  }

  return (
    <BienvenidaPortal
      nombreEstudio={studio?.nombre?.trim() || 'Tu estudio'}
      fotoUrl={studio?.fotoUrl ?? null}
      variante={variantes.bienvenida === 'marca' ? 'marca' : 'foto'}
      // En la previsualización el botón no lleva a ninguna parte: lo que se
      // mira es esta pantalla. Navegar dentro del iframe sacaría del preview.
      onSiguiente={() => {}}
    />
  );
}
