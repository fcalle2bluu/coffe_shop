import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../widgets/dashboard/semaforo_contable_card.dart';
import '../widgets/dashboard/actividad_semanal_card.dart';
import '../widgets/dashboard/rendimiento_mensual_card.dart';
import '../widgets/dashboard/horas_pico_card.dart';
import '../widgets/dashboard/bcg_matrix_card.dart';
import '../widgets/dashboard/ventas_categoria_card.dart';
import '../widgets/dashboard/metodos_pago_card.dart';
import '../widgets/dashboard/gastos_categoria_card.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _isLoading = true;
  String _filtro = 'mes';
  bool _metricaDinero = false;

  String _ventasDia = '0.00';
  String _ventasMes = '0.00';
  String _gastosMes = '0.00';
  int _totalProductos = 0;
  int _totalProveedores = 0;

  List<dynamic> _topProductos = [];
  
  // Nuevas variables para rol y mesas
  String _userRol = 'CAJERO';
  bool _isAdmin = false;
  List<dynamic> _mesas = [];

  @override
  void initState() {
    super.initState();
    _cargarDatos();
  }

  Future<void> _cargarDatos() async {
    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      _userRol = prefs.getString('usuario_rol') ?? 'CAJERO';
      _isAdmin = _userRol.toUpperCase() == 'ADMIN' || _userRol.toUpperCase() == 'ADMINISTRADOR';
      
      if (_isAdmin) {
        final kpisRes = await ApiConfig.get('/kpis');
        if (kpisRes.statusCode == 200) {
          final data = jsonDecode(kpisRes.body);
          _ventasDia = data['ventasDia']?.toString() ?? '0.00';
          _ventasMes = data['ventasMes']?.toString() ?? '0.00';
          _gastosMes = data['gastosMes']?.toString() ?? '0.00';
          _totalProductos = int.tryParse(data['productos']?.toString() ?? '0') ?? 0;
          _totalProveedores = int.tryParse(data['proveedores']?.toString() ?? '0') ?? 0;
        }
        await _cargarTopProductos();
      }
      await _cargarEstadoMesas();
    } catch (e) {
      print('Error al cargar datos del dashboard: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cargarEstadoMesas() async {
    try {
      final res = await ApiConfig.get('/comandas/mesas-estado');
      if (res.statusCode == 200) {
        setState(() {
          _mesas = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar estado de mesas: $e');
    }
  }

  Future<void> _cargarTopProductos() async {
    try {
      final metrica = _metricaDinero ? 'dinero' : 'cantidad';
      final topRes = await ApiConfig.get('/kpis/top-productos?filtro=$_filtro&metrica=$metrica');
      if (topRes.statusCode == 200) {
        setState(() {
          _topProductos = jsonDecode(topRes.body);
        });
      }
    } catch (e) {
      print('Error al cargar productos más vendidos: $e');
    }
  }

  void _cambiarFiltro(String nuevoFiltro) async {
    setState(() {
      _filtro = nuevoFiltro;
      _isLoading = true;
    });
    await _cargarTopProductos();
    setState(() => _isLoading = false);
  }

  void _cambiarMetrica(bool esDinero) async {
    setState(() {
      _metricaDinero = esDinero;
      _isLoading = true;
    });
    await _cargarTopProductos();
    setState(() => _isLoading = false);
  }

  double _valorProducto(dynamic p) => double.tryParse((_metricaDinero ? p['total_dinero'] : p['total_cantidad']).toString()) ?? 0;

  final List<Color> _chartColors = [
    const Color(0xFFF97316),
    const Color(0xFFFB923C),
    const Color(0xFFEA580C),
    const Color(0xFF6366F1),
    const Color(0xFF3B82F6),
    const Color(0xFF10B981),
    const Color(0xFF8B5CF6),
    const Color(0xFFEC4899),
    const Color(0xFF14B8A6),
    const Color(0xFF94A3B8),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.chartLine, size: 18, color: AppTheme.accentColor),
            const SizedBox(width: 8),
            Text(
              'Panel de Control',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _cargarDatos,
        color: AppTheme.accentColor,
        child: _isLoading
            ? const Center(child: PulsingCoffeeLoader(message: 'Cargando estadísticas...'))
            : SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // --- SECCIÓN DE MESAS (Todos los roles) ---
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Estado de Mesas',
                          style: GoogleFonts.outfit(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.secondaryDark,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white.withOpacity(0.05)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: Colors.greenAccent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text('Libre', style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted)),
                              const SizedBox(width: 8),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: Colors.redAccent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text('Con Pedido', style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    
                    _mesas.isEmpty
                        ? Container(
                            height: 100,
                            alignment: Alignment.center,
                            child: Text(
                              'Cargando estado de mesas...',
                              style: GoogleFonts.outfit(color: AppTheme.textMuted),
                            ),
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (_mesas.where((m) => m['piso'] == 'PLANTA_BAJA').isNotEmpty) ...[
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.layers_outlined, size: 14, color: AppTheme.accentColor),
                                      const SizedBox(width: 6),
                                      Text(
                                        'PLANTA BAJA (${_mesas.where((m) => m['piso'] == 'PLANTA_BAJA').length})',
                                        style: GoogleFonts.outfit(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w900,
                                          color: AppTheme.textMuted,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                _buildMesasGrid(_mesas.where((m) => m['piso'] == 'PLANTA_BAJA').toList()),
                                const SizedBox(height: 16),
                              ],
                              if (_mesas.where((m) => m['piso'] == 'PLANTA_ALTA').isNotEmpty) ...[
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.layers_outlined, size: 14, color: AppTheme.accentColor),
                                      const SizedBox(width: 6),
                                      Text(
                                        'PRIMER PISO (${_mesas.where((m) => m['piso'] == 'PLANTA_ALTA').length})',
                                        style: GoogleFonts.outfit(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w900,
                                          color: AppTheme.textMuted,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                _buildMesasGrid(_mesas.where((m) => m['piso'] == 'PLANTA_ALTA').toList()),
                              ],
                            ],
                          ),
                    
                    // --- SECCIÓN ADMINISTRATIVA (Solo Admins) ---
                    if (_isAdmin) ...[
                      const SizedBox(height: 28),
                      Text(
                        'Resumen Financiero',
                        style: GoogleFonts.outfit(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1.5,
                                  child: _buildKpiCard('Ventas Hoy', 'Bs. $_ventasDia', FontAwesomeIcons.cashRegister, const Color(0xFFF97316)),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1.5,
                                  child: _buildKpiCard('Ventas Mes', 'Bs. $_ventasMes', FontAwesomeIcons.calendarCheck, const Color(0xFF10B981)),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            height: 85,
                            width: double.infinity,
                            child: _buildKpiCard('Gastos Mes', 'Bs. $_gastosMes', FontAwesomeIcons.fileInvoiceDollar, const Color(0xFFEF4444)),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1.5,
                                  child: _buildKpiCard('Productos', '$_totalProductos', FontAwesomeIcons.boxesStacked, const Color(0xFF3B82F6)),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1.5,
                                  child: _buildKpiCard('Proveedores', '$_totalProveedores', FontAwesomeIcons.truck, const Color(0xFF8B5CF6)),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      const SemaforoContableCard(),
                      const SizedBox(height: 20),
                      const ActividadSemanalCard(),
                      const SizedBox(height: 20),
                      const RendimientoMensualCard(),
                      const SizedBox(height: 20),
                      const HorasPicoCard(),
                      const SizedBox(height: 20),
                      const BcgMatrixCard(),
                      const SizedBox(height: 20),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Productos Más Vendidos',
                                    style: GoogleFonts.outfit(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const FaIcon(FontAwesomeIcons.fire, size: 16, color: AppTheme.accentColor),
                                ],
                              ),
                              const SizedBox(height: 12),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    _buildFilterChip('hora', 'Última Hora'),
                                    _buildFilterChip('hoy', 'Hoy'),
                                    _buildFilterChip('semana', 'Semana'),
                                    _buildFilterChip('mes', 'Últimos 30 días'),
                                    _buildFilterChip('anio', 'Este Año'),
                                    _buildFilterChip('todos', 'Histórico'),
                                    const SizedBox(width: 12),
                                    _buildMetricaChip(false, 'Cantidad'),
                                    _buildMetricaChip(true, 'Dinero'),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),
                              if (_topProductos.isEmpty)
                                Container(
                                  height: 200,
                                  alignment: Alignment.center,
                                  child: Text(
                                    'No hay registros de ventas para este período.',
                                    style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 13),
                                  ),
                                )
                              else ...[
                                SizedBox(
                                  height: 180,
                                  child: PieChart(
                                    PieChartData(
                                      sectionsSpace: 3,
                                      centerSpaceRadius: 35,
                                      sections: _buildChartSections(),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                Column(
                                  children: List.generate(_topProductos.length, (index) {
                                    final p = _topProductos[index];
                                    final color = _chartColors[index % _chartColors.length];
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 4.0),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 10,
                                            height: 10,
                                            decoration: BoxDecoration(
                                              color: color,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              p['nombre'] as String,
                                              style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textLight),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Text(
                                            _metricaDinero
                                                ? 'Bs. ${_valorProducto(p).toStringAsFixed(2)}'
                                                : '${_valorProducto(p).toStringAsFixed(0)} u.',
                                            style: GoogleFonts.outfit(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                              color: AppTheme.textMuted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const VentasCategoriaCard(),
                      const SizedBox(height: 20),
                      const MetodosPagoCard(),
                      const SizedBox(height: 20),
                      const GastosCategoriaCard(),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _filtro == value;
    return Padding(
      padding: const EdgeInsets.only(right: 6.0),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        selectedColor: AppTheme.accentColor,
        backgroundColor: AppTheme.primaryDark,
        labelStyle: GoogleFonts.outfit(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: isSelected ? Colors.white : AppTheme.textMuted,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isSelected ? AppTheme.accentColor : Colors.white.withOpacity(0.05),
          ),
        ),
        onSelected: (selected) {
          if (selected) {
            _cambiarFiltro(value);
          }
        },
      ),
    );
  }

  Widget _buildMetricaChip(bool esDinero, String label) {
    final isSelected = _metricaDinero == esDinero;
    return Padding(
      padding: const EdgeInsets.only(right: 6.0),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        selectedColor: AppTheme.adminColor,
        backgroundColor: AppTheme.primaryDark,
        labelStyle: GoogleFonts.outfit(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: isSelected ? Colors.white : AppTheme.textMuted,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isSelected ? AppTheme.adminColor : Colors.white.withOpacity(0.05),
          ),
        ),
        onSelected: (selected) {
          if (selected) {
            _cambiarMetrica(esDinero);
          }
        },
      ),
    );
  }

  List<PieChartSectionData> _buildChartSections() {
    return List.generate(_topProductos.length, (index) {
      final p = _topProductos[index];
      final val = _valorProducto(p);
      final color = _chartColors[index % _chartColors.length];

      return PieChartSectionData(
        color: color,
        value: val,
        title: val.toStringAsFixed(0),
        radius: 40,
        titleStyle: GoogleFonts.outfit(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      );
    });
  }

  Widget _buildKpiCard(String label, String value, dynamic icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.bold),
              ),
              FaIcon(icon, size: 14, color: color),
            ],
          ),
          Text(
            value,
            style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildMesasGrid(List<dynamic> list) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.5,
      ),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final mesaInfo = list[index];
        final numMesa = mesaInfo['mesa'];
        final estado = mesaInfo['estado']; // 'libre' o 'ocupada'
        final comanda = mesaInfo['comanda'];
        final isLibre = estado == 'libre';
        
        return Card(
          color: AppTheme.secondaryDark,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
              color: isLibre 
                  ? Colors.greenAccent.withOpacity(0.15) 
                  : Colors.redAccent.withOpacity(0.15),
              width: 1.5,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Mesa $numMesa',
                      style: GoogleFonts.outfit(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    FaIcon(
                      isLibre ? FontAwesomeIcons.chair : FontAwesomeIcons.utensils,
                      size: 16,
                      color: isLibre ? Colors.greenAccent : Colors.redAccent,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                if (isLibre)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.greenAccent.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'LIBRE',
                      style: GoogleFonts.outfit(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Colors.greenAccent,
                      ),
                    ),
                  )
                else ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          comanda != null ? '${comanda['estado']}' : 'OCUPADA',
                          style: GoogleFonts.outfit(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: Colors.redAccent,
                          ),
                        ),
                      ),
                      Text(
                        comanda != null ? 'Bs. ${double.parse(comanda['total'].toString()).toStringAsFixed(2)}' : '',
                        style: GoogleFonts.outfit(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  if (comanda != null && comanda['mesero_nombre'] != null)
                    Text(
                      'Atiende: ${comanda['mesero_nombre']}',
                      style: GoogleFonts.outfit(
                        fontSize: 9,
                        color: AppTheme.textMuted,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
