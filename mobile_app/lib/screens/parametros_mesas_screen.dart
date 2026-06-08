import 'dart:convert';
import 'package:flutter/material.dart';
import '../config/api.dart';
import '../config/theme.dart';

class ParametrosMesasScreen extends StatefulWidget {
  const ParametrosMesasScreen({super.key});

  @override
  State<ParametrosMesasScreen> createState() => _ParametrosMesasScreenState();
}

class _ParametrosMesasScreenState extends State<ParametrosMesasScreen> {
  bool _isLoading = true;
  List<dynamic> _mesas = [];
  String _pisoSeleccionado = 'PLANTA_BAJA'; // PLANTA_BAJA o PLANTA_ALTA

  @override
  void initState() {
    super.initState();
    _fetchMesas();
  }

  Future<void> _fetchMesas() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/mesas');
      if (res.statusCode == 200) {
        setState(() {
          _mesas = jsonDecode(res.body);
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al cargar mesas: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updateMesaPosicion(int id, double x, double y) async {
    try {
      final res = await ApiConfig.put('/mesas/$id/posicion', {
        'pos_x': x,
        'pos_y': y,
      });
      if (res.statusCode != 200) {
        throw Exception('Error en el servidor al actualizar coordenadas');
      }
    } catch (e) {
      print('Error al guardar posición de mesa $id: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar la posición de la mesa: $e')),
      );
    }
  }

  Future<void> _crearMesa(String numero, String piso) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.post('/mesas', {
        'numero': numero,
        'piso': piso,
        'pos_x': 40.0,
        'pos_y': 40.0,
      });
      if (res.statusCode == 200 || res.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Mesa creada con éxito.')),
        );
        _fetchMesas();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error desconocido');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al crear mesa: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _editarMesa(int id, String numero, String piso) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.put('/mesas/$id', {
        'numero': numero,
        'piso': piso,
      });
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Mesa actualizada.')),
        );
        _fetchMesas();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error desconocido');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al actualizar mesa: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _eliminarMesa(int id) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.delete('/mesas/$id');
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🗑️ Mesa eliminada.')),
        );
        _fetchMesas();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al eliminar mesa');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  void _mostrarDialogoCrearEditar({Map<String, dynamic>? mesa}) {
    final isEdit = mesa != null;
    final controller = TextEditingController(text: isEdit ? mesa['numero'] : '');
    String pisoVal = isEdit ? mesa['piso'] : _pisoSeleccionado;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: Text(
                isEdit ? 'Editar Mesa ${mesa['numero']}' : 'Añadir Nueva Mesa',
                style: const TextStyle(fontWeight: FontWeight.w900, fontFamily: 'Outfit'),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: controller,
                      decoration: const InputDecoration(
                        labelText: 'Número / Letra / Código de Mesa',
                        hintText: 'Ej: 1, 2A, VIP-1',
                      ),
                      keyboardType: TextInputType.text,
                    ),
                    const SizedBox(height: 20),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Piso / Ubicación:',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.grey),
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: pisoVal,
                      decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 16)),
                      items: const [
                        DropdownMenuItem(value: 'PLANTA_BAJA', child: Text('Planta Baja')),
                        DropdownMenuItem(value: 'PLANTA_ALTA', child: Text('Primer Piso (Arriba)')),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setDialogState(() {
                            pisoVal = val;
                          });
                        }
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('CANCELAR', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
                ),
                ElevatedButton(
                  onPressed: () {
                    final txt = controller.text.trim();
                    if (txt.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('El nombre de la mesa es obligatorio.')),
                      );
                      return;
                    }
                    Navigator.pop(context);
                    if (isEdit) {
                      _editarMesa(mesa['id'], txt, pisoVal);
                    } else {
                      _crearMesa(txt, pisoVal);
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accentColor,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(
                    isEdit ? 'GUARDAR' : 'CREAR',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _mostrarOpcionesMesa(Map<String, dynamic> mesa) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(20.0),
                child: Text(
                  'Mesa ${mesa['numero']}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, fontFamily: 'Outfit'),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.edit, color: Colors.blue),
                title: const Text('Editar identificador / piso'),
                onTap: () {
                  Navigator.pop(context);
                  _mostrarDialogoCrearEditar(mesa: mesa);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.red),
                title: const Text('Eliminar mesa'),
                onTap: () {
                  Navigator.pop(context);
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text('¿Eliminar Mesa ${mesa['numero']}?'),
                      content: const Text('Esta acción quitará la mesa del salón. Solo puedes eliminar mesas que no tengan pedidos activos.'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('CANCELAR'),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.pop(context);
                            _eliminarMesa(mesa['id']);
                          },
                          child: const Text('ELIMINAR', style: TextStyle(color: Colors.red)),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Filtrar mesas del piso seleccionado
    final mesasFiltradas = _mesas.where((m) => m['piso'] == _pisoSeleccionado).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Diseño de Mesas'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchMesas,
            tooltip: 'Refrescar',
          )
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Selector de piso
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
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
                                'PRIMER PISO (ARRIBA)',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Explicación de uso
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Row(
                    children: const [
                      Icon(Icons.info_outline, size: 14, color: AppTheme.textMuted),
                      SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Arrastra las mesas para ubicarlas. Toca una mesa para editarla.',
                          style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
                        ),
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 8),

                // Canvas de mesas
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
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final canvasWidth = constraints.maxWidth;
                            final canvasHeight = constraints.maxHeight;

                            return Stack(
                              children: [
                                // Dibujar cuadrícula de diseño premium
                                CustomPaint(
                                  size: Size(canvasWidth, canvasHeight),
                                  painter: GridPainter(),
                                ),
                                
                                // Indicador de área
                                Positioned(
                                  bottom: 12,
                                  left: 12,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.black38,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '${_pisoSeleccionado == 'PLANTA_BAJA' ? 'PLANTA BAJA' : 'PRIMER PISO'} - PLANO DE DISTRIBUCIÓN',
                                      style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.grey),
                                    ),
                                  ),
                                ),

                                // Mesas
                                ...mesasFiltradas.map((m) {
                                  // Sanitizar coordenadas para evitar errores de tipo
                                  double px = 10.0;
                                  double py = 10.0;
                                  if (m['pos_x'] != null) {
                                    px = (m['pos_x'] as num).toDouble();
                                  }
                                  if (m['pos_y'] != null) {
                                    py = (m['pos_y'] as num).toDouble();
                                  }

                                  // Convertir coordenadas de porcentaje a pixeles
                                  double left = (px / 100.0) * canvasWidth;
                                  double top = (py / 100.0) * canvasHeight;

                                  // Limitar dentro del lienzo para que no desaparezca
                                  left = left.clamp(0.0, canvasWidth - 60.0);
                                  top = top.clamp(0.0, canvasHeight - 60.0);

                                  return Positioned(
                                    left: left,
                                    top: top,
                                    child: GestureDetector(
                                      onPanUpdate: (details) {
                                        setState(() {
                                          double deltaPctX = (details.delta.dx / canvasWidth) * 100.0;
                                          double deltaPctY = (details.delta.dy / canvasHeight) * 100.0;

                                          m['pos_x'] = (px + deltaPctX).clamp(0.0, 90.0);
                                          m['pos_y'] = (py + deltaPctY).clamp(0.0, 90.0);
                                        });
                                      },
                                      onPanEnd: (details) {
                                        _updateMesaPosicion(m['id'], m['pos_x'], m['pos_y']);
                                      },
                                      onTap: () {
                                        _mostrarOpcionesMesa(m);
                                      },
                                      child: Container(
                                        width: 60,
                                        height: 60,
                                        decoration: BoxDecoration(
                                          color: AppTheme.primaryDark,
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: AppTheme.accentColor,
                                            width: 3,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: AppTheme.accentColor.withOpacity(0.3),
                                              blurRadius: 10,
                                              spreadRadius: 1,
                                            ),
                                          ],
                                        ),
                                        child: Center(
                                          child: Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              const Icon(
                                                Icons.table_restaurant_outlined,
                                                size: 16,
                                                color: AppTheme.accentColor,
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                '${m['numero']}',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.black,
                                                  fontSize: 12,
                                                  color: AppTheme.textLight,
                                                  fontFamily: 'Outfit',
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _mostrarDialogoCrearEditar(),
        backgroundColor: AppTheme.accentColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('MESA', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.borderDark.withOpacity(0.2)
      ..strokeWidth = 1.0;

    const double step = 25.0; // Distancia entre líneas de cuadrícula

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
