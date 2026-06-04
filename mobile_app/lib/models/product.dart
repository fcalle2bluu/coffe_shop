class Product {
  final int id;
  final String nombre;
  final double precioVenta;
  final String categoria;

  Product({
    required this.id,
    required this.nombre,
    required this.precioVenta,
    required this.categoria,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] ?? 0,
      nombre: json['nombre'] ?? '',
      precioVenta: double.tryParse(json['precio_venta'].toString()) ?? 0.0,
      categoria: json['categoria'] ?? 'General',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'nombre': nombre,
      'precio_venta': precioVenta,
      'categoria': categoria,
    };
  }
}
