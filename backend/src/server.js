import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { initSocket } from "./socket.js";
import { startQuickCommerceSweep } from "./services/quickCommerceAlerts.service.js";
import { QUICK_COMMERCE_SWEEP_INTERVAL_MS } from "./constants/quickCommerce.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    const server = http.createServer(app);
    initSocket(server);

    // Quick Commerce escalation + SLA sweep. Started after the socket so its
    // admin emits have somewhere to go, and it no-ops entirely while the
    // platform flag is off.
    startQuickCommerceSweep(QUICK_COMMERCE_SWEEP_INTERVAL_MS);

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
