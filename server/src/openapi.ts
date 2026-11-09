import type { IncomingMessage, ServerResponse } from "node:http";
import { INSTRUCTIONS, TOKEN_ROUTES, TOOLS } from "./agent.ts";
import { config } from "./config.ts";

// /openapi.json and /llms.txt, for an agent that wants to know what it may call.
// The routes that accept a personal `pi_` token are listed in TOKEN_ROUTES
// (agent.ts), which dispatch also routes from; `paths` is built from that list,
// so that is all the spec describes: the cookie-only /api routes are the app's
// own and stay out. The tool schemas come from the same TOOLS list /mcp serves.
// spec/openapi.test.ts fails if a token route or a tool is missing.

const ORIGIN = config.publicOrigin;

const rpcEnvelope = (method: string, params: Record<string, unknown>, required: string[]) => ({
  type: "object",
  required: ["jsonrpc", "method", ...required],
  properties: {
    jsonrpc: { type: "string", const: "2.0" },
    id: { type: ["string", "integer"], description: "Your id for this call; the response repeats it. Leave it out for a notification, which gets no answer." },
    method: { type: "string", const: method },
    ...(required.length ? { params: { type: "object", properties: params, required: Object.keys(params) } } : {}),
  },
});

const toolCall = (tool: (typeof TOOLS)[number]) => ({
  title: tool.name,
  description: tool.description,
  ...rpcEnvelope("tools/call", { name: { type: "string", const: tool.name }, arguments: tool.inputSchema }, ["params"]),
});

const rpcResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/RpcResponse" } } } });

// What each token route does, by operationId. buildOpenApi throws for a route in
// TOKEN_ROUTES that has no entry here.
const operations: Record<string, () => Record<string, unknown>> = {
  callPostitsTool: () => ({
    operationId: "callPostitsTool",
    summary: "Call a Post-its tool (read, find, add, move, edit, comment on or delete notes)",
    description: `Send one JSON-RPC 2.0 message, or a batch of up to 20. Use \`initialize\` and \`tools/list\` to discover the tools, and \`tools/call\` to run one of: ${TOOLS.map((t) => t.name).join(", ")}. Acts as the token's owner with exactly their permissions. Limited to 60 calls a minute per user.`,
    tags: ["agent"],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/RpcRequest" } } },
    },
    responses: {
      "200": rpcResponse("The JSON-RPC response (or an array of them for a batch)."),
      "202": { description: "Only notifications were sent: nothing to answer." },
      "400": rpcResponse("Not valid JSON-RPC."),
      "401": rpcResponse("Missing, wrong or revoked token."),
      "429": rpcResponse("More than 60 calls in a minute; retry after the `retry-after` seconds."),
    },
  }),
};

const missing = (id: string): never => {
  throw new Error(`TOKEN_ROUTES has ${id} but openapi.ts has no description of it`);
};

export const buildOpenApi = (): Record<string, unknown> => ({
  openapi: "3.1.0",
  info: {
    title: "Post-its agent endpoint",
    version: "1.0.0",
    summary: "Read and tidy a person's Post-its board from their own agent.",
    description: `${INSTRUCTIONS}\n\nThis is one stateless MCP (JSON-RPC 2.0) endpoint. Every operation of the board is a tool called through \`tools/call\`; the request schema below lists each tool with its arguments. Get the token from Settings in the app.`,
  },
  servers: [{ url: ORIGIN }],
  externalDocs: { description: "Post-its docs", url: `${ORIGIN}/docs/` },
  security: [{ bearerAuth: [] }],
  paths: Object.fromEntries(TOKEN_ROUTES.map((r) => [r.path, { [r.method.toLowerCase()]: (operations[r.operationId] ?? missing(r.operationId))() }])),
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "A personal token (starts with `pi_`) made in Settings > Agent token." },
    },
    schemas: {
      RpcMessage: {
        description: "One JSON-RPC message. Without an `id` it is a notification and gets no answer.",
        oneOf: [
          rpcEnvelope("initialize", {}, []),
          rpcEnvelope("tools/list", {}, []),
          ...TOOLS.map(toolCall),
        ],
      },
      RpcRequest: {
        description: "One JSON-RPC message, or an array of 1 to 20.",
        oneOf: [
          { $ref: "#/components/schemas/RpcMessage" },
          { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/RpcMessage" } },
        ],
      },
      RpcResult: {
        type: "object",
        required: ["jsonrpc", "id"],
        properties: {
          jsonrpc: { type: "string", const: "2.0" },
          id: { type: ["string", "integer", "null"] },
          result: { type: "object", description: "For tools/call: `content` holds one text item (Markdown) and `isError` is true when the tool failed." },
          error: { type: "object", required: ["code", "message"], properties: { code: { type: "integer" }, message: { type: "string" } } },
        },
      },
      RpcResponse: {
        description: "One JSON-RPC response, or an array of them for a batch.",
        oneOf: [
          { $ref: "#/components/schemas/RpcResult" },
          { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/RpcResult" } },
        ],
      },
    },
  },
});

const body = JSON.stringify(buildOpenApi(), null, 2);
const OAI = "application/vnd.oai.openapi+json";

/** True when the Accept header lists the OpenAPI media type (with a q above 0). */
const wantsOai = (accept: string | undefined): boolean =>
  (accept ?? "").toLowerCase().split(",").some((part) => {
    const [type, ...params] = part.trim().split(";");
    return type.trim() === OAI && !params.some((p) => /^\s*q=0(\.0*)?\s*$/.test(p));
  });

export function serveOpenApi(req: IncomingMessage, res: ServerResponse): void {
  const bytes = Buffer.from(body, "utf8");
  const type = wantsOai(req.headers.accept) ? OAI : "application/json";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8`, vary: "Accept", "content-length": bytes.length, "cache-control": "public, max-age=300" });
  res.end(req.method === "HEAD" ? undefined : bytes);
}

const LLMS = `# Post-its

> A board for your notes: notes sit wherever you put them, and where a note sits is how you prioritise and group it. Other people can visit a board and leave a note.

## When to use Post-its

Use it when a person wants their own notes or to-dos on a free-form board, grouped by named sections, or wants their agent to read, add, move, edit or comment on those notes (through the token endpoint).

Don't use it for diagrams, drawing, polls or team project management. It has no polls, stickers or reactions. Boards and notes are private to people who log in, so there is nothing to scrape: the public pages are the docs.

## Links

- [Docs](${ORIGIN}/docs/): what each feature does and how the app is built
- [OpenAPI](${ORIGIN}/openapi.json): the agent endpoint, with a bearer token from Settings
- [MCP endpoint](${ORIGIN}/mcp): POST JSON-RPC here with \`Authorization: Bearer pi_…\`
- [Sitemap](${ORIGIN}/sitemap.xml): every public page, as a list
- [README](${ORIGIN}/readme/): what the project is and why
`;

export function serveLlmsTxt(req: IncomingMessage, res: ServerResponse): void {
  const bytes = Buffer.from(LLMS, "utf8");
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-length": bytes.length, "cache-control": "public, max-age=300" });
  res.end(req.method === "HEAD" ? undefined : bytes);
}
