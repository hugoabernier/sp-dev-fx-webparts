import type * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
import { ILanguageProvider } from './ILanguageProvider';

export const MermaidLanguage: ILanguageProvider = {
    id: 'mermaid',

    register(monaco: typeof monacoApi) {
        const disposables: Array<{ dispose(): void }> = [];

        if (!monaco.languages.getLanguages().some(l => l.id === this.id)) {
            monaco.languages.register({ id: this.id });

            monaco.languages.setMonarchTokensProvider(this.id, {
                ignoreCase: true,
                tokenizer: {
                    root: [
                        [/%%.*$/, 'comment'],
                        [/\b(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|gitGraph|pie)\b/, 'keyword'],
                        [/\b(TB|TD|LR|RL|BT)\b/, 'type'],
                        [/-->|---|-.->|==>/, 'operator'],
                        [/\b(subgraph|end|click|style|linkStyle|accTitle|accDescr|init)\b/, 'keyword'],
                        [/"([^"\\]|\\.)*"/, 'string'],
                        [/'([^'\\]|\\.)*'/, 'string'],
                        [/\b\d+(\.\d+)?\b/, 'number'],
                        [/[{}()[\]]/, '@brackets'],
                        [/[a-zA-Z_][\w-]*/, 'identifier']
                    ]
                }
            });

            monaco.languages.setLanguageConfiguration(this.id, {
                comments: { lineComment: '%%' },
                brackets: [['{', '}'], ['[', ']'], ['(', ')']],
                autoClosingPairs: [
                    { open: '"', close: '"' }, { open: '\'', close: '\'' },
                    { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }
                ]
            });

            const comp = monaco.languages.registerCompletionItemProvider(this.id, {
                triggerCharacters: [' ', '\n', '[', '(', ':', '-'],
                provideCompletionItems: () => ({
                    suggestions: [
                        kw('flowchart'), kw('graph'), kw('sequenceDiagram'), kw('classDiagram'),
                        kw('stateDiagram'), kw('stateDiagram-v2'), kw('erDiagram'), kw('gantt'),
                        kw('journey'), kw('gitGraph'), kw('pie'),
                        snip('Directions', 'TB | TD | LR | RL | BT'),
                        snip('Edge', '-->'),
                        snip('DashedEdge', '-.->'),
                        snip('ThickEdge', '==>'),
                        snip('Subgraph', 'subgraph ${1:Name}\n  ${2}\nend')
                    ]
                })
            });
            disposables.push(comp as any);
        }

        function kw(label: string): any {
            return { label, kind: monaco.languages.CompletionItemKind.Keyword, insertText: label };
        }
        function snip(label: string, text: string): any {
            return {
                label,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: text,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            };
        }

        return disposables;
    },

    async validate(text, monaco, model) {
        const mermaid = (await import('mermaid')).default;
        const prev = (mermaid as any).parseError;
        let lastHash: any = null;

        (mermaid as any).parseError = (_err: any, hash: any) => { lastHash = hash; };
        try {
            await mermaid.parse(text);
            return []; // valid
        } catch (e: any) {
            const loc = lastHash?.loc;
            const startLine = loc?.first_line ?? 1;
            const endLine = loc?.last_line ?? startLine;
            const startCol = (loc?.first_column ?? 0) + 1;
            const endCol = (loc?.last_column ?? model.getLineMaxColumn(endLine)) + 1;

            return [{
                startLineNumber: startLine,
                startColumn: startCol,
                endLineNumber: endLine,
                endColumn: endCol,
                severity: monaco.MarkerSeverity.Error,
                message: e?.message ?? 'Invalid Mermaid syntax'
            }];
        } finally {
            (mermaid as any).parseError = prev;
        }
    }
};
