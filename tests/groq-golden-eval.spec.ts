import { test, expect } from '@playwright/test';
import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';

// Import Golden Data Set
import goldenDataSet from '../data/golden-dataset.json';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 1. Updated interface matching your complete golden-dataset.json structure
interface EvalCriteria {
  must_include?: string[];
  must_not_include?: string[];
  max_hallucination_score?: number;
}

interface GoldenDataItem {
  id: string;
  category: string;
  tags?: string[];
  input: string;
  retrieved_context?: string[];
  expected_output?: string;
  eval_criteria?: EvalCriteria;
  expectedCriteria?: string;
  expectedIntent?: string;
}

interface TestResult {
  testId: string;
  category: string;
  inputPrompt: string;
  expectedOutput: string;
  actualOutput: string;
  score: number;
  passed: boolean;
  reason: string;
}

const executionResults: TestResult[] = [];

async function getActiveModel(): Promise<string> {
  try {
    const modelList = await groq.models.list();
    const availableIds = modelList.data.map(m => m.id);
    const preferredModels = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'meta-llama/llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ];
    for (const model of preferredModels) {
      if (availableIds.includes(model)) return model;
    }
    return availableIds[0] || 'llama-3.3-70b-versatile';
  } catch (e) {
    return 'llama-3.3-70b-versatile';
  }
}

test.describe('Groq-Powered Golden Dataset Evaluation Suite', () => {

  let targetModel = 'llama-3.3-70b-versatile';

  test.beforeAll(async () => {
    targetModel = await getActiveModel();
    console.log(`\n🤖 Using active Groq model: "${targetModel}" for evaluation suite.\n`);
  });

  test.afterAll(async () => {
    const outputPath = path.join(process.cwd(), 'result.json');
    fs.writeFileSync(outputPath, JSON.stringify(executionResults, null, 2));
    console.log(`\n==================================================`);
    console.log(`Evaluation Suite Finished. Results saved to: ${outputPath}`);
    console.log(`==================================================\n`);
  });

  for (const data of (goldenDataSet as GoldenDataItem[])) {
    test(`[${data.id}] - ${data.category}: ${data.input}`, async ({ request }) => {
      let actualOutput = '';
      const expectedOutText = data.expected_output || 'N/A';
      
      try {
        // 2. Build RAG context block if available in the dataset item
        const contextBlock = data.retrieved_context && data.retrieved_context.length > 0
          ? `Retrieved Ground Truth Context:\n${data.retrieved_context.join('\n')}\n\n`
          : '';

        const systemPrompt = 'You are a precise support assistant. Answer the user prompt using ONLY the provided retrieved context if available.';
        const userPromptWithContext = `${contextBlock}User Question: ${data.input}`;

        // Target model generation using dataset context
        const groqTarget = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPromptWithContext }
          ],
          model: targetModel,
        });
        actualOutput = groqTarget.choices[0]?.message?.content || '';

        // 3. Formulate rich criteria including expectations and constraints
        const criteriaList: string[] = [];
        if (data.expected_output) criteriaList.push(`Expected Answer Baseline: "${data.expected_output}"`);
        if (data.eval_criteria?.must_include) criteriaList.push(`Must include terms: ${data.eval_criteria.must_include.join(', ')}`);
        if (data.eval_criteria?.must_not_include) criteriaList.push(`Must NOT include terms: ${data.eval_criteria.must_not_include.join(', ')}`);
        
        const criteriaText = criteriaList.length > 0 
          ? criteriaList.join('\n') 
          : (data.expectedCriteria || data.expectedIntent || 'Ensure output answers the prompt accurately.');

        // Enhanced Judge Prompt leveraging golden dataset expectations
        const judgePrompt = `
          You are an expert Quality Engineering Judge evaluating an AI system response against a golden dataset benchmark.

          [User Input Prompt]:
          "${data.input}"

          [System Actual Output]:
          "${actualOutput}"

          [Evaluation Benchmarks & Criteria]:
          "${criteriaText}"

          Task:
          1. Assess whether the System Actual Output fulfills the Evaluation Benchmarks without hallucination or factual errors.
          2. Assign a score between 0.0 and 1.0 (>= 0.7 is a Pass, < 0.7 is a Fail).
          3. Provide a clear 1-2 sentence rationale.

          Return strictly valid JSON:
          {
            "score": number,
            "reason": "string"
          }
        `;

        const judgeResponse = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a precise, objective automated evaluation judge. Output pure JSON.' },
            { role: 'user', content: judgePrompt }
          ],
          model: targetModel,
          response_format: { type: 'json_object' }
        });

        const judgeOutputRaw = judgeResponse.choices[0]?.message?.content || '{}';
        const evalResult = JSON.parse(judgeOutputRaw);
        
        const score: number = Number(evalResult.score ?? 0);
        const reason: string = evalResult.reason || 'No reasoning provided by judge.';
        const passed: boolean = score >= 0.7;

        executionResults.push({
          testId: data.id,
          category: data.category,
          inputPrompt: data.input,
          expectedOutput: expectedOutText,
          actualOutput,
          score,
          passed,
          reason
        });

        expect(score, `[${data.id}] LLM Judge Failed (Score: ${score}). Reason: ${reason}`).toBeGreaterThanOrEqual(0.7);

      } catch (error: any) {
        executionResults.push({
          testId: data.id,
          category: data.category,
          inputPrompt: data.input,
          expectedOutput: expectedOutText,
          actualOutput: actualOutput || 'N/A - Execution Error',
          score: 0,
          passed: false,
          reason: error.message || 'Execution failed.'
        });
        throw error;
      }
    });
  }
});