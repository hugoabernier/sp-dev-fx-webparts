
import * as React from 'react';
import loader from '@monaco-editor/loader';

// Keep hard types instead of `any`
type Monaco = typeof import('monaco-editor');
type IEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type IDisposable = import('monaco-editor').IDisposable;

import { ILanguageProvider } from './languages/ILanguageProvider';
import { LanguageManager } from './languages/LanguageManager';
import { debounce } from '@microsoft/sp-lodash-subset/lib/index';
import styles from './MonacoEditorHost.module.scss';


export interface MonacoEditorHostProps {
    value: string;
    height: number;
    languageId: string;           // e.g., 'mermaid'
    provider?: ILanguageProvider; // optional pluggable language/validator
    minimap?: boolean;           // default: true
    lineNumbers?: 'on' | 'off';  // default: 'on'
    onChange?: (v: string) => void;
}

const CDN_VS = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.51.0/min/vs'; // pin for stability

const MonacoEditorHost: React.FC<MonacoEditorHostProps> = ({
    value, height, languageId, provider, minimap, lineNumbers, onChange
}) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<IEditor | null>(null);
    const disposablesRef = React.useRef<IDisposable[]>([]);
    const monacoRef = React.useRef<Monaco | null>(null);

    React.useEffect(() => {
        let disposed = false;

        // Configure + init Monaco via the loader (ESLint-safe and SPFx-friendly)
        loader.config({ paths: { vs: CDN_VS } });

        const init = async (): Promise<void> => {
            const monaco = await loader.init(); // returns the typed Monaco API
            if (disposed || !containerRef.current) return;

            monacoRef.current = monaco;

            // Register your language (tokens/completions) exactly once
            if (provider) {
                LanguageManager.ensureRegistered(provider, monaco);
            }

            const editor = monaco.editor.create(containerRef.current, {
                value,
                language: languageId,
                automaticLayout: true,
                lineNumbers: lineNumbers ?? 'on',
                minimap: { enabled: minimap }
            });
            editorRef.current = editor;

            const doValidate = debounce(async () => {
                const m = editor.getModel();
                if (!m || !monacoRef.current) return;

                const text = m.getValue();
                const markers = provider?.validate
                    ? await provider.validate(text, monacoRef.current, m)
                    : [];

                monaco.editor.setModelMarkers(m, provider?.id ?? 'custom', markers ?? []);
            }, 200);

            // Change subscription
            const sub = editor.onDidChangeModelContent(() => {
                // eslint-disable-next-line no-void
                void doValidate(); // void = satisfy no-floating-promises
                onChange?.(editor.getValue());
            });

            disposablesRef.current.push(sub);
            // eslint-disable-next-line no-void
            void doValidate();
        };

        // eslint-disable-next-line no-void
        void init();

        return () => {
            disposed = true;
            // Clean up deterministically
            disposablesRef.current.forEach(d => d.dispose());
            disposablesRef.current = [];
            editorRef.current?.dispose();
            editorRef.current = null;
        };
    }, []); // init once

    // Keep external prop -> editor in sync (e.g., reset button)
    React.useEffect(() => {
        const ed = editorRef.current;
        if (ed && value !== ed.getValue()) {
            ed.setValue(value ?? '');
        }
    }, [value]);

    return <div ref={containerRef} style={{ height }} className={styles.monacoEditorHost} />;
};

export default MonacoEditorHost;
