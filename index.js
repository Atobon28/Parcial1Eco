const express = require("express")
const path = require("path")
const cors = require("cors")
const db = require("./db-util")

const app = express()

// Middleware basico
app.use(cors())
app.use(express.json())

// Servir archivos estaaticos para las dos apps
app.use("/players_app", express.static(path.join(__dirname, "players_app"))) 
app.use("/monitor_app", express.static(path.join(__dirname, "monitor_app")))

// Ruta principal básica
app.get("/", (req, res) => {
  res.send(`
    <h1>Servidor de Subastas</h1>
    <p><a href="/players_app">Players App</a></p>
    <p><a href="/monitor_app">Monitor App</a></p>
  `)
})

// ENDPOINT: Registrar usuario
app.post("/users/register", (req, res) => {
  const { name } = req.body
  
  // Validar nombre
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "el nombre es obligatorio" })
  }
  
  const users = db.load("users")
  
  // Verificar que el nombre no exista
  const existingUser = users.find(user => user.name === name.trim())
  if (existingUser) {
    return res.status(409).json({ error: "el nombre de usuario ya existe" })
  }
  
  // Crear nuevo usuario con balance inicial
  const newUser = {
    id: users.length + 1,
    name: name.trim(),
    balance: 1000,
    bids: []
  }
  
  db.add("users", newUser)
  console.log(`Usuario registrado: ${newUser.name}`)
  
  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    balance: newUser.balance
  })
})

// ENDPOINT: Obtener información de usuario
app.get("/users/:id", (req, res) => {
  const userId = parseInt(req.params.id)
  const users = db.load("users")
  
  const user = users.find(u => u.id === userId)
  if (!user) {
    return res.status(404).json({ error: "usuario no encontrado" })
  }
  
  // Calcular balance disponible (balance - dinero reservado en pujas)
  const items = db.load("items")
  let reservedAmount = 0
  
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

// ENDPOINT: Obtener lista de items
app.get("/items", (req, res) => {
  try {
    let items = db.load("items")
    
    // Ordenar por puja más alta si se solicita
    if (req.query.sort === "highestBid") {
      items = items.sort((a, b) => b.highestBid - a.highestBid)
    }
    
    res.json(items)
  } catch (error) {
    console.error("Error al obtener items:", error)
    res.status(500).json({ error: "error del servidor al obtener los items" })
  }
})

// ENDPOINT: Hacer puja en un item
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
  
  // Guardar cambios
  db.save("items", items)
  
  // Agregar puja al historial del usuario
  const userIndex = users.findIndex(u => u.id === userId)
  users[userIndex].bids.push({
    itemId: itemId,
    amount: amount
  })
  db.save("users", users)
  
  console.log(`Puja exitosa: ${user.name} lidera ${item.name} con ${amount}`)
  
  res.json({
    itemId: itemId,
    highestBid: amount,
    highestBidder: user.name
  })
})

// ENDPOINT: Abrir subasta
app.post("/auction/openAll", (req, res) => {
  const auction = db.load("auction")
  
  if (auction.isOpen) {
    return res.status(400).json({ error: "la subasta ya está abierta" })
  }
  
  try {
    auction.isOpen = true
    auction.startTime = new Date().toISOString()
    
    db.save("auction", auction)
    console.log(`Subasta abierta: ${auction.startTime}`)
    
    res.json({
      auction: "abierta",
      startTime: auction.startTime
    })
  } catch (error) {
    console.error("Error al abrir subasta:", error)
    res.status(500).json({ error: "no se pudo abrir la subasta" })
  }
})

// ENDPOINT: Cerrar subasta
app.post("/auction/closeAll", (req, res) => {
  const auction = db.load("auction")
  
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
    
    console.log("Procesando resultados de la subasta...")
    
    // Marcar items como vendidos y descontar dinero
    items.forEach(item => {
      if (item.highestBidder) {
        item.sold = true
        
        // Descontar dinero del ganador
        const winnerIndex = users.findIndex(u => u.name === item.highestBidder)
        if (winnerIndex !== -1) {
          users[winnerIndex].balance -= item.highestBid
          console.log(`${item.highestBidder} pago ${item.highestBid} por ${item.name}`)
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
    
    console.log(`Subasta cerrada. ${results.length} items vendidos`)
    
    res.json({
      auction: "cerrada",
      results: results
    })
  } catch (error) {
    console.error("Error al cerrar subasta:", error)
    res.status(500).json({ error: "no se pudo cerrar la subasta" })
  }
})

// Endpoint básico de usuarios (para compatibilidad)
app.get("/users", (req, res) => {
  let users = db.load("users")
  
  if (!Array.isArray(users)) {
    users = []
  }
  
  res.status(200).send(users)
})

// Iniciar servidor
const PORT = 5080
app.listen(PORT, () => {
  console.log("=".repeat(40))
  console.log("Servidor de Subastas Iniciado")
  console.log("=".repeat(40))
  console.log(`Players: http://localhost:${PORT}/players_app`)
  console.log(`Monitor: http://localhost:${PORT}/monitor_app`)
  console.log("=".repeat(40))
})