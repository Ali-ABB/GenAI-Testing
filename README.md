# GenAI Testing Framework

Independent Playwright + TypeScript framework for GenAI / RAG evaluation (golden datasets, groundedness checks, LLM-as-judge patterns).

This repo is **separate** from:

- **UI Testing Framework** — browser UI automation (`Playwright-Automation`)
- **AgenticAI Testing Framework** — agent / tool-call evaluation

## Setup

```bash
npm install
npx playwright install
cp .env.example .env   # then set GROQ_API_KEY
```

## Run tests

```bash
npx playwright test
npx playwright test tests/groq-golden-eval.spec.ts --project=chromium
npx playwright show-report
```

## Layout

- `data/` — golden datasets
- `tests/` — evaluation specs
- `playwright.config.ts` — Playwright config
- `tsconfig.json` — TypeScript config (includes Node types + JSON modules)
