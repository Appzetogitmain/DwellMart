/**
 * Frontend ↔ backend API contract.
 *
 * Static analysis, no database, no server. It answers the two questions that
 * every previous harness left unasked, and that between them account for the
 * three critical findings in the audit:
 *
 *   1. Does every API path the frontend calls actually exist on the backend?
 *      A screen calling a route that does not exist is dead on arrival.
 *
 *   2. Does every endpoint the backend exposes for a critical flow have a
 *      caller in the frontend? An endpoint nothing calls is a feature that
 *      does not exist from the user's point of view — which is exactly what
 *      happened to `PATCH /vendor/orders/:id/quick-status`: correct, tested,
 *      and unreachable.
 *
 * The second question is the valuable one. Contract tests almost always check
 * the first direction only, and the first direction was never broken here.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { beginSuite, check, checkKnownGap } from '../integration/support/gate.mjs';
import { getKnownGap } from '../integration/support/knownGaps.mjs';
import { paths } from '../integration/support/config.mjs';

/** Recursively collect source files under a directory. */
const collectFiles = async (root, extensions) => {
    const found = [];
    const walk = async (dir) => {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (extensions.some((ext) => entry.name.endsWith(ext))) found.push(full);
        }
    };
    await walk(root);
    return found;
};

/**
 * Extract API paths the frontend calls.
 *
 * Matches `api.get('/x')`, `api.post(\`/x/${id}\`)` and the `del` alias.
 * Template literals are normalised: an interpolation becomes `:param`, so
 * `/vendor/orders/${id}/quick-status` compares against the Express pattern.
 */
const extractFrontendCalls = async () => {
    const files = await collectFiles(path.join(paths.frontendRoot, 'src'), ['.js', '.jsx']);
    const calls = [];

    const pattern = /\b(?:api|apiClient)\s*\.\s*(get|post|put|patch|delete|del)\s*\(\s*(['"`])([^'"`]*?)\2/g;

    for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        let match;
        while ((match = pattern.exec(source)) !== null) {
            const [, method, , rawPath] = match;
            if (!rawPath.startsWith('/')) continue;
            // Strip any inline query string or fragment before comparing —
            // Express routes never include one, and several call sites build
            // the query directly into the path.
            const withoutQuery = rawPath.split('?')[0].split('#')[0];

            calls.push({
                method: method === 'del' ? 'delete' : method,
                rawPath,
                normalized:
                    withoutQuery.replace(/\$\{[^}]*\}/g, ':param').replace(/\/+$/, '') || '/',
                file: path.relative(paths.repoRoot, file),
            });
        }
    }

    return calls;
};

/** Walk the mounted Express app and list every registered route. */
const extractBackendRoutes = async () => {
    const { default: app } = await import('../../src/app.js');
    const routes = [];

    const normalize = (layerPath) =>
        layerPath.replace(/\\\//g, '/').replace(/\/+$/, '') || '/';

    const walk = (stack, prefix = '') => {
        for (const layer of stack) {
            if (layer.route) {
                const routePath = normalize(prefix + layer.route.path);
                for (const method of Object.keys(layer.route.methods)) {
                    if (layer.route.methods[method]) {
                        routes.push({ method, path: routePath });
                    }
                }
            } else if (layer.name === 'router' && layer.handle?.stack) {
                // Recover the mount path from the layer's regexp.
                const source = layer.regexp?.source ?? '';
                const mountMatch = /^\^\\?\/?(.*?)\\\/\?\(\?=\\\/\|\$\)/.exec(source);
                let mount = '';
                if (mountMatch && mountMatch[1]) {
                    mount = `/${mountMatch[1].replace(/\\\//g, '/').replace(/\\\./g, '.')}`;
                }
                walk(layer.handle.stack, prefix + mount);
            }
        }
    };

    walk(app._router?.stack ?? app.router?.stack ?? []);
    return routes;
};

/** Does a normalised frontend path match a registered Express route? */
const routeMatches = (callPath, routePath) => {
    const callSegments = callPath.split('/').filter(Boolean);
    const routeSegments = routePath.split('/').filter(Boolean);
    if (callSegments.length !== routeSegments.length) return false;

    return routeSegments.every((segment, index) => {
        if (segment.startsWith(':')) return true;         // route param absorbs anything
        if (callSegments[index] === ':param') return true; // interpolated value
        return segment === callSegments[index];
    });
};

export const run = async () => {
    beginSuite('Contract — frontend calls vs backend routes');

    const calls = await extractFrontendCalls();
    const routes = await extractBackendRoutes();

    check(calls.length > 0, 'frontend API call sites were discovered', `found ${calls.length}`);
    check(routes.length > 0, 'backend routes were enumerated', `found ${routes.length}`);

    // ── Direction 1: every frontend call resolves to a real route ────────────
    const unresolved = [];
    for (const call of calls) {
        const apiPath = call.normalized.startsWith('/api')
            ? call.normalized
            : `/api${call.normalized}`;
        const matched = routes.some(
            (route) => route.method === call.method && routeMatches(apiPath, route.path)
        );
        if (!matched) unresolved.push(call);
    }

    // Pre-existing dead call sites are tracked in the baseline. Anything
    // unresolved and not listed there is new dead code and fails the gate.
    const allowedUnresolved = new Set(getKnownGap('DEAD-1')?.allowedUnresolved ?? []);
    const signature = (call) =>
        `${call.method} ${call.normalized.startsWith('/api') ? call.normalized : `/api${call.normalized}`}`;

    const newlyUnresolved = unresolved.filter((call) => !allowedUnresolved.has(signature(call)));
    const stillUnresolved = unresolved.filter((call) => allowedUnresolved.has(signature(call)));

    check(
        newlyUnresolved.length === 0,
        'no NEW frontend API call targets a route that does not exist',
        newlyUnresolved
            .slice(0, 12)
            .map((c) => `${c.method.toUpperCase()} ${c.rawPath}  (${c.file})`)
            .join('\n         ')
    );

    checkKnownGap(
        'DEAD-1',
        stillUnresolved.length === 0,
        'no frontend service function calls a non-existent backend route',
        `${stillUnresolved.length} dead call site(s) remain: `
        + stillUnresolved.map(signature).join(', ')
    );

    // ── Direction 2: critical endpoints have a frontend caller ──────────────
    // An endpoint with no caller is, to a user, a feature that does not exist.
    const hasCaller = (method, routePath) =>
        calls.some(
            (call) =>
                call.method === method
                && routeMatches(
                    call.normalized.startsWith('/api') ? call.normalized : `/api${call.normalized}`,
                    routePath
                )
        );

    const callerIn = (method, routePath, moduleFragment) =>
        calls.some(
            (call) =>
                call.method === method
                && call.file.replace(/\\/g, '/').includes(moduleFragment)
                && routeMatches(
                    call.normalized.startsWith('/api') ? call.normalized : `/api${call.normalized}`,
                    routePath
                )
        );

    // FLOW-1 — vendor status endpoint for Quick Commerce orders.
    check(
        callerIn('patch', '/api/vendor/orders/:id/quick-status', 'modules/Vendor'),
        'a vendor screen calls PATCH /vendor/orders/:id/quick-status',
        'no file under frontend/src/modules/Vendor calls it'
    );

    // OPS-1 — escalated orders are invisible without a caller.
    // OPS-1 — admin escalation queue & retry assignment.
    check(
        hasCaller('get', '/api/admin/orders/quick-commerce/unassigned'),
        'an admin screen calls the Quick Commerce escalation queue',
        'GET /admin/orders/quick-commerce/unassigned has no caller in frontend/src'
    );

    check(
        hasCaller('post', '/api/admin/orders/:id/retry-assignment'),
        'an admin screen calls retry-assignment for an escalated order',
        'POST /admin/orders/:id/retry-assignment has no caller in frontend/src'
    );

    // FLOW-2 — rider experience enrolment.
    check(
        hasCaller('put', '/api/admin/delivery-boys/:id/experiences') || hasCaller('put', '/api/admin/delivery-boys/bulk-experiences'),
        'an admin screen can enrol a rider into Quick Commerce',
        'no rider-enrolment endpoint caller found'
    );

    // ── Endpoints that must keep their callers (regression protection) ───────
    const mustHaveCallers = [
        ['patch', '/api/delivery/orders/:id/quick-status', 'rider Quick Commerce transitions'],
        ['patch', '/api/delivery/location', 'rider live location reporting'],
        ['post', '/api/quick/checkout/estimate', 'Quick Commerce checkout estimate'],
        ['get', '/api/quick/serviceability', 'Quick Commerce serviceability'],
        ['get', '/api/quick/vendors/nearby', 'nearby Quick Commerce stores'],
        ['get', '/api/admin/analytics/quick-commerce', 'admin Quick Commerce analytics'],
        ['get', '/api/vendor/quick-commerce/dashboard', 'vendor Quick Commerce dashboard'],
        ['post', '/api/user/orders', 'order placement'],
        ['post', '/api/shipping/estimate', 'marketplace shipping estimate'],
    ];

    for (const [method, routePath, description] of mustHaveCallers) {
        check(
            hasCaller(method, routePath),
            `${description} is still called by the frontend`,
            `${method.toUpperCase()} ${routePath} lost its caller`
        );
    }

    // ── Backend routes must exist for what the frontend depends on ──────────
    const mustExist = [
        ['patch', '/api/vendor/orders/:id/quick-status'],
        ['patch', '/api/delivery/orders/:id/quick-status'],
        ['get', '/api/admin/orders/quick-commerce/unassigned'],
        ['post', '/api/admin/orders/:id/retry-assignment'],
        ['get', '/api/user/orders/:id/tracking'],
        ['post', '/api/vendor/quick-commerce/orders/:id/acknowledge'],
    ];

    for (const [method, routePath] of mustExist) {
        check(
            routes.some((route) => route.method === method && routeMatches(routePath, route.path)),
            `backend still exposes ${method.toUpperCase()} ${routePath}`
        );
    }

};

export default run;
