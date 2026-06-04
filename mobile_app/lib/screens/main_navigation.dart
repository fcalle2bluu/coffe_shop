import 'dart:async';
import 'dart:convert';
import 'package:flutter/material';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
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

class MainNavigation extends StatefulWidget {
  const MainNavigation({super.key});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
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

  // Polling de notificaciones en vivo
  Timer? _notificationTimer;
  List<dynamic> _previousOrders = [];

  @override
  void initState() {
    super.initState();
    _loadUserSession().then((_) {
      _startNotificationService();
    });
  }

  @override
  void dispose() {
    _notificationTimer?.cancel();
    super.dispose();
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
                            style: const TextStyle(fontWeight: FontWeight.black, color: Colors.white, fontSize: 13.5),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            message,
                            style: const TextStyle(color: Colors.white90, fontSize: 12),
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

    // 1. Siempre visible: Punto de Venta
    _menuItems.add({
      'title': 'Punto de Venta',
      'icon': FontAwesomeIcons.shop,
    });
    _screens.add(const PosScreen());

    // 2. Siempre visible: Control de Caja
    _menuItems.add({
      'title': 'Control Caja',
      'icon': FontAwesomeIcons.cashRegister,
    });
    _screens.add(const CajaScreen());

    // 2.5. Siempre visible: Pedidos Internos
    _menuItems.add({
      'title': 'Pedidos Internos',
      'icon': FontAwesomeIcons.clipboardList,
    });
    _screens.add(const PedidosInternosScreen());

    // 3. Stock Actual (Admin o con permiso)
    if (_isAdmin || _permStock) {
      _menuItems.add({
        'title': 'Stock Insumos',
        'icon': FontAwesomeIcons.boxesStacked,
      });
      _screens.add(const StockScreen());
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
        'title': 'Parámetros',
        'icon': FontAwesomeIcons.gears,
      });
      _screens.add(const ParametrosScreen());
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
                        style: const TextStyle(fontWeight: FontWeight.black, fontSize: 16, color: AppTheme.accentColor),
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
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.medium,
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

    return Scaffold(
      appBar: isLargeScreen
          ? null
          : AppBar(
              title: Text(_menuItems[_selectedIndex]['title']),
              elevation: 0,
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
    );
  }
}
