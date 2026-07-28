import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

class HorasPicoCard extends StatefulWidget {
  const HorasPicoCard({super.key});

  @override
  State<HorasPicoCard> createState() => _HorasPicoCardState();
}

class _HorasPicoCardState extends State<HorasPicoCard> {
  bool _cargando = true;
  bool _porDinero = true; // true=Bs., false=Clientes
  DateTime? _fechaFiltro;
  List<dynamic> _horas = [];
  List<dynamic> _productosHora = [];
  int? _horaSeleccionada;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final fechaQuery = _fechaFiltro != null
          ? '?fecha=${_fechaFiltro!.year}-${_fechaFiltro!.month.toString().padLeft(2, '0')}-${_fechaFiltro!.day.toString().padLeft(2, '0')}'
          : '';
      final res = await ApiConfig.get('/kpis/stats-avanzadas$fechaQuery');
      if (res.statusCode == 200 && mounted) {
        final data = jsonDecode(res.body);
        setState(() {
          _horas = data['horas'] ?? [];
          _productosHora = data['productosHora'] ?? [];
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar horas pico: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  // El backend devuelve "hora" como texto (efecto del EXTRACT() de Postgres
  // pasando por el driver pg), no como número — nunca asumir el tipo.
  int _horaDe(dynamic item) => int.tryParse(item['hora'].toString()) ?? -1;

  double _valorHora(int hora) {
    final match = _horas.firstWhere((h) => _horaDe(h) == hora, orElse: () => null);
    if (match == null) return 0;
    return double.tryParse((_porDinero ? match['ingresos'] : match['ventas_cont']).toString()) ?? 0;
  }

  Future<void> _elegirFecha() async {
    final f = await showDatePicker(
      context: context,
      initialDate: _fechaFiltro ?? DateTime.now(),
      firstDate: DateTime(2024),
      lastDate: DateTime.now(),
    );
    if (f != null) {
      setState(() => _fechaFiltro = f);
      _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final productosDeLaHora = _horaSeleccionada == null
        ? <dynamic>[]
        : _productosHora.where((p) => _horaDe(p) == _horaSeleccionada).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Horas Pico', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      _chipToggle('Bs.', _porDinero, () {
                        setState(() => _porDinero = true);
                      }),
                      const SizedBox(width: 6),
                      _chipToggle('Clientes', !_porDinero, () {
                        setState(() => _porDinero = false);
                      }),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: _elegirFecha,
                  icon: const Icon(Icons.calendar_today, size: 14, color: AppTheme.textMuted),
                  label: Text(
                    _fechaFiltro == null ? 'Histórico' : '${_fechaFiltro!.day}/${_fechaFiltro!.month}',
                    style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                  ),
                ),
                if (_fechaFiltro != null)
                  IconButton(
                    icon: const Icon(Icons.close, size: 16, color: AppTheme.textMuted),
                    onPressed: () {
                      setState(() => _fechaFiltro = null);
                      _cargar();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            _cargando
                ? const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
                : SizedBox(
                    height: 160,
                    child: LineChart(
                      LineChartData(
                        gridData: const FlGridData(show: false),
                        borderData: FlBorderData(show: false),
                        titlesData: FlTitlesData(
                          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              interval: 3,
                              getTitlesWidget: (value, meta) => Text(
                                '${value.toInt()}h',
                                style: GoogleFonts.outfit(fontSize: 9, color: AppTheme.textMuted),
                              ),
                            ),
                          ),
                        ),
                        lineTouchData: LineTouchData(
                          touchTooltipData: LineTouchTooltipData(
                            getTooltipItems: (spots) => spots
                                .map((s) => LineTooltipItem(
                                    _porDinero ? 'Bs. ${s.y.toStringAsFixed(0)}' : '${s.y.toInt()} ventas',
                                    GoogleFonts.outfit(color: Colors.white, fontSize: 10)))
                                .toList(),
                          ),
                          touchCallback: (event, response) {
                            if (event.isInterestedForInteractions &&
                                response?.lineBarSpots != null &&
                                response!.lineBarSpots!.isNotEmpty) {
                              final hora = response.lineBarSpots!.first.x.toInt();
                              if (hora != _horaSeleccionada) setState(() => _horaSeleccionada = hora);
                            }
                          },
                        ),
                        lineBarsData: [
                          LineChartBarData(
                            spots: List.generate(24, (h) => FlSpot(h.toDouble(), _valorHora(h))),
                            isCurved: true,
                            color: _porDinero ? AppTheme.accentColor : AppTheme.adminColor,
                            barWidth: 2,
                            dotData: const FlDotData(show: false),
                            belowBarData: BarAreaData(
                              show: true,
                              color: (_porDinero ? AppTheme.accentColor : AppTheme.adminColor).withOpacity(0.15),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
            if (_horaSeleccionada != null) ...[
              const Divider(height: 24, color: AppTheme.borderDark),
              Text(
                'Más vendido a las ${_horaSeleccionada.toString().padLeft(2, '0')}:00',
                style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textMuted),
              ),
              const SizedBox(height: 8),
              if (productosDeLaHora.isEmpty)
                Text('Sin ventas registradas en esa hora.', style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted))
              else
                ...productosDeLaHora.take(5).map((p) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                              child: Text((p['producto'] ?? '').toString(),
                                  style: GoogleFonts.outfit(fontSize: 12, color: Colors.white), overflow: TextOverflow.ellipsis)),
                          Text('${p['total_qty']} u.', style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted)),
                        ],
                      ),
                    )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _chipToggle(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppTheme.accentColor : AppTheme.primaryDark,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(label, style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, color: selected ? Colors.white : AppTheme.textMuted)),
      ),
    );
  }
}
