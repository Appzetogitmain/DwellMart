import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { initSocket } from "./socket.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`Server & WebSocket running on http://localhost:${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("📦 Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
