import * as React from 'react';

import { debounce } from '@microsoft/sp-lodash-subset';
export interface MonacoEditorHostProps {
    value: string;
    height: number;
    languageId: string;
    onChange?: (v: string) => void;
}

const MonacoEditorHost: React.FC<MonacoEditorHostProps> = ({ value, height, languageId, onChange }: MonacoEditorHostProps) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = React.useRef<typeof import('monaco-editor/esm/vs/editor/editor.api')>();

    React.useEffect(() => {
        let disposed = false;


        (async () => {
            // Lazy-load Monaco only in the property pane
            const monaco = await import(/* webpackChunkName: "monaco-editor" */ 'monaco-editor/esm/vs/editor/editor.api');
            monacoRef.current = monaco;

            // Register the Mermaid language (Monarch) + completions
            await registerMermaidLanguage(monaco);

            // Basic worker wiring that works in SPFx without extra webpack plugins
            (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
                getWorkerUrl: function () {
                    const code = `
            self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/' };
            importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/vs/base/worker/workerMain.js');`;
                    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
                }
            };

            if (disposed || !containerRef.current) return;

            const editor = monaco.editor.create(containerRef.current, {
                value,
                language: languageId,
                automaticLayout: true,
                minimap: { enabled: true },
                lineNumbers: 'on',
            });
            editorRef.current = editor;

            const validate = debounce(async () => {
                const monaco = monacoRef.current;
                const model = editor.getModel();
                if (!model || !monaco) return;

                const text = model.getValue();
                const markers: import('monaco-editor/esm/vs/editor/editor.api').editor.IMarkerData[] = [];

                // Mermaid validation using parse + parseError hook
                const mermaid = (await import(/* webpackChunkName: "mermaid" */ 'mermaid')).default;
                const previous = (mermaid as { parseError?: (err: unknown, hash: unknown) => void }).parseError;

                let lastHash: Record<string, unknown> | null = null;
                (mermaid as { parseError?: (err: unknown, hash: unknown) => void }).parseError = (_err: unknown, hash: unknown) => { lastHash = hash as Record<string, unknown>; };

                try {
                    await mermaid.parse(text);
                } catch (e) {
                    const loc = lastHash && typeof lastHash === 'object' && 'loc' in lastHash ? (lastHash as any).loc : undefined;
                    const monacoLoc = loc && typeof loc === 'object' ? {
                        startLineNumber: typeof loc.first_line === 'number' ? loc.first_line : 1,
                        startColumn: typeof loc.first_column === 'number' ? loc.first_column + 1 : 1,
                        endLineNumber: typeof loc.last_line === 'number' ? loc.last_line : (typeof loc.first_line === 'number' ? loc.first_line : 1),
                        endColumn: typeof loc.last_column === 'number' ? loc.last_column + 1 : model.getLineMaxColumn(1)
                    } : {
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: 1,
                        endColumn: model.getLineMaxColumn(1)
                    };
                    markers.push({
                        ...monacoLoc,
                        severity: monaco.MarkerSeverity.Error,
                        message: (e as Error)?.message ?? 'Invalid Mermaid syntax'
                    });
                } finally {
                    (mermaid as { parseError?: (err: unknown, hash: unknown) => void }).parseError = previous;
                }

                monaco.editor.setModelMarkers(model, 'mermaid-validate', markers);
            }, 250);

            const sub = editor.onDidChangeModelContent(validate);
            validate();

            return () => {
                sub.dispose();
                editor.dispose();
            };
        })().catch(() => {/* ignore */ });

        return () => {
            disposed = true;
            editorRef.current?.dispose?.();
        };
    }, []);

    // keep external updates (e.g., property reset) in sync
    React.useEffect(() => {
        const ed = editorRef.current;
        if (ed && value !== ed.getValue()) ed.setValue(value ?? '');
    }, [value]);

    // bubble value up
    React.useEffect(() => {
        const ed = editorRef.current;
        if (!ed || !onChange) return;
        const d = ed.onDidChangeModelContent(() => onChange(ed.getValue()));
        return () => d.dispose();
    }, [onChange]);

    return <div ref={containerRef} style={{ height }} />;
};

export default MonacoEditorHost;

// a lightweight Monarch tokenizer for Mermaid
const mermaidMonarch: import('monaco-editor/esm/vs/editor/editor.api').languages.IMonarchLanguage = {
    ignoreCase: true,
    tokenizer: {
        root: [
            [/%%.*$/, 'comment'],
            [/(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|gitGraph|pie)\b/, 'keyword'],
            [/(TB|TD|LR|RL|BT)\b/, 'type'],
            [/-->|---|-.->|==>/, 'operator'],
            [/(subgraph|end|click|style|linkStyle|accTitle|accDescr|init)\b/, 'keyword'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],
            [/\d+(\.\d+)?\b/, 'number'],
            [/[{}()[\]]/, '@brackets'],
            [/[a-zA-Z_][\w-]*/, 'identifier']
        ]
    }
};

// --- language registration (Monarch + completions) ---
async function registerMermaidLanguage(monaco: typeof import('monaco-editor/esm/vs/editor/editor.api')): Promise<void> {
    const id = 'mermaid';
    const existing = monaco.languages.getLanguages().some(l => l.id === id);
    if (!existing) {
        monaco.languages.register({ id });
        monaco.languages.setMonarchTokensProvider(id, mermaidMonarch as import('monaco-editor/esm/vs/editor/editor.api').languages.IMonarchLanguage);
        monaco.languages.setLanguageConfiguration(id, {
            comments: { lineComment: '%%' },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']],
            autoClosingPairs: [{ open: '"', close: '"' }, { open: '\'', close: '\'' }, { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }]
        });
        monaco.languages.registerCompletionItemProvider(id, {
            triggerCharacters: [' ', '\n', '[', '(', ':', '-'],
            provideCompletionItems: (model, position) => {
                // Use model.getWordAtPosition to get a valid range
                const word = model.getWordAtPosition(position);
                const range = word ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

                const suggestions = [
                    kw('flowchart', range), kw('graph', range), kw('sequenceDiagram', range), kw('classDiagram', range),
                    kw('stateDiagram', range), kw('stateDiagram-v2', range), kw('erDiagram', range), kw('gantt', range),
                    kw('journey', range), kw('gitGraph', range), kw('pie', range),
                    snip('Directions', 'TB | TD | LR | RL | BT', range),
                    snip('Edge', '-->', range),
                    snip('DashedEdge', '-.->', range),
                    snip('ThickEdge', '==>', range),
                    snip('Subgraph', 'subgraph ${1:Name}\n  ${2}\nend', range)
                ];

                return { suggestions };
            }
        });
    }
    function kw(label: string, range?: import('monaco-editor/esm/vs/editor/editor.api').Range): import('monaco-editor/esm/vs/editor/editor.api').languages.CompletionItem {
        return {
            label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: label,
            range: range!
        };
    }
    function snip(label: string, text: string, range?: import('monaco-editor/esm/vs/editor/editor.api').Range): import('monaco-editor/esm/vs/editor/editor.api').languages.CompletionItem {
        return {
            label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: text,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range!
        };
    }
}

