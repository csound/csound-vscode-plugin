/// <reference lib="webworker" />
/// <reference lib="dom" />

import { DiagnosticSeverity, DiagnosticTag, TextDocumentSyncKind } from 'vscode-languageserver';
import { TextDocument, TextEdit } from 'vscode-languageserver-textdocument';
import { Parser, Language, Query, Point, Node } from 'web-tree-sitter';
import { updateTree, DocState, GError, GenericError, isValidType, iterateTree, parseUdoFile } from './parser';
import { complete } from './completion';
import {
    SEMANTIC_TOKEN_TYPE,
    getSemanticTokens,
    getInjections,
    getUnusedLabelFromKind,
    getUndefinedLabelFromKind,
    getCleanNodeText,
    ResolveIncludedUdoResult
} from './utils';

import {
    createConnection,
    BrowserMessageReader,
    BrowserMessageWriter,
    TextDocuments,
    InitializeResult,
    Hover,
    CompletionItem,
    SemanticTokensBuilder,
    DocumentFormattingParams,
    Diagnostic
} from 'vscode-languageserver/browser';

const messageReader = new BrowserMessageReader(self as any);
const messageWriter = new BrowserMessageWriter(self as any);
const connection = createConnection(messageReader, messageWriter);

const documents = new TextDocuments(TextDocument);

let parser: Parser;
let csoundLanguage: Language;
let docs: Map<string, DocState> = new Map();

let highlightsQuery: Query;
let indentsQuery: Query;
let injectionsQuery: Query;

let opcodeFromManual: Record<string, string>;

let jsonOpcodes: Map<string, any>;
let jsonFlags: Map<string, any>;
let jsonMacros: Map<string, any>;

let injectedLanguages: Record<string, { parser: Parser, query: Query }> = {};

function base64ToUint8Array(base64: string | undefined): Uint8Array {
    if (!base64) {
        throw new Error("Missing Base64 data (undefined)");
    }

    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function nodeDiagnostic(
    node: Node,
    severity: DiagnosticSeverity,
    message: string,
    tags: DiagnosticTag[] = [],
    expandToLine = false,
    textLines: string[] = []
): Diagnostic {
    const start = node.startPosition;
    const end = expandToLine
        ? { row: start.row, column: textLines[start.row]?.length ?? start.column }
        : node.endPosition;

    return {
        range: {
            start: { line: start.row, character: expandToLine ? 0 : start.column },
            end: { line: end.row, character: end.column }
        },
        severity,
        source: "csound-lsp",
        message,
        tags
    };
}

function pushDiagnostic(diagnostics: Diagnostic[], cachedDiagnostics: Set<string>, diagnostic: Diagnostic) {
    const { start, end } = diagnostic.range;
    const diagKey = `${start.line}:${start.character}-${end.line}:${end.character}-${diagnostic.message}`;
    if (!cachedDiagnostics.has(diagKey)) {
        cachedDiagnostics.add(diagKey);
        diagnostics.push(diagnostic);
    }
}

function isKnownFlag(flag: string): boolean {
    for (const data of jsonFlags.values()) {
        const prefixes = String(data["prefix"] ?? "").split(",");
        for (const prefix of prefixes) {
            // "--env:NAME=VAL", "--devices[=in|out]", "-H#": keep only the flag name
            const normalized = prefix
                .split(/[=\s:\[#]/)
                [0]
                ?.trim();
            if (normalized === flag) { return true; }
        }
    }
    return false;
}

function genericErrorMessage(genericError: GenericError, nodeText: string): { message: string, expandToLine: boolean } {
    switch (genericError.errorType) {
        case GError.syntax:
            return { message: `Syntax error: <${nodeText}>`, expandToLine: false };
        case GError.explicitType:
            return { message: `Unknown type identifier: <${nodeText}>`, expandToLine: false };
        case GError.scoreStatement:
            return { message: "Unknown score statement syntax or missing mandatory p-fields", expandToLine: false };
        case GError.missingPfield:
            return { message: "Missing mandatory p-fields (p1, p2, p3)", expandToLine: false };
        case GError.controlLoopSyntaxError:
            return { message: "Unclosed control block", expandToLine: true };
        case GError.instrBlockSyntaxError:
            return { message: "Unclosed instr block", expandToLine: true };
        case GError.udoBlockSyntaxError:
            return { message: "Unclosed udo block", expandToLine: true };
        case GError.cabbageBlockError:
            return {
                message: "It is not possible to have a Cabbage and a Cabbage ARA block in the same .csd file",
                expandToLine: true
            };
        case GError.missing:
            const kind = genericError.node.type;
            return {
                message: genericError.node.isNamed ? `Missing ${kind}` : `Missing "${kind}"`,
                expandToLine: false
            };
    }
}

connection.onInitialize(async (params): Promise<InitializeResult> => {
    const options = params.initializationOptions;
    if (!options) { throw new Error("Missing options"); };

    try {
        const coreBuffer = base64ToUint8Array(options.mainWasmUri);
        await Parser.init({ wasmBinary: coreBuffer } as any);

        // csound
        parser = new Parser();
        const csoundBuffer = base64ToUint8Array(options.csoundWasmUri);
        csoundLanguage = await Language.load(csoundBuffer);
        parser.setLanguage(csoundLanguage);
        highlightsQuery = new Query(csoundLanguage, options.highlights);
        indentsQuery = new Query(csoundLanguage, options.indents);
        injectionsQuery = new Query(csoundLanguage, options.injections);

        opcodeFromManual = options.opcodeInfos;
        jsonOpcodes = options.opcodeCompletions;
        jsonFlags = options.flagCompletions;
        jsonMacros = options.macroCompletions;

        // html
        const htmlBuffer = base64ToUint8Array(options.htmlWasmUri);
        const htmlLanguage = await Language.load(htmlBuffer);
        const htmlParser = new Parser();
        htmlParser.setLanguage(htmlLanguage);
        const htmlHighlightsQuery = new Query(htmlLanguage, options.htmlHighlights);

        // json
        const jsonBuffer = base64ToUint8Array(options.jsonWasmUri);
        const jsonLanguage = await Language.load(jsonBuffer);
        const jsonParser = new Parser();
        jsonParser.setLanguage(jsonLanguage);
        const jsonHighlightsQuery = new Query(jsonLanguage, options.jsonHighlights);

        // python
        const pythonBuffer = base64ToUint8Array(options.pythonWasmUri);
        const pythonLanguage = await Language.load(pythonBuffer);
        const pythonParser = new Parser();
        pythonParser.setLanguage(pythonLanguage);
        const pythonHighlightsQuery = new Query(pythonLanguage, options.pythonHighlights);

        // bash
        const bashBuffer = base64ToUint8Array(options.bashWasmUri);
        const bashLanguage = await Language.load(bashBuffer);
        const bashParser = new Parser();
        bashParser.setLanguage(bashLanguage);
        const bashHighlightsQuery = new Query(bashLanguage, options.bashHighlights);

        // toml
        const tomlBuffer = base64ToUint8Array(options.tomlWasmUri);
        const tomlLanguage = await Language.load(tomlBuffer);
        const tomlParser = new Parser();
        tomlParser.setLanguage(tomlLanguage);
        const tomlHighlightsQuery = new Query(tomlLanguage, options.tomlHighlights);

        injectedLanguages["csound"] = { parser: parser, query: highlightsQuery };
        injectedLanguages["html"] = { parser: htmlParser, query: htmlHighlightsQuery };
        injectedLanguages["json"] = { parser: jsonParser, query: jsonHighlightsQuery };
        injectedLanguages["python"] = { parser: pythonParser, query: pythonHighlightsQuery };
        injectedLanguages["bash"] = { parser: bashParser, query: bashHighlightsQuery };
        injectedLanguages["toml"] = { parser: tomlParser, query: tomlHighlightsQuery };

        connection.console.log("Csound LSP-Web initialized!");

    } catch (error: any) {
        console.error("LSP Init Error:", error);
        return {
            capabilities: {},
            retry: false,
            message: error.message
        } as any;
    }

    return {
        capabilities: {
            textDocumentSync: {
                openClose: true,
                change: TextDocumentSyncKind.Full,
                save: true
            },
            hoverProvider: true,
            semanticTokensProvider: {
                legend: {
                    tokenTypes: SEMANTIC_TOKEN_TYPE,
                    tokenModifiers: []
                },
                full: true
            },
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', ':', '$', '-']
            },
            documentFormattingProvider: true
        }
    };
});

documents.onDidClose(params => {
    docs.delete(params.document.uri);
});

// Analyses the current version of a document and publishes its diagnostics.
function validateDocument(uri: string) {
    const doc = docs.get(uri);
    if (!doc || !doc.tree) { return; }

    let diagnostics: Diagnostic[] = [];
    let cachedDiagnostics: Set<string> = new Set<string>();

    const diagnosticReport = iterateTree(doc.tree, jsonMacros);
    doc.cachedTypedVars = diagnosticReport.typedVars;
    doc.userDefinitions = diagnosticReport.userDefinitions;
    doc.includedUdoFiles = diagnosticReport.includedUdoFiles;

    for (const [flag, flagNode] of diagnosticReport.flags.entries()) {
        if (!isKnownFlag(flag)) {
            pushDiagnostic(
                diagnostics,
                cachedDiagnostics,
                nodeDiagnostic(flagNode, DiagnosticSeverity.Error, `Unknown flag type: <${flag}>`)
            );
        }
    }

    for (const opcodeNode of diagnosticReport.opcodes) {
        const opcodeText = getCleanNodeText(opcodeNode.text);
        const opcodeType = opcodeText.split(":")[0] ?? opcodeText;
        const isIncludedUdo = Array
            .from(doc.cachedIncludedUdoFiles.values())
            .some(udoFile => udoFile.udoList.has(opcodeType));
        const isKnownOpcode = (
            diagnosticReport.udo.has(opcodeType) ||
            diagnosticReport.udt.has(opcodeType) ||
            doc.userDefinitions.userDefinedOpcodes.has(opcodeType) ||
            jsonOpcodes.has(opcodeText) ||
            jsonOpcodes.has(opcodeType) ||
            !!opcodeFromManual[opcodeType] ||
            isIncludedUdo
        );

        if (!isKnownOpcode) {
            pushDiagnostic(
                diagnostics,
                cachedDiagnostics,
                nodeDiagnostic(opcodeNode, DiagnosticSeverity.Error, `Unknown opcode: <${opcodeType}>`)
            );
        }
    }

    // For the time being, it is not possible to trace back to a new type.
    // for (const typeNode of diagnosticReport.types) {
    //     const typeIdentifier = getCleanNodeText(typeNode.text);
    //     const isTypeIncluded = Array
    //         .from(doc.cachedIncludedUdoFiles.values())
    //         .some(udoFile => udoFile.typeList.has(typeIdentifier));
    //     if (!isValidType(typeIdentifier) && !diagnosticReport.udt.has(typeIdentifier) && !isTypeIncluded) {
    //         pushDiagnostic(
    //             diagnostics,
    //             cachedDiagnostics,
    //             nodeDiagnostic(typeNode, DiagnosticSeverity.Error, `Unknown type identifier: <${typeIdentifier}>`)
    //         );
    //     }
    // }

    for (const genericError of diagnosticReport.genericErrors) {
        const nodeText = getCleanNodeText(genericError.node.text);
        const error = genericErrorMessage(genericError, nodeText);
        pushDiagnostic(
            diagnostics,
            cachedDiagnostics,
            nodeDiagnostic(
                genericError.node,
                DiagnosticSeverity.Error,
                error.message,
                [],
                error.expandToLine,
                doc.textLines
            )
        );
    }

    for (const varRef of doc.userDefinitions.userUnusedVars) {
        const findedNode = doc
            .tree!
            .rootNode
            .descendantForIndex(varRef.nodeLocation, varRef.nodeLocation);

        if (!findedNode) { continue; }

        const pKind = findedNode.parent?.type || "";
        const currentDiagnostic: Diagnostic = {
            range: {
                start: {
                    line: findedNode.startPosition.row,
                    character: findedNode.startPosition.column
                },
                end: {
                    line: findedNode.endPosition.row,
                    character: findedNode.endPosition.column
                }
            },
            severity: DiagnosticSeverity.Hint,
            source: "csound-lsp",
            message: getUnusedLabelFromKind(pKind),
            tags: [DiagnosticTag.Unnecessary]
        };

        pushDiagnostic(diagnostics, cachedDiagnostics, currentDiagnostic);
    };

    for (const varRef of doc.userDefinitions.userUndefinedVars) {
        const findedNode = doc
            .tree!
            .rootNode
            .descendantForIndex(varRef.nodeLocation, varRef.nodeLocation);

        if (!findedNode) { continue; }

        const pKind = findedNode.parent?.type || "";
        for (const nodeRange of varRef.references) {
            // macros defined in included .udo files are not undefined
            const pflag = pKind === "macro_usage" && Array
                .from(doc.cachedIncludedUdoFiles.values())
                .some(udoFile => udoFile.macroList.has(varRef.varName));
            if (!pflag) {
                const currentDiagnostic: Diagnostic = {
                    range: {
                        start: {
                            line: nodeRange.startPosition.row,
                            character: nodeRange.startPosition.column
                        },
                        end: {
                            line: nodeRange.endPosition.row,
                            character: nodeRange.endPosition.column
                        }
                    },
                    severity: DiagnosticSeverity.Error,
                    source: "csound-lsp",
                    message: getUndefinedLabelFromKind(pKind),
                    tags: []
                };

                pushDiagnostic(diagnostics, cachedDiagnostics, currentDiagnostic);
            }
        }
    }

    connection.sendDiagnostics({
        uri: uri,
        diagnostics: diagnostics
    });
}

// Reads the included .udo files through the client. With `onlyNew`, only files that
// were never read are requested. Returns true when the known definitions changed.
async function resolveIncludedUdoFiles(uri: string, onlyNew: boolean): Promise<boolean> {
    const doc = docs.get(uri);
    if (!doc) { return false; }

    let changed = false;
    for (const [udoFilePath, udoFileCaptured] of doc.includedUdoFiles.entries()) {
        const cached = doc.cachedIncludedUdoFiles.get(udoFilePath);
        if (onlyNew && (cached || doc.unresolvedUdoFiles.has(udoFilePath))) { continue; }

        try {
            const result = await connection.sendRequest<ResolveIncludedUdoResult | undefined>("csound-lsp/resolveIncludedUdo", {
                documentPath: uri,
                udoPath: udoFilePath
            });

            if (!result || result.content === undefined) {
                doc.unresolvedUdoFiles.add(udoFilePath);
                continue;
            }
            doc.unresolvedUdoFiles.delete(udoFilePath);
            if (cached && cached.contentHash === result.contentHash) { continue; }

            const udoFile = cached ?? udoFileCaptured;
            udoFile.content = result.content;
            udoFile.contentHash = result.contentHash;
            udoFile.fileName = result.pathBaseName;
            parseUdoFile(udoFile, parser);
            doc.cachedIncludedUdoFiles.set(udoFilePath, udoFile);
            changed = true;
        } catch (err) {
            connection.console.warn(`Something went wrong in resolve .udo file: ${err}`);
        }
    }

    // the document may have changed while the files were read
    const current = docs.get(uri) ?? doc;
    for (const cachedPath of Array.from(current.cachedIncludedUdoFiles.keys())) {
        if (!current.includedUdoFiles.has(cachedPath)) {
            current.cachedIncludedUdoFiles.delete(cachedPath);
            changed = true;
        }
    }
    return changed;
}

documents.onDidChangeContent(async (change) => {
    const uri = change.document.uri;
    updateTree(parser, change.document, docs);
    validateDocument(uri);
    if (await resolveIncludedUdoFiles(uri, true)) {
        validateDocument(uri);
    }
});

documents.onDidSave(async (change) => {
    const uri = change.document.uri;
    const doc = docs.get(uri);
    if (!doc) { return; }
    // included files may have been edited meanwhile: read them all again
    doc.unresolvedUdoFiles.clear();
    if (await resolveIncludedUdoFiles(uri, false)) {
        validateDocument(uri);
    }
});

connection.onHover(({ textDocument, position }): Hover | null => {
    const docState = docs.get(textDocument.uri);
    if (!docState || !docState.tree) { return null; }

    const rootNode = docState.tree!.rootNode;
    const nodePos: Point = { row: position.line, column: position.character };
    const currentNode = rootNode.descendantForPosition(nodePos, nodePos);

    if (!currentNode) { return null; }

    const nodeKind = currentNode.type;
    const nodeText = docState.text.slice(currentNode.startIndex, currentNode.endIndex).trim();
    const opName = getCleanNodeText(nodeText);

    switch (nodeKind) {
        case "opcode_name":
            const doc = opcodeFromManual[opName];
            if (doc) {
                return {
                    contents: {
                        kind: "markdown",
                        value: doc
                    }
                };
            }
            const localUdo = docState.userDefinitions.userDefinedOpcodes.get(opName);
            if (localUdo) {
                const md = `## User-Defined Opcode\n\`\`\`csound\n${localUdo.signature}\n\`\`\``;
                return {
                    contents: {
                        kind: "markdown",
                        value: md
                    }
                };
            }
            for (const udoFile of docState.cachedIncludedUdoFiles.values()) {
                const ud = udoFile.userDefinedOpcodes.get(opName);
                if (ud) {
                    const md = `## User-Defined Opcode (imported from ${udoFile.fileName})\n\`\`\`csound\n${ud.signature}\n\`\`\``;
                    return {
                        contents: {
                            kind: "markdown",
                            value: md
                        }
                    };
                }
            }
            return null;
        case "identifier":
            const nodeParent = currentNode.parent;
            const isType = nodeParent && ["typed_identifier", "type_identifier", "typed_opcode_name"].includes(nodeParent.type);
            let childTypeName = getCleanNodeText(currentNode.text) ?? "";
            if (isType) {
                const sd = docState.userDefinitions.userDefinedTypes.get(childTypeName);
                if (sd) {
                    const md = `## User-Defined Type\n\`\`\`csound\n${sd.udtFormat}\n\`\`\``;
                    return {
                        contents: {
                            kind: "markdown",
                            value: md
                        }
                    };
                }
                const opTypedName = opcodeFromManual[childTypeName];
                if (opTypedName) {
                    return {
                        contents: {
                            kind: "markdown",
                            value: opTypedName
                        }
                    };
                }
                for (const udoFile of docState.cachedIncludedUdoFiles.values()) {
                    const sd = udoFile.userDefinedTypes.get(opName);
                    if (sd) {
                        const md = `## User-Defined Type (imported from ${udoFile.fileName})\n\`\`\`csound\n${sd.udtFormat}\n\`\`\``;
                        return {
                            contents: {
                                kind: "markdown",
                                value: md
                            }
                        };
                    }
                }
            } else {
                return null;
            }
        default:
            return null;
    }
});

connection.onCompletion(({ textDocument, position, context }): CompletionItem[] => {
    const doc = docs.get(textDocument.uri);
    if (!doc) { return []; }

    const items = complete({
        uri: textDocument.uri,
        doc: doc,
        opcodes: jsonOpcodes,
        flags: jsonFlags,
        macros: jsonMacros
    }, position, context?.triggerKind);
    return items ?? [];
});

connection.languages.semanticTokens.on((params) => {
    const doc = documents.get(params.textDocument.uri);
    const docState = docs.get(params.textDocument.uri);
    if (!docState || !docState.tree || !highlightsQuery) { return { data: [] }; }
    if (!doc || (doc.version !== docState.version)) { return { data: [] }; }

    const tokenBuilder = new SemanticTokensBuilder();

    const csTokens = getSemanticTokens(highlightsQuery, docState.tree, docState.text);
    const injTokens = getInjections(injectionsQuery, docState.tree, injectedLanguages);

    const allTokens = [...csTokens, ...injTokens];
    const sortedTokens = allTokens.sort((a, b) => {
        if (a.line !== b.line) { return a.line - b.line; }
        return a.char - b.char;
    });

    let lastLine = -1;
    let lastEnd = 0;
    for (const token of sortedTokens) {
        if (token.line === lastLine && token.char < lastEnd) { continue; }
        tokenBuilder.push(token.line, token.char, token.length, token.index, token.modifier);
        lastLine = token.line;
        lastEnd = token.char + token.length;
    };

    return tokenBuilder.build();
});

connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    const docState = docs.get(params.textDocument.uri);
    if (!docState || !indentsQuery) { return []; }

    const tree = docState?.tree;
    const text = docState.text;
    const textLines = docState.textLines;
    const indents = new Array(textLines.length).fill(0);

    const edits: TextEdit[] = [];
    const rootNode = tree?.rootNode;
    if (rootNode) {
        const captures = indentsQuery.captures(rootNode);
        for (const capture of captures) {
            const cnode = capture.node;
            const start = cnode.startPosition.row;
            const end = cnode.endPosition.row;

            const cname = capture.name;
            if (cname === "indent.begin") {
                for (let i = start + 1; i <= end; i++) {
                    if (i < indents.length) { indents[i]++; }
                };
            } else if (cname === "indent.end" || cname === "indent.branch") {
                if (start < indents.length) {
                    indents[start] = Math.max(0, indents[start] - 1);
                }
            };
        }

        for (let i = 0; i < indents.length; i++) {
            const line = textLines[i];
            if (line.trim().length === 0) {
                if (line.length > 0) {
                    edits.push({
                        range: {
                            start: { line: i, character: 0 },
                            end: { line: i, character: line.length }
                        },
                        newText: ''
                    });
                }
                continue;
            }

            const desLevel = indents[i];
            const desIndent = params.options.insertSpaces
                ? ' '.repeat(desLevel * params.options.tabSize)
                : '\t'.repeat(desLevel);
            const currentIndentMatch = line.match(/^\s*/);
            const currentIndent = currentIndentMatch ? currentIndentMatch[0] : '';
            if (currentIndent !== desIndent) {
                edits.push({
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: currentIndent.length }
                    },
                    newText: desIndent
                });
            }
        }
    }

    return edits;

});

documents.listen(connection);
connection.listen();
