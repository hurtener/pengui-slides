/**
 * Centralised error handler for MCP tool implementations.
 *
 * Converts PenguiError instances into structured error responses
 * (preserving the error's details payload) and wraps unexpected errors
 * with a generic INTERNAL_ERROR code.
 */

import { PenguiError } from '../../types/errors.js';
import { errorResponse } from './responses.js';

export function handleToolError(error: unknown) {
  if (error instanceof PenguiError) {
    return errorResponse(error.message, error.code, error.details);
  }

  const message = error instanceof Error ? error.message : String(error);
  return errorResponse(message, 'INTERNAL_ERROR');
}
