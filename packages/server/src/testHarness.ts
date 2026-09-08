import { runCode } from './judge0.js';
import type { Question, TestCase } from './questions.js';
import type { TestResult, TestRunSummary } from '@bluboxx/shared';

// Languages this harness knows how to drive. Java/C++/C would need a
// type-aware code generator (translating JSON test data into typed
// arrays/vectors/structs) that isn't built - rather than silently
// producing wrong results, runTestSuite refuses to grade those languages
// and the caller (index.ts) surfaces that plainly instead of pretending
// to grade.
const GRADABLE_LANGUAGES = new Set(['javascript', 'typescript', 'python']);

export function isGradableLanguage(language: string): boolean {
  return GRADABLE_LANGUAGES.has(language);
}

function buildHarnessSource(candidateCode: string, functionName: string, input: unknown[], language: string): string {
  const argsJson = JSON.stringify(input);

  if (language === 'python') {
    // Re-parse via json.loads rather than hand-translating JS literals to
    // Python ones (true/false/null vs True/False/None) - letting Python's
    // own json module do that conversion is far less error-prone than a
    // bespoke serializer here. Double-encoding argsJson produces a string
    // that's valid Python string-literal syntax too (escapes line up).
    const pythonStringLiteral = JSON.stringify(argsJson);
    return [
      candidateCode,
      '',
      'import json',
      `__args = json.loads(${pythonStringLiteral})`,
      `__result = ${functionName}(*__args)`,
      'print(json.dumps(__result))',
    ].join('\n');
  }

  // javascript / typescript - identical harness shape, ts-node (Judge0's
  // TypeScript runtime) executes this JS-compatible driver fine even
  // though the candidate's own code above it may use TS syntax.
  return [
    candidateCode,
    '',
    '(() => {',
    `  const __args = ${argsJson};`,
    `  const __result = ${functionName}(...__args);`,
    '  console.log(JSON.stringify(__result === undefined ? null : __result));',
    '})();',
  ].join('\n');
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

async function runSingleTest(
  candidateCode: string,
  functionName: string,
  language: string,
  testCase: TestCase,
): Promise<TestResult> {
  const harnessSource = buildHarnessSource(candidateCode, functionName, testCase.input, language);

  try {
    const result = await runCode(harnessSource, language);

    if (result.stderr || result.compileOutput || result.statusDescription !== 'Accepted') {
      return {
        passed: false,
        isHidden: testCase.isHidden,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        error: (result.compileOutput || result.stderr || result.statusDescription || 'Execution failed').trim(),
      };
    }

    let actualOutput: unknown;
    try {
      actualOutput = JSON.parse((result.stdout ?? '').trim());
    } catch {
      return {
        passed: false,
        isHidden: testCase.isHidden,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: result.stdout,
        error: 'Could not parse the function output - did it forget to return a value?',
      };
    }

    return {
      passed: deepEqual(actualOutput, testCase.expectedOutput),
      isHidden: testCase.isHidden,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
    };
  } catch (err) {
    return {
      passed: false,
      isHidden: testCase.isHidden,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      error: err instanceof Error ? err.message : 'Judge0 request failed',
    };
  }
}

/**
 * Grades `candidateCode` against every test case (visible AND hidden) on
 * `question`, one at a time against Judge0 - sequential, not Promise.all,
 * to stay polite to the free public ce.judge0.com instance's rate limit
 * (see judge0.ts). Always returns FULL detail for every test; callers are
 * responsible for redacting hidden-test detail (see redactHiddenDetail
 * below) before a summary reaches a candidate.
 */
export async function runTestSuite(
  candidateCode: string,
  language: string,
  question: Question,
): Promise<TestRunSummary> {
  const results: TestResult[] = [];
  for (const testCase of question.testCases) {
    results.push(await runSingleTest(candidateCode, question.functionName, language, testCase));
  }
  return {
    results,
    passedCount: results.filter((r) => r.passed).length,
    totalCount: results.length,
  };
}

/** Strips input/expectedOutput/actualOutput/error from hidden tests - what
 * a candidate is allowed to see: whether they passed, never why. */
export function redactHiddenDetail(summary: TestRunSummary): TestRunSummary {
  return {
    ...summary,
    results: summary.results.map((r) => (r.isHidden ? { passed: r.passed, isHidden: true } : r)),
  };
}