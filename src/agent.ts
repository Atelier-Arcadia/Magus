import {
  query,
  createSdkMcpServer,
  type Options,
  type SdkMcpToolDefinition,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

// ── Event types ──────────────────────────────────────────────────────────────

export type MessageEvent = {
  kind: "message";
  content: string;
};

export type ToolUseEvent = {
  kind: "tool_use";
  id: string;
  tool: string;
  input: unknown;
};

export type ToolResultEvent = {
  kind: "tool_result";
  id: string;
  tool: string;
  output: string;
  is_error: boolean;
};

export type ResultEvent = {
  kind: "result";
  text: string;
  duration_ms: number;
  cost_usd: number;
  num_turns: number;
  session_id: string;
};

export type ErrorEvent = {
  kind: "error";
  error: string;
  session_id?: string;
};

export type AgentEvent =
  | MessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | ErrorEvent;

// ── Agent ────────────────────────────────────────────────────────────────────

export type AgentContext = {
  prompt: string;
  cwd?: string;
  sessionId?: string;
};

export type AgentConfig = {
  systemPrompt: string;
  tools: string[];
  mcpTools?: SdkMcpToolDefinition<any>[];
  options?: Omit<
    Options,
    "systemPrompt" | "tools" | "allowedTools" | "cwd" | "mcpServers" | "resume"
  >;
};

const MCP_SERVER_NAME = "agent-tools";

export function createAgent(config: AgentConfig) {
  const mcpServers: Options["mcpServers"] = config.mcpTools?.length
    ? {
        [MCP_SERVER_NAME]: createSdkMcpServer({
          name: MCP_SERVER_NAME,
          tools: config.mcpTools,
        }),
      }
    : undefined;

  const mcpToolNames = (config.mcpTools ?? []).map(
    (t) => `mcp__${MCP_SERVER_NAME}__${t.name}`,
  );
  const allowedTools = [...config.tools, ...mcpToolNames];

  return async function* run(context: AgentContext): AsyncGenerator<AgentEvent> {
    for await (const message of query({
      prompt: context.prompt,
      options: {
        ...config.options,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        allowedTools,
        cwd: context.cwd,
        ...(mcpServers ? { mcpServers } : {}),
        ...(context.sessionId ? { resume: context.sessionId } : {}),
      },
    })) {
      yield* mapSdkMessage(message);
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function* mapSdkMessage(message: SDKMessage): Generator<AgentEvent> {
  switch (message.type) {
    case "assistant": {
      // A single assistant turn can contain interleaved text and tool_use blocks.
      for (const block of message.message.content) {
        if (block.type === "text") {
          yield { kind: "message", content: block.text };
        } else if (block.type === "tool_use") {
          yield {
            kind: "tool_use",
            id: block.id,
            tool: block.name,
            input: block.input,
          };
        } else if (block.type === "tool_result") {
          const textParts = Array.isArray(block.content)
            ? block.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n")
            : typeof block.content === "string"
              ? block.content
              : "";

          yield {
            kind: "tool_result",
            id: block.tool_use_id ?? "",
            tool: "",
            output: textParts,
            is_error: !!block.is_error,
          };
        }
      }
      break;
    }

    case "result": {
      if (message.subtype === "success") {
        yield {
          kind: "result",
          text: message.result,
          duration_ms: message.duration_ms,
          cost_usd: message.total_cost_usd,
          num_turns: message.num_turns,
          session_id: message.session_id,
        };
      } else {
        yield {
          kind: "error",
          error:
            "error" in message ? String((message as any).error) : "Unknown error",
          session_id: message.session_id,
        };
      }
      break;
    }
  }
}

