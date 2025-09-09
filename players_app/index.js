// Variables para manejar el estado del jugador
let currentPlayer = null;
let currentItems = [];
let selectedItem = null;

// Cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

function setupEventListeners() {
    // Botón de registro
    document.getElementById('register-btn').addEventListener('click', registerPlayer);
    
    // Enter en el campo de nombre
    document.getElementById('player-name').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            registerPlayer();
        }
    });
    
    // Botones de actualización
    document.getElementById('refresh-balance-btn').addEventListener('click', updatePlayerBalance);
    document.getElementById('refresh-items-btn').addEventListener('click', loadItems);
    
    // Botones del modal
    document.getElementById('submit-bid-btn').addEventListener('click', submitBid);
    document.getElementById('cancel-bid-btn').addEventListener('click', closeBidModal);
    
    // Enter en el campo de puja
    document.getElementById('bid-amount').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitBid();
        }
    });
}

// Registrar nuevo jugador
async function registerPlayer() {
    const nameInput = document.getElementById('player-name');
    const playerName = nameInput.value.trim();
    
    if (!playerName) {
        showMessage('Por favor ingresa tu nombre', 'error');
        return;
    }
    
    try {
        const response = await fetch('/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: playerName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentPlayer = data;
            showPlayerSection();
            loadItems();
            showMessage(`Bienvenido ${data.name}! Tienes ${data.balance} monedas`, 'success');
        } else {
            showMessage(data.error || 'Error al registrarse', 'error');
        }
    } catch (error) {
        console.error('Error al registrar:', error);
        showMessage('Error de conexión al servidor', 'error');
    }
}

// Mostrar sección del jugador
function showPlayerSection() {
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('player-section').classList.remove('hidden');
    
    document.getElementById('player-name-display').textContent = currentPlayer.name;
    document.getElementById('balance-amount').textContent = currentPlayer.balance;
}

// Cargar lista de items
async function loadItems() {
    try {
        const response = await fetch('/items?sort=highestBid');
        
        if (response.ok) {
            currentItems = await response.json();
            displayItems();
        } else {
            showMessage('Error al cargar los items', 'error');
        }
    } catch (error) {
        console.error('Error al cargar items:', error);
        showMessage('Error de conexión al cargar items', 'error');
    }
}

// Mostrar items en la pantalla
function displayItems() {
    const container = document.getElementById('items-container');
    
    if (currentItems.length === 0) {
        container.innerHTML = '<p class="info">No hay items disponibles</p>';
        return;
    }
    
    container.innerHTML = currentItems.map(item => `
        <div class="item-card">
            <div class="item-name">${item.name}</div>
            <div class="item-price">Precio base: ${item.basePrice} monedas</div>
            <div class="item-price">Puja actual: ${item.highestBid} monedas</div>
            <div class="item-leader">
                Líder: ${item.highestBidder || 'Nadie aún'}
            </div>
            <button class="bid-btn" onclick="openBidModal(${item.id})">
                Hacer Puja
            </button>
        </div>
    `).join('');
}

// Abrir modal para hacer puja
function openBidModal(itemId) {
    selectedItem = currentItems.find(item => item.id === itemId);
    
    if (!selectedItem) {
        showMessage('Item no encontrado', 'error');
        return;
    }
    
    document.getElementById('bid-item-name').textContent = selectedItem.name;
    document.getElementById('current-bid').textContent = selectedItem.highestBid;
    document.getElementById('bid-amount').value = '';
    document.getElementById('bid-amount').min = selectedItem.highestBid + 1;
    document.getElementById('bid-error').classList.add('hidden');
    
    document.getElementById('bid-modal').classList.remove('hidden');
    document.getElementById('bid-amount').focus();
}

// Cerrar modal de puja
function closeBidModal() {
    document.getElementById('bid-modal').classList.add('hidden');
    selectedItem = null;
}

// Enviar puja al servidor
async function submitBid() {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidAmount = parseInt(bidAmountInput.value);
    
    if (!bidAmount || bidAmount <= selectedItem.highestBid) {
        showBidError('La puja debe ser mayor a la actual');
        return;
    }
    
    try {
        const response = await fetch(`/items/${selectedItem.id}/bid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentPlayer.id,
                amount: bidAmount
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage(`Puja exitosa! Ahora lideras ${selectedItem.name} con ${bidAmount} monedas`, 'success');
            closeBidModal();
            loadItems();
            updatePlayerBalance();
        } else {
            showBidError(data.error || 'Error al hacer la puja');
        }
    } catch (error) {
        console.error('Error al hacer puja:', error);
        showBidError('Error de conexión al servidor');
    }
}

// Actualizar balance del jugador
async function updatePlayerBalance() {
    if (!currentPlayer) return;
    
    try {
        const response = await fetch(`/users/${currentPlayer.id}`);
        
        if (response.ok) {
            const userData = await response.json();
            document.getElementById('balance-amount').textContent = userData.balance;
        }
    } catch (error) {
        console.error('Error al actualizar balance:', error);
    }
}

// Mostrar error en el modal
function showBidError(message) {
    const errorElement = document.getElementById('bid-error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

// Mostrar mensajes en pantalla
function showMessage(message, type = 'success') {
    const messagesContainer = document.getElementById('messages');
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message;
    
    messagesContainer.appendChild(messageElement);
    
    // Quitar mensaje después de 4 segundos
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
        }
    }, 4000);
}

// Auto-actualizar cada 5 segundos
setInterval(() => {
    if (currentPlayer) {
        loadItems();
        updatePlayerBalance();
    }
}, 5000);