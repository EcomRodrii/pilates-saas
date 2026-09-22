'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useEstudio } from '@/components/student/contexto';
import { useToast } from '@/components/student/ui/Toast';
import { getConsentimientoMarketing, getPreferencias, guardarConsentimientoMarketing, guardarPreferencia } from '@/lib/student/perfil-y-avisos';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { activarPushStudent, contextoPushStudent, desactivarPushStudent } from '@/lib/student/push';
import { estadoPush, textoPush, type EstadoPush } from '@/lib/student/push-estado';
import { OposicionPerfilado } from '@/components/student/domain/OposicionPerfilado';
import { PushPorTipo, estadoInicialPush } from '@/components/student/domain/PushPorTipo';
import { Interruptor } from '@/components/student/ui/Interruptor';

// Preferencias de aviso (§A.19).
//
// El paquete de diseño pedía interruptores por aviso («Recordatorio de clase»,
// «Plaza liberada»…) y el backend solo sabía de CATEGORÍAS: un interruptor
// apagaba la categoría entera, y apagar el recordatorio de una hora callaba
// también la plaza liberada. Desde migr 20260921132122 el push se decide por
// TIPO (`notification_preference.push_eventos`), así que la pantalla enseña un
// interruptor por aviso real (`PUSH_POR_TIPO.SOCIA`, con un test que obliga a
// que esté cada push que le puede llegar). El email sigue siendo por categoría.
//
// Ausencia de fila = encendido: es el valor por defecto del propio endpoint.

export default function PreferenciasPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const [emailPagos, setEmailPagos] = useState(false);
  // Novedades del estudio (consentimiento de marketing). null = no se pudo
  // leer: entonces no se pinta el interruptor en vez de adivinar su estado.
  const [marketing, setMarketing] = useState<boolean | null>(null);
  // Estado de push de ESTE dispositivo. Es del navegador, no del servidor:
  // permiso + suscripción del SW acotado a la app. `null` hasta leerlo.
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [ocupadoPush, setOcupadoPush] = useState(false);

  const cargar = useCallback(async () => {
    const prefs = await getPreferencias();
    // Sin fila, email apagado: es el defecto del endpoint, no una suposición.
    setEmailPagos(prefs.find((p) => p.category === 'pagos')?.email ?? false);
    setPush(estadoPush(await contextoPushStudent(estudio.slug)));
    setMarketing(await getConsentimientoMarketing(estudio.id));
    return estadoInicialPush('SOCIA', prefs);
  }, [estudio.slug]);

  const { estado, data: pushInicial, reintentar } = useAsync(cargar, () => false);

  const cambiarEmail = async (valor: boolean) => {
    const antes = emailPagos;
    // Optimista —un interruptor tiene que responder al instante— pero se
    // REVIERTE si el servidor dice que no.
    setEmailPagos(valor);
    const ok = await guardarPreferencia({ studioId: estudio.id, category: 'pagos', email: valor });
    if (!ok) {
      setEmailPagos(antes);
      toast('No hemos podido guardar ese cambio.');
    }
  };

  // Retirarlo tiene que ser tan fácil como darlo (RGPD art. 7.3). Se pinta lo
  // que diga el SERVIDOR al guardar, no lo que se pulsó.
  const cambiarMarketing = async (valor: boolean) => {
    const antes = marketing;
    setMarketing(valor);
    const ahora = await guardarConsentimientoMarketing(estudio.id, valor);
    if (ahora === null) {
      setMarketing(antes);
      toast('No hemos podido guardar ese cambio.');
      return;
    }
    setMarketing(ahora);
  };

  // Los interruptores por tipo de abajo no sirven de nada si este
  // dispositivo no está suscrito: esta es la tarjeta que lo suscribe. Se
  // relee el estado real del navegador después de cada acción en vez de
  // suponer el resultado.
  const alternarPush = async () => {
    if (push === null || ocupadoPush) return;
    const accion = textoPush(push).accion;
    if (!accion) return;
    setOcupadoPush(true);
    try {
      if (accion === 'activar') {
        const r = await activarPushStudent(estudio.id, estudio.slug);
        if (!r.ok && r.motivo !== 'denied') toast('No hemos podido activar los avisos en este dispositivo.');
      } else {
        const ok = await desactivarPushStudent(estudio.slug);
        if (!ok) toast('No hemos podido desactivar los avisos en este dispositivo.');
      }
      setPush(estadoPush(await contextoPushStudent(estudio.slug)));
    } finally {
      setOcupadoPush(false);
    }
  };

  const dispositivo = push === null ? null : textoPush(push);

  return (
    <StudentShell>
      <PageHeader titulo="Preferencias" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para cambiar tus avisos." />}

        {estado === 'ready' && (
          <>
            {dispositivo && (
              <>
                <p className="t-label" style={{ margin: '0 0 7px' }}>Este dispositivo</p>
                <div className="card" style={{ overflow: 'hidden' }} data-testid="push-dispositivo" data-estado={push ?? undefined}>
                  {dispositivo.accion ? (
                    <Interruptor
                      label={dispositivo.titulo}
                      sub={dispositivo.cuerpo}
                      on={dispositivo.encendido}
                      disabled={!online || ocupadoPush}
                      onChange={() => void alternarPush()}
                    />
                  ) : (
                    <div style={{ padding: '13px 15px', minHeight: 56 }}>
                      <span style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700 }}>{dispositivo.titulo}</span>
                      <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{dispositivo.cuerpo}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <p className="t-label" style={{ margin: '16px 0 7px' }}>Avisos en el móvil</p>
            <p className="t-meta" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
              Elige qué te avisamos al móvil. Lo que apagues seguirá apareciendo en tus avisos dentro de la app.
            </p>
            {pushInicial && <PushPorTipo rol="SOCIA" studioId={estudio.id} inicial={pushInicial} online={online} />}

            <p className="t-label" style={{ margin: '16px 0 7px' }}>Email</p>
            <div className="card" style={{ overflow: 'hidden' }}>
              <Interruptor
                label="Recibos y confirmaciones por email"
                on={emailPagos}
                disabled={!online}
                onChange={(v) => void cambiarEmail(v)}
              />
              {marketing !== null && (
                <Interruptor
                  label={`Novedades y ofertas de ${estudio.nombre}`}
                  sub="Promociones y noticias del estudio. Puedes cambiarlo cuando quieras."
                  on={marketing}
                  disabled={!online}
                  onChange={(v) => void cambiarMarketing(v)}
                />
              )}
            </div>

            <OposicionPerfilado slug={estudio.slug} />

            <p className="t-meta" style={{ margin: '14px 0 0', lineHeight: 1.5 }}>
              Los avisos de seguridad y los que afectan a tus reservas ya hechas se envían siempre.
            </p>
          </>
        )}
      </div>
    </StudentShell>
  );
}
