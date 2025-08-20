import * as React from 'react';
import { debounce } from '@microsoft/sp-lodash-subset';
import styles from './MonacoEditorHost.module.scss';

export interface MonacoEditorHostProps {
    value: string;
    height: number;
    languageId: string;
    onChange?: (v: string) => void | ((targetProperty: string, v: string) => void);
    targetProperty?: string; // For SPFx property pane
}

const MonacoEditorHost: React.FC<MonacoEditorHostProps> = (props) => {
    const { value, height, languageId, onChange, targetProperty } = props;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = React.useRef<typeof import('monaco-editor/esm/vs/editor/editor.api')>();

    React.useEffect(() => {
        let disposed = false;

        // Wrap the async IIFE with void to satisfy eslint @typescript-eslint/no-floating-promises
        void (async () => {
            const monaco = await import(/* webpackChunkName: "monaco-editor" */ 'monaco-editor/esm/vs/editor/editor.api');
            monacoRef.current = monaco;

            await registerMermaidLanguage(monaco);

            (window as any).MonacoEnvironment = {
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
                glyphMargin: true,         // Removes breakpoint & folding icons
                // lineDecorationsWidth: 0,   // Hides line decorations (e.g. error markers)
                folding: false,            // Disables code folding controls
                lineNumbers: "off",        // Optional: hides line numbers
                minimap: { enabled: false } // Optional: hides minimap
            });
            editorRef.current = editor;

            const validate = debounce(async () => {
                const monaco = monacoRef.current;
                const model = editor.getModel();
                if (!model || !monaco) return;

                const text = model.getValue();
                const markers: import('monaco-editor/esm/vs/editor/editor.api').editor.IMarkerData[] = [];

                // Wrap with void to satisfy eslint @typescript-eslint/no-floating-promises
                void (async () => {
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
                })();
            }, 250);

            const sub = editor.onDidChangeModelContent(() => {
                const newValue = editor.getValue();
                if (onChange) {
                    if (targetProperty) {
                        (onChange as (targetProperty: string, v: string) => void)(targetProperty, newValue);
                    } else {
                        (onChange as (v: string) => void)(newValue);
                    }
                }
                void validate();
            });
            void validate();

            return () => {
                sub.dispose();
                editor.dispose();
            };
        })();

        return () => {
            disposed = true;
            editorRef.current?.dispose?.();
        };
    }, [languageId, targetProperty, onChange]);

    // keep external updates (e.g., property reset) in sync
    React.useEffect(() => {
        const ed = editorRef.current;
        if (ed && value !== ed.getValue()) ed.setValue(value ?? '');
    }, [value]);

    return (
        <div
            ref={containerRef}
            className={styles.monacoEditorHost}
            style={{ height }}
        />
    );
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
        monaco.languages.setMonarchTokensProvider(id, mermaidMonarch);
        monaco.languages.setLanguageConfiguration(id, {
            comments: { lineComment: '%%' },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']],
            autoClosingPairs: [{ open: '"', close: '"' }, { open: '\'', close: '\'' }, { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }]
        });
        monaco.languages.registerCompletionItemProvider(id, {
            triggerCharacters: [' ', '\n', '[', '(', ':', '-'],
            provideCompletionItems: (model, position) => {
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
    function kw(label: string, range: import('monaco-editor/esm/vs/editor/editor.api').Range): import('monaco-editor/esm/vs/editor/editor.api').languages.CompletionItem {
        return {
            label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: label,
            range
        };
    }
    function snip(label: string, text: string, range: import('monaco-editor/esm/vs/editor/editor.api').Range): import('monaco-editor/esm/vs/editor/editor.api').languages.CompletionItem {
        return {
            label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: text,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
        };
    }
}