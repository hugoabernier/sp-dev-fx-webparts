import {
    IPropertyPaneCustomFieldProps,
    IPropertyPaneField,
    PropertyPaneFieldType
} from '@microsoft/sp-property-pane';


import * as React from 'react';
import * as ReactDom from 'react-dom';
import MonacoEditorHost from './MonacoEditorHost';

export interface IPropertyPaneMonacoProps {
    key: string;
    value: string;
    height?: number;
    languageId?: string; // we'll use "mermaid"
    onChange?: (newValue: string) => void;
    targetProperty: string;
}

interface IInternalProps extends IPropertyPaneMonacoProps, IPropertyPaneCustomFieldProps { }

export function PropertyPaneMonaco(
    targetProperty: string,
    properties: IPropertyPaneMonacoProps
): IPropertyPaneField<IInternalProps> {

    const props: IInternalProps = {
        ...properties,
        key: properties.key,
        onRender: (elem, _ctx, _change) => {
            ReactDom.render(
                React.createElement(MonacoEditorHost, {
                    value: properties.value ?? '',
                    height: properties.height ?? 300,
                    languageId: properties.languageId ?? 'mermaid',
                    onChange: properties.onChange
                }),
                elem
            );
        },
        onDispose: (elem) => ReactDom.unmountComponentAtNode(elem)
    };

    return {
        type: PropertyPaneFieldType.Custom,   // ✅ instead of 1
        targetProperty,
        properties: props
    };
}
