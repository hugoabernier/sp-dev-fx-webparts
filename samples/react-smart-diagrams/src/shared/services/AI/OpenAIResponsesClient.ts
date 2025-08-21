export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface AssistantResult {
    text: string;
    mermaid?: string;
    raw?: unknown;
}

export type DiagramKind =
    | 'flowchart' | 'graph'
    | 'sequenceDiagram' | 'classDiagram'
    | 'stateDiagram' | 'stateDiagram-v2'
    | 'erDiagram' | 'gantt' | 'journey'
    | 'mindmap'
    | 'gitGraph' | 'pie';

export interface ChatOptions {
    /** Tool handler that returns Mermaid syntax docs for a given kind (Markdown or plain text). */
    onGetMermaidDocs?: (kind: DiagramKind) => Promise<{ syntaxDoc: string; sourceUrl: string }>;
    baseUrl?: string;
}

type FunctionCallOutputItem = {
    type: 'function_call_output';
    call_id: string;          // the call_... id from the model
    output: string;           // your tool output (string; JSON.stringify is fine)
};


export class OpenAIResponsesClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(opts: { apiKey: string; model: string; baseUrl?: string }) {
        this.apiKey = opts.apiKey;
        this.model = opts.model;
        this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    }

    public async chat(messages: ChatMessage[], options?: ChatOptions): Promise<AssistantResult> {
        // Structured outputs (V2): { text, mermaid }
        const TEXT_FORMAT = {
            format: {
                type: 'json_schema',
                name: 'DiagramAssistantOutput',
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        text: { type: 'string' },
                        mermaid: { type: 'string' },
                        syntaxHeader: { type: 'string' }
                    },
                    required: ['text', 'mermaid', 'syntaxHeader']
                },
                strict: true
            }
        } as const;

        // Tool *schema* (definitions) for the API — keep handlers local
        const toolDefs = options?.onGetMermaidDocs ? [{
            type: 'function' as const,
            name: 'get_mermaid_docs',
            description: 'Return the official Mermaid syntax documentation for the given diagram kind as Markdown or plain text.',
            parameters: {
                type: 'object',
                properties: {
                    kind: {
                        type: 'string',
                        description: 'Diagram kind: flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, stateDiagram-v2, erDiagram, gantt, journey, gitGraph, pie'
                    }
                },
                required: ['kind'],
                additionalProperties: false
            }
        }] : undefined;

        // 1) First create
        let current = await this.postCreate({
            model: this.model,
            input: messages,              // user/assistant/system/developer messages (roles OK here)
            temperature: 0.2,
            text: TEXT_FORMAT,            // structured output schema
            tools: toolDefs,              // <-- pass *definitions*, not JS functions
            tool_choice: toolDefs ? 'auto' : undefined
        });

        // 2) Tool loop (max 3 rounds)
        for (let i = 0; i < 3; i++) {
            const calls = collectToolCalls(current);
            if (!calls.length || !options?.onGetMermaidDocs) break;

            // Build a flat array of *typed* input items (NO role field)
            const continuationInput: FunctionCallOutputItem[] = [];

            for (const tc of calls) {
                // Execute your local handler
                const args = safeParseJSON(tc.arguments);
                const kind = String(args.kind ?? '') as DiagramKind;
                const { syntaxDoc, sourceUrl } = await options.onGetMermaidDocs(kind);

                // Send ONLY the function_call_output back (echoing the call is optional)
                continuationInput.push({
                    type: 'function_call_output',
                    call_id: (tc as any).call_id || tc.id,  // your collector sets call_id=id
                    output: JSON.stringify({ syntaxDoc, sourceUrl })
                });
            }

            // Continue the same response
            current = await this.postCreate({
                previous_response_id: getResponseId(current), // continuation anchor
                model: this.model,
                input: continuationInput,                      // flat typed items; no roles here
                tools: toolDefs,                               // keep tools available
                tool_choice: 'auto',
                text: TEXT_FORMAT
            });
        }

        // 3) Parse final
        return this.parseResponseV2(current);
    }


    // ---------- HTTP ----------
    private async postCreate(body: unknown): Promise<unknown> {
        const r = await fetch(`${this.baseUrl}/v1/responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
        return await r.json();
    }

    // ---------- Parsing ----------
    private parseResponseV2(json: unknown): AssistantResult {
        const o = json as Record<string, unknown>;

        for (const item of getOutputArray(o)) {
            const i = item as Record<string, unknown>;
            if (i.type === 'message' && Array.isArray(i.content)) {
                for (const c of i.content as unknown[]) {
                    const cc = c as Record<string, unknown>;
                    if (cc.type === 'output_json' && typeof cc.json === 'object' && cc.json) {
                        const { text, mermaid } = coerceV2(cc.json as Record<string, unknown>);
                        return { text, mermaid, raw: json };
                    }
                    if (cc.type === 'output_text' && typeof cc.text === 'string') {
                        const parsed = safeParseV2(cc.text);
                        if (parsed) return { ...parsed, raw: json };
                    }
                }
            }
        }

        const agg = typeof o.output_text === 'string' ? o.output_text : '';
        if (agg) {
            const parsed = safeParseV2(agg);
            if (parsed) return { ...parsed, raw: json };
            return { text: agg, mermaid: extractMermaid(agg), raw: json };
        }

        // stitch as last resort
        let combined = '';
        for (const item of getOutputArray(o)) {
            const i = item as Record<string, unknown>;
            if (i.type === 'message' && Array.isArray(i.content)) {
                for (const c of i.content as unknown[]) {
                    const cc = c as Record<string, unknown>;
                    if (cc.type === 'output_text' && typeof cc.text === 'string') combined += cc.text;
                }
            }
        }
        const parsed = safeParseV2(combined);
        if (parsed) return { ...parsed, raw: json };
        return { text: combined, mermaid: extractMermaid(combined), raw: json };
    }
}

// ---------- internals ----------
interface ToolCall { id: string; name: string; arguments: string; type: 'function_call', call_id: string }
function getOutputArray(o: Record<string, unknown>): unknown[] { return Array.isArray(o.output) ? o.output : []; }
function getResponseId(json: unknown): string {
    const o = json as Record<string, unknown>;
    if (typeof o.id === 'string' && o.id) return o.id;
    // some gateways might nest it
    const resp = (o as { response?: { id?: string } }).response;
    if (resp && typeof resp.id === 'string' && resp.id) return resp.id;
    throw new Error('Missing response.id when continuing tool calls');
}


function collectToolCalls(json: unknown): ToolCall[] {
    const out: ToolCall[] = [];
    const o = json as Record<string, unknown>;
    const output = Array.isArray(o.output) ? o.output : [];

    for (const item of output) {
        const i = item as Record<string, unknown>;

        // A) Top-level function_call (your case)
        if (i.type === 'function_call') {
            const id = typeof i.call_id === 'string' && i.call_id ? i.call_id : (typeof i.id === 'string' ? i.id : '');
            const name = typeof i.name === 'string' ? i.name : '';
            const args = typeof i.arguments === 'string' ? i.arguments : '';
            if (id && name) out.push({ id, name, arguments: args, type: 'function_call', call_id: id });
            continue;
        }

        // B) Nested tool_call under a message’s content (other Responses shape)
        if (i.type === 'message' && Array.isArray(i.content)) {
            for (const c of i.content as unknown[]) {
                const cc = c as Record<string, unknown>;
                if (cc.type === 'tool_call') {
                    const id = typeof cc.id === 'string' ? cc.id : '';
                    const name = typeof cc.name === 'string'
                        ? cc.name
                        : (typeof (cc as { function?: { name?: string } }).function?.name === 'string'
                            ? (cc as { function?: { name?: string } }).function!.name!
                            : '');
                    const args = typeof cc.arguments === 'string'
                        ? cc.arguments
                        : (typeof (cc as { function?: { arguments?: string } }).function?.arguments === 'string'
                            ? (cc as { function?: { arguments?: string } }).function!.arguments!
                            : '');
                    if (id && name) out.push({ id, name, arguments: args, type: 'function_call', call_id: id });
                }
            }
        }
    }

    return out;
}

function safeParseJSON(s: unknown): Record<string, unknown> {
    if (typeof s !== 'string') return {};
    try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
function stripCodeFences(s: string): string {
    const m = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    return m ? m[1].trim() : s.trim();
}

function safeParseV2(s: string): { text: string; mermaid?: string } | null {
    if (!s) return null;
    const un = stripCodeFences(s);
    if (!un || un[0] !== '{') return null;
    try {
        const obj = JSON.parse(un) as Record<string, unknown>;
        return coerceV2(obj);
    } catch {
        return null;
    }
}

function coerceV2(j: Record<string, unknown>): { text: string; mermaid?: string } {
    // Prefer current schema keys
    const text =
        typeof (j as any).text === 'string' ? (j as any).text :
            typeof (j as any).answer === 'string' ? (j as any).answer : '';

    const mermaid =
        typeof (j as any).mermaid === 'string' && (j as any).mermaid.trim()
            ? ((j as any).mermaid as string).trim()
            : (typeof (j as any).diagram === 'object' && (j as any).diagram && typeof (j as any).diagram.mermaid === 'string'
                ? ((j as any).diagram.mermaid as string).trim()
                : undefined);

    return { text, mermaid };
}

export function extractMermaid(s: string): string | undefined {
    if (!s) return undefined;
    const fence = /```(?:mermaid)\s*([\s\S]*?)```/i.exec(s);
    if (fence?.[1]) return fence[1].trim();
    const generic = /```([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = generic.exec(s)) !== null) {
        const code = (m[1] ?? '').trim();
        const head = (code.split(/\s+/)[0] ?? '').toLowerCase();
        if (/^(graph|flowchart|sequencediagram|classdiagram|statediagram|stateDiagram-v2|erdiagram|gantt|journey|gitgraph|pie)$/.test(head)) {
            return code;
        }
    }
    const tag = /<mermaid[^>]*>([\s\S]*?)<\/mermaid>/i.exec(s);
    if (tag?.[1]) return tag[1].trim();
    return undefined;
}
