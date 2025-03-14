import { Page } from 'puppeteer';
export declare const DEFAULT_INPUT_VALUES: {
    date: string;
    email: string;
    password: string;
    search: string;
    text: string;
    url: string;
    organization: string;
    'organization-title': string;
    'current-password': string;
    'new-password': string;
    username: string;
    'family-name': string;
    'given-name': string;
    name: string;
    'street-address': string;
    'address-line1': string;
    'postal-code': string;
    'cc-name': string;
    'cc-given-name': string;
    'cc-family-name': string;
    'cc-number': string;
    'cc-exp': string;
    'cc-type': string;
    'transaction-amount': string;
    bday: string;
    sex: string;
    tel: string;
    'tel-national': string;
    impp: string;
};
export declare const fillForms: (page: Page, timeout?: number) => Promise<unknown>;
export declare const autoScroll: (page: any) => Promise<void>;
