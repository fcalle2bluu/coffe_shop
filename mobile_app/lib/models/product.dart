class Product {
  final int id;
  final String nombre;
  final double precioVenta;
  final String categoria;
  final String? imagenUrl;
  final double cantidadVendida;

  Product({
    required this.id,
    required this.nombre,
    required this.precioVenta,
    required this.categoria,
    this.imagenUrl,
    this.cantidadVendida = 0,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] ?? 0,
      nombre: json['nombre'] ?? '',
      precioVenta: double.tryParse(json['precio_venta'].toString()) ?? 0.0,
      categoria: json['categoria'] ?? 'General',
      imagenUrl: json['imagen_url'],
      cantidadVendida: double.tryParse(json['cantidad_vendida']?.toString() ?? '') ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'nombre': nombre,
      'precio_venta': precioVenta,
      'categoria': categoria,
      'imagen_url': imagenUrl,
      'cantidad_vendida': cantidadVendida,
    };
  }
}
