import * as React from 'react';
import * as ReactDom from 'react-dom';
import {
    IPropertyPaneField,
    IPropertyPaneCustomFieldProps,
    PropertyPaneFieldType
} from '@microsoft/sp-property-pane';
import MonacoEditorHost from './MonacoEditorHost';
import { ILanguageProvider } from './languages/ILanguageProvider';

export interface IPropertyPaneMonacoProps {
    key: string;
    value: string;
    height?: number;
    languageId: string;                 // e.g., 'mermaid'
    provider?: ILanguageProvider;       // plug-in for syntax/validation
    targetProperty: string;
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
        onRender: (elem) => {
            ReactDom.render(
                React.createElement(MonacoEditorHost, {
                    value: properties.value ?? '',
                    height: properties.height ?? 360,
                    languageId: properties.languageId,
                    provider: properties.provider,
                    minimap: false,
                    lineNumbers: 'off',
                    onChange: properties.onChange
                }),
                elem
            );
        },
        onDispose: (elem) => ReactDom.unmountComponentAtNode(elem)
    };

    return {
        type: PropertyPaneFieldType.Custom,
        targetProperty,
        properties: props
    };
}
