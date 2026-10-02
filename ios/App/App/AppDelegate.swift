import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
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
