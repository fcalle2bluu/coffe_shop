import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class ComprasScreen extends StatefulWidget {
  const ComprasScreen({super.key});

  @override
  State<ComprasScreen> createState() => _ComprasScreenState();
}

class _ComprasScreenState extends State<ComprasScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _historialCompras = [];
  List<dynamic> _proveedores = [];
  List<dynamic> _insumos = [];
  bool _isLoading = true;

  // New Purchase state variables
  int? _selectedProveedorId;
  final List<Map<String, dynamic>> _compraDetalles = []; // Items in current shopping list
  
  // Dialog selection state
  int? _selectedInsumoId;
  final _insumoCantidadController = TextEditingController();
  final _insumoCostoController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 0) {
        _loadHistorial();
      } else {
        _loadSetupData();
      }
    });
    _loadHistorial();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _insumoCantidadController.dispose();
    _insumoCostoController.dispose();
    super.dispose();
  }

  Future<void> _loadHistorial() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/compras');
      if (res.statusCode == 200) {
        setState(() {
          _historialCompras = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar compras: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadSetupData() async {
    setState(() => _isLoading = true);
    try {
      final provRes = await ApiConfig.get('/proveedores');
      final insRes = await ApiConfig.get('/almacen/insumos');

      if (provRes.statusCode == 200 && insRes.statusCode == 200) {
        setState(() {
          _proveedores = jsonDecode(provRes.body);
          _insumos = jsonDecode(insRes.body);
          if (_proveedores.isNotEmpty) _selectedProveedorId = _proveedores.first['id'];
        });
      }
    } catch (e) {
      print('Error al cargar proveedores/insumos para compras: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  double get _compraTotal {
    double total = 0.0;
    for (var d in _compraDetalles) {
      total += d['costo'];
    }
    return total;
  }

  void _addItemToCompra() {
    if (_selectedInsumoId == null) return;
    final qty = double.tryParse(_insumoCantidadController.text) ?? 0.0;
    final costo = double.tryParse(_insumoCostoController.text) ?? 0.0;

    if (qty <= 0 || costo <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Llene cantidad y costo con valores positivos')),
      );
      return;
    }

    final ins = _insumos.firstWhere((element) => element['id'] == _selectedInsumoId);

    setState(() {
      _compraDetalles.add({
        'insumo_id': _selectedInsumoId,
        'nombre': ins['nombre'],
        'unidad': ins['unidad_medida'],
        'cantidad': qty,
        'costo': costo,
      });
      _insumoCantidadController.clear();
      _insumoCostoController.clear();
    });
    Navigator.pop(context); // Close dialog
  }

  Future<void> _registrarCompra() async {
    if (_selectedProveedorId == null || _compraDetalles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Debe seleccionar un proveedor y añadir insumos')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final List detallesPayload = _compraDetalles.map((d) {
        return {
          'insumo_id': d['insumo_id'],
          'cantidad': d['cantidad'],
          'costo': d['costo'],
          'unidad': d['unidad'],
        };
      }).toList();

      final res = await ApiConfig.post('/compras', {
        'proveedor_id': _selectedProveedorId,
        'total': _compraTotal,
        'detalles': detallesPayload,
      });

      if (res.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ ¡Compra registrada con éxito!')),
        );
        setState(() {
          _compraDetalles.clear();
          _tabController.animateTo(0);
        });
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
      );
      setState(() => _isLoading = false);
    }
  }

  void _showAddItemDialog() {
    if (_insumos.isEmpty) return;
    _selectedInsumoId = _insumos.first['id'];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Añadir Insumo a Compra'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                value: _selectedInsumoId,
                decoration: const InputDecoration(labelText: 'Ingrediente / Insumo'),
                items: _insumos
                    .map((i) => DropdownMenuItem<int>(
                          value: i['id'],
                          child: Text('${i['nombre']} (${i['unidad_medida']})'),
                        ))
                    .toList(),
                onChanged: (val) {
                  setDialogState(() => _selectedInsumoId = val);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _insumoCantidadController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Cantidad'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _insumoCostoController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Costo Total (Bs.)'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            TextButton(
              onPressed: _addItemToCompra,
              child: const Text('Añadir'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistorialTab() {
    if (_historialCompras.isEmpty) {
      return const Center(child: Text('No hay compras registradas.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _historialCompras.length,
      itemBuilder: (context, idx) {
        final c = _historialCompras[idx];
        final total = double.tryParse(c['total'].toString()) ?? 0.0;
        final List detalles = c['detalles_compra'] ?? [];

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: ExpansionTile(
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    c['proveedor'] ?? 'Proveedor Desconocido',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  'Bs. ${total.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5, color: Colors.orangeAccent),
                ),
              ],
            ),
            subtitle: Text(
              'Fecha: ${c['fecha_compra']}',
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
            ),
            children: [
              const Divider(color: Colors.white10, height: 1),
              ...detalles.map<Widget>((d) {
                final qty = double.tryParse(d['cantidad'].toString()) ?? 0.0;
                final sub = double.tryParse(d['subtotal'].toString()) ?? 0.0;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${d['nombre']} ($qty ${d['unidad']})',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textLight),
                      ),
                      Text(
                        'Bs. ${sub.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                      ),
                    ],
                  ),
                );
              }).toList(),
              const SizedBox(height: 10),
            ],
          ),
        );
      },
    );
  }

  Widget _buildNuevaCompraTab() {
    if (_proveedores.isEmpty || _insumos.isEmpty) {
      return const Center(child: Text('Crea proveedores e insumos antes de registrar compras.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)));
    }

    return Column(
      children: [
        // Form Header
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<int>(
                value: _selectedProveedorId,
                decoration: const InputDecoration(labelText: 'Proveedor de la Compra'),
                items: _proveedores
                    .map((p) => DropdownMenuItem<int>(
                          value: p['id'],
                          child: Text(p['nombre']),
                        ))
                    .toList(),
                onChanged: (val) {
                  setState(() => _selectedProveedorId = val);
                },
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Ítems a Comprar:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                  ElevatedButton.icon(
                    onPressed: _showAddItemDialog,
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('AÑADIR ÍTEM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      backgroundColor: Colors.white.withOpacity(0.04),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        // Cart / Item List
        Expanded(
          child: _compraDetalles.isEmpty
              ? Center(
                  child: Text('Ningún insumo añadido a la compra.', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.white.withOpacity(0.2))),
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _compraDetalles.length,
                  separatorBuilder: (context, idx) => const Divider(color: Colors.white10),
                  itemBuilder: (context, idx) {
                    final d = _compraDetalles[idx];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(d['nombre'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                      subtitle: Text('Cantidad: ${d['cantidad']} ${d['unidad']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Bs. ${d['costo'].toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.remove_circle, color: Colors.redAccent, size: 20),
                            onPressed: () {
                              setState(() => _compraDetalles.removeAt(idx));
                            },
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        
        // Checkout Footer
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppTheme.secondaryDark,
            border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total Compra:', style: TextStyle(fontWeight: FontWeight.bold)),
                  Text(
                    'Bs. ${_compraTotal.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.orangeAccent),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _compraDetalles.isEmpty ? null : _registrarCompra,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(55),
                  backgroundColor: AppTheme.accentColor,
                  foregroundColor: Colors.white,
                ),
                child: const Text('REGISTRAR REABASTECIMIENTO', style: TextStyle(letterSpacing: 1.0)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(50),
        child: AppBar(
          bottom: TabBar(
            controller: _tabController,
            indicatorColor: AppTheme.accentColor,
            labelColor: Colors.white,
            unselectedLabelColor: AppTheme.textMuted,
            tabs: const [
              Tab(text: 'Historial Compras'),
              Tab(text: 'Nueva Compra'),
            ],
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildHistorialTab(),
                _buildNuevaCompraTab(),
              ],
            ),
    );
  }
}
