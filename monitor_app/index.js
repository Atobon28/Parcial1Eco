// Variables globales para el monitor
let auctionTimer = null;
let timeRemaining = 60;
let isAuctionActive = false;
let currentItems = [];
let updateInterval = null;

// Cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadInitialData();
});

function setupEventListeners() {
    // Botones de control
    document.getElementById('start-auction-btn').addEventListener('click', startAuction);
    document.getElementById('stop-auction-btn').addEventListener('click', stopAuction);
    document.getElementById('new-auction-btn').addEventListener('click', resetForNewAuction);
}

// Cargar datos iniciales
async function loadInitialData() {
    try {
        await loadItems();
        updateStats();
    } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
    }
}

// Iniciar subasta
async function startAuction() {
    try {
        const response = await fetch('/auction/openAll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            isAuctionActive = true;
            
            document.getElementById('start-auction-btn').classList.add('hidden');
            document.getElementById('stop-auction-btn').classList.remove('hidden');
            
            const statusElement = document.getElementById('auction-status');
            statusElement.textContent = 'Subasta Activa';
            statusElement.classList.add('active');
            
            // Iniciar contador y actualizaciones
            startTimer();
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

// Parar subasta manualmente
async function stopAuction() {
    if (confirm('¿Estás seguro de que quieres finalizar la subasta?')) {
        await endAuction();
    }
}

// Finalizar subasta
async function endAuction() {
    try {
        const response = await fetch('/auction/closeAll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            isAuctionActive = false;
            
            // Parar timer y actualizaciones
            stopTimer();
            stopAutoUpdates();
            
            // Actualizar interfaz
            document.getElementById('stop-auction-btn').classList.add('hidden');
            
            const statusElement = document.getElementById('auction-status');
            statusElement.textContent = 'Subasta Finalizada';
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

// Iniciar contador de tiempo
function startTimer() {
    timeRemaining = 60;
    updateTimerDisplay();
    
    auctionTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        // Cambiar estilos según tiempo restante
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

// Parar contador
function stopTimer() {
    if (auctionTimer) {
        clearInterval(auctionTimer);
        auctionTimer = null;
    }
}

// Actualizar pantalla del timer
function updateTimerDisplay() {
    document.getElementById('timer').textContent = timeRemaining;
}

// Iniciar actualizaciones automáticas
function startAutoUpdates() {
    updateInterval = setInterval(() => {
        loadItems();
        updateStats();
    }, 1000);
}

// Parar actualizaciones automáticas
function stopAutoUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// Cargar items del servidor
async function loadItems() {
    try {
        const response = await fetch('/items?sort=highestBid');
        
        if (response.ok) {
            const newItems = await response.json();
            const hasChanges = checkForChanges(newItems);
            
            currentItems = newItems;
            displayItems();
            
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

// Verificar cambios en pujas
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
                <td class="item-name">${item.name}</td>
                <td class="price">${item.basePrice} monedas</td>
                <td class="highest-bid">${item.highestBid} monedas</td>
                <td class="leader">${hasLeader ? item.highestBidder : 'Nadie'}</td>
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
                    <div class="result-item-name">${result.item}</div>
                    <div class="result-winner">Ganador: ${result.winner}</div>
                </div>
                <div class="result-price">${result.finalBid} monedas</div>
            </div>
        `).join('');
    }
    
    // Mostrar sección de resultados
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Resetear para nueva subasta
function resetForNewAuction() {
    if (confirm('¿Estás seguro de que quieres comenzar una nueva subasta? Esto reiniciará todos los datos.')) {
        // Ocultar resultados
        document.getElementById('results-section').classList.add('hidden');
        
        // Mostrar botón de inicio
        document.getElementById('start-auction-btn').classList.remove('hidden');
        
        // Resetear status
        const statusElement = document.getElementById('auction-status');
        statusElement.textContent = 'Subasta Cerrada';
        statusElement.classList.remove('active');
        
        // Resetear timer
        timeRemaining = 60;
        document.getElementById('timer').textContent = '60';
        document.getElementById('timer').className = 'timer';
        
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