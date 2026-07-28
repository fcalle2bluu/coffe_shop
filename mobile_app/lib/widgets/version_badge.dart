import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../config/theme.dart';
import '../services/update_service.dart';
import 'dialogo_actualizacion.dart';

/// Chip flotante para una esquina de la pantalla: muestra la versión instalada
/// y, si hay una más nueva disponible, cambia a un botón "Actualizar".
class VersionBadge extends StatefulWidget {
  const VersionBadge({super.key});

  @override
  State<VersionBadge> createState() => _VersionBadgeState();
}

class _VersionBadgeState extends State<VersionBadge> {
  String _versionActual = '';
  InfoActualizacion? _actualizacionDisponible;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final paquete = await PackageInfo.fromPlatform();
    if (!mounted) return;
    setState(() => _versionActual = paquete.version);

    final info = await UpdateService.buscarActualizacion();
    if (mounted) setState(() => _actualizacionDisponible = info);
  }

  @override
  Widget build(BuildContext context) {
    if (_versionActual.isEmpty) return const SizedBox.shrink();

    final hayActualizacion = _actualizacionDisponible != null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: hayActualizacion ? () => mostrarDialogoActualizacion(context, _actualizacionDisponible!) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: hayActualizacion ? AppTheme.accentColor : AppTheme.secondaryDark.withOpacity(0.85),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6)],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (hayActualizacion) ...[
                const Icon(Icons.system_update_alt, size: 12, color: Colors.white),
                const SizedBox(width: 4),
                const Text(
                  'Actualizar',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ] else
                Text(
                  'v$_versionActual',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.textMuted),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
