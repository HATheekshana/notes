// Safe-to-show validation failures. Anything else is treated as an infrastructure error by the APIs.
// code: 'ENOENT' = not found (404), 'CONFLICT' = changed elsewhere (409).
export class InputError extends Error { code?: string; }
