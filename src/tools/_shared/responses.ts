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

export function errorResponse(message: string, code?: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code, message }) }],
    isError: true as const,
  };
}
