import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../../src/app.js';

describe('Phase 12 — P1-SEC-02 /uploads 404 Fallback Security & Reflected XSS Prevention', () => {
    let server;
    let baseUrl;

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    const xssPayloads = [
        {
            name: 'Classic script tag (URL encoded)',
            path: encodeURIComponent('<script>alert(1)</script>'),
            expectedEncoded: '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
        },
        {
            name: 'Img tag with onerror event handler (URL encoded)',
            path: encodeURIComponent('<img src=x onerror=alert(1)>'),
            expectedEncoded: '&lt;img src=x onerror=alert(1)&gt;',
        },
        {
            name: 'Attribute breakout with svg onload (URL encoded)',
            path: encodeURIComponent('"><svg onload=alert(document.domain)>'),
            expectedEncoded: '&quot;&gt;&lt;svg onload=alert(document.domain)&gt;',
        },
        {
            name: 'Javascript pseudo-protocol',
            path: 'javascript:alert(1)',
            expectedEncoded: 'javascript:alert(1)',
        },
        {
            name: 'Audit repro raw unclosed tag (<b>test</b>)',
            path: '<b>test</b>',
            expectedEncoded: 'b&gt;',
        },
        {
            name: 'Pre-encoded script tag',
            path: '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
            expectedEncoded: '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
        },
        {
            name: 'Pre-encoded svg breakout',
            path: '%22%3E%3Csvg%20onload=alert(1)%3E',
            expectedEncoded: '&quot;&gt;&lt;svg onload=alert(1)&gt;',
        },
    ];

    for (const { name, path: probePath, expectedEncoded } of xssPayloads) {
        test(`XSS probe (${name}): renders inert and enforces strict CSP`, async () => {
            const res = await fetch(`${baseUrl}/uploads/${probePath}`, {
                headers: { Accept: 'text/html' },
            });

            assert.equal(res.status, 404, 'Must return HTTP 404');

            const contentType = res.headers.get('content-type') || '';
            assert.ok(contentType.includes('text/html'), 'Content-Type must be text/html');

            const csp = res.headers.get('content-security-policy') || '';
            assert.ok(csp.includes("default-src 'none'"), 'CSP must specify default-src none');
            assert.ok(csp.includes('sandbox'), 'CSP must include sandbox directive');
            assert.ok(!csp.includes("'unsafe-inline'; script-src"), 'CSP must NOT permit unsafe-inline for scripts');
            assert.ok(!csp.includes('script-src'), 'CSP must not allow any script-src');

            const nosniff = res.headers.get('x-content-type-options');
            assert.equal(nosniff, 'nosniff', 'Must set X-Content-Type-Options: nosniff');

            const frameOptions = res.headers.get('x-frame-options');
            assert.equal(frameOptions, 'DENY', 'Must set X-Frame-Options: DENY');

            const body = await res.text();

            // Reflected content must be safely HTML-encoded
            assert.ok(
                body.includes(expectedEncoded),
                `Response body must contain safely encoded payload: ${expectedEncoded}`
            );

            // Response must contain NO executable script or DOM tags
            assert.ok(!body.includes('<script>'), 'Response must contain NO <script> opening tag');
            assert.ok(!body.includes('</script>'), 'Response must contain NO </script> closing tag');
            assert.ok(!body.includes('<script'), 'Response must contain NO <script prefix');
            assert.ok(!body.includes('<img'), 'Response must contain NO unescaped <img tag');
            assert.ok(!body.includes('<svg'), 'Response must contain NO unescaped <svg tag');
            assert.ok(!body.includes('<b>'), 'Response must contain NO unescaped <b> tag');
            assert.ok(
                !/<[a-zA-Z0-9]+\b[^>]*\bon[a-zA-Z]+\s*=/i.test(body),
                'Response must contain NO executable inline event handler on any HTML element'
            );
            assert.ok(!body.includes('href="javascript:'), 'Response must contain NO javascript: links');
            assert.ok(!body.includes('http://localhost:3000/admin/vendors'), 'Must NOT leak hardcoded admin URL');
        });
    }

    test('Valid filenames with special characters (spaces, dots, underscores, dashes, brackets)', async () => {
        const testFile = 'vendor-contract_2026.09 (v2) [final].pdf';
        const res = await fetch(`${baseUrl}/uploads/${encodeURIComponent(testFile)}`, {
            headers: { Accept: 'text/html' },
        });

        assert.equal(res.status, 404);
        const body = await res.text();
        assert.ok(body.includes('vendor-contract_2026.09 (v2) [final].pdf'), 'Filename must be readable and uncorrupted');
        assert.ok(!body.includes('<script'), 'Must not contain script tags');
    });

    test('Valid filenames with non-ASCII / Unicode characters', async () => {
        const testFile = 'dokument-üñîçødé_2026 (résumé).pdf';
        const res = await fetch(`${baseUrl}/uploads/${encodeURIComponent(testFile)}`, {
            headers: { Accept: 'text/html' },
        });

        assert.equal(res.status, 404);
        const body = await res.text();
        assert.ok(body.includes('dokument-üñîçødé_2026 (résumé).pdf'), 'Non-ASCII filename must be uncorrupted and rendered cleanly');
        assert.ok(!body.includes('<script'), 'Must not contain script tags');
    });

    test('Legitimate existing static files are served normally with HTTP 200', async () => {
        const existingReport = 'bulk-reports/Valid_Rows_job-1788593935611-a933bd98.xlsx';
        const res = await fetch(`${baseUrl}/uploads/${existingReport}`);

        assert.equal(res.status, 200, 'Existing static file must return HTTP 200');
        assert.ok(Number(res.headers.get('content-length')) > 0, 'Must return non-empty file content');
    });

    test('Private upload directories (/delivery-docs/, /tmp/) remain protected with HTTP 403', async () => {
        const resTmp = await fetch(`${baseUrl}/uploads/tmp/some-staged-file.png`);
        assert.equal(resTmp.status, 403, 'Access to /tmp/ under uploads must be denied (403)');

        const resDocs = await fetch(`${baseUrl}/uploads/delivery-docs/some-license.pdf`);
        assert.equal(resDocs.status, 403, 'Access to /delivery-docs/ without valid token must be denied (403)');
    });

    test('Non-HTML request (Accept: application/json) returns existing JSON 404 contract', async () => {
        const res = await fetch(`${baseUrl}/uploads/nonexistent-file.png`, {
            headers: { Accept: 'application/json' },
        });

        assert.equal(res.status, 404);
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('application/json'), 'Content-Type must be application/json');

        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'The requested document file was not found on the server.');
    });

    test('Non-HTML request (Accept: */*) returns JSON 404 when html is not preferred', async () => {
        const res = await fetch(`${baseUrl}/uploads/document.pdf`, {
            headers: { Accept: 'application/octet-stream' },
        });

        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.message, 'The requested document file was not found on the server.');
    });
});
