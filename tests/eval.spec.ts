import { test, expect } from '@playwright/test';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Load Golden Data Set
import goldenDataSet from '../data/golden-dataset.json';

// Initialize Judge Client
const judge = new OpenAI({ apiKey: process.env.GROQ_API_KEY });

interface TestResult {
  testId: string;
  input: string;
  actualOutput: string;
  score: number;
  reason: string;
  passed: boolean;
}

const results: TestResult[] = [];

test.describe('GenAI Evaluation Suite', () => {
  
  test.afterAll(async () => {
    // Step 4: Save execution results to result.json
    const outputPath = path.join(__dirname, 'result.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nEvaluation completed. Results saved to ${outputPath}`);
  });

  for (const data of goldenDataSet) {
    test(`Evaluate ${data.id}: ${data.input}`, async ({ request }) => {
      
      // STEP 2: Call your LLM / RAG System API
      const apiResponse = await request.post('https://api.groq.com/openai/v1/chat/completions', {
        data: { prompt: data.input }
      });
      const responseData = await apiResponse.json();
      
      const actualOutput: string = responseData.reply;
      const retrievedContext: string[] = responseData.sources || [];

      // STEP 3: LLM-as-a-Judge Evaluation (Faithfulness & Groundedness)
      const judgePrompt = `
        You are an expert QA Evaluator scoring an LLM system response for Faithfulness.
        
        [Retrieved Context]:
        ${JSON.stringify(retrievedContext)}

        [Actual Output]:
        "${actualOutput}"

        Task:
        1. Evaluate whether the Actual Output is strictly grounded in the Retrieved Context without hallucination.
        2. Assign a score between 0.0 and 1.0 (where 1.0 means perfectly faithful, < 0.7 is a fail).
        3. Provide a clear reason explaining any hallucination or ungrounded claim.

        Return strictly valid JSON with this format:
        {
          "score": number,
          "reason": "string explanation"
        }
      `;

      const evalResponse = await judge.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: judgePrompt }],
        response_format: { type: 'json_object' }
      });

      const evalResult = JSON.parse(evalResponse.choices[0].message.content || '{}');
      const score: number = evalResult.score;
      const reason: string = evalResult.reason;
      const passed: boolean = score >= 0.7;

      // Store result record
      results.push({
        testId: data.id,
        input: data.input,
        actualOutput,
        score,
        reason,
        passed
      });

      // Playwright assertion threshold check
      expect(score, `Evaluation failed for ${data.id}: ${reason}`).toBeGreaterThanOrEqual(0.7);
    });
  }
});