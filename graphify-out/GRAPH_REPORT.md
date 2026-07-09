# Graph Report - .  (2026-07-09)

## Corpus Check
- 184 files · ~251,620 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1326 nodes · 3210 edges · 84 communities
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 94 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Contexto global del estudio (StudioContext) — estado y mapeos DB→app
- Tipos de fila de Supabase (db-types.ts)
- Facturación / facturas (PDF, QR, agrupador)
- Caja / cierre de caja (POS)
- Rutas API de check-in y datos públicos del estudio
- Automatizaciones — panel y lógica de reglas
- Componentes UI base: Avatar / Card
- Stores de contenido y dashboard (zustand-like hooks)
- package.json — dependencias del proyecto
- Gestión de equipo (instructores/staff) — página y formularios
- Tipos de dominio (types.ts) — logros, automatizaciones, notas
- Calendario / Agenda — página principal
- Configuración — integraciones y formularios de clase
- Marketing — campañas, conversión, embudo
- Verifactu — facturación electrónica (huellas, cadenas)
- Alta de nuevo estudio (onboarding propietario)
- Dashboard principal — KPIs y actividad
- components.json — configuración shadcn/ui
- Integración Google Calendar — rutas API y cliente
- On-demand / catálogo de clases grabadas
- Auditoría Técnica CTO — hallazgos y bugs documentados
- tsconfig.json — configuración TypeScript
- Layout del panel — sidebar y navegación
- Gráficos personalizados del dashboard
- Ficha de socia — detalle y asistencia
- Sistema de temas — panel y portal (apariencia)
- Rutas API con IA (Anthropic) — redacción asistida
- Perfil de instructor y widget de ayuda/FAQ
- Motor de logros y automatizaciones (engines)
- Rutas API varias (POST genéricas)
- Rutas API con cliente externo (Stripe/otros)
- Citas — página y tarjetas
- Portal de socias — login, invitación, mi plan
- Componente UI: menú desplegable (dropdown)
- Motor de recompensas — créditos y reglas
- Informes de cohortes — retención
- Lógica de reservas (booking-logic) y tests
- Catálogo de clases — listado y detalle
- Portal — home y notificaciones
- Portal — progreso y logros de la socia
- Avatares — memoji, iniciales, selector
- API pública del portal — reservas y edición de socia
- Portal — preferencias de disponibilidad
- Retos / challenges — panel y lógica
- Emails transaccionales — bienvenida y recibo (Resend)
- Pagos — página e informes
- Layouts de portal/kiosk/reservar (multi-tenant slug)
- Lógica de bonos (paquetes de clases) y consumo
- Comunidad / muro social del portal
- Kiosk — pantalla de check-in táctil
- Notificaciones del panel — actividad reciente
- Iconos de marca de integraciones (Stripe, Google, etc.)
- Chat de equipo
- Iconos de marca Tentare — favicons y PWA
- Landing page pública
- Portal — perfil de socia y subida de fotos
- Motor de niveles (level-engine)
- API de canje de recompensas
- Exportación CSV de integraciones/salas
- Transacciones — página financiera
- API de actualización de recibo/socia
- Documentación del proyecto (AGENTS.md, CLAUDE.md, README)
- API de login de socia
- API de vinculación de cuenta Stripe
- Formulario de clases (tab)
- ESLint config
- Next.js config
- PostCSS config
- vercel.json — crons
- Icono boilerplate Next.js (file.svg)
- Icono boilerplate Next.js (globe)
- Logo Tentare horizontal
- Icono de marca Tentare (PNG)
- Logo Tentare apilado
- Wordmark Tentare
- Logo Vercel
- Icono boilerplate Next.js (window)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 159 edges
2. `useStudio()` - 111 edges
3. `reportDbError()` - 90 edges
4. `StudioContextValue` - 53 edges
5. `fetchCriticalStudioData()` - 44 edges
6. `fetchPublicStudioData()` - 29 edges
7. `QrCode` - 26 edges
8. `usePortalAuth()` - 25 edges
9. `getSupabaseAdmin()` - 25 edges
10. `verificarSesionStaff()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `MorningBriefing()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/automatizaciones/page.tsx → lib/utils.ts
- `DiaPill()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/calendario/page.tsx → lib/utils.ts
- `Avatar()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/comunidad/page.tsx → lib/utils.ts
- `NewPostModal()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/comunidad/page.tsx → lib/utils.ts
- `Toggle()` --calls--> `cn()`  [EXTRACTED]
  app/(dashboard)/configuracion/page.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **P0: bloqueantes de lanzamiento (seguridad + core roto)** — auditoria_cto_rls_anon_abierto, auditoria_cto_endpoints_sin_auth, auditoria_cto_portal_socios_auth_falsa, auditoria_cto_aforo_lista_espera_bug [EXTRACTED 1.00]
- **Módulos de producto realmente terminados (diferenciadores)** — auditoria_cto_stripe_connect_integration, auditoria_cto_checkin_kiosk, auditoria_cto_gamificacion_completa, auditoria_cto_ia_anthropic_claude_haiku [EXTRACTED 1.00]
- **Deuda técnica de infraestructura y arquitectura** — auditoria_cto_god_context_studio_context, auditoria_cto_mock_data_codigo_muerto, auditoria_cto_current_studio_id_fallback [INFERRED 0.85]

## Communities (84 total, 0 thin omitted)

### Community 0 - "Contexto global del estudio (StudioContext) — estado y mapeos DB→app"
Cohesion: 0.05
Nodes (76): defaultStudioConfig, StudioConfig, StudioContext, actividadRecienteToDb(), automatizacionToDb(), campanaToDb(), citaToDb(), dbClaimInstructorAccount() (+68 more)

### Community 1 - "Tipos de fila de Supabase (db-types.ts)"
Cohesion: 0.06
Nodes (63): RowAchievementDefinitions, RowAchievementHistory, RowAchievementProgress, RowActividadReciente, RowAutomationLogs, RowAutomationRules, RowAutomatizaciones, RowBackups (+55 more)

### Community 2 - "Facturación / facturas (PDF, QR, agrupador)"
Cohesion: 0.08
Nodes (16): AgrupadorFact, Facturas(), fecha(), kpi(), mesAnio(), qrSvgMarkup(), appendBits(), assert() (+8 more)

### Community 3 - "Caja / cierre de caja (POS)"
Cohesion: 0.05
Nodes (43): CartItem, CerrarCajaModal(), CerrarCajaModalProps, formatDateLabel(), formatTimeOrDate(), isSameDay(), METODO_LABEL, METODOS (+35 more)

### Community 4 - "Rutas API de check-in y datos públicos del estudio"
Cohesion: 0.07
Nodes (44): POST(), POST(), checkinPublico(), fetchCriticalStudioData(), fetchPublicStudioData(), mapAchievementDefinition(), mapAchievementProgress(), mapActividadReciente() (+36 more)

### Community 5 - "Automatizaciones — panel y lógica de reglas"
Cohesion: 0.06
Nodes (35): accionConfig, AutomatizacionesPage(), formatFecha(), horasRestantes(), LogItem(), MorningBriefing(), REGLAS_SUGERIDAS, resultadoConfig (+27 more)

### Community 6 - "Componentes UI base: Avatar / Card"
Cohesion: 0.09
Nodes (34): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), Card(), CardAction() (+26 more)

### Community 7 - "Stores de contenido y dashboard (zustand-like hooks)"
Cohesion: 0.06
Nodes (38): useContentStore(), useDashboardChartsStore(), useDiscountCodesStore(), useIntegrationsStore(), useMemberPrefsStore(), useProgressNotesStore(), useTeamChatStore(), StudioProvider() (+30 more)

### Community 8 - "package.json — dependencias del proyecto"
Cohesion: 0.05
Nodes (39): dependencies, @anthropic-ai/sdk, @base-ui/react, class-variance-authority, clsx, date-fns, lucide-react, next (+31 more)

### Community 9 - "Gestión de equipo (instructores/staff) — página y formularios"
Cohesion: 0.10
Nodes (26): ActividadTab(), COLORES, emptyForm(), EquipoPage(), Form, formatFechaHora(), ROL_DESC, ROL_LABEL (+18 more)

### Community 10 - "Tipos de dominio (types.ts) — logros, automatizaciones, notas"
Cohesion: 0.08
Nodes (34): StudioContextValue, AceptacionContrato, AchievementDefinition, AchievementHistory, AchievementProgress, AutomationStep, Automatizacion, BackupMeta (+26 more)

### Community 11 - "Calendario / Agenda — página principal"
Cohesion: 0.10
Nodes (25): addDays(), Calendario(), DIA_PILLS, DiaPill(), DIAS_CORTOS, formatHora(), FormData, hexToRgba() (+17 more)

### Community 12 - "Configuración — integraciones y formularios de clase"
Cohesion: 0.08
Nodes (27): CampoIntegracion, CatalogoIntegracion, ClaseForm, ColorInput(), ColorSwatch(), ConfiguracionPage(), ConfirmDialog(), emptyPlanForm() (+19 more)

### Community 13 - "Marketing — campañas, conversión, embudo"
Cohesion: 0.08
Nodes (21): accionDesc, ConversionFunnelCard(), CopyButton(), destinatariosLabel, EstadoBadge(), formatDateEs(), FUNNEL_STAGES, KpiTrendCard() (+13 more)

### Community 14 - "Verifactu — facturación electrónica (huellas, cadenas)"
Cohesion: 0.21
Nodes (18): FacturaEntrante, mapSalida(), POST(), calcularHuellaAlta(), calcularHuellaAnulacion(), construirCadenaAlta(), construirCadenaAnulacion(), formatImporte() (+10 more)

### Community 15 - "Alta de nuevo estudio (onboarding propietario)"
Cohesion: 0.14
Nodes (14): CrearEstudioPage(), OwnerForm, StudioForm, StudioTipo, TIPOS, jakarta, metadata, LoginPage() (+6 more)

### Community 16 - "Dashboard principal — KPIs y actividad"
Cohesion: 0.14
Nodes (16): actividadConfig, ClaseHoyCard(), Dashboard(), formatHora(), KpiCard(), localDate(), MONTH_LABELS, monthKey() (+8 more)

### Community 17 - "components.json — configuración shadcn/ui"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 18 - "Integración Google Calendar — rutas API y cliente"
Cohesion: 0.20
Nodes (18): GET(), POST(), SesionConRelaciones, eliminarEventoClase(), env(), EventoClase, exchangeCodeForTokens(), getGoogleAccountEmail() (+10 more)

### Community 19 - "On-demand / catálogo de clases grabadas"
Cohesion: 0.10
Nodes (19): categoriaBadge, categoriaBg, CATEGORIAS, nivelBadge, NIVELES, nivelLabel, OnDemandPage(), UploadForm (+11 more)

### Community 20 - "Auditoría Técnica CTO — hallazgos y bugs documentados"
Cohesion: 0.13
Nodes (21): Auditoría Técnica CTO - Pilates SaaS, Bug de aforo/lista de espera (addReserva siempre CONFIRMADA), Campañas de marketing sin acción de enviar, Check-in / kiosk (lógica de negocio, descuento de bono, recibo de renovación), Consumo de sesiones del bono solo en check-in, no al reservar, current_studio_id() con fallback hardcodeado 'studio-1', Endpoints de API sin autenticación (charge-off-session, checkout, emails/send, ai/*), Export PDF de informes es un setTimeout falso (simulatePDF()) (+13 more)

### Community 21 - "tsconfig.json — configuración TypeScript"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 22 - "Layout del panel — sidebar y navegación"
Cohesion: 0.17
Nodes (17): DashboardLayout(), BottomNavItem(), bottomNavItems, ESSENTIAL_HREFS, MasDrawer(), NavItem(), navSections, Sidebar() (+9 more)

### Community 23 - "Gráficos personalizados del dashboard"
Cohesion: 0.16
Nodes (16): ChartCard(), COLORES, CustomChartsSection(), AGRUPACIONES_GRAFICO, ChartData, computeSerieGrafico(), etiquetaPeriodo(), inicioPeriodo() (+8 more)

### Community 24 - "Ficha de socia — detalle y asistencia"
Cohesion: 0.13
Nodes (12): AVATAR_COLORS, BADGE_RECIBO, BADGE_RESERVA, Card(), DetalleSocio(), fecha(), LABEL_RECIBO, localDate() (+4 more)

### Community 25 - "Sistema de temas — panel y portal (apariencia)"
Cohesion: 0.19
Nodes (13): AppearancePanel(), NAV, PortalShell(), applyToElement(), PanelThemeContext, PanelThemeProvider(), PanelThemeValue, usePanelTheme() (+5 more)

### Community 26 - "Rutas API con IA (Anthropic) — redacción asistida"
Cohesion: 0.20
Nodes (14): client, POST(), anthropic, GET(), redactarConIA(), uid(), buildRecomendacionUserPrompt(), RecomendacionInput (+6 more)

### Community 27 - "Perfil de instructor y widget de ayuda/FAQ"
Cohesion: 0.21
Nodes (13): TabPerfil(), getInitials(), InstructoresPage(), CATEGORIAS, FaqItem, FAQS, HelpWidget(), ProfileMenu() (+5 more)

### Community 28 - "Motor de logros y automatizaciones (engines)"
Cohesion: 0.24
Nodes (15): asistenciaMensualCompleta(), asistioEnCumpleanos(), calcularMetrica(), MetricaContexto, AutomationCandidato, AutomationEngineInput, AccionAutomatica, AchievementMetricDef (+7 more)

### Community 29 - "Rutas API varias (POST genéricas)"
Cohesion: 0.24
Nodes (12): POST(), uid(), POST(), GET(), uid(), BACKUP_TABLES, BackupSnapshot, crearSnapshot() (+4 more)

### Community 30 - "Rutas API con cliente externo (Stripe/otros)"
Cohesion: 0.22
Nodes (11): client, POST(), client, POST(), POST(), POST(), SesionStaff, verificarSesionStaff() (+3 more)

### Community 31 - "Citas — página y tarjetas"
Cohesion: 0.17
Nodes (13): CitaCard(), CitaCardProps, CitasPage(), DURACIONES, duracionMin(), ESTADO_BADGE, formatFecha(), isSameMonth() (+5 more)

### Community 32 - "Portal de socias — login, invitación, mi plan"
Cohesion: 0.19
Nodes (11): InvitarPage(), PortalLogin(), Filtro, MiPlanPage(), ESTADO_BADGE, MisReservasPage(), Tab, PortalAuthContext (+3 more)

### Community 33 - "Componente UI: menú desplegable (dropdown)"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 34 - "Motor de recompensas — créditos y reglas"
Cohesion: 0.22
Nodes (11): RecompensasTab(), aplicarGananciaCreditos(), decidirOtorgarCreditos(), reglaActivaPara(), REWARD_TRIGGERS, item(), yaOtorgado(), MemberCredits (+3 more)

### Community 35 - "Informes de cohortes — retención"
Cohesion: 0.24
Nodes (13): Bucket, CohortRow, ExportState, fmtEur(), fmtEurFull(), getBucketKey(), getChartBuckets(), getPeriodStart() (+5 more)

### Community 36 - "Lógica de reservas (booking-logic) y tests"
Cohesion: 0.25
Nodes (9): contarReferidosPremiadosMes(), decidirPremioReferido(), decidirReservaNueva(), esPrimeraAsistencia(), plazasOcupadas(), siguienteEnEspera(), ahora, primeraAsistencia (+1 more)

### Community 37 - "Catálogo de clases — listado y detalle"
Cohesion: 0.21
Nodes (10): ClasesPage(), NIVEL_COLOR, NIVEL_LABEL, Tab, ClaseDetallePage(), NIVEL_LABEL, HomeCardContext, tieneCoberturaPlan() (+2 more)

### Community 38 - "Portal — home y notificaciones"
Cohesion: 0.31
Nodes (10): PortalHome(), formatRelative(), NotificacionesPage(), getHomeCardContext(), buildPortalNotifications(), markPortalNotifsRead(), PortalNotifItem, PortalNotifTipo (+2 more)

### Community 39 - "Portal — progreso y logros de la socia"
Cohesion: 0.21
Nodes (9): ESTADO_STYLE, EstadoTarjeta, ProgresoPage(), Tab, TABS, calcularRacha(), claveSemana(), lunesDe() (+1 more)

### Community 40 - "Avatares — memoji, iniciales, selector"
Cohesion: 0.26
Nodes (11): AvatarDef, AvatarGenero, AvatarPicker(), initialsOf(), memojiIdFor(), memojiSeedOf(), memojiUrl(), PREDEFINED_AVATARS (+3 more)

### Community 41 - "API pública del portal — reservas y edición de socia"
Cohesion: 0.35
Nodes (10): POST(), POST(), getSupabaseAdmin(), actualizarSociaPublica(), cancelarReservaPublica(), crearReservaPublica(), guardarPreferenciasPublica(), mapReserva() (+2 more)

### Community 42 - "Portal — preferencias de disponibilidad"
Cohesion: 0.30
Nodes (10): PreferenciasPage(), DIAS_SEMANA, disponibilidadVacia(), DURACIONES, FRANJAS, NIVELES, DiaSemana, Disponibilidad (+2 more)

### Community 43 - "Retos / challenges — panel y lógica"
Cohesion: 0.24
Nodes (11): RetosTab(), emptyForm(), ESTADO_LABEL, isoToDateInput(), TabRetos(), ACHIEVEMENT_METRICS, metricaDef(), calcularProgresoReto() (+3 more)

### Community 44 - "Emails transaccionales — bienvenida y recibo (Resend)"
Cohesion: 0.29
Nodes (7): POST(), BienvenidaEmail(), Props, Props, ReciboEmail(), Props, ReservaEmail()

### Community 45 - "Pagos — página e informes"
Cohesion: 0.24
Nodes (9): BADGE, fecha(), isoToYearMonth(), MainTab, monthLabel(), Pagos(), SORT_OPTIONS, SortKey (+1 more)

### Community 46 - "Layouts de portal/kiosk/reservar (multi-tenant slug)"
Cohesion: 0.25
Nodes (4): metadata, StudioSlugGate(), PortalAuthProvider(), resolveStudioIdBySlug()

### Community 47 - "Lógica de bonos (paquetes de clases) y consumo"
Cohesion: 0.35
Nodes (9): bonoConsumible(), calcularConsumoBono(), calcularDevolucionBono(), consumirBonoServidor(), devolverBonoServidor(), mapPlanTarifa(), mapSuscripcion(), PlanTarifa (+1 more)

### Community 48 - "Comunidad / muro social del portal"
Cohesion: 0.31
Nodes (9): Avatar(), AVATAR_COLORS, Comment, CommentThread(), ComunidadPage(), getInitials(), NewPostModal(), PostCard() (+1 more)

### Community 49 - "Kiosk — pantalla de check-in táctil"
Cohesion: 0.36
Nodes (9): avatarColor(), DIAS, initials(), isDark(), KioskPage(), localDate(), MESES, pad2() (+1 more)

### Community 50 - "Notificaciones del panel — actividad reciente"
Cohesion: 0.29
Nodes (6): ActividadIcon(), NotificacionesPage(), NotiIconBg(), timeAgo(), ActividadReciente, Notificacion

### Community 51 - "Iconos de marca de integraciones (Stripe, Google, etc.)"
Cohesion: 0.25
Nodes (7): GoogleCalendarIcon(), IconProps, PayPalIcon(), ResendIcon(), StripeIcon(), WhatsAppIcon(), ZoomIcon()

### Community 52 - "Chat de equipo"
Cohesion: 0.48
Nodes (6): AVATAR_COLORS, avatarColor(), ChatEquipoPage(), esMismoDia(), formatFecha(), formatHora()

### Community 53 - "Iconos de marca Tentare — favicons y PWA"
Cohesion: 0.29
Nodes (7): Tentare Brand Icon Mark (Favicon 256x256), Tentare Brand Icon (48x48 Favicon), Tentare Brand Icon (32x32 Favicon), Tentare Brand Icon (16x16 Favicon), Tentare PWA Icon 192x192, Tentare PWA Icon 512x512, Tentare Brand Icon Mark (logo-mark.png)

### Community 54 - "Landing page pública"
Cohesion: 0.29
Nodes (2): FAQ_ITEMS, plexMono

### Community 55 - "Portal — perfil de socia y subida de fotos"
Cohesion: 0.38
Nodes (5): PerfilPage(), eliminarFotoClase(), eliminarFotoPerfil(), subirFotoClase(), subirFotoPerfil()

### Community 56 - "Motor de niveles (level-engine)"
Cohesion: 0.43
Nodes (4): calcularNivel(), NivelInfo, niveles, LevelDefinition

### Community 57 - "API de canje de recompensas"
Cohesion: 0.50
Nodes (4): POST(), aplicarCanjeCreditos(), validarCanje(), canjearRecompensaPublica()

### Community 58 - "Exportación CSV de integraciones/salas"
Cohesion: 0.40
Nodes (5): CATALOGO_INTEGRACIONES, descargarCsv(), TabIntegraciones(), toCsv(), Sala

### Community 59 - "Transacciones — página financiera"
Cohesion: 0.60
Nodes (4): fechaCorta(), FiltroTipo, fmt(), Transacciones()

### Community 60 - "API de actualización de recibo/socia"
Cohesion: 0.83
Nodes (3): POST(), dbUpdateRecibo(), dbUpdateSocio()

### Community 62 - "Documentación del proyecto (AGENTS.md, CLAUDE.md, README)"
Cohesion: 0.67
Nodes (3): Next.js Breaking Changes Notice (AGENTS.md), CLAUDE.md (project instructions entrypoint), README - Next.js project bootstrap

### Community 63 - "API de login de socia"
Cohesion: 1.00
Nodes (2): POST(), resolverLoginSocia()

### Community 64 - "API de vinculación de cuenta Stripe"
Cohesion: 1.00
Nodes (2): GET(), dbSetStripeAccountId()

### Community 65 - "Formulario de clases (tab)"
Cohesion: 0.67
Nodes (3): claseToForm(), emptyClaseForm(), TabClases()

### Community 72 - "ESLint config"
Cohesion: 1.00
Nodes (1): eslintConfig

### Community 73 - "Next.js config"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 74 - "PostCSS config"
Cohesion: 1.00
Nodes (1): config

### Community 75 - "vercel.json — crons"
Cohesion: 1.00
Nodes (1): crons

### Community 76 - "Icono boilerplate Next.js (file.svg)"
Cohesion: 1.00
Nodes (1): file.svg (Next.js boilerplate file icon)

### Community 77 - "Icono boilerplate Next.js (globe)"
Cohesion: 1.00
Nodes (1): Globe Icon (Next.js Boilerplate)

### Community 78 - "Logo Tentare horizontal"
Cohesion: 1.00
Nodes (1): Tentare Logo (Horizontal)

### Community 79 - "Icono de marca Tentare (PNG)"
Cohesion: 1.00
Nodes (1): Tentare Brand Icon Mark (Logo Icon PNG)

### Community 80 - "Logo Tentare apilado"
Cohesion: 1.00
Nodes (1): Tentare Logo (Stacked)

### Community 81 - "Wordmark Tentare"
Cohesion: 1.00
Nodes (1): Tentare Wordmark Logo

### Community 82 - "Logo Vercel"
Cohesion: 1.00
Nodes (1): Vercel Logo (vercel.svg)

### Community 83 - "Icono boilerplate Next.js (window)"
Cohesion: 1.00
Nodes (1): window.svg (Next.js boilerplate icon)

## Knowledge Gaps
- **286 isolated node(s):** `accionConfig`, `resultadoConfig`, `triggerLabels`, `REGLAS_SUGERIDAS`, `SesionEnr` (+281 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<1 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 6` to `Community 2`, `Community 3`, `Community 5`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 16`, `Community 19`, `Community 22`, `Community 23`, `Community 24`, `Community 27`, `Community 31`, `Community 33`, `Community 39`, `Community 40`, `Community 43`, `Community 45`, `Community 48`, `Community 50`, `Community 58`, `Community 65`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `useStudio()` connect `Community 27` to `Community 0`, `Community 2`, `Community 3`, `Community 5`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 19`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 31`, `Community 32`, `Community 35`, `Community 37`, `Community 38`, `Community 39`, `Community 42`, `Community 43`, `Community 45`, `Community 48`, `Community 49`, `Community 50`, `Community 52`, `Community 55`, `Community 58`, `Community 59`, `Community 65`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `getSupabaseAdmin()` connect `Community 41` to `Community 1`, `Community 4`, `Community 14`, `Community 18`, `Community 57`, `Community 29`, `Community 30`, `Community 63`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `fetchCriticalStudioData()` (e.g. with `mapAchievementDefinition()` and `mapAchievementProgress()`) actually correct?**
  _`fetchCriticalStudioData()` has 39 INFERRED edges - model-reasoned connections that need verification._
- **What connects `accionConfig`, `resultadoConfig`, `triggerLabels` to the rest of the system?**
  _288 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._