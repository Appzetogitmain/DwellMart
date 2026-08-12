import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { initSocket } from "./socket.js";
import { startQuickCommerceSweep } from "./services/quickCommerceAlerts.service.js";
import { QUICK_COMMERCE_SWEEP_INTERVAL_MS } from "./constants/quickCommerce.js";
import { registerMarketplaceEventHandlers } from "./services/events/marketplaceEventBus.js";
import { RetryQueueService } from "./services/events/RetryQueueService.js";
import { sweepExpiredReservations } from "./services/checkout/InventoryReservationService.js";
import { startOrderRecoveryWorker } from "./services/checkout/OrderRecoveryWorker.js";
import { COD_CAPTURE_JOB, handleCodCaptureRetry } from "./services/deliveryCash.service.js";
import { RIDER_EARNING_JOB, handleRiderEarningRetry } from "./services/wallet/riderEarnings.service.js";
import { startWalletMaturityWorker } from "./services/wallet/walletMaturity.worker.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    const server = http.createServer(app);
    initSocket(server);

    // ── Quick Commerce escalation + SLA sweep ─────────────────────────────────
    startQuickCommerceSweep(QUICK_COMMERCE_SWEEP_INTERVAL_MS);

    // ── Marketplace event handlers ────────────────────────────────────────────
    registerMarketplaceEventHandlers();

    // ── Persistent retry queue worker (60s poll for failed jobs) ─────────────
    RetryQueueService.registerHandler(COD_CAPTURE_JOB, handleCodCaptureRetry);
    RetryQueueService.registerHandler(RIDER_EARNING_JOB, handleRiderEarningRetry);
    RetryQueueService.startWorker(60_000);

    // ── Inventory reservation sweep (5 min — releases expired holds) ─────────
    const reservationSweepInterval = setInterval(async () => {
      try {
        const result = await sweepExpiredReservations();
        if (result.released > 0) {
          console.log(`[ReservationSweep] Released ${result.released} expired reservation(s).`);
        }
      } catch (err) {
        console.error("[ReservationSweep] Error:", err?.message);
      }
    }, 5 * 60_000);
    reservationSweepInterval.unref();

    // ── Order recovery worker (5 min — resumes stuck paid sessions) ──────────
    startOrderRecoveryWorker(5 * 60_000);

    // ── Rider wallet maturity sweep (5 min — PENDING → AVAILABLE earnings) ──
    startWalletMaturityWorker(5 * 60_000);

    server.listen(PORT, () => {
      console.log(`Server & WebSocket running on http://localhost:${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`✅ InventoryReservation sweep: every 5 minutes`);
      console.log(`✅ RetryQueue worker:          every 60 seconds`);
      console.log(`✅ OrderRecovery worker:       every 5 minutes`);
      console.log(`✅ RiderWallet maturity:      every 5 minutes`);
    });
  } catch (error) {
    console.error("📦 Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
