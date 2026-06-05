import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/theme.dart';

class PulsingCoffeeLoader extends StatefulWidget {
  final String message;

  const PulsingCoffeeLoader({
    super.key,
    this.message = 'Cargando...',
  });

  @override
  State<PulsingCoffeeLoader> createState() => _PulsingCoffeeLoaderState();
}

class _PulsingCoffeeLoaderState extends State<PulsingCoffeeLoader> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _scaleAnimation = Tween<double>(begin: 0.85, end: 1.15).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    _opacityAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          ScaleTransition(
            scale: _scaleAnimation,
            child: Container(
              width: 70,
              height: 70,
              decoration: BoxDecoration(
                color: AppTheme.accentColor.withOpacity(0.1),
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.accentColor.withOpacity(0.2), width: 1.5),
              ),
              alignment: Alignment.center,
              child: const FaIcon(
                FontAwesomeIcons.mugHot,
                color: AppTheme.accentColor,
                size: 28,
              ),
            ),
          ),
          const SizedBox(height: 16),
          FadeTransition(
            opacity: _opacityAnimation,
            child: Text(
              widget.message,
              style: const TextStyle(
                fontFamily: 'Outfit',
                fontSize: 12,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.2,
                color: AppTheme.textMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
