import 'package:flutter/material';
import 'package:shared_preferences/shared_preferences.dart';
import 'config/theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_navigation.dart';

void main() async {
  // Asegurar inicialización de bindings para plugins nativos
  WidgetsFlutterBinding.ensureInitialized();
  
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
