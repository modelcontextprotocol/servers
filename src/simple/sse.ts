import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import express from "express"
import { createServer } from "./server.js"

const app = express()

const { server, cleanup } = createServer()

let transport: SSEServerTransport

app.get("/sse", async (req, res) => {
  console.log("Received connection")
  transport = new SSEServerTransport("/message", res)
  await server.connect(transport)

  req.on("close", async () => {
    console.log("Connection closed")
    await cleanup()
    await server.close()
  })
})

app.post("/message", async (req, res) => {
  console.log("Received message")
  await transport.handlePostMessage(req, res)
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
