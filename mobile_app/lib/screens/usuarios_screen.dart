import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class UsuariosScreen extends StatefulWidget {
  const UsuariosScreen({super.key});

  @override
  State<UsuariosScreen> createState() => _UsuariosScreenState();
}

class _UsuariosScreenState extends State<UsuariosScreen> {
  bool _isLoading = true;
  List<dynamic> _usuarios = [];
  final Set<int> _revealedPinUserIds = {};

  // Controllers for Add User Dialog
  final _usrNombreController = TextEditingController();
  final _usrUsernameController = TextEditingController();
  final _usrPinController = TextEditingController();
  String _selectedRol = 'CAJERO';
  bool _obscurePinInDialog = true;

  @override
  void initState() {
    super.initState();
    _loadUsuarios();
  }

  @override
  void dispose() {
    _usrNombreController.dispose();
    _usrUsernameController.dispose();
    _usrPinController.dispose();
    super.dispose();
  }

  Future<void> _loadUsuarios() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/parametros/usuarios');
      if (res.statusCode == 200) {
        setState(() {
          _usuarios = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar usuarios: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggleUserStatus(int id, bool currentStatus) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.put('/parametros/usuarios/$id/status', {
        'activo': !currentStatus,
      });
      if (res.statusCode == 200) {
        _loadUsuarios();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al actualizar estado.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _eliminarUsuario(int id, String nombre) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar Personal'),
        content: Text('¿Estás seguro de eliminar a "$nombre"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        final res = await ApiConfig.delete('/parametros/usuarios/$id');
        if (res.statusCode == 200) {
          _loadUsuarios();
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al eliminar usuario.')),
        );
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updatePermissions(dynamic user, String field, bool value) async {
    setState(() => _isLoading = true);
    
    final Map<String, dynamic> body = {
      'perm_stock': user['perm_stock'] == true,
      'perm_compras': user['perm_compras'] == true,
      'perm_proveedores': user['perm_proveedores'] == true,
      'perm_auditoria': user['perm_auditoria'] == true,
      'perm_parametros': user['perm_parametros'] == true,
      'perm_informe': user['perm_informe'] == true,
    };
    
    body['perm_$field'] = value;

    try {
      final res = await ApiConfig.put('/parametros/usuarios/${user['id']}/permisos', body);
      if (res.statusCode == 200) {
        _loadUsuarios();
      } else {
        throw Exception('Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al guardar permisos.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _crearUsuario() async {
    final nombre = _usrNombreController.text.trim();
    final username = _usrUsernameController.text.trim();
    final pin = _usrPinController.text.trim();

    if (nombre.isEmpty || username.isEmpty || pin.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Todos los campos son obligatorios')),
      );
      return;
    }

    Navigator.pop(context);
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.post('/parametros/usuarios', {
        'nombre': nombre,
        'username': username,
        'pin': pin,
        'rol': _selectedRol,
      });

      if (res.statusCode == 201) {
        _usrNombreController.clear();
        _usrUsernameController.clear();
        _usrPinController.clear();
        _loadUsuarios();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
      );
      setState(() => _isLoading = false);
    }
  }

  void _showAddUserDialog() {
    _usrNombreController.clear();
    _usrUsernameController.clear();
    _usrPinController.clear();
    _selectedRol = 'CAJERO';
    _obscurePinInDialog = true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Registrar Nuevo Personal'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _usrNombreController,
                  decoration: const InputDecoration(labelText: 'Nombre Completo'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _usrUsernameController,
                  decoration: const InputDecoration(labelText: 'Identificador (Login)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _usrPinController,
                  keyboardType: TextInputType.number,
                  obscureText: _obscurePinInDialog,
                  decoration: InputDecoration(
                    labelText: 'PIN de Seguridad (Números)',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePinInDialog ? Icons.visibility : Icons.visibility_off,
                        color: AppTheme.textMuted,
                      ),
                      onPressed: () {
                        setDialogState(() {
                          _obscurePinInDialog = !_obscurePinInDialog;
                        });
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _selectedRol,
                  decoration: const InputDecoration(labelText: 'Rol'),
                  items: const [
                    DropdownMenuItem(value: 'ADMINISTRADOR', child: Text('ADMINISTRADOR')),
                    DropdownMenuItem(value: 'CAJERO', child: Text('CAJERO')),
                    DropdownMenuItem(value: 'ALMACEN', child: Text('ENCARGADO ALMACÉN')),
                  ],
                  onChanged: (val) {
                    setDialogState(() => _selectedRol = val!);
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            TextButton(
              onPressed: _crearUsuario,
              child: const Text('Registrar'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPermissionSwitchTile(dynamic user, String field, String title, String subtitle, bool val) {
    return SwitchListTile(
      value: val,
      title: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
      activeColor: AppTheme.adminColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
      onChanged: (newVal) => _updatePermissions(user, field, newVal),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestión de Usuarios'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadUsuarios,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddUserDialog,
        backgroundColor: AppTheme.accentColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _usuarios.isEmpty
              ? const Center(
                  child: Text(
                    'No hay colaboradores registrados.',
                    style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _usuarios.length,
                  itemBuilder: (context, idx) {
                    final u = _usuarios[idx];
                    final id = u['id'];
                    final nombre = u['nombre'] ?? '';
                    final username = u['username'] ?? '';
                    final pin = u['pin'] ?? '';
                    final rol = u['rol'] ?? 'CAJERO';
                    final activo = u['activo'] == true;
                    
                    final isAdmin = rol == 'ADMIN' || rol == 'ADMINISTRADOR';

                    // Checkbox values
                    final permStock = u['perm_stock'] == true;
                    final permCompras = u['perm_compras'] == true;
                    final permProveedores = u['perm_proveedores'] == true;
                    final permAuditoria = u['perm_auditoria'] == true;
                    final permParametros = u['perm_parametros'] == true;
                    final permInforme = u['perm_informe'] == true;

                    final isPinRevealed = _revealedPinUserIds.contains(id);

                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ExpansionTile(
                        title: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.04),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.white.withOpacity(0.04)),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                nombre.isNotEmpty ? nombre.substring(0, 1).toUpperCase() : 'U',
                                style: const TextStyle(fontWeight: FontWeight.w900, color: AppTheme.accentColor),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                                  Row(
                                    children: [
                                      Text('@$username', style: const TextStyle(fontSize: 10.5, color: AppTheme.textMuted, fontStyle: FontStyle.italic)),
                                      const SizedBox(width: 12),
                                      const Text('PIN: ', style: TextStyle(fontSize: 10.5, color: AppTheme.textMuted)),
                                      Text(
                                        isPinRevealed ? pin : '••••',
                                        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white70, letterSpacing: 1.0),
                                      ),
                                      const SizedBox(width: 6),
                                      GestureDetector(
                                        onTap: () {
                                          setState(() {
                                            if (isPinRevealed) {
                                              _revealedPinUserIds.remove(id);
                                            } else {
                                              _revealedPinUserIds.add(id);
                                            }
                                          });
                                        },
                                        child: Icon(
                                          isPinRevealed ? Icons.visibility_off : Icons.visibility,
                                          size: 14,
                                          color: AppTheme.accentColor,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4.0),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: isAdmin ? AppTheme.adminColor.withOpacity(0.1) : Colors.greenAccent.withOpacity(0.06),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: isAdmin ? AppTheme.adminColor.withOpacity(0.2) : Colors.greenAccent.withOpacity(0.1)),
                                ),
                                child: Text(
                                  rol,
                                  style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: isAdmin ? AppTheme.adminColor : Colors.greenAccent),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: activo ? const Color(0xFF10B981).withOpacity(0.1) : Colors.white10,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  activo ? 'OPERATIVO' : 'SUSPENDIDO',
                                  style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: activo ? const Color(0xFF10B981) : AppTheme.textMuted),
                                ),
                              ),
                            ],
                          ),
                        ),
                        children: [
                          const Divider(color: Colors.white10, height: 1),
                          
                          // Account controls
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Controles de Cuenta:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted)),
                                Row(
                                  children: [
                                    IconButton(
                                      icon: FaIcon(
                                        activo ? FontAwesomeIcons.toggleOn : FontAwesomeIcons.toggleOff,
                                        color: activo ? AppTheme.adminColor : AppTheme.textMuted,
                                        size: 22,
                                      ),
                                      tooltip: activo ? 'Suspender Colaborador' : 'Activar Colaborador',
                                      onPressed: () => _toggleUserStatus(id, activo),
                                    ),
                                    IconButton(
                                      icon: const FaIcon(FontAwesomeIcons.trashCan, color: Colors.redAccent, size: 14),
                                      tooltip: 'Eliminar Colaborador',
                                      onPressed: () => _eliminarUsuario(id, nombre),
                                    ),
                                  ],
                                )
                              ],
                            ),
                          ),
                          const Divider(color: Colors.white10, height: 1),

                          // Permissions List (Descriptive Switch Tiles)
                          if (isAdmin)
                            const Padding(
                              padding: EdgeInsets.all(16.0),
                              child: Center(
                                child: Text(
                                  'Los administradores tienen acceso total al sistema.',
                                  style: TextStyle(fontStyle: FontStyle.italic, fontSize: 12, color: AppTheme.adminColor),
                                ),
                              ),
                            )
                          else ...[
                            _buildPermissionSwitchTile(u, 'stock', 'Stock Actual', 'Ver y ajustar stock del almacén', permStock),
                            _buildPermissionSwitchTile(u, 'compras', 'Compras Insumos', 'Registrar compras y reabastecimiento', permCompras),
                            _buildPermissionSwitchTile(u, 'proveedores', 'Proveedores', 'Ver y crear directores de contacto', permProveedores),
                            _buildPermissionSwitchTile(u, 'auditoria', 'Auditoría', 'Inspeccionar bitácoras de acceso', permAuditoria),
                            _buildPermissionSwitchTile(u, 'parametros', 'Parámetros', 'Configuración global de empresa', permParametros),
                            _buildPermissionSwitchTile(u, 'informe', 'Informe General', 'Visualizar KPIs de ventas e informes', permInforme),
                          ],
                          const SizedBox(height: 10),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
