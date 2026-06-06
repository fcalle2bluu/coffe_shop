import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'config/theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_navigation.dart';

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
      home: hasActiveSession ? const MainNavigation() : const LoginScreen(),
    );
  }
}
