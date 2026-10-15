// Renderiza las tarjetas de mesa en pantallas de distintos tamaños y falla si
// alguna se desborda (el rayado amarillo y negro de Flutter). Es la forma de
// probarlas sin un celular conectado.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:coffe_shop_app/widgets/mesa_card.dart';

final _ahora = DateTime(2026, 10, 14, 15, 0);

Map<String, dynamic> mesaLibre(String n) => {'mesa': n, 'comanda': null, 'estado': 'libre'};

Map<String, dynamic> mesaOcupada(
  String n, {
  required String estadoComanda,
  required double total,
  int items = 3,
  int? nroPedido,
  String fecha = '2026-10-14T18:15:00.000Z', // 45 min antes de _ahora en La Paz
}) =>
    {
      'mesa': n,
      'estado': 'ocupada',
      'comanda': {
        'estado': estadoComanda,
        'total': total,
        'numero_comanda': nroPedido,
        'fecha_creacion': fecha,
        'items': List.generate(items, (i) => {'cantidad': 1, 'nombre': 'Producto $i'}),
      },
    };

Widget _grilla(List<dynamic> mesas) => MaterialApp(
      home: Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: Column(
          children: [
            ResumenMesas(mesas: mesas),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                children: [
                  TituloPiso(nombre: 'Planta Baja', mesas: mesas),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 124,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.95,
                    ),
                    itemCount: mesas.length,
                    itemBuilder: (_, i) => MesaCard(mesa: mesas[i], onTap: () {}, ahora: _ahora),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

Future<void> _pumpEn(WidgetTester tester, Size tamano, List<dynamic> mesas) async {
  tester.view.physicalSize = tamano;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_grilla(mesas));
  await tester.pump();
}

void main() {
  final mesasVariadas = <dynamic>[
    mesaLibre('PB1'),
    mesaLibre('Para Llevar'),
    mesaOcupada('PB2', estadoComanda: 'CREADA', total: 18, nroPedido: 7),
    mesaOcupada('PB3', estadoComanda: 'ENTREGADA', total: 17.5, nroPedido: 8),
    // El caso feo a propósito: plata de 4 cifras, muchos ítems, pedido de 3
    // dígitos y más de una hora abierta. Si algo se desborda, se desborda acá.
    mesaOcupada('12', estadoComanda: 'CREADA', total: 1234.5, items: 18, nroPedido: 128,
        fecha: '2026-10-14T15:40:00.000Z'),
  ];

  testWidgets('las tarjetas no se desbordan en un celular chico (320x640)', (tester) async {
    await _pumpEn(tester, const Size(320, 640), mesasVariadas);
    expect(tester.takeException(), isNull);
  });

  testWidgets('las tarjetas no se desbordan en un celular normal (390x844)', (tester) async {
    await _pumpEn(tester, const Size(390, 844), mesasVariadas);
    expect(tester.takeException(), isNull);
  });

  testWidgets('las tarjetas no se desbordan en un celular grande (430x932)', (tester) async {
    await _pumpEn(tester, const Size(430, 932), mesasVariadas);
    expect(tester.takeException(), isNull);
  });

  testWidgets('los contadores suman bien y muestran la plata en mesa', (tester) async {
    await _pumpEn(tester, const Size(390, 844), mesasVariadas);
    // 2 libres, 2 en cocina (18 + 1234.5), 1 por cobrar (17.5) = Bs. 1270
    expect(find.text('2'), findsNWidgets(2)); // libres y en cocina
    expect(find.text('1'), findsOneWidget); // por cobrar
    expect(find.text('Bs. 1270'), findsOneWidget);
    expect(find.text('3 de 5 ocupadas'), findsOneWidget);
  });

  testWidgets('la mesa ocupada muestra plata, ítems, tiempo y número de pedido', (tester) async {
    await _pumpEn(tester, const Size(390, 844), mesasVariadas);
    expect(find.text('Bs. 18'), findsOneWidget); // entero: sin decimal de relleno
    expect(find.text('Bs. 17.5'), findsOneWidget); // con decimal cuando lo tiene
    expect(find.text('#128'), findsOneWidget);
    expect(find.text('18'), findsOneWidget); // los 18 ítems
    // Acotado a las tarjetas: "En cocina" y "Por cobrar" también son rótulos
    // de los contadores de arriba, y si no se acota se cuentan de más.
    Finder enTarjetas(String t) =>
        find.descendant(of: find.byType(MesaCard), matching: find.text(t));
    expect(enTarjetas('En cocina'), findsNWidgets(2));
    expect(enTarjetas('Por cobrar'), findsOneWidget);
    expect(enTarjetas('Libre'), findsNWidgets(2));
  });

  test('el tiempo transcurrido se escribe corto', () {
    expect(tiempoDesde('2026-10-14T19:00:00.000Z', ahora: _ahora), 'recién');
    expect(tiempoDesde('2026-10-14T18:15:00.000Z', ahora: _ahora), '45 min');
    expect(tiempoDesde('2026-10-14T17:00:00.000Z', ahora: _ahora), '2h');
    expect(tiempoDesde('2026-10-14T15:40:00.000Z', ahora: _ahora), '3h20');
    expect(tiempoDesde(null, ahora: _ahora), '');
  });
}
