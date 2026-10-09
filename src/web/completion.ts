import { Node, Tree } from "web-tree-sitter";
import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    Position,
    Range
} from "vscode-languageserver-types";
import {
    DocState,
    Scope,
    UdtMember,
    UserDefinedVariable,
    VariableData,
    findScope,
    getScopeKey
} from "./parser";

// Port of csound-lsp/src/completion.rs: keep the two in step.

export interface CompletionSources {
    uri: string;
    doc: DocState;
    opcodes: Map<string, any>;
    flags: Map<string, any>;
    macros: Map<string, any>;
}

export type Region = "options" | "orchestra" | "score" | "other";

export interface CursorContext {
    offset: number;        // offset of the cursor in the document (UTF-16 units, as web-tree-sitter)
    lineBefore: string;    // current line up to the cursor
    prefix: string;        // identifier characters right before the cursor
    beforePrefix: string;  // current line up to the prefix
}

const SECTION_TAG = /<(\/?)(CsOptions|CsInstruments|CsScore|CsoundSynthesi[sz]er|CabbageARA|Cabbage|CsFileB|CsFile|CsMidifileB|CsSampleB|CsLicen[cs]e|CsShortLicen[cs]e|html|CsTest)([^>]*)>/g;
const BLOCK_BOUNDARY = /^[ \t]*(instr|opcode|endin|endop)\b[ \t]*([^\s,;(]*)/gm;
const DEFINITION_LINE = /^\s*(instr|opcode)\b/;
const STRUCT_CHAIN = /([A-Za-z_]\w*(?:\[[^\]]*\])*(?:\.[A-Za-z_]\w*(?:\[[^\]]*\])*)*)\.$/;
const SNIPPET_PLACEHOLDER = /\$\{?\d/;
const SYNTHESIZER_START = /<CsoundSynthesi[sz]er>/;

// opcode reference entry holding the .csd skeleton
const CSD_TEMPLATE = "CsoundSynthesizer";

const BASE_TYPES = [
    "a", "i", "k", "b", "S", "f", "w", "InstrDef", "Instr", "Opcode", "OpcodeDef", "Complex"
];

// keywords that have no entry in the opcode reference
const KEYWORDS = [
    "then", "ithen", "kthen", "fi", "do", "od", "case", "default", "endsw", "void", "true", "false"
];

// CompletionTriggerKind.Invoked
const TRIGGER_INVOKED = 1;

function isWordChar(c: string): boolean {
    return /[A-Za-z0-9_]/.test(c);
}

function matchesPrefix(name: string, prefix: string): boolean {
    return name.length >= prefix.length && name.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

function decodeEntities(s: string): string {
    return s
        .replace(/&ldquo;/g, "“")
        .replace(/&rdquo;/g, "”")
        .replace(/&lsquo;/g, "‘")
        .replace(/&rsquo;/g, "’")
        .replace(/&commat;/g, "@")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function bodyText(data: any): string {
    const body = data["body"];
    return Array.isArray(body) ? body.join("\n") : String(body ?? "");
}

export function cursorContext(text: string, pos: Position): CursorContext | undefined {
    let lineStart = 0;
    for (let i = 0; i < pos.line; i++) {
        const next = text.indexOf("\n", lineStart);
        if (next < 0) { return undefined; }
        lineStart = next + 1;
    }
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd < 0) { lineEnd = text.length; }

    let line = text.slice(lineStart, lineEnd);
    if (line.endsWith("\r")) { line = line.slice(0, -1); }

    const column = Math.min(pos.character, line.length);
    const lineBefore = line.slice(0, column);
    let split = lineBefore.length;
    while (split > 0 && isWordChar(lineBefore[split - 1])) { split--; }

    return {
        offset: lineStart + column,
        lineBefore,
        prefix: lineBefore.slice(split),
        beforePrefix: lineBefore.slice(0, split)
    };
}

export function regionAt(text: string, offset: number, uri: string): Region {
    const path = uri.split(/[?#]/)[0];
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const dot = fileName.lastIndexOf(".");
    const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";

    if (extension === "sco") { return "score"; }
    if (["orc", "udo", "inc"].includes(extension)) { return "orchestra"; }
    if (extension !== "csd" && !new RegExp(SECTION_TAG.source).test(text)) { return "orchestra"; }

    let region: Region = "other";
    for (const tag of text.slice(0, offset).matchAll(SECTION_TAG)) {
        if (tag[1] === "/") {
            region = "other";
            continue;
        }
        switch (tag[2]) {
            case "CsOptions":
                region = "options";
                break;
            case "CsInstruments":
                region = "orchestra";
                break;
            case "CsScore":
                region = tag[3].includes("bin") ? "other" : "score";
                break;
            default:
                region = "other";
        }
    }
    return region;
}

function inCommentOrString(lineBefore: string): boolean {
    let inString = false;
    for (let i = 0; i < lineBefore.length; i++) {
        const c = lineBefore[i];
        if (inString) {
            if (c === "\\") { i++; }
            else if (c === "\"") { inString = false; }
            continue;
        }
        if (c === "\"") { inString = true; }
        else if (c === ";") { return true; }
        else if (c === "/" && lineBefore[i + 1] === "/") { return true; }
    }
    return inString;
}

function inBlockComment(tree: Tree, offset: number): boolean {
    if (offset === 0) { return false; }
    const node = tree.rootNode.descendantForIndex(offset - 1, offset);
    return !!node && node.type === "block_comment" && node.startIndex < offset && offset < node.endIndex;
}

function textScopeAt(text: string, offset: number): Scope | undefined {
    let scope: Scope | undefined = undefined;
    for (const block of text.slice(0, offset).matchAll(BLOCK_BOUNDARY)) {
        switch (block[1]) {
            case "instr":
                scope = { kind: "INSTR", name: block[2] };
                break;
            case "opcode":
                scope = { kind: "UDO", name: block[2] };
                break;
            default:
                scope = undefined;
        }
    }
    return scope;
}

function scopeAt(doc: DocState, offset: number): Scope {
    const probe = Math.max(0, offset - 1);
    let node: Node | null | undefined = doc.tree?.rootNode.namedDescendantForIndex(probe, probe);
    // findScope gives up on ERROR nodes: start from the first valid ancestor
    while (node && node.type === "ERROR") { node = node.parent; }

    const scope: Scope = node
        ? findScope(node, doc.userDefinitions.userDefinedTypes)
        : { kind: "GLOBAL" };

    if (scope.kind === "INSTR" || scope.kind === "UDO" || scope.kind === "SCORE") {
        return scope;
    }
    // the tree may not see the enclosing block while the code is being written
    return textScopeAt(doc.text, offset) ?? scope;
}

function typeLabel(data: VariableData): string {
    let base = "";
    switch (data.dataType.kind) {
        case "INIT_TIME": base = "i"; break;
        case "KONTROL_RATE": base = "k"; break;
        case "AUDIO_RATE": base = "a"; break;
        case "STRING": base = "S"; break;
        case "SPECTRAL": base = "f"; break;
        case "BOOL": base = "b"; break;
        case "INSTR_DEF": base = "InstrDef"; break;
        case "INSTR": base = "Instr"; break;
        case "OPCODE": base = "Opcode"; break;
        case "OPCODE_DEF": base = "OpcodeDef"; break;
        case "COMPLEX": base = "Complex"; break;
        case "TYPE_DEF": base = data.dataType.name; break;
        default: base = "";
    }
    return data.dataShape.kind === "ARRAY" ? base + "[]".repeat(data.dataShape.size) : base;
}

function variableItems(doc: DocState, scope: Scope, ctx: CursorContext, items: CompletionItem[]) {
    const typedStart = ctx.offset - ctx.prefix.length;

    const push = (variable: UserDefinedVariable, documentation: string) => {
        const isMacro = variable.dataType?.dataType.kind === "MACRO";
        if (variable.isUndefined || isMacro || !matchesPrefix(variable.varName, ctx.prefix)) { return; }
        const detail = variable.dataType ? typeLabel(variable.dataType) : "";
        items.push({
            label: variable.varName,
            kind: CompletionItemKind.Variable,
            detail: detail || undefined,
            documentation,
            sortText: `0${variable.varName}`
        });
    };

    const locals = doc.userDefinitions.userDefinedLocalVars.get(getScopeKey(scope));
    for (const variable of locals?.values() ?? []) {
        // a local variable is offered only after its first definition
        if (variable.definitionLocation !== undefined && variable.definitionLocation < typedStart) {
            push(variable, "Local variable");
        }
    }

    for (const variable of doc.userDefinitions.userDefinedGlobalVars.values()) {
        // a global may be defined anywhere, but not by the word being typed
        if (variable.definitionLocation !== undefined && variable.definitionLocation !== typedStart) {
            push(variable, "Global variable");
        }
    }
}

function udoItems(doc: DocState, prefix: string, items: CompletionItem[], seen: Set<string>) {
    const sources: [Map<string, { signature: string }>, string][] = [
        [doc.userDefinitions.userDefinedOpcodes, "User-defined opcode"]
    ];
    for (const udoFile of doc.cachedIncludedUdoFiles.values()) {
        sources.push([udoFile.userDefinedOpcodes, `User-defined opcode from ${udoFile.fileName ?? udoFile.path}`]);
    }

    for (const [opcodes, documentation] of sources) {
        for (const [name, udo] of opcodes) {
            if (!matchesPrefix(name, prefix) || seen.has(name)) { continue; }
            seen.add(name);
            items.push({
                label: name,
                kind: CompletionItemKind.Function,
                detail: udo.signature,
                documentation,
                sortText: `1${name}`
            });
        }
    }
}

function opcodeItems(opcodes: Map<string, any>, prefix: string, items: CompletionItem[], seen: Set<string>) {
    for (const [name, data] of opcodes) {
        const isValidName = /^[A-Za-z_]/.test(name);
        if (!isValidName || name === CSD_TEMPLATE || !matchesPrefix(name, prefix) || seen.has(name)) { continue; }
        const body = bodyText(data);
        const isSnippet = SNIPPET_PLACEHOLDER.test(body);
        items.push({
            label: name,
            kind: isSnippet ? CompletionItemKind.Snippet : CompletionItemKind.Function,
            detail: data["prefix"],
            documentation: data["description"],
            insertText: body,
            insertTextFormat: isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
            sortText: `2${name}`
        });
    }
}

// The .csd skeleton, offered in a .csd that has no <CsoundSynthesizer> yet. A `<` typed
// before the name is replaced too.
function templateItems(src: CompletionSources, ctx: CursorContext, pos: Position): CompletionItem[] | undefined {
    if (SYNTHESIZER_START.test(src.doc.text) || !matchesPrefix(CSD_TEMPLATE, ctx.prefix)) { return undefined; }
    const data = src.opcodes.get(CSD_TEMPLATE);
    if (!data) { return undefined; }

    const typedAngle = ctx.beforePrefix.endsWith("<");
    const range: Range = {
        start: { line: pos.line, character: ctx.beforePrefix.length - (typedAngle ? 1 : 0) },
        end: { line: pos.line, character: ctx.lineBefore.length }
    };
    const body = bodyText(data);

    return [{
        label: CSD_TEMPLATE,
        kind: CompletionItemKind.Snippet,
        detail: data["prefix"],
        documentation: data["description"],
        filterText: typedAngle ? `<${CSD_TEMPLATE}` : CSD_TEMPLATE,
        textEdit: { range, newText: body },
        insertTextFormat: SNIPPET_PLACEHOLDER.test(body) ? InsertTextFormat.Snippet : InsertTextFormat.PlainText
    }];
}

function keywordItems(prefix: string, items: CompletionItem[]) {
    for (const keyword of KEYWORDS) {
        if (!matchesPrefix(keyword, prefix)) { continue; }
        items.push({
            label: keyword,
            kind: CompletionItemKind.Keyword,
            sortText: `3${keyword}`
        });
    }
}

function typeItems(doc: DocState, prefix: string): CompletionItem[] {
    const items: CompletionItem[] = [];
    const seen = new Set<string>();
    const push = (name: string, kind: CompletionItemKind, documentation: string) => {
        if (!matchesPrefix(name, prefix) || seen.has(name)) { return; }
        seen.add(name);
        items.push({ label: name, kind, documentation });
    };

    for (const type of BASE_TYPES) {
        push(type, CompletionItemKind.TypeParameter, "Data type");
    }
    for (const type of doc.userDefinitions.userDefinedTypes.values()) {
        push(type.udtName, CompletionItemKind.Struct, type.udtFormat);
    }
    for (const udoFile of doc.cachedIncludedUdoFiles.values()) {
        for (const type of udoFile.typeList) {
            push(type, CompletionItemKind.Struct, `User-defined type from ${udoFile.fileName ?? udoFile.path}`);
        }
    }
    return items;
}

// `name:` is a type annotation, unlike `a ? b : c` or an array slice `arr[1:`
function isTypeAnnotation(beforePrefix: string): boolean {
    if (!beforePrefix.endsWith(":")) { return false; }
    const head = beforePrefix.slice(0, -1);
    const last = head[head.length - 1] ?? "";
    const followsName = isWordChar(last) || last === ")" || last === "]";
    const openBrackets = (head.match(/\[/g)?.length ?? 0) > (head.match(/\]/g)?.length ?? 0);
    return followsName && !openBrackets && !head.includes("?");
}

function variableType(doc: DocState, scope: Scope, name: string): string | undefined {
    const variable = doc.userDefinitions.userDefinedLocalVars.get(getScopeKey(scope))?.get(name)
        ?? doc.userDefinitions.userDefinedGlobalVars.get(name);
    const dataType = variable?.dataType?.dataType;
    if (dataType?.kind === "TYPE_DEF") { return dataType.name; }
    return doc.cachedTypedVars.get(name);
}

function structMembers(doc: DocState, typeName: string): UdtMember[] | undefined {
    const name = typeName.trim().replace(/(?:\[\])+$/, "");
    const local = doc.userDefinitions.userDefinedTypes.get(name);
    if (local) { return local.udtMembers; }
    for (const udoFile of doc.cachedIncludedUdoFiles.values()) {
        const included = udoFile.userDefinedTypes.get(name);
        if (included) { return included.udtMembers; }
    }
    return undefined;
}

function structMemberItems(doc: DocState, scope: Scope, ctx: CursorContext): CompletionItem[] | undefined {
    const chain = ctx.beforePrefix.match(STRUCT_CHAIN)?.[1];
    if (!chain) { return undefined; }
    const segments = chain.split(".").map(s => s.split("[")[0]);

    let typeName = variableType(doc, scope, segments[0]);
    for (const member of segments.slice(1)) {
        if (!typeName) { return undefined; }
        typeName = structMembers(doc, typeName)?.find(m => m.name === member)?.type;
    }
    if (!typeName) { return undefined; }

    const members = structMembers(doc, typeName);
    if (!members) { return undefined; }

    const owner = typeName.replace(/(?:\[\])+$/, "");
    return members
        .filter(m => matchesPrefix(m.name, ctx.prefix))
        .map(m => ({
            label: m.name,
            kind: CompletionItemKind.Field,
            detail: m.type,
            documentation: `Field of struct ${owner}`
        }));
}

function macroItems(src: CompletionSources, prefix: string): CompletionItem[] {
    const items: CompletionItem[] = [];
    const sources: [Iterable<{ macroName: string, macroLabel: string, macroValue: string }>, string][] = [
        [src.doc.userDefinitions.userDefinedMacros.values(), "User-defined macro"]
    ];
    for (const udoFile of src.doc.cachedIncludedUdoFiles.values()) {
        sources.push([udoFile.userDefinedMacros.values(), `User-defined macro from ${udoFile.fileName ?? udoFile.path}`]);
    }

    for (const [macros, documentation] of sources) {
        for (const macro of macros) {
            if (!matchesPrefix(macro.macroName, prefix)) { continue; }
            items.push({
                label: macro.macroLabel,
                kind: CompletionItemKind.Constant,
                detail: `#${macro.macroValue}#`,
                documentation,
                filterText: macro.macroName,
                insertText: macro.macroName
            });
        }
    }

    for (const [name, value] of src.macros) {
        if (!matchesPrefix(name, prefix)) { continue; }
        items.push({
            label: name,
            kind: CompletionItemKind.Constant,
            detail: value["value"],
            documentation: `equivalent to: ${value["equivalent_to"]}`
        });
    }
    return items;
}

function flagItems(src: CompletionSources, ctx: CursorContext, pos: Position): CompletionItem[] | undefined {
    const wordStart = ctx.lineBefore.search(/\S+$/);
    const word = wordStart >= 0 ? ctx.lineBefore.slice(wordStart) : "";
    if (!word.startsWith("-")) { return undefined; }

    const range: Range = {
        start: { line: pos.line, character: wordStart },
        end: { line: pos.line, character: ctx.lineBefore.length }
    };

    const items: CompletionItem[] = [];
    const seen = new Set<string>();
    for (const data of src.flags.values()) {
        for (const rawAlternative of String(data["prefix"] ?? "").split(",")) {
            const alternative = decodeEntities(rawAlternative.trim());
            const nameEnd = alternative.search(/[=:\[#\s]/);
            const name = nameEnd >= 0 ? alternative.slice(0, nameEnd) : alternative;
            if (name.length < 2 || !name.startsWith(word)) { continue; }

            const newText = nameEnd >= 0 && alternative[nameEnd] === "=" ? `${name}=` : name;
            if (seen.has(newText)) { continue; }
            seen.add(newText);

            items.push({
                label: alternative,
                kind: CompletionItemKind.Property,
                documentation: decodeEntities(String(data["description"] ?? "").trim()),
                filterText: newText,
                sortText: name,
                textEdit: { range, newText }
            });
        }
    }
    return items;
}

export function complete(src: CompletionSources, pos: Position, triggerKind?: number): CompletionItem[] | undefined {
    const doc = src.doc;
    if (!doc.tree) { return undefined; }

    const ctx = cursorContext(doc.text, pos);
    if (!ctx) { return undefined; }
    if (inCommentOrString(ctx.lineBefore) || inBlockComment(doc.tree, ctx.offset)) { return undefined; }

    const region = regionAt(doc.text, ctx.offset, src.uri);
    if (region === "options") { return flagItems(src, ctx, pos); }

    const trigger = ctx.beforePrefix[ctx.beforePrefix.length - 1];
    if (trigger === "$" && (region === "orchestra" || region === "score")) {
        return macroItems(src, ctx.prefix);
    }

    if (region === "other") { return templateItems(src, ctx, pos); }
    if (region !== "orchestra") { return undefined; }

    const scope = scopeAt(doc, ctx.offset);
    if (trigger === ".") { return structMemberItems(doc, scope, ctx); }
    if (trigger === ":" && isTypeAnnotation(ctx.beforePrefix)) { return typeItems(doc, ctx.prefix); }

    // e.g. `-` typed in an expression
    const invoked = triggerKind === undefined || triggerKind === TRIGGER_INVOKED;
    if (ctx.prefix.length === 0 && !invoked) { return undefined; }

    // names of new instruments and opcodes
    if (DEFINITION_LINE.test(ctx.lineBefore)) { return undefined; }

    const items: CompletionItem[] = [];
    const seen = new Set<string>();
    variableItems(doc, scope, ctx, items);
    udoItems(doc, ctx.prefix, items, seen);
    opcodeItems(src.opcodes, ctx.prefix, items, seen);
    keywordItems(ctx.prefix, items);
    return items;
}
