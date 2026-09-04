export interface TestCase {
  input: unknown[];
  expectedOutput: unknown;
  isHidden: boolean;
}

export interface Question {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  functionName: string;
  starterCode: string;
  testCases: TestCase[];
}

// A small static bank for now - real persistence (interviewer-authored
// questions, a DB-backed CRUD admin) is a TODO for later, not needed to
// prove out the core product flow.
export const QUESTIONS: Question[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`. Assume exactly one solution exists, and the same element cannot be used twice.',
    functionName: 'twoSum',
    starterCode: 'function twoSum(nums, target) {\n  \n}\n',
    testCases: [
      { input: [[2, 7, 11, 15], 9], expectedOutput: [0, 1], isHidden: false },
      { input: [[3, 2, 4], 6], expectedOutput: [1, 2], isHidden: false },
      { input: [[3, 3], 6], expectedOutput: [0, 1], isHidden: true },
      { input: [[1, 2, 3, 4, 5], 9], expectedOutput: [3, 4], isHidden: true },
    ],
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    description:
      "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', return `true` if every bracket is closed by the same type of bracket, in the correct order.",
    functionName: 'isValid',
    starterCode: 'function isValid(s) {\n  \n}\n',
    testCases: [
      { input: ['()'], expectedOutput: true, isHidden: false },
      { input: ['()[]{}'], expectedOutput: true, isHidden: false },
      { input: ['(]'], expectedOutput: false, isHidden: true },
      { input: ['([)]'], expectedOutput: false, isHidden: true },
    ],
  },
  {
    id: 'reverse-string',
    title: 'Reverse String',
    difficulty: 'Easy',
    description: 'Given a string `s`, return the string reversed.',
    functionName: 'reverseString',
    starterCode: 'function reverseString(s) {\n  \n}\n',
    testCases: [
      { input: ['hello'], expectedOutput: 'olleh', isHidden: false },
      { input: ['a'], expectedOutput: 'a', isHidden: false },
      { input: [''], expectedOutput: '', isHidden: true },
      { input: ['racecar'], expectedOutput: 'racecar', isHidden: true },
    ],
  },
];

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

export function listQuestionSummaries() {
  return QUESTIONS.map((q) => ({ id: q.id, title: q.title, difficulty: q.difficulty }));
}