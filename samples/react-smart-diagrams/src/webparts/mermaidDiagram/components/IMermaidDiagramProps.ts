import { MermaidTheme } from "./MermaidPreview";

export interface IMermaidDiagramProps {
  definition: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  mermaidTheme: MermaidTheme;
}
