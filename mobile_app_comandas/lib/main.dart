import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/login_screen.dart';
import 'screens/cocina_screen.dart';
import 'services/update_service.dart';
import 'widgets/dialogo_actualizacion.dart';

void main() {
  runApp(const CocinaApp());
}

class CocinaApp extends StatelessWidget {
  const CocinaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Café La Paz - Cocina',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorSchemeSeed: const Color(0xFFF97316),
        useMaterial3: true,
      ),
      home: const _SplashGate(),
    );
  }
}

class _SplashGate extends StatefulWidget {
  const _SplashGate();

  @override
  State<_SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<_SplashGate> {
  bool _loading = true;
  bool _autenticado = false;

  @override
  void initState() {
    super.initState();
    _verificarSesion();
  }

  Future<void> _verificarSesion() async {
    final prefs = await SharedPreferences.getInstance();
    final usuarioId = prefs.getInt('usuario_id');
    final rol = (prefs.getString('usuario_rol') ?? '').toUpperCase();
    setState(() {
      _autenticado = usuarioId != null && rol == 'COCINERO';
      _loading = false;
    });
    _chequearActualizacion();
  }

  Future<void> _chequearActualizacion() async {
    final info = await UpdateService.buscarActualizacion();
    if (info != null && mounted) {
      await mostrarDialogoActualizacion(context, info);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Color(0xFFF97316))),
      );
    }
    return _autenticado ? const CocinaScreen() : const LoginScreen();
  }
}
