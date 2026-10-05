import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        registrarBotonesDeAvisos()
        return true
    }

    // MARK: - Botones en los avisos (mantener pulsado)
    //
    // El servidor pone `aps.category` en el aviso (lib/notifications/acciones-ios.ts)
    // y aquí se dice qué botones tiene cada categoría. Los identificadores son LOS
    // MISMOS que en ese fichero (lo comprueba `acciones-ios.test.ts`).
    //
    // ⚠️ Ningún botón hace nada desde el aviso: todos ABREN la app (`.foreground`)
    // y la acción la hace la app con la sesión de la alumna, como su botón de
    // siempre. «No puedo ir» y «No, gracias» abren además su confirmación: nunca
    // se cancela nada a ciegas. «Voy» solo cierra el aviso: no hay nada que hacer.
    // El plugin de avisos reenvía el botón pulsado a la web como `actionId`.
    private func registrarBotonesDeAvisos() {
        let aceptar = UNNotificationAction(identifier: "aceptar-plaza", title: "Aceptar la plaza", options: [.foreground])
        let noGracias = UNNotificationAction(identifier: "no-gracias", title: "No, gracias", options: [.foreground])
        let oferta = UNNotificationCategory(identifier: "OFERTA_ESPERA", actions: [aceptar, noGracias], intentIdentifiers: [], options: [])

        let voy = UNNotificationAction(identifier: "voy", title: "Voy", options: [])
        let noPuedo = UNNotificationAction(identifier: "no-puedo-ir", title: "No puedo ir", options: [.foreground])
        let recordatorio = UNNotificationCategory(identifier: "RECORDATORIO_CLASE", actions: [voy, noPuedo], intentIdentifiers: [], options: [])

        UNUserNotificationCenter.current().setNotificationCategories([oferta, recordatorio])
    }

    // MARK: - Avisos push (APNs)
    //
    // iOS entrega el token del aparato AQUÍ, a la app, no al plugin:
    // `@capacitor/push-notifications` lo espera por NotificationCenter. Sin
    // estos dos métodos, `registrarPushNativo()` (lib/nativo/puente.ts) se
    // queda esperando y acaba en «sin-respuesta-de-apns».

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: - Escenas
    //
    // Los Universal Links (applinks:tentare.app) y el esquema propio de la app
    // NO pasan por aquí: con escenas, iOS se los da a SceneDelegate, que los
    // reenvía a `@capacitor/app` (evento `appUrlOpen` → `alAbrirEnlace()`).

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
