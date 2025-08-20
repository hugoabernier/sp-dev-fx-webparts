import * as React from 'react';
import * as ReactDom from 'react-dom';
import {
    IPropertyPaneField,
    IPropertyPaneCustomFieldProps,
    PropertyPaneFieldType
} from '@microsoft/sp-property-pane';
import MonacoPropertyFieldHost, {
    MonacoPropertyFieldHostProps
} from './MonacoPropertyFieldHost';
import { ILanguageProvider } from './languages/ILanguageProvider';

export interface IPropertyPaneMonacoProps {
    key: string;
    value: string;
    height?: number;
    languageId: string;
    provider?: ILanguageProvider;
    targetProperty: string;
    label?: string;
    /** Show the “Expand” button that opens the big editor panel */
    enableExpandPanel?: boolean;
    /** Optional button label/title texts */
    expandButtonText?: string;      // default: "Open full editor"
    panelTitle?: string;            // default: "Edit"
    /** Called whenever inline or panel editor changes text */
    onChange?: (newValue: string) => void;
}

interface IInternalProps extends IPropertyPaneMonacoProps, IPropertyPaneCustomFieldProps { }

export function PropertyPaneMonaco(
    targetProperty: string,
    properties: IPropertyPaneMonacoProps
): IPropertyPaneField<IInternalProps> {

    const props: IInternalProps = {
        ...properties,
        targetProperty,
        onRender: (elem: HTMLElement): void => {
            ReactDom.render(
                React.createElement(MonacoPropertyFieldHost, {
                    value: properties.value,
                    height: properties.height ?? 320,
                    languageId: properties.languageId,
                    provider: properties.provider,
                    label: properties.label,
                    enableExpandPanel: properties.enableExpandPanel ?? true,
                    expandButtonText: properties.expandButtonText ?? 'Open full editor',
                    panelTitle: properties.panelTitle ?? 'Edit',
                    onChange: properties.onChange
                } as MonacoPropertyFieldHostProps),
                elem
            );
        },
        onDispose: (elem: HTMLElement): void => { ReactDom.unmountComponentAtNode(elem); }
    };

    return {
        type: PropertyPaneFieldType.Custom,
        targetProperty,
        properties: props
    };
}
