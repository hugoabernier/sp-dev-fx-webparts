// src/shared/propertyPane/PropertyPaneMonaco/components/ExpandedMonacoPanel.tsx
import * as React from 'react';
import {
    Stack, Panel, PanelType, PrimaryButton, DefaultButton,
    IconButton, TooltipHost, Separator
} from '@fluentui/react';
import mermaid from 'mermaid';
import MonacoEditorHost from './MonacoEditorHost';
import type { ILanguageProvider } from './languages/ILanguageProvider';
import AIChatPane from './AIChatPane';

export type MermaidTheme = 'default' | 'neutral' | 'forest' | 'dark' | 'base';

export interface ExpandedMonacoPanelProps {
    isOpen: boolean;
    title?: string;
    initialValue: string;
    languageId: string;
    provider?: ILanguageProvider;
    theme?: MermaidTheme;
    onApply: (value: string) => void;
    onCancel: () => void;
}

/* ---------- Utilities ---------- */
function useDebounced<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    const timer = React.useRef<number | undefined>(undefined);
    const saved = React.useRef(fn);
    React.useEffect(() => { saved.current = fn; }, [fn]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return React.useMemo(() => ((...args: unknown[]) => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => saved.current(...args), ms);
    }) as T, [ms]);
}

/** Resizer for Preview | Editor | Chat.
 * previewPct controls the LEFT pane (preview), chatPct controls the RIGHT pane (chat).
 */
function useThreePaneResizer() {
    const [previewPct, setPreviewPct] = React.useState<number>(34); // left pane width (preview)
    const [chatPct, setChatPct] = React.useState<number>(28); // right pane width (chat)
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const draggingRef = React.useRef<'left' | 'right' | null>(null);

    const clamp = (v: number): number => Math.min(70, Math.max(15, v));

    const onMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent<HTMLDivElement>): void => {
        e.preventDefault();
        draggingRef.current = side;
        document.body.style.cursor = 'col-resize';
    };

    const onMouseMove = (e: MouseEvent): void => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = (x / rect.width) * 100;

        if (draggingRef.current === 'left') {
            // Left handle: sets preview (left pane) width
            setPreviewPct(clamp(pct));
        } else {
            // Right handle: sets chat (right pane) width
            setChatPct(clamp(100 - pct));
        }
    };

    const onMouseUp = (): void => { draggingRef.current = null; document.body.style.cursor = ''; };

    React.useEffect(() => {
        const mm = (ev: MouseEvent) => onMouseMove(ev);
        const mu = () => onMouseUp();
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
        return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    }, []);

    // Keyboard resize for accessibility
    const onKeyResize = (side: 'left' | 'right') => (e: React.KeyboardEvent<HTMLDivElement>): void => {
        const step = (e.shiftKey ? 5 : 2);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (side === 'left') {
                setPreviewPct(v => clamp(v + (e.key === 'ArrowRight' ? step : -step)));
            } else {
                setChatPct(v => clamp(v + (e.key === 'ArrowLeft' ? step : -step)));
            }
            e.preventDefault();
        }
    };

    return { containerRef, previewPct, chatPct, onMouseDown, onKeyResize };
}

/* ---------- Component ---------- */

const CHAT_PREF_KEY = 'expandedMonaco.showChat';

const ExpandedMonacoPanel: React.FC<ExpandedMonacoPanelProps> = ({
    isOpen,
    title = 'Edit',
    initialValue,
    languageId,
    provider,
    theme = 'default',
    onApply,
    onCancel
}) => {
    const [value, setValue] = React.useState<string>(initialValue);
    const [svg, setSvg] = React.useState<string>('');
    const [valid, setValid] = React.useState<boolean>(true);
    const [previewError, setPreviewError] = React.useState<string | null>(null);

    // Default: chat hidden; remember user preference
    const [showChat, setShowChat] = React.useState<boolean>(() => {
        try { return window.localStorage.getItem(CHAT_PREF_KEY) === 'true'; }
        catch { return false; }
    });
    const toggleChat = React.useCallback((): void => {
        setShowChat(prev => {
            const next = !prev;
            try { window.localStorage.setItem(CHAT_PREF_KEY, String(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    const { containerRef, previewPct, chatPct, onMouseDown, onKeyResize } = useThreePaneResizer();

    // Reset state on open
    React.useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            setSvg('');
            setValid(true);
            setPreviewError(null);
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
            // eslint-disable-next-line no-void
            if (languageId === 'mermaid') { 
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                void renderPreview(initialValue); 
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const renderPreview = React.useCallback(async (text: string): Promise<void> => {
        if (languageId !== 'mermaid') { setSvg(''); setPreviewError(null); setValid(true); return; }
        try {
            await mermaid.parse(text);
            const out = await mermaid.render(`m-${Date.now()}`, text, undefined);
            setSvg(out.svg);
            setPreviewError(null);
            setValid(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err ?? 'Invalid syntax');
            setPreviewError(msg);
            setSvg('');
            setValid(false);
        }
    }, [languageId, theme]);

    const debouncedPreview = useDebounced((text: string) => { void renderPreview(text); }, 250);
    React.useEffect(() => { debouncedPreview(value); }, [value, debouncedPreview]);

    const doApply = (): void => { onApply(value); };
    const doCancel = (): void => { onCancel(); };
    // const doValidate = async (): Promise<void> => { await renderPreview(value); };
    // const doCopySvg = async (): Promise<void> => { if (svg) await navigator.clipboard.writeText(svg); };

    /* ----- Toolbar (AI toggle; validate; copy; status) ----- */
    const Toolbar = (
        <Stack horizontal horizontalAlign={'end'} verticalAlign="center" tokens={{ childrenGap: 8 }} styles={{ root: { padding: '4px 0' } }}>
            <span aria-live="polite" style={{ color: valid ? '#107c10' : '#a4262c' }}>
                {valid ? '✔ Valid' : `✖ ${previewError ?? 'Invalid'}`}
            </span>
           
            {/* <TooltipHost content="Validate">
                <IconButton iconProps={{ iconName: 'CheckMark' }} aria-label="Validate" onClick={() => { void doValidate(); }} />
            </TooltipHost>
            <TooltipHost content="Copy SVG (mermaid)">
                <IconButton iconProps={{ iconName: 'Copy' }} aria-label="Copy SVG" disabled={!svg} onClick={() => { void doCopySvg(); }} />
            </TooltipHost> */}
            <Separator vertical />
            <Stack.Item grow />
            <TooltipHost content={showChat ? 'Hide Mermaid assistant' : 'Show Mermaid assistant'}>
                <IconButton
                    iconProps={{ iconName: showChat ? 'AutoEnhanceOff' : 'AutoEnhanceOn' }}
                    aria-label={showChat ? 'Hide Mermaid assistant' : 'Show Mermaid assistant'}
                    onClick={toggleChat}
                />
            </TooltipHost>
        </Stack>
    );

    /* ----- Footer (Apply/Cancel) in Panel footer ----- */
    const onRenderFooterContent = React.useCallback((): JSX.Element => (
        <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 8 }}>
            <PrimaryButton text="Apply" onClick={doApply} />
            <DefaultButton text="Cancel" onClick={doCancel} />
        </Stack>
    ), [doApply, doCancel]);

    /* ----- Grid:
       Chat hidden:   [Preview] [Handle] [Editor]
       Chat visible:  [Preview] [Handle] [Editor] [Handle] [Chat]
    ----- */
    const gridStyle: React.CSSProperties = showChat
        ? {
            display: 'grid',
            gridTemplateColumns: `${previewPct}% 8px ${100 - previewPct - chatPct}% 8px ${chatPct}%`,
            gridTemplateRows: 'min-content 1fr',
            height: '100%'
        }
        : {
            display: 'grid',
            gridTemplateColumns: `${previewPct}% 8px ${100 - previewPct}%`,
            gridTemplateRows: 'min-content 1fr',
            height: '100%'
        };

    const handleStyle: React.CSSProperties = { cursor: 'col-resize', background: 'transparent' };

    return (
        <Panel
            isOpen={isOpen}
            onDismiss={doCancel}
            type={PanelType.large}
            headerText={title}
            closeButtonAriaLabel="Close"
            isLightDismiss
            isFooterAtBottom={true}
            onRenderFooterContent={onRenderFooterContent}
        >
            <Stack tokens={{ childrenGap: 8 }} styles={{ root: { height: '100%' } }}>
                {Toolbar}

                <div ref={containerRef} style={gridStyle}>

                    {/* --- Preview (LEFT) --- */}
                    <div
                        style={{
                            gridColumn: '1 / 2',
                            gridRow: '1 / 3',
                            minWidth: 220,
                            overflow: 'auto',
                            borderRight: '1px solid #eee'
                        }}
                    >
                        {languageId === 'mermaid' ? (
                            svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : (
                                <pre style={{ color: '#a4262c', padding: 12, whiteSpace: 'pre-wrap' }}>
                                    {previewError ?? 'No preview'}
                                </pre>
                            )
                        ) : (
                            <div style={{ padding: 12, opacity: 0.8 }}>No preview renderer for “{languageId}”.</div>
                        )}
                    </div>

                    {/* --- Left handle: between Preview and Editor --- */}
                    <div
                        role="separator" aria-orientation="vertical" tabIndex={0}
                        onKeyDown={onKeyResize('left')} onMouseDown={onMouseDown('left')}
                        style={{ ...handleStyle, gridColumn: '2 / 3', gridRow: '1 / 3' }}
                        aria-label="Resize preview and editor panes"
                    />

                    {/* --- Editor (CENTER) --- */}
                    <div
                        style={{
                            gridColumn: showChat ? '3 / 4' : '3 / 4', // same column when chat hidden/visible
                            gridRow: '1 / 3',
                            minWidth: 240,
                            overflow: 'hidden',
                            borderRight: '1px solid #eee'
                        }}
                    >
                        <MonacoEditorHost
                            value={value}
                            height={Math.max(480, Math.floor(window.innerHeight * 0.68))}
                            languageId={languageId}
                            provider={provider}
                            onChange={setValue}
                        />
                    </div>

                    {/* --- Right handle (only when chat visible): between Editor and Chat --- */}
                    {showChat && (
                        <div
                            role="separator" aria-orientation="vertical" tabIndex={0}
                            onKeyDown={onKeyResize('right')} onMouseDown={onMouseDown('right')}
                            style={{ ...handleStyle, gridColumn: '4 / 5', gridRow: '1 / 3' }}
                            aria-label="Resize editor and chat panes"
                        />
                    )}

                    {/* --- Chat (RIGHT, toggle) --- */}
                    {showChat && (
                        <div
                            style={{
                                gridColumn: '5 / 6',
                                gridRow: '1 / 3',
                                minWidth: 180,
                                overflow: 'hidden'
                            }}
                        >
                            <AIChatPane
                                code={value}
                                onInsert={(snippet) => setValue(v => `${v}\n${snippet}`)}
                                onReplace={(snippet) => setValue(snippet)}
                                onExplainSelection={(_sel) => { /* optional: wire to Monaco selection */ }}
                            />
                        </div>
                    )}
                </div>
            </Stack>
        </Panel>
    );
};

export default ExpandedMonacoPanel;
