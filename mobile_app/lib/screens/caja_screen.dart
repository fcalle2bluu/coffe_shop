import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:http/http.dart' as http;
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/bouncing_widget.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../widgets/fade_in_slide.dart';
import '../services/sunmi_printer_service.dart';

class CajaScreen extends StatefulWidget {
  const CajaScreen({super.key});

  @override
  State<CajaScreen> createState() => _CajaScreenState();
}

class _CajaScreenState extends State<CajaScreen> {
  bool _isLoading = true;
  bool _isCajaAbierta = false;
  
  Map<String, dynamic>? _cajaActiva;
  Map<String, dynamic>? _ventasActivas;
  double _efectivoEsperado = 0.0;
  double _totalGastos = 0.0;
  double _totalConsumeLoNuestro = 0.0;
  List<dynamic> _historialCajas = [];
  String _rolActual = '';
  int _selectedTab = 0; // 0: Turno Activo, 1: Ventas Realizadas, 2: Auditoría, 3: Historial Turnos

  // Gastos del Turno Activo
  List<dynamic> _gastosTurnoActivo = [];
  bool _loadingGastos = false;

  // Ventas Realizadas / Comprobantes (Filtros y Datos)
  List<dynamic> _todasLasVentas = [];
  List<dynamic> _ventasFiltradas = [];
  bool _loadingVentas = false;
  List<dynamic> _usuarios = []; // Para filtros y venta histórica
  
  // Valores de Filtros
  DateTime? _filtroFechaDesde;
  DateTime? _filtroFechaHasta;
  String _filtroMetodo = ''; // '', 'EFECTIVO', 'QR', 'TARJETA', 'CONSUME LO NUESTRO', 'BILLETERA MOVIL'
  String _filtroCajero = ''; // Nombre del cajero (cajero)

  // Venta Histórica Dialog Controllers
  int? _selectedCajeroHistoricoId;
  DateTime _fechaVentaHistorica = DateTime.now();
  String _metodoVentaHistorica = 'EFECTIVO';
  final _totalVentaHistoricaController = TextEditingController();

  // Dialog / Modal Detalle Desglose Turno
  List<dynamic> _desgloseVentas = [];
  List<dynamic> _desgloseGastos = [];
  bool _loadingDesglose = false;

  // Dialog / Modal Eliminar Turno
  List<dynamic> _eliminarTurnoVentas = [];
  bool _loadingEliminarTurnoVentas = false;

  // Controllers para Apertura/Cierre y Gasto
  final _montoInicialController = TextEditingController();
  final _montoFinalController = TextEditingController();
  final _gastoMontoController = TextEditingController();
  final _gastoDescController = TextEditingController();

  bool _isPrinting = false;

  @override
  void initState() {
    super.initState();
    _loadCajaStatus();
  }

  @override
  void dispose() {
    _montoInicialController.dispose();
    _montoFinalController.dispose();
    _gastoMontoController.dispose();
    _gastoDescController.dispose();
    _totalVentaHistoricaController.dispose();
    super.dispose();
  }

  // Custom DELETE client that handles req.body for Render/Render Node API constraints
  Future<http.Response> _deleteWithBody(String endpoint, Map<String, dynamic> body) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$endpoint');
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getInt('usuario_id');
    final headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CafeLaPazApp/1.0',
      if (userId != null) 'x-usuario-id': userId.toString(),
    };
    final request = http.Request('DELETE', url)
      ..headers.addAll(headers)
      ..body = jsonEncode(body);
    
    final streamedResponse = await request.send();
    return await http.Response.fromStream(streamedResponse);
  }

  Future<void> _loadCajaStatus() async {
    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      _rolActual = prefs.getString('usuario_rol') ?? '';

      final res = await ApiConfig.get('/caja/estado');

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _isCajaAbierta = data['abierta'] == true;
        if (_isCajaAbierta) {
          _cajaActiva = data['caja'];
          _ventasActivas = data['ventas'];
          _efectivoEsperado = double.tryParse(data['efectivo_esperado'].toString()) ?? 0.0;
          _totalGastos = double.tryParse(data['total_gastos'].toString()) ?? 0.0;
          _totalConsumeLoNuestro = double.tryParse(data['ventas']['total_consume_lo_nuestro'].toString()) ?? 0.0;
          
          // Load active expenses
          await _loadGastosTurnoActivo(_cajaActiva!['id']);
        } else {
          _cajaActiva = null;
          _ventasActivas = null;
          _efectivoEsperado = 0.0;
          _totalGastos = 0.0;
          _totalConsumeLoNuestro = 0.0;
          _gastosTurnoActivo = [];
        }
      }

      if (_rolActual.toUpperCase() != 'CAJERO') {
        final histRes = await ApiConfig.get('/caja/historial');
        if (histRes.statusCode == 200) {
          _historialCajas = jsonDecode(histRes.body);
        }
        await _loadUsuarios();
      } else {
        _historialCajas = [];
      }
      
      await _loadVentas();
    } catch (e) {
      print('Error al cargar estado de caja: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadGastosTurnoActivo(int cajaId) async {
    setState(() => _loadingGastos = true);
    try {
      final res = await ApiConfig.get('/caja/gastos/$cajaId');
      if (res.statusCode == 200) {
        setState(() {
          _gastosTurnoActivo = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar gastos del turno: $e');
    } finally {
      setState(() => _loadingGastos = false);
    }
  }

  Future<void> _loadUsuarios() async {
    try {
      final res = await ApiConfig.get('/parametros/usuarios');
      if (res.statusCode == 200) {
        setState(() {
          _usuarios = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error loading usuarios: $e');
    }
  }

  Future<void> _loadVentas() async {
    setState(() => _loadingVentas = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;
      
      final res = await ApiConfig.get('/caja/historial-ventas-cajeros?usuario_id=$userId');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _todasLasVentas = data;
        });
        _filtrarVentas();
      }
    } catch (e) {
      print('Error loading sales: $e');
    } finally {
      setState(() => _loadingVentas = false);
    }
  }

  void _filtrarVentas() {
    if (_todasLasVentas.isEmpty) {
      setState(() {
        _ventasFiltradas = [];
      });
      return;
    }

    final filtered = _todasLasVentas.where((v) {
      if (v['fecha_venta'] == null) return false;
      final dateStr = v['fecha_venta'].toString().split(' ')[0]; // YYYY-MM-DD

      // Date Filters
      if (_filtroFechaDesde != null) {
        final desdeStr = _formatDateYYYYMMDD(_filtroFechaDesde!);
        if (dateStr.compareTo(desdeStr) < 0) return false;
      }
      if (_filtroFechaHasta != null) {
        final hastaStr = _formatDateYYYYMMDD(_filtroFechaHasta!);
        if (dateStr.compareTo(hastaStr) > 0) return false;
      }

      // Method Filter
      if (_filtroMetodo.isNotEmpty) {
        final mp = (v['metodo_pago'] ?? '').toString().toUpperCase();
        if (_filtroMetodo == 'QR' && !['QR', 'QR DIGITAL'].contains(mp)) return false;
        if (_filtroMetodo == 'TARJETA' && !['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].contains(mp)) return false;
        if (_filtroMetodo == 'CONSUME LO NUESTRO' && !['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].contains(mp)) return false;
        if (_filtroMetodo == 'EFECTIVO' && mp != 'EFECTIVO') return false;
        if (_filtroMetodo == 'BILLETERA MOVIL' && mp != 'BILLETERA MOVIL') return false;
      }

      // Cashier Filter
      if (_filtroCajero.isNotEmpty && v['cajero'] != _filtroCajero) return false;

      return true;
    }).toList();

    setState(() {
      _ventasFiltradas = filtered;
    });
  }

  String _formatDateYYYYMMDD(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  Map<String, Map<String, List<dynamic>>> _groupSalesForAuditoria() {
    final Map<String, Map<String, List<dynamic>>> grouped = {};

    for (final v in _todasLasVentas) {
      if (v['fecha_venta'] == null) continue;
      
      final parts = v['fecha_venta'].toString().split(' ')[0].split('-');
      if (parts.length < 2) continue;
      final year = parts[0];
      final monthNum = parts[1];
      
      final monthsList = {
        '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio',
        '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
      };
      
      final monthName = '${monthsList[monthNum] ?? monthNum} $year';
      final cashier = v['cajero'] ?? 'Sin Cajero Asignado';

      grouped.putIfAbsent(monthName, () => {});
      grouped[monthName]!.putIfAbsent(cashier, () => []);
      grouped[monthName]![cashier]!.add(v);
    }
    return grouped;
  }

  String getNormalMetodo(String? m) {
    if (m == null) return 'EFECTIVO';
    final upper = m.toUpperCase();
    if (upper == 'QR DIGITAL') return 'QR';
    if (upper == 'TARJETA DE DÉBITO/CRÉDITO') return 'TARJETA';
    if (upper == 'CONSUME_LO_NUESTRO') return 'CONSUME LO NUESTRO';
    if (upper == 'BILLETERA_MOVIL') return 'BILLETERA MOVIL';
    return upper;
  }

  Future<void> _actualizarMetodoPago(int ventaId, String metodo) async {
    try {
      final res = await ApiConfig.put('/caja/ventas/$ventaId/metodo-pago', {
        'metodo_pago': metodo,
        'editor_rol': _rolActual,
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Método de pago actualizado')),
        );
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ Error: $e')),
      );
    }
  }

  Future<void> _toggleVentaHistorica(int ventaId, bool esHistorica) async {
    try {
      final res = await ApiConfig.put('/caja/ventas/$ventaId/historica', {
        'es_historica': esHistorica,
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('✅ Venta marcada como ${esHistorica ? 'Histórica' : 'Normal'}')),
        );
        _loadVentas();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ Error: $e')),
      );
    }
  }

  Future<void> _registrarVentaHistorica() async {
    final total = double.tryParse(_totalVentaHistoricaController.text) ?? 0.0;
    if (_selectedCajeroHistoricoId == null || total <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Por favor completa todos los campos correctamente.')),
      );
      return;
    }

    try {
      final res = await ApiConfig.post('/caja/venta-historica', {
        'usuario_id': _selectedCajeroHistoricoId,
        'total': total,
        'metodo_pago': _metodoVentaHistorica,
        'fecha_venta': _fechaVentaHistorica.toIso8601String().substring(0, 16),
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        Navigator.pop(context);
        _totalVentaHistoricaController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Venta histórica registrada con éxito')),
        );
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ Error: $e')),
      );
    }
  }

  Future<void> _abrirCaja() async {
    final montoInicial = double.tryParse(_montoInicialController.text) ?? -1.0;
    if (montoInicial < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce un monto inicial válido (mínimo Bs. 0)')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final res = await ApiConfig.post('/caja/abrir', {
        'saldo_inicial': montoInicial,
        'usuario_id': userId,
      });

      if (res.statusCode == 201) {
        final data = jsonDecode(res.body);
        await prefs.setInt('caja_id', data['id']);
        _montoInicialController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al abrir caja');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cerrarCaja() async {
    final montoFinal = double.tryParse(_montoFinalController.text) ?? -1.0;
    if (montoFinal < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce el saldo final en caja (efectivo real)')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;
      final cajaId = _cajaActiva?['id'];

      final res = await ApiConfig.post('/caja/cerrar', {
        'caja_id': cajaId,
        'saldo_final': montoFinal,
        'usuario_id': userId,
      });

      if (res.statusCode == 200) {
        await prefs.remove('caja_id');
        _montoFinalController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al cerrar caja');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al cerrar caja'),
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

  Future<void> _registrarGasto() async {
    final monto = double.tryParse(_gastoMontoController.text) ?? 0.0;
    final desc = _gastoDescController.text.trim();
    final cajaId = _cajaActiva?['id'];

    if (monto <= 0 || desc.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Llene todos los campos correctamente.')),
      );
      return;
    }

    Navigator.pop(context);
    setState(() => _isLoading = true);

    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final res = await ApiConfig.post('/caja/gastos', {
        'caja_id': cajaId,
        'usuario_id': userId,
        'monto': monto,
        'descripcion': desc,
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        _gastoMontoController.clear();
        _gastoDescController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al registrar gasto: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _eliminarGasto(int id) async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getInt('usuario_id') ?? 1;
    setState(() => _isLoading = true);
    try {
      final res = await _deleteWithBody('/caja/gastos/$id', {
        'usuario_id': userId,
      });
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Gasto eliminado correctamente')),
        );
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ Error al eliminar gasto: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _verDesgloseTurno(int turnoId) async {
    setState(() {
      _desgloseVentas = [];
      _desgloseGastos = [];
      _loadingDesglose = true;
    });

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          if (_loadingDesglose) {
            _loadDesgloseData(turnoId).then((_) {
              setDialogState(() {
                _loadingDesglose = false;
              });
            });
            return const AlertDialog(
              backgroundColor: AppTheme.secondaryDark,
              content: SizedBox(
                height: 100,
                child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
              ),
            );
          }

          final turno = _historialCajas.firstWhere((t) => t['id'] == turnoId, orElse: () => null);
          final saldoInicial = double.tryParse(turno?['saldo_inicial']?.toString() ?? '0.0') ?? 0.0;
          final ventasEfectivo = double.tryParse(turno?['ventas_efectivo']?.toString() ?? '0.0') ?? 0.0;
          final totalDigital = double.tryParse(turno?['ventas_qr']?.toString() ?? '0.0') ?? 0.0; 
          final totalGastos = double.tryParse(turno?['total_gastos']?.toString() ?? '0.0') ?? 0.0;
          final saldoFinal = double.tryParse(turno?['saldo_final']?.toString() ?? '0.0') ?? 0.0;
          final esperado = saldoInicial + ventasEfectivo - totalGastos;
          final dif = double.tryParse(turno?['diferencia']?.toString() ?? '0.0') ?? 0.0;

          return AlertDialog(
            backgroundColor: AppTheme.secondaryDark,
            title: Text('Desglose de Turno #$turnoId', style: const TextStyle(fontWeight: FontWeight.bold)),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Cajero: ${turno?['usuario_nombre'] ?? 'Desconocido'}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                    Text('Apertura: ${turno?['apertura']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    Text('Cierre: ${turno?['cierre']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    const Divider(color: Colors.white10),
                    
                    _buildAmountRow('Fondo Inicial', saldoInicial),
                    _buildAmountRow('Ventas Efectivo', ventasEfectivo),
                    _buildAmountRow('Ventas Digitales', totalDigital),
                    _buildAmountRow('Gastos del Turno', totalGastos),
                    _buildAmountRow('Efectivo Cajón (Real)', saldoFinal),
                    _buildAmountRow('Efectivo Esperado', esperado, isMuted: true),
                    
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Diferencia:', style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted)),
                        Text(
                          'Bs. ${dif.toStringAsFixed(2)} (${dif > 0.01 ? 'Sobrante' : (dif < -0.01 ? 'Faltante' : 'Cuadrado')})',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: dif > 0.01 ? const Color(0xFF10B981) : (dif < -0.01 ? Colors.redAccent : AppTheme.textMuted)),
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white10, height: 24),

                    const Text('Ventas del Turno', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 8),
                    if (_desgloseVentas.isEmpty)
                      const Text('No hay ventas en este turno.', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppTheme.textMuted))
                    else
                      ..._desgloseVentas.map((v) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('#${v['id']} • ${(v['fecha_venta'] ?? '').toString().split(' ')[1]}', style: const TextStyle(fontSize: 11, color: AppTheme.textLight)),
                            Text('${v['metodo_pago']}', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                            Text('Bs. ${double.tryParse(v['total']?.toString() ?? '0')?.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      )),

                    const SizedBox(height: 16),
                    const Text('Gastos del Turno', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 8),
                    if (_desgloseGastos.isEmpty)
                      const Text('No hay gastos en este turno.', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppTheme.textMuted))
                    else
                      ..._desgloseGastos.map((g) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${g['hora']} • ${g['descripcion']}', style: const TextStyle(fontSize: 11, color: AppTheme.textLight)),
                            Text('-Bs. ${double.tryParse(g['monto']?.toString() ?? '0')?.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Colors.redAccent, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      )),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cerrar'),
              )
            ],
          );
        },
      ),
    );
  }

  Future<void> _loadDesgloseData(int turnoId) async {
    try {
      final resVentas = await ApiConfig.get('/caja/ventas/$turnoId');
      final resGastos = await ApiConfig.get('/caja/gastos/$turnoId');
      if (resVentas.statusCode == 200 && resGastos.statusCode == 200) {
        _desgloseVentas = jsonDecode(resVentas.body);
        _desgloseGastos = jsonDecode(resGastos.body);
      }
    } catch (e) {
      print('Error loading desglose data: $e');
    }
  }

  Future<void> _eliminarTurnoDialog(int turnoId) async {
    setState(() {
      _eliminarTurnoVentas = [];
      _loadingEliminarTurnoVentas = true;
    });

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          if (_loadingEliminarTurnoVentas) {
            _loadEliminarTurnoData(turnoId).then((_) {
              setDialogState(() {
                _loadingEliminarTurnoVentas = false;
              });
            });
            return const AlertDialog(
              backgroundColor: AppTheme.secondaryDark,
              content: SizedBox(
                height: 100,
                child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
              ),
            );
          }

          return AlertDialog(
            backgroundColor: AppTheme.secondaryDark,
            title: Row(
              children: const [
                Icon(Icons.warning, color: Colors.redAccent),
                SizedBox(width: 8),
                Text('Eliminar Turno'),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '⚠️ ¡ATENCIÓN! ACCIÓN CRÍTICA Y DE ALTO RIESGO',
                      style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Si confirmas la eliminación del Turno #$turnoId, se eliminará de forma PERMANENTE toda la información conectada: gastos de caja del turno, comandas asociadas y todas las ventas realizadas que se listan a continuación.\n\nEsta acción es irreversible y podría alterar los balances financieros.',
                      style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                    ),
                    const Divider(color: Colors.white10, height: 20),
                    Text('Ventas en este turno (${_eliminarTurnoVentas.length})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(height: 6),
                    if (_eliminarTurnoVentas.isEmpty)
                      const Text('No hay ventas registradas.', style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppTheme.textMuted))
                    else
                      ..._eliminarTurnoVentas.map((v) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('#${v['id']} • ${v['fecha_venta']}', style: const TextStyle(fontSize: 10.5, color: AppTheme.textLight)),
                            Text('${v['metodo_pago']}', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                            Text('Bs. ${double.tryParse(v['total']?.toString() ?? '0')?.toStringAsFixed(2)}', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      )),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white),
                onPressed: () => _confirmarEliminarTurno(turnoId),
                child: const Text('Confirmar Eliminación'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _loadEliminarTurnoData(int turnoId) async {
    try {
      final res = await ApiConfig.get('/caja/ventas/$turnoId');
      if (res.statusCode == 200) {
        _eliminarTurnoVentas = jsonDecode(res.body);
      }
    } catch (e) {
      print('Error loading shift sales: $e');
    }
  }

  Future<void> _confirmarEliminarTurno(int turnoId) async {
    Navigator.pop(context); // Close confirm dialog
    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final res = await _deleteWithBody('/caja/eliminar/$turnoId', {
        'usuario_id': userId,
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Turno y datos asociados eliminados correctamente')),
        );
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ Error al eliminar turno: $e')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _showGastoDialog() {
    _gastoMontoController.clear();
    _gastoDescController.clear();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.secondaryDark,
        title: const Text('Registrar Gasto del Turno'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _gastoMontoController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Monto del Gasto (Bs.)',
                hintText: '0.00',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _gastoDescController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Descripción / Concepto',
                hintText: 'Ej: Compra de servilletas',
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
            onPressed: _registrarGasto,
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
  }

  Future<void> _verYReimprimirTicket(int ventaId) async {
    try {
      final res = await ApiConfig.get('/comprobantes/$ventaId');
      if (res.statusCode != 200) throw Exception('Error al cargar ticket');

      final data = jsonDecode(res.body);
      final ticket = data['ticket'];
      final items = List<Map<String, dynamic>>.from(data['items']);
      final total = double.tryParse(ticket['total']?.toString() ?? '0') ?? 0.0;

      if (!mounted) return;

      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (ctx) => Container(
          height: MediaQuery.of(ctx).size.height * 0.7,
          decoration: const BoxDecoration(
            color: AppTheme.secondaryDark,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
              ),
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Ticket #${ventaId.toString().padLeft(5, '0')}',
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: AppTheme.textLight)),
                    Row(
                      children: [
                        StatefulBuilder(
                          builder: (context, setButtonState) {
                            return ElevatedButton.icon(
                              onPressed: _isPrinting ? null : () async {
                                setButtonState(() => _isPrinting = true);
                                try {
                                  await SunmiPrinterService.printTicketVenta(
                                    ventaId: ventaId,
                                    fecha: ticket['fecha'] ?? '',
                                    items: items,
                                    total: total,
                                    metodoPago: ticket['metodo_pago'] ?? 'EFECTIVO',
                                    estado: ticket['estado'],
                                  );
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      const SnackBar(content: Text('✅ Ticket impreso correctamente')),
                                    );
                                  }
                                } catch (e) {
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(content: Text('❌ Error al imprimir: $e')),
                                    );
                                  }
                                } finally {
                                  setButtonState(() => _isPrinting = false);
                                }
                              },
                              icon: _isPrinting
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const FaIcon(FontAwesomeIcons.print, size: 14),
                              label: Text(_isPrinting ? 'Imprimiendo...' : 'Imprimir'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentColor,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            );
                          },
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: const FaIcon(FontAwesomeIcons.xmark, size: 18, color: AppTheme.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Fecha: ${ticket['fecha']}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                    Text('Método: ${ticket['metodo_pago']}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Divider(color: Colors.white10),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: items.length,
                  itemBuilder: (ctx, i) {
                    final item = items[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Container(
                            width: 28, height: 28,
                            decoration: BoxDecoration(
                              color: AppTheme.accentColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Center(
                              child: Text('${item['cantidad']}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: AppTheme.accentColor)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(item['nombre'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppTheme.textLight)),
                          ),
                          Text('Bs. ${double.tryParse(item['subtotal']?.toString() ?? '0')?.toStringAsFixed(2) ?? '0.00'}',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: AppTheme.textLight)),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.accentColor.withOpacity(0.08),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('TOTAL', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppTheme.accentColor)),
                    Text('Bs. ${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: AppTheme.accentColor)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Widget _buildDashboardStatCard(String title, double value, Color bgColor, Color textColor, dynamic icon, {String? subtitle}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: textColor.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, color: textColor, letterSpacing: 0.5),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              FaIcon(icon, size: 11, color: textColor.withOpacity(0.6)),
            ],
          ),
          const SizedBox(height: 4),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Bs. ${value.toStringAsFixed(2)}',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: textColor),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 7.2, color: textColor.withOpacity(0.85), fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBigEfectivoCard(String title, double value, double gastos) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orangeAccent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.orangeAccent.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title.toUpperCase(),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.orangeAccent, letterSpacing: 1.0),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Saldo Neto (Fondo + Ventas Efectivo - Gastos)',
                  style: TextStyle(fontSize: 9, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Bs. ${value.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.orangeAccent),
          ),
        ],
      ),
    );
  }

  Widget _buildVentasNetasCard(double efectivo, double qr, double tarjeta, double cln, double gastos) {
    final double netas = efectivo + qr + tarjeta + cln - gastos;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF14B8A6).withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF14B8A6).withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'VENTAS NETAS',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF14B8A6), letterSpacing: 1.0),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Suma (Efectivo + QR + Billeteras) - Gastos',
                  style: TextStyle(fontSize: 9, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Bs. ${netas.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF14B8A6)),
          ),
        ],
      ),
    );
  }

  Widget _buildVentasChart(double efectivo, double qr, double tarjeta, double consume) {
    final double total = efectivo + qr + tarjeta + consume;
    if (total <= 0) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.01),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.04)),
        ),
        child: const Center(
          child: Text(
            'No hay transacciones registradas en este turno para graficar.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textMuted, fontSize: 10.5, fontWeight: FontWeight.bold),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.01),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'DISTRIBUCIÓN DE MÉTODOS DE PAGO',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: AppTheme.textLight, letterSpacing: 0.5),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                flex: 4,
                child: SizedBox(
                  height: 100,
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 2,
                      centerSpaceRadius: 24,
                      sections: [
                        if (efectivo > 0)
                          PieChartSectionData(
                            color: const Color(0xFF10B981),
                            value: efectivo,
                            title: '${(efectivo / total * 100).toStringAsFixed(0)}%',
                            radius: 20,
                            titleStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        if (qr > 0)
                          PieChartSectionData(
                            color: Colors.blueAccent,
                            value: qr,
                            title: '${(qr / total * 100).toStringAsFixed(0)}%',
                            radius: 20,
                            titleStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        if (tarjeta > 0)
                          PieChartSectionData(
                            color: Colors.purpleAccent,
                            value: tarjeta,
                            title: '${(tarjeta / total * 100).toStringAsFixed(0)}%',
                            radius: 20,
                            titleStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        if (consume > 0)
                          PieChartSectionData(
                            color: Colors.orangeAccent,
                            value: consume,
                            title: '${(consume / total * 100).toStringAsFixed(0)}%',
                            radius: 20,
                            titleStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                flex: 6,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildLegendItem('Efectivo', efectivo, const Color(0xFF10B981)),
                    const SizedBox(height: 6),
                    _buildLegendItem('QR Transfer.', qr, Colors.blueAccent),
                    const SizedBox(height: 6),
                    _buildLegendItem('Consume Nuestro', consume, Colors.orangeAccent),
                    const SizedBox(height: 6),
                    _buildLegendItem('Tarjeta POS', tarjeta, Colors.purpleAccent),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String label, double value, Color color) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 9, color: AppTheme.textMuted, fontWeight: FontWeight.w700),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Text(
          'Bs. ${value.toStringAsFixed(2)}',
          style: const TextStyle(fontSize: 9, color: AppTheme.textLight, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildStateCard() {
    if (_isCajaAbierta) {
      final username = _cajaActiva?['usuario_nombre'] ?? 'Cajero';
      final fecha = _cajaActiva?['fecha_apertura_formateada'] ?? '';
      final inicial = double.tryParse(_cajaActiva?['saldo_inicial']?.toString() ?? '0.0') ?? 0.0;
      final ventasEfectivo = double.tryParse(_ventasActivas?['total_efectivo']?.toString() ?? '0.0') ?? 0.0;
      final ventasQr = double.tryParse(_ventasActivas?['total_qr']?.toString() ?? '0.0') ?? 0.0;
      final ventasTarjeta = double.tryParse(_ventasActivas?['total_tarjeta']?.toString() ?? '0.0') ?? 0.0;

      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(color: Color(0xFF10B981), shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'TURNO ACTIVO DE CAJA',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: Color(0xFF10B981)),
                      ),
                    ],
                  ),
                  Text('ID: #${_cajaActiva?['id']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Abierto por $username',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Text(
                'Iniciado el $fecha',
                style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
              const Divider(color: Colors.white10, height: 24),
              
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                children: [
                  _buildDashboardStatCard('Fondo Inicial', inicial, Colors.blueAccent.withOpacity(0.08), Colors.blueAccent, FontAwesomeIcons.wallet),
                  _buildDashboardStatCard('Ventas Efectivo', ventasEfectivo, const Color(0xFF10B981).withOpacity(0.08), const Color(0xFF10B981), FontAwesomeIcons.moneyBillWave),
                  _buildDashboardStatCard(
                    'Ventas Digitales',
                    ventasQr + ventasTarjeta + _totalConsumeLoNuestro,
                    Colors.purpleAccent.withOpacity(0.08),
                    Colors.purpleAccent,
                    FontAwesomeIcons.creditCard,
                    subtitle: 'QR: ${ventasQr.toStringAsFixed(2)} | Tarj: ${ventasTarjeta.toStringAsFixed(2)} | CLN: ${_totalConsumeLoNuestro.toStringAsFixed(2)}',
                  ),
                  _buildDashboardStatCard('Gastos Turno', _totalGastos, Colors.redAccent.withOpacity(0.08), Colors.redAccent, FontAwesomeIcons.handHoldingDollar),
                ],
              ),
              const SizedBox(height: 16),
              
              _buildVentasNetasCard(ventasEfectivo, ventasQr, ventasTarjeta, _totalConsumeLoNuestro, _totalGastos),
              const SizedBox(height: 12),
              
              _buildBigEfectivoCard('Efectivo en Cajón', _efectivoEsperado, _totalGastos),
              
              const SizedBox(height: 16),

              _buildVentasChart(ventasEfectivo, ventasQr, ventasTarjeta, _totalConsumeLoNuestro),

              const Divider(color: Colors.white10, height: 24),
              
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('GASTOS DEL TURNO ACTIVO', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.textMuted)),
                  Text('Total: Bs. ${_totalGastos.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Colors.redAccent, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              _buildGastosListWidget(),

              const Divider(color: Colors.white10, height: 24),

              const Text('Operaciones de Turno', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _showGastoDialog,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.redAccent,
                        side: const BorderSide(color: Colors.redAccent),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      icon: const FaIcon(FontAwesomeIcons.handHoldingDollar, size: 14),
                      label: const Text('REGISTRAR GASTO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _montoFinalController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        hintText: 'Bs. 0.00',
                        labelText: 'Efectivo Real en Caja',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _cerrarCaja,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.redAccent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('CERRAR CAJA', style: TextStyle(letterSpacing: 0.5, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    } else {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'CAJA CERRADA',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: Colors.redAccent),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'No hay ningún turno abierto actualmente',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const Text(
                'Debe abrir un turno ingresando el dinero base en efectivo.',
                style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
              ),
              const Divider(color: Colors.white10, height: 32),
              
              const Text('Apertura de Turno', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _montoInicialController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        hintText: 'Bs. 0.00',
                        labelText: 'Saldo Inicial en Caja',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _abrirCaja,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('ABRIR CAJA', style: TextStyle(letterSpacing: 1.0, fontSize: 12)),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }
  }

  Widget _buildAmountRow(String label, double val, {bool isMuted = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: isMuted ? AppTheme.textMuted.withOpacity(0.7) : AppTheme.textMuted,
            ),
          ),
          Text(
            'Bs. ${val.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: isMuted ? FontWeight.normal : FontWeight.bold,
              color: isMuted ? AppTheme.textMuted : AppTheme.textLight,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryStatCard(String title, double value, Color bgColor, Color textColor, {String? subtitle}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: textColor.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, color: textColor, letterSpacing: 0.5),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 3),
          Text(
            'Bs. ${value.toStringAsFixed(2)}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: textColor),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: TextStyle(fontSize: 7.2, color: textColor.withOpacity(0.85), fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildHistoryList() {
    if (_historialCajas.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Center(
            child: Text(
              'No hay registros históricos de cajas cerradas.',
              style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted),
            ),
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _historialCajas.length,
      separatorBuilder: (context, idx) => const SizedBox(height: 12),
      itemBuilder: (context, idx) {
        final h = _historialCajas[idx];
        final saldoInicial = double.tryParse(h['saldo_inicial']?.toString() ?? '0.0') ?? 0.0;
        final saldoFinal = double.tryParse(h['saldo_final']?.toString() ?? '0.0') ?? 0.0;
        final ventasEfectivo = double.tryParse(h['ventas_efectivo']?.toString() ?? '0.0') ?? 0.0;
        final ventasQr = double.tryParse(h['ventas_qr']?.toString() ?? '0.0') ?? 0.0;
        final ventasTarjeta = double.tryParse(h['ventas_tarjeta']?.toString() ?? '0.0') ?? 0.0;
        final ventasCln = double.tryParse(h['ventas_cln']?.toString() ?? '0.0') ?? 0.0;
        final totalGastos = double.tryParse(h['total_gastos']?.toString() ?? '0.0') ?? 0.0;
        final diff = double.tryParse(h['diferencia']?.toString() ?? '0.0') ?? 0.0;

        final totalDigital = ventasQr + ventasTarjeta + ventasCln;
        final esperado = saldoInicial + ventasEfectivo - totalGastos;

        final diffColor = diff > 0.01 
            ? const Color(0xFF10B981) 
            : (diff < -0.01 ? Colors.redAccent : AppTheme.textMuted);
        final diffLabel = diff > 0.01 
            ? 'Sobrante' 
            : (diff < -0.01 ? 'Faltante' : 'Cuadrado');

        return Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Turno #${h['id']}',
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: AppTheme.textLight),
                    ),
                    Text(
                      'Cajero: ${h['usuario_nombre'] ?? 'Desconocido'}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.accentColor),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Apertura: ${h['apertura']}', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text('Cierre: ${h['cierre']}', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                  ],
                ),
                const Divider(color: Colors.white10, height: 16),

                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 1.8,
                  children: [
                    _buildHistoryStatCard('Fondo Inicial', saldoInicial, Colors.blueAccent.withOpacity(0.08), Colors.blueAccent),
                    _buildHistoryStatCard('Ventas Efectivo', ventasEfectivo, const Color(0xFF10B981).withOpacity(0.08), const Color(0xFF10B981)),
                    _buildHistoryStatCard(
                      'Ventas Digitales',
                      totalDigital,
                      Colors.purpleAccent.withOpacity(0.08),
                      Colors.purpleAccent,
                      subtitle: 'QR: ${ventasQr.toStringAsFixed(0)} | T: ${ventasTarjeta.toStringAsFixed(0)} | C: ${ventasCln.toStringAsFixed(0)}',
                    ),
                    _buildHistoryStatCard('Gastos Turno', totalGastos, Colors.redAccent.withOpacity(0.08), Colors.redAccent),
                  ],
                ),
                const SizedBox(height: 12),

                _buildVentasNetasCard(ventasEfectivo, ventasQr, ventasTarjeta, ventasCln, totalGastos),
                const SizedBox(height: 12),

                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.orangeAccent.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.orangeAccent.withOpacity(0.1)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('EFECTIVO REAL EN CAJA:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted)),
                          Text('Bs. ${saldoFinal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.orangeAccent)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Efectivo Esperado:', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                          Text('Bs. ${esperado.toStringAsFixed(2)}', style: const TextStyle(fontSize: 10, color: AppTheme.textLight, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Diferencia / Descuadre:', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                          Text(
                            'Bs. ${diff.toStringAsFixed(2)} ($diffLabel)',
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: diffColor),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Divider(color: Colors.white10, height: 24),
                
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.teal.withOpacity(0.1),
                        foregroundColor: Colors.tealAccent,
                        side: const BorderSide(color: Colors.teal, width: 0.5),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () => _verDesgloseTurno(h['id']),
                      icon: const FaIcon(FontAwesomeIcons.listCheck, size: 11),
                      label: const Text('VER DESGLOSE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                    if (_rolActual.toUpperCase() != 'CAJERO')
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.redAccent,
                          side: const BorderSide(color: Colors.redAccent, width: 0.5),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: () => _eliminarTurnoDialog(h['id']),
                        icon: const FaIcon(FontAwesomeIcons.trashCan, size: 11),
                        label: const Text('ELIMINAR TURNO', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
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

  Widget _buildGastosListWidget() {
    if (_loadingGastos) {
      return const SizedBox(
        height: 50,
        child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
      );
    }

    if (_gastosTurnoActivo.isEmpty) {
      return Card(
        color: AppTheme.secondaryDark,
        child: const Padding(
          padding: EdgeInsets.all(16.0),
          child: Center(
            child: Text(
              'No hay gastos registrados en este turno.',
              style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted, fontSize: 11.5),
            ),
          ),
        ),
      );
    }

    final bool isAdmin = _rolActual.toUpperCase() != 'CAJERO';

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _gastosTurnoActivo.length,
      separatorBuilder: (_, __) => const SizedBox(height: 6),
      itemBuilder: (context, idx) {
        final g = _gastosTurnoActivo[idx];
        final id = g['id'];
        final desc = g['descripcion'] ?? '';
        final monto = double.tryParse(g['monto']?.toString() ?? '0.0') ?? 0.0;
        final hora = g['hora'] ?? '';

        return Card(
          color: AppTheme.secondaryDark,
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(desc, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      const SizedBox(height: 2),
                      Text('Hora: $hora', style: const TextStyle(fontSize: 9.5, color: AppTheme.textMuted)),
                    ],
                  ),
                ),
                Row(
                  children: [
                    Text(
                      '-Bs. ${monto.toStringAsFixed(2)}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5, color: Colors.redAccent),
                    ),
                    if (isAdmin) ...[
                      const SizedBox(width: 8),
                      IconButton(
                        constraints: const BoxConstraints(),
                        padding: EdgeInsets.zero,
                        icon: const Icon(Icons.delete, color: Colors.redAccent, size: 16),
                        onPressed: () => _eliminarGasto(id),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTabButton(int index, String label, dynamic icon) {
    final bool isActive = _selectedTab == index;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedTab = index;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? AppTheme.accentColor : Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isActive ? AppTheme.accentColor : Colors.white.withOpacity(0.08),
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            FaIcon(icon, size: 12, color: isActive ? Colors.white : AppTheme.textMuted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.bold,
                color: isActive ? Colors.white : AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVentasFiltrosWidget() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FILTROS DE BÚSQUEDA',
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: AppTheme.textMuted, letterSpacing: 0.5),
            ),
            const SizedBox(height: 10),
            
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final dt = await showDatePicker(
                        context: context,
                        initialDate: _filtroFechaDesde ?? DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now(),
                      );
                      if (dt != null) {
                        setState(() {
                          _filtroFechaDesde = dt;
                        });
                        _filtrarVentas();
                      }
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: 'Desde', contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                      child: Text(
                        _filtroFechaDesde == null ? 'Seleccionar' : _formatDateYYYYMMDD(_filtroFechaDesde!),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final dt = await showDatePicker(
                        context: context,
                        initialDate: _filtroFechaHasta ?? DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now(),
                      );
                      if (dt != null) {
                        setState(() {
                          _filtroFechaHasta = dt;
                        });
                        _filtrarVentas();
                      }
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: 'Hasta', contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                      child: Text(
                        _filtroFechaHasta == null ? 'Seleccionar' : _formatDateYYYYMMDD(_filtroFechaHasta!),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _filtroMetodo,
                    decoration: const InputDecoration(labelText: 'Método Pago', contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                    dropdownColor: AppTheme.secondaryDark,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textLight),
                    items: const [
                      DropdownMenuItem(value: '', child: Text('Todos', style: TextStyle(fontSize: 12))),
                      DropdownMenuItem(value: 'EFECTIVO', child: Text('Efectivo', style: TextStyle(fontSize: 12))),
                      DropdownMenuItem(value: 'QR', child: Text('QR / Digital', style: TextStyle(fontSize: 12))),
                      DropdownMenuItem(value: 'TARJETA', child: Text('Tarjeta', style: TextStyle(fontSize: 12))),
                      DropdownMenuItem(value: 'CONSUME LO NUESTRO', child: Text('Consume Nuestro', style: TextStyle(fontSize: 12))),
                    ],
                    onChanged: (val) {
                      setState(() {
                        _filtroMetodo = val ?? '';
                      });
                      _filtrarVentas();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _filtroCajero,
                    decoration: const InputDecoration(labelText: 'Cajero', contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                    dropdownColor: AppTheme.secondaryDark,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textLight),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Todos', style: TextStyle(fontSize: 12))),
                      ..._usuarios.map((u) {
                        return DropdownMenuItem<String>(
                          value: u['nombre'],
                          child: Text(u['nombre'] ?? '', style: const TextStyle(fontSize: 12)),
                        );
                      }).toList(),
                    ],
                    onChanged: (val) {
                      setState(() {
                        _filtroCajero = val ?? '';
                      });
                      _filtrarVentas();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () {
                    setState(() {
                      _filtroFechaDesde = null;
                      _filtroFechaHasta = null;
                      _filtroMetodo = '';
                      _filtroCajero = '';
                    });
                    _filtrarVentas();
                  },
                  icon: const FaIcon(FontAwesomeIcons.circleXmark, size: 12, color: Colors.redAccent),
                  label: const Text('Limpiar Filtros', style: TextStyle(fontSize: 11, color: Colors.redAccent, fontWeight: FontWeight.bold)),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }

  Widget _buildVentasResumenKPIs() {
    double totalG = 0;
    double totEfec = 0;
    double totQr = 0;
    double totTarj = 0;
    double totCln = 0;

    for (final v in _ventasFiltradas) {
      final t = double.tryParse(v['total']?.toString() ?? '0.0') ?? 0.0;
      final mp = (v['metodo_pago'] ?? '').toString().toUpperCase();
      totalG += t;
      if (mp == 'EFECTIVO') {
        totEfec += t;
      } else if (['QR', 'QR DIGITAL'].contains(mp)) {
        totQr += t;
      } else if (['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].contains(mp)) {
        totTarj += t;
      } else if (['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].contains(mp)) {
        totCln += t;
      }
    }

    final double promedio = _ventasFiltradas.isNotEmpty ? totalG / _ventasFiltradas.length : 0.0;

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: [
        _buildHistoryStatCard('Total General', totalG, AppTheme.accentColor.withOpacity(0.08), AppTheme.accentColor, subtitle: '${_ventasFiltradas.length} venta(s)'),
        _buildHistoryStatCard('Ticket Promedio', promedio, Colors.tealAccent.withOpacity(0.08), Colors.tealAccent),
        _buildHistoryStatCard('Total Efectivo', totEfec, const Color(0xFF10B981).withOpacity(0.08), const Color(0xFF10B981)),
        _buildHistoryStatCard('Total QR', totQr, Colors.blueAccent.withOpacity(0.08), Colors.blueAccent),
        _buildHistoryStatCard('Total Tarjeta', totTarj, Colors.purpleAccent.withOpacity(0.08), Colors.purpleAccent),
        _buildHistoryStatCard('Consume Nuestro', totCln, Colors.orangeAccent.withOpacity(0.08), Colors.orangeAccent),
      ],
    );
  }

  Widget _buildVentasRealizadasList() {
    if (_loadingVentas) {
      return const SizedBox(
        height: 150,
        child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
      );
    }

    if (_ventasFiltradas.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: const [
              FaIcon(FontAwesomeIcons.receipt, size: 28, color: AppTheme.textMuted),
              SizedBox(height: 12),
              Text(
                'No hay ventas registradas que coincidan con los filtros.',
                textAlign: TextAlign.center,
                style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _ventasFiltradas.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, idx) {
        final v = _ventasFiltradas[idx];
        final id = v['venta_id'];
        final date = v['fecha_venta'] ?? '';
        final total = double.tryParse(v['total']?.toString() ?? '0.0') ?? 0.0;
        final mp = (v['metodo_pago'] ?? 'EFECTIVO').toString();
        final cajero = v['cajero'] ?? 'Cajero';

        Color badgeColor = Colors.grey;
        if (mp.toUpperCase() == 'EFECTIVO') badgeColor = const Color(0xFF10B981);
        if (['QR', 'QR DIGITAL'].contains(mp.toUpperCase())) badgeColor = Colors.blueAccent;
        if (['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].contains(mp.toUpperCase())) badgeColor = Colors.purpleAccent;
        if (['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].contains(mp.toUpperCase())) badgeColor = Colors.orangeAccent;

        return Card(
          margin: EdgeInsets.zero,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Ticket #${id.toString().padLeft(5, '0')}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                Text(
                  'Bs. ${total.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF10B981)),
                ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Text('$date • $cajero', style: const TextStyle(fontSize: 10.5, color: AppTheme.textMuted)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    mp,
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: badgeColor),
                  ),
                ),
              ],
            ),
            trailing: IconButton(
              icon: const Icon(Icons.print, size: 16, color: AppTheme.accentColor),
              onPressed: () => _verYReimprimirTicket(id),
            ),
          ),
        );
      },
    );
  }

  Widget _buildAuditoriaWidget() {
    if (_loadingVentas) {
      return const SizedBox(
        height: 150,
        child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
      );
    }

    final grouped = _groupSalesForAuditoria();
    if (grouped.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: const [
              FaIcon(FontAwesomeIcons.userCheck, size: 28, color: AppTheme.textMuted),
              SizedBox(height: 12),
              Text(
                'No hay registros de ventas para auditar.',
                textAlign: TextAlign.center,
                style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: grouped.length,
      itemBuilder: (context, idx) {
        final monthName = grouped.keys.elementAt(idx);
        final cashiersMap = grouped[monthName]!;
        
        double monthTotal = 0.0;
        cashiersMap.forEach((_, sales) {
          for (final s in sales) {
            monthTotal += double.tryParse(s['total']?.toString() ?? '0.0') ?? 0.0;
          }
        });

        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white10),
            borderRadius: BorderRadius.circular(12),
            color: Colors.white.withOpacity(0.01),
          ),
          child: ExpansionTile(
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(monthName.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.textLight)),
                Text('Bs. ${monthTotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.accentColor)),
              ],
            ),
            childrenPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            backgroundColor: Colors.transparent,
            collapsedBackgroundColor: Colors.transparent,
            iconColor: AppTheme.accentColor,
            children: cashiersMap.entries.map<Widget>((entry) {
              final cashierName = entry.key;
              final sales = entry.value;

              double cashierTotal = 0.0;
              for (final s in sales) {
                cashierTotal += double.tryParse(s['total']?.toString() ?? '0.0') ?? 0.0;
              }

              return Card(
                color: AppTheme.secondaryDark,
                margin: const EdgeInsets.symmetric(vertical: 6),
                child: ExpansionTile(
                  title: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(cashierName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textLight)),
                      Text('Bs. ${cashierTotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.tealAccent)),
                    ],
                  ),
                  iconColor: Colors.tealAccent,
                  childrenPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  children: sales.map<Widget>((v) {
                    final id = v['venta_id'];
                    final time = (v['fecha_venta'] ?? '').toString().split(' ')[1];
                    final total = double.tryParse(v['total']?.toString() ?? '0.0') ?? 0.0;
                    final esHistorica = v['es_historica'] == true;

                    return Container(
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
                      decoration: const BoxDecoration(
                        border: Border(bottom: BorderSide(color: Colors.white10)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Ticket #${id.toString().padLeft(5, '0')}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                                Text('Hora: $time', style: const TextStyle(fontSize: 9.5, color: AppTheme.textMuted)),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    InkWell(
                                      onTap: () => _toggleVentaHistorica(id, !esHistorica),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: esHistorica ? AppTheme.accentColor : Colors.white10,
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          esHistorica ? 'Histórica' : 'Normal',
                                          style: const TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Colors.white),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          
                          Expanded(
                            flex: 4,
                            child: DropdownButton<String>(
                              isExpanded: true,
                              value: getNormalMetodo(v['metodo_pago']?.toString()),
                              dropdownColor: AppTheme.secondaryDark,
                              style: const TextStyle(fontSize: 10, color: AppTheme.textLight, fontWeight: FontWeight.bold),
                              underline: const SizedBox(),
                              items: const [
                                DropdownMenuItem(value: 'EFECTIVO', child: Text('EFECTIVO')),
                                DropdownMenuItem(value: 'QR', child: Text('QR DIGITAL')),
                                DropdownMenuItem(value: 'TARJETA', child: Text('TARJETA')),
                                DropdownMenuItem(value: 'CONSUME LO NUESTRO', child: Text('CONS. NUESTRO')),
                                DropdownMenuItem(value: 'BILLETERA MOVIL', child: Text('BILL. MÓVIL')),
                              ],
                              onChanged: (newVal) {
                                if (newVal != null) {
                                  _actualizarMetodoPago(id, newVal);
                                }
                              },
                            ),
                          ),
                          
                          Expanded(
                            flex: 3,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Text('Bs. ${total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                const SizedBox(width: 4),
                                IconButton(
                                  icon: const Icon(Icons.print, size: 14, color: AppTheme.accentColor),
                                  constraints: const BoxConstraints(),
                                  padding: EdgeInsets.zero,
                                  onPressed: () => _verYReimprimirTicket(id),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }

  void _showRegistrarVentaHistoricaDialog() {
    _totalVentaHistoricaController.clear();
    _metodoVentaHistorica = 'EFECTIVO';
    _fechaVentaHistorica = DateTime.now();
    _selectedCajeroHistoricoId = _usuarios.isNotEmpty ? _usuarios.first['id'] : null;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            backgroundColor: AppTheme.secondaryDark,
            title: const Text('Registrar Venta Histórica', style: TextStyle(fontWeight: FontWeight.bold)),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<int>(
                    value: _selectedCajeroHistoricoId,
                    decoration: const InputDecoration(labelText: 'Cajero / Registrador'),
                    dropdownColor: AppTheme.secondaryDark,
                    items: _usuarios.map<DropdownMenuItem<int>>((u) {
                      return DropdownMenuItem<int>(
                        value: u['id'],
                        child: Text(u['nombre'] ?? ''),
                      );
                    }).toList(),
                    onChanged: (val) {
                      setDialogState(() {
                        _selectedCajeroHistoricoId = val;
                      });
                    },
                  ),
                  const SizedBox(height: 12),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Fecha y Hora:', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                          const SizedBox(height: 4),
                          Text(
                            _fechaVentaHistorica.toLocal().toString().substring(0, 16),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.calendar_month, color: AppTheme.accentColor),
                        onPressed: () async {
                          final dt = await showDatePicker(
                            context: context,
                            initialDate: _fechaVentaHistorica,
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (dt != null) {
                            if (!context.mounted) return;
                            final tm = await showTimePicker(
                              context: context,
                              initialTime: TimeOfDay.fromDateTime(_fechaVentaHistorica),
                            );
                            if (tm != null) {
                              setDialogState(() {
                                _fechaVentaHistorica = DateTime(dt.year, dt.month, dt.day, tm.hour, tm.minute);
                              });
                            }
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  DropdownButtonFormField<String>(
                    value: _metodoVentaHistorica,
                    decoration: const InputDecoration(labelText: 'Método de Pago'),
                    dropdownColor: AppTheme.secondaryDark,
                    items: const [
                      DropdownMenuItem(value: 'EFECTIVO', child: Text('Efectivo')),
                      DropdownMenuItem(value: 'QR', child: Text('QR / Digital')),
                      DropdownMenuItem(value: 'TARJETA', child: Text('Tarjeta')),
                      DropdownMenuItem(value: 'CONSUME LO NUESTRO', child: Text('Consume lo Nuestro')),
                    ],
                    onChanged: (val) {
                      if (val != null) {
                        setDialogState(() {
                          _metodoVentaHistorica = val;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 12),

                  TextField(
                    controller: _totalVentaHistoricaController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Monto Total (Bs.)',
                      hintText: '0.00',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentColor, foregroundColor: Colors.white),
                onPressed: _registrarVentaHistorica,
                child: const Text('Registrar'),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: PulsingCoffeeLoader(message: 'Cargando estado de caja...')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Control de Caja'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadCajaStatus,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadCajaStatus,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildTabButton(0, 'Turno Activo', FontAwesomeIcons.cashRegister),
                    const SizedBox(width: 8),
                    _buildTabButton(1, 'Ventas Realizadas', FontAwesomeIcons.receipt),
                    if (_rolActual.toUpperCase() != 'CAJERO') ...[
                      const SizedBox(width: 8),
                      _buildTabButton(2, 'Auditoría', FontAwesomeIcons.userCheck),
                      const SizedBox(width: 8),
                      _buildTabButton(3, 'Historial Turnos', FontAwesomeIcons.clockRotateLeft),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16.0),
                children: [
                  if (_selectedTab == 0) ...[
                    FadeInSlide(index: 0, child: _buildStateCard()),
                  ] else if (_selectedTab == 1) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: const [
                            FaIcon(FontAwesomeIcons.receipt, size: 14, color: AppTheme.accentColor),
                            SizedBox(width: 8),
                            Text('VENTAS / COMPROBANTES', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 1.0, color: AppTheme.textMuted)),
                          ],
                        ),
                        if (_rolActual.toUpperCase() != 'CAJERO')
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.accentColor,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: _showRegistrarVentaHistoricaDialog,
                            icon: const Icon(Icons.add, size: 14),
                            label: const Text('VENTA HISTÓRICA', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    
                    if (_rolActual.toUpperCase() != 'CAJERO') ...[
                      _buildVentasFiltrosWidget(),
                      const SizedBox(height: 12),
                      _buildVentasResumenKPIs(),
                      const SizedBox(height: 12),
                    ],
                    
                    _buildVentasRealizadasList(),
                  ] else if (_selectedTab == 2 && _rolActual.toUpperCase() != 'CAJERO') ...[
                    Row(
                      children: const [
                        FaIcon(FontAwesomeIcons.userCheck, size: 14, color: AppTheme.accentColor),
                        SizedBox(width: 8),
                        Text('AUDITORÍA DE CAJEROS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 1.0, color: AppTheme.textMuted)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _buildAuditoriaWidget(),
                  ] else if (_selectedTab == 3 && _rolActual.toUpperCase() != 'CAJERO') ...[
                    Row(
                      children: const [
                        FaIcon(FontAwesomeIcons.clockRotateLeft, size: 14, color: AppTheme.accentColor),
                        SizedBox(width: 8),
                        Text('HISTORIAL DE TURNOS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 1.0, color: AppTheme.textMuted)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _buildHistoryList(),
                  ]
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
