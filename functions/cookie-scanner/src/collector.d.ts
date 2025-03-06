import { PuppeteerLifeCycleEvent, PuppeteerLaunchOptions } from 'puppeteer';
export type CollectorOptions = Partial<typeof DEFAULT_OPTIONS>;
declare const DEFAULT_OPTIONS: {
    outDir: string;
    reportDir: string;
    title: string;
    emulateDevice: import("puppeteer").Device;
    captureHar: boolean;
    captureLinks: boolean;
    enableAdBlock: boolean;
    clearCache: boolean;
    quiet: boolean;
    headless: boolean;
    defaultTimeout: number;
    numPages: number;
    defaultWaitUntil: PuppeteerLifeCycleEvent;
    saveBrowserProfile: boolean;
    saveScreenshots: boolean;
    headers: {};
    blTests: string[];
    puppeteerExecutablePath: string;
    extraChromiumArgs: string[];
    extraPuppeteerOptions: Partial<PuppeteerLaunchOptions>;
};
export declare const collect: (inUrl: string, args: CollectorOptions) => Promise<any>;
export {};
