import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/pulsing_coffee_loader.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _isLoading = true;
  String _filtro = 'mes';
  
  String _ventasDia = '0.00';
  String _ventasMes = '0.00';
  int _totalProductos = 0;
  int _totalProveedores = 0;

  List<dynamic> _topProductos = [];

  @override
  void initState() {
    super.initState();
    _cargarDatos();
  }

  Future<void> _cargarDatos() async {
    setState(() => _isLoading = true);
    try {
      final kpisRes = await ApiConfig.get('/kpis');
      if (kpisRes.statusCode == 200) {
        final data = jsonDecode(kpisRes.body);
        _ventasDia = data['ventasDia']?.toString() ?? '0.00';
        _ventasMes = data['comprasMes']?.toString() ?? '0.00';
        _totalProductos = int.tryParse(data['productos']?.toString() ?? '0') ?? 0;
        _totalProveedores = int.tryParse(data['proveedores']?.toString() ?? '0') ?? 0;
      }
      await _cargarTopProductos();
    } catch (e) {
      print('Error al cargar datos del dashboard: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cargarTopProductos() async {
    try {
      final topRes = await ApiConfig.get('/kpis/productos-mas-vendidos?filtro=$_filtro');
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
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 1.5,
                      children: [
                        _buildKpiCard('Ventas Hoy', 'Bs. $_ventasDia', FontAwesomeIcons.cashRegister, const Color(0xFFF97316)),
                        _buildKpiCard('Ventas Mes', 'Bs. $_ventasMes', FontAwesomeIcons.calendarCheck, const Color(0xFF10B981)),
                        _buildKpiCard('Productos', '$_totalProductos', FontAwesomeIcons.boxesStacked, const Color(0xFF3B82F6)),
                        _buildKpiCard('Proveedores', '$_totalProveedores', FontAwesomeIcons.truck, const Color(0xFF8B5CF6)),
                      ],
                    ),
                    const SizedBox(height: 24),
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
                                  _buildFilterChip('hoy', 'Hoy'),
                                  _buildFilterChip('semana', 'Semana'),
                                  _buildFilterChip('mes', 'Últimos 30 días'),
                                  _buildFilterChip('todos', 'Histórico'),
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
                                          '${double.parse(p['total_vendido'].toString()).toStringAsFixed(0)} u.',
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

  List<PieChartSectionData> _buildChartSections() {
    return List.generate(_topProductos.length, (index) {
      final p = _topProductos[index];
      final val = double.parse(p['total_vendido'].toString());
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
}
