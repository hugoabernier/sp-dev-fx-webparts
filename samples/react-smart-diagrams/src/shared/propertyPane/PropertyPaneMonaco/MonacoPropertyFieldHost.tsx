import * as React from 'react';
import { Stack } from '@fluentui/react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Label } from '@fluentui/react/lib/Label';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
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
    const [panelValue, setPanelValue] = React.useState<string>(value);

    const openPanel = (): void => {
        // start the panel from the latest inline value
        setPanelValue(currentValue);
        setIsOpen(true);
    };

    const dismissPanel = (): void => {
        // discard edits, keep inline as-is
        setIsOpen(false);
    };

    const applyPanel = (): void => {
        // ✅ update inline editor immediately
        setCurrentValue(panelValue);
        // ✅ notify the web part so properties update and preview redraws
        onChange?.(panelValue);
        setIsOpen(false);
    };

    const onInlineChange = (v: string): void => {
        setCurrentValue(v);   // keep inline responsive as you type
        onChange?.(v);        // still propagate to web part for live preview
    };

    const buttonStyles = { root: { marginRight: 8 } };

    // This panel doesn't actually save anything; the buttons are just an example of what
    // someone might want to render in a panel footer.
    const onRenderFooterContent = React.useCallback(
        () => (
            <div>
                <PrimaryButton onClick={applyPanel} styles={buttonStyles}>
                    Apply
                </PrimaryButton>
                <DefaultButton onClick={dismissPanel}>Cancel</DefaultButton>
            </div>
        ),
        [dismissPanel, applyPanel],
    );


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

            <Panel
                isOpen={isOpen}
                onDismiss={dismissPanel}
                type={PanelType.large}
                headerText={panelTitle}
                closeButtonAriaLabel="Close"
                onRenderFooterContent={onRenderFooterContent}
                isFooterAtBottom={true}
                isLightDismiss
            >
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { height: '100%' } }}>
                    <div style={{ height: '70vh' }}>
                        <ExpandedMonacoPanel
                            initialValue={panelValue}
                            languageId={languageId}
                            provider={provider}
                            theme="default"
                            onApply={(v) => {
                                setPanelValue(v);
                                // update inline + web part properties
                                setCurrentValue(v);
                                onChange?.(v);
                                setIsOpen(false);
                            }}
                            onCancel={() => setIsOpen(false)}
                        />
                    </div>
                </Stack>
            </Panel>
        </Stack>
    );
};

export default MonacoPropertyFieldHost;
