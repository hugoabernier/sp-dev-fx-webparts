import * as React from 'react';
import { Stack } from '@fluentui/react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { Label } from '@fluentui/react/lib/Label';
import MonacoEditorHost from './MonacoEditorHost';
import type { ILanguageProvider } from './languages/ILanguageProvider';
import ExpandedMonacoPanel from './ExpandedMonacoPanel';

export interface MonacoPropertyFieldHostProps {
    value: string;
    height: number;
    languageId: string;
    provider?: ILanguageProvider;
    label?: string;
    enableExpandPanel: boolean;
    expandButtonText: string;
    panelTitle: string;
    onChange?: (v: string) => void;
}

const MonacoPropertyFieldHost: React.FC<MonacoPropertyFieldHostProps> = ({
    value,
    height,
    languageId,
    provider,
    label,
    enableExpandPanel,
    expandButtonText,
    panelTitle,
    onChange
}) => {
    // 🔑 Local state drives the small editor so it updates immediately on Apply
    const [currentValue, setCurrentValue] = React.useState<string>(value);

    // Keep local state in sync if parent prop changes externally
    React.useEffect(() => {
        setCurrentValue(value);
    }, [value]);

    const [isOpen, setIsOpen] = React.useState<boolean>(false);

    const openPanel = (): void => {
        // start the panel from the latest inline value
        setIsOpen(true);
    };


    const onInlineChange = (v: string): void => {
        setCurrentValue(v);   // keep inline responsive as you type
        onChange?.(v);        // still propagate to web part for live preview
    };

    return (
        <Stack tokens={{ childrenGap: 8 }}>
            {label ? <Label>{label}</Label> : null}

            {/* Inline, compact editor driven by local state */}
            <MonacoEditorHost
                value={currentValue}
                height={height}
                languageId={languageId}
                provider={provider}
                onChange={onInlineChange}
            />

            {enableExpandPanel && (
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <PrimaryButton text={expandButtonText} onClick={openPanel} />
                    {/* You can add a Reset button here if you track defaults */}
                </Stack>
            )}

            <ExpandedMonacoPanel
                isOpen={isOpen}
                title={panelTitle}
                initialValue={currentValue}
                languageId={languageId}
                provider={provider}
                theme="default"
                onApply={(v: string) => {
                    // ✅ update small editor immediately and propagate to properties
                    setCurrentValue(v);
                    onChange?.(v);
                    setIsOpen(false);
                }}
                onCancel={() => {
                    setIsOpen(false);
                }}
            />
        </Stack>
    );
};

export default MonacoPropertyFieldHost;
