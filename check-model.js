// check-models.js
const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function listModels() {
  try {
    const models = await groq.models.list();
    console.log('\n--- Active Models on Your Groq API Key ---');
    models.data.forEach((m) => console.log(`- "${m.id}"`));
    console.log('-------------------------------------------\n');
  } catch (err) {
    console.error('Error listing models:', err.message);
  }
}

listModels();