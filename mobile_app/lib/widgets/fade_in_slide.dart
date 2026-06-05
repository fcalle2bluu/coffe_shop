import 'package:flutter/material.dart';

class FadeInSlide extends StatefulWidget {
  final Widget child;
  final int index;
  final Duration duration;
  final double slideOffset;

  const FadeInSlide({
    super.key,
    required this.child,
    this.index = 0,
    this.duration = const Duration(milliseconds: 500),
    this.slideOffset = 30.0,
  });

  @override
  State<FadeInSlide> createState() => _FadeInSlideState();
}

class _FadeInSlideState extends State<FadeInSlide> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacityAnimation;
  late Animation<double> _yAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );

    _opacityAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _yAnimation = Tween<double>(begin: widget.slideOffset, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    // Calculate staggered delay based on index
    final delay = Duration(milliseconds: 40 * widget.index);
    Future.delayed(delay, () {
      if (mounted) {
        _controller.forward();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Opacity(
          opacity: _opacityAnimation.value,
          child: Transform.translate(
            offset: Offset(0.0, _yAnimation.value),
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}
