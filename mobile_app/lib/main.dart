import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'config/theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_navigation.dart';
import 'screens/splash_screen.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (e) {
    print('FCM background error initialization: $e');
  }
  print("Notificación en background: ${message.notification?.title} - ${message.notification?.body}");
}

void main() async {
  // Asegurar inicialización de bindings para plugins nativos
  WidgetsFlutterBinding.ensureInitialized();

  // Por defecto, en release un widget que falla se ve como un recuadro gris
  // vacío sin ninguna pista de qué pasó. Mostramos el error real para poder
  // diagnosticar fallas reportadas por captura de pantalla.
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Material(
      color: const Color(0xFF7F1D1D),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Center(
          child: Text(
            'Error al mostrar este panel:\n${details.exceptionAsString()}',
            style: const TextStyle(color: Colors.white, fontSize: 11),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  };

  // Inicializar formateo de fechas en español
  try {
    await initializeDateFormatting('es_ES', null);
  } catch (e) {
    print('Error al inicializar locale: $e');
  }
  
  // Inicializar Firebase de forma segura (tolerancia a fallos por falta de config)
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    
    // Configurar comportamiento en primer plano
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print("Notificación recibida en primer plano: ${message.notification?.title} - ${message.notification?.body}");
    });
  } catch (e) {
    print('⚠️ ADVERTENCIA: Firebase no pudo inicializarse (FCM desactivado). Error: $e');
  }

  // Comprobar si hay una sesión activa de usuario
  final prefs = await SharedPreferences.getInstance();
  final int? userId = prefs.getInt('usuario_id');
  final bool hasActiveSession = userId != null;

  runApp(CafeLaPazApp(hasActiveSession: hasActiveSession));
}

class CafeLaPazApp extends StatelessWidget {
  final bool hasActiveSession;

  const CafeLaPazApp({
    super.key,
    required this.hasActiveSession,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Café La Paz POS',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: SplashAnimationScreen(hasActiveSession: hasActiveSession),
    );
  }
}
