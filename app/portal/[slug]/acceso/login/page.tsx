'use client';

import { useSearchParams } from 'next/navigation';
import { usePortalHref, useEstudio } from '@/components/student/contexto';
import { PuertaDeEntrada } from '@/components/student/acceso/PuertaDeEntrada';

/**
 * Entrar en el estudio (P08, 5-oct-2026): tu correo y un código de 6 cifras en
 * casillas, como la entrada de la app Tentare. La contraseña pasa a segunda
 * opción («Usar mi contraseña») y Google y Apple siguen al lado.
 *
 * Antes era «Hola de nuevo» con email y contraseña, también para quien llegaba
 * por primera vez, y «mándame un enlace» cuando el correo ya solo traía un
 * código. Dónde queda cada cosa de la pantalla de antes:
 *  · email + contraseña, «Recordar sesión» y «¿Has olvidado la contraseña?» →
 *    «Usar mi contraseña»;
 *  · «No tengo contraseña — mándame un enlace» → «Seguir», que manda el código;
 *  · «Crear cuenta» → el mismo «Seguir»: el código da de alta, y a la nueva se
 *    le piden sus datos y la privacidad del estudio después (`/acceso/registro`);
 *  · «Continuar con Google» y Apple, igual.
 */
export default function LoginPage() {
  const params = useSearchParams();
  const { estudio } = useEstudio();
  const href = usePortalHref();

  // `?next=` conserva a dónde iba la alumna antes de que le pidieran entrar.
  // Se valida que sea una ruta de ESTE estudio: sin eso, un `?next=` externo
  // convierte la pantalla de acceso en un redirector abierto.
  const destino = (() => {
    const n = params.get('next');
    return n && n.startsWith(href() + '/') ? n : href();
  })();

  return (
    <PuertaDeEntrada
      titulo={`Entra en ${estudio.nombre}`}
      subtitulo="Te mandamos un código a tu correo. Si es tu primera vez, te damos de alta con él."
      destino={destino}
    />
  );
}
