/// "Para Llevar" es una mesa especial: se muestra tal cual, sin el prefijo "Mesa".
String nombreMesa(dynamic mesa) => mesa == 'Para Llevar' ? 'Para Llevar' : 'Mesa $mesa';
