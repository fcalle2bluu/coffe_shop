// Comprueba el panel "Vendido hoy" del Control Diario con los datos que
// realmente devuelve el servidor, y en una pantalla angosta (320 px), que es
// donde saltan los desbordes.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:coffe_shop_app/config/theme.dart';
import 'package:coffe_shop_app/screens/control_diario_screen.dart';

// Respuesta real de /control-diario/vendido-hoy.
final _datos = <String, dynamic>{
  'fecha': '17/10/2026',
  'cocina': [
    {
      'nombre': 'Alas (3 unid)',
      'unidad': 'Piezas',
      'cantidad': 48,
      'origen': [
        {'producto': 'Promoción de Alitas', 'vendidos': 12, 'por_unidad': 4}
      ],
    },
    {
      'nombre': 'Hamburguesa',
      'unidad': 'Unidad',
      'cantidad': 11,
      'origen': [
        {'producto': 'Hamburguesa Simple', 'vendidos': 7, 'por_unidad': 1},
        {'producto': 'Hamburguesa La Paz', 'vendidos': 4, 'por_unidad': 1},
      ],
    },
    {
      'nombre': 'Nuggets',
      'unidad': 'Piezas',
      'cantidad': 18,
      'origen': [
        {'producto': 'Nuggets', 'vendidos': 3, 'por_unidad': 6}
      ],
    },
  ],
  'barra': [
    {
      'nombre': 'Personales de vidrio',
      'unidad': 'Unidad',
      'cantidad': 1,
      'origen': [
        {'producto': 'Personales de vidrio', 'vendidos': 1, 'por_unidad': 1}
      ],
    },
  ],
};

Future<void> _montar(WidgetTester tester, Map<String, dynamic> datos, {double ancho = 320}) async {
  tester.view.physicalSize = Size(ancho, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      backgroundColor: AppTheme.primaryDark,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: PanelVendidoHoy(datos: datos),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('muestra cocina y barra por separado, con producto y cantidad', (tester) async {
    await _montar(tester, _datos);

    expect(find.text('Vendido hoy'), findsOneWidget);
    expect(find.text('17/10/2026'), findsOneWidget);
    expect(find.text('Cocina'), findsOneWidget);
    expect(find.text('Barra'), findsOneWidget);

    // Producto y cantidad de cada renglón.
    expect(find.text('Alas (3 unid)'), findsOneWidget);
    expect(find.text('48'), findsOneWidget);
    expect(find.text('Hamburguesa'), findsOneWidget);
    expect(find.text('11'), findsOneWidget);
    expect(find.text('Personales de vidrio'), findsOneWidget);

    expect(find.text('3 productos vendidos'), findsOneWidget); // cocina
    expect(find.text('1 producto vendido'), findsOneWidget); // barra
  });

  testWidgets('el detalle aparece solo cuando el nombre no coincide con la venta', (tester) async {
    await _montar(tester, _datos);

    // Sale de dos productos distintos: hay que decir de cuáles.
    expect(find.text('Hamburguesa Simple ×7 · Hamburguesa La Paz ×4'), findsOneWidget);
    // "Nuggets" se vende con ese mismo nombre: repetirlo no aporta nada.
    expect(find.text('Nuggets ×3'), findsNothing);
    // Idem en barra.
    expect(find.text('Personales de vidrio ×1'), findsNothing);
  });

  testWidgets('sin ventas lo dice, no deja la tarjeta vacía', (tester) async {
    await _montar(tester, {'fecha': '17/10/2026', 'cocina': [], 'barra': []});
    expect(find.text('No se vendió nada de la lista hoy'), findsNWidgets(2));
    expect(find.text('Todavía nada'), findsNWidgets(2));
  });

  testWidgets('no desborda en una pantalla angosta', (tester) async {
    await _montar(tester, _datos, ancho: 320);
    expect(tester.takeException(), isNull);
  });

  testWidgets('las cantidades salen sin el .0 de mas', (tester) async {
    await _montar(tester, {
      'fecha': '17/10/2026',
      'cocina': [
        {
          'nombre': 'Lomito',
          'unidad': 'Unidad',
          'cantidad': 5.0,
          'origen': [
            {'producto': 'Medio Lomo', 'vendidos': 5.0, 'por_unidad': 1}
          ],
        },
        {
          'nombre': 'Queso',
          'unidad': 'Kilo',
          'cantidad': 1.5,
          'origen': [
            {'producto': 'Tabla de quesos', 'vendidos': 3.0, 'por_unidad': 0.5}
          ],
        },
      ],
      'barra': [],
    });
    expect(find.text('5'), findsOneWidget);
    expect(find.text('1.50'), findsOneWidget);
    expect(find.text('Medio Lomo ×5'), findsOneWidget);
  });
}
