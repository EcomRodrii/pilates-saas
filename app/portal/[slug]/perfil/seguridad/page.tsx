'use client';

import { useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { useAuthStudent } from '@/lib/student/auth';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { MINIMO_PASSWORD, motivoPasswordInvalida } from '@/lib/student/password-regla';

// Cambiar la contraseña desde dentro de la app.
//
// Antes no existía: el perfil no ofrecía nada y la única vía era el flujo de
// recuperación por correo, que es para cuando NO te acuerdas — hacer pasar por
// el buzón a quien sí se acuerda es un rodeo.
//
// ⚠️ Se pide la ACTUAL, y no es adorno: el proyecto exige reautenticación para
// cambiar contraseña, y gotrue solo la salta si la sesión se creó en las
// últimas 24 h. En una PWA instalada las sesiones duran semanas, así que el
// caso NORMAL es el que la necesita. Ver `cambiarPassword`.
export default function SeguridadPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { cambiarPassword } = useAuthStudent(estudio.slug);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<{ campo: 'actual' | 'nueva' | 'repetida' | 'general'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const puede = actual.length > 0 && nueva.length > 0 && repetida.length > 0 && online;

  const guardar = async () => {
    setError(null);
    const malo = motivoPasswordInvalida(nueva, repetida, actual);
    if (malo) { setError(malo); return; }

    setGuardando(true);
    const r = await cambiarPassword(actual, nueva);
    setGuardando(false);
    if ('error' in r) {
      // La actual equivocada señala SU campo: culpar a la nueva mandaría a
      // cambiarla cuando el problema está arriba.
      setError({ campo: r.error.includes('actual') ? 'actual' : 'general', texto: r.error });
      return;
    }
    setActual(''); setNueva(''); setRepetida('');
    toast('Contraseña cambiada ✓');
  };

  return (
    <StudentShell>
      <PageHeader titulo="Contraseña" back />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14, maxWidth: 520 }}>
        <p className="t-small t-dim">
          Cambia la contraseña con la que entras. Te pedimos la actual para asegurarnos de que eres tú.
        </p>

        <Input
          label="Contraseña actual" type="password" autoComplete="current-password"
          value={actual} onChange={(e) => { setActual(e.target.value); setError(null); }}
          error={error?.campo === 'actual' ? error.texto : undefined}
        />
        <Input
          label="Nueva contraseña" type="password" autoComplete="new-password"
          value={nueva} onChange={(e) => { setNueva(e.target.value); setError(null); }}
          hint={`Al menos ${MINIMO_PASSWORD} caracteres.`}
          error={error?.campo === 'nueva' ? error.texto : undefined}
        />
        <Input
          label="Repite la nueva" type="password" autoComplete="new-password"
          value={repetida} onChange={(e) => { setRepetida(e.target.value); setError(null); }}
          error={error?.campo === 'repetida' ? error.texto : undefined}
        />

        {error?.campo === 'general' && (
          <p role="alert" className="note note--warn" data-testid="error-general">{error.texto}</p>
        )}

        <Button full loading={guardando} disabled={!puede} onClick={() => void guardar()} style={{ marginTop: 'var(--s-1)' }}>
          {online ? 'Cambiar la contraseña' : 'Sin conexión'}
        </Button>

        <p className="t-meta" style={{ textAlign: 'center' }}>
          ¿No te acuerdas de la actual? Sal y usa <b>«He olvidado mi contraseña»</b> en la pantalla de entrada.
        </p>
      </div>
    </StudentShell>
  );
}
