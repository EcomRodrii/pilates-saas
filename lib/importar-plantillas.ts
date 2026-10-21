// ─────────────────────────────────────────────────────────────────────────────
// Las plantillas de ejemplo para importar: la de clientas (Clientas › Importar)
// y la del horario (Calendario › Importar). Las descargan esas dos pantallas y
// el paso «¿Traes alumnas de otro sitio?» del alta nueva: el mismo archivo, no
// una copia que se quede vieja.
//
// Son CSV (no .xlsx): las dos pantallas leen además XLSX y XLS al subir.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlantillaImportar {
  /** El nombre con que se descarga. */
  archivo: string;
  cabeceras: string[];
  ejemplo: string[][];
}

export const PLANTILLA_CLIENTAS: PlantillaImportar = {
  archivo: 'plantilla-clientas-tentare.csv',
  cabeceras: ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'NIF', 'Etiquetas', 'Fecha de alta', 'Dirección', 'Fecha de nacimiento'],
  ejemplo: [
    ['Ana', 'García López', 'ana@ejemplo.com', '600123456', '12345678Z', 'reformer;mañana', '15/03/2022', 'C/ Mayor 3, Madrid', '02/06/1990'],
    ['Lucía', 'Martín', 'lucia@ejemplo.com', '611654321', '', 'vip', '', '', ''],
  ],
};

export const PLANTILLA_HORARIO: PlantillaImportar = {
  archivo: 'plantilla-horario.csv',
  cabeceras: ['Clase', 'Día de la semana', 'Hora inicio', 'Hora fin', 'Instructora', 'Sala', 'Aforo'],
  ejemplo: [
    ['Pilates Mat', 'Lunes', '09:00', '10:00', 'María Soler', 'Sala 1', '12'],
    ['Reformer Fundamental', 'Lunes', '19:00', '19:50', 'Julia Ramos', 'Sala 2', '8'],
    ['Pilates Mat', 'Miércoles', '09:00', '10:00', 'María Soler', 'Sala 1', '12'],
  ],
};
