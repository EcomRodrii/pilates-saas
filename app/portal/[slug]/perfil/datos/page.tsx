'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getAlumna } from '@/lib/student/datos';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { guardarDatos } from '@/lib/student/perfil-y-avisos';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useAuthStudent } from '@/lib/student/auth';
import { FotoPerfil } from '@/components/student/domain/FotoPerfil';
import { iniciales } from '@/lib/mensajeria/presentacion';
import { invalidarCatalogo } from '@/lib/student/catalogo';

// Datos personales (§A.18).
//
// ⚠️ El EMAIL se enseña pero NO se puede cambiar, y se dice por qué. El backend
// lo rechaza por escrito (`actualizarSociaPublica`): cambiarlo exigiría
// sincronizarlo con Supabase Auth y su flujo de confirmación, que no existe.
// El paquete lo presenta como editable con un hint de «te enviaremos un código»
// — eso es prometer un flujo que no está construido.
//
// «Cambiar contraseña» tampoco lanza un toast de «pendiente»: lleva a la
// recuperación de verdad, que sí existe (F3).
export default function DatosPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  // ⚠️ La ficha sale del PAYLOAD, no del hook de sesión: `SociaSesion` solo
  // lleva socioId, nombre y email. Con eso, apellidos, teléfono y dirección
  // habrían salido en blanco — y se habrían GUARDADO vacíos al primer envío.
  const cargarAlumna = useCallback(() => getAlumna(estudio.slug), [estudio.slug]);
  const { data: socia } = useAsync(cargarAlumna, (d) => !d);
  const { toast } = useToast();
  const { cambiarEmail } = useAuthStudent(estudio.slug);

  const [f, setF] = useState({ nombre: '', apellidos: '', telefono: '', objetivoClasesMes: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [rellenadoDe, setRellenadoDe] = useState<string | null>(null);
  // La foto que se ve AHORA. `undefined` = todavía la del payload; un valor
  // (o `null`) = lo que la alumna acaba de hacer, para que el cambio se vea al
  // instante sin esperar a que el payload se recargue.
  const [fotoLocal, setFotoLocal] = useState<string | null | undefined>(undefined);
  const [emailNuevo, setEmailNuevo] = useState('');
  const [emailAviso, setEmailAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const emailCambiado = emailNuevo.trim().length > 0
    && emailNuevo.trim().toLowerCase() !== (socia?.email ?? '').toLowerCase();

  const cambiarMiEmail = async () => {
    const destino = emailNuevo.trim();
    if (!destino || cambiandoEmail) return;
    setEmailAviso(null);
    setCambiandoEmail(true);
    const r = await cambiarEmail(destino);
    setCambiandoEmail(false);
    if ('error' in r) { setEmailAviso({ ok: false, texto: r.error }); return; }
    // ⚠️ El texto depende de si quedó PENDIENTE. Con la confirmación doble
    // activada lo normal es que sí, y decir «cambiado» sin más la dejaría
    // creyendo que ya entra con el nuevo.
    setEmailAviso({
      ok: true,
      texto: r.pendiente
        ? `Te hemos mandado un enlace a ${destino}. Ábrelo para confirmar el cambio; hasta entonces entras con el de ahora.`
        : 'Email actualizado ✓',
    });
  };

  // La sesión llega asíncrona, así que el formulario se rellena cuando aparece.
  // Se ajusta DURANTE EL RENDER y no en un efecto: es el patrón que React
  // documenta para estado derivado, y el efecto equivalente lo rechaza el lint
  // de este repo por provocar un render en cascada. Se guarda de qué socia se
  // rellenó para no pisar lo que ella esté escribiendo en cada re-render.
  if (socia && socia.id !== rellenadoDe) {
    setRellenadoDe(socia.id);
    setEmailNuevo(socia.email ?? '');
    setF({
      nombre: socia.nombre ?? '',
      apellidos: socia.apellidos ?? '',
      telefono: socia.telefono ?? '',
      objetivoClasesMes: socia.objetivoClasesMes != null ? String(socia.objetivoClasesMes) : '',
    });
  }

  const guardar = async () => {
    // Sin la ficha cargada, el formulario está VACÍO: guardar entonces manda
    // apellidos y teléfono en blanco y borra los que ya tenía. La validación de
    // nombre tapaba el caso extremo, pero no este: escribir el nombre y guardar
    // antes de que llegue el payload.
    if (!socia) { toast('Espera un momento: aún estamos cargando tus datos.'); return; }
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre';
    // Objetivo mensual (I-1): vacio = sin objetivo (se guarda null). El CHECK
    // del servidor (1-60) es la cerradura real; esto es solo para no mandar
    // una peticion que el servidor va a rechazar seguro.
    const objetivoTexto = f.objetivoClasesMes.trim();
    const objetivoNumero = objetivoTexto === '' ? null : Number(objetivoTexto);
    if (objetivoNumero !== null && (!Number.isInteger(objetivoNumero) || objetivoNumero < 1 || objetivoNumero > 60)) {
      e.objetivoClasesMes = 'Un numero entre 1 y 60, o vacio para no marcarte objetivo';
    }
    setErr(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    const r = await guardarDatos(estudio.id, estudio.slug, {
      nombre: f.nombre.trim(),
      apellidos: f.apellidos.trim(),
      telefono: f.telefono.trim(),
      objetivoClasesMes: objetivoNumero,
    });
    setGuardando(false);
    toast(r.ok ? 'Datos guardados ✓' : r.error);
  };

  return (
    <StudentShell>
      <PageHeader titulo="Datos personales" back />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, maxWidth: 520 }}>
        {/* La foto. Antes no había forma de poner ninguna: el avatar era
            siempre las iniciales.
            ⚠️ Y aquí vivía una CUARTA regla de iniciales, que no daba lo mismo
            que las otras: partía `nombre` y `apellidos` por separado, así que
            una socia dada de alta como «Ana Test», sin apellidos, salía «A» en
            esta pantalla y «AT» en Perfil y en la cabecera. La misma cara, dos
            monogramas. Se usa la de siempre (`lib/mensajeria/presentacion`). */}
        {socia && (
          <FotoPerfil
            studioId={estudio.id}
            url={fotoLocal !== undefined ? fotoLocal : (socia.fotoUrl ?? null)}
            iniciales={iniciales(socia.nombre, socia.apellidos)}
            onCambio={(u) => {
              setFotoLocal(u);
              // El catálogo cacheado lleva la foto vieja: sin invalidarlo, la
              // cabecera y el resto de pantallas seguirían enseñándola hasta
              // que caducara el caché.
              invalidarCatalogo(estudio.slug);
            }}
          />
        )}

        <Input label="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={err.nombre} autoComplete="given-name" />
        <Input label="Apellidos" value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} autoComplete="family-name" />
        {/* ⚠️ El email ya se puede cambiar. Estaba deshabilitado con un «pídeselo
            al estudio» porque el flujo no existía; ahora sí, con la
            confirmación doble que el proyecto tiene activada.

            NO cambia al instante y la pantalla no lo finge: hasta que abra el
            enlace, sigue entrando con el de siempre. Decir «cambiado» aquí
            sería la mentira más cara de esta pantalla — se quedaría fuera
            creyendo que su email es otro. */}
        <Input
          label="Email"
          type="email"
          value={emailNuevo}
          onChange={(e) => { setEmailNuevo(e.target.value); setEmailAviso(null); }}
          hint={emailCambiado
            ? 'Te mandaremos un enlace para confirmarlo. Hasta entonces entras con el de ahora.'
            : 'Es el mismo con el que entras.'}
          autoComplete="email"
        />
        {emailCambiado && (
          <Button
            variant="secondary"
            loading={cambiandoEmail}
            disabled={!online}
            onClick={() => void cambiarMiEmail()}
          >
            Cambiar el email
          </Button>
        )}
        {emailAviso && (
          <p
            role="status"
            data-testid="email-aviso"
            className={'note ' + (emailAviso.ok ? 'note--ok' : 'note--warn')}
          >
            {emailAviso.texto}
          </p>
        )}
        <Input label="Teléfono" type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} autoComplete="tel" />
        <Input
          label="Objetivo de clases al mes"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={f.objetivoClasesMes}
          onChange={(e) => setF({ ...f, objetivoClasesMes: e.target.value })}
          error={err.objetivoClasesMes}
          hint={err.objetivoClasesMes ? undefined : 'Cuántas clases quieres hacer este mes. Déjalo vacío si no quieres marcarte una meta.'}
        />
        {/* Sin campo de dirección: el formulario del paquete pide nombre,
            apellidos, email y teléfono, y añadir campos es rediseñar. El
            backend sí la admite (`CAMPOS_SOCIA_EDITABLES`) si algún día se
            decide pedirla. */}

        <Button full loading={guardando} disabled={!online || !socia} onClick={() => void guardar()} style={{ marginTop: 6 }}>
          {online ? 'Guardar cambios' : 'Sin conexión'}
        </Button>
      </div>
    </StudentShell>
  );
}
