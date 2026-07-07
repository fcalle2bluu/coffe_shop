import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../models/product.dart';
import '../widgets/pulsing_coffee_loader.dart';

/// Pantalla liviana para que el mesero arme un pedido y lo mande a cocina.
/// Pensada para uso vertical y rápido en el celular: elegir productos primero,
/// mesa y confirmación al final (mismo flujo que "Realizar Pedido" en la web).
class RealizarPedidoScreen extends StatefulWidget {
  const RealizarPedidoScreen({super.key});

  @override
  State<RealizarPedidoScreen> createState() => _RealizarPedidoScreenState();
}

class _RealizarPedidoScreenState extends State<RealizarPedidoScreen> {
  bool _loading = true;
  String? _error;

  List<Product> _productos = [];
  List<dynamic> _mesas = [];
  final Map<int, int> _carrito = {}; // producto_id -> cantidad
  String _busqueda = '';
  String _categoriaSeleccionada = 'Todas';

  int _userId = 1;
  String _userName = 'Usuario';

  int _vista = 0; // 0 = Pedido, 1 = Control
  bool _loadingControl = false;
  List<dynamic> _misComandas = [];

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  Future<void> _iniciar() async {
    final prefs = await SharedPreferences.getInstance();
    _userId = prefs.getInt('usuario_id') ?? 1;
    _userName = prefs.getString('usuario_nombre') ?? 'Usuario';
    await _cargarDatos();
  }

  Future<void> _cargarDatos() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ApiConfig.get('/ventas/productos'),
        ApiConfig.get('/mesas'),
      ]);

      final prodRes = results[0];
      final mesasRes = results[1];

      if (prodRes.statusCode == 200) {
        final data = jsonDecode(prodRes.body) as List<dynamic>;
        _productos = data.map((p) => Product.fromJson(p)).toList();
      }
      if (mesasRes.statusCode == 200) {
        _mesas = jsonDecode(mesasRes.body) as List<dynamic>;
      }
    } catch (e) {
      _error = 'Error de conexión: $e';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<String> get _categorias {
    final set = <String>{'Todas'};
    for (final p in _productos) {
      set.add(p.categoria);
    }
    return set.toList();
  }

  List<Product> get _productosFiltrados {
    return _productos.where((p) {
      final coincideBusqueda = p.nombre.toLowerCase().contains(_busqueda.toLowerCase());
      final coincideCategoria = _categoriaSeleccionada == 'Todas' || p.categoria == _categoriaSeleccionada;
      return coincideBusqueda && coincideCategoria;
    }).toList();
  }

  int get _cantidadTotal => _carrito.values.fold(0, (a, b) => a + b);

  double get _totalCarrito {
    double total = 0;
    _carrito.forEach((id, cant) {
      final prod = _productos.firstWhere((p) => p.id == id, orElse: () => Product(id: id, nombre: '', precioVenta: 0, categoria: ''));
      total += prod.precioVenta * cant;
    });
    return total;
  }

  void _agregarProducto(Product p) {
    setState(() {
      _carrito[p.id] = (_carrito[p.id] ?? 0) + 1;
    });
  }

  void _cambiarCantidad(int productoId, int delta) {
    setState(() {
      final actual = (_carrito[productoId] ?? 0) + delta;
      if (actual <= 0) {
        _carrito.remove(productoId);
      } else {
        _carrito[productoId] = actual;
      }
    });
  }

  Future<void> _abrirCarrito() async {
    if (_carrito.isEmpty) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CarritoSheet(
        productos: _productos,
        carrito: _carrito,
        mesas: _mesas,
        onCambiarCantidad: _cambiarCantidad,
        onGenerarComanda: _generarComanda,
      ),
    );
    if (mounted) setState(() {});
  }

  Future<String?> _generarComanda(String mesa) async {
    try {
      final detalles = _carrito.entries.map((e) {
        final prod = _productos.firstWhere((p) => p.id == e.key);
        return {
          'producto_id': prod.id,
          'cantidad': e.value,
          'precio_unitario': prod.precioVenta,
          'subtotal': prod.precioVenta * e.value,
        };
      }).toList();

      final res = await ApiConfig.post('/comandas', {
        'mesa': mesa,
        'usuario_id': _userId,
        'total': _totalCarrito,
        'detalles': detalles,
        'fecha_hora': DateTime.now().toIso8601String(),
      });

      final data = jsonDecode(res.body);
      if (res.statusCode != 201) {
        return data['error']?.toString() ?? 'Error al generar la comanda';
      }

      setState(() => _carrito.clear());
      return null;
    } catch (e) {
      return 'Error de conexión: $e';
    }
  }

  Future<void> _cargarMisComandas() async {
    setState(() => _loadingControl = true);
    try {
      final res = await ApiConfig.get('/comandas/mesero/activas?usuario_id=$_userId');
      if (res.statusCode == 200) {
        _misComandas = jsonDecode(res.body) as List<dynamic>;
      }
    } catch (_) {
      // Silencioso: se puede reintentar con el botón de actualizar.
    } finally {
      if (mounted) setState(() => _loadingControl = false);
    }
  }

  Future<void> _eliminarComanda(int id) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar comanda?'),
        content: const Text('Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar', style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
    if (confirmar != true) return;

    try {
      final res = await ApiConfig.delete('/comandas/$id?usuario_id=$_userId');
      if (res.statusCode == 200) {
        _cargarMisComandas();
      } else {
        final data = jsonDecode(res.body);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['error'] ?? 'Error al eliminar')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Realizar Pedido', style: TextStyle(fontSize: 16)),
            Text(_userName, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.normal)),
          ],
        ),
        actions: [
          if (_vista == 1)
            IconButton(icon: const Icon(Icons.refresh), onPressed: _cargarMisComandas),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.secondaryDark,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Expanded(child: _tabButton('Pedido', 0)),
                  Expanded(child: _tabButton('Control', 1)),
                ],
              ),
            ),
          ),
          Expanded(
            child: _vista == 0 ? _buildVistaPedido() : _buildVistaControl(),
          ),
        ],
      ),
      floatingActionButton: _vista == 0 && _carrito.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: _abrirCarrito,
              backgroundColor: AppTheme.accentColor,
              icon: Badge(
                label: Text('$_cantidadTotal'),
                child: const Icon(Icons.shopping_basket, color: Colors.white),
              ),
              label: Text('Bs. ${_totalCarrito.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            )
          : null,
    );
  }

  Widget _tabButton(String texto, int index) {
    final seleccionado = _vista == index;
    return GestureDetector(
      onTap: () {
        setState(() => _vista = index);
        if (index == 1) _cargarMisComandas();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: seleccionado ? AppTheme.accentColor : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Text(
          texto,
          style: TextStyle(
            color: seleccionado ? Colors.white : AppTheme.textMuted,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ),
    );
  }

  Widget _buildVistaPedido() {
    if (_loading) {
      return const Center(child: PulsingCoffeeLoader(message: 'Cargando productos...'));
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _cargarDatos, child: const Text('Reintentar')),
          ],
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            onChanged: (v) => setState(() => _busqueda = v),
            decoration: InputDecoration(
              hintText: 'Buscar producto...',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: AppTheme.secondaryDark,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
        ),
        SizedBox(
          height: 36,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: _categorias.map((c) {
              final seleccionado = c == _categoriaSeleccionada;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  label: Text(c, style: const TextStyle(fontSize: 11)),
                  selected: seleccionado,
                  onSelected: (_) => setState(() => _categoriaSeleccionada = c),
                  selectedColor: AppTheme.accentColor,
                  backgroundColor: AppTheme.secondaryDark,
                  labelStyle: TextStyle(color: seleccionado ? Colors.white : AppTheme.textMuted, fontWeight: FontWeight.bold),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.95,
            ),
            itemCount: _productosFiltrados.length,
            itemBuilder: (context, index) {
              final p = _productosFiltrados[index];
              final enCarrito = _carrito[p.id] ?? 0;
              return GestureDetector(
                onTap: () => _agregarProducto(p),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryDark,
                    borderRadius: BorderRadius.circular(16),
                    border: enCarrito > 0 ? Border.all(color: AppTheme.accentColor, width: 2) : null,
                  ),
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          p.nombre,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.textLight),
                        ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Bs. ${p.precioVenta.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.w900, fontSize: 13)),
                          if (enCarrito > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: AppTheme.accentColor, borderRadius: BorderRadius.circular(8)),
                              child: Text('$enCarrito', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildVistaControl() {
    if (_loadingControl) {
      return const Center(child: PulsingCoffeeLoader(message: 'Cargando tus comandas...'));
    }
    if (_misComandas.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.clipboardCheck, size: 48, color: AppTheme.textMuted),
            const SizedBox(height: 12),
            const Text('No tienes comandas registradas hoy.', style: TextStyle(color: AppTheme.textMuted)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _cargarMisComandas,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _misComandas.length,
        itemBuilder: (context, index) {
          final c = _misComandas[index];
          final estadoCocina = c['estado_cocina'] ?? 'PENDIENTE';
          final estado = c['estado'] ?? '';
          final colorCocina = estadoCocina == 'COMPLETADA'
              ? Colors.green
              : (estadoCocina == 'RECHAZADA' ? Colors.redAccent : AppTheme.accentColor);

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Mesa ${c['mesa']}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppTheme.textLight)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: colorCocina.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                      child: Text(estadoCocina, style: TextStyle(color: colorCocina, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Bs. ${double.tryParse(c['total'].toString())?.toStringAsFixed(2) ?? c['total']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textLight)),
                    Text(estado, style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                  ],
                ),
                if (estado != 'PAGADA') ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => _eliminarComanda(c['id']),
                      icon: const Icon(Icons.delete_outline, size: 16, color: Colors.redAccent),
                      label: const Text('Eliminar', style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                      style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.redAccent)),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Bottom sheet con el detalle del carrito, selector de mesa y confirmación.
class _CarritoSheet extends StatefulWidget {
  final List<Product> productos;
  final Map<int, int> carrito;
  final List<dynamic> mesas;
  final void Function(int productoId, int delta) onCambiarCantidad;
  final Future<String?> Function(String mesa) onGenerarComanda;

  const _CarritoSheet({
    required this.productos,
    required this.carrito,
    required this.mesas,
    required this.onCambiarCantidad,
    required this.onGenerarComanda,
  });

  @override
  State<_CarritoSheet> createState() => _CarritoSheetState();
}

class _CarritoSheetState extends State<_CarritoSheet> {
  String? _mesaSeleccionada;
  bool _enviando = false;
  String? _error;

  double get _total {
    double total = 0;
    widget.carrito.forEach((id, cant) {
      final prod = widget.productos.firstWhere((p) => p.id == id, orElse: () => Product(id: id, nombre: '', precioVenta: 0, categoria: ''));
      total += prod.precioVenta * cant;
    });
    return total;
  }

  Future<void> _confirmar() async {
    if (_mesaSeleccionada == null) {
      setState(() => _error = 'Selecciona una mesa.');
      return;
    }
    setState(() {
      _enviando = true;
      _error = null;
    });
    final error = await widget.onGenerarComanda(_mesaSeleccionada!);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _enviando = false;
        _error = error;
      });
    } else {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ Comanda enviada a cocina para la mesa $_mesaSeleccionada')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Tu pedido', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: AppTheme.textLight)),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: widget.carrito.entries.map((e) {
                final prod = widget.productos.firstWhere((p) => p.id == e.key);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(prod.nombre, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w600)),
                      ),
                      IconButton(
                        onPressed: () => setState(() => widget.onCambiarCantidad(prod.id, -1)),
                        icon: const Icon(Icons.remove_circle_outline, color: AppTheme.textMuted),
                        visualDensity: VisualDensity.compact,
                      ),
                      Text('${e.value}', style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.bold)),
                      IconButton(
                        onPressed: () => setState(() => widget.onCambiarCantidad(prod.id, 1)),
                        icon: const Icon(Icons.add_circle_outline, color: AppTheme.accentColor),
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: DropdownButtonFormField<String>(
              initialValue: _mesaSeleccionada,
              decoration: InputDecoration(
                labelText: 'Mesa',
                filled: true,
                fillColor: AppTheme.primaryDark,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
              dropdownColor: AppTheme.secondaryDark,
              items: widget.mesas.map<DropdownMenuItem<String>>((m) {
                return DropdownMenuItem(value: m['numero'].toString(), child: Text('Mesa ${m['numero']}'));
              }).toList(),
              onChanged: (v) => setState(() => _mesaSeleccionada = v),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _enviando ? null : _confirmar,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentColor,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _enviando
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text('GENERAR COMANDA · Bs. ${_total.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
