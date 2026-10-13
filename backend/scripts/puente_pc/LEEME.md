# Puente del lector de asistencia — instalación en la PC de la cafetería

> **Si sos Claude leyendo esto en la PC de la cafetería: empezá por acá.**
> Todo lo que necesitás está en esta carpeta. No hace falta levantar el
> servidor ni instalar las dependencias del proyecto.

## Qué es esto

En la cafetería hay un lector de huella/cara **Dahua DHI-ASI3204E-DW**. El
lector guarda las marcaciones adentro suyo, pero no sabe hablar con el sistema
(su único modo de aviso automático usa un protocolo propietario de Dahua, no
HTTP). Entonces este puente, cada 3 segundos, le pregunta al lector *"¿marcó
alguien?"* y manda lo nuevo a la API del sistema en Render.

```
Lector 192.168.0.31  ──(red local, Digest MD5)──>  puente.js
puente.js  ──(HTTPS + cabecera x-lector-key)──>  coffe-shop-4ffg.onrender.com
                                                  └─> tabla asistencia
```

El puente **no toca la base de datos**. Habla con la API igual que el navegador.
Si se cae, no se pierde nada: las marcaciones quedan guardadas en el lector y
entran cuando vuelve a arrancar.

## Antes de instalar: la red

El lector está en el **wifi de 2.4 GHz**. Si la PC está en el de 5 GHz **no lo
va a ver**, aunque el internet ande perfecto. Verificar primero:

```bash
ping -c 3 192.168.0.31
```

Si no responde, no sigas: es la red, no el software.

## Instalación

```bash
sudo bash backend/scripts/puente_pc/instalar_arch.sh
```

El script instala `nodejs` si falta, crea el usuario de sistema `puente`, copia
el puente a `/opt/puente-lector/`, deja `/etc/puente-lector.env` para las
claves, e instala el servicio de systemd. **No arranca nada todavía.**

Después hay que poner las claves reales:

```bash
sudo nano /etc/puente-lector.env
```

Hacen falta dos valores que **no están en el repo a propósito** (son secretos):

| Variable | De dónde sale |
|---|---|
| `LECTOR_PASSWORD` | la contraseña de admin del lector |
| `LECTOR_API_KEY` | tiene que ser **idéntica** a la variable `LECTOR_API_KEY` del servidor en Render |

Las dos están en el archivo `.env` de la Mac del dueño. Si no las tenés, pedíselas
a él — no las adivines ni generes una nueva: si la clave no coincide con la de
Render, el servidor responde `401 Clave del lector inválida.`

## Probar antes de prender

```bash
sudo bash -c 'set -a; . /etc/puente-lector.env; set +a; \
  LECTOR_ESTADO_ARCHIVO=/tmp/prueba-puente.json \
  node /opt/puente-lector/puente.js --simular'
```

Con `--simular` mira el lector pero **no registra asistencia**. Tiene que decir:

```
Puente iniciado. Lector 192.168.0.31 -> (simulación, no manda nada)
Reviso cada 3 segundos. Último registro procesado: #0
Primera vez: arranco desde el registro #NNN (lo anterior queda como historial).
```

Ese "arranco desde el #NNN" es importante: en el primer arranque toma el número
del último registro que ya existe en el lector, para **no reenviar meses de
historial viejo** como si fueran marcaciones de hoy.

Cortalo con Ctrl+C.

## Prenderlo

```bash
sudo systemctl enable --now puente-lector
journalctl -u puente-lector -f
```

`enable` hace que arranque solo cuando se prende la PC. El servicio también se
reinicia solo a los 15 segundos si se cae.

## Comprobar que funciona de verdad

Pedile a alguien **que tenga la huella cargada** que marque, y mirá el log:

```
17:34:30 · 2 marcación(es) nueva(s) en el lector, 1 reconocida(s)
17:34:31 ·    #97 Freddy Calle -> entrada
```

Que diga `-> entrada` (o `-> salida`) significa que el sistema lo aceptó y
grabó. Después se puede confirmar en la pantalla de **Asistencia** del sistema.

## Reglas que ya están puestas (no son errores)

- **Una entrada y una salida por persona por día.** El tercer toque del día se
  ignora a propósito; la tabla `asistencia` tiene `UNIQUE (usuario_id, fecha)`.
- **Margen de gracia de 5 minutos.** Si alguien vuelve a marcar dentro de los 5
  minutos de su entrada, se ignora en vez de cerrarle el turno. Pasaba al dejar
  el dedo apoyado de más: el lector generaba dos marcaciones seguidas y el turno
  quedaba en 0.00 hrs. Se cambia con `ASISTENCIA_GRACIA_MIN` **en Render**, no
  acá: la regla vive en el servidor, para que valga igual para el QR.
- **Las marcaciones no reconocidas se descartan.** Si alguien apoya el dedo y el
  lector no lo identifica, el puente no manda nada.
- **Un turno abierto de ayer no se cierra con la hora de hoy** — eso generaba
  turnos fantasma de 40 y hasta 140 horas.
- **Repetidos:** cada marcación tiene un número (`RecNo`) y el servidor la
  guarda con `ON CONFLICT DO NOTHING`. Aunque el puente mande lo mismo dos
  veces, se registra una sola.

## Si algo falla

| Síntoma | Qué pasa |
|---|---|
| `el lector no respondió a tiempo` | la PC no está en el wifi de 2.4 GHz, o el lector cambió de IP |
| `El lector respondió HTTP 401` | `LECTOR_PASSWORD` equivocada |
| `el sistema respondió HTTP 401` | `LECTOR_API_KEY` no coincide con la de Render |
| `el sistema respondió HTTP 503` | falta la variable `LECTOR_API_KEY` **en Render** |
| arranca pero nunca registra nada | puede que esas personas no tengan la huella cargada en el lector |

**La IP del lector puede cambiar sola.** Conviene reservarla en el router:
MAC `40:7a:a4:5f:19:11` → `192.168.0.31` fija. Si no, un corte de luz puede
dejar el puente hablándole a una dirección que ya no existe.

## Dos cosas que NO hay que hacer

1. **No correr pruebas de impresión** contra el sistema: las comandas salen en
   la impresora de la cocina y el personal se confunde con pedidos falsos.
2. **No correr dos puentes a la vez** contra el mismo lector. No rompe nada
   (los repetidos se descartan), pero no tiene sentido.

## En Windows, por si alguna vez hace falta

Mismo archivo `puente_lector_asistencia.js`, que no necesita ninguna librería:
instalar Node.js desde nodejs.org, poner el script y un `.env` al lado en una
carpeta, y llamarlo con `node puente.js` desde un `.bat`. Para que arranque
solo, un acceso directo al `.bat` dentro de `shell:startup`.
