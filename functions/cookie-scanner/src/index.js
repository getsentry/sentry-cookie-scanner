"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.aggregateReports = exports.collect = void 0;
const functions = __importStar(require("@google-cloud/functions-framework"));
const storage_1 = require("@google-cloud/storage");
const path_1 = require("path");
const collector_1 = require("./collector");
const aggregateReports_1 = require("./aggregateReports");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const Sentry = __importStar(require("@sentry/node"));
var collector_2 = require("./collector");
Object.defineProperty(exports, "collect", { enumerable: true, get: function () { return collector_2.collect; } });
var aggregateReports_2 = require("./aggregateReports");
Object.defineProperty(exports, "aggregateReports", { enumerable: true, get: function () { return aggregateReports_2.aggregateReports; } });
// message format from pubsub:
// {
//     "title": "Sentry Cookie Scanner",
//     "scanner": {
//         "headless": true,
//         "numPages": 0,
//         "captureHar": false,
//         "saveScreenshots": false,
//         "emulateDevice": {
//             "viewport": {
//                 "height": 1920,
//                 "width": 1080
//             },
//             "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.3"
//         }
//     },
//     "maxConcurrent": 30,
//     "chunkSize": 500,
//     "total_pages": 3275,
//     "total_chunks": 7,
//     "chunk_no": 1,
//     "target": [
//         "https://page1.com",
//         "https://page2.com",
//         "https://page3.com",
//         "https://page4.com",
//         ...
//     ]
// }
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: "cookie-scanner",
});
async function scanUrl(url, customConfig) {
    const defaultConfig = {
        title: customConfig?.title,
        headless: customConfig?.headless,
        numPages: customConfig?.numPages,
        captureHar: customConfig?.captureHar,
        saveScreenshots: customConfig?.saveScreenshots,
        emulateDevice: {
            viewport: {
                width: 1280,
                height: 800
            },
            userAgent: customConfig?.emulateDevice?.userAgent ||
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
        },
        outDir: (0, path_1.join)(os.tmpdir(), customConfig?.outDir || 'out', url
            .replace(/^https?:\/\//, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+$/g, '')),
        reportDir: (0, path_1.join)(os.tmpdir(), customConfig?.reportDir || 'reports'),
        extraPuppeteerOptions: {
            protocolTimeout: 120000,
            timeout: 120000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        }
    };
    const config = { ...defaultConfig, ...customConfig };
    const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    // console.log(`Beginning scan of ${url}`);
    const result = await (0, collector_1.collect)(formattedUrl, config);
    if (result.status === 'success') {
        console.log(`Scan successful: ${config.outDir}`);
    }
    else {
        console.error(`Scan failed: ${result.page_response}`);
    }
}
const bucketName = process.env.AGGREGATE_REPORTS_BUCKET;
const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
const folderName = `${today}/`; // Folder with today's date
async function uploadReportToGCS(file_name, report, bucketName, folderName) {
    const storage = new storage_1.Storage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`${folderName}${file_name}.json`);
    try {
        await file.save(report, {
            public: false,
            metadata: {
                contentType: 'application/json'
            }
        });
        console.log(`Successfully uploaded report to GCS: ${file_name}`);
    }
    catch (error) {
        console.error('Error uploading report to GCS:', error);
        Sentry.captureException(error);
        throw error;
    }
}
exports.main = functions.http('main', async (rawMessage, res) => {
    try {
        // Decode message
        const data = rawMessage.body.message.data ? Buffer.from(rawMessage.body.message.data, 'base64').toString() : '{}';
        const parsedData = JSON.parse(data);
        console.log("--------------------------------");
        console.log(parsedData.title, " chunk_no: ", parsedData.chunk_no, " of ", parsedData.total_chunks);
        console.log("--------------------------------");
        const { title, scanner, target, maxConcurrent } = parsedData;
        const customConfig = {
            title,
            scanner,
            target,
            maxConcurrent,
            output: {
                outDir: 'out',
                reportDir: 'reports'
            }
        };
        let pagesToScan = parsedData.target;
        let running = 0;
        const queue = [...pagesToScan];
        try {
            if (!fs.existsSync((0, path_1.join)(os.tmpdir(), customConfig.output.outDir))) {
                fs.mkdirSync((0, path_1.join)(os.tmpdir(), customConfig.output.outDir), { recursive: true });
            }
            if (!fs.existsSync((0, path_1.join)(os.tmpdir(), customConfig.output.reportDir))) {
                fs.mkdirSync((0, path_1.join)(os.tmpdir(), customConfig.output.reportDir), { recursive: true });
            }
        }
        catch (dirError) {
            console.error('Error creating directories:', dirError);
            Sentry.captureException(dirError);
            throw dirError;
        }
        async function processNext() {
            while (queue.length > 0 && running < maxConcurrent) {
                const page = queue.shift();
                running++;
                // Use immediately invoked async function to handle each scan
                (async () => {
                    try {
                        console.log(`Attempting first scan for: ${page}`);
                        await scanUrl(page, customConfig);
                    }
                    catch (error) {
                        Sentry.captureException(`First scan attempt failed for ${page}:`, error);
                        console.log(`First scan attempt failed for ${page}:`, error);
                        // if failed, try again
                        try {
                            console.log(`Attempting retry scan for: ${page}`);
                            await scanUrl(page, customConfig);
                        }
                        catch (retryError) {
                            Sentry.captureException(`Retry scan failed for ${page}:`, retryError);
                            console.error(`Retry scan failed for ${page}:`, retryError);
                        }
                    }
                    finally {
                        running--;
                        console.log(`Completed processing for: ${page}. Running count: ${running}`);
                        processNext();
                    }
                })();
            }
        }
        // Start the processing
        await processNext();
        // Wait until all scans are complete
        while (running > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('All scans completed, generating aggregate report');
        const aggregatedReport = await (0, aggregateReports_1.aggregateReports)(customConfig);
        console.log('Successfully generated aggregate report:', aggregatedReport);
        await uploadReportToGCS(parsedData.chunk_no, aggregatedReport, bucketName, folderName);
        console.log('Successfully uploaded aggregate report to GCS');
        res.status(200).json({
            success: true,
            report: aggregatedReport
        });
    }
    catch (error) {
        console.error('Error in main function:', error);
        Sentry.captureException(error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDZFQUErRDtBQUMvRCxtREFBZ0Q7QUFDaEQsK0JBQTRCO0FBQzVCLDJDQUF3RDtBQUN4RCx5REFBc0Q7QUFFdEQsdUNBQXlCO0FBQ3pCLHVDQUF5QjtBQUV6QixxREFBdUM7QUFFdkMseUNBQXdEO0FBQS9DLG9HQUFBLE9BQU8sT0FBQTtBQUNoQix1REFBc0Q7QUFBN0Msb0hBQUEsZ0JBQWdCLE9BQUE7QUFFekIsOEJBQThCO0FBQzlCLElBQUk7QUFDSix3Q0FBd0M7QUFDeEMsbUJBQW1CO0FBQ25CLDRCQUE0QjtBQUM1Qix5QkFBeUI7QUFDekIsK0JBQStCO0FBQy9CLG9DQUFvQztBQUNwQyw2QkFBNkI7QUFDN0IsNEJBQTRCO0FBQzVCLGtDQUFrQztBQUNsQyxnQ0FBZ0M7QUFDaEMsaUJBQWlCO0FBQ2pCLDRJQUE0STtBQUM1SSxZQUFZO0FBQ1osU0FBUztBQUNULDJCQUEyQjtBQUMzQix3QkFBd0I7QUFDeEIsMkJBQTJCO0FBQzNCLHlCQUF5QjtBQUN6QixxQkFBcUI7QUFDckIsa0JBQWtCO0FBQ2xCLCtCQUErQjtBQUMvQiwrQkFBK0I7QUFDL0IsK0JBQStCO0FBQy9CLCtCQUErQjtBQUMvQixjQUFjO0FBQ2QsUUFBUTtBQUNSLElBQUk7QUFFSixNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ1IsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVTtJQUMzQixnQkFBZ0IsRUFBRSxHQUFHO0lBQ3JCLFdBQVcsRUFBRSxnQkFBZ0I7Q0FDaEMsQ0FBQyxDQUFDO0FBRUgsS0FBSyxVQUFVLE9BQU8sQ0FBQyxHQUFXLEVBQUUsWUFBd0M7SUFDeEUsTUFBTSxhQUFhLEdBQXFCO1FBQ3BDLEtBQUssRUFBRSxZQUFZLEVBQUUsS0FBSztRQUMxQixRQUFRLEVBQUUsWUFBWSxFQUFF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