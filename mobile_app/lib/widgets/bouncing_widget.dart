import 'package:flutter/material.dart';

class BouncingWidget extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double shrinkScale;
  final Duration duration;

  const BouncingWidget({
    super.key,
    required this.child,
    this.onTap,
    this.shrinkScale = 0.95,
    this.duration = const Duration(milliseconds: 100),
  });

  @override
  State<BouncingWidget> createState() => _BouncingWidgetState();
}

class _BouncingWidgetState extends State<BouncingWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
      lowerBound: 0.0,
      upperBound: 1.0 - widget.shrinkScale,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.onTap != null) {
      _controller.forward();
    }
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.onTap != null) {
      _controller.reverse();
      widget.onTap!();
    }
  }

  void _onTapCancel() {
    if (widget.onTap != null) {
      _controller.reverse();
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      behavior: HitTestBehavior.opaque,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final scale = 1.0 - _controller.value;
          return Transform.scale(
            scale: scale,
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}
