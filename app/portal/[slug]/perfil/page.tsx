'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSesionStudent } from '@/lib/student/sesion';
import { InvitarAmiga } from '@/components/student/domain/InvitarAmiga';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getAlumna } from '@/lib/student/datos';
import { useAuthStudent } from '@/lib/student/auth';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Icono } from '@/components/student/ui/Icono';
import { useFotoUrl } from '@/lib/foto-signed-url';
import { CajaQr, useQrAcceso } from '@/components/student/domain/QrAcceso';
import { CambiarDeEstudio } from '@/components/student/domain/CambiarDeEstudio';
import { BorrarCuenta } from '@/components/student/domain/BorrarCuenta';

// Perfil (§A.17). Cerrar sesión es de verdad: `supabasePortal.auth.signOut()`.
// El paquete solo navega a /login, que dejaría la sesión viva — y en un móvil
// compartido eso es dejar la cuenta abierta.
export default function PerfilPage() {
  const { estudio } = useEstudio();
  // El id de la socia, que es lo que lleva el enlace de invitación.
  const { socia: sesion } = useSesionStudent(estudio.slug);
  const href = usePortalHref();
  const router = useRouter();
  const cargarAlumna = useCallback(() => getAlumna(estudio.slug), [estudio.slug]);
  const { data: socia } = useAsync(cargarAlumna, (d) => !d, `alumna:${estudio.slug}:perfil`);
  // SEC-01 (auditoría 23-sep): `socia.fotoUrl` ya no es una URL pública
  // pintable directa — mismo criterio que `perfil/datos/page.tsx`. Solo se
  // pide la firma si `fotoUrl` existe (evita un "object not found" en cada
  // carga para quien nunca subió foto).
  const { url: fotoFirmada } = useFotoUrl(socia?.fotoUrl ? socia.id : null, estudio.id, 'portal');
  const { logout } = useAuthStudent(estudio.slug);
  const [salir, setSalir] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const qrAcceso = useQrAcceso(estudio.slug, estudio.qrAcceso === true);

  const nombreCompleto = [socia?.nombre, socia?.apellidos].filter(Boolean).join(' ') || 'Tu perfil';

  const cerrarSesion = async () => {
    setSaliendo(true);
    await logout();
    router.push(href('/acceso/login'));
  };

  return (
    <StudentShell>
      <PageHeader titulo="Perfil" />
      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '16px', marginTop: 14 }}>
        {/* ⚠️ Aquí estaba el bug de la foto: este bloque pintaba SIEMPRE las
            iniciales, sin mirar `socia.fotoUrl` ni una vez. La alumna subía su
            foto en «Datos personales», la veía allí, y al volver a Perfil
            seguía su monograma — con toda la pinta de que no se había
            guardado. */}
        <Link
          href={href('/perfil/datos')}
          className="card card--pad-lg card--tap row"
          style={{ ['--gap' as string]: '13px' }}
        >
          <AvatarSocia nombre={socia?.nombre} apellidos={socia?.apellidos} fotoUrl={fotoFirmada} size={56} />
          <div className="trunc">
            <p className="t-card-title trunc">{nombreCompleto}</p>
            <p className="t-meta" style={{ marginTop: 1 }}>Alumna de {estudio.nombre}</p>
          </div>
          {/* La cabecera dejó de ser decorado: es la puerta a los datos y a la
              foto. Antes esta fila no hacía nada, y la única forma de cambiar
              la foto era adivinar que estaba dentro de «Datos personales». */}
          <span aria-hidden className="push t-faint" style={{ display: 'flex' }}>
            <Icono nombre="chevron-derecha" tamano={18} />
          </span>
        </Link>

        {/* Su QR de acceso, justo debajo de su nombre y con el color de la
            tarjeta de su reserva: es lo que busca en la puerta del estudio, con
            prisa, y en una lista de ajustes se perdería entre «Contraseña» y
            «Preferencias». La miniatura es el QR de verdad. */}
        {estudio.qrAcceso && qrAcceso.estado !== 'apagado' && (
          <Link
            href={href('/perfil/qr')}
            className="card card--tap row"
            data-testid="perfil-qr-acceso"
            style={{
              ['--gap' as string]: '14px', padding: '14px 16px',
              background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderColor: 'transparent',
            }}
          >
            <CajaQr qr={qrAcceso.qr} estado={qrAcceso.estado} tamano={56} />
            <div className="trunc">
              <p className="t-card-title trunc" style={{ color: 'var(--on-dark)' }}>QR de acceso</p>
              <p className="t-meta" style={{ marginTop: 1, color: 'var(--accent-deep-muted)' }}>Muéstralo al llegar al estudio</p>
            </div>
            <span aria-hidden className="push" style={{ display: 'flex', color: 'var(--accent-deep-muted)' }}>
              <Icono nombre="chevron-derecha" tamano={18} />
            </span>
          </Link>
        )}

        {/* Solo en la app de iOS «Tentare» (dentro se pinta sola o no). */}
        <CambiarDeEstudio />

        {/* ⚠️ Dos bloques y no uno. «Cuenta» acumulaba OCHO filas seguidas,
            y las cuatro últimas no son ajustes de cuenta: son dinero. En un
            listado plano de ocho, «Contraseña» y «Método de pago» pesan lo
            mismo y hay que leer los ocho rótulos para encontrar cualquiera de
            los dos. Es el mismo criterio que ya separa «Estudio» y «Sesión»
            más abajo — por qué estás ahí, no dónde vive el dato. */}
        <ProfileSection
          titulo="Cuenta"
          items={[
            { label: 'Datos personales', href: href('/perfil/datos'), valor: socia?.email ?? undefined },
            { label: 'Preferencias', href: href('/perfil/preferencias') },
            // Aquí y no en Ajustes: es información SUYA, no una opción de la
            // app. El encargo lo pide explícitamente («Perfil → Valoración
            // inicial»), y coincide con el criterio del resto de esta lista.
            { label: 'Valoración inicial', href: href('/valoracion') },
            // Antes no había ninguna entrada: la única forma de cambiar la
            // contraseña era el flujo de recuperación por correo, que es para
            // cuando NO te acuerdas.
            { label: 'Contraseña y verificación', href: href('/perfil/seguridad') },
          ]}
        />

        <ProfileSection
          titulo="Bonos y pagos"
          items={[
            { label: 'Bonos', href: href('/bonos') },
            { label: 'Comprar bonos y suscripciones', href: href('/comprar') },
            { label: 'Pagos y recibos', href: href('/pagos') },
            { label: 'Método de pago', href: href('/perfil/pago') },
          ]}
        />

        {/* Invitar a una amiga. Va suelto y no como una fila más de una lista:
            es lo único de esta pantalla que se COMPARTE, y en una lista de
            ajustes se leería como otro enlace de configuración.

            Solo con la socia resuelta: el enlace lleva su id, así que sin él
            no hay invitación que dar. */}
        {sesion?.socioId && (
          <InvitarAmiga slug={estudio.slug} socioId={sesion.socioId} nombreEstudio={estudio.nombre} />
        )}

        <ProfileSection
          titulo="Estudio"
          items={[
            { label: 'Ayuda y contacto', href: href('/ayuda') },
            // ⚠️ «Escribir al estudio» ENTRA aquí en el mismo cambio que saca
            // la tarjeta de Mensajes de Inicio. Esa tarjeta era la ÚNICA puerta
            // a `/mensajes` en toda la app —comprobado con grep antes de
            // tocarla—, así que quitarla sin esto habría dejado a la alumna sin
            // forma de escribir a su estudio. Comunidad no tenía el problema:
            // ya se llegaba desde aquí.
            { label: 'Escribir al estudio', href: href('/mensajes') },
            { label: 'Notificaciones', href: href('/notificaciones') },
            { label: 'Comunidad', href: href('/comunidad') },
            { label: 'Logros y recompensas', href: href('/logros') },
            // Descargar, retirar el consentimiento de salud y pedir que borren
            // sus datos viven en su propia pantalla. Antes eran dos bloques
            // aquí, con la eliminación en rojo a un toque; son cosas de casi
            // nunca, así que queda UNA fila, la última antes de cerrar sesión.
            { label: 'Privacidad y datos', href: href('/perfil/privacidad') },
          ]}
        />

        <ProfileSection
          titulo="Sesión"
          items={[{ label: 'Cerrar sesión', onClick: () => setSalir(true), destructivo: true }]}
        />

        {/* Borrar la CUENTA (App Store 5.1.1(v)), aparte de cerrar sesión y lo
            último de todo. Pedir al estudio que borre sus datos sigue en
            «Privacidad y datos», y la hoja lo enlaza. */}
        <BorrarCuenta
          slug={estudio.slug}
          nombreEstudio={estudio.nombre}
          hrefPrivacidad={href('/perfil/privacidad')}
          hrefLogin={href('/acceso/login')}
        />

        <p className="t-meta" style={{ textAlign: 'center', color: 'var(--subtle-foreground)' }}>
          App de {estudio.nombre} · con Tentare
        </p>
      </div>

      <ConfirmationDialog
        open={salir}
        onClose={() => { if (!saliendo) setSalir(false); }}
        titulo="¿Cerrar sesión?"
        cuerpo="Tendrás que volver a identificarte para reservar."
        confirmar="Cerrar sesión"
        tono="danger"
        loading={saliendo}
        onConfirm={() => void cerrarSesion()}
      />
    </StudentShell>
  );
}
