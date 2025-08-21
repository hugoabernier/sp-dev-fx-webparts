export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface AssistantResult {
    text: string;
    mermaid?: string;
    raw?: unknown;
}

/** Minimal OpenAI Responses client (API key auth, DEMO ONLY). */
export class OpenAIResponsesClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(opts: { apiKey: string; model: string; baseUrl?: string }) {
        this.apiKey = opts.apiKey;
        this.model = opts.model;                     // e.g. 'gpt-4o-mini'
        this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    }

    public async chat(messages: ChatMessage[]): Promise<AssistantResult> {
        const body = {
            model: this.model,
            input: messages,                           // Responses API takes an array of {role, content}
            temperature: 0.2,
            // Structured outputs → ask for { text, mermaid? }
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'DiagramAssistantOutput',
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            text: { type: 'string' },
                            mermaid: { type: 'string' }
                        },
                        required: ['text']
                    },
                    strict: true
                }
            }
        };

        const r = await fetch(`${this.baseUrl}/v1/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
        const json = await r.json() as unknown;
        return this.parseResponse(json);
    }

    /** Prefer structured output_json, then output_text, then stitched text. */
    private parseResponse(json: unknown): AssistantResult {
        const o = json as Record<string, unknown>;
        const outputArr = Array.isArray(o.output) ? (o.output as unknown[]) : [];

        // 1) Structured outputs (output_json)
        for (const item of outputArr) {
            const i = item as Record<string, unknown>;
            if (i.type === 'message' && Array.isArray(i.content)) {
                for (const c of i.content as unknown[]) {
                    const cc = c as Record<string, unknown>;
                    if (cc.type === 'output_json' && typeof cc.json === 'object' && cc.json) {
                        const j = cc.json as Record<string, unknown>;
                        const text = typeof j.text === 'string' ? j.text : '';
                        const mermaid = typeof j.mermaid === 'string' ? j.mermaid : undefined;
                        if (text || mermaid) return { text, mermaid, raw: json };
                    }
                }
            }
        }

        // 2) Aggregated text helper (present on many Responses payloads)
        const outputText = typeof o.output_text === 'string' ? o.output_text : '';
        if (outputText) return { text: outputText, mermaid: extractMermaid(outputText), raw: json };

        // 3) Stitch text chunks
        let combined = '';
        for (const item of outputArr) {
            const i = item as Record<string, unknown>;
            if (i.type === 'message' && Array.isArray(i.content)) {
                for (const c of i.content as unknown[]) {
                    const cc = c as Record<string, unknown>;
                    if (cc.type === 'output_text' && typeof cc.text === 'string') combined += cc.text;
                }
            }
        }
        return { text: combined, mermaid: extractMermaid(combined), raw: json };
    }
}

/** Extract Mermaid code from ```mermaid fences, generic fences (heuristic), or <mermaid> tags. */
export function extractMermaid(s: string): string | undefined {
    if (!s) return undefined;

    // ```mermaid ... ```
    const mermaidFence = /```(?:mermaid)\s*([\s\S]*?)```/i.exec(s);
    if (mermaidFence?.[1]) return mermaidFence[1].trim();

    // Generic ```...``` → sniff first token for known diagram types
    const genericFence = /```([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = genericFence.exec(s)) !== null) {
        const code = (m[1] ?? '').trim();
        const head = (code.split(/\s+/)[0] ?? '').toLowerCase();
        if (/^(graph|flowchart|sequencediagram|classdiagram|statediagram|stateDiagram-v2|erdiagram|gantt|journey|gitgraph|pie)$/.test(head)) {
            return code;
        }
    }

    // <mermaid> ... </mermaid>
    const tag = /<mermaid[^>]*>([\s\S]*?)<\/mermaid>/i.exec(s);
    if (tag?.[1]) return tag[1].trim();

    return undefined;
}
