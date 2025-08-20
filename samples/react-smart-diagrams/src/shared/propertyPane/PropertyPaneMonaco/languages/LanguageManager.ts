import type * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
import { ILanguageProvider } from './ILanguageProvider';

export class LanguageManager {
    private static _registered = new Set<string>();

    static ensureRegistered(provider: ILanguageProvider, monaco: typeof monacoApi): void {
        if (this._registered.has(provider.id)) return;
        provider.register(monaco);
        this._registered.add(provider.id);
    }
}
