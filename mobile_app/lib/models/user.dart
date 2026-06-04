class User {
  final int id;
  final String nombre;
  final String username;
  final String rol;
  final bool activo;
  final UserPermissions permissions;

  User({
    required this.id,
    required this.nombre,
    required this.username,
    required this.rol,
    required this.activo,
    required this.permissions,
  });

  bool get isAdmin => rol.toUpperCase() == 'ADMIN' || rol.toUpperCase() == 'ADMINISTRADOR';
  bool get isAlmacen => rol.toUpperCase() == 'ALMACEN' || rol.toUpperCase() == 'LOGISTICA';

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? 0,
      nombre: json['nombre'] ?? '',
      username: json['username'] ?? '',
      rol: json['rol'] ?? 'CAJERO',
      activo: json['activo'] ?? true,
      permissions: UserPermissions.fromJson(json),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'nombre': nombre,
      'username': username,
      'rol': rol,
      'activo': activo,
      ...permissions.toJson(),
    };
  }
}

class UserPermissions {
  final bool permStock;
  final bool permCompras;
  final bool permProveedores;
  final bool permAuditoria;
  final bool permParametros;
  final bool permInforme;

  UserPermissions({
    required this.permStock,
    required this.permCompras,
    required this.permProveedores,
    required this.permAuditoria,
    required this.permParametros,
    required this.permInforme,
  });

  factory UserPermissions.fromJson(Map<String, dynamic> json) {
    return UserPermissions(
      permStock: json['perm_stock'] == true || json['perm_stock'].toString() == 'true',
      permCompras: json['perm_compras'] == true || json['perm_compras'].toString() == 'true',
      permProveedores: json['perm_proveedores'] == true || json['perm_proveedores'].toString() == 'true',
      permAuditoria: json['perm_auditoria'] == true || json['perm_auditoria'].toString() == 'true',
      permParametros: json['perm_parametros'] == true || json['perm_parametros'].toString() == 'true',
      permInforme: json['perm_informe'] == true || json['perm_informe'].toString() == 'true',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'perm_stock': permStock,
      'perm_compras': permCompras,
      'perm_proveedores': permProveedores,
      'perm_auditoria': permAuditoria,
      'perm_parametros': permParametros,
      'perm_informe': permInforme,
    };
  }
}
