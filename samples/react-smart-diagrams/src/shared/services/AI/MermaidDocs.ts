import type { DiagramKind } from './OpenAIResponsesClient';

export interface MermaidDoc {
    syntaxDoc: string;   // Markdown-ish/plain text
    sourceUrl: string;
}

/** Resolve the canonical docs URL for a given diagram kind. */
function urlFor(kind: DiagramKind): string {
    switch (kind) {
        case 'flowchart': return 'https://mermaid.js.org/syntax/flowchart.html';
        case 'graph': return 'https://mermaid.js.org/syntax/flowchart.html';
        case 'sequenceDiagram': return 'https://mermaid.js.org/syntax/sequenceDiagram.html';
        case 'classDiagram': return 'https://mermaid.js.org/syntax/classDiagram.html';
        case 'stateDiagram':
        case 'stateDiagram-v2': return 'https://mermaid.js.org/syntax/stateDiagram.html';
        case 'erDiagram': return 'https://mermaid.js.org/syntax/entityRelationshipDiagram.html';
        case 'gantt': return 'https://mermaid.js.org/syntax/gantt.html';
        case 'journey': return 'https://mermaid.js.org/syntax/userJourney.html';
        case 'gitGraph': return 'https://mermaid.js.org/syntax/gitgraph.html';
        case 'pie': return 'https://mermaid.js.org/syntax/pie.html';
        case 'mindmap': return 'https://mermaid.js.org/syntax/mindmap.html';
        default: return 'https://mermaid.js.org/intro/syntax-reference.html';
    }
}

/** Fetch docs and extract the readable content. CORS-safe for typical public docs. */
export async function fetchMermaidDocs(kind: DiagramKind): Promise<MermaidDoc> {
    const primary = urlFor(kind);
    let html = '';
    try {
        const res = await fetch(primary, { mode: 'cors' });
        html = await res.text();
    } catch {
        // fallback mirror if ever needed
        const mirror = primary.replace('https://mermaid.js.org', 'https://docs.mermaidchart.com/mermaid-oss');
        const res2 = await fetch(mirror, { mode: 'cors' });
        html = await res2.text();
    }

    // Parse and pull the main readable area
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const main = doc.querySelector('main') ?? doc.body;

    // Remove obvious nav/sidebars if present
    main.querySelectorAll('nav, aside, header, footer, script, style').forEach(el => el.remove());

    // Collect code blocks and replace them with fenced code to aid the model
    main.querySelectorAll('pre, code').forEach(el => {
        // If it's a mermaid example, give it a language fence
        const text = el.textContent ?? '';
        if (!text.trim()) return;
        const fence = '```';
        const lang = /mermaid/i.test(el.className) ? 'mermaid' : '';
        const fenced = `${fence}${lang}\n${text.trim()}\n${fence}\n`;
        // Replace pre/code with a <p> containing fenced markdown text
        const p = doc.createElement('p');
        p.textContent = fenced;
        el.replaceWith(p);
    });

    // Get markdown-ish text content
    // NOTE: innerText keeps newlines; textContent may smash them. innerText is better for readability.
    const syntaxDoc = (main as HTMLElement).innerText.trim();

    return { syntaxDoc, sourceUrl: primary };
}
