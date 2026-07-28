import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../config/api.dart';
import '../config/theme.dart';
import 'login_screen.dart';
import 'pos_screen.dart';
import 'caja_screen.dart';
import 'pedidos_internos_screen.dart';
import 'stock_screen.dart';
import 'compras_screen.dart';
import 'proveedores_screen.dart';
import 'auditoria_screen.dart';
import 'parametros_screen.dart';
import 'usuarios_screen.dart';
import 'libro_diario_screen.dart';
import 'ia_assistant_screen.dart';
import 'asistencia_screen.dart';
import 'dashboard_screen.dart';
import 'venta_mesa_screen.dart';
import 'recetas_screen.dart';
import 'realizar_pedido_screen.dart';
import '../widgets/version_badge.dart';

class MainNavigation extends StatefulWidget {
  const MainNavigation({super.key});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> with WidgetsBindingObserver {
  int _selectedIndex = 0;
  int _userId = 1;
  String _userName = '';
  String _userRol = '';
  bool _isAdmin = false;
  
  // Permisos cargados
  bool _permStock = false;
  bool _permCompras = false;
  bool _permProveedores = false;
  bool _permAuditoria = false;
  bool _permParametros = false;
  bool _permInforme = false;

  final List<Map<String, dynamic>> _menuItems = [];
  final List<Widget> _screens = [];

  // Para controlar los botones de refrescar/vista de "Realizar Pedido" desde
  // la barra de título compartida, en vez de tenerlos dentro de esa pantalla.
  final GlobalKey<RealizarPedidoScreenState> _realizarPedidoKey = GlobalKey<RealizarPedidoScreenState>();

  // Polling de notificaciones en vivo
  Timer? _notificationTimer;
  List<dynamic> _previousOrders = [];

  // Variables para control forzado de ubicación
  bool _checkingLocation = true;
  bool _locationGranted = false;
  String _locationStatusMessage = '';
  bool _isPermissionPermanentlyDenied = false;
  bool _isServiceDisabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUserSession().then((_) {
      _startNotificationService();
    });
    _checkLocationState();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notificationTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkLocationState();
    }
  }

  Future<void> _checkLocationState() async {
    setState(() {
      _checkingLocation = true;
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locationGranted = false;
          _isServiceDisabled = true;
          _checkingLocation = false;
          _locationStatusMessage = 'Los servicios de ubicación (GPS) del dispositivo están desactivados.';
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.always || permission == LocationPermission.whileInUse) {
        setState(() {
          _locationGranted = true;
          _isServiceDisabled = false;
          _isPermissionPermanentlyDenied = false;
          _checkingLocation = false;
        });
      } else {
        setState(() {
          _locationGranted = false;
          _isServiceDisabled = false;
          _isPermissionPermanentlyDenied = (permission == LocationPermission.deniedForever);
          _checkingLocation = false;
          _locationStatusMessage = _isPermissionPermanentlyDenied
              ? 'El permiso de ubicación está denegado permanentemente en la configuración de tu celular.'
              : 'El sistema requiere tu ubicación en tiempo real para poder usar la aplicación.';
        });
      }
    } catch (e) {
      setState(() {
        _locationGranted = false;
        _checkingLocation = false;
        _locationStatusMessage = 'Error al verificar la ubicación: $e';
      });
    }
  }

  Future<void> _requestLocationPermission() async {
    try {
      if (_isServiceDisabled) {
        await Geolocator.openLocationSettings();
        await _checkLocationState();
        return;
      }

      if (_isPermissionPermanentlyDenied) {
        await Geolocator.openAppSettings();
        await _checkLocationState();
        return;
      }

      LocationPermission permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.always || permission == LocationPermission.whileInUse) {
        setState(() {
          _locationGranted = true;
          _isPermissionPermanentlyDenied = false;
          _isServiceDisabled = false;
        });
      } else {
        setState(() {
          _locationGranted = false;
          _isPermissionPermanentlyDenied = (permission == LocationPermission.deniedForever);
          _locationStatusMessage = _isPermissionPermanentlyDenied
              ? 'El permiso de ubicación está denegado permanentemente en la configuración de tu celular.'
              : 'El sistema requiere tu ubicación en tiempo real para poder usar la aplicación.';
        });
      }
    } catch (e) {
      print('Error al solicitar ubicación: $e');
    }
  }

  Future<void> _loadUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userId = prefs.getInt('usuario_id') ?? 1;
      _userName = prefs.getString('usuario_nombre') ?? 'Usuario';
      _userRol = prefs.getString('usuario_rol') ?? 'CAJERO';
      _isAdmin = _userRol.toUpperCase() == 'ADMIN' || _userRol.toUpperCase() == 'ADMINISTRADOR';

      _permStock = prefs.getString('perm_stock') == 'true';
      _permCompras = prefs.getString('perm_compras') == 'true';
      _permProveedores = prefs.getString('perm_proveedores') == 'true';
      _permAuditoria = prefs.getString('perm_auditoria') == 'true';
      _permParametros = prefs.getString('perm_parametros') == 'true';
      _permInforme = prefs.getString('perm_informe') == 'true';

      _buildMenu();
    });
    _registerFCMToken(_userId);
  }

  Future<void> _registerFCMToken(int userId) async {
    try {
      final fcm = FirebaseMessaging.instance;
      // Solicitar permisos de notificación
      await fcm.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );
      final token = await fcm.getToken();
      if (token != null) {
        print('FCM Token obtenido en MainNavigation: $token');
        final response = await ApiConfig.post('/auth/registrar-token', {
          'usuario_id': userId,
          'token': token,
        });
        if (response.statusCode == 200) {
          print('FCM Token registrado con éxito en el backend (MainNavigation).');
        } else {
          print('FCM Token falló al registrarse en el backend (MainNavigation): ${response.body}');
        }
      }
    } catch (e) {
      print('FCM desactivado o error al registrar token en MainNavigation: $e');
    }
  }

  void _startNotificationService() {
    // Comprobación inicial inmediata
    _checkOrderNotifications();

    // Comprobación cada 15 segundos
    _notificationTimer = Timer.periodic(const Duration(seconds: 15), (timer) {
      _checkOrderNotifications();
    });
  }

  Future<void> _checkOrderNotifications() async {
    try {
      final res = await ApiConfig.get('/pedidos_internos?usuario_id=$_userId&rol=$_userRol');
      if (res.statusCode == 200) {
        final List newOrders = jsonDecode(res.body);

        if (_previousOrders.isNotEmpty) {
          for (var newOrder in newOrders) {
            final orderId = newOrder['id'];
            final matchedOld = _previousOrders.firstWhere(
              (o) => o['id'] == orderId,
              orElse: () => null,
            );

            if (matchedOld == null) {
              // Nueva solicitud creada en el sistema
              if (_isAdmin && newOrder['estado'] == 'PENDIENTE') {
                _showNotification(
                  'Nueva Solicitud de Insumo ☕',
                  '${newOrder['solicitante']} solicita ${newOrder['insumo_nombre']} x${newOrder['cantidad']}',
                  isSuccess: true,
                );
              }
            } else {
              // Solicitud existente con cambio de estado
              final oldEstado = matchedOld['estado'];
              final newEstado = newOrder['estado'];

              if (oldEstado != newEstado) {
                if (!_isAdmin) {
                  // Notificación dirigida al cajero solicitante
                  if (newEstado == 'COMPRADO') {
                    _showNotification(
                      'Pedido Entregado 🎉',
                      'Tu solicitud de ${newOrder['insumo_nombre']} (x${newOrder['cantidad']}) ha sido despachada por el Administrador.',
                      isSuccess: true,
                    );
                  } else if (newEstado == 'RECHAZADO') {
                    _showNotification(
                      'Pedido Rechazado ⛔',
                      'Tu solicitud de ${newOrder['insumo_nombre']} (x${newOrder['cantidad']}) ha sido denegada.',
                      isSuccess: false,
                    );
                  }
                }
              }
            }
          }
        }

        _previousOrders = newOrders;
      }
    } catch (e) {
      print('Error en notificaciones en segundo plano: $e');
    }
  }

  void _showNotification(String title, String message, {bool isSuccess = true}) {
    final overlayState = Overlay.of(context);
    late OverlayEntry overlayEntry;

    overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        top: 50.0,
        left: 16.0,
        right: 16.0,
        child: SafeArea(
          child: Material(
            color: Colors.transparent,
            child: TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 600),
              tween: Tween(begin: 0.0, end: 1.0),
              curve: Curves.elasticOut,
              builder: (context, value, child) {
                return Transform.translate(
                  offset: Offset(0, (1 - value) * -100),
                  child: Opacity(
                    opacity: value,
                    child: child,
                  ),
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: isSuccess
                        ? [const Color(0xFF10B981), const Color(0xFF059669)]
                        : [const Color(0xFFEF4444), const Color(0xFFDC2626)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.35),
                      blurRadius: 25,
                      offset: const Offset(0, 12),
                    )
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const FaIcon(FontAwesomeIcons.bell, size: 16, color: Colors.white),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white, fontSize: 13.5),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            message,
                            style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );

    overlayState.insert(overlayEntry);

    // Auto dismiss after 4 seconds
    Future.delayed(const Duration(seconds: 4), () {
      overlayEntry.remove();
    });
  }

  void _buildMenu() {
    _menuItems.clear();
    _screens.clear();

    final userRolUpper = _userRol.toUpperCase();
    final esRolLimitado = ['PASTELERA', 'MESERO', 'COCINERO', 'BARISTA'].contains(userRolUpper);

    if (esRolLimitado) {
      // 0. Realizar Pedido (flujo rápido y liviano para que el mesero mande comandas a cocina)
      if (userRolUpper == 'MESERO') {
        _menuItems.add({
          'title': 'Realizar Pedido',
          'icon': FontAwesomeIcons.bellConcierge,
        });
        _screens.add(RealizarPedidoScreen(key: _realizarPedidoKey));
      }

      // 1. Venta por Mesa (para meseros/baristas que toman pedidos y cobran)
      if (userRolUpper == 'MESERO' || userRolUpper == 'BARISTA') {
        _menuItems.add({
          'title': 'Venta por Mesa',
          'icon': FontAwesomeIcons.utensils,
        });
        _screens.add(const VentaMesaScreen());

        _menuItems.add({
          'title': 'Punto de Venta',
          'icon': FontAwesomeIcons.shop,
        });
        _screens.add(const PosScreen());
      }

      // 2. Asistencia
      _menuItems.add({
        'title': 'Asistencia',
        'icon': FontAwesomeIcons.userClock,
      });
      _screens.add(const AsistenciaScreen());

      // 3. Pedidos Internos
      _menuItems.add({
        'title': 'Pedidos Internos',
        'icon': FontAwesomeIcons.clipboardList,
      });
      _screens.add(const PedidosInternosScreen());
      return;
    }

    // 0. Dashboard para Todos los Usuarios (que no sean limitados)
    _menuItems.add({
      'title': 'Dashboard',
      'icon': FontAwesomeIcons.chartLine,
    });
    _screens.add(const DashboardScreen());

    // 0.5 Venta por Mesa (Admin y Cajero)
    if (_isAdmin || userRolUpper == 'CAJERO') {
      _menuItems.add({
        'title': 'Venta por Mesa',
        'icon': FontAwesomeIcons.utensils,
      });
      _screens.add(const VentaMesaScreen());
    }

    // 1. Punto de Venta (Admin y Cajero)
    if (_isAdmin || userRolUpper == 'CAJERO') {
      _menuItems.add({
        'title': 'Punto de Venta',
        'icon': FontAwesomeIcons.shop,
      });
      _screens.add(const PosScreen());
    }

    // 2. Control Caja (Visible SOLO para Admins)
    if (_isAdmin) {
      _menuItems.add({
        'title': 'Control Caja',
        'icon': FontAwesomeIcons.cashRegister,
      });
      _screens.add(const CajaScreen());
    }

    // 2.5. Siempre visible para otros: Pedidos Internos
    _menuItems.add({
      'title': 'Pedidos Internos',
      'icon': FontAwesomeIcons.clipboardList,
    });
    _screens.add(const PedidosInternosScreen());

    // Siempre visible para otros: Asistencia
    _menuItems.add({
      'title': 'Asistencia',
      'icon': FontAwesomeIcons.userClock,
    });
    _screens.add(const AsistenciaScreen());

    // 3. Stock Actual (Admin o con permiso)
    if (_isAdmin || _permStock) {
      _menuItems.add({
        'title': 'Stock Insumos',
        'icon': FontAwesomeIcons.boxesStacked,
      });
      _screens.add(const StockScreen());
    }

    // 3.5. Recetas (Visible solo para Administradores)
    if (_isAdmin) {
      _menuItems.add({
        'title': 'Recetas',
        'icon': FontAwesomeIcons.bookOpen,
      });
      _screens.add(const RecetasScreen());
    }

    // 4. Compras (Admin o con permiso)
    if (_isAdmin || _permCompras) {
      _menuItems.add({
        'title': 'Compras Insumos',
        'icon': FontAwesomeIcons.cartFlatbed,
      });
      _screens.add(const ComprasScreen());
    }

    // 5. Proveedores (Admin o con permiso)
    if (_isAdmin || _permProveedores) {
      _menuItems.add({
        'title': 'Proveedores',
        'icon': FontAwesomeIcons.truck,
      });
      _screens.add(const ProveedoresScreen());
    }

    // 6. Auditoría (Admin o con permiso)
    if (_isAdmin || _permAuditoria) {
      _menuItems.add({
        'title': 'Auditoría',
        'icon': FontAwesomeIcons.clipboardCheck,
      });
      _screens.add(const AuditoriaScreen());
    }

    // 7. Parámetros (Admin o con permiso)
    if (_isAdmin || _permParametros) {
      _menuItems.add({
        'title': 'Gestión Empleados',
        'icon': FontAwesomeIcons.usersGear,
      });
      _screens.add(const UsuariosScreen());

      _menuItems.add({
        'title': 'Parámetros',
        'icon': FontAwesomeIcons.gears,
      });
      _screens.add(const ParametrosScreen());
    }

    // 7.5. Libro Diario (Admin o con permiso de informe o parametros)
    if (_isAdmin || _permInforme || _permParametros) {
      _menuItems.add({
        'title': 'Libro Diario',
        'icon': FontAwesomeIcons.book,
      });
      _screens.add(const LibroDiarioScreen());
    }

    // 8. Asistente IA (Solo Admin)
    if (_isAdmin) {
      _menuItems.add({
        'title': 'Asistente IA',
        'icon': FontAwesomeIcons.brain,
      });
      _screens.add(const IaAssistantScreen());
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cerrar Sesión'),
        content: const Text('¿Estás seguro de salir del sistema?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Salir', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isLargeScreen = size.width > 900;

    if (_checkingLocation) {
      return Scaffold(
        body: Container(
          color: AppTheme.primaryDark,
          child: const Center(
            child: CircularProgressIndicator(color: AppTheme.accentColor),
          ),
        ),
      );
    }

    if (!_locationGranted) {
      final isTablet = size.width > 600;
      return Scaffold(
        body: Container(
          width: double.infinity,
          height: double.infinity,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF0F172A), // Slate 900
                Color(0xFF020617), // Slate 950
              ],
            ),
          ),
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
              child: Container(
                width: isTablet ? 450 : double.infinity,
                padding: const EdgeInsets.all(32.0),
                decoration: BoxDecoration(
                  color: AppTheme.secondaryDark.withOpacity(0.85),
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor.withOpacity(0.1),
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.accentColor.withOpacity(0.2), width: 2),
                      ),
                      alignment: Alignment.center,
                      child: const FaIcon(
                        FontAwesomeIcons.locationDot,
                        size: 36,
                        color: AppTheme.accentColor,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Ubicación Obligatoria',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _locationStatusMessage,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppTheme.textMuted,
                        height: 1.5,
                      ),
                    ),
                    if (_isPermissionPermanentlyDenied || _isServiceDisabled) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.redAccent.withOpacity(0.2)),
                        ),
                        child: Text(
                          _isServiceDisabled
                              ? 'Por favor, activa el GPS en los ajustes de tu dispositivo para continuar.'
                              : 'Por favor, otorga el permiso de ubicación en los ajustes de la aplicación.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 32),
                    ElevatedButton(
                      onPressed: _requestLocationPermission,
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(55),
                        backgroundColor: AppTheme.accentColor,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const FaIcon(FontAwesomeIcons.circleCheck, size: 16),
                          const SizedBox(width: 8),
                          Text(
                            _isServiceDisabled
                                ? 'ACTIVAR GPS EN AJUSTES'
                                : (_isPermissionPermanentlyDenied ? 'ABRIR CONFIGURACIÓN APP' : 'CONCEDER PERMISO'),
                            style: const TextStyle(
                              fontFamily: 'Outfit',
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    Widget menuList() {
      return ListView(
        padding: EdgeInsets.zero,
        children: [
          // Drawer Header
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: const FaIcon(FontAwesomeIcons.mugHot, size: 18, color: Colors.white),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Café La Paz',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white.withOpacity(0.05)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _userName.isNotEmpty ? _userName.substring(0, 1).toUpperCase() : 'U',
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppTheme.accentColor),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _userName,
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            _userRol,
                            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.greenAccent, letterSpacing: 1.0),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _logout,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                    side: BorderSide(color: Colors.white.withOpacity(0.1)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const FaIcon(FontAwesomeIcons.powerOff, size: 10, color: AppTheme.textMuted),
                  label: const Text('SALIR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: AppTheme.textMuted)),
                ),
              ],
            ),
          ),
          const Divider(color: Colors.white10, height: 1),
          const SizedBox(height: 12),
          
          // Navigation Items
          ...List.generate(_menuItems.length, (index) {
            final item = _menuItems[index];
            final isSelected = _selectedIndex == index;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 3.0),
              child: ListTile(
                onTap: () {
                  setState(() => _selectedIndex = index);
                  if (!isLargeScreen) {
                    Navigator.pop(context); // Cerrar Drawer en celular
                  }
                },
                selected: isSelected,
                leading: FaIcon(
                  item['icon'],
                  size: 16,
                  color: isSelected ? AppTheme.accentColor : AppTheme.textMuted,
                ),
                title: Text(
                  item['title'],
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    color: isSelected ? Colors.white : AppTheme.textMuted,
                  ),
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                selectedTileColor: AppTheme.accentColor.withOpacity(0.08),
              ),
            );
          }),
        ],
      );
    }

    if (_menuItems.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Stack(
      children: [
        Scaffold(
      appBar: isLargeScreen
          ? null
          : AppBar(
              title: _menuItems[_selectedIndex]['title'] == 'Realizar Pedido'
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Realizar Pedido', style: TextStyle(fontSize: 16)),
                        Text(_userName, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.normal)),
                      ],
                    )
                  : Text(_menuItems[_selectedIndex]['title']),
              elevation: 0,
              actions: _menuItems[_selectedIndex]['title'] == 'Realizar Pedido'
                  ? [
                      IconButton(
                        icon: const Icon(Icons.refresh),
                        tooltip: 'Refrescar catálogo',
                        onPressed: () => _realizarPedidoKey.currentState?.refrescarCatalogo(),
                      ),
                      IconButton(
                        icon: Icon(
                          (_realizarPedidoKey.currentState?.vistaLista ?? false) ? Icons.grid_view_rounded : Icons.view_list_rounded,
                        ),
                        tooltip: 'Cambiar vista',
                        onPressed: () => setState(() => _realizarPedidoKey.currentState?.toggleVista()),
                      ),
                    ]
                  : null,
            ),
      drawer: isLargeScreen
          ? null
          : Drawer(
              child: menuList(),
            ),
      body: Row(
        children: [
          // Sidebar fija para tablets/pantallas grandes
          if (isLargeScreen)
            Container(
              width: 260,
              decoration: BoxDecoration(
                color: AppTheme.secondaryDark.withOpacity(0.4),
                border: Border(right: BorderSide(color: Colors.white.withOpacity(0.04), width: 1)),
              ),
              child: SafeArea(
                child: menuList(),
              ),
            ),
          
          // Contenido principal con animación de cambio de pantalla
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              transitionBuilder: (Widget child, Animation<double> animation) {
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0.02, 0.0),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                );
              },
              child: KeyedSubtree(
                key: ValueKey<int>(_selectedIndex),
                child: _screens[_selectedIndex],
              ),
            ),
          ),
        ],
      ),
        ),
        Positioned(
          right: 12,
          bottom: 12,
          child: SafeArea(
            minimum: const EdgeInsets.only(bottom: 4),
            child: const VersionBadge(),
          ),
        ),
      ],
    );
  }
}
