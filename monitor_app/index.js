// Variables globales para el monitor
let auctionTimer = null; // Timer del contador
let timeRemaining = 60; // Tiempo restante en segundos
let isAuctionActive = false; // Estado de la subasta
let currentItems = []; // Items actuales
let updateInterval = null; // Intervalo para actualizar datos

// Cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('Monitor App cargada');
    
    // Configurar event listeners
    setupEventListeners();
    
    // Cargar datos iniciales
    loadInitialData();
});

function setupEventListeners() {
    // Botones de control
    document.getElementById('start-auction-btn').addEventListener('click', startAuction);
    document.getElementById('stop-auction-btn').addEventListener('click', stopAuction);
    document.getElementById('new-auction-btn').addEventListener('click', resetForNewAuction);
}

// Cargar datos iniciales del servidor
async function loadInitialData() {
    try {
        // Cargar items
        await loadItems();
        updateStats();
    } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
    }
}

// Iniciar la subasta
async function startAuction() {
    try {
        // Enviar request al servidor para abrir la subasta
        const response = await fetch('/auction/openAll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Subasta iniciada exitosamente
            isAuctionActive = true;
            
            // Actualizar interfaz
            document.getElementById('start-auction-btn').classList.add('hidden');
            document.getElementById('stop-auction-btn').classList.remove('hidden');
            
            const statusElement = document.getElementById('auction-status');
            statusElement.textContent = '🟢 Subasta Activa';
            statusElement.classList.add('active');
            
            // Iniciar contador
            startTimer();
            
            // Iniciar actualizaciones automáticas cada segundo
            startAutoUpdates();
            
            console.log('Subasta iniciada:', data);
        } else {
            alert('Error al iniciar subasta: ' + data.error);
        }
    } catch (error) {
        console.error('Error al iniciar subasta:', error);
        alert('Error de conexión al iniciar subasta');
    }
}

// Parar la subasta manualmente
async function stopAuction() {
    if (confirm('¿Estás seguro de que quieres finalizar la subasta?')) {
        await endAuction();
    }
}

// Finalizar la subasta (automático o manual)
async function endAuction() {
    try {
        // Enviar request al servidor para cerrar la subasta
        const response = await fetch('/auction/closeAll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Subasta finalizada exitosamente
            isAuctionActive = false;
            
            // Parar timer y actualizaciones
            stopTimer();
            stopAutoUpdates();
            
            // Actualizar interfaz
            document.getElementById('stop-auction-btn').classList.add('hidden');
            
            const statusElement = document.getElementById('auction-status');
            statusElement.textContent = '🔴 Subasta Finalizada';
            statusElement.classList.remove('active');
            
            // Mostrar resultados
            showResults(data.results);
            
            console.log('Subasta finalizada:', data);
        } else {
            alert('Error al finalizar subasta: ' + data.error);
        }
    } catch (error) {
        console.error('Error al finalizar subasta:', error);
        alert('Error de conexión al finalizar subasta');
    }
}

// Iniciar el contador de tiempo
function startTimer() {
    timeRemaining = 60; // Resetear a 60 segundos
    updateTimerDisplay();
    
    auctionTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        // Cambiar estilos según el tiempo restante
        const timerElement = document.getElementById('timer');
        if (timeRemaining <= 10) {
            timerElement.classList.add('critical');
        } else if (timeRemaining <= 20) {
            timerElement.classList.add('warning');
        }
        
        // Cuando se acaba el tiempo
        if (timeRemaining <= 0) {
            endAuction();
        }
    }, 1000);
}

// Parar el contador
function stopTimer() {
    if (auctionTimer) {
        clearInterval(auctionTimer);
        auctionTimer = null;
    }
}

// Actualizar la pantalla del timer
function updateTimerDisplay() {
    document.getElementById('timer').textContent = timeRemaining;
}

// Iniciar actualizaciones automáticas
function startAutoUpdates() {
    updateInterval = setInterval(() => {
        loadItems();
        updateStats();
    }, 1000); // Actualizar cada segundo
}

// Parar actualizaciones automáticas
function stopAutoUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// Cargar items desde el servidor
async function loadItems() {
    try {
        const response = await fetch('/items?sort=highestBid');
        
        if (response.ok) {
            const newItems = await response.json();
            
            // Verificar si hay cambios para animaciones
            const hasChanges = checkForChanges(newItems);
            
            currentItems = newItems;
            displayItems();
            
            // Si hay cambios, actualizar estadísticas
            if (hasChanges) {
                updateStats();
            }
        } else {
            console.error('Error al cargar items');
        }
    } catch (error) {
        console.error('Error al cargar items:', error);
    }
}

// Verificar si hay cambios en las pujas
function checkForChanges(newItems) {
    if (currentItems.length !== newItems.length) return true;
    
    for (let i = 0; i < newItems.length; i++) {
        const oldItem = currentItems.find(item => item.id === newItems[i].id);
        if (!oldItem || oldItem.highestBid !== newItems[i].highestBid) {
            return true;
        }
    }
    return false;
}

// Mostrar items en la tabla
function displayItems() {
    const tbody = document.getElementById('items-tbody');
    
    if (currentItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay items disponibles</td></tr>';
        return;
    }
    
    tbody.innerHTML = currentItems.map(item => {
        const hasLeader = item.highestBidder && item.highestBidder !== null;
        const statusClass = item.sold ? 'status-sold' : (hasLeader ? 'status-active' : 'status-no-bids');
        const statusText = item.sold ? 'Vendido' : (hasLeader ? 'En Puja' : 'Sin Pujas');
        
        return `
            <tr>
                <td class="item-name">⚔️ ${item.name}</td>
                <td class="price">${item.basePrice} monedas</td>
                <td class="highest-bid">${item.highestBid} monedas</td>
                <td class="leader">${hasLeader ? '👑 ' + item.highestBidder : '👻 Nadie'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

// Actualizar estadísticas
function updateStats() {
    const totalItems = currentItems.length;
    const itemsWithBids = currentItems.filter(item => item.highestBidder).length;
    const totalValue = currentItems.reduce((sum, item) => sum + item.highestBid, 0);
    
    document.getElementById('total-items').textContent = totalItems;
    document.getElementById('items-with-bids').textContent = itemsWithBids;
    document.getElementById('total-value').textContent = totalValue;
}

// Mostrar resultados finales
function showResults(results) {
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<p style="text-align: center; font-size: 1.2rem;">No se vendió ningún objeto en esta subasta.</p>';
    } else {
        resultsContainer.innerHTML = results.map(result => `
            <div class="result-item">
                <div class="result-info">
                    <div class="result-item-name">⚔️ ${result.item}</div>
                    <div class="result-winner">🏆 Ganador: ${result.winner}</div>
                </div>
                <div class="result-price">💰 ${result.finalBid} monedas</div>
            </div>
        `).join('');
    }
    
    // Mostrar la sección de resultados
    resultsSection.classList.remove('hidden');
    
    // Scroll hacia los resultados
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Resetear para una nueva subasta
function resetForNewAuction() {
    if (confirm('¿Estás seguro de que quieres comenzar una nueva subasta? Esto reiniciará todos los datos.')) {
        // Ocultar resultados
        document.getElementById('results-section').classList.add('hidden');
        
        // Mostrar botón de inicio
        document.getElementById('start-auction-btn').classList.remove('hidden');
        
        // Resetear status
        const statusElement = document.getElementById('auction-status');
        statusElement.textContent = '📴 Subasta Cerrada';
        statusElement.classList.remove('active');
        
        // Resetear timer
        timeRemaining = 60;
        document.getElementById('timer').textContent = '60';
        document.getElementById('timer').className = 'timer'; // Quitar clases de warning/critical
        
        // Recargar items
        loadItems();
        
        console.log('Preparado para nueva subasta');
    }
}

// Cargar datos cada 5 segundos cuando no hay subasta activa
setInterval(() => {
    if (!isAuctionActive) {
        loadItems();
        updateStats();
    }
}, 5000);