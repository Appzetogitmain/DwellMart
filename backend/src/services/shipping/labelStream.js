/**
 * Stream a carrier label response to an Express response.
 *
 * Shared by the admin and vendor label endpoints so the two cannot drift.
 *
 * Uses `pipeline` over a Web-stream→Node-stream conversion rather than a
 * recursive `reader.read()` + `res.write()` loop. The loop it replaces ignored
 * backpressure (`res.write` returning false was discarded, so a slow client
 * buffered the whole PDF in memory) and had no error path, so a carrier
 * dropping the connection mid-label left the request hanging until timeout.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * @param {Response} labelResponse fetch Response whose body is the PDF
 * @param {import('express').Response} res
 * @param {object} order used only for the download filename
 */
export const streamLabelToResponse = async (labelResponse, res, order) => {
    const filename = `dtdc-label-${order?.orderId || order?._id || 'shipment'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // The label embeds the recipient's name, address and phone number.
    res.setHeader('Cache-Control', 'private, no-store');

    const contentLength = labelResponse.headers?.get?.('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (!labelResponse.body) {
        const buffer = Buffer.from(await labelResponse.arrayBuffer());
        res.end(buffer);
        return;
    }

    await pipeline(Readable.fromWeb(labelResponse.body), res);
};

export default { streamLabelToResponse };
