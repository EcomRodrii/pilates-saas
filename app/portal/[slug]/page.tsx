import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';

// Inicio. En F1 es el andamiaje: confirma que el shell, el tema del estudio y
// la navegación funcionan de extremo a extremo. El hero fotográfico, la tarjeta
// «Tu próxima clase», el bono y los huecos de hoy entran en F4, cuando el
// adaptador de datos exista.
export default function InicioPage() {
  return (
    <StudentShell>
      <PageHeader titulo="Inicio" sub="Andamiaje de la Student PWA — el contenido llega en F4." />
    </StudentShell>
  );
}
