// frontend/js/parametros.js

document.addEventListener('DOMContentLoaded', () => {
    cargarParametros();

    // Añadir listeners para que el ticket en vivo se actualice al escribir
    const inputsLive = [
        { id: 'inpEmpresa', prevId: 'prev-empresa' },
        { id: 'inpDoc', prevId: 'prev-doc' },
        { id: 'inpDir', prevId: 'prev-dir' },
        { id: 'inpTel', prevId: 'prev-tel' },
        { id: 'inpMsgSup', prevId: 'prev-msg-sup' },
        { id: 'inpMsgInf', prevId: 'prev-msg-inf' }
    ];

    inputsLive.forEach(map => {
        document.getElementById(map.id).addEventListener('input', (e) => {
            document.getElementById(map.prevId).innerText = e.target.value;
        });
    });

    // Listener especial para el símbolo de moneda (se repite en varios lados)
    document.getElementById('inpMoneda').addEventListener('input', (e) => {
        const monedaTags = document.querySelectorAll('.prev-moneda');
        monedaTags.forEach(tag => tag.innerText = e.target.value);
    });
});

async function cargarParametros() {
    try {
        const res = await fetch('/api/parametros');
        const data = await res.json();

        if (data) {
            // Llenar formularios
            document.getElementById('inpEmpresa').value = data.nombre_empresa;
            document.getElementById('inpDoc').value = data.documento_empresa;
            document.getElementById('inpDir').value = data.direccion;
            document.getElementById('inpTel').value = data.telefono;
            document.getElementById('inpMoneda').value = data.moneda;
            document.getElementById('inpImpNombre').value = data.impuesto_nombre;
            document.getElementById('inpImpPorcentaje').value = data.impuesto_porcentaje;
            document.getElementById('inpMsgSup').value = data.mensaje_ticket_superior;
            document.getElementById('inpMsgInf').value = data.mensaje_ticket_inferior;
            document.getElementById('selPapel').value = data.impresora_papel;

            // Disparar evento 'input' para que se actualice el Ticket en Vivo al inicio
            document.getElementById('inpEmpresa').dispatchEvent(new Event('input'));
            document.getElementById('inpDoc').dispatchEvent(new Event('input'));
            document.getElementById('inpDir').dispatchEvent(new Event('input'));
            document.getElementById('inpTel').dispatchEvent(new Event('input'));
            document.getElementById('inpMsgSup').dispatchEvent(new Event('input'));
            document.getElementById('inpMsgInf').dispatchEvent(new Event('input'));
            document.getElementById('inpMoneda').dispatchEvent(new Event('input'));
        }
    } catch (error) {
        console.error("Error al cargar parámetros:", error);
    }
}

async function guardarParametros() {
    const btn = document.getElementById('btnGuardar');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Guardando...';
    btn.disabled = true;

    const payload = {
        nombre_empresa: document.getElementById('inpEmpresa').value,
        documento_empresa: document.getElementById('inpDoc').value,
        direccion: document.getElementById('inpDir').value,
        telefono: document.getElementById('inpTel').value,
        moneda: document.getElementById('inpMoneda').value,
        impuesto_nombre: document.getElementById('inpImpNombre').value,
        impuesto_porcentaje: parseFloat(document.getElementById('inpImpPorcentaje').value) || 0,
        mensaje_ticket_superior: document.getElementById('inpMsgSup').value,
        mensaje_ticket_inferior: document.getElementById('inpMsgInf').value,
        impresora_papel: document.getElementById('selPapel').value
    };

    try {
        const res = await fetch('/api/parametros', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Error al guardar');
        
        alert('✅ ¡Configuración guardada exitosamente!');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Guardar Cambios';
        btn.disabled = false;
    }
}