const express = require("express")
const path = require("path")
const db = require("./db-util")

const app = express()

// Middleware para poder manejar JSON en las requests
app.use(express.json())

// Servir las aplicaciones estáticas (HTML, CSS, JS)
app.use("/players-app", express.static(path.join(__dirname, "players_app"))) 
app.use("/monitor-app", express.static(path.join(__dirname, "monitor_app")))

// ===== ENDPOINTS PARA LA APLICACIÓN DE SUBASTAS =====

// 1. REGISTRO DE USUARIOS (para players_app)
app.post("/users/register", (req, res) => {
  const { name } = req.body
  
  // Validación: el nombre es obligatorio
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "el nombre es obligatorio" })
  }
  
  // Cargar usuarios existentes
  const users = db.load("users")
  
  // Validación: el nombre no debe existir ya
  const existingUser = users.find(user => user.name === name.trim())
  if (existingUser) {
    return res.status(409).json({ error: "el nombre de usuario ya existe" })
  }
  
  // Crear nuevo usuario con balance inicial de 1000
  const newUser = {
    id: users.length + 1, // ID simple incremental
    name: name.trim(),
    balance: 1000,
    bids: [] // Array para guardar las pujas del usuario
  }
  
  // Guardar el nuevo usuario
  db.add("users", newUser)
  
  // Responder con la info del usuario
  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    balance: newUser.balance
  })
})

// 2. OBTENER INFORMACIÓN DE UN USUARIO ESPECÍFICO
app.get("/users/:id", (req, res) => {
  const userId = parseInt(req.params.id)
  const users = db.load("users")
  
  const user = users.find(u => u.id === userId)
  if (!user) {
    return res.status(404).json({ error: "usuario no encontrado" })
  }
  
  // Calcular balance disponible (balance inicial - dinero reservado en pujas activas)
  const items = db.load("items")
  let reservedAmount = 0
  
  // Buscar en qué items este usuario es el mejor postor
  items.forEach(item => {
    if (item.highestBidder === user.name) {
      reservedAmount += item.highestBid
    }
  })
  
  const availableBalance = user.balance - reservedAmount
  
  res.json({
    id: user.id,
    name: user.name,
    balance: availableBalance,
    bids: user.bids
  })
})

// 3. OBTENER LISTA DE ITEMS (para ambas apps)
app.get("/items", (req, res) => {
  try {
    let items = db.load("items")
    
    // Si piden ordenar por puja más alta (de mayor a menor)
    if (req.query.sort === "highestBid") {
      items = items.sort((a, b) => b.highestBid - a.highestBid)
    }
    
    res.json(items)
  } catch (error) {
    res.status(500).json({ error: "error del servidor al obtener los items" })
  }
})

// 4. HACER PUJA EN UN ITEM
app.post("/items/:id/bid", (req, res) => {
  const itemId = parseInt(req.params.id)
  const { userId, amount } = req.body
  
  // Verificar que la subasta esté abierta
  const auction = db.load("auction")
  if (!auction.isOpen) {
    return res.status(403).json({ error: "la subasta está cerrada" })
  }
  
  // Verificar que el item existe
  const items = db.load("items")
  const itemIndex = items.findIndex(item => item.id === itemId)
  if (itemIndex === -1) {
    return res.status(404).json({ error: "item no encontrado" })
  }
  
  // Verificar que el usuario existe
  const users = db.load("users")
  const user = users.find(u => u.id === userId)
  if (!user) {
    return res.status(404).json({ error: "usuario no encontrado" })
  }
  
  const item = items[itemIndex]
  
  // Verificar que la puja sea mayor a la actual
  if (amount <= item.highestBid) {
    return res.status(400).json({ error: "la oferta debe ser mayor a la actual" })
  }
  
  // Calcular dinero disponible del usuario
  let reservedAmount = 0
  items.forEach(i => {
    if (i.highestBidder === user.name && i.id !== itemId) {
      reservedAmount += i.highestBid
    }
  })
  const availableBalance = user.balance - reservedAmount
  
  // Verificar que tenga saldo suficiente
  if (amount > availableBalance) {
    return res.status(400).json({ error: "saldo insuficiente" })
  }
  
  // Actualizar el item con la nueva puja
  items[itemIndex].highestBid = amount
  items[itemIndex].highestBidder = user.name
  
  // Guardar los cambios
  db.save("items", items)
  
  // Agregar la puja al historial del usuario
  const userIndex = users.findIndex(u => u.id === userId)
  users[userIndex].bids.push({
    itemId: itemId,
    amount: amount
  })
  db.save("users", users)
  
  // Responder con la información actualizada
  res.json({
    itemId: itemId,
    highestBid: amount,
    highestBidder: user.name
  })
})

// 5. ABRIR LA SUBASTA (para monitor_app)
app.post("/auction/openAll", (req, res) => {
  const auction = db.load("auction")
  
  // Verificar que no esté ya abierta
  if (auction.isOpen) {
    return res.status(400).json({ error: "la subasta ya está abierta" })
  }
  
  try {
    // Abrir la subasta
    auction.isOpen = true
    auction.startTime = new Date().toISOString()
    
    db.save("auction", auction)
    
    res.json({
      auction: "abierta",
      startTime: auction.startTime
    })
  } catch (error) {
    res.status(500).json({ error: "no se pudo abrir la subasta" })
  }
})

// 6. CERRAR LA SUBASTA (para monitor_app)
app.post("/auction/closeAll", (req, res) => {
  const auction = db.load("auction")
  
  // Verificar que esté abierta
  if (!auction.isOpen) {
    return res.status(400).json({ error: "la subasta ya está cerrada" })
  }
  
  try {
    // Cerrar la subasta
    auction.isOpen = false
    db.save("auction", auction)
    
    // Procesar resultados
    const items = db.load("items")
    const users = db.load("users")
    const results = []
    
    // Marcar items como vendidos y descontar dinero de ganadores
    items.forEach(item => {
      if (item.highestBidder) {
        item.sold = true
        
        // Encontrar al usuario ganador y descontar el dinero
        const winnerIndex = users.findIndex(u => u.name === item.highestBidder)
        if (winnerIndex !== -1) {
          users[winnerIndex].balance -= item.highestBid
        }
        
        results.push({
          itemId: item.id,
          item: item.name,
          winner: item.highestBidder,
          finalBid: item.highestBid
        })
      }
    })
    
    // Guardar cambios
    db.save("items", items)
    db.save("users", users)
    
    res.json({
      auction: "cerrada",
      results: results
    })
  } catch (error) {
    res.status(500).json({ error: "no se pudo cerrar la subasta" })
  }
})

// Endpoint básico que ya tenías
app.get("/users", (req, res) => {
  let users = db.load("users")
  
  // Verificar que users sea un array
  if (!Array.isArray(users)) {
    users = []
  }
  
  res.status(200).send(users)
})

// Iniciar el servidor
app.listen(5080, () => {
  console.log("🚀 Servidor corriendo en http://localhost:5080")
  console.log("📱 Players App: http://localhost:5080/players-app")
  console.log("📺 Monitor App: http://localhost:5080/monitor-app")
})