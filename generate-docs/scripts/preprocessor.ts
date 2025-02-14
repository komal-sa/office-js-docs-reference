#!/usr/bin/env node --harmony

import { fetchAndThrowOnError, DtsBuilder } from './util';
import { promptFromList } from './simple-prompts';
import * as path from "path";
import * as fsx from 'fs-extra';
import yaml = require('js-yaml');

tryCatch(async () => {
    // ----
    // Display prompts
    // ----
    console.log('\n\n');
    const urlToCopyOfficeJsFrom = await promptFromList({
        message: `What is the source of the Office-js TypeScript definition file that should be used to generate the RELEASE docs?`,
        choices: [
            { name: "DefinitelyTyped", value: "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/office-js/index.d.ts" },
            { name: "Prod CDN", value: "https://appsforoffice.officeapps.live.com/lib/1.1/hosted/office.d.ts" },
            { name: "Local file [generate-docs\\script-inputs\\office.d.ts]", value: "" }
        ]

        // Note: using "appsforoffice.officeapps.live.com" instead of "appsforoffice.microsoft.com"
        //     to avoid being redirected to the EDOG environment on corpnet.
        // If we ever want to generate not just public d.ts but also "office-with-first-party.d.ts",
        //     replace the filename.
    });

    console.log('\n');
    const urlToCopyPreviewOfficeJsFrom = await promptFromList({
        message: `What is the source of the Office-js TypeScript definition file that should be used to generate the PREVIEW docs?`,
        choices: [
            { name: "DefinitelyTyped (preview)", value: "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/office-js-preview/index.d.ts" },
            { name: "Beta CDN", value: "https://appsforoffice.officeapps.live.com/lib/beta/hosted/office.d.ts" },
            { name: "Local file [generate-docs\\script-inputs\\office_preview.d.ts]", value: "" }
        ]
    });

    console.log('\n');
    const urlToCopyCustomFunctionsRuntimeFrom = await promptFromList({
        message: `What is the source of the Custom Functions Runtime TypeScript definition file that should be used to generate the docs?`,
        choices: [
            { name: "DefinitelyTyped", value: "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/custom-functions-runtime/index.d.ts" },
            { name: "Local file [generate-docs\\script-inputs\\custom-functions-runtime.d.ts]", value: "" }
        ]
    });

    console.log('\n');
    const urlToCopyOfficeRuntimeFrom = await promptFromList({
        message: `What is the source of the Office Runtime TypeScript definition file that should be used to generate the docs?`,
        choices: [
            { name: "DefinitelyTyped", value: "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/office-runtime/index.d.ts" },
            { name: "Local file [generate-docs\\script-inputs\\office-runtime.d.ts]", value: "" }
        ]
    });

    console.log("\nStarting preprocessor script...");

    // ----
    // Process office.d.ts
    // ----
    const localReleaseDtsPath = "../script-inputs/office.d.ts";
    if (urlToCopyOfficeJsFrom.length > 0) {
        fsx.writeFileSync(localReleaseDtsPath, await fetchAndThrowOnError(urlToCopyOfficeJsFrom, "text"));
    }

    const localPreviewDtsPath = "../script-inputs/office_preview.d.ts";
    if (urlToCopyPreviewOfficeJsFrom.length > 0) {
        fsx.writeFileSync(localPreviewDtsPath, await fetchAndThrowOnError(urlToCopyPreviewOfficeJsFrom, "text"));
    }

    let releaseDefinitions = cleanUpDts(localReleaseDtsPath);
    let previewDefinitions = cleanUpDts(localPreviewDtsPath);

    const dtsBuilder = new DtsBuilder();

    console.log("\nCreating separate d.ts files...");

    console.log("create file: office.d.ts");
    fsx.writeFileSync(
        '../api-extractor-inputs-office/office.d.ts',
        handleCommonImports(dtsBuilder.extractDtsSection(previewDefinitions, "Begin Office namespace", "End Office namespace") +
        '\n' +
        '\n' +
        dtsBuilder.extractDtsSection(releaseDefinitions, "Begin OfficeExtension runtime", "End OfficeExtension runtime"), "Common API")
    );

    console.log("\ncreate file: excel.d.ts (preview)");
    fsx.writeFileSync(
        '../api-extractor-inputs-excel/excel.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(excelSpecificCleanup(dtsBuilder.extractDtsSection(previewDefinitions, "Begin Excel APIs", "End Excel APIs"))), "Other")
    );

    console.log("\ncreate file: excel.d.ts (release)");
    fsx.writeFileSync(
        '../api-extractor-inputs-excel-release/excel_1_9/excel.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(excelSpecificCleanup(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin Excel APIs", "End Excel APIs"))), "Other", true)
    );

    console.log("create file: onenote.d.ts");
    fsx.writeFileSync(
        '../api-extractor-inputs-onenote/onenote.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin OneNote APIs", "End OneNote APIs")), "Other")
    );

    console.log("create file: outlook.d.ts (preview)");
    fsx.writeFileSync(
        '../api-extractor-inputs-outlook/outlook.d.ts',
        handleCommonImports(dtsBuilder.extractDtsSection(previewDefinitions, "Begin Exchange APIs", "End Exchange APIs"), "Outlook")
    );

    console.log("create file: outlook.d.ts (release)");
    fsx.writeFileSync(
        '../api-extractor-inputs-outlook-release/outlook_1_7/outlook.d.ts',
        handleCommonImports(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin Exchange APIs", "End Exchange APIs"), "Outlook", true)
    );

    console.log("create file: powerpoint.d.ts");
    fsx.writeFileSync(
        '../api-extractor-inputs-powerpoint/powerpoint.d.ts',
        handleCommonImports(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin PowerPoint APIs", "End PowerPoint APIs"), "Other")
    );

    console.log("create file: visio.d.ts");
    fsx.writeFileSync(
        '../api-extractor-inputs-visio/visio.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin Visio APIs", "End Visio APIs")), "Other")
    );

    console.log("create file: word.d.ts (preview)");
    fsx.writeFileSync(
        '../api-extractor-inputs-word/word.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(wordSpecificCleanup(dtsBuilder.extractDtsSection(previewDefinitions, "Begin Word APIs", "End Word APIs"))), "Other")
    );

    console.log("\ncreate file: word.d.ts (release)");
    fsx.writeFileSync(
        '../api-extractor-inputs-word-release/word_1_3/word.d.ts',
        handleCommonImports(handleLiteralParameterOverloads(wordSpecificCleanup(dtsBuilder.extractDtsSection(releaseDefinitions, "Begin Word APIs", "End Word APIs"))), "Other", true)
    );

    // ----
    // Process Custom Functions d.ts
    // ----
    if (urlToCopyCustomFunctionsRuntimeFrom.length > 0) {
        fsx.writeFileSync("../script-inputs/custom-functions-runtime.d.ts", await fetchAndThrowOnError(urlToCopyCustomFunctionsRuntimeFrom, "text"));
    }
    console.log(`\nReading from ${path.resolve("../script-inputs/custom-functions-runtime.d.ts")}`);
    let definitionsForCfs : string = fsx.readFileSync("../script-inputs/custom-functions-runtime.d.ts").toString();

    console.log("Fixing issues with d.ts file...");
    definitionsForCfs = applyRegularExpressions(definitionsForCfs);

    console.log("create file: custom-functions-runtime.d.ts");
    fsx.writeFileSync('../api-extractor-inputs-custom-functions-runtime/custom-functions-runtime.d.ts', definitionsForCfs);

    // ----
    // Process Office Runtime d.ts
    // ----
    if (urlToCopyOfficeRuntimeFrom.length > 0) {
        fsx.writeFileSync("../script-inputs/office-runtime.d.ts", await fetchAndThrowOnError(urlToCopyOfficeRuntimeFrom, "text"));
    }
    console.log(`\nReading from ${path.resolve("../script-inputs/office-runtime.d.ts")}`);
    let definitionsForORun : string = fsx.readFileSync("../script-inputs/office-runtime.d.ts").toString();

    console.log("Fixing issues with d.ts file...");
    definitionsForORun = applyRegularExpressions(definitionsForORun);

    console.log("create file: office-runtime.d.ts");
    fsx.writeFileSync('../api-extractor-inputs-office-runtime/office-runtime.d.ts', definitionsForORun);

    // ----
    // Process Snippets
    // ----
    console.log("\nRemoving old snippets input files...");

    const scriptInputsPath = path.resolve("../script-inputs");
    fsx.readdirSync(scriptInputsPath)
        .filter(filename => filename.indexOf("snippets") > 0)
        .forEach(filename => fsx.removeSync(scriptInputsPath + '/' + filename));

    console.log("\nCreating snippets file...");

    console.log("\nReading from: https://raw.githubusercontent.com/OfficeDev/office-js-snippets/master/snippet-extractor-output/snippets.yaml");
    fsx.writeFileSync("../script-inputs/script-lab-snippets.yaml", await fetchAndThrowOnError("https://raw.githubusercontent.com/OfficeDev/office-js-snippets/master/snippet-extractor-output/snippets.yaml", "text"));

    console.log("\nReading from files: " + path.resolve("../../docs/code-snippets"));

    const snippetsSourcePath = path.resolve("../../docs/code-snippets");
    let localCodeSnippetsString : string = "";
    fsx.readdirSync(path.resolve(snippetsSourcePath))
        .filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))
        .forEach((filename, index) => {
            localCodeSnippetsString += fsx.readFileSync(`${snippetsSourcePath}/${filename}`).toString() + "\r\n";
        });

    fsx.writeFileSync("../script-inputs/local-repo-snippets.yaml", localCodeSnippetsString);

    // Parse the YAML into an object/hash set.
    let snippets: Object = yaml.load(localCodeSnippetsString);

    // If a duplicate key exists, merge the Script Lab example(s) into the item with the existing key.
    let scriptLabSnippets: Object = yaml.load(fsx.readFileSync(`../script-inputs/script-lab-snippets.yaml`).toString());
    for (const key of Object.keys(scriptLabSnippets)) {
        if (snippets[key]) {
            console.log("Combining local and Script Lab snippets for: " + key);
            snippets[key] = snippets[key].concat(scriptLabSnippets[key]);
        } else {
            snippets[key] = scriptLabSnippets[key];
        }
    }

    console.log("\nWriting snippets to: " + path.resolve("../json/snippets.yaml"));

    fsx.writeFileSync("../json/snippets.yaml", yaml.safeDump(
        snippets,
        {sortKeys: <any>((a: string, b: string) => {
            if (a < b) {
                return -1;
            } else if (a > b) {
                return 1;
            } else {
                return 0;
            }
        })}
    ));

    console.log("\nPreprocessor script complete!");

    process.exit(0);
});

function excelSpecificCleanup(dtsContent: string) {
    return dtsContent.replace(/export interface .*Set {\n.*Icon;/gm, `/** [Api set: ExcelApi 1.2] */\n\t$&`)
        .replace("readonly runtime: Runtime;", "/** [Api set: ExcelApi 1.5] **/\n\t\treadonly runtime: Runtime;")
        .replace("export interface IconCollections {", "/** [Api set: ExcelApi 1.2] */\n\texport interface IconCollections {")
        .replace("var icons: IconCollections;", "/** [Api set: ExcelApi 1.2] */\n\tvar icons: IconCollections;");
}

function wordSpecificCleanup(dtsContent: string) {
    return dtsContent.replace("readonly application: Application;", "/** [Api set: WordApi 1.3] **/\n\t\treadonly application: Application;");
}

function cleanUpDts(localDtsPath: string): string {
    console.log(`\nReading from ${path.resolve(localDtsPath)}`);
    let definitions = fsx.readFileSync(localDtsPath).toString();

    console.log("\nFixing issues with d.ts file...");
    return applyRegularExpressions(
        definitions
        .replace(/([ ]*)load\(option\?: string \| string\[\]\): (Excel|Word|OneNote|Visio)\.(.*);/g,
                 "$1/**\n$1 * Queues up a command to load the specified properties of the object. You must call `context.sync()` before reading the properties.\n$1 * @param propertyNames - A comma-delimited string or an array of strings that specify the properties to load.\n$1 */\n$1load(propertyNames?: string | string[]): $2.$3;")
        .replace(/([ ]*)load\(option\?: {\n[ ]*select\?: string;\n[ ]*expand\?: string;\n[ ]*}\): (Excel|Word|OneNote|Visio)\.(.*);/gm,
                 "$1/**\n$1 * Queues up a command to load the specified properties of the object. You must call `context.sync()` before reading the properties.\n$1 * @param propertyNamesAndPaths - Where propertyNamesAndPaths.select is a comma-delimited string that specifies the properties to load, and propertyNamesAndPaths.expand is a comma-delimited string that specifies the navigation properties to load.\n$1 */\n$1load(propertyNamesAndPaths?: { select?: string; expand?: string; }): $2.$3;")
        .replace(/([ ]*)load\(option\?: (Excel|Word|OneNote|Visio)\.Interfaces\.(.*)CollectionLoadOptions & [Excel|Word|OneNote|Visio]\.Interfaces\.CollectionLoadOptions\): [Excel|Word|OneNote|Visio]\.[.*]Collection;/g,
                 "$1/**\n$1 * Queues up a command to load the specified properties of the object. You must call `context.sync()` before reading the properties.\n$1 * @param collectionLoadOptions - Where collectionLoadOptions.select is a comma-delimited string that specifies the properties to load, and collectionLoadOptions.expand is a comma-delimited string that specifies the navigation properties to load. collectionLoadOptions.top specifies the maximum number of collection items that can be included in the result. collectionLoadOptions.skip specifies the number of items that are to be skipped and not included in the result. If collectionLoadOptions.top is specified, the result set will start after skipping the specified number of items.\n$1 */\n$1load(collectionLoadOptions?: $2.Interfaces.$3CollectionLoadOptions & $2.Interfaces.CollectionLoadOptions): $2.$3Collection;")
        .replace(/(extends OfficeCore.RequestContext)/g, `extends OfficeExtension.ClientRequestContext`));
}


// ----
// Helper function to apply regular expressions to d.ts file contents
// ----
function applyRegularExpressions (definitionsIn) {
    return definitionsIn.replace(/^(\s*)(declare namespace)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(declare module)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(namespace)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(class)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(interface)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(module)(\s+)/gm, `$1export $2$3`)
        .replace(/^(\s*)(function)(\s+)/gm, `$1export $2$3`)
        .replace(/(\s*)(@param)(\s+)(\w+)(\s)(\s)/g, `$1$2$3$4$5`)
        .replace(/(\s*)(@param)(\s+)(\w+)(\s+)([^\-])/g, `$1$2$3$4$5- $6`);
}

function handleCommonImports(hostDts: string, hostName: "Common API" | "Outlook" | "Other", isVersioned?: boolean): string {
    const commonApiNamespaceImport = "import \{ OfficeExtension \} from \"" + (isVersioned ? "../" : "") + "../api-extractor-inputs-office/office\"\n";
    const outlookApiNamespaceImport = "import \{ Office as Outlook\} from \"" + (isVersioned ? "../" : "") + "../api-extractor-inputs-outlook/outlook\"\n";
    const commonApiNamespaceImportForOutlook = "import \{Office as CommonAPI\} from \"" + (isVersioned ? "../" : "") + "../api-extractor-inputs-office/office\"\n";
    if (hostName === "Outlook") {
        hostDts = hostDts.replace(/: Office\./g, ": CommonAPI.").replace(/\<Office\./g, "<CommonAPI.");
        return commonApiNamespaceImportForOutlook + hostDts;
    } else if (hostName === "Common API") {
        hostDts = hostDts.replace(/Office\.Mailbox/g, "Outlook.Mailbox").replace(/Office\.RoamingSettings/g, "Outlook.RoamingSettings");
        return outlookApiNamespaceImport + hostDts;
    } else {
        hostDts = hostDts.replace(/Office\.Mailbox/g, "Outlook.Mailbox").replace(/Office\.RoamingSettings/g, "Outlook.RoamingSettings");
        return commonApiNamespaceImport + outlookApiNamespaceImport + hostDts;
    }
}

function handleLiteralParameterOverloads(dtsString: string): string {
    // rename parameters for string literal overloads
    const matches = dtsString.match(/([a-zA-Z]+)\??: (\"[a-zA-Z]*\").*:/g);
    let matchIndex = 0;
    matches.forEach((match) => {
        let parameterName = match.substring(0, match.indexOf(": "));
        matchIndex = dtsString.indexOf(match, matchIndex);
        parameterName = parameterName.indexOf("?") >= 0 ? parameterName.substring(0, parameterName.length - 1) : parameterName;
        const parameterString = "@param " + parameterName + " ";
        const index = dtsString.lastIndexOf(parameterString, matchIndex);
        if (index < 0) {
            console.warn("Missing @param for literal parameter: " + match);
        } else {
        dtsString = dtsString.substring(0, index)
         + "@param " + parameterName + "String "
         + dtsString.substring(index + parameterString.length);
         matchIndex += match.length;
        }
    });

    return dtsString.replace(/([a-zA-Z]+)(\??: \"[a-zA-Z]*\".*:)/g, "$1String$2");
}

async function tryCatch(call: () => Promise<void>) {
    try {
        await call();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
