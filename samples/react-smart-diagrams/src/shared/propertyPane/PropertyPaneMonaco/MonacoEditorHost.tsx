import * as React from 'react';
import type * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
import { ILanguageProvider } from './languages/ILanguageProvider';
import { LanguageManager } from './languages/LanguageManager';
import { debounce } from '@microsoft/sp-lodash-subset/lib/index';

export interface MonacoEditorHostProps {
    value: string;
    height: number;
    languageId: string;            // Monaco language id (provider.id should match this)
    provider?: ILanguageProvider;  // Optional: if supplied, host will ensure registration + validation
    minimap: boolean,
    lineNumbers: 'on' | 'off' | 'relative';
    onChange?: (v: string) => void;
}

const MonacoEditorHost: React.FC<MonacoEditorHostProps> = ({ value, height, languageId, provider, minimap, lineNumbers, onChange }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<monacoApi.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = React.useRef<typeof import('monaco-editor/esm/vs/editor/editor.api')>();

    React.useEffect(() => {
        let disposed = false;

        void (async () => {
            const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
            monacoRef.current = monaco;

            // One-time worker bootstrap (kept generic)
            if (!(window as any).__monacoWorkersInjected) {
                (window as any).__monacoWorkersInjected = true;
                (window as any).MonacoEnvironment = {
                    getWorkerUrl: function () {
                        const code = `
              self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/' };
              importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/vs/base/worker/workerMain.js');`;
                        return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
                    }
                };
            }

            // Register the language if a provider is given (no-op if already registered)
            if (provider) LanguageManager.ensureRegistered(provider, monaco);

            if (disposed || !containerRef.current) return;

            const editor = monaco.editor.create(containerRef.current, {
                value,
                language: languageId,
                automaticLayout: true,
                minimap: { enabled: minimap },
                lineNumbers: lineNumbers
            });
            editorRef.current = editor;

            // Validation loop (delegated to provider if present)
            const doValidate = debounce(async () => {
                const model = editor.getModel();
                if (!model || !monacoRef.current) return;

                const text = model.getValue();
                const markers = provider?.validate
                    ? await provider.validate(text, monacoRef.current, model)
                    : [];

                monaco.editor.setModelMarkers(model, provider?.id ?? 'custom', markers ?? []);
            }, 200);

            const subContent = editor.onDidChangeModelContent(() => {
                doValidate();
                onChange?.(editor.getValue());
            });

            // initial validate
            doValidate();

            return () => {
                subContent.dispose();
                editor.dispose();
            };
        })();

        return () => { disposed = true; editorRef.current?.dispose(); };
    }, []); // init once

    // External value sync (e.g., reset from property pane)
    React.useEffect(() => {
        const ed = editorRef.current;
        if (ed && value !== ed.getValue()) ed.setValue(value ?? '');
    }, [value]);

    return <div ref={containerRef} style={{ height }} />;
};

export default MonacoEditorHost;
