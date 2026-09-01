import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../models/product.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../services/sunmi_printer_service.dart';
import '../utils/mesa_utils.dart';

enum VentaMesaViewState {
  tableSelection,
  comandaDetail,
  createComanda,
}

class VentaMesaScreen extends StatefulWidget {
  const VentaMesaScreen({super.key});

  @override
  State<VentaMesaScreen> createState() => _VentaMesaScreenState();
}

class _VentaMesaScreenState extends State<VentaMesaScreen> {
  VentaMesaViewState _viewState = VentaMesaViewState.tableSelection;
  bool _isLoading = true;
  List<dynamic> _mesas = [];
  String? _selectedMesa;
  Map<String, dynamic>? _activeComanda;
  List<dynamic> _activeComandaItems = [];

  // Al armar un pedido nuevo, permite elegir entre crear una comanda para la
  // mesa (libre) o sumar los productos a una comanda ya activa en otra mesa.
  bool _agregarAExistente = false;
  String? _mesaDestinoExistente;

  // Variables para la creación de comanda
  List<Product> _allProducts = [];
  List<Product> _filteredProducts = [];
  List<String> _categories = [];
  String _selectedCategory = 'Todos';
  String _searchQuery = '';
  final Map<int, int> _cart = {}; // producto_id -> cantidad

  // Sesión del usuario
  int _userId = 1;
  String _userRol = 'MESERO';
  String _userName = '';
  int? _selectedCajaId;

  @override
  void initState() {
    super.initState();
    _initSessionAndLoad();
  }

  Future<void> _initSessionAndLoad() async {
    await _loadUserSession();
    await _cargarMesas();
    await _cargarCatalogo();
  }

  Future<void> _loadUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userId = prefs.getInt('usuario_id') ?? 1;
      _userRol = prefs.getString('usuario_rol') ?? 'MESERO';
      _userName = prefs.getString('usuario_nombre') ?? 'Usuario';
      _selectedCajaId = prefs.getInt('caja_id');
    });
  }

  Future<void> _cargarMesas() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/comandas/mesas-estado');
      if (res.statusCode == 200) {
        setState(() {
          _mesas = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar mesas: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cargarCatalogo() async {
    try {
      final res = await ApiConfig.get('/ventas/productos');
      if (res.statusCode == 200) {
        final List prodData = jsonDecode(res.body);
        final List<Product> loadedProds = prodData.map((e) => Product.fromJson(e)).toList();
        
        final Set<String> cats = {'Todos'};
        for (var p in loadedProds) {
          cats.add(p.categoria);
        }

        setState(() {
          _allProducts = loadedProds;
          _filteredProducts = List.from(_allProducts);
          _categories = cats.toList();
        });
      }
    } catch (e) {
      print('Error al cargar catálogo: $e');
    }
  }

  void _filtrarCatalogo() {
    setState(() {
      _filteredProducts = _allProducts.where((p) {
        final matchesSearch = p.nombre.toLowerCase().contains(_searchQuery.toLowerCase());
        final matchesCategory = _selectedCategory == 'Todos' || p.categoria == _selectedCategory;
        return matchesSearch && matchesCategory;
      }).toList();
    });
  }

  Future<void> _seleccionarMesa(String numMesa, String estado) async {
    setState(() => _selectedMesa = numMesa);
    if (estado == 'libre') {
      setState(() {
        _cart.clear();
        _agregarAExistente = false;
        _mesaDestinoExistente = null;
        _viewState = VentaMesaViewState.createComanda;
      });
    } else {
      await _cargarComandaActiva(numMesa);
    }
  }

  void _irAAgregarProductos() {
    setState(() {
      _cart.clear();
      _searchQuery = '';
      _agregarAExistente = true;
      _mesaDestinoExistente = _selectedMesa;
      _viewState = VentaMesaViewState.createComanda;
    });
    _filtrarCatalogo();
  }

  Future<void> _cargarComandaActiva(String numMesa) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/comandas/mesa/$numMesa');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['activa'] == true) {
          setState(() {
            _activeComanda = data['comanda'];
            _activeComandaItems = data['items'];
            _viewState = VentaMesaViewState.comandaDetail;
          });
        } else {
          // La comanda se cerró en el intermedio, abrir creación
          setState(() {
            _cart.clear();
            _agregarAExistente = false;
            _mesaDestinoExistente = null;
            _viewState = VentaMesaViewState.createComanda;
          });
        }
      }
    } catch (e) {
      print('Error al obtener comanda activa de mesa $numMesa: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Operaciones de Carrito
  void _agregarAlCarrito(Product p) {
    setState(() {
      _cart[p.id] = (_cart[p.id] ?? 0) + 1;
    });
  }

  void _quitarDelCarrito(Product p) {
    setState(() {
      if (_cart.containsKey(p.id)) {
        if (_cart[p.id] == 1) {
          _cart.remove(p.id);
        } else {
          _cart[p.id] = _cart[p.id]! - 1;
        }
      }
    });
  }

  double get _cartTotal {
    double total = 0.0;
    _cart.forEach((id, qty) {
      final p = _allProducts.firstWhere((prod) => prod.id == id);
      total += p.precioVenta * qty;
    });
    return total;
  }

  // Guardar Comanda (nueva, o sumada a una comanda ya activa en otra mesa)
  Future<void> _guardarComanda() async {
    if (_cart.isEmpty) return;
    if (_agregarAExistente) {
      await _agregarProductosAComandaExistente();
      return;
    }
    setState(() => _isLoading = true);

    try {
      final List detalles = [];
      _cart.forEach((id, qty) {
        final p = _allProducts.firstWhere((prod) => prod.id == id);
        detalles.add({
          'producto_id': id,
          'cantidad': qty,
          'precio_unitario': p.precioVenta,
          'subtotal': p.precioVenta * qty,
        });
      });

      final response = await ApiConfig.post('/comandas', {
        'mesa': _selectedMesa,
        'usuario_id': _userId,
        'total': _cartTotal,
        'detalles': detalles,
      });

      if (response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Comanda registrada y enviada a cocina!')),
        );
        setState(() {
          _cart.clear();
          _viewState = VentaMesaViewState.tableSelection;
        });
        await _cargarMesas();
      } else {
        final err = jsonDecode(response.body);
        throw Exception(err['error'] ?? 'Error desconocido');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al crear comanda'),
          content: Text(e.toString().replaceAll('Exception: ', '')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Suma los productos del carrito a la comanda activa de la mesa elegida en
  // "Añadir a existente", en vez de crear una comanda nueva y duplicada.
  Future<void> _agregarProductosAComandaExistente() async {
    if (_mesaDestinoExistente == null) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Falta elegir la mesa'),
          content: const Text('Selecciona a qué mesa con pedido activo quieres sumar estos productos.'),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
        ),
      );
      return;
    }
    setState(() => _isLoading = true);

    try {
      final resActual = await ApiConfig.get('/comandas/mesa/$_mesaDestinoExistente');
      final dataActual = jsonDecode(resActual.body);
      if (resActual.statusCode != 200 || dataActual['activa'] != true) {
        throw Exception('La mesa $_mesaDestinoExistente ya no tiene un pedido activo.');
      }
      final comandaActual = dataActual['comanda'];
      final itemsActuales = (dataActual['items'] as List<dynamic>? ?? []);

      final detallesFinales = itemsActuales.map((it) => {
        'producto_id': it['producto_id'],
        'cantidad': it['cantidad'],
        'precio_unitario': it['precio_unitario'],
        'subtotal': it['subtotal'],
        'es_nuevo': false,
      }).toList();

      // Se agrega siempre como línea nueva y separada, aunque el producto ya
      // estuviera en el pedido: así cocina ve, por ejemplo, "1 x Vino" ya
      // entregado y "1 x Vino" nuevo en vez de fusionarlos en "2 x Vino" nuevo
      // (que ocultaría que solo se agregó uno).
      _cart.forEach((id, qty) {
        final p = _allProducts.firstWhere((prod) => prod.id == id);
        detallesFinales.add({
          'producto_id': id,
          'cantidad': qty,
          'precio_unitario': p.precioVenta,
          'subtotal': p.precioVenta * qty,
          'es_nuevo': true,
        });
      });

      final totalFinal = detallesFinales.fold<double>(0, (acc, it) => acc + (double.tryParse(it['subtotal'].toString()) ?? 0.0));

      final res = await ApiConfig.put('/comandas/mesero/${comandaActual['id']}?usuario_id=$_userId', {
        'detalles': detallesFinales,
        'total': totalFinal,
        'notas': comandaActual['notas'],
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('✅ Productos sumados al pedido de la mesa $_mesaDestinoExistente')),
        );
        setState(() {
          _cart.clear();
          _agregarAExistente = false;
          _mesaDestinoExistente = null;
          _viewState = VentaMesaViewState.tableSelection;
        });
        await _cargarMesas();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al sumar productos');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al sumar productos'),
          content: Text(e.toString().replaceAll('Exception: ', '')),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
        ),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Cambiar estado a ENTREGADA
  Future<void> _marcarEntregada() async {
    if (_activeComanda == null) return;
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.put('/comandas/${_activeComanda!['id']}/estado', {
        'estado': 'ENTREGADA',
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🎉 Pedido marcado como ENTREGADO')),
        );
        await _cargarComandaActiva(_selectedMesa!);
      }
    } catch (e) {
      print('Error al marcar comanda como entregada: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Cancelar Comanda (Cambiar a CANCELADA)
  Future<void> _cancelarComanda() async {
    if (_activeComanda == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancelar Pedido'),
        content: const Text('¿Estás seguro de cancelar esta comanda de mesa? Esta acción liberará la mesa.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Volver', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancelar Pedido', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm != true) return;
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.put('/comandas/${_activeComanda!['id']}/estado', {
        'estado': 'CANCELADA',
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🚫 Comanda cancelada y mesa liberada')),
        );
        setState(() {
          _viewState = VentaMesaViewState.tableSelection;
        });
        await _cargarMesas();
      }
    } catch (e) {
      print('Error al cancelar comanda: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Imprime el detalle completo (con precios) de la comanda activa antes de
  // cobrar, para que el cliente lo revise. No registra ninguna venta.
  Future<void> _imprimirPreCuenta() async {
    if (_activeComanda == null) return;
    try {
      final items = _activeComandaItems.map((item) => {
        'nombre': item['producto_nombre'] ?? '',
        'cantidad': item['cantidad'] ?? 1,
        'subtotal': item['subtotal']?.toString() ?? '0',
      }).toList();
      await SunmiPrinterService.printPreCuenta(
        comandaId: _activeComanda!['id'],
        mesa: _selectedMesa ?? _activeComanda!['mesa'].toString(),
        items: List<Map<String, dynamic>>.from(items),
        total: double.tryParse(_activeComanda!['total'].toString()) ?? 0.0,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Pre-cuenta impresa')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('❌ Error al imprimir: $e')),
        );
      }
    }
  }

  // Diálogo de Cobro para Cajero
  void _procesarCobro() {
    if (_activeComanda == null) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Cobrar ${nombreMesa(_selectedMesa)}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Total a Cobrar: Bs. ${double.parse(_activeComanda!['total'].toString()).toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.accentColor),
            ),
            const SizedBox(height: 16),
            const Text('Selecciona el método de pago:'),
            const SizedBox(height: 12),
            _buildPaymentMethodButton('EFECTIVO', FontAwesomeIcons.moneyBillWave),
            _buildPaymentMethodButton('QR DIGITAL', FontAwesomeIcons.qrcode),
            _buildPaymentMethodButton('CONSUME LO NUESTRO', FontAwesomeIcons.wallet),
            _buildPaymentMethodButton('TARJETA DE DÉBITO/CRÉDITO', FontAwesomeIcons.creditCard),
            _buildPaymentMethodButton('BILLETERA MOVIL', FontAwesomeIcons.mobileScreen),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentMethodButton(String method, dynamic icon) {
    return ElevatedButton.icon(
      onPressed: () => _confirmarCobro(method),
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        alignment: Alignment.centerLeft,
      ),
      icon: FaIcon(icon, size: 16, color: AppTheme.accentColor),
      label: Text(method, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
    );
  }

  Future<void> _confirmarCobro(String method) async {
    Navigator.pop(context); // Cerrar diálogo de cobro
    setState(() => _isLoading = true);

    try {
      final response = await ApiConfig.post('/comandas/${_activeComanda!['id']}/pagar', {
        'metodo_pago': method,
        'usuario_id': _userId,
      });

      if (response.statusCode == 201) {
        final responseData = jsonDecode(response.body);
        final ventaId = responseData['venta_id'] ?? 0;
        final totalCobrado = double.tryParse(_activeComanda!['total'].toString()) ?? 0.0;
        final ticketRecibo = _generarTicketVenta(method);
        
        // Datos para impresión Sunmi
        final List<Map<String, dynamic>> printItems = _activeComandaItems.map((item) => {
          'nombre': item['producto_nombre'] ?? '',
          'cantidad': item['cantidad'] ?? 1,
          'subtotal': item['subtotal']?.toString() ?? '0',
        }).toList();
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ ¡Venta registrada y mesa liberada exitosamente!')),
        );
        
        setState(() {
          _viewState = VentaMesaViewState.tableSelection;
        });
        await _cargarMesas();

        // Mostrar el recibo de venta con opción de imprimir
        _mostrarTicketDialog(
          'Recibo de Venta (${nombreMesa(_selectedMesa)})',
          ticketRecibo,
          printData: {
            'ventaId': ventaId,
            'total': totalCobrado,
            'metodoPago': method,
            'items': printItems,
          },
        );
      } else {
        final err = jsonDecode(response.body);
        throw Exception(err['error'] ?? 'Error al liquidar comanda');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al cobrar'),
          content: Text(e.toString().replaceAll('Exception: ', '')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Generadores de texto para impresión
  String _generarTicketComanda() {
    if (_activeComanda == null) return '';
    final StringBuffer ticket = StringBuffer();
    ticket.writeln('================================');
    ticket.writeln('          CAFÉ LA PAZ           ');
    ticket.writeln('       TICKET DE COMANDA        ');
    ticket.writeln('================================');
    ticket.writeln('Mesa: ${_activeComanda!['mesa']}');
    ticket.writeln('Mesero: ${_activeComanda!['mesero_nombre'] ?? _userName}');
    ticket.writeln('Estado: ${_activeComanda!['estado']}');
    final String fecha = _activeComanda!['fecha_creacion'] != null
        ? (DateTime.tryParse(_activeComanda!['fecha_creacion'].toString())?.toLocal().toString().substring(0, 16) ?? DateTime.now().toString().substring(0, 16))
        : DateTime.now().toString().substring(0, 16);
    ticket.writeln('Fecha: $fecha');
    ticket.writeln('--------------------------------');
    ticket.writeln('Cant  Producto                  ');
    ticket.writeln('--------------------------------');
    for (var item in _activeComandaItems) {
      final String cant = item['cantidad'].toString().padRight(5);
      final String name = item['producto_nombre'].toString();
      ticket.writeln('$cant $name');
    }
    ticket.writeln('================================');
    return ticket.toString();
  }

  String _generarTicketVenta(String metodoPago) {
    if (_activeComanda == null) return '';
    final StringBuffer ticket = StringBuffer();
    ticket.writeln('================================');
    ticket.writeln('          CAFÉ LA PAZ           ');
    ticket.writeln('        TICKET DE VENTA         ');
    ticket.writeln('================================');
    ticket.writeln('Mesa: ${_activeComanda!['mesa']}');
    ticket.writeln('Cajero: $_userName');
    ticket.writeln('Método Pago: $metodoPago');
    ticket.writeln('Fecha: ${DateTime.now().toString().substring(0, 16)}');
    ticket.writeln('--------------------------------');
    ticket.writeln('Cant  Producto          Subtotal');
    ticket.writeln('--------------------------------');
    for (var item in _activeComandaItems) {
      final String cant = item['cantidad'].toString().padRight(5);
      final String name = item['producto_nombre'].toString();
      final String sub = 'Bs. ${double.parse(item['subtotal'].toString()).toStringAsFixed(2)}';
      
      // Ajustar texto
      final String safeName = name.length > 16 ? name.substring(0, 16) : name.padRight(16);
      ticket.writeln('$cant $safeName $sub');
    }
    ticket.writeln('--------------------------------');
    ticket.writeln('Total: Bs. ${double.parse(_activeComanda!['total'].toString()).toStringAsFixed(2)}');
    ticket.writeln('================================');
    ticket.writeln('     ¡Gracias por su consumo!   ');
    ticket.writeln('================================');
    return ticket.toString();
  }

  void _mostrarTicketDialog(String titulo, String contenido, {Map<String, dynamic>? printData}) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(
          titulo, 
          style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)
        ),
        content: Container(
          width: double.maxFinite,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: SingleChildScrollView(
            child: Text(
              contenido,
              style: GoogleFonts.robotoMono(
                color: Colors.black,
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: contenido));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Ticket copiado al portapapeles 📋')),
              );
            },
            icon: const Icon(Icons.copy, size: 16, color: AppTheme.accentColor),
            label: const Text('Copiar', style: TextStyle(color: AppTheme.accentColor)),
          ),
          if (printData != null)
            StatefulBuilder(
              builder: (context, setBtn) {
                bool printing = false;
                return TextButton.icon(
                  onPressed: printing ? null : () async {
                    setBtn(() => printing = true);
                    try {
                      await SunmiPrinterService.printTicketVenta(
                        ventaId: printData['ventaId'] ?? 0,
                        fecha: DateTime.now().toString().substring(0, 16),
                        items: List<Map<String, dynamic>>.from(printData['items'] ?? []),
                        total: (printData['total'] as num?)?.toDouble() ?? 0.0,
                        metodoPago: printData['metodoPago'] ?? 'EFECTIVO',
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('✅ Ticket impreso')),
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('❌ Error: $e')),
                        );
                      }
                    } finally {
                      setBtn(() => printing = false);
                    }
                  },
                  icon: printing 
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const FaIcon(FontAwesomeIcons.print, size: 14, color: AppTheme.accentColor),
                  label: Text(
                    printing ? 'Imprimiendo...' : 'Imprimir',
                    style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.bold),
                  ),
                );
              },
            ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cerrar', style: TextStyle(color: AppTheme.textMuted)),
          ),
        ],
      ),
    );
  }

  // Builders para los diferentes estados
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.utensils, size: 18, color: AppTheme.accentColor),
            const SizedBox(width: 8),
            Text(
              _viewState == VentaMesaViewState.tableSelection
                  ? 'Venta por Mesa'
                  : _viewState == VentaMesaViewState.comandaDetail
                      ? '${nombreMesa(_selectedMesa)} - Detalle'
                      : '${nombreMesa(_selectedMesa)} - Crear Comanda',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        leading: _viewState != VentaMesaViewState.tableSelection
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  setState(() {
                    _viewState = VentaMesaViewState.tableSelection;
                  });
                },
              )
            : null,
      ),
      body: _isLoading
          ? const Center(child: PulsingCoffeeLoader(message: 'Procesando...'))
          : _buildActiveView(),
    );
  }

  Widget _buildActiveView() {
    switch (_viewState) {
      case VentaMesaViewState.tableSelection:
        return _buildTableSelectionView();
      case VentaMesaViewState.comandaDetail:
        return _buildComandaDetailView();
      case VentaMesaViewState.createComanda:
        return _buildCreateComandaView();
    }
  }

  String _pisoSeleccionado = 'PLANTA_BAJA';

  // 1. Selector de Mesas
  Widget _buildTableSelectionView() {
    final mesasFiltradas = _mesas.where((m) => m['piso'] == _pisoSeleccionado).toList();

    return RefreshIndicator(
      onRefresh: _cargarMesas,
      color: AppTheme.accentColor,
      child: Column(
        children: [
          // Selector de Piso
          Padding(
            padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 8.0),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _pisoSeleccionado = 'PLANTA_BAJA';
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _pisoSeleccionado == 'PLANTA_BAJA'
                            ? AppTheme.accentColor
                            : AppTheme.secondaryDark,
                        borderRadius: const BorderRadius.horizontal(left: Radius.circular(16)),
                        border: Border.all(color: AppTheme.borderDark),
                      ),
                      child: const Center(
                        child: Text(
                          'PLANTA BAJA',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _pisoSeleccionado = 'PLANTA_ALTA';
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _pisoSeleccionado == 'PLANTA_ALTA'
                            ? AppTheme.accentColor
                            : AppTheme.secondaryDark,
                        borderRadius: const BorderRadius.horizontal(right: Radius.circular(16)),
                        border: Border.all(color: AppTheme.borderDark),
                      ),
                      child: const Center(
                        child: Text(
                          'PRIMER PISO',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Leyenda de Estados
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 4.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle),
                ),
                const SizedBox(width: 4),
                const Text('Libre', style: TextStyle(fontSize: 11, color: Colors.grey)),
                const SizedBox(width: 20),
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle),
                ),
                const SizedBox(width: 4),
                const Text('Ocupada', style: TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
          ),
          
          const SizedBox(height: 8),

          // Canvas / Plano
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryDark.withOpacity(0.5),
                    border: Border.all(color: AppTheme.borderDark, width: 2),
                  ),
                  child: _mesas.isEmpty
                      ? const Center(child: Text('No hay mesas disponibles.'))
                      : LayoutBuilder(
                          builder: (context, constraints) {
                            final canvasWidth = constraints.maxWidth;
                            final canvasHeight = constraints.maxHeight;

                            return Stack(
                              children: [
                                // Cuadrícula de diseño de fondo
                                CustomPaint(
                                  size: Size(canvasWidth, canvasHeight),
                                  painter: GridPainter(),
                                ),
                                
                                ...mesasFiltradas.map((m) {
                                  final numMesa = m['mesa']?.toString() ?? '';
                                  final estado = m['estado'] ?? 'libre';
                                  final comanda = m['comanda'];
                                  final isLibre = estado == 'libre';

                                  // Sanitizar coordenadas
                                  double px = 10.0;
                                  double py = 10.0;
                                  if (m['pos_x'] != null) {
                                    px = (m['pos_x'] as num).toDouble();
                                  }
                                  if (m['pos_y'] != null) {
                                    py = (m['pos_y'] as num).toDouble();
                                  }

                                  // Convertir porcentaje a pixeles
                                  double left = (px / 100.0) * canvasWidth;
                                  double top = (py / 100.0) * canvasHeight;

                                  // Clampear para que quepa bien (tamaño del widget de mesa es 80x95)
                                  left = left.clamp(0.0, canvasWidth - 80.0);
                                  top = top.clamp(0.0, canvasHeight - 95.0);

                                  return Positioned(
                                    left: left,
                                    top: top,
                                    child: Material(
                                      color: Colors.transparent,
                                      child: InkWell(
                                        onTap: () => _seleccionarMesa(numMesa, estado),
                                        borderRadius: BorderRadius.circular(20),
                                        child: SizedBox(
                                          width: 80,
                                          height: 95,
                                          child: Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              Container(
                                                width: 55,
                                                height: 55,
                                                decoration: BoxDecoration(
                                                  color: AppTheme.primaryDark,
                                                  shape: BoxShape.circle,
                                                  border: Border.all(
                                                    color: isLibre ? Colors.greenAccent : Colors.redAccent,
                                                    width: 3,
                                                  ),
                                                  boxShadow: [
                                                    BoxShadow(
                                                      color: (isLibre ? Colors.greenAccent : Colors.redAccent).withOpacity(0.2),
                                                      blurRadius: 8,
                                                      spreadRadius: 1,
                                                    ),
                                                  ],
                                                ),
                                                child: Center(
                                                  child: Icon(
                                                    isLibre ? Icons.chair_alt : Icons.restaurant,
                                                    size: 20,
                                                    color: isLibre ? Colors.greenAccent : Colors.redAccent,
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                nombreMesa(numMesa),
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w900,
                                                  fontSize: 11,
                                                  color: Colors.white,
                                                  fontFamily: 'Outfit',
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              if (!isLibre && comanda != null)
                                                Text(
                                                  'Bs. ${double.parse(comanda['total'].toString()).toStringAsFixed(1)}',
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w900,
                                                    fontSize: 10,
                                                    color: AppTheme.accentColor,
                                                  ),
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ],
                            );
                          },
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 2. Detalle de Comanda Activa
  Widget _buildComandaDetailView() {
    if (_activeComanda == null) {
      return const Center(child: Text('No hay datos activos de comanda.'));
    }

    final isCreada = _activeComanda!['estado'] == 'CREADA';
    final total = double.parse(_activeComanda!['total'].toString());
    final cajeroOAdmin = _userRol == 'CAJERO' || _userRol == 'ADMIN' || _userRol == 'ADMINISTRADOR';
    final horaComanda = DateTime.tryParse((_activeComanda!['fecha_creacion'] ?? '').toString())?.toLocal();
    final horaComandaTexto = horaComanda != null
        ? '${horaComanda.hour.toString().padLeft(2, '0')}:${horaComanda.minute.toString().padLeft(2, '0')}'
        : '';

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cabecera premium
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.04)),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Pedido #${_activeComanda!['id']}',
                          style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Atendido por: ${_activeComanda!['mesero_nombre'] ?? 'Mesero'}',
                          style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted),
                        ),
                        if (horaComandaTexto.isNotEmpty)
                          Text(
                            'Hora: $horaComandaTexto',
                            style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted),
                          ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isCreada ? Colors.amber.withOpacity(0.15) : Colors.greenAccent.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _activeComanda!['estado'],
                        style: GoogleFonts.outfit(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isCreada ? Colors.amber : Colors.greenAccent,
                        ),
                      ),
                    ),
                  ],
                ),
                const Divider(color: Colors.white10, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'TOTAL DEL PEDIDO',
                      style: GoogleFonts.outfit(fontSize: 13, color: AppTheme.textMuted, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      'Bs. ${total.toStringAsFixed(2)}',
                      style: GoogleFonts.outfit(fontSize: 22, fontWeight: FontWeight.w900, color: AppTheme.accentColor),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Detalle de Productos',
                style: GoogleFonts.outfit(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              TextButton.icon(
                onPressed: _irAAgregarProductos,
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.accentColor,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                ),
                icon: const Icon(Icons.add_circle_outline, size: 18),
                label: const Text('Agregar producto', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              itemCount: _activeComandaItems.length,
              itemBuilder: (context, index) {
                final item = _activeComandaItems[index];
                final sub = double.parse(item['subtotal'].toString());
                final precio = double.parse(item['precio_unitario'].toString());

                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryDark.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppTheme.accentColor.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          'x${item['cantidad']}',
                          style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.accentColor),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item['producto_nombre'],
                              style: GoogleFonts.outfit(fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                            Text(
                              'Bs. ${precio.toStringAsFixed(2)} c/u',
                              style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        'Bs. ${sub.toStringAsFixed(2)}',
                        style: GoogleFonts.outfit(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          
          // Panel de acciones
          Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        final txt = _generarTicketComanda();
                        _mostrarTicketDialog('Comanda para Cocina (${nombreMesa(_selectedMesa)})', txt);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white.withOpacity(0.04),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(0, 52),
                      ),
                      icon: const Icon(Icons.print, size: 16, color: AppTheme.textMuted),
                      label: const Text('Comanda Cocina', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (isCreada)
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _marcarEntregada,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal.shade800,
                          foregroundColor: Colors.white,
                          side: BorderSide(color: Colors.teal.shade600),
                          minimumSize: const Size(0, 52),
                        ),
                        icon: const Icon(Icons.check_circle_outline, size: 16),
                        label: const Text('Entregar Comida', style: TextStyle(fontSize: 12)),
                      ),
                    ),
                ],
              ),
              if (cajeroOAdmin) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _imprimirPreCuenta,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.accentColor,
                    side: const BorderSide(color: AppTheme.accentColor),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  icon: const Icon(Icons.receipt_long, size: 16),
                  label: const Text('Imprimir Pre-cuenta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 8),
                ElevatedButton.icon(
                  onPressed: _procesarCobro,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accentColor,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(52),
                  ),
                  icon: const FaIcon(FontAwesomeIcons.cashRegister, size: 16),
                  label: const Text('COBRAR Y CERRAR MESA'),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _cancelarComanda,
                  icon: const Icon(Icons.delete_outline, size: 14, color: Colors.redAccent),
                  label: const Text('CANCELAR PEDIDO', style: TextStyle(color: Colors.redAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  // 3. Crear Comanda (Añadir productos)
  Widget _buildCreateComandaView() {
    final hasItems = _cart.isNotEmpty;
    final mesasOcupadas = _mesas.where((m) => m['estado'] == 'ocupada').toList();

    return Column(
      children: [
        // Elegir si el pedido es nuevo o se suma a uno ya activo en otra mesa
        if (mesasOcupadas.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SegmentedButton<bool>(
                  segments: [
                    ButtonSegment(value: false, label: Text('Nueva comanda (${nombreMesa(_selectedMesa)})')),
                    const ButtonSegment(value: true, label: Text('Añadir a existente')),
                  ],
                  selected: {_agregarAExistente},
                  onSelectionChanged: (sel) {
                    setState(() {
                      _agregarAExistente = sel.first;
                      if (!_agregarAExistente) _mesaDestinoExistente = null;
                    });
                  },
                ),
                if (_agregarAExistente) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: _mesaDestinoExistente,
                    decoration: const InputDecoration(labelText: 'Mesa con pedido activo'),
                    items: mesasOcupadas
                        .map((m) => DropdownMenuItem<String>(
                              value: m['mesa'].toString(),
                              child: Text(nombreMesa(m['mesa'])),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _mesaDestinoExistente = v),
                  ),
                ],
              ],
            ),
          ),
        // Buscador
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: TextField(
            onChanged: (val) {
              setState(() => _searchQuery = val);
              _filtrarCatalogo();
            },
            decoration: InputDecoration(
              hintText: 'Buscar productos...',
              prefixIcon: const Icon(Icons.search, color: AppTheme.textMuted),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: AppTheme.textMuted),
                      onPressed: () {
                        setState(() {
                          _searchQuery = '';
                        });
                        _filtrarCatalogo();
                      },
                    )
                  : null,
            ),
          ),
        ),
        
        // Categorías scroll
        SizedBox(
          height: 40,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: _categories.length,
            itemBuilder: (context, index) {
              final cat = _categories[index];
              final isSel = _selectedCategory == cat;
              return Padding(
                padding: const EdgeInsets.only(right: 6.0),
                child: ChoiceChip(
                  label: Text(cat),
                  selected: isSel,
                  selectedColor: AppTheme.accentColor,
                  backgroundColor: AppTheme.secondaryDark,
                  labelStyle: GoogleFonts.outfit(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isSel ? Colors.white : AppTheme.textMuted,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: BorderSide(
                      color: isSel ? AppTheme.accentColor : Colors.white.withOpacity(0.05),
                    ),
                  ),
                  onSelected: (selected) {
                    if (selected) {
                      setState(() => _selectedCategory = cat);
                      _filtrarCatalogo();
                    }
                  },
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),

        // Listado de Productos
        Expanded(
          child: _filteredProducts.isEmpty
              ? const Center(child: Text('No hay productos que coincidan'))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _filteredProducts.length,
                  itemBuilder: (context, index) {
                    final p = _filteredProducts[index];
                    final qty = _cart[p.id] ?? 0;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.secondaryDark,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: qty > 0 ? AppTheme.accentColor.withOpacity(0.3) : Colors.white.withOpacity(0.03),
                        ),
                      ),
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: p.imagenUrl != null
                                ? Image.network(
                                    p.imagenUrl!,
                                    width: 55,
                                    height: 55,
                                    fit: BoxFit.cover,
                                    errorBuilder: (c, e, s) => Container(
                                      width: 55,
                                      height: 55,
                                      color: Colors.white10,
                                      child: const Icon(Icons.broken_image, size: 20),
                                    ),
                                  )
                                : Container(
                                    width: 55,
                                    height: 55,
                                    color: Colors.white10,
                                    child: const Icon(Icons.fastfood, size: 20, color: AppTheme.accentColor),
                                  ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  p.nombre,
                                  style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                Text(
                                  p.categoria,
                                  style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Bs. ${p.precioVenta.toStringAsFixed(2)}',
                                  style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.accentColor),
                                ),
                              ],
                            ),
                          ),
                          
                          // Controles +/-
                          Row(
                            children: [
                              if (qty > 0) ...[
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline, color: Colors.redAccent, size: 24),
                                  onPressed: () => _quitarDelCarrito(p),
                                ),
                                Text(
                                  '$qty',
                                  style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                              ],
                              IconButton(
                                icon: Icon(
                                  qty > 0 ? Icons.add_circle : Icons.add_circle_outline, 
                                  color: qty > 0 ? AppTheme.accentColor : Colors.greenAccent, 
                                  size: 24
                                ),
                                onPressed: () => _agregarAlCarrito(p),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),

        // Barra inferior del Carrito
        if (hasItems)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 10,
                  offset: const Offset(0, -3),
                ),
              ],
            ),
            child: SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total a Registrar:',
                        style: GoogleFonts.outfit(fontSize: 14, color: AppTheme.textMuted, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Bs. ${_cartTotal.toStringAsFixed(2)}',
                        style: GoogleFonts.outfit(fontSize: 20, fontWeight: FontWeight.w900, color: AppTheme.accentColor),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: (_agregarAExistente && _mesaDestinoExistente == null) ? null : _guardarComanda,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentColor,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(50),
                    ),
                    icon: const Icon(Icons.receipt_long),
                    label: Text(_agregarAExistente ? 'AGREGAR A LA MESA $_mesaDestinoExistente' : 'GUARDAR COMANDA Y ENVIAR'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.borderDark.withOpacity(0.2)
      ..strokeWidth = 1.0;

    const double step = 25.0;

    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
