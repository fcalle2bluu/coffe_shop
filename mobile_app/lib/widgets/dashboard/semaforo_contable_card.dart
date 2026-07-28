import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

class SemaforoContableCard extends StatefulWidget {
  const SemaforoContableCard({super.key});

  @override
  State<SemaforoContableCard> createState() => _SemaforoContableCardState();
}

class _SemaforoContableCardState extends State<SemaforoContableCard> {
  bool _cargando = true;
  Map<String, dynamic>? _datos;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final res = await ApiConfig.get('/kpis/gerencial');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _datos = jsonDecode(res.body);
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar KPI gerencial: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  Color _colorSemaforo(String? color) {
    switch (color) {
      case 'ROJO':
        return const Color(0xFFEF4444);
      case 'AMARILLO':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF10B981);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
        ),
      );
    }
    if (_datos == null) return const SizedBox.shrink();

    final color = _colorSemaforo(_datos!['semaforoColor']);
    final balance = double.tryParse(_datos!['balance'].toString()) ?? 0;
    final ingresos = double.tryParse(_datos!['ingresos'].toString()) ?? 0;
    final egresos = double.tryParse(_datos!['egresos'].toString()) ?? 0;
    final equilibrio = (_datos!['puntoEquilibrioPorcentaje'] as num?)?.toInt() ?? 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: color.withOpacity(0.5), blurRadius: 8)],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Semáforo Contable',
                  style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Bs. ${balance.toStringAsFixed(2)}',
              style: GoogleFonts.outfit(fontSize: 28, fontWeight: FontWeight.w900, color: color),
            ),
            Text('Balance del mes', style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _miniStat('Ingresos', ingresos, const Color(0xFF10B981), FontAwesomeIcons.arrowUp),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _miniStat('Egresos', egresos, const Color(0xFFEF4444), FontAwesomeIcons.arrowDown),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Punto de Equilibrio', style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
                Text('$equilibrio%', style: GoogleFonts.outfit(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: (equilibrio / 100).clamp(0, 1).toDouble(),
                minHeight: 8,
                backgroundColor: AppTheme.primaryDark,
                valueColor: AlwaysStoppedAnimation<Color>(
                  equilibrio >= 100 ? const Color(0xFF10B981) : AppTheme.accentColor,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Gastos fijos cubiertos: Bs. ${_datos!['gastosFijos']}',
              style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniStat(String label, double valor, Color color, dynamic icono) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.primaryDark,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              FaIcon(icono, size: 10, color: color),
              const SizedBox(width: 4),
              Text(label, style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Bs. ${valor.toStringAsFixed(2)}',
            style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
