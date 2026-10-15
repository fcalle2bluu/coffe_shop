// Vista previa SOLO para revisar el diseño de la grilla de mesas en el
// navegador, sin celular ni servidor. No entra en la app: se corre a mano con
//   flutter run -d chrome -t lib/main_preview.dart
import 'package:flutter/material.dart';
import 'config/theme.dart';
import 'widgets/mesa_card.dart';

void main() => runApp(const _Preview());

Map<String, dynamic> _libre(String n) => {'mesa': n, 'comanda': null, 'estado': 'libre'};
Map<String, dynamic> _ocupada(String n, String estado, double total, int items, int nro, int minutos) => {
      'mesa': n,
      'estado': 'ocupada',
      'comanda': {
        'estado': estado,
        'total': total,
        'numero_comanda': nro,
        'fecha_creacion':
            DateTime.now().toUtc().subtract(Duration(minutes: minutos)).toIso8601String(),
        'items': List.generate(items, (i) => {'cantidad': 1, 'nombre': 'P$i'}),
      },
    };

final _pb = <dynamic>[
  _libre('PB1'),
  _ocupada('PB2', 'CREADA', 18, 3, 7, 12),
  _ocupada('PB3', 'ENTREGADA', 17.5, 2, 8, 64),
  _libre('PB4'),
  _libre('Para Llevar'),
];
final _p1 = <dynamic>[
  _libre('1'), _libre('2'), _libre('3'), _libre('4'),
  _libre('5'),
  _ocupada('6', 'CREADA', 110, 7, 9, 23),
  _libre('7'), _libre('8'),
  _ocupada('9', 'ENTREGADA', 247, 14, 10, 97),
  _libre('10'), _libre('11'), _libre('12'),
];

class _Preview extends StatelessWidget {
  const _Preview();
  @override
  Widget build(BuildContext context) {
    final todas = [..._pb, ..._p1];
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: AppTheme.primaryDark,
        appBar: AppBar(
          backgroundColor: AppTheme.primaryDark,
          title: const Text('Venta por Mesa',
              style: TextStyle(fontWeight: FontWeight.w900, color: Colors.white, fontSize: 18)),
          centerTitle: true,
        ),
        body: Column(
          children: [
            ResumenMesas(mesas: todas),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                children: [
                  for (final par in [('Planta Baja', _pb), ('Primer Piso', _p1)]) ...[
                    TituloPiso(nombre: par.$1, mesas: par.$2),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 124,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 0.95),
                      itemCount: par.$2.length,
                      itemBuilder: (_, i) => MesaCard(mesa: par.$2[i], onTap: () {}),
                    ),
                    const SizedBox(height: 14),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
