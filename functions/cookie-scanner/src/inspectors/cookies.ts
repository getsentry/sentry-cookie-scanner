import { existsSync, readFileSync, writeFileSync } from 'fs';
import flatten from 'lodash.flatten';
import { join } from 'path';
import { Page } from 'puppeteer';
import { getDomain, getHostname } from 'tldts';
import { Cookie } from 'tough-cookie';
import { getScriptUrl, hasOwnProperty } from '../helpers/utils';

const parseCookie = (cookieStr:string, url:string) => {
    const cookie = Cookie.parse(cookieStr);
    try {
        if (typeof cookie !== 'undefined') {
            if (!!cookie.domain) {
                // what is the domain if not set explicitly?
                // https://stackoverflow.com/a/5258477/1407622
                cookie.domain = getHostname(url);
            }
            return cookie;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
};

export const setupHttpCookieCapture = async (page, eventHandler) => {
    await page.on('response', response => {
        try {
            const req = response.request();
            if (!response._headers) return;
            const cookieHTTP = response._headers['set-cookie'];
            if (cookieHTTP) {
                const stack = [
                    {
                        fileName: req.url(),
                        source: `set in Set-Cookie HTTP response header for ${req.url()}`
                    }
                ];
                const splitCookieHeaders = cookieHTTP.split('\n');
                const data = splitCookieHeaders.map(c => parseCookie(c, req.url()));
                // find main frame
                let frame = response.frame();
                while (frame.parentFrame()) {
                    frame = frame.parentFrame();
                }

                eventHandler({
                    data,
                    raw: cookieHTTP,
                    stack,
                    type: 'Cookie.HTTP',
                    url: frame.url() // or page.url(), // (can be about:blank if the request is issued by browser.goto)
                });
            }
        } catch (error) {
            console.log(error);
        }
    });
};

export const clearCookiesCache = async (page: Page) => {
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    await client.detach();
};

const getHTTPCookies = (events, url): any[] => {
    return flatten(
        events
            .filter(event => event.type && event.type.includes('Cookie.HTTP'))
            .map(event =>
                event.data
                    .filter(c => c)
                    .map(data => ({
                        domain: hasOwnProperty(data, 'domain') ? data.domain : getHostname(url),
                        name: data.key,
                        path: data.path,
                        script: getScriptUrl(event),
                        type: 'Cookie.HTTP',
                        value: data.value
                    }))
            )
    );
};

export const getJsCookies = (events, url) => {
    return events
        .filter(
            event =>
                event.type &&
                event.type.includes('JsInstrument.ObjectProperty') &&
                event.data.symbol.includes('cookie') &&
                event.data.operation.startsWith('set') &&
                typeof event.data.value !== 'undefined' &&
                typeof Cookie.parse(event.data.value) !== 'undefined'
        )
<<<<<<<< HEAD:functions/cookie-scanner/src/cookie-collector.ts
        .map(d => {
            const data = parseCookie(d.data.value, url);
            const hasOwnDomain = hasOwnProperty(d, 'domain') && d.domain !== null && d.domain !== undefined;
            const hasOwnName = data && hasOwnProperty(data, 'key') && data.key !== null && data.key !== undefined;
            const hasOwnPath = data && hasOwnProperty(data, 'path') && data.path !== null && data.path !== undefined;
            const hasOwnValue = data && hasOwnProperty(data, 'value') && data.value !== null && data.value !== undefined;
            const script = getScriptUrl(d);
========
        .map(event => {
            const data         = parseCookie(event.data.value, url);
            const hasOwnDomain = hasOwnProperty(event, 'domain') && 
                                 event.domain !== null && 
                                 event.domain !== undefined;
            const hasOwnName   = data && 
                                 hasOwnProperty(data, 'key') && 
                                 data.key !== null && 
                                 data.key !== undefined;
            const hasOwnPath   = data && 
                                 hasOwnProperty(data, 'path') && 
                                 data.path !== null && 
                                 data.path !== undefined;
            const hasOwnValue  = data && 
                                 hasOwnProperty(data, 'value') && 
                                 data.value !== null && 
                                 data.value !== undefined;
            const script       = getScriptUrl(event);
>>>>>>>> upstream/main:functions/cookie-scanner/src/inspectors/cookies.ts

            return {
                domain: hasOwnDomain ? event.domain : getDomain(url),
                name: hasOwnName ? data.key : '',
                path: hasOwnPath ? data.path : '',
                script,
                type: event.type,
                value: hasOwnValue ? data.value : ''
            };
        });
};

export const matchCookiesToEvents = (cookies, events, url) => {
    const jsCookies = getJsCookies(events, url);
    const httpCookie = getHTTPCookies(events, url);

    if (cookies.length < 1) {
        const js = jsCookies
            .map(jsCookie => ({
                ...jsCookie,
                third_party: getDomain(url) !== getDomain(`cookie://${jsCookie.domain}${jsCookie.path}`),
                type: 'js'
            }))
            .filter(
                (thing, index, self) =>
                    index === self.findIndex(
                        t => t.name === thing.name && t.domain === thing.domain
                    )
            );
        const http = httpCookie
            .map(httpCookie => ({
                ...httpCookie,
                third_party: getDomain(url) !== getDomain(`cookie://${httpCookie.domain}${httpCookie.path}`),
                type: 'http'
            }))
            .filter(
                (thing, index, self) => 
                    index === self.findIndex(
                        t => t.name === thing.name && t.domain === thing.domain && t.value === thing.value
                    )
            );
        return [...js, ...http];
    }
    const final = cookies.map(cookie => {
        const isHttpCookie = httpCookie.find((c: any) => cookie.name === c.name && cookie.domain === c.domain && cookie.value === c.value);
        const isJsCookie = jsCookies.find((c: any) => cookie.name === c.name && cookie.domain === c.domain && cookie.value === c.value);

        let type = '';
        if (typeof isHttpCookie !== 'undefined' && typeof isJsCookie !== 'undefined') {
            type = 'both';
        } else if (typeof isHttpCookie !== 'undefined') {
            type = 'http';
        } else if (typeof isJsCookie !== 'undefined') {
            type = 'js';
        } else {
            type = 'unknown';
        }

        const third_party = getDomain(url) === getDomain(`cookie://${cookie.domain}${cookie.path}`) ? false : true;
        return { ...cookie, type, third_party };
    });
    return final.sort((a, b) => b.expires - a.expires);
};

// NOTE: There is a bug in chrome that prevents us from catching all the cookies being set using its instrumentation
// https://blog.ermer.de/2018/06/11/chrome-67-provisional-headers-are-shown/
// The following call using the dev tools protocol ensures we get all the cookies even if we cant trace the source for each call
export const captureBrowserCookies = async (page, outDir, filename = 'browser-cookies.json') => {
    const client = await page.target().createCDPSession();
    const browser_cookies = (await client.send('Network.getAllCookies')).cookies.map(cookie => {
        if (cookie.expires > -1) {
            // add derived attributes for convenience
            cookie.expires = new Date(cookie.expires * 1000);
        }
        cookie.domain = cookie.domain.replace(/^\./, ''); // normalise domain value
        return cookie;
    });
    await client.detach();
    try {
        writeFileSync(join(outDir, filename), JSON.stringify({ browser_cookies }, null, 2));
    } catch (error) {
        console.log(error);
        console.log('Couldnt save browser cookies to file');
    }
    return browser_cookies;
};

export const loadBrowserCookies = (dataDir, filename = 'browser-cookies.json') => {
    try {
        if (existsSync(join(dataDir, filename))) {
            const cookies = JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
            return cookies.browser_cookies || [];
        } else {
            return [];
        }
    } catch (error) {
        console.log('Couldnt load browser cookies');
        console.log(error);
        return [];
    }
};
