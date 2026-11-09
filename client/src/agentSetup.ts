// The message a person pastes into a chat with their own agent. It is built
// from the page's own origin, so it names whatever host the app is served
// from (never a hard-coded one).

export const mcpUrl = (origin: string): string => `${origin.replace(/\/+$/, "")}/mcp`;

export function setupMessage(origin: string, token: string): string {
  const url = mcpUrl(origin);
  return [
    "Connect yourself to my Post-its board over MCP.",
    "",
    `If you are Claude Code, run this in a shell:`,
    `claude mcp add --transport http postits ${url} --header "Authorization: Bearer ${token}"`,
    "",
    `For any other MCP client: a remote (Streamable HTTP) server at ${url} with the header "Authorization: Bearer ${token}".`,
    "",
    "Then call read_board and tell me what is on my board. Keep the token private.",
  ].join("\n");
}
