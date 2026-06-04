import 'dart:convert';
import 'package:flutter/material';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class StockScreen extends StatefulWidget {
  const StockScreen({super.key});

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _insumos = [];
  List<dynamic> _movimientos = [];
  bool _isLoading = true;

  // Controllers for Add Insumo dialog
  final _insNombreController = TextEditingController();
  final _insUnidadController = TextEditingController();
  final _insInicialController = TextEditingController();
  final _insMinimoController = TextEditingController();

  // Controllers for Adjustment dialog
  final _ajusteCantidadController = TextEditingController();
  String _ajusteTipo = 'INGRESO'; // INGRESO or MERMA

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 1) {
        _loadMovimientos();
      } else {
        _loadInsumos();
      }
    });
    _loadInsumos();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _insNombreController.dispose();
    _insUnidadController.dispose();
    _insInicialController.dispose();
    _insMinimoController.dispose();
    _ajusteCantidadController.dispose();
    super.dispose();
  }

  Future<void> _loadInsumos() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/almacen/insumos');
      if (res.statusCode == 200) {
        setState(() {
          _insumos = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar insumos: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMovimientos() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/almacen/movimientos');
      if (res.statusCode == 200) {
        setState(() {
          _movimientos = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar movimientos: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _crearInsumo() async {
    final nombre = _insNombreController.text.trim();
    final unidad = _insUnidadController.text.trim();
    final inicial = double.tryParse(_insInicialController.text) ?? 0.0;
    final minimo = double.tryParse(_insMinimoController.text) ?? 0.0;

    if (nombre.isEmpty || unidad.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Llene los campos obligatorios.')),
      );
      return;
    }

    Navigator.pop(context); // Close dialog
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.post('/almacen', {
        'nombre': nombre,
        'unidad_medida': unidad,
        'stock_inicial': inicial,
        'stock_minimo': minimo,
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        _insNombreController.clear();
        _insUnidadController.clear();
        _insInicialController.clear();
        _insMinimoController.clear();
        _loadInsumos();
      } else {
        throw Exception('Error al guardar');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al crear insumo.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _softDeleteInsumo(int id, String nombre) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar Insumo'),
        content: Text('¿Deseas archivar/eliminar el insumo "$nombre"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        final res = await ApiConfig.delete('/almacen/$id');
        if (res.statusCode == 200) {
          _loadInsumos();
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al eliminar insumo.')),
        );
        setState(() => _isLoading = false);
      }
    }
  }

  void _showAjusteDialog(dynamic insumo) {
    _ajusteCantidadController.clear();
    _ajusteTipo = 'INGRESO';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text('Ajuste de Stock: ${insumo['nombre']}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: RadioListTile<String>(
                      title: const Text('Ingreso', style: TextStyle(fontSize: 12)),
                      value: 'INGRESO',
                      groupValue: _ajusteTipo,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) {
                        setDialogState(() => _ajusteTipo = val!);
                      },
                    ),
                  ),
                  Expanded(
                    child: RadioListTile<String>(
                      title: const Text('Merma', style: TextStyle(fontSize: 12)),
                      value: 'MERMA',
                      groupValue: _ajusteTipo,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) {
                        setDialogState(() => _ajusteTipo = val!);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _ajusteCantidadController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: 'Cantidad (${insumo['unidad_medida']})',
                  hintText: '0.00',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            TextButton(
              onPressed: () async {
                final qty = double.tryParse(_ajusteCantidadController.text) ?? 0.0;
                if (qty <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Ingresa una cantidad válida')),
                  );
                  return;
                }

                Navigator.pop(context);
                setState(() => _isLoading = true);

                try {
                  final res = await ApiConfig.post('/almacen/ajuste', {
                    'insumo_id': insumo['id'],
                    'tipo': _ajusteTipo,
                    'cantidad': qty,
                  });

                  if (res.statusCode == 200) {
                    _loadInsumos();
                  } else {
                    final err = jsonDecode(res.body);
                    throw Exception(err['error'] ?? 'Error al ajustar');
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
                  );
                  setState(() => _isLoading = false);
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddInsumoDialog() {
    _insNombreController.clear();
    _insUnidadController.clear();
    _insInicialController.clear();
    _insMinimoController.clear();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nuevo Insumo / Ingrediente'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _insNombreController,
                decoration: const InputDecoration(labelText: 'Nombre *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _insUnidadController,
                decoration: const InputDecoration(labelText: 'Unidad de Medida (Ej: kg, L, u) *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _insInicialController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Stock Inicial'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _insMinimoController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Alerta Stock Mínimo'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: _crearInsumo,
            child: const Text('Crear Insumo'),
          ),
        ],
      ),
    );
  }

  Widget _buildInsumosList() {
    if (_insumos.isEmpty) {
      return const Center(child: Text('No hay insumos en almacén.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _insumos.length,
      itemBuilder: (context, idx) {
        final i = _insumos[idx];
        final actual = double.tryParse(i['stock_actual'].toString()) ?? 0.0;
        final minimo = double.tryParse(i['stock_minimo'].toString()) ?? 0.0;
        final esBajo = actual < minimo;

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.03),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.04)),
              ),
              alignment: Alignment.center,
              child: FaIcon(
                FontAwesomeIcons.circleQuestion,
                size: 16,
                color: esBajo ? Colors.orangeAccent : AppTheme.accentColor.withOpacity(0.5),
              ),
            ),
            title: Text(
              i['nombre'],
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14.5),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4.0),
              child: Row(
                children: [
                  Text(
                    'Base Mínima: $minimo ${i['unidad_medida']}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                  if (esBajo) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.redAccent.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('STOCK BAJO', style: TextStyle(color: Colors.redAccent, fontSize: 8, fontWeight: FontWeight.bold)),
                    )
                  ]
                ],
              ),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '$actual ${i['unidad_medida']}',
                  style: TextStyle(
                    fontWeight: FontWeight.black,
                    fontSize: 15,
                    color: esBajo ? Colors.orangeAccent : Colors.white,
                  ),
                ),
                const SizedBox(width: 8),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert, color: AppTheme.textMuted),
                  onSelected: (val) {
                    if (val == 'ajustar') {
                      _showAjusteDialog(i);
                    } else if (val == 'eliminar') {
                      _softDeleteInsumo(i['id'], i['nombre']);
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'ajustar',
                      child: Text('Ajuste de Stock', style: TextStyle(fontSize: 13)),
                    ),
                    const PopupMenuItem(
                      value: 'eliminar',
                      child: Text('Eliminar Insumo', style: TextStyle(color: Colors.redAccent, fontSize: 13)),
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

  Widget _buildMovimientosList() {
    if (_movimientos.isEmpty) {
      return const Center(child: Text('No hay movimientos registrados.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _movimientos.length,
      itemBuilder: (context, idx) {
        final m = _movimientos[idx];
        final tipo = m['tipo'] ?? 'INGRESO';
        final isLoss = tipo == 'MERMA' || tipo == 'DESCUENTO';
        final symbol = isLoss ? '-' : '+';
        final color = isLoss ? Colors.redAccent : Colors.emerald;

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(m['insumo'] ?? 'Insumo', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                Text(
                  '$symbol${m['cantidad']}',
                  style: TextStyle(fontWeight: FontWeight.black, fontSize: 13.5, color: color),
                ),
              ],
            ),
            subtitle: Text(
              '${m['fecha_hora']} | TIPO: $tipo',
              style: const TextStyle(fontSize: 10.5, color: AppTheme.textMuted),
            ),
          ),
        );
      },
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
              Tab(text: 'Inventario Activo'),
              Tab(text: 'Kardex / Movimientos'),
            ],
          ),
        ),
      ),
      floatingActionButton: _tabController.index == 0
          ? FloatingActionButton(
              onPressed: _showAddInsumoDialog,
              backgroundColor: AppTheme.accentColor,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildInsumosList(),
                _buildMovimientosList(),
              ],
            ),
    );
  }
}
