const express = require("express")
const path = require("path")
const db = require("./db-util")

const app = express()

// Middleware básico - solo necesitamos JSON parser
app.use(express.json())

// Servir archivos estáticos para las dos apps
// Esto hace que podamos acceder a nuestros HTML, CSS y JS desde el navegador
app.use("/players_app", express.static(path.join(__dirname, "players_app"))) 
app.use("/monitor_app", express.static(path.join(__dirname, "monitor_app")))

// Ruta principal básica - página de inicio
app.get("/", (req, res) => {
  res.send(`
    <h1>Servidor de Subastas</h1>
    <p><a href="/players_app">Players App</a></p>
    <p><a href="/monitor_app">Monitor App</a></p>
  `)
})

// ENDPOINT: Registrar usuario
// Este endpoint permite que los jugadores se registren con solo su nombre
app.post("/users/register", (req, res) => {
  const { name } = req.body
  
  // Validar que el nombre no esté vacío
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "el nombre es obligatorio" })
  }
  
  const users = db.load("users")
  
  // Verificar que el nombre no exista ya (no puede haber nombres duplicados)
  const existingUser = users.find(user => user.name === name.trim())
  if (existingUser) {
    return res.status(409).json({ error: "el nombre de usuario ya existe" })
  }
  
  // Crear nuevo usuario con balance inicial de 1000 monedas
  const newUser = {
    id: users.length + 1,
    name: name.trim(),
    balance: 1000, // Balance inicial según las reglas del juego
    bids: [] // Historial de pujas del usuario
  }
  
  // Guardar el nuevo usuario en la base de datos
  db.add("users", newUser)
  console.log(`Usuario registrado: ${newUser.name}`)
  
  // Responder con la información del usuario (sin el historial de pujas)
  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    balance: newUser.balance
  })
})

// ENDPOINT: Obtener información de usuario
// Esto permite ver el balance disponible del usuario
app.get("/users/:id", (req, res) => {
  const userId = parseInt(req.params.id)
  const users = db.load("users")
  
  // Buscar el usuario por ID
  const user = users.find(u => u.id === userId)
  if (!user) {
    return res.status(404).json({ error: "usuario no encontrado" })
  }
  
  // Calcular balance disponible (balance total - dinero reservado en pujas activas)
  const items = db.load("items")
  let reservedAmount = 0
  
  // Sumar todo el dinero que tiene reservado en items donde es el líder
  items.forEach(item => {
    if (item.highestBidder === user.name) {
      reservedAmount += item.highestBid
    }
  })
  
  // El balance disponible es lo que tiene menos lo que tiene reservado
  const availableBalance = user.balance - reservedAmount
  
  res.json({
    id: user.id,
    name: user.name,
    balance: availableBalance, // Balance que puede usar para nuevas pujas
    bids: user.bids
  })
})

// ENDPOINT: Obtener lista de items
// Permite ver todos los productos disponibles para pujar
app.get("/items", (req, res) => {
  try {
    let items = db.load("items")
    
    // Si se solicita ordenar por puja más alta, lo hacemos
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
// Este es el corazón del juego - permite a los usuarios pujar por items
app.post("/items/:id/bid", (req, res) => {
  const itemId = parseInt(req.params.id)
  const { userId, amount } = req.body
  
  // VALIDACIÓN 1: Verificar que la subasta esté abierta
  const auction = db.load("auction")
  if (!auction.isOpen) {
    return res.status(403).json({ error: "la subasta está cerrada" })
  }
  
  // VALIDACIÓN 2: Verificar que el item existe
  const items = db.load("items")
  const itemIndex = items.findIndex(item => item.id === itemId)
  if (itemIndex === -1) {
    return res.status(404).json({ error: "item no encontrado" })
  }
  
  // VALIDACIÓN 3: Verificar que el usuario existe
  const users = db.load("users")
  const user = users.find(u => u.id === userId)
  if (!user) {
    return res.status(404).json({ error: "usuario no encontrado" })
  }
  
  const item = items[itemIndex]
  
  // VALIDACIÓN 4: Verificar que la puja sea mayor a la actual
  if (amount <= item.highestBid) {
    return res.status(400).json({ error: "la oferta debe ser mayor a la actual" })
  }
  
  // VALIDACIÓN 5: Calcular dinero disponible del usuario
  let reservedAmount = 0
  items.forEach(i => {
    // Sumar reservas en otros items (no en este que estamos pujando)
    if (i.highestBidder === user.name && i.id !== itemId) {
      reservedAmount += i.highestBid
    }
  })
  const availableBalance = user.balance - reservedAmount
  
  // VALIDACIÓN 6: Verificar que tenga saldo suficiente
  if (amount > availableBalance) {
    return res.status(400).json({ error: "saldo insuficiente" })
  }
  
  // TODO ESTÁ BIEN - Actualizar el item con la nueva puja
  items[itemIndex].highestBid = amount
  items[itemIndex].highestBidder = user.name
  
  // Guardar cambios en la base de datos
  db.save("items", items)
  
  // Agregar puja al historial del usuario
  const userIndex = users.findIndex(u => u.id === userId)
  users[userIndex].bids.push({
    itemId: itemId,
    amount: amount
  })
  db.save("users", users)
  
  console.log(`Puja exitosa: ${user.name} lidera ${item.name} con ${amount}`)
  
  // Responder con información de la puja exitosa
  res.json({
    itemId: itemId,
    highestBid: amount,
    highestBidder: user.name
  })
})

// ENDPOINT: Abrir subasta
// El monitor usa esto para iniciar el juego
app.post("/auction/openAll", (req, res) => {
  const auction = db.load("auction")
  
  // No se puede abrir una subasta que ya está abierta
  if (auction.isOpen) {
    return res.status(400).json({ error: "la subasta ya está abierta" })
  }
  
  try {
    // Marcar la subasta como abierta y guardar el momento de inicio
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
// El monitor usa esto cuando se acaba el tiempo (1 minuto)
app.post("/auction/closeAll", (req, res) => {
  const auction = db.load("auction")
  
  // No se puede cerrar una subasta que ya está cerrada
  if (!auction.isOpen) {
    return res.status(400).json({ error: "la subasta ya está cerrada" })
  }
  
  try {
    // Cerrar la subasta
    auction.isOpen = false
    db.save("auction", auction)
    
    // Procesar resultados - determinar ganadores y cobrar dinero
    const items = db.load("items")
    const users = db.load("users")
    const results = []
    
    console.log("Procesando resultados de la subasta...")
    
    // Para cada item que tenga un ganador
    items.forEach(item => {
      if (item.highestBidder) {
        // Marcar el item como vendido
        item.sold = true
        
        // Descontar dinero del ganador (cobrar la puja)
        const winnerIndex = users.findIndex(u => u.name === item.highestBidder)
        if (winnerIndex !== -1) {
          users[winnerIndex].balance -= item.highestBid
          console.log(`${item.highestBidder} pagó ${item.highestBid} por ${item.name}`)
        }
        
        // Agregar al resumen de resultados
        results.push({
          itemId: item.id,
          item: item.name,
          winner: item.highestBidder,
          finalBid: item.highestBid
        })
      }
    })
    
    // Guardar todos los cambios
    db.save("items", items)
    db.save("users", users)
    
    console.log(`Subasta cerrada. ${results.length} items vendidos`)
    
    // Responder con los resultados finales
    res.json({
      auction: "cerrada",
      results: results
    })
  } catch (error) {
    console.error("Error al cerrar subasta:", error)
    res.status(500).json({ error: "no se pudo cerrar la subasta" })
  }
})

// Endpoint básico de usuarios (para compatibilidad con requests adicionales)
app.get("/users", (req, res) => {
  let users = db.load("users")
  
  // Asegurar que siempre devolvemos un array
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