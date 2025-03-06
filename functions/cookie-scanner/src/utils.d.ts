import { BlacklightEvent } from './types';
export declare const hasOwnProperty: (object: object, property: string) => any;
export declare const closeBrowser: (browser: any) => Promise<void>;
export declare const clearDir: (outDir: any, mkNewDir?: boolean) => void;
export declare const loadJSONSafely: (str: any) => any;
export declare const groupBy: (key: any) => (array: any) => any;
export declare const serializeCanvasCallMap: (inputMap: any) => {};
export declare const getScriptUrl: (item: BlacklightEvent) => any;
export declare const loadEventData: (dir: any, filename?: string) => any[];
export declare const getStackType: (stack: any, firstPartyDomain: any) => "first-party-only" | "third-party-only" | "mixed";
export declare const getStringHash: (algorithm: any, str: any) => string;
export declare const getHashedValues: (algorithm: any, object: any) => {};
