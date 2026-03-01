// app.js

// Registrar el Service Worker para que sea instalable
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('App lista para instalarse'))
            .catch(err => console.error('Error en Service Worker', err));
    });
}
const API_URL = 'http://127.0.0.1:8000'; // La ruta de tu backend

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Lógica para index.html (Cobros)
    const formPago = document.getElementById('form-pago');
    if (formPago) {
        cargarClientes();
        formPago.addEventListener('submit', registrarPago);
        
        const btnCierre = document.getElementById('btn-cierre');
        if(btnCierre) btnCierre.addEventListener('click', ejecutarCierreDia);
    }

    // 2. Lógica para cuentas.html (Lista de Cuentas)
    const listaCuentas = document.getElementById('lista-cuentas');
    if (listaCuentas) {
        cargarEstadoCuentas();
    }

    // 3. Lógica para nuevo.html (Nuevo Cliente / Nueva Junta)
    const formNuevo = document.getElementById('form-nuevo');
    if (formNuevo) {
        
        // --- NUEVO: Lógica para cambiar entre Cliente Nuevo y Existente ---
        const tipoClienteSelect = document.getElementById('tipo-cliente');
        if (tipoClienteSelect) {
            tipoClienteSelect.addEventListener('change', async (e) => {
                if (e.target.value === 'existente') {
                    // Mostrar campo de existente, ocultar el de nuevo
                    document.getElementById('div-cliente-nuevo').classList.add('oculto');
                    document.getElementById('div-cliente-existente').classList.remove('oculto');
                    
                    // Cargar los clientes de la base de datos en el combo box
                    try {
                        const res = await fetch(`${API_URL}/clientes/`);
                        const clientes = await res.json();
                        const selectExistente = document.getElementById('select-cliente-existente');
                        selectExistente.innerHTML = '<option value="" disabled selected>Elige un cliente...</option>';
                        clientes.forEach(c => { 
                            selectExistente.innerHTML += `<option value="${c.id}">${c.nombre}</option>`; 
                        });
                    } catch (error) {
                        console.error("Error al cargar clientes existentes:", error);
                    }
                } else {
                    // Mostrar campo de nuevo, ocultar el de existente
                    document.getElementById('div-cliente-nuevo').classList.remove('oculto');
                    document.getElementById('div-cliente-existente').classList.add('oculto');
                }
            });
        }
        // ------------------------------------------------------------------

        const selectMes = document.getElementById('nuevo-mes-inicio');
        if (selectMes) {
            const fechaActual = new Date();
            const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            
            // Mes actual
            const opcionActual = document.createElement('option');
            opcionActual.value = fechaActual.getMonth() + 1; // 1 a 12
            opcionActual.dataset.anio = fechaActual.getFullYear();
            opcionActual.textContent = `${nombresMeses[fechaActual.getMonth()]} ${fechaActual.getFullYear()} (Mes Actual)`;
            selectMes.appendChild(opcionActual);

            // Próximo mes
            const opcionProx = document.createElement('option');
            let proxMes = fechaActual.getMonth() + 2;
            let proxAnio = fechaActual.getFullYear();
            if(proxMes > 12) { proxMes = 1; proxAnio++; }
            opcionProx.value = proxMes;
            opcionProx.dataset.anio = proxAnio;
            opcionProx.textContent = `${nombresMeses[proxMes-1]} ${proxAnio} (Próximo Mes)`;
            selectMes.appendChild(opcionProx);

            // Detectar si selecciona el mes actual y estamos avanzados para mostrar el panel
            selectMes.addEventListener('change', verificarAtraso);
            verificarAtraso(); // Ejecutar al cargar
        }

        // Escuchar el botón de simular
        document.getElementById('btn-simular').addEventListener('click', simularJunta);
        
        // Escuchar el guardado final
        formNuevo.addEventListener('submit', guardarNuevoCliente);
    }

    // 4. Lógica para perfil.html (Calendario)
    const calendario = document.getElementById('calendario-pagos');
    if (calendario) {
        // Extraer el ID de la URL (ej. perfil.html?id=1)
        const params = new URLSearchParams(window.location.search);
        const idCliente = params.get('id');
        if (idCliente) {
            cargarPerfilCliente(idCliente);
        } else {
            alert("Cliente no encontrado");
            window.location.href = "cuentas.html";
        }
    }
});

// ==========================================
// FUNCIONES DE INDEX.HTML (COBROS)
// ==========================================
async function cargarClientes() {
    const select = document.getElementById('cliente-select');
    try {
        const response = await fetch(`${API_URL}/clientes/`);
        const clientes = await response.json();
        
        select.innerHTML = '<option value="" disabled selected>Selecciona un cliente...</option>';
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id;
            option.textContent = cliente.nombre;
            select.appendChild(option);
        });

        // NUEVO: Escuchar cuando cambia el cliente para buscar sus juntas
        select.addEventListener('change', cargarJuntasParaCobro);

    } catch (error) {
        select.innerHTML = '<option value="" disabled>Error de conexión</option>';
    }
}

// NUEVA FUNCIÓN: Dibuja las cajas de pago según las juntas que tenga el cliente
async function cargarJuntasParaCobro() {
    const clienteId = document.getElementById('cliente-select').value;
    const contenedor = document.getElementById('contenedor-juntas-cobro');
    const btn = document.getElementById('btn-registrar');

    contenedor.innerHTML = '<p style="text-align:center;">Buscando juntas activas...</p>';
    btn.classList.add('oculto');

    try {
        const res = await fetch(`${API_URL}/clientes/${clienteId}/juntas`);
        const juntas = await res.json();

        contenedor.innerHTML = '';
        if (juntas.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center; color:#d32f2f;">Este cliente no tiene juntas activas.</p>';
            return;
        }

        // Dibuja una caja por cada junta
        juntas.forEach((junta, index) => {
            contenedor.innerHTML += `
                <div class="form-group" style="background:#f1f8e9; padding:15px; border-radius:8px; border-left:5px solid #4CAF50; margin-bottom:15px;">
                    <label style="color:#2e7d32; font-size:1rem;">📌 Junta ${index + 1} (S/ ${junta.cuota_diaria.toFixed(2)} / día)</label>
                    <small style="display:block; margin-bottom:8px; color:#555;">Finaliza el: ${junta.fecha_fin}</small>
                    
                    <input type="number" class="input-cobro-junta" data-junta-id="${junta.id}" step="0.01" inputmode="decimal" placeholder="¿Cuánto dio para esta junta?" value="0">
                </div>
            `;
        });
        
        btn.classList.remove('oculto');
    } catch (error) {
        contenedor.innerHTML = '<p>Error al cargar las juntas.</p>';
    }
}

async function registrarPago(evento) {
    evento.preventDefault(); 
    
    const clienteId = document.getElementById('cliente-select').value;
    const inputs = document.querySelectorAll('.input-cobro-junta'); // Selecciona todos los inputs generados
    
    const pagos = [];
    inputs.forEach(input => {
        const monto = parseFloat(input.value);
        if (monto > 0) { // Solo enviamos los que tengan dinero
            pagos.push({
                junta_asignada_id: parseInt(input.getAttribute('data-junta-id')),
                monto: monto
            });
        }
    });

    if (pagos.length === 0) {
        alert("Debes ingresar un monto mayor a 0 en al menos una junta.");
        return;
    }

    const btn = document.getElementById('btn-registrar');
    const hoy = new Date().toISOString().split('T')[0];
    
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const response = await fetch(`${API_URL}/movimientos/pago`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente_id: parseInt(clienteId),
                fecha: hoy,
                pagos: pagos // Enviamos el array de pagos
            })
        });

        if (response.ok) {
            mostrarMensaje('¡Pagos registrados con éxito!', 'exito');
            inputs.forEach(input => input.value = "0"); // Reiniciar los campos a 0
        } else {
            mostrarMensaje('Error al registrar el pago.', 'error');
        }
    } catch (error) {
        mostrarMensaje('Error de conexión.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Registrar Pagos';
    }
}

function mostrarMensaje(texto, tipo) {
    const div = document.getElementById('mensaje-estado');
    div.textContent = texto;
    div.className = `mensaje ${tipo}`;
    setTimeout(() => { div.className = 'mensaje oculto'; }, 3000);
}

async function ejecutarCierreDia() {
    const confirmar = confirm('¿Estás segura de que ya terminaste de cobrar por hoy? Esto procesará las deudas de todos.');
    if (!confirmar) return;

    const btn = document.getElementById('btn-cierre');
    btn.disabled = true;
    btn.textContent = 'Procesando cuentas...';

    try {
        const response = await fetch(`${API_URL}/procesos/cobro-diario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            mostrarMensaje(`¡Cierre exitoso! Se procesaron ${data.cargos_generados} cuentas.`, 'exito');
        } else {
            mostrarMensaje('Error al ejecutar el cierre de día.', 'error');
        }
    } catch (error) {
        mostrarMensaje('Error de conexión con el servidor.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Ejecutar Cierre de Día';
    }
}

// ==========================================
// FUNCIONES DE CUENTAS.HTML
// ==========================================
async function cargarEstadoCuentas() {
    const lista = document.getElementById('lista-cuentas');
    try {
        const resClientes = await fetch(`${API_URL}/clientes/`);
        const clientes = await resClientes.json();

        lista.innerHTML = ''; 
        if (clientes.length === 0) {
            lista.innerHTML = '<p style="text-align:center;">Aún no hay clientes registrados.</p>';
            return;
        }

        for (const cliente of clientes) {
            const resBalance = await fetch(`${API_URL}/clientes/${cliente.id}/balance`);
            const dataBalance = await resBalance.json();
            const balance = dataBalance.balance_total;
            
            const div = document.createElement('div');
            div.className = 'card-cuenta';
            div.style.cursor = 'pointer'; 
            
            div.onclick = () => { window.location.href = `perfil.html?id=${cliente.id}`; };
            
            let claseColor = 'saldo-cero';
            let textoBalance = `S/ ${balance.toFixed(2)}`;
            let etiqueta = 'Al día';

            if (balance > 0) { claseColor = 'saldo-positivo'; etiqueta = 'A favor'; } 
            else if (balance < 0) { claseColor = 'saldo-negativo'; etiqueta = 'Deuda'; }

            div.classList.add(claseColor); 
            div.innerHTML = `
                <div class="cuenta-info">
                    <h4>${cliente.nombre}</h4>
                    <small style="color: #757575;">${etiqueta}</small>
                </div>
                <div class="cuenta-saldo ${claseColor}">${textoBalance}</div>
            `;
            lista.appendChild(div);
        }
    } catch (error) {
        console.error('Error cargando las cuentas:', error);
        lista.innerHTML = '<p class="error" style="text-align:center; color: red;">Error al conectar con el servidor.</p>';
    }
}

// ==========================================
// FUNCIONES DE NUEVO.HTML
// ==========================================
function verificarAtraso() {
    const select = document.getElementById('nuevo-mes-inicio');
    const mesSeleccionado = parseInt(select.value);
    const hoy = new Date();
    const panel = document.getElementById('panel-atraso');
    
    if (mesSeleccionado === (hoy.getMonth() + 1) && hoy.getDate() > 1) {
        const diasTarde = hoy.getDate() - 1;
        document.getElementById('span-dias-tarde').textContent = diasTarde;
        panel.classList.remove('oculto');
    } else {
        panel.classList.add('oculto');
    }
}

// FUNCIÓN DE SIMULACIÓN (Fechas exactas y Ganancia)
function simularJunta() {
    const montoTotal = parseFloat(document.getElementById('nuevo-monto').value);
    const cuotaDiaria = parseFloat(document.getElementById('nueva-cuota').value);
    const mesEntregaNum = parseInt(document.getElementById('nuevo-mes-entrega').value);
    
    const selectMes = document.getElementById('nuevo-mes-inicio');
    const mesInicio = parseInt(selectMes.value);
    const anioInicio = parseInt(selectMes.options[selectMes.selectedIndex].dataset.anio);

    if (!montoTotal || !cuotaDiaria) {
        alert("Llena el monto y la cuota."); return;
    }

    // 1. Calcular días atrasados (solo si el panel está visible)
    let diasAtrasados = 0;
    let opcionAtraso = "ninguno";
    if (!document.getElementById('panel-atraso').classList.contains('oculto')) {
        diasAtrasados = parseInt(document.getElementById('span-dias-tarde').textContent);
        opcionAtraso = document.querySelector('input[name="opcion_atraso"]:checked').value;
    }

    // ==========================================
    // CÁLCULO DE FECHAS EXACTAS
    // ==========================================
    // Fecha Fin (Último día del 5to mes)
    let mesFinal = mesInicio + 4;
    let anioFinal = anioInicio;
    if (mesFinal > 12) { mesFinal -= 12; anioFinal++; }
    
    // En JS, el "día 0" del mes siguiente nos da el último día del mes actual
    const fechaFinObj = new Date(anioFinal, mesFinal, 0); 
    const fechaFinStr = `${fechaFinObj.getDate()}/${mesFinal.toString().padStart(2, '0')}/${anioFinal}`;

    // Fecha de Desembolso (Último día del mes del turno elegido)
    let mesDes = mesInicio + (mesEntregaNum - 1);
    let anioDes = anioInicio;
    if (mesDes > 12) { mesDes -= 12; anioDes++; }
    
    const fechaDesObj = new Date(anioDes, mesDes, 0);
    const fechaDesStr = `${fechaDesObj.getDate()}/${mesDes.toString().padStart(2, '0')}/${anioDes}`;

    // ==========================================
    // CÁLCULO DE MONTOS Y GANANCIA
    // ==========================================
    let montoAEntregar = montoTotal;
    let mensajeExtra = "";

    // Asumimos 150 días como el estándar de 5 meses (5 x 30)
    let diasTotalesPago = 150; 

    if (diasAtrasados > 0) {
        if (opcionAtraso === "descuento") {
            const descuento = diasAtrasados * cuotaDiaria;
            montoAEntregar -= descuento;
            diasTotalesPago = 150 - diasAtrasados; // Pagará menos días en total
            mensajeExtra = `*Entró ${diasAtrasados} días tarde. Se le descontó S/ ${descuento.toFixed(2)} del pozo.`;
        } else {
            mensajeExtra = `*Entrará debiendo S/ ${(diasAtrasados * cuotaDiaria).toFixed(2)} para ponerse al día.`;
        }
    }

    // Calcular recaudación y ganancia
    const totalRecaudado = diasTotalesPago * cuotaDiaria;
    const ganancia = totalRecaudado - montoAEntregar;

    // ==========================================
    // MOSTRAR EN PANTALLA
    // ==========================================
    document.getElementById('sim-fecha').textContent = fechaFinStr;
    document.getElementById('sim-fecha-pago').textContent = fechaDesStr;
    document.getElementById('sim-monto-entregar').textContent = `S/ ${montoAEntregar.toFixed(2)}`;
    
    // Armar el texto de la alerta con la ganancia
    let htmlAlerta = `<span style="color: #2e7d32; font-size: 1.1rem;"><strong>Ganancia neta: S/ ${ganancia.toFixed(2)}</strong></span><br>`;
    htmlAlerta += `<span style="color: #666;">(Recaudarás aprox. S/ ${totalRecaudado.toFixed(2)} en total)</span><br>`;
    if (mensajeExtra) {
        htmlAlerta += `<span style="color: #e65100; margin-top:5px; display:block;">${mensajeExtra}</span>`;
    }

    document.getElementById('sim-alerta').innerHTML = htmlAlerta;

    document.getElementById('resultado-simulacion').classList.remove('oculto');
    document.getElementById('btn-guardar-nuevo').classList.remove('oculto');
}

async function guardarNuevoCliente(evento) {
    evento.preventDefault();

    const tipoCliente = document.getElementById('tipo-cliente').value;
    const montoTotal = parseFloat(document.getElementById('nuevo-monto').value);
    const cuotaDiaria = parseFloat(document.getElementById('nueva-cuota').value);
    const mesEntregaNum = parseInt(document.getElementById('nuevo-mes-entrega').value);
    
    const selectMes = document.getElementById('nuevo-mes-inicio');
    const mesInicio = parseInt(selectMes.value);
    const anioInicio = parseInt(selectMes.options[selectMes.selectedIndex].dataset.anio);

    let diasAtrasados = 0;
    let opcionAtraso = "ninguno";
    if (!document.getElementById('panel-atraso').classList.contains('oculto')) {
        diasAtrasados = parseInt(document.getElementById('span-dias-tarde').textContent);
        opcionAtraso = document.querySelector('input[name="opcion_atraso"]:checked').value;
    }

    // Armamos el "paquete" de datos base
    let payload = {
        monto_total: montoTotal,
        cuota_diaria: cuotaDiaria,
        mes_desembolso_num: mesEntregaNum,
        mes_inicio: mesInicio,
        anio_inicio: anioInicio,
        dias_atrasados: diasAtrasados,
        opcion_atraso: opcionAtraso
    };

    // Le agregamos el Nombre o el ID dependiendo de lo que eligió tu mamá
    if (tipoCliente === 'nuevo') {
        const nombre = document.getElementById('nuevo-nombre').value;
        if (!nombre) { alert("Ingresa el nombre del cliente."); return; }
        payload.nombre_cliente = nombre;
    } else {
        const id = document.getElementById('select-cliente-existente').value;
        if (!id) { alert("Selecciona el cliente de la lista."); return; }
        payload.cliente_id = parseInt(id);
    }

    const btn = document.getElementById('btn-guardar-nuevo');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const response = await fetch(`${API_URL}/clientes/nueva-junta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            document.getElementById('mensaje-estado-nuevo').className = 'mensaje exito';
            document.getElementById('mensaje-estado-nuevo').textContent = '¡Trato guardado!';
            setTimeout(() => window.location.href = 'index.html', 2000);
        } else {
            alert("Error al guardar en el servidor.");
        }
    } catch (error) {
        alert("Error de conexión.");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar y Guardar';
    }
}

// ==========================================
// FUNCIONES DE PERFIL.HTML
// ==========================================
let movimientosGlobales = []; // Guardaremos los movimientos para filtrarlos rápido

async function cargarPerfilCliente(id) {
    try {
        // 1. Balance Global
        const resBalance = await fetch(`${API_URL}/clientes/${id}/balance`);
        const dataBalance = await resBalance.json();
        
        document.getElementById('nombre-perfil').textContent = dataBalance.cliente;
        const balanceDiv = document.getElementById('balance-perfil');
        const estadoDiv = document.getElementById('estado-perfil');
        
        balanceDiv.textContent = `S/ ${dataBalance.balance_total.toFixed(2)}`;
        if (dataBalance.balance_total > 0) {
            balanceDiv.style.color = '#2e7d32'; estadoDiv.textContent = 'Saldo a Favor'; estadoDiv.style.color = '#2e7d32';
        } else if (dataBalance.balance_total < 0) {
            balanceDiv.style.color = '#c62828'; estadoDiv.textContent = 'Deuda Pendiente'; estadoDiv.style.color = '#c62828';
        } else {
            estadoDiv.textContent = 'Al día';
        }

        // 2. Obtener Juntas Activas y Llenar el Selector
        const resJuntas = await fetch(`${API_URL}/clientes/${id}/juntas`);
        const juntas = await resJuntas.json();
        
        const contenedorJuntas = document.getElementById('lista-juntas-perfil');
        const selectorJuntas = document.getElementById('selector-junta-perfil');
        
        contenedorJuntas.innerHTML = '';
        selectorJuntas.innerHTML = '<option value="" disabled selected>Selecciona una junta...</option>';
        
        if(juntas.length === 0) {
            contenedorJuntas.innerHTML = '<p>No tiene juntas activas.</p>';
            selectorJuntas.innerHTML = '<option value="" disabled>No hay juntas</option>';
        } else {
            juntas.forEach((j, index) => {
                // Listado visual
                contenedorJuntas.innerHTML += `
                    <div class="junta-item">
                        <strong>Junta ${index + 1} - Cuota: S/ ${j.cuota_diaria.toFixed(2)} diarios</strong><br>
                        <small>Inició: ${j.fecha_inicio} | Finaliza: ${j.fecha_fin}</small>
                    </div>
                `;
                
                // Opciones para el combo box del calendario
                const opcion = document.createElement('option');
                opcion.value = j.id;
                opcion.textContent = `Junta ${index + 1} (S/ ${j.cuota_diaria.toFixed(2)} diarios)`;
                selectorJuntas.appendChild(opcion);
            });
        }

        // 3. Obtener TODOS los movimientos y guardarlos
        const resMovimientos = await fetch(`${API_URL}/clientes/${id}/movimientos`);
        movimientosGlobales = await resMovimientos.json();

        // 4. Escuchar cuando tu mamá cambie de junta en el selector
        selectorJuntas.addEventListener('change', (e) => {
            const idJuntaSeleccionada = parseInt(e.target.value);
            filtrarYdibujarCalendario(idJuntaSeleccionada);
        });

    } catch (error) {
        console.error("Error al cargar perfil:", error);
    }
}

// FUNCIÓN: Filtra los movimientos de la junta seleccionada y dibuja
function filtrarYdibujarCalendario(idJunta) {
    const contenedor = document.getElementById('calendario-pagos');
    contenedor.innerHTML = '';

    // Filtramos solo los movimientos de la junta que eligió tu mamá
    const movimientosFiltrados = movimientosGlobales.filter(mov => mov.junta_asignada_id === idJunta);

    const balancePorDia = {};
    
    movimientosFiltrados.forEach(mov => {
        const fecha = mov.fecha;
        if (!balancePorDia[fecha]) { balancePorDia[fecha] = { pagos: 0, cargos: 0 }; }
        if (mov.monto > 0) balancePorDia[fecha].pagos += mov.monto;
        if (mov.monto < 0) balancePorDia[fecha].cargos += Math.abs(mov.monto); 
    });

    // Dibujar el mes actual (Marzo 2026, dado que hoy es 1 de Marzo)
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    const diasDelMes = new Date(anioActual, mesActual, 0).getDate();

    for (let dia = 1; dia <= diasDelMes; dia++) {
        const diaStr = dia < 10 ? `0${dia}` : dia;
        const mesStr = mesActual < 10 ? `0${mesActual}` : mesActual;
        const fechaString = `${anioActual}-${mesStr}-${diaStr}`;
        
        const divDia = document.createElement('div');
        divDia.className = 'dia-calendario';
        
        let htmlContenido = `<span class="dia-numero">${dia}</span>`;
        
        if (balancePorDia[fechaString]) {
            const dataDia = balancePorDia[fechaString];
            if (dataDia.pagos > 0) {
                divDia.classList.add('dia-pagado');
                htmlContenido += `<span class="dia-monto">+${dataDia.pagos}</span>`;
            } else if (dataDia.cargos > 0 && dataDia.pagos === 0) {
                divDia.classList.add('dia-deuda');
                htmlContenido += `<span class="dia-monto">Debe</span>`;
            }
        } else {
            divDia.classList.add('dia-vacio');
        }
        
        divDia.innerHTML = htmlContenido;
        contenedor.appendChild(divDia);
    }
}