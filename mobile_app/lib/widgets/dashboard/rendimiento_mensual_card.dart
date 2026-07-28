import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

const _nombresMes = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

class RendimientoMensualCard extends StatefulWidget {
  const RendimientoMensualCard({super.key});

  @override
  State<RendimientoMensualCard> createState() => _RendimientoMensualCardState();
}

class _RendimientoMensualCardState extends State<RendimientoMensualCard> {
  bool _cargando = true;
  List<dynamic> _mesesDisponibles = [];
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;
  List<dynamic> _dias = [];

  @override
  void initState() {
    super.initState();
    _cargarMesesDisponibles();
  }

  Future<void> _cargarMesesDisponibles() async {
    try {
      final res = await ApiConfig.get('/kpis/meses-disponibles');
      if (res.statusCode == 200 && mounted) {
        setState(() => _mesesDisponibles = jsonDecode(res.body));
      }
    } catch (e) {
      print('Error al cargar meses disponibles: $e');
    }
    await _cargarRendimiento();
  }

  Future<void> _cargarRendimiento() async {
    setState(() => _cargando = true);
    try {
      final res = await ApiConfig.get('/kpis/rendimiento-mensual?mes=$_mes&anio=$_anio');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _dias = jsonDecode(res.body);
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar rendimiento mensual: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    double totalVentas = 0, totalCaja = 0, totalLibro = 0;
    for (final d in _dias) {
      totalVentas += double.tryParse(d['ventas'].toString()) ?? 0;
      totalCaja += double.tryParse(d['caja_chica'].toString()) ?? 0;
      totalLibro += double.tryParse(d['libro_diario'].toString()) ?? 0;
    }
    final utilidad = totalVentas - totalCaja - totalLibro;
    final margen = totalVentas > 0 ? (utilidad / totalVentas * 100) : 0.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Rendimiento Mensual', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                _buildSelectorMes(),
              ],
            ),
            const SizedBox(height: 16),
            _cargando
                ? const SizedBox(height: 100, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
                : Column(
                    children: [
                      Row(
                        children: [
                          Expanded(child: _kpiMini('Ventas', totalVentas, const Color(0xFF10B981))),
                          const SizedBox(width: 8),
                          Expanded(child: _kpiMini('Caja Chica', totalCaja, const Color(0xFFF97316))),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(child: _kpiMini('Libro Diario', totalLibro, const Color(0xFFEF4444))),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _kpiMini(
                              'Utilidad (${margen.toStringAsFixed(0)}%)',
                              utilidad,
                              utilidad >= 0 ? const Color(0xFF3B82F6) : const Color(0xFFEF4444),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 200,
                        child: _dias.isEmpty
                            ? Center(
                                child: Text('Sin datos para este mes.', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 12)),
                              )
                            : _buildLineChart(),
                      ),
                      const SizedBox(height: 8),
                      _buildLeyenda(),
                    ],
                  ),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectorMes() {
    return GestureDetector(
      onTap: _abrirSelectorMes,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.primaryDark,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${_nombresMes[_mes]} $_anio', style: GoogleFonts.outfit(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(width: 4),
            const Icon(Icons.arrow_drop_down, size: 16, color: AppTheme.textMuted),
          ],
        ),
      ),
    );
  }

  void _abrirSelectorMes() {
    final opciones = _mesesDisponibles.isNotEmpty
        ? _mesesDisponibles
        : [
            {'anio': DateTime.now().year, 'mes': DateTime.now().month}
          ];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.secondaryDark,
      builder: (context) => ListView(
        shrinkWrap: true,
        children: opciones.map<Widget>((m) {
          final mes = int.parse(m['mes'].toString());
          final anio = int.parse(m['anio'].toString());
          return ListTile(
            title: Text('${_nombresMes[mes]} $anio', style: GoogleFonts.outfit(color: Colors.white)),
            onTap: () {
              Navigator.pop(context);
              setState(() {
                _mes = mes;
                _anio = anio;
              });
              _cargarRendimiento();
            },
          );
        }).toList(),
      ),
    );
  }

  Widget _kpiMini(String label, double valor, Color color) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppTheme.primaryDark, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(fontSize: 9, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text('Bs. ${valor.toStringAsFixed(2)}',
              style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: color), overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  Widget _buildLeyenda() {
    Widget item(Color c, String label) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            const SizedBox(width: 4),
            Text(label, style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted)),
          ],
        );
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      children: [
        item(const Color(0xFF10B981), 'Ingresos'),
        item(const Color(0xFFF97316), 'Caja Chica'),
        item(const Color(0xFFEF4444), 'Libro Diario'),
        item(const Color(0xFF3B82F6), 'Beneficio Neto'),
      ],
    );
  }

  Widget _buildLineChart() {
    List<FlSpot> serie(String key) => List.generate(_dias.length, (i) {
          final v = double.tryParse(_dias[i][key].toString()) ?? 0;
          return FlSpot((i + 1).toDouble(), v);
        });

    final ventas = serie('ventas');
    final caja = serie('caja_chica');
    final libro = serie('libro_diario');
    final beneficio = List.generate(_dias.length, (i) {
      final v = (double.tryParse(_dias[i]['ventas'].toString()) ?? 0) -
          (double.tryParse(_dias[i]['caja_chica'].toString()) ?? 0) -
          (double.tryParse(_dias[i]['libro_diario'].toString()) ?? 0);
      return FlSpot((i + 1).toDouble(), v);
    });

    LineChartBarData linea(List<FlSpot> spots, Color color, {bool dashed = false}) {
      return LineChartBarData(
        spots: spots,
        isCurved: true,
        curveSmoothness: 0.15,
        color: color,
        barWidth: 2,
        dotData: const FlDotData(show: false),
        dashArray: dashed ? [6, 4] : null,
      );
    }

    return LineChart(
      LineChartData(
        gridData: FlGridData(show: true, drawVerticalLine: false, horizontalInterval: null, getDrawingHorizontalLine: (v) {
          return FlLine(color: AppTheme.borderDark.withOpacity(0.3), strokeWidth: 1);
        }),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              interval: (_dias.length / 6).clamp(1, 31).roundToDouble(),
              getTitlesWidget: (value, meta) => Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(value.toInt().toString(), style: GoogleFonts.outfit(fontSize: 9, color: AppTheme.textMuted)),
              ),
            ),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (spots) => spots
                .map((s) => LineTooltipItem('Bs. ${s.y.toStringAsFixed(0)}', GoogleFonts.outfit(color: Colors.white, fontSize: 10)))
                .toList(),
          ),
        ),
        lineBarsData: [
          linea(ventas, const Color(0xFF10B981)),
          linea(caja, const Color(0xFFF97316)),
          linea(libro, const Color(0xFFEF4444)),
          linea(beneficio, const Color(0xFF3B82F6), dashed: true),
        ],
      ),
    );
  }
}
