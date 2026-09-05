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

  const [f, setF] = useState({ nombre: '', apellidos: '', telefono: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [rellenadoDe, setRellenadoDe] = useState<string | null>(null);

  // La sesión llega asíncrona, así que el formulario se rellena cuando aparece.
  // Se ajusta DURANTE EL RENDER y no en un efecto: es el patrón que React
  // documenta para estado derivado, y el efecto equivalente lo rechaza el lint
  // de este repo por provocar un render en cascada. Se guarda de qué socia se
  // rellenó para no pisar lo que ella esté escribiendo en cada re-render.
  if (socia && socia.id !== rellenadoDe) {
    setRellenadoDe(socia.id);
    setF({
      nombre: socia.nombre ?? '',
      apellidos: socia.apellidos ?? '',
      telefono: socia.telefono ?? '',
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
    setErr(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    const r = await guardarDatos(estudio.id, estudio.slug, {
      nombre: f.nombre.trim(),
      apellidos: f.apellidos.trim(),
      telefono: f.telefono.trim(),
    });
    setGuardando(false);
    toast(r.ok ? 'Datos guardados ✓' : r.error);
  };

  return (
    <StudentShell>
      <PageHeader titulo="Datos personales" back />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, maxWidth: 520 }}>
        <Input label="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={err.nombre} autoComplete="given-name" />
        <Input label="Apellidos" value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} autoComplete="family-name" />
        <Input
          label="Email"
          type="email"
          value={socia?.email ?? ''}
          onChange={() => {}}
          disabled
          hint="Para cambiarlo, escríbele al estudio: es el mismo con el que entras."
          autoComplete="email"
        />
        <Input label="Teléfono" type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} autoComplete="tel" />
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
