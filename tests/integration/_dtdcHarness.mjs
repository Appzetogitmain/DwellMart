/**
 * Shared harness for DTDC integration tests.
 *
 * Boots an in-memory MongoDB, wires the real Mongoose models, and installs a
 * controllable stub over global.fetch so the DTDC client can be exercised
 * end-to-end without touching the live carrier.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod = null;

export const startDb = async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'dtdc_qa' });
    return mongoose;
};

export const stopDb = async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
};

export const resetDb = async () => {
    const cols = await mongoose.connection.db.collections();
    for (const c of cols) await c.deleteMany({});
};

// ── DTDC HTTP stub ─────────────────────────────────────────────────────────
export const dtdcCalls = [];
let handlers = {};

export const setDtdcHandlers = (h) => { handlers = h; };
export const clearDtdcCalls = () => { dtdcCalls.length = 0; };

const abortError = () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    return err;
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
});

export const installFetchStub = () => {
    global.fetch = async (url, options = {}) => {
        const u = String(url);
        let parsedBody = null;
        try { parsedBody = options.body ? JSON.parse(options.body) : null; } catch { parsedBody = options.body; }
        const call = { url: u, method: options.method || 'GET', headers: options.headers || {}, body: parsedBody };
        dtdcCalls.push(call);

        let key = 'unknown';
        if (u.includes('softdata')) key = 'booking';
        else if (u.includes('consignment/cancel')) key = 'cancel';
        else if (u.includes('shippinglabel')) key = 'label';
        else if (u.includes('PincodeApiCall')) key = 'pincode';
        else if (u.includes('authenticate')) key = 'auth';
        else if (u.includes('getTrackDetails')) key = 'tracking';
        call.kind = key;

        const handler = handlers[key];
        if (!handler) throw new Error(`No DTDC stub handler for "${key}" (${u})`);

        // Honour the caller's AbortSignal. Without this a handler that models a
        // hung carrier never settles and the whole suite stalls instead of
        // exercising the client's timeout.
        const signal = options.signal;
        if (!signal) return handler(call);
        if (signal.aborted) throw abortError();

        return Promise.race([
            Promise.resolve().then(() => handler(call)),
            new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(abortError()), { once: true });
            }),
        ]);
    };
};

let awbSeq = 0;
export const resetAwbSequence = () => { awbSeq = 0; };
/** DTDC issues a distinct AWB per consignment; the stub must too. */
export const nextAwb = () => `D${String(1000000001 + (awbSeq += 1))}`;

export const defaultHandlers = () => ({
    booking: (call) => jsonResponse({
        status: 'OK',
        data: [{
            success: true,
            reference_number: nextAwb(),
            customer_reference_number: call.body?.consignments?.[0]?.customer_reference_number || 'ORD-TEST',
        }],
    }),
    cancel: () => jsonResponse({ status: 'OK', data: [{ success: true }] }),
    label:  () => new Response(Buffer.from('%PDF-1.4 fake'), { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    // Mirrors the live sandbox response verified against DTDC.
    pincode: () => jsonResponse({
        ZIPCODE_RESP: [{
            MESSAGE: 'SUCCESS', ORGPIN: '500034', DESTPIN: '110001',
            DESTCITY: 'DELHI', DESTSTATE: 'DELHI', SERV_COD: 'Y', SERVFLAG: 'Y',
        }],
        SERV_ORG_BR: [{ CODE: 'H08', BR_NAME: 'BANJARA HILLS' }],
    }),
    auth:   () => new Response('TOKEN-ABC', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    tracking: () => jsonResponse({
        statusCode: 200,
        trackHeader: [{ strShipmentNo: 'D1000000001', strAction: [] }],
        trackDetails: [
            { strAction: 'Booked', strActionStatus: 'SOF', strOrigin: 'HYD', strActionDate: '2026-01-01' },
            { strAction: 'Delivered', strActionStatus: 'DEL', strOrigin: 'DEL', strActionDate: '2026-01-05' },
        ],
    }),
});

export { jsonResponse };
