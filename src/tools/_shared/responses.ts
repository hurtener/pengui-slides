/**
 * MCP tool response builder helpers.
 *
 * Standardises the shape of success and error responses
 * returned from every tool handler.
 */

export function textResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function structuredResponse(
  data: Record<string, unknown>,
  text?: string,
  meta?: Record<string, unknown>,
) {
  return {
    content: [{
      type: 'text' as const,
      text: text ?? JSON.stringify(data, null, 2),
    }],
    structuredContent: data,
    ...(meta ? { _meta: meta } : {}),
  };
}

export function errorResponse(message: string, code?: string, details?: Record<string, unknown>) {
  const body: Record<string, unknown> = { error: true, code, message };
  if (details) body.details = details;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    isError: true as const,
  };
}

export function structuredErrorResponse(
  message: string,
  code?: string,
  structuredContent?: Record<string, unknown>,
) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ error: true, code, message }, null, 2),
    }],
    isError: true as const,
    ...(structuredContent ? { structuredContent } : {}),
  };
}
