/* ============================================================
   MegaForm Builder — Global type declarations
   Shared by all modules in the Vite IIFE bundle.
   ============================================================ */

declare var MegaFormBuilder: any;
declare var MegaFormWidgets:  any;
declare var Sortable:         any;
declare var MFPrintSettings:  any;
declare var MFWorkflowRF:     any;
declare var WebSF:            any;

interface IMFWorkflowRF {
    init:  (formId: number, apiBase: string) => void;
    close: () => void;
    _state: {
        formId:     number;
        apiBase:    string;
        dirty:      boolean;
        formSchema: any;
    };
}

interface Window {
    MegaFormBuilder: any;
    MegaFormWidgets: any;
    MFWorkflowRF:    IMFWorkflowRF;
    MFPrintSettings: any;
    MFBuilderDom:    any;
    MFBuilderGallery:any;
    initBuilder:     (fId: number, schemaJson: string, tplId: string | null) => void;
    setStatus:       (s: string) => void;
    enterBuilder:    (tplId?: string) => void;
    WebSF:           any;
}
