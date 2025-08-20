// Keep this file tiny and framework-agnostic.
import type * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';

export interface ILanguageProvider {
    /** Monaco language id (e.g., 'mermaid', 'plantuml', 'plaintext') */
    id: string;

    /** Register tokens, config, completions, hovers, etc. Called once per language id. */
    register(monaco: typeof monacoApi): Array<{ dispose(): void }>;

    /** Optional async validation -> Monaco markers (called on content change). */
    validate?(
        text: string,
        monaco: typeof monacoApi,
        model: monacoApi.editor.ITextModel
    ): Promise<monacoApi.editor.IMarkerData[]>;
}
