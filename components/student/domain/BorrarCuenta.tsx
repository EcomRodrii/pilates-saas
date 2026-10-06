'use client';

import { useState } from 'react';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { Input } from '@/components/student/ui/Input';
import { useOnline } from '@/lib/student/useOnline';
import { useAuthStudent } from '@/lib/student/auth';
import { borrarCuentaTentare } from '@/lib/student/cuenta';
import { PALABRA_BORRAR_CUENTA, confirmaBorrarCuenta } from '@/lib/cuenta/borrar-cuenta';
import { esAppNativa } from '@/lib/nativo/puente';

// «Borrar mi cuenta de Tentare» (App Store 5.1.1(v)), al final de «Privacidad y
// datos» (decisión del fundador, 4-oct: es ahí donde se busca), en la web y en la
// app. Borra la CUENTA al momento; no es la solicitud al estudio de que borre sus
// datos, que está en la misma pantalla, justo encima.
// El texto dice lo que pasa de verdad: los estudios se quedan con su ficha y con
// lo que la ley les obliga a guardar.
export function BorrarCuenta({ slug, nombreEstudio, hrefLogin }: {
  slug: string; nombreEstudio: string; hrefLogin: string;
}) {
  const { online } = useOnline();
  const { olvidarCuentaBorrada } = useAuthStudent(slug);
  const [abierta, setAbierta] = useState(false);
  const [palabra, setPalabra] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');
  const [borrada, setBorrada] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const abrir = () => { setPalabra(''); setError(''); setAbierta(true); };
  const ok = confirmaBorrarCuenta(palabra);

  const borrar = async () => {
    if (!ok || borrando) return;
    if (!online) { setError('Necesitas conexión para borrar tu cuenta.'); return; }
    setBorrando(true); setError('');
    const r = await borrarCuentaTentare(palabra);
    setBorrando(false);
    if (!r.ok) { setError(r.error); return; }
    setBorrada(true);
  };

  // ⚠️ La sesión se cierra AL SALIR de la hoja, no al borrar: cerrarla dispara la
  // guardia de la app (`GuardiaSesion`), que se lleva a la alumna al acceso del
  // estudio por su cuenta — en la app de iOS ganaba a la ida a `/app` y la hoja
  // de «borrada» no llegaba a verse. Navegación completa y no `router`: no queda
  // nada en memoria de una cuenta que ya no existe.
  const salir = async () => {
    if (saliendo) return;
    setSaliendo(true);
    await olvidarCuentaBorrada();
    // En la app de iOS, a la entrada de Tentare; en la web, al acceso de este estudio.
    window.location.replace(esAppNativa() ? '/app' : hrefLogin);
  };

  const cerrar = () => {
    if (borrada) { void salir(); return; }
    if (!borrando) { setAbierta(false); setPalabra(''); setError(''); }
  };

  const p = { margin: '8px 0 0', fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 } as const;

  return (
    <>
      <ProfileSection items={[{ label: 'Borrar mi cuenta de Tentare', onClick: abrir, destructivo: true }]} />

      {/* Montada solo tras un «sí» del servidor: una hoja cerrada sigue en el DOM,
          y un «se ha borrado» escondido no puede estar ahí antes de que lo sea. */}
      {borrada && (
        <ConfirmationDialog
          open={abierta}
          onClose={cerrar}
          titulo="Tu cuenta de Tentare se ha borrado"
          cuerpo="Ya no podrás entrar con ella en ningún estudio."
          confirmar="Entendido"
          cancelar={null}
          loading={saliendo}
          onConfirm={() => void salir()}
        />
      )}

      <ConfirmationDialog
        open={abierta && !borrada}
        onClose={cerrar}
        titulo="¿Borrar tu cuenta de Tentare?"
        confirmar="Borrar mi cuenta"
        tono="danger"
        loading={borrando}
        deshabilitado={!ok}
        onConfirm={() => void borrar()}
      >
        {/* Solo abierta: la hoja cerrada sigue en el DOM (fuera de pantalla). */}
        {abierta && !borrada && (
          <>
            <div style={{ marginTop: 4 }}>
              <p style={p}>Se borra al momento y ya no podrás entrar con ella en ningún estudio.</p>
              <p style={p}>
                {nombreEstudio}, y cualquier otro estudio en el que estés, conserva tu ficha y lo que la ley le obliga a
                guardar, como facturas y pagos.
              </p>
              <p style={p}>
                Tus mensajes y tus comentarios del tablón se quedan en el estudio con tu nombre, y quien hayas bloqueado
                sigue bloqueada. Tus «me gusta» se borran.
              </p>
              <p style={p}>
                Si quieres que un estudio borre también tus datos, pídeselo con «Solicitar la eliminación de mis datos»,
                justo encima.
              </p>
            </div>
            <div style={{ marginTop: 14 }}>
              <Input
                label={`Escribe ${PALABRA_BORRAR_CUENTA} para confirmar`}
                value={palabra}
                onChange={(e) => { setPalabra(e.target.value); setError(''); }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
            {error && (
              <p role="alert" style={{ margin: '10px 0 0', fontSize: 'var(--t-small)', color: 'var(--destructive)', lineHeight: 1.5 }}>
                {error}
              </p>
            )}
          </>
        )}
      </ConfirmationDialog>
    </>
  );
}
