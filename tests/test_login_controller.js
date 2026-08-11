import http from 'http';

function testHttpLogin() {
    const postData = JSON.stringify({
        email: 'fashionhub@example.com',
        password: 'vendor123',
    });

    const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/vendor/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('HTTP Response Status:', res.statusCode);
            console.log('HTTP Response Body:', data);
        });
    });

    req.on('error', (e) => {
        console.error('HTTP Request Error:', e.message);
    });

    req.write(postData);
    req.end();
}

testHttpLogin();
