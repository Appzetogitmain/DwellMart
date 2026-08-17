import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Vendor chat controller does not auto-seed fake messages or greetings', () => {
    const controllerSource = fs.readFileSync(
        new URL('../../src/modules/vendor/controllers/chat.controller.js', import.meta.url),
        'utf8'
    );

    // Verify that fake messages are not created on empty thread
    assert.doesNotMatch(
        controllerSource,
        /VendorChatMessage\.create\(\[\s*\{\s*threadId/i,
        'chat.controller.js must not automatically seed fake VendorChatMessage documents'
    );

    // Verify that fake greeting strings are not present in controller
    assert.doesNotMatch(
        controllerSource,
        /Hello, I need help with my order/i,
        'chat.controller.js must not contain hardcoded fake customer greeting'
    );

    assert.doesNotMatch(
        controllerSource,
        /Hi! How can I help you today\?/i,
        'chat.controller.js must not contain hardcoded fake vendor greeting'
    );
});
