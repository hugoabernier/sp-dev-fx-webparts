export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface AssistantResult {
    text: string;
    mermaid?: string;
    raw?: unknown;
}

export class OpenAIResponsesClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(opts: { apiKey: string; model: string; baseUrl?: string }) {
        this.apiKey = opts.apiKey;
        this.model = opts.model; // e.g., 'gpt-4o-mini'
        this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    }

    public async chat(messages: ChatMessage[]): Promise<AssistantResult> {
        const body = {
            model: this.model,
            input: messages, // [{role, content}]
            // Structured outputs live under text.format.* (Responses API)
            text: {
                format: {
                    type: 'json_schema',
                    name: 'DiagramAssistantOutput',

                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                text: { type: 'string' },
                                mermaid: { type: 'string' }
                            },
                            required: ['text', 'mermaid']
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

    /** Parse in this order:
     * 1) output_json (native structured item)
     * 2) output_text (try JSON.parse to extract {text,mermaid}, else treat as plain text)
     * 3) stitched text chunks (same JSON.parse attempt)
     */
    private parseResponse(json: unknown): AssistantResult {
        const o = json as Record<string, unknown>;
        const outputArr = Array.isArray(o.output) ? (o.output as unknown[]) : [];

        // 1) Structured item
        for (const item of outputArr) {
            const i = item as Record<string, unknown>;
            if (i.type === 'message' && Array.isArray(i.content)) {
                for (const c of i.content as unknown[]) {
                    const cc = c as Record<string, unknown>;
                    // Some payloads use type: 'output_json'
                    if (cc.type === 'output_json' && typeof cc.json === 'object' && cc.json) {
                        const { text, mermaid } = coerceStructured(cc.json as Record<string, unknown>);
                        return { text, mermaid, raw: json };
                    }
                    // Some payloads only return text chunks that contain a JSON string
                    if (cc.type === 'output_text' && typeof cc.text === 'string') {
                        const parsed = safeParseStructured(cc.text);
                        if (parsed) return { ...parsed, raw: json };
                    }
                }
            }
        }

        // 2) Aggregated text helper (often present)
        const outputText = typeof o.output_text === 'string' ? o.output_text : '';
        if (outputText) {
            const parsed = safeParseStructured(outputText);
            if (parsed) return { ...parsed, raw: json };
            return { text: outputText, mermaid: extractMermaid(outputText), raw: json };
        }

        // 3) Last resort: stitch text chunks and try again
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
        const parsed = safeParseStructured(combined);
        if (parsed) return { ...parsed, raw: json };
        return { text: combined, mermaid: extractMermaid(combined), raw: json };
    }
}

/** Try to parse a JSON string that looks like { text, mermaid? }.
 * Returns null if it's not valid JSON or doesn't match the shape. */
function safeParseStructured(s: string): { text: string; mermaid?: string } | null {
    if (!s || s[0] !== '{') return null;
    try {
        const j = JSON.parse(s) as Record<string, unknown>;
        const { text, mermaid } = coerceStructured(j);
        return typeof text === 'string' ? { text, mermaid } : null;
    } catch { return null; }
}

/** Coerce any object with .text/.mermaid into the right shape. */
function coerceStructured(j: Record<string, unknown>): { text: string; mermaid?: string } {
    const text = typeof j.text === 'string' ? j.text : '';
    const rawMermaid = typeof j.mermaid === 'string' ? j.mermaid : undefined;
    const mermaid = rawMermaid && rawMermaid.trim().length > 0 ? rawMermaid : undefined;
    return { text, mermaid };
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
