import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/main/errors.js';
import { validateCreateTaskRequest } from '../../src/main/validation.js';

describe('validateCreateTaskRequest', () => {
  it('accepts explosion input and applies variant count bounds', () => {
    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3 },
      }),
    ).toEqual({
      type: 'explosion',
      input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3 },
    });
  });

  it('rejects explosion variant count above 10', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 11 },
      }),
    ).toThrow(AppError);
  });
});
