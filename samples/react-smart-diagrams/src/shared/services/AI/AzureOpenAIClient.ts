// import type { WebPartContext } from '@microsoft/sp-webpart-base'; // (unused in apiKey mode; kept for parity)

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface AssistantResult {
    text: string;
    mermaid?: string;
    raw?: unknown;
}

export interface AzureOpenAIClientOptions {
    endpoint: string;    // e.g. https://your-aoai.openai.azure.com
    deployment: string;  // Azure deployment name (not the raw model id)
    apiVersion: string;  // e.g. 2024-10-21 (Responses-capable)
    apiKey: string;      // ⚠️ demo only
}

/**
 * Minimal client for Azure OpenAI Responses API using an API key (demo only).
 * Strongly typed, ESLint-friendly, and includes Mermaid extraction.
 */
export class AzureOpenAIClient {
    private readonly endpoint: string;
    private readonly deployment: string;
    private readonly apiVersion: string;
    private readonly apiKey: string;

    constructor(opts: AzureOpenAIClientOptions) {
        this.endpoint = opts.endpoint.replace(/\/+$/, '');
        this.deployment = opts.deployment;
        this.apiVersion = opts.apiVersion;
        this.apiKey = opts.apiKey;
    }

    public async chat(messages: ChatMessage[]): Promise<AssistantResult> {
        const body = {
            model: this.deployment,
            input: messages,
            temperature: 0.2,
            // Ask for structured output: { text, mermaid? }
            text: {
                format: {
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
            }
        };

        const url = `${this.endpoint}/openai/v1/responses?api-version=${encodeURIComponent(this.apiVersion)}`;
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.apiKey
            },
            body: JSON.stringify(body)
        });

        if (!r.ok) throw new Error(`Azure OpenAI ${r.status}: ${await r.text()}`);
        const json = await r.json() as unknown;
        return this.parseResponse(json);
    }

    private parseResponse(json: unknown): AssistantResult {
        const o = json as Record<string, unknown>;
        const outputArr = Array.isArray(o.output) ? o.output as unknown[] : [];

        // 1) Prefer structured output_json
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

        // 2) Aggregated text, if provided
        const outputText = typeof o.output_text === 'string' ? o.output_text : '';
        if (outputText) return { text: outputText, mermaid: extractMermaid(outputText), raw: json };

        // 3) Stitch plain text chunks
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
        if (isLikelyMermaid(code)) return code;
    }

    // <mermaid> ... </mermaid>
    const tag = /<mermaid[^>]*>([\s\S]*?)<\/mermaid>/i.exec(s);
    if (tag?.[1]) return tag[1].trim();

    return undefined;
}

function isLikelyMermaid(code: string): boolean {
    const head = (code.split(/\s+/)[0] ?? '').toLowerCase();
    return /^(graph|flowchart|sequencediagram|classdiagram|statediagram|stateDiagram-v2|erdiagram|gantt|journey|gitgraph|pie)$/.test(head);
}
