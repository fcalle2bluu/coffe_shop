#!/usr/bin/env bash
# Instala el puente del lector de asistencia como servicio en Arch Linux.
# Correr desde la raiz del repo:   sudo bash backend/scripts/puente_pc/instalar_arch.sh
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUENTE="$AQUI/../puente_lector_asistencia.js"
DESTINO=/opt/puente-lector
ENV_REAL=/etc/puente-lector.env

if [[ $EUID -ne 0 ]]; then
    echo "Hay que correrlo con sudo:  sudo bash $0"
    exit 1
fi

if [[ ! -f "$PUENTE" ]]; then
    echo "No encuentro $PUENTE — ¿estás corriéndolo desde el repo?"
    exit 1
fi

echo "==> 1/5  Node.js"
if ! command -v node >/dev/null 2>&1; then
    pacman -S --needed --noconfirm nodejs
else
    echo "    ya está: $(node --version)"
fi

echo "==> 2/5  Usuario del servicio"
# Usuario de sistema sin login ni carpeta: el puente no necesita más que red.
id -u puente >/dev/null 2>&1 || useradd --system --shell /usr/bin/nologin --no-create-home puente

echo "==> 3/5  Copio el puente a $DESTINO"
install -d -m 755 "$DESTINO"
install -m 644 "$PUENTE" "$DESTINO/puente.js"

echo "==> 4/5  Archivo de claves en $ENV_REAL"
if [[ -f "$ENV_REAL" ]]; then
    echo "    ya existe, no lo toco"
else
    install -m 600 -o root -g root "$AQUI/ejemplo.env" "$ENV_REAL"
    echo "    creado con valores de ejemplo — HAY QUE EDITARLO"
fi

echo "==> 5/5  Servicio de systemd"
install -m 644 "$AQUI/puente-lector.service" /etc/systemd/system/puente-lector.service
systemctl daemon-reload

echo
if grep -q PONER_LA_CLAVE "$ENV_REAL"; then
    cat <<MSG
LISTO, PERO FALTA UN PASO.

1. Poné las claves reales:   sudo nano $ENV_REAL
   (LECTOR_PASSWORD y LECTOR_API_KEY están en el .env de la Mac del dueño)

2. Probá sin registrar nada (modo simulación: mira el lector pero no toca la asistencia):
   sudo bash -c 'set -a; . $ENV_REAL; set +a; LECTOR_ESTADO_ARCHIVO=/tmp/prueba-puente.json node $DESTINO/puente.js --simular'

3. Si dice "Puente iniciado", prendelo para siempre:
   sudo systemctl enable --now puente-lector

4. Para mirarlo:   journalctl -u puente-lector -f
MSG
else
    cat <<MSG
LISTO. Las claves ya estaban puestas.

Prendelo:        sudo systemctl enable --now puente-lector
Para mirarlo:    journalctl -u puente-lector -f
MSG
fi
