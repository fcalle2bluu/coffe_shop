import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../utils/mesa_utils.dart';

/// Paleta de estados de mesa. Tres estados en vez de dos: antes "ocupada" era
/// un único rojo y no distinguía la mesa que está esperando la comida de la que
/// ya comió y espera la cuenta, que es justo lo que el mesero necesita ver de
/// un vistazo para saber a dónde ir.
class EstadoMesa {
  static const Color libre = Color(0xFF34D399); // Emerald 400
  static const Color enCocina = Color(0xFFFBBF24); // Amber 400
  static const Color porCobrar = Color(0xFFFB7185); // Rose 400
}

/// Color, ícono y rótulo de una mesa según su estado real.
class _Estilo {
  final Color color;
  final IconData icono;
  final String rotulo;
  const _Estilo(this.color, this.icono, this.rotulo);
}

_Estilo _estiloDe(dynamic m) {
  final comanda = m['comanda'];
  final esParaLlevar = m['mesa']?.toString() == 'Para Llevar';
  if (comanda == null) {
    return _Estilo(
      EstadoMesa.libre,
      esParaLlevar ? Icons.shopping_bag_outlined : Icons.table_restaurant_outlined,
      'Libre',
    );
  }
  // CREADA = el pedido salió a cocina y todavía no se entregó.
  final enCocina = (comanda['estado'] ?? 'CREADA').toString().toUpperCase() == 'CREADA';
  return enCocina
      ? const _Estilo(EstadoMesa.enCocina, Icons.local_fire_department_rounded, 'En cocina')
      : const _Estilo(EstadoMesa.porCobrar, Icons.room_service_rounded, 'Por cobrar');
}

/// Hace cuánto se abrió el pedido. Sirve para notar la mesa olvidada.
String tiempoDesde(dynamic fechaCreacion, {DateTime? ahora}) {
  final t = DateTime.tryParse((fechaCreacion ?? '').toString())?.toLocal();
  if (t == null) return '';
  final min = (ahora ?? DateTime.now()).difference(t).inMinutes;
  if (min < 1) return 'recién';
  if (min < 60) return '$min min';
  final h = min ~/ 60;
  final r = min % 60;
  return r == 0 ? '${h}h' : '${h}h$r';
}

int cantidadItems(dynamic comanda) {
  final items = comanda?['items'];
  if (items is! List) return 0;
  var total = 0;
  for (final it in items) {
    total += (double.tryParse((it['cantidad'] ?? 0).toString()) ?? 0).round();
  }
  return total;
}

/// Contadores de arriba: en qué estado está el salón y cuánta plata hay en mesa.
class ResumenMesas extends StatelessWidget {
  final List<dynamic> mesas;
  const ResumenMesas({super.key, required this.mesas});

  @override
  Widget build(BuildContext context) {
    var libres = 0, enCocina = 0, porCobrar = 0;
    var totalEnMesas = 0.0;
    for (final m in mesas) {
      final comanda = m['comanda'];
      if (comanda == null) {
        libres++;
      } else {
        totalEnMesas += double.tryParse((comanda['total'] ?? 0).toString()) ?? 0;
        if ((comanda['estado'] ?? 'CREADA').toString().toUpperCase() == 'CREADA') {
          enCocina++;
        } else {
          porCobrar++;
        }
      }
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderDark),
      ),
      child: Row(
        children: [
          _dato('$libres', 'Libres', EstadoMesa.libre),
          _separador(),
          _dato('$enCocina', 'En cocina', EstadoMesa.enCocina),
          _separador(),
          _dato('$porCobrar', 'Por cobrar', EstadoMesa.porCobrar),
          _separador(),
          _dato('Bs. ${totalEnMesas.toStringAsFixed(0)}', 'En mesas', AppTheme.accentColor),
        ],
      ),
    );
  }

  Widget _dato(String valor, String rotulo, Color color) => Expanded(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                valor,
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  height: 1.1,
                  color: color,
                ),
              ),
            ),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                rotulo,
                style: const TextStyle(fontSize: 9.5, color: AppTheme.textMuted, letterSpacing: 0.2),
              ),
            ),
          ],
        ),
      );

  Widget _separador() => Container(width: 1, height: 30, color: AppTheme.borderDark);
}

/// Rótulo de un piso con su propio contador: "3 de 5 ocupadas".
class TituloPiso extends StatelessWidget {
  final String nombre;
  final List<dynamic> mesas;
  const TituloPiso({super.key, required this.nombre, required this.mesas});

  @override
  Widget build(BuildContext context) {
    final ocupadas = mesas.where((m) => m['comanda'] != null).length;
    // Cada texto se limita al 42% del ancho y se achica si no entra. Sin ese
    // tope, en un celular angosto (o con la letra del sistema agrandada) el
    // rótulo y el contador se pasaban del ancho y salía el rayado de desborde.
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 10),
      child: LayoutBuilder(
        builder: (context, c) {
          final topeTexto = c.maxWidth * 0.42;
          return Row(
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: topeTexto),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    nombre.toUpperCase(),
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                      letterSpacing: 0.8,
                      color: AppTheme.textLight,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(child: Container(height: 1, color: AppTheme.borderDark)),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: topeTexto),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    ocupadas == 0 ? 'todas libres' : '$ocupadas de ${mesas.length} ocupadas',
                    style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Una mesa de la grilla.
class MesaCard extends StatelessWidget {
  final dynamic mesa;
  final VoidCallback onTap;

  /// Solo para los tests: fija el "ahora" con el que se calcula el tiempo.
  final DateTime? ahora;

  const MesaCard({super.key, required this.mesa, required this.onTap, this.ahora});

  @override
  Widget build(BuildContext context) {
    final numMesa = mesa['mesa']?.toString() ?? '';
    final comanda = mesa['comanda'];
    final isLibre = comanda == null;
    final estilo = _estiloDe(mesa);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          decoration: BoxDecoration(
            // La mesa ocupada se pinta con un fondo teñido de su color, para
            // que el salón se lea de un vistazo sin mirar cada rótulo.
            color: isLibre ? AppTheme.secondaryDark : estilo.color.withOpacity(0.13),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isLibre ? AppTheme.borderDark : estilo.color.withOpacity(0.55),
              width: isLibre ? 1 : 1.6,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
            child: isLibre ? _libre(numMesa, estilo) : _ocupada(numMesa, comanda, estilo),
          ),
        ),
      ),
    );
  }

  Widget _libre(String numMesa, _Estilo estilo) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(estilo.icono, size: 26, color: estilo.color.withOpacity(0.85)),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            nombreMesa(numMesa),
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 12,
              color: AppTheme.textLight,
              fontFamily: 'Outfit',
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          estilo.rotulo,
          style: TextStyle(
            fontSize: 9.5,
            color: estilo.color.withOpacity(0.9),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _ocupada(String numMesa, dynamic comanda, _Estilo estilo) {
    final total = double.tryParse((comanda['total'] ?? 0).toString()) ?? 0;
    final items = cantidadItems(comanda);
    final hace = tiempoDesde(comanda['fecha_creacion'], ahora: ahora);
    final nroPedido = comanda['numero_comanda'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(estilo.icono, size: 13, color: estilo.color),
            const SizedBox(width: 4),
            Expanded(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  nombreMesa(numMesa),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 11.5,
                    color: AppTheme.textLight,
                    fontFamily: 'Outfit',
                  ),
                ),
              ),
            ),
          ],
        ),
        const Spacer(),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            'Bs. ${total.toStringAsFixed(total % 1 == 0 ? 0 : 1)}',
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 17,
              height: 1.1,
              color: AppTheme.textLight,
              fontFamily: 'Outfit',
            ),
          ),
        ),
        const SizedBox(height: 1),
        Text(
          estilo.rotulo,
          style: TextStyle(fontSize: 9.5, color: estilo.color, fontWeight: FontWeight.w700),
        ),
        const Spacer(),
        // En celulares angostos la grilla deja tarjetas de ~90 px y esta fila
        // no entraba (se desbordaba 23 px). El FittedBox la achica lo justo en
        // vez de cortarla con el rayado amarillo y negro.
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
            const Icon(Icons.restaurant_menu_rounded, size: 10, color: AppTheme.textMuted),
            const SizedBox(width: 2),
            Text('$items',
                style: const TextStyle(fontSize: 9.5, color: AppTheme.textMuted, fontWeight: FontWeight.w600)),
            const SizedBox(width: 7),
            const Icon(Icons.schedule_rounded, size: 10, color: AppTheme.textMuted),
            const SizedBox(width: 2),
            Text(
              hace,
              softWrap: false,
              style: const TextStyle(fontSize: 9.5, color: AppTheme.textMuted, fontWeight: FontWeight.w600),
            ),
            if (nroPedido != null) ...[
              const SizedBox(width: 7),
              Text(
                '#$nroPedido',
                style: TextStyle(
                  fontSize: 9.5,
                  color: estilo.color.withOpacity(0.9),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
            ],
          ),
        ),
      ],
    );
  }
}
