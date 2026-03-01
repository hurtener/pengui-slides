/**
 * Centralised error handler for MCP tool implementations.
 *
 * Converts PenguiError instances into structured error responses
 * and wraps unexpected errors with a generic INTERNAL_ERROR code.
 */

import { PenguiError } from '../../types/errors.js';
import { errorResponse } from './responses.js';

export function handleToolError(error: unknown) {
  if (error instanceof PenguiError) {
    return errorResponse(error.message, error.code);
  }

  const message = error instanceof Error ? error.message : String(error);
  return errorResponse(message, 'INTERNAL_ERROR');
}
