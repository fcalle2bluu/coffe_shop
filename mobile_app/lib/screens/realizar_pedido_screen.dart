import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../models/product.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../utils/mesa_utils.dart';

/// Pantalla liviana para que el mesero arme un pedido y lo mande a cocina.
/// Pensada para uso vertical y rápido en el celular: elegir productos primero,
/// mesa y confirmación al final (mismo flujo que "Realizar Pedido" en la web).
class RealizarPedidoScreen extends StatefulWidget {
  const RealizarPedidoScreen({super.key});

  @override
  State<RealizarPedidoScreen> createState() => RealizarPedidoScreenState();
}

class RealizarPedidoScreenState extends State<RealizarPedidoScreen> {
  bool _loading = true;
  String? _error;

  List<Product> _productos = [];
  List<dynamic> _mesas = [];
  final Map<int, int> _carrito = {}; // producto_id -> cantidad
  String _busqueda = '';
  String _categoriaSeleccionada = 'Todas';

  int _userId = 1;

  int _vista = 0; // 0 = Pedido, 1 = Control
  bool _loadingControl = false;
  List<dynamic> _misComandas = [];

  final TextEditingController _searchController = TextEditingController();
  bool _tecladoAbierto = false;
  bool _vistaLista = true; // false = mosaicos (grid), true = listado

  // Expuestos para que main_navigation controle estos botones desde la barra
  // de título compartida (a través de un GlobalKey a este estado).
  bool get vistaLista => _vistaLista;
  void toggleVista() => setState(() => _vistaLista = !_vistaLista);
  Future<void> refrescarCatalogo() => _cargarDatos();

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _iniciar() async {
    final prefs = await SharedPreferences.getInstance();
    _userId = prefs.getInt('usuario_id') ?? 1;
    await _cargarDatos();
  }

  String _formatearHoraComanda(Map<String, dynamic> c) {
    final raw = c['fecha_hora_cliente'] ?? c['fecha_creacion'];
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw.toString())?.toLocal();
    if (dt == null) return '';
    String dos(int n) => n.toString().padLeft(2, '0');
    return 'Hora: ${dos(dt.hour)}:${dos(dt.minute)}';
  }

  Future<void> _cargarDatos() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ApiConfig.get('/ventas/productos'),
        ApiConfig.get('/comandas/mesas-estado'),
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
    // Si hay texto de búsqueda, se busca en TODOS los productos sin importar
    // la categoría seleccionada, con tolerancia a errores de tecleo (distancia
    // de edición). La categoría solo filtra cuando no se busca.
    if (_busqueda.isNotEmpty) {
      final coincidencias = <MapEntry<Product, int>>[];
      for (final p in _productos) {
        final puntaje = _puntajeCoincidencia(p.nombre, _busqueda);
        if (puntaje != null) coincidencias.add(MapEntry(p, puntaje));
      }
      coincidencias.sort((a, b) {
        final cmp = a.value.compareTo(b.value);
        if (cmp != 0) return cmp;
        return b.key.cantidadVendida.compareTo(a.key.cantidadVendida);
      });
      return coincidencias.map((e) => e.key).toList();
    }
    final resultado = _productos.where((p) => _categoriaSeleccionada == 'Todas' || p.categoria == _categoriaSeleccionada).toList();
    // Los más vendidos primero, para que lo que más se pide aparezca de entrada.
    resultado.sort((a, b) => b.cantidadVendida.compareTo(a.cantidadVendida));
    return resultado;
  }

  /// Quita tildes/ñ para que "cafe"/"café" o "nino"/"niño" se traten igual.
  String _normalizarTexto(String s) {
    const conAcento = 'áéíóúÁÉÍÓÚñÑüÜ';
    const sinAcento = 'aeiouAEIOUnNuU';
    var resultado = s.toLowerCase();
    for (int i = 0; i < conAcento.length; i++) {
      resultado = resultado.replaceAll(conAcento[i].toLowerCase(), sinAcento[i].toLowerCase());
    }
    return resultado;
  }

  /// Distancia de edición (Levenshtein): cuántas letras hay que cambiar/agregar/
  /// quitar para convertir una palabra en la otra. 0 = idéntica, mientras más
  /// alto, más distinta. Es la base del "corrector" tolerante a errores de tecleo.
  int _distanciaLevenshtein(String a, String b) {
    if (a == b) return 0;
    if (a.isEmpty) return b.length;
    if (b.isEmpty) return a.length;
    final costos = List<int>.generate(b.length + 1, (i) => i);
    for (int i = 0; i < a.length; i++) {
      int anterior = costos[0];
      costos[0] = i + 1;
      for (int j = 0; j < b.length; j++) {
        final actual = costos[j + 1];
        costos[j + 1] = a[i] == b[j]
            ? anterior
            : 1 + [anterior, actual, costos[j]].reduce((v, e) => v < e ? v : e);
        anterior = actual;
      }
    }
    return costos[b.length];
  }

  /// Puntaje de qué tan bien "busqueda" coincide con "nombreProducto":
  /// 0 = coincidencia directa (substring), 1+ = cantidad de errores de tecleo
  /// tolerados, null = no coincide ni de cerca. Soporta búsquedas de varias
  /// palabras (cada palabra de la búsqueda debe encontrar algo parecido).
  int? _puntajeCoincidencia(String nombreProducto, String busqueda) {
    final nombre = _normalizarTexto(nombreProducto);
    final query = _normalizarTexto(busqueda).trim();
    if (query.isEmpty) return 0;
    if (nombre.contains(query)) return 0;

    // Se ignoran palabras muy cortas del producto (conectores: "de", "y", "a")
    // para que no generen falsos positivos con búsquedas cortas.
    final palabrasProducto = nombre.split(' ').where((w) => w.length >= 3).toList();
    final palabrasQuery = query.split(' ').where((w) => w.isNotEmpty).toList();
    if (palabrasProducto.isEmpty || palabrasQuery.isEmpty) return null;

    int total = 0;
    for (final qp in palabrasQuery) {
      if (qp.length < 3) {
        // Palabra de búsqueda muy corta: solo cuenta si aparece tal cual.
        if (!palabrasProducto.contains(qp)) return null;
        continue;
      }
      final umbral = (qp.length / 3).ceil().clamp(1, 4);
      int mejor = 999;
      for (final pp in palabrasProducto) {
        // Compara contra la palabra completa y también contra su prefijo del
        // mismo largo que la búsqueda, para que un typo a medio escribir
        // ("capuc" por "cappuccino") también encuentre el producto.
        final distanciaCompleta = _distanciaLevenshtein(pp, qp);
        final prefijo = pp.length > qp.length ? pp.substring(0, qp.length) : pp;
        final distanciaPrefijo = _distanciaLevenshtein(prefijo, qp);
        final distancia = distanciaCompleta < distanciaPrefijo ? distanciaCompleta : distanciaPrefijo;
        if (distancia < mejor) mejor = distancia;
      }
      if (mejor > umbral) return null;
      total += mejor;
    }
    return total;
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

  /// Consulta al servidor si la mesa dada tiene AHORA MISMO una comanda activa,
  /// sin depender del snapshot de _mesas que puede estar desactualizado. Devuelve
  /// el mapa de la comanda (con sus items) o null si la mesa está libre.
  Future<dynamic> _comandaActivaDeMesa(String mesa) async {
    try {
      final res = await ApiConfig.get('/comandas/mesa/mesero/${Uri.encodeComponent(mesa)}?usuario_id=$_userId');
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      return (data['activa'] == true) ? {...data['comanda'], 'items': data['items']} : null;
    } catch (_) {
      // Si falla la verificación (sin conexión, etc.), seguimos con lo último
      // que se cargó en _mesas en vez de bloquear al mesero por completo.
      final mesaInfo = _mesas.firstWhere((m) => m['mesa'].toString() == mesa, orElse: () => null);
      return (mesaInfo != null && mesaInfo['estado'] == 'ocupada') ? mesaInfo['comanda'] : null;
    }
  }

  Future<String?> _generarComanda(String mesa, String? notasGenerales, Map<int, String> notasPorProducto) async {
    try {
      final detallesNuevos = _carrito.entries.map((e) {
        final prod = _productos.firstWhere((p) => p.id == e.key);
        return {
          'producto_id': prod.id,
          'cantidad': e.value,
          'precio_unitario': prod.precioVenta,
          'subtotal': prod.precioVenta * e.value,
          'notas': notasPorProducto[prod.id],
        };
      }).toList();

      // Si la mesa ya tiene un pedido activo (de cualquier mesero), se suman estos
      // productos a esa misma comanda en vez de bloquear o crear una duplicada.
      // OJO: se pregunta el estado FRESCO al servidor acá mismo, en vez de confiar en
      // _mesas (que solo se carga al abrir la pantalla o al hacer pull-to-refresh):
      // si otro mesero ocupó esta mesa mientras tanto, decidir con el dato viejo
      // hacía que este pedido se mandara como comanda nueva y paralela en vez de
      // sumarse a la que ya existía.
      final comandaExistente = await _comandaActivaDeMesa(mesa);

      if (comandaExistente != null) {
        return await _sumarAComandaExistente(comandaExistente, detallesNuevos, notasGenerales);
      }

      final res = await ApiConfig.post('/comandas', {
        'mesa': mesa,
        'usuario_id': _userId,
        'total': _totalCarrito,
        'detalles': detallesNuevos,
        'fecha_hora': DateTime.now().toUtc().toIso8601String(),
        'notas': (notasGenerales != null && notasGenerales.isNotEmpty) ? notasGenerales : null,
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

  /// Suma los productos del carrito a una comanda ya existente en la mesa elegida
  /// (de cualquier mesero), en vez de crear una comanda duplicada para esa mesa.
  Future<String?> _sumarAComandaExistente(dynamic comandaExistente, List<Map<String, dynamic>> detallesNuevos, String? notasGenerales) async {
    try {
      final itemsActuales = (comandaExistente['items'] as List<dynamic>?) ?? [];
      final detallesFinales = itemsActuales.map((it) => {
        'producto_id': it['producto_id'],
        'cantidad': it['cantidad'],
        'precio_unitario': it['precio_unitario'],
        'subtotal': it['subtotal'],
        'notas': it['notas'],
        'es_nuevo': false,
      }).toList();

      // Se agrega siempre como línea nueva y separada, aunque el producto ya
      // estuviera en el pedido: así cocina ve, por ejemplo, "1 x Vino" ya
      // entregado y "1 x Vino" nuevo en vez de fusionarlos en "2 x Vino" nuevo
      // (que ocultaría que solo se agregó uno).
      for (final nuevo in detallesNuevos) {
        detallesFinales.add({...nuevo, 'es_nuevo': true});
      }

      final totalFinal = detallesFinales.fold<double>(0, (acc, it) => acc + (double.tryParse(it['subtotal'].toString()) ?? 0.0));

      final notaPrevia = (comandaExistente['notas'] as String?) ?? '';
      final notaNueva = notasGenerales ?? '';
      final notasCombinadas = [notaPrevia, notaNueva].where((n) => n.isNotEmpty).join(' | ');

      final res = await ApiConfig.put('/comandas/mesero/${comandaExistente['id']}?usuario_id=$_userId', {
        'detalles': detallesFinales,
        'total': totalFinal,
        'notas': notasCombinadas.isEmpty ? null : notasCombinadas,
      });

      final data = jsonDecode(res.body);
      if (res.statusCode != 200) {
        return data['error']?.toString() ?? 'Error al sumar productos a la mesa';
      }

      setState(() => _carrito.clear());
      return null;
    } catch (e) {
      return 'Error de conexión: $e';
    }
  }

  Future<String?> _guardarEdicionComanda(int comandaId, List<Map<String, dynamic>> detalles, double total, String? notas) async {
    try {
      final res = await ApiConfig.put('/comandas/mesero/$comandaId?usuario_id=$_userId', {
        'detalles': detalles,
        'total': total,
        'notas': notas,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode != 200) {
        return data['error']?.toString() ?? 'Error al editar la comanda';
      }
      return null;
    } catch (e) {
      return 'Error de conexión: $e';
    }
  }

  Future<void> _abrirEdicionComanda(dynamic comanda) async {
    final actualizado = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditarComandaSheet(
        comanda: comanda,
        productos: _productos,
        onGuardar: _guardarEdicionComanda,
      ),
    );
    if (actualizado == true) {
      _cargarMisComandas();
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

  Future<void> _solicitarImpresion(int id) async {
    try {
      final res = await ApiConfig.post('/comandas/mesero/$id/imprimir?usuario_id=$_userId', {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🖨️ Se envió a imprimir en cocina')),
        );
        _cargarMisComandas();
      } else {
        final data = jsonDecode(res.body);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['error'] ?? 'Error al solicitar impresión')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
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
    return PopScope(
      canPop: !_tecladoAbierto,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && _tecladoAbierto) {
          setState(() => _tecladoAbierto = false);
        }
      },
      child: Scaffold(
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: AppTheme.secondaryDark,
                  borderRadius: BorderRadius.circular(12),
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
      ),
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
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: seleccionado ? AppTheme.accentColor : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
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

  Widget _placeholderImagen() {
    return Container(
      color: AppTheme.primaryDark,
      alignment: Alignment.center,
      child: const FaIcon(FontAwesomeIcons.mugHot, color: AppTheme.textMuted, size: 28),
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
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            controller: _searchController,
            readOnly: true,
            showCursor: true,
            onTap: () => setState(() => _tecladoAbierto = true),
            style: const TextStyle(fontSize: 16, color: AppTheme.textLight),
            decoration: InputDecoration(
              hintText: 'Buscar producto...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _busqueda.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => setState(() {
                        _busqueda = '';
                        _searchController.clear();
                      }),
                    )
                  : null,
              filled: true,
              fillColor: AppTheme.secondaryDark,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
        ),
        SizedBox(
          height: 32,
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
        const SizedBox(height: 4),
        Expanded(
          child: _vistaLista ? _buildProductosLista() : _buildProductosGrid(),
        ),
        if (_tecladoAbierto)
          _TecladoQwerty(
            onLetra: (letra) => setState(() {
              _busqueda += letra;
              _searchController.text = _busqueda;
            }),
            onEspacio: () => setState(() {
              _busqueda += ' ';
              _searchController.text = _busqueda;
            }),
            onBorrar: () {
              if (_busqueda.isEmpty) return;
              setState(() {
                _busqueda = _busqueda.substring(0, _busqueda.length - 1);
                _searchController.text = _busqueda;
              });
            },
            onCerrar: () => setState(() => _tecladoAbierto = false),
          ),
      ],
    );
  }

  Widget _buildProductosGrid() {
    return GridView.builder(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.72,
            ),
            itemCount: _productosFiltrados.length,
            itemBuilder: (context, index) {
              final p = _productosFiltrados[index];
              final enCarrito = _carrito[p.id] ?? 0;
              return GestureDetector(
                onTap: () => _agregarProducto(p),
                child: Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryDark,
                    borderRadius: BorderRadius.circular(16),
                    border: enCarrito > 0 ? Border.all(color: AppTheme.accentColor, width: 2) : null,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AspectRatio(
                        aspectRatio: 1.3,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (p.imagenUrl != null && p.imagenUrl!.isNotEmpty)
                              Image.network(
                                p.imagenUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) => _placeholderImagen(),
                                loadingBuilder: (context, child, progress) => progress == null ? child : _placeholderImagen(),
                              )
                            else
                              _placeholderImagen(),
                            if (enCarrito > 0)
                              Positioned(
                                top: 6,
                                right: 6,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Material(
                                      color: Colors.black87,
                                      shape: const CircleBorder(),
                                      child: InkWell(
                                        customBorder: const CircleBorder(),
                                        onTap: () => _cambiarCantidad(p.id, -1),
                                        child: const Padding(
                                          padding: EdgeInsets.all(6),
                                          child: Icon(Icons.remove, color: Colors.white, size: 16),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 5),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(color: AppTheme.accentColor, borderRadius: BorderRadius.circular(10)),
                                      child: Text('+$enCarrito', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                p.nombre,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textLight),
                              ),
                              Text(
                                'Bs. ${p.precioVenta.toStringAsFixed(2)}',
                                style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.w900, fontSize: 17),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
    );
  }

  Widget _buildProductosLista() {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
      itemCount: _productosFiltrados.length,
      itemBuilder: (context, index) {
        final p = _productosFiltrados[index];
        final enCarrito = _carrito[p.id] ?? 0;
        return GestureDetector(
          onTap: () => _agregarProducto(p),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              borderRadius: BorderRadius.circular(14),
              border: enCarrito > 0 ? Border.all(color: AppTheme.accentColor, width: 2) : null,
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(
                    width: 56,
                    height: 56,
                    child: (p.imagenUrl != null && p.imagenUrl!.isNotEmpty)
                        ? Image.network(
                            p.imagenUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) => _placeholderImagen(),
                            loadingBuilder: (context, child, progress) => progress == null ? child : _placeholderImagen(),
                          )
                        : _placeholderImagen(),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textLight),
                      ),
                      Text(
                        'Bs. ${p.precioVenta.toStringAsFixed(2)}',
                        style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.w900, fontSize: 15),
                      ),
                    ],
                  ),
                ),
                if (enCarrito > 0)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Material(
                        color: Colors.black87,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () => _cambiarCantidad(p.id, -1),
                          child: const Padding(
                            padding: EdgeInsets.all(6),
                            child: Icon(Icons.remove, color: Colors.white, size: 16),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: AppTheme.accentColor, borderRadius: BorderRadius.circular(10)),
                        child: Text('+$enCarrito', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildVistaControl() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Comandas activas', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: AppTheme.textLight)),
              IconButton(icon: const Icon(Icons.refresh, color: AppTheme.textLight), onPressed: _cargarMisComandas),
            ],
          ),
        ),
        Expanded(child: _buildListaComandas()),
      ],
    );
  }

  Widget _buildListaComandas() {
    if (_loadingControl) {
      return const Center(child: PulsingCoffeeLoader(message: 'Cargando comandas activas...'));
    }
    if (_misComandas.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.clipboardCheck, size: 48, color: AppTheme.textMuted),
            const SizedBox(height: 12),
            const Text('No hay comandas activas en este momento.', style: TextStyle(color: AppTheme.textMuted)),
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
          final items = (c['items'] as List<dynamic>?) ?? [];
          final notasGenerales = (c['notas'] as String?) ?? '';
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(nombreMesa(c['mesa']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppTheme.textLight)),
                        if ((c['mesero_nombre'] as String?)?.isNotEmpty == true)
                          Text(c['mesero_nombre'], style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                        if (_formatearHoraComanda(c).isNotEmpty)
                          Text(_formatearHoraComanda(c), style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                      ],
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (((c['version'] as int?) ?? 1) > 1)
                          Container(
                            margin: const EdgeInsets.only(right: 6),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: Colors.amber.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                            child: const Text('EDITADO', style: TextStyle(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: colorCocina.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                          child: Text(estadoCocina, style: TextStyle(color: colorCocina, fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ],
                ),
                if (items.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryDark,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: items.map((it) {
                        final nota = (it['notas'] as String?) ?? '';
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${it['cantidad']}x ${it['nombre']}',
                                style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w600, fontSize: 13),
                              ),
                              if (nota.isNotEmpty)
                                Text('  📝 $nota', style: const TextStyle(color: AppTheme.accentColor, fontSize: 12, fontStyle: FontStyle.italic)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  if (notasGenerales.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Nota del pedido: $notasGenerales', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12, fontStyle: FontStyle.italic)),
                    ),
                ],
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
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _abrirEdicionComanda(c),
                          icon: const Icon(Icons.edit_outlined, size: 16, color: AppTheme.accentColor),
                          label: const Text('Editar', style: TextStyle(color: AppTheme.accentColor, fontSize: 12)),
                          style: OutlinedButton.styleFrom(side: const BorderSide(color: AppTheme.accentColor), padding: const EdgeInsets.symmetric(horizontal: 4)),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _solicitarImpresion(c['id']),
                          icon: const Icon(Icons.print_outlined, size: 16, color: Colors.blueAccent),
                          label: const Text('Imprimir', style: TextStyle(color: Colors.blueAccent, fontSize: 12)),
                          style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.blueAccent), padding: const EdgeInsets.symmetric(horizontal: 4)),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _eliminarComanda(c['id']),
                          icon: const Icon(Icons.delete_outline, size: 16, color: Colors.redAccent),
                          label: const Text('Eliminar', style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                          style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.redAccent), padding: const EdgeInsets.symmetric(horizontal: 4)),
                        ),
                      ),
                    ],
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
  final Future<String?> Function(String mesa, String? notasGenerales, Map<int, String> notasPorProducto) onGenerarComanda;

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
  bool _agregarAExistente = false;
  bool _enviando = false;
  String? _error;
  final Map<int, String> _notasPorProducto = {};
  final TextEditingController _notasGeneralCtrl = TextEditingController();

  @override
  void dispose() {
    _notasGeneralCtrl.dispose();
    super.dispose();
  }

  double get _total {
    double total = 0;
    widget.carrito.forEach((id, cant) {
      final prod = widget.productos.firstWhere((p) => p.id == id, orElse: () => Product(id: id, nombre: '', precioVenta: 0, categoria: ''));
      total += prod.precioVenta * cant;
    });
    return total;
  }

  bool get _mesaOcupadaSeleccionada {
    if (_mesaSeleccionada == null) return false;
    final mesa = widget.mesas.firstWhere((m) => m['mesa'].toString() == _mesaSeleccionada, orElse: () => null);
    return mesa != null && mesa['estado'] == 'ocupada';
  }

  Future<void> _editarNotaProducto(int productoId, String nombre) async {
    final controller = TextEditingController(text: _notasPorProducto[productoId] ?? '');
    final resultado = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.secondaryDark,
        title: Text('Nota para $nombre', style: const TextStyle(color: AppTheme.textLight, fontSize: 15)),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 2,
          style: const TextStyle(color: AppTheme.textLight),
          decoration: InputDecoration(
            hintText: 'Ej: sin azúcar, extra caliente...',
            hintStyle: const TextStyle(color: AppTheme.textMuted),
            filled: true,
            fillColor: AppTheme.primaryDark,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('Guardar')),
        ],
      ),
    );
    if (resultado != null) {
      setState(() {
        if (resultado.isEmpty) {
          _notasPorProducto.remove(productoId);
        } else {
          _notasPorProducto[productoId] = resultado;
        }
      });
    }
  }

  Future<void> _confirmar() async {
    if (_mesaSeleccionada == null) {
      setState(() => _error = 'Selecciona una mesa.');
      return;
    }
    final sumandoAMesaOcupada = _mesaOcupadaSeleccionada;
    setState(() {
      _enviando = true;
      _error = null;
    });
    final error = await widget.onGenerarComanda(_mesaSeleccionada!, _notasGeneralCtrl.text.trim(), _notasPorProducto);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _enviando = false;
        _error = error;
      });
    } else {
      Navigator.pop(context);
      final mensaje = sumandoAMesaOcupada
          ? '✅ Productos sumados al pedido de la mesa $_mesaSeleccionada'
          : '✅ Comanda enviada a cocina para la mesa $_mesaSeleccionada';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mensaje)));
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
                final nota = _notasPorProducto[prod.id] ?? '';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(prod.nombre, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w600, fontSize: 15)),
                          ),
                          IconButton(
                            onPressed: () => setState(() => widget.onCambiarCantidad(prod.id, -1)),
                            icon: const Icon(Icons.remove_circle, color: AppTheme.textMuted),
                            iconSize: 34,
                            padding: EdgeInsets.zero,
                          ),
                          SizedBox(
                            width: 28,
                            child: Text('${e.value}', textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.bold, fontSize: 18)),
                          ),
                          IconButton(
                            onPressed: () => setState(() => widget.onCambiarCantidad(prod.id, 1)),
                            icon: const Icon(Icons.add_circle, color: AppTheme.accentColor),
                            iconSize: 34,
                            padding: EdgeInsets.zero,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      GestureDetector(
                        onTap: () => _editarNotaProducto(prod.id, prod.nombre),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: nota.isNotEmpty ? AppTheme.accentColor.withOpacity(0.15) : AppTheme.primaryDark,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: nota.isNotEmpty ? AppTheme.accentColor : Colors.white24),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(nota.isNotEmpty ? Icons.sticky_note_2 : Icons.note_add_outlined, size: 16, color: nota.isNotEmpty ? AppTheme.accentColor : AppTheme.textMuted),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  nota.isNotEmpty ? nota : 'Agregar nota a este producto',
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: nota.isNotEmpty ? AppTheme.accentColor : AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _notasGeneralCtrl,
              maxLines: 2,
              style: const TextStyle(color: AppTheme.textLight, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Notas generales del pedido (opcional)...',
                hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                filled: true,
                fillColor: AppTheme.primaryDark,
                prefixIcon: const Icon(Icons.edit_note, color: AppTheme.textMuted, size: 20),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ),
          if (widget.mesas.any((m) => m['estado'] == 'ocupada'))
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Nueva comanda')),
                  ButtonSegment(value: true, label: Text('Añadir a existente')),
                ],
                selected: {_agregarAExistente},
                onSelectionChanged: (sel) {
                  setState(() {
                    _agregarAExistente = sel.first;
                    _mesaSeleccionada = null;
                  });
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: DropdownButtonFormField<String>(
              initialValue: _mesaSeleccionada,
              decoration: InputDecoration(
                labelText: _agregarAExistente ? 'Mesa con pedido activo' : 'Mesa',
                filled: true,
                fillColor: AppTheme.primaryDark,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
              dropdownColor: AppTheme.secondaryDark,
              selectedItemBuilder: (context) => widget.mesas
                  .where((m) => (m['estado'] == 'ocupada') == _agregarAExistente)
                  .map<Widget>((m) => Text(nombreMesa(m['mesa']), style: const TextStyle(color: AppTheme.textLight)))
                  .toList(),
              items: widget.mesas
                  .where((m) => (m['estado'] == 'ocupada') == _agregarAExistente)
                  .map<DropdownMenuItem<String>>((m) {
                return DropdownMenuItem(
                  value: m['mesa'].toString(),
                  child: Text(nombreMesa(m['mesa']), style: const TextStyle(color: AppTheme.textLight)),
                );
              }).toList(),
              onChanged: (v) => setState(() => _mesaSeleccionada = v),
            ),
          ),
          if (_mesaOcupadaSeleccionada)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                '⚠️ Estos productos se sumarán al pedido activo de esa mesa.',
                style: const TextStyle(color: Colors.orangeAccent, fontSize: 12),
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
                    : Text(
                        _agregarAExistente
                            ? 'AGREGAR AL PEDIDO · Bs. ${_total.toStringAsFixed(2)}'
                            : 'GENERAR COMANDA · Bs. ${_total.toStringAsFixed(2)}',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet para editar una comanda ya enviada desde la pestaña "Control":
/// cambiar cantidades, quitar productos, agregar productos nuevos y editar notas.
/// Al guardar, el backend marca la comanda como pendiente de nuevo para cocina.
class _EditarComandaSheet extends StatefulWidget {
  final dynamic comanda;
  final List<Product> productos;
  final Future<String?> Function(int comandaId, List<Map<String, dynamic>> detalles, double total, String? notas) onGuardar;

  const _EditarComandaSheet({
    required this.comanda,
    required this.productos,
    required this.onGuardar,
  });

  @override
  State<_EditarComandaSheet> createState() => _EditarComandaSheetState();
}

class _EditarComandaSheetState extends State<_EditarComandaSheet> {
  // Cada item: {producto_id, nombre, cantidad, precio_unitario, notas}
  late List<Map<String, dynamic>> _items;
  late TextEditingController _notasGeneralCtrl;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final itemsOriginales = (widget.comanda['items'] as List<dynamic>?) ?? [];
    _items = itemsOriginales.map((it) => {
      'producto_id': it['producto_id'],
      'nombre': it['nombre'],
      'cantidad': it['cantidad'],
      'precio_unitario': double.tryParse(it['precio_unitario'].toString()) ?? 0.0,
      'notas': it['notas'],
    }).toList();
    _notasGeneralCtrl = TextEditingController(text: (widget.comanda['notas'] as String?) ?? '');
  }

  @override
  void dispose() {
    _notasGeneralCtrl.dispose();
    super.dispose();
  }

  double get _total {
    double total = 0;
    for (final it in _items) {
      total += (it['precio_unitario'] as double) * (it['cantidad'] as int);
    }
    return total;
  }

  void _cambiarCantidad(int index, int delta) {
    setState(() {
      final nuevaCantidad = (_items[index]['cantidad'] as int) + delta;
      if (nuevaCantidad <= 0) {
        _items.removeAt(index);
      } else {
        _items[index]['cantidad'] = nuevaCantidad;
      }
    });
  }

  Future<void> _editarNota(int index) async {
    final controller = TextEditingController(text: (_items[index]['notas'] as String?) ?? '');
    final resultado = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.secondaryDark,
        title: Text('Nota para ${_items[index]['nombre']}', style: const TextStyle(color: AppTheme.textLight, fontSize: 15)),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 2,
          style: const TextStyle(color: AppTheme.textLight),
          decoration: InputDecoration(
            hintText: 'Ej: sin azúcar, extra caliente...',
            hintStyle: const TextStyle(color: AppTheme.textMuted),
            filled: true,
            fillColor: AppTheme.primaryDark,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('Guardar')),
        ],
      ),
    );
    if (resultado != null) {
      setState(() => _items[index]['notas'] = resultado.isEmpty ? null : resultado);
    }
  }

  Future<void> _agregarProducto() async {
    final producto = await showModalBottomSheet<Product>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SelectorProductoSheet(productos: widget.productos),
    );
    if (producto == null) return;

    setState(() {
      final indiceExistente = _items.indexWhere((it) => it['producto_id'] == producto.id);
      if (indiceExistente != -1) {
        _items[indiceExistente]['cantidad'] = (_items[indiceExistente]['cantidad'] as int) + 1;
      } else {
        _items.add({
          'producto_id': producto.id,
          'nombre': producto.nombre,
          'cantidad': 1,
          'precio_unitario': producto.precioVenta,
          'notas': null,
        });
      }
    });
  }

  Future<void> _guardar() async {
    if (_items.isEmpty) {
      setState(() => _error = 'La comanda debe tener al menos un producto.');
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });

    final detalles = _items.map((it) => {
      'producto_id': it['producto_id'],
      'cantidad': it['cantidad'],
      'precio_unitario': it['precio_unitario'],
      'subtotal': (it['precio_unitario'] as double) * (it['cantidad'] as int),
      'notas': it['notas'],
    }).toList();

    final notasGenerales = _notasGeneralCtrl.text.trim();
    final error = await widget.onGuardar(widget.comanda['id'], detalles, _total, notasGenerales.isEmpty ? null : notasGenerales);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _guardando = false;
        _error = error;
      });
    } else {
      Navigator.pop(context, true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('✅ Comanda actualizada, cocina verá los cambios')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.8,
      decoration: const BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('Editar comanda · ${nombreMesa(widget.comanda['mesa'])}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: AppTheme.textLight)),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                ..._items.asMap().entries.map((entry) {
                  final index = entry.key;
                  final it = entry.value;
                  final nota = (it['notas'] as String?) ?? '';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(it['nombre'], style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w600, fontSize: 15)),
                            ),
                            IconButton(
                              onPressed: () => _cambiarCantidad(index, -1),
                              icon: const Icon(Icons.remove_circle, color: AppTheme.textMuted),
                              iconSize: 34,
                              padding: EdgeInsets.zero,
                            ),
                            SizedBox(
                              width: 28,
                              child: Text('${it['cantidad']}', textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.bold, fontSize: 18)),
                            ),
                            IconButton(
                              onPressed: () => _cambiarCantidad(index, 1),
                              icon: const Icon(Icons.add_circle, color: AppTheme.accentColor),
                              iconSize: 34,
                              padding: EdgeInsets.zero,
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        GestureDetector(
                          onTap: () => _editarNota(index),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: nota.isNotEmpty ? AppTheme.accentColor.withOpacity(0.15) : AppTheme.primaryDark,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: nota.isNotEmpty ? AppTheme.accentColor : Colors.white24),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(nota.isNotEmpty ? Icons.sticky_note_2 : Icons.note_add_outlined, size: 16, color: nota.isNotEmpty ? AppTheme.accentColor : AppTheme.textMuted),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    nota.isNotEmpty ? nota : 'Agregar nota a este producto',
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: nota.isNotEmpty ? AppTheme.accentColor : AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 4),
                OutlinedButton.icon(
                  onPressed: _agregarProducto,
                  icon: const Icon(Icons.add, color: AppTheme.accentColor),
                  label: const Text('Agregar producto', style: TextStyle(color: AppTheme.accentColor)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppTheme.accentColor),
                    minimumSize: const Size(double.infinity, 44),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _notasGeneralCtrl,
              maxLines: 2,
              style: const TextStyle(color: AppTheme.textLight, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Notas generales del pedido (opcional)...',
                hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                filled: true,
                fillColor: AppTheme.primaryDark,
                prefixIcon: const Icon(Icons.edit_note, color: AppTheme.textMuted, size: 20),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
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
                onPressed: _guardando ? null : _guardar,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentColor,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _guardando
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text('GUARDAR CAMBIOS · Bs. ${_total.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Selector simple de producto (buscador + lista) para agregar un producto nuevo
/// a una comanda que ya se está editando.
class _SelectorProductoSheet extends StatefulWidget {
  final List<Product> productos;

  const _SelectorProductoSheet({required this.productos});

  @override
  State<_SelectorProductoSheet> createState() => _SelectorProductoSheetState();
}

class _SelectorProductoSheetState extends State<_SelectorProductoSheet> {
  String _busqueda = '';

  @override
  Widget build(BuildContext context) {
    final filtrados = widget.productos
        .where((p) => p.nombre.toLowerCase().contains(_busqueda.toLowerCase()))
        .toList();

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
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _busqueda = v),
              style: const TextStyle(color: AppTheme.textLight),
              decoration: InputDecoration(
                hintText: 'Buscar producto...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppTheme.primaryDark,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: filtrados.length,
              itemBuilder: (context, index) {
                final p = filtrados[index];
                return ListTile(
                  onTap: () => Navigator.pop(context, p),
                  title: Text(p.nombre, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w600)),
                  trailing: Text('Bs. ${p.precioVenta.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.bold)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Teclado propio en pantalla, solo letras en formato QWERTY con teclas
/// grandes, pensado para el buscador de productos en pantallas táctiles
/// chicas (evita el teclado nativo del sistema y deja el grid de productos
/// usando todo el espacio disponible arriba).
class _TecladoQwerty extends StatelessWidget {
  final void Function(String letra) onLetra;
  final VoidCallback onEspacio;
  final VoidCallback onBorrar;
  final VoidCallback onCerrar;

  const _TecladoQwerty({
    required this.onLetra,
    required this.onEspacio,
    required this.onBorrar,
    required this.onCerrar,
  });

  static const _fila1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  static const _fila2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
  static const _fila3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

  static void _vibrar() => HapticFeedback.heavyImpact();

  Widget _tecla(String letra) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Material(
          color: AppTheme.secondaryDark,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              _vibrar();
              onLetra(letra);
            },
            child: Container(
              height: 56,
              alignment: Alignment.center,
              child: Text(letra, style: const TextStyle(color: AppTheme.textLight, fontWeight: FontWeight.w900, fontSize: 22)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _botonAccion({required Widget child, required VoidCallback onTap, Color? color, int flex = 1}) {
    return Expanded(
      flex: flex,
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Material(
          color: color ?? AppTheme.secondaryDark,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              _vibrar();
              onTap();
            },
            child: Container(
              height: 56,
              alignment: Alignment.center,
              child: child,
            ),
          ),
        ),
      ),
    );
  }

  Widget _filaConMargen(List<String> letras, {double margen = 0}) {
    return Row(
      children: [
        if (margen > 0) SizedBox(width: margen),
        ...letras.map(_tecla),
        if (margen > 0) SizedBox(width: margen),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 8, 6, 10),
      decoration: BoxDecoration(
        color: AppTheme.primaryDark,
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.06))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _filaConMargen(_fila1),
          const SizedBox(height: 4),
          _filaConMargen(_fila2, margen: 18),
          const SizedBox(height: 4),
          Row(
            children: [
              ..._fila3.map(_tecla),
              _botonAccion(
                flex: 2,
                onTap: onBorrar,
                child: const Icon(Icons.backspace_outlined, color: AppTheme.textLight, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              _botonAccion(
                flex: 2,
                onTap: onCerrar,
                child: const Icon(Icons.keyboard_hide_outlined, color: AppTheme.textLight, size: 20),
              ),
              _botonAccion(
                flex: 5,
                onTap: onEspacio,
                child: const Text('ESPACIO', style: TextStyle(color: AppTheme.textMuted, fontWeight: FontWeight.bold, fontSize: 13)),
              ),
              _botonAccion(
                flex: 2,
                color: AppTheme.accentColor,
                onTap: onCerrar,
                child: const Text('LISTO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
