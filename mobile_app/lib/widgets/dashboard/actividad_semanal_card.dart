import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

const _diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Las categorías reales del catálogo son muchas y variables (no solo las 5
// "grandes" que asume la web), así que se colorea por posición en vez de
// por nombre fijo, igual que en VentasCategoriaCard.
const _paletaCategorias = [
  Color(0xFFF59E0B),
  Color(0xFFEC4899),
  Color(0xFF3B82F6),
  Color(0xFF10B981),
  Color(0xFFF97316),
  Color(0xFF6366F1),
  Color(0xFF06B6D4),
  Color(0xFF8B5CF6),
  Color(0xFFF43F5E),
  Color(0xFF14B8A6),
  Color(0xFFA855F7),
  Color(0xFF94A3B8),
];

class ActividadSemanalCard extends StatefulWidget {
  const ActividadSemanalCard({super.key});

  @override
  State<ActividadSemanalCard> createState() => _ActividadSemanalCardState();
}

class _ActividadSemanalCardState extends State<ActividadSemanalCard> {
  bool _cargando = true;
  DateTime _domingoSemana = _domingoDe(DateTime.now());
  List<dynamic> _dias = [];
  int _diaSeleccionado = DateTime.now().weekday % 7; // 0=domingo
  List<dynamic> _detalleCategorias = [];
  bool _cargandoDetalle = false;

  static DateTime _domingoDe(DateTime fecha) {
    final diff = fecha.weekday % 7; // weekday: lun=1..dom=7 -> dom=0
    return DateTime(fecha.year, fecha.month, fecha.day).subtract(Duration(days: diff));
  }

  @override
  void initState() {
    super.initState();
    _cargarSemana();
  }

  String _fmtFecha(DateTime f) => '${f.year}-${f.month.toString().padLeft(2, '0')}-${f.day.toString().padLeft(2, '0')}';

  Future<void> _cargarSemana() async {
    setState(() => _cargando = true);
    try {
      final res = await ApiConfig.get('/kpis/ventas-semanal?fecha_inicio=${_fmtFecha(_domingoSemana)}');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _dias = jsonDecode(res.body);
          _cargando = false;
        });
        _cargarDetalleDia(_diaSeleccionado);
      }
    } catch (e) {
      print('Error al cargar actividad semanal: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _cargarDetalleDia(int indiceDia) async {
    if (indiceDia >= _dias.length) return;
    setState(() => _cargandoDetalle = true);
    try {
      final fecha = _dias[indiceDia]['fecha'].toString().split('T').first;
      final res = await ApiConfig.get('/kpis/ventas-dia-detalle?fecha=$fecha');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _detalleCategorias = jsonDecode(res.body);
          _cargandoDetalle = false;
        });
      }
    } catch (e) {
      print('Error al cargar detalle del día: $e');
      if (mounted) setState(() => _cargandoDetalle = false);
    }
  }

  void _cambiarSemana(int delta) {
    setState(() {
      _domingoSemana = _domingoSemana.add(Duration(days: 7 * delta));
      _diaSeleccionado = 0;
    });
    _cargarSemana();
  }

  @override
  Widget build(BuildContext context) {
    final ultimoDomingo = _domingoSemana.add(const Duration(days: 6));
    final esSemanaActual = _fmtFecha(_domingoDe(DateTime.now())) == _fmtFecha(_domingoSemana);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Actividad Semanal', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left, color: AppTheme.textMuted),
                      onPressed: () => _cambiarSemana(-1),
                      visualDensity: VisualDensity.compact,
                    ),
                    Text(
                      '${_domingoSemana.day}/${_domingoSemana.month} - ${ultimoDomingo.day}/${ultimoDomingo.month}',
                      style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                    ),
                    IconButton(
                      icon: Icon(Icons.chevron_right, color: esSemanaActual ? AppTheme.textMuted.withOpacity(0.3) : AppTheme.textMuted),
                      onPressed: esSemanaActual ? null : () => _cambiarSemana(1),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_cargando)
              const SizedBox(height: 180, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
            else
              SizedBox(
                height: 180,
                child: BarChart(
                  BarChartData(
                    alignment: BarChartAlignment.spaceAround,
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            final i = value.toInt();
                            if (i < 0 || i >= _diasSemana.length) return const SizedBox.shrink();
                            return Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(_diasSemana[i], style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted)),
                            );
                          },
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
                          'Bs. ${rod.toY.toStringAsFixed(2)}',
                          GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                      touchCallback: (event, response) {
                        if (event.isInterestedForInteractions && response?.spot != null) {
                          final idx = response!.spot!.touchedBarGroupIndex;
                          if (idx != _diaSeleccionado) {
                            setState(() => _diaSeleccionado = idx);
                            _cargarDetalleDia(idx);
                          }
                        }
                      },
                    ),
                    barGroups: List.generate(_dias.length, (i) {
                      final total = double.tryParse(_dias[i]['total'].toString()) ?? 0;
                      final seleccionado = i == _diaSeleccionado;
                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: total,
                            width: 22,
                            borderRadius: BorderRadius.circular(6),
                            color: seleccionado ? AppTheme.accentColor : AppTheme.accentColor.withOpacity(0.25),
                          ),
                        ],
                      );
                    }),
                  ),
                ),
              ),
            const Divider(height: 28, color: AppTheme.borderDark),
            Text(
              'Ventas por Categoría · ${_diaSeleccionado < _dias.length ? _diasSemana[_diaSeleccionado] : ''}',
              style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textMuted),
            ),
            const SizedBox(height: 10),
            if (_cargandoDetalle)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor, strokeWidth: 2)),
              )
            else if (_detalleCategorias.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('Sin ventas este día.', style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted)),
              )
            else
              _buildBarrasCategorias(),
          ],
        ),
      ),
    );
  }

  Widget _buildBarrasCategorias() {
    final maxTotal = _detalleCategorias
        .map((c) => double.tryParse(c['total'].toString()) ?? 0)
        .fold<double>(0, (a, b) => a > b ? a : b);

    return Column(
      children: List.generate(_detalleCategorias.length, (i) {
        final c = _detalleCategorias[i];
        final total = double.tryParse(c['total'].toString()) ?? 0;
        final nombre = (c['categoria'] ?? '').toString();
        final color = _paletaCategorias[i % _paletaCategorias.length];
        final pct = maxTotal > 0 ? total / maxTotal : 0.0;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(nombre, style: GoogleFonts.outfit(fontSize: 12, color: Colors.white)),
                  Text('Bs. ${total.toStringAsFixed(2)}', style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  backgroundColor: AppTheme.primaryDark,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
