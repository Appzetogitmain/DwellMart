/**
 * Boots the real Express application on an ephemeral port.
 *
 * The whole point of this harness is that it exercises the same stack the
 * frontend hits: routing, `resolveExperience`, authentication, permission
 * checks, Joi validation, rate limiting, the response cache, and the error
 * handler. Calling controllers directly would reproduce exactly the blind spot
 * that let three flow-breaking gaps ship — the previous suites all tested
 * services in isolation and never once crossed an HTTP boundary.
 *
 * Socket.io is deliberately NOT initialised. `emitToRoom` and `emitToUserRoom`
 * both no-op when `io` is null, so order status changes and rider assignment
 * still exercise their full code path without needing a websocket client. The
 * absence of a socket is itself worth asserting: business writes must never
 * depend on a socket being connected.
 */

import http from 'node:http';
import { harnessConfig } from './config.mjs';

let server = null;
let baseUrl = null;

/**
 * Start the API. Idempotent.
 * @returns {Promise<{ baseUrl: string, port: number }>}
 */
export const startTestServer = async () => {
    if (server) return { baseUrl, port: server.address().port };

    // Imported lazily so the database connection is established first —
    // model registration and index building happen on import.
    const { default: app } = await import('../../../src/app.js');

    server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        // Port 0 → the OS assigns a free port, so parallel runs never collide.
        server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    if (harnessConfig.verbose) {
        console.log(`[harness] API listening on ${baseUrl}`);
    }

    return { baseUrl, port };
};

export const stopTestServer = async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    server = null;
    baseUrl = null;
};

export const getBaseUrl = () => {
    if (!baseUrl) {
        throw new Error('startTestServer() must be called before getBaseUrl().');
    }
    return baseUrl;
};
