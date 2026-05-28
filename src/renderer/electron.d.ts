/* Electron preload script type definition */
declare global {
  interface Window {
    electronAPI: {
      getWindows: () => Promise<Array<{
        id: number;
        processName: string;
        title: string;
        handle: string;
        isDisabled: boolean;
      }>>;
      disableFocus: (windowInfo: {
        id: number;
        processName: string;
        title: string;
        handle: string;
      }) => Promise<boolean>;
      enableFocus: (windowInfo: {
        id: number;
        processName: string;
        title: string;
        handle: string;
      }) => Promise<boolean>;
      batchDisableFocus: (windowList: Array<{
        id: number;
        processName: string;
        title: string;
        handle: string;
      }>) => Promise<Array<{ success: boolean }>>;
      batchEnableFocus: (windowList: Array<{
        id: number;
        processName: string;
        title: string;
        handle: string;
      }>) => Promise<Array<{ success: boolean }>>;
      getDisabledRules: () => Promise<Array<{
        processName: string;
        keyword: string;
        disabledAt: string;
      }>>;
      removeDisabledRule: (processName: string) => Promise<boolean>;
    };
  }
}

export {};