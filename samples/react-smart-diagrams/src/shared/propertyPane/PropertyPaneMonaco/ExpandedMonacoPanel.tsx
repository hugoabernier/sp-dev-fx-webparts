import * as React from 'react';
import { Stack } from '@fluentui/react';
import { IconButton } from '@fluentui/react/lib/Button';
import { Separator } from '@fluentui/react/lib/Separator';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import MonacoEditorHost from './MonacoEditorHost';
import { ILanguageProvider } from './languages/ILanguageProvider';
import mermaid from 'mermaid';
import AIChatPane from './AIChatPane';

type MermaidTheme = 'default' | 'neutral' | 'forest' | 'dark' | 'base';

export interface ExpandedMonacoPanelProps {
    initialValue: string;
    languageId: string;
    provider?: ILanguageProvider;
    theme?: MermaidTheme;
    onApply: (value: string) => void;
    onCancel: () => void;
}

/** Utility to debounce calls without lint warnings */
function useDebounced<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    const timer = React.useRef<number | undefined>(undefined);
    const saved = React.useRef(fn);
    React.useEffect(() => { saved.current = fn; }, [fn]);
    return React.useMemo(() => {
        const debounced = ((...args: unknown[]) => {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => saved.current(...args), ms);
        }) as T;
        return debounced;
    }, [ms]);
}

/** A tiny a11y-friendly splitter with mouse + keyboard */
function useThreePaneResizer() {
    // widths are percentages; center takes remaining
    const [leftPct, setLeftPct] = React.useState<number>(28);
    const [rightPct, setRightPct] = React.useState<number>(32);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const draggingRef = React.useRef<'left' | 'right' | null>(null);

    const clamp = (v: number): number => Math.min(70, Math.max(15, v));

    const onMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent<HTMLDivElement>): void => {
        e.preventDefault();
        draggingRef.current = side;
        (document.body).style.cursor = 'col-resize';
    };

    const onMouseMove = (e: MouseEvent): void => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        if (draggingRef.current === 'left') {
            setLeftPct(clamp(pct));
        } else {
            // right handle defines right edge percentage from left
            const right = 100 - clamp(100 - pct);
            setRightPct(100 - right);
        }
    };

    const onMouseUp = (): void => {
        draggingRef.current = null;
        (document.body).style.cursor = '';
    };

    React.useEffect(() => {
        const mm = (ev: MouseEvent) => onMouseMove(ev);
        const mu = () => onMouseUp();
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
        return () => {
            window.removeEventListener('mousemove', mm);
            window.removeEventListener('mouseup', mu);
        };
    }, []);

    // keyboard resizing (accessible separators)
    const onKeyResize = (side: 'left' | 'right') => (e: React.KeyboardEvent<HTMLDivElement>): void => {
        const step = (e.shiftKey ? 5 : 2);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (side === 'left') {
                setLeftPct(clamp(leftPct + (e.key === 'ArrowRight' ? step : -step)));
            } else {
                setRightPct(clamp(rightPct + (e.key === 'ArrowLeft' ? step : -step)));
            }
            e.preventDefault();
        }
    };

    return { containerRef, leftPct, rightPct, onMouseDown, onKeyResize };
}

const ExpandedMonacoPanel: React.FC<ExpandedMonacoPanelProps> = ({
    initialValue, languageId, provider, theme = 'default', onApply, onCancel
}) => {
    const [value, setValue] = React.useState<string>(initialValue);
    const [svg, setSvg] = React.useState<string>('');
    const [valid, setValid] = React.useState<boolean>(true);
    const [previewError, setPreviewError] = React.useState<string | null>(null);

    const { containerRef, leftPct, rightPct, onMouseDown, onKeyResize } = useThreePaneResizer();

    // preview rendering (debounced)
    const renderPreview = React.useCallback(async (text: string): Promise<void> => {
        try {
            await mermaid.parse(text);
            const out = await mermaid.render(`m-${Date.now()}`, text, undefined);
            setSvg(out.svg);
            setPreviewError(null);
            setValid(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err ?? 'Invalid Mermaid');
            setPreviewError(msg);
            setSvg('');
            setValid(false);
        }
    }, [theme]);

    const debouncedPreview = useDebounced((text: string) => { void renderPreview(text); }, 250);

    React.useEffect(() => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        void renderPreview(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // init once

    // live update preview
    React.useEffect(() => { debouncedPreview(value); }, [value, debouncedPreview]);

    // const doApply = (): void => onApply(value);

    const doFormat = (): void => {
        // no official Mermaid formatter; stub in case you add a formatter provider later
        // keep as no-op or implement a custom format function
    };

    const doValidate = async (): Promise<void> => { await renderPreview(value); };

    const copySvg = async (): Promise<void> => {
        if (!svg) return;
        await navigator.clipboard.writeText(svg);
    };
    

    // Toolbar
    const Toolbar = (
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} styles={{ root: { padding: '4px 0' } }}>

            <Separator vertical />
            <TooltipHost content="Validate (parse only)">
                <IconButton iconProps={{ iconName: 'CheckMark' }} aria-label="Validate" onClick={() => { void doValidate(); }} />
            </TooltipHost>
            <TooltipHost content="Format (coming soon)">
                <IconButton iconProps={{ iconName: 'Code' }} aria-label="Format" onClick={doFormat} />
            </TooltipHost>
            <TooltipHost content="Copy SVG to clipboard">
                <IconButton iconProps={{ iconName: 'Copy' }} aria-label="Copy SVG" onClick={() => { void copySvg(); }} disabled={!svg} />
            </TooltipHost>
            <Stack.Item grow />
            <span aria-live="polite" style={{ color: valid ? 'var(--successColor, #107c10)' : 'var(--errorColor, #a4262c)' }}>
                {valid ? '✔ Valid' : `✖ ${previewError ?? 'Invalid'}`}
            </span>
        </Stack>
    );

    // Layout grid: [Chat] [Handle] [Editor] [Handle] [Preview]
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `${leftPct}% 8px ${100 - leftPct - rightPct}% 8px ${rightPct}%`,
        gridTemplateRows: 'min-content 1fr',
        height: '100%'
    };

    const handleStyle: React.CSSProperties = {
        cursor: 'col-resize',
        background: 'transparent'
    };

    return (
        <Stack tokens={{ childrenGap: 8 }} styles={{ root: { height: '100%' } }}>
            {Toolbar}
            <div ref={containerRef} style={gridStyle}>

                {/* Chat pane */}
                <div style={{ gridColumn: '1 / 2', gridRow: '1 / 3', minWidth: 180, overflow: 'hidden', borderRight: '1px solid #eee' }}>
                    <AIChatPane
                        code={value}
                        onInsert={(snippet) => setValue(v => `${v}\n${snippet}`)}
                        onReplace={(snippet) => setValue(snippet)}
                        onExplainSelection={(selection) => {
                            // you can use this to prompt your AI with editor selection later
                            // for now, just no-op
                        }}
                    />
                </div>

                {/* Left handle */}
                <div
                    role="separator" aria-orientation="vertical" tabIndex={0}
                    onKeyDown={onKeyResize('left')} onMouseDown={onMouseDown('left')}
                    style={{ ...handleStyle, gridColumn: '2 / 3', gridRow: '1 / 3' }}
                    aria-label="Resize chat and editor panes"
                />

                {/* Editor */}
                <div style={{ gridColumn: '3 / 4', gridRow: '1 / 3', minWidth: 240, overflow: 'hidden', borderRight: '1px solid #eee' }}>
                    <MonacoEditorHost
                        value={value}
                        height={Math.max(480, Math.floor(window.innerHeight * 0.68))}
                        languageId={languageId}
                        provider={provider}
                        onChange={setValue}
                    />
                </div>

                {/* Right handle */}
                <div
                    role="separator" aria-orientation="vertical" tabIndex={0}
                    onKeyDown={onKeyResize('right')} onMouseDown={onMouseDown('right')}
                    style={{ ...handleStyle, gridColumn: '4 / 5', gridRow: '1 / 3' }}
                    aria-label="Resize editor and preview panes"
                />

                {/* Preview */}
                <div style={{ gridColumn: '5 / 6', gridRow: '1 / 3', minWidth: 220, overflow: 'auto' }}>
                    {svg ? (
                        <div dangerouslySetInnerHTML={{ __html: svg }} />
                    ) : (
                        <pre style={{ color: '#a4262c', padding: 12, whiteSpace: 'pre-wrap' }}>
                            {previewError ?? 'No preview'}
                        </pre>
                    )}
                </div>
            </div>
        </Stack>
    );
};

export default ExpandedMonacoPanel;
