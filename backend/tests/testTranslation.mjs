
const API_URL = 'http://localhost:5000/api/v1/translate';

async function testSingle() {
    console.log("--- Testing Single Translation ---");
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "Hello world", targetLang: "es", sourceLang: "en" })
    });
    const data = await res.json();
    console.log(data);
}

async function testBatch() {
    console.log("\n--- Testing Batch Translation ---");
    const res = await fetch(`${API_URL}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: ["Good morning", "How are you?"], targetLang: "fr", sourceLang: "en" })
    });
    const data = await res.json();
    console.log(data);
}

async function runTests() {
    try {
        await testSingle();
        await testBatch();
    } catch (error) {
        console.error("Test failed:", error);
    }
}

runTests();
