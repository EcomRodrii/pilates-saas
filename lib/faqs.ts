// Las preguntas frecuentes del panel, en datos y no dentro del componente.
//
// Están aquí para que se puedan comprobar: una respuesta equivocada no es un
// detalle de copia, es la dueña repitiéndole a sus clientas algo que el
// producto no hace. Ver e2e/ayuda-no-miente.spec.ts.

export interface FaqItem {
  pregunta: string;
  respuesta: string;
  categoria: string;
}

export const FAQS: FaqItem[] = [
  { categoria: 'Reservas', pregunta: '¿Cómo reservan clase mis clientas?', respuesta: 'Desde el portal de miembros (Calendario > Portal de reservas en el menú) o desde tu propia página de reservas pública. También puedes reservarles clase tú desde el Calendario del panel.' },
  { categoria: 'Reservas', pregunta: '¿Qué pasa si una clase está completa?', respuesta: 'La clienta entra automáticamente en lista de espera. Si se libera una plaza (cancelación), sube la primera de la lista y se le notifica.' },
  { categoria: 'Reservas', pregunta: '¿Puedo cancelar una clase y avisar a los inscritos?', respuesta: 'Sí, desde Calendario > clase > Cancelar. Se marca como cancelada y las clientas con reserva reciben una notificación en el portal.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo creo un nuevo plan o bono?', respuesta: 'En Configuración > Planes y tarifas > Nuevo plan. Define nombre, tipo (mensual, bono o puntual), precio y sesiones incluidas.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo cobro a una clienta?', respuesta: 'Desde Transacciones puedes marcar un recibo como cobrado manualmente, o conectar Stripe en Configuración > Integraciones para cobros automáticos con tarjeta guardada.' },
  { categoria: 'Planes y cobros', pregunta: '¿Se generan facturas automáticamente?', respuesta: 'Sí, cada cobro genera su factura correspondiente, disponible en Facturas y descargable en PDF.' },
  { categoria: 'Portal de clientas', pregunta: '¿Qué ven mis clientas en su app/portal?', respuesta: 'Su próxima clase, su plan y sesiones restantes, su progreso, créditos, logros y nivel — todo desde el enlace de Portal miembros del menú.' },
  // El portal SÍ pide contraseña (app/portal/[slug]/login). Esta respuesta decía
  // que no hacía falta: la dueña se lo repetía a sus clientas y las mandaba a
  // una pantalla que les pedía justo lo que le habían dicho que no existía.
  { categoria: 'Portal de clientas', pregunta: '¿Cómo entra una clienta por primera vez?', respuesta: 'Si aún no es clienta tuya, se apunta sola desde tu página pública de reservas: solo necesita su email. Para entrar al portal (/portal/tu-estudio/acceso) escribe su email y, en el paso siguiente, su contraseña. Si nunca ha creado una —o no se acuerda— ahí mismo tiene "No tengo contraseña o la he olvidado — mándame un enlace": se la manda por correo y la elige ella. También puede entrar con su cuenta de Google, sin contraseña ninguna. Tú no tienes que darle de alta ni enviarle nada.' },
  { categoria: 'Gamificación', pregunta: '¿Qué son los créditos y cómo se ganan?', respuesta: 'Recompensan acciones como asistir a clase, completar una semana o renovar un plan. Tú decides cuántos créditos vale cada una en Configuración > Recompensas.' },
  { categoria: 'Gamificación', pregunta: '¿Para qué sirven los créditos?', respuesta: 'Las clientas los canjean por recompensas de tu catálogo (Configuración > Recompensas > Catálogo) — una clase gratis, merchandising, lo que tú ofrezcas.' },
  { categoria: 'Gamificación', pregunta: '¿Cómo funcionan los logros?', respuesta: 'Se desbloquean automáticamente al alcanzar un umbral (ej. 10 clases asistidas). Los defines en Configuración > Logros, con su icono y créditos de regalo.' },
  { categoria: 'Gamificación', pregunta: '¿Y los niveles (Bronce, Plata...)?', respuesta: 'Se calculan sobre el total histórico de créditos ganados por la clienta. Configúralos en Configuración > Niveles — nombres, colores y umbrales son totalmente tuyos.' },
  { categoria: 'Gamificación', pregunta: '¿Qué es la racha?', respuesta: 'Cuenta las semanas consecutivas en las que la clienta ha asistido a al menos una clase. Se muestra en su Home y le avisa si está en riesgo de perderla.' },
  { categoria: 'Automatización', pregunta: '¿Qué hace el sistema autónomo / Automatizaciones IA?', respuesta: 'Detecta situaciones (clientas inactivas, bonos a punto de acabar, pagos pendientes...) y sugiere o ejecuta acciones automáticas como recordatorios.' },
  { categoria: 'Equipo', pregunta: '¿Puedo dar acceso a mi equipo?', respuesta: 'Sí, en Equipo puedes invitar instructoras o recepción con permisos distintos a los tuyos como propietaria.' },
  { categoria: 'Cuenta', pregunta: '¿Cómo cambio los datos de mi estudio?', respuesta: 'En Configuración > Estudio: nombre, NIF, dirección, color de marca y logo.' },
];

