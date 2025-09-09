const express = require("express")
const path = require("path")
const db = require("./db-util")

const app = express()

app.use(express.json())
app.use("/players-app", express.static(path.join(__dirname, "players_app"))) 
app.use("/monitor-app", express.static(path.join(__dirname, "monitor_app")))

app.get("/users", (req, res) => {
  const users = db.load("users")
  res.status(200).send(users)
})

app.listen(5080, () => {
  console.log("Server is running on http://localhost:5080")
})
