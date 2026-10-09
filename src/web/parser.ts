import { TextDocument } from "vscode-languageserver-textdocument";
import { Node, Parser, Point, Range, Tree } from "web-tree-sitter";
import { getCleanNodeText, getNameAndTypeFromLegacyVar } from "./utils";

export interface DocState {
    tree: Tree | null;
    text: string;
    textLines: string[];
    version: number;
    userDefinitions: UserDefinitions,
    cachedTypedVars: Map<string, string>,
    cachedIncludedUdoFiles: Map<string, UdoFile>,
    // .udo files included by the last analysed version of the document
    includedUdoFiles: Map<string, UdoFile>,
    // includes that could not be read; retried on save
    unresolvedUdoFiles: Set<string>
};

// NODE COLLECTIONS FOR DIAGNOSTIC PROCESS
export interface TreeReport {
    opcodes: Node[],
    types: Node[],
    genericErrors: GenericError[],
    udo: Set<string>,
    udt: Set<string>,
    typedVars: Map<string, string>,
    userDefinitions: UserDefinitions,
    includedUdoFiles: Map<string, UdoFile>,
    flags: Map<string, Node>
};

export enum GError {
    syntax,
    explicitType,
    scoreStatement,
    missingPfield,
    controlLoopSyntaxError,
    instrBlockSyntaxError,
    udoBlockSyntaxError,
    cabbageBlockError,
    missing
};

export interface GenericError {
    node: Node;
    errorType: GError;
};

export interface UdtMember {
    name: string;
    type: string;
};

export interface UserDefinedType {
    udtName: string;
    udtFormat: string;
    udtMembers: UdtMember[];
};

export type VarDataType =
    | { kind: "INIT_TIME" }
    | { kind: "KONTROL_RATE" }
    | { kind: "AUDIO_RATE" }
    | { kind: "STRING" }
    | { kind: "SPECTRAL" }
    | { kind: "MACRO" }
    | { kind: "INSTR_DEF" }
    | { kind: "INSTR" }
    | { kind: "OPCODE" }
    | { kind: "OPCODE_DEF" }
    | { kind: "COMPLEX" }
    | { kind: "BOOL" }
    | { kind: "VOID" }
    | { kind: "UNKNOWN" }
    | { kind: "TYPE_DEF", name: string };

export type VarDataShape =
    | { kind: "SCALAR" }
    | { kind: "ARRAY", size: number }
    | { kind: "BOOLEAN" }
    | { kind: "SPECTRA" }
    | { kind: "EXPRESSION" }
    | { kind: "STRUCT", name: string }
    | { kind: "NO_SHAPE" }
    | { kind: "UNKNOWN" };

export type Scope =
    | { kind: "INSTR", name: string }
    | { kind: "UDO", name: string }
    | { kind: "SCORE" }
    | { kind: "GLOBAL" }
    | { kind: "UNKNOWN" };

export enum UdoType {
    legacy,
    modern,
    unknown
};

export enum AccessVariableType {
    read,
    write,
    withoutDefinition,
    update
};

export interface VariableData {
    dataType: VarDataType;
    dataShape: VarDataShape;
    isArray: boolean
};

export interface UdoArg {
    position: number;
    arg: VariableData;
};

export interface UserDefinedMacro {
    nodeLocation: number;
    macroName: string;
    macroLabel: string;
    macroValue: string;
};

export interface UserDefinedVariable {
    nodeLocation: number; // equivalent to start_byte!
    definitionLocation: number | undefined; // first write, used to offer the variable only after it
    varName: string;
    varScope: Scope;
    varCalls: number;
    isUndefined: boolean;
    isUnused: boolean;
    references: Range[];
    dataType: VariableData | undefined;
};

export interface Udo {
    nodePosition: { start: Point, end: Point };
    signature: string;
    inputs: UdoArg[];
    outputs: UdoArg[];
    udoType: UdoType;
    isValid: boolean;
};

export interface UserDefinitions {
    userDefinedTypes: Map<string, UserDefinedType>;
    userDefinedOpcodes: Map<string, Udo>;
    userDefinedMacros: Map<string, UserDefinedMacro>;
    userUndefinedVars: UserDefinedVariable[];
    userUnusedVars: UserDefinedVariable[];
    userDefinedLocalVars: Map<string, Map<string, UserDefinedVariable>>;
    userDefinedGlobalVars: Map<string, UserDefinedVariable>;
    varsWithoutDefinition: Set<string>;
};

export interface UdoFile {
    path: string,
    fileName: string | undefined,
    content: string | undefined,
    contentHash: string | undefined,
    userDefinedOpcodes: Map<string, Udo>,
    userDefinedTypes: Map<string, UserDefinedType>,
    userDefinedMacros: Map<string, UserDefinedMacro>,
    udoList: Set<string>,
    typeList: Set<string>,
    macroList: Set<string>
};

export function prepareUdoFile(file: string): UdoFile {
    return {
        path: file,
        fileName: undefined,
        content: undefined,
        contentHash: undefined,
        userDefinedOpcodes: new Map<string, Udo>(),
        userDefinedTypes: new Map<string, UserDefinedType>(),
        userDefinedMacros: new Map<string, UserDefinedMacro>(),
        udoList: new Set<string>(),
        typeList: new Set<string>(),
        macroList: new Set<string>()
    };
}

export function parseUdoFile(udoFile: UdoFile, parser: Parser) {
    udoFile.udoList.clear();
    udoFile.typeList.clear();
    udoFile.macroList.clear();
    udoFile.userDefinedOpcodes = new Map<string, Udo>();
    udoFile.userDefinedTypes = new Map<string, UserDefinedType>();
    udoFile.userDefinedMacros = new Map<string, UserDefinedMacro>();

    const content = udoFile.content;
    if (content) {
        const tree = parser.parse(content);
        const rootNode = tree?.rootNode;
        if (!rootNode) { return; }
        let toVisit: Node[] = [rootNode];
        let userLocalDefinitions = initializeUserDefinitions();

        while (toVisit.length > 0) {
            let currentNode = toVisit.pop()!;
            const cKind = currentNode.type;
            switch (cKind) {
                case "udo_definition_legacy":
                case "udo_definition_modern":
                    const nameNode = currentNode.childForFieldName("name");
                    if (nameNode) {
                        const cleanName = getCleanNodeText(nameNode.text);
                        addUserDefinedOpcode(currentNode, cleanName, userLocalDefinitions);
                        udoFile.udoList.add(cleanName);
                    }
                    break;
                case "struct_definition":
                    const structNameNode = currentNode.childForFieldName("struct_name");
                    if (structNameNode) {
                        const cleanName = getCleanNodeText(structNameNode.text);
                        addUserDefinedType(currentNode, cleanName, userLocalDefinitions);
                        udoFile.typeList.add(cleanName);
                    }
                    break;
                case "macro_define":
                    const macroNameNode = currentNode.childForFieldName("macro_name");
                    if (macroNameNode) {
                        const cleanMacroName = getCleanNodeText(macroNameNode.text);
                        const macroIdNode = macroNameNode.childForFieldName("id");
                        if (macroIdNode) {
                            const cleanMacroId = getCleanNodeText(macroIdNode.text);
                            // `#define NAME ##` has no macro_values node
                            const macroValueNode = currentNode.childForFieldName("macro_values");
                            const cleanMacroValue = macroValueNode ? getCleanNodeText(macroValueNode.text) : "";
                            let macro = userLocalDefinitions.userDefinedMacros.get(cleanMacroId);
                            if (macro) {
                                macro.nodeLocation = currentNode.startIndex;
                                macro.macroLabel = cleanMacroName;
                                macro.macroValue = cleanMacroValue;
                            } else {
                                userLocalDefinitions.userDefinedMacros.set(cleanMacroId, {
                                    nodeLocation: currentNode.startIndex,
                                    macroName: cleanMacroId,
                                    macroLabel: cleanMacroName,
                                    macroValue: cleanMacroValue
                                });
                            }
                            udoFile.macroList.add(cleanMacroId);
                        }
                    }
                    break;
                default:
                    break;
            }

            for (let i = currentNode.childCount; i >= 0; i--) {
                let child = currentNode.child(i);
                if (child) { toVisit.push(child); }
            }
        }

        udoFile.userDefinedOpcodes = userLocalDefinitions.userDefinedOpcodes;
        udoFile.userDefinedTypes = userLocalDefinitions.userDefinedTypes;
        udoFile.userDefinedMacros = userLocalDefinitions.userDefinedMacros;
    }
}

export function getScopeKey(scope: Scope): string {
    switch (scope.kind) {
        case "INSTR":
        case "UDO":
            return `${scope.kind}:${scope.name}`;
        default:
            return scope.kind;
    }
};

export function updateTree(parser: Parser, document: TextDocument, docs: Map<string, DocState>) {
    if (!parser) { return; }
    const uri = document.uri;
    const oldState = docs.get(uri);
    const text = document.getText();
    const textLines = text.split(/\r?\n/);
    const version = document.version;

    const newTree = parser.parse(text);
    if (newTree) {
        docs.set(uri, {
            tree: newTree,
            text: text,
            textLines: textLines,
            version: version,
            userDefinitions: oldState ? oldState.userDefinitions : initializeUserDefinitions(),
            cachedTypedVars: oldState ? oldState.cachedTypedVars : new Map<string, string>(),
            cachedIncludedUdoFiles: oldState ? oldState.cachedIncludedUdoFiles : new Map<string, UdoFile>(),
            includedUdoFiles: oldState ? oldState.includedUdoFiles : new Map<string, UdoFile>(),
            unresolvedUdoFiles: oldState ? oldState.unresolvedUdoFiles : new Set<string>()
        });
    }
}

function initializeUserDefinitions(): UserDefinitions {
    return {
        userDefinedTypes: new Map<string, UserDefinedType>(),
        userDefinedOpcodes: new Map<string, Udo>(),
        userDefinedMacros: new Map<string, UserDefinedMacro>(),
        userUndefinedVars: [],
        userUnusedVars: [],
        userDefinedLocalVars: new Map<string, Map<string, UserDefinedVariable>>(),
        userDefinedGlobalVars: new Map<string, UserDefinedVariable>(),
        varsWithoutDefinition: new Set<string>(),
    };
}

function initializeTreeReport(): TreeReport {
    return {
        opcodes: [],
        types: [],
        genericErrors: [],
        udo: new Set<string>(),
        udt: new Set<string>(),
        typedVars: new Map<string, string>(),
        userDefinitions: initializeUserDefinitions(),
        includedUdoFiles: new Map<string, UdoFile>(),
        flags: new Map<string, Node>()
    };
};

function isValidOutputUdoTypes(typeIdentifier: string, node: Node): boolean {
    const trimmed = typeIdentifier.trim();

    switch (node.type) {
        case "modern_udo_outputs":
            if (trimmed.toLowerCase() === "void") {
                return true;
            }
            break;
        case "udo_definition_legacy":
            if (trimmed.includes("0")) {
                return trimmed.length === 1;
            }
            break;
    }

    const validChars = new Set(["a", "f", "i", "j", "k", "K", "S"]);
    for (let i = 0; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (validChars.has(c)) {
            continue;
        }
        if (c === "[") {
            if (trimmed[i + 1] !== "]") {
                return false;
            }
            i++;
            continue;
        }
        return false;
    }

    return true;
}

function isValidInputUdoTypes(typeIdentifier: string): boolean {
    const trimmed = typeIdentifier.trim();
    const validChars = new Set(["a", "f", "k", "o", "p", "i", "j", "O", "P", "V", "K", "S", "0"]);

    for (let i = 0; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (validChars.has(c)) {
            continue;
        }
        if (c === "[") {
            if (trimmed[i + 1] !== "]") {
                return false;
            }
            i++;
            continue;
        }
        return false;
    }

    return true;
}

function isValidModernUdoSignatureType(typeIdentifier: string, typeNode: Node): boolean {
    const parent = typeNode.parent;

    switch (parent?.type) {
        case "modern_udo_inputs":
            return isValidInputUdoTypes(typeIdentifier);
        case "modern_udo_outputs":
            return isValidOutputUdoTypes(typeIdentifier, parent);
        case "typed_identifier":
        case "typed_opcode_name":
            switch (parent.parent?.type) {
                case "modern_udo_inputs":
                    return isValidInputUdoTypes(typeIdentifier);
                case "modern_udo_outputs":
                    return isValidOutputUdoTypes(typeIdentifier, parent.parent);
            }
            break;
    }

    return false;
}

// opcode name of a call (`out oscili ...`, `oscili(...)`), also inside udo bodies
function isOpcodeCall(node: Node): boolean {
    if (node.type !== "opcode_name") { return false; }

    let current = node.parent;
    while (current) {
        if (current.type === "function_call" || current.type === "opcode_statement") {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function hasSpecificNode(node: Node, expectedKind: string): boolean {
    let toVisit: Node[] = [];
    for (let i = node.childCount - 1; i >= 0; i--) {
        const child = node.child(i);
        if (child) { toVisit.push(child); }
    }

    while (toVisit.length > 0) {
        const current = toVisit.pop()!;
        if (current.type === "ERROR") { continue; }
        if (current.type === expectedKind && !current.isMissing) { return true; }

        for (let i = current.childCount - 1; i >= 0; i--) {
            const child = current.child(i);
            if (child) { toVisit.push(child); }
        }
    }

    return false;
}

export function isValidType(typeIdentifier: string): boolean {
    const trimmed = typeIdentifier.trim().replace(/(?:\[\])+$/, "");
    return [
        "InstrDef", "Instr", "Opcode", "OpcodeDef", "Complex",
        "a", "i", "k", "S", "f", "w", "b"
    ].includes(trimmed);
}

export function iterateTree(tree: Tree, macros: any): TreeReport {
    const rootNode = tree.rootNode.walk();
    let toVisit = [rootNode.currentNode];
    let report = initializeTreeReport();
    let hasCabbageStart = false;
    let hasCabbageAraStart = false;

    while (toVisit.length > 0) {
        const currentNode = toVisit.pop()!;
        const currentParent = currentNode.parent;

        if (isOpcodeCall(currentNode)) {
            report.opcodes.push(currentNode);
        }

        // missing tokens inserted by error recovery
        if (currentNode.isMissing) {
            report.genericErrors.push({
                node: currentNode,
                errorType: GError.missing
            });
        }

        switch (currentNode.type) {
            case "typed_identifier":
            case "typed_opcode_name":
                const nodeExplicitType = currentNode.childForFieldName("type");
                if (nodeExplicitType) {
                    const nodeName = currentNode.childForFieldName("name");
                    const name = getCleanNodeText(nodeName?.text ?? "");
                    const ty = nodeExplicitType.text;
                    if (nodeExplicitType.type === "identifier" && !isValidModernUdoSignatureType(ty, nodeExplicitType)) {
                        report.types.push(nodeExplicitType);
                    }
                    report.typedVars.set(name, ty);

                    const isStructField = currentParent?.type === "struct_definition"
                        ? true
                        : false;
                    const isOpcodeName = currentParent?.type === "opcode_name"
                        ? true
                        : false;
                    if (!isStructField && !isOpcodeName) {
                        addUserDefinedVar(currentNode, name, report.userDefinitions, macros);
                    }
                }
                break;
            case "identifier":
            case "type_identifier_legacy":
                const pk = currentParent?.type ?? "";
                const shouldSkip = (
                    pk === "ERROR" ||
                    pk === "typed_identifier" ||
                    pk === "typed_opcode_name" ||
                    pk === "global_typed_identifier" ||
                    pk === "struct_definition" ||
                    pk === "macro_args" ||
                    pk === "flag_content" ||
                    pk === "instrument_definition" ||
                    pk === "cabbage_statement" ||
                    pk === "cabbage_property" ||
                    (pk === "struct_access" && currentParent?.childForFieldName("struct_member")?.id === currentNode.id) ||
                    (pk === "opcode_statement" && currentParent?.childForFieldName("op")?.id === currentNode.id) ||
                    (pk === "opcode_statement" && currentParent?.childForFieldName("op_macro")?.id === currentNode.id) ||
                    (pk === "function_call" && currentParent?.childForFieldName("function")?.id === currentNode.id)
                );

                if (!shouldSkip) {
                    const nodeName = getCleanNodeText(currentNode.text);
                    if (!["CsScore", "CsoundSynthesizer", "CsoundSynthesiser", "CsOptions", "CsInstruments", "CsTest"].includes(nodeName)) {
                        const splittedName = nodeName.split('[')[0];
                        addUserDefinedVar(currentNode, splittedName, report.userDefinitions, macros);
                    }
                }

                if (pk === "ERROR") {
                    const scope = findScope(currentNode, report.userDefinitions.userDefinedTypes);
                    if (scope.kind === "SCORE" && currentNode.type !== "type_identifier_legacy") {
                        report.genericErrors.push({
                            node: currentNode,
                            errorType: GError.scoreStatement
                        });
                    }
                }
                break;
            case "global_typed_identifier":
                const nodeName = currentNode.childForFieldName("name");
                if (nodeName) {
                    const name = getCleanNodeText(nodeName.text);
                    addUserDefinedVar(nodeName, name, report.userDefinitions, macros);
                }
                break;
            case "score_nestable_loop":
            case "score_statement":
                const scoreMacroName = currentNode.childForFieldName("macro_identifier");
                if (scoreMacroName) {
                    const macroName = getCleanNodeText(scoreMacroName.text);
                    if (macroName) {
                        let macro = report.userDefinitions.userDefinedMacros.get(macroName);
                        if (macro) {
                            macro.nodeLocation = scoreMacroName.startIndex;
                            macro.macroLabel = macroName;
                            macro.macroValue = "Score statement macro";
                        } else {
                            report.userDefinitions.userDefinedMacros.set(macroName, {
                                nodeLocation: scoreMacroName.startIndex,
                                macroName: macroName,
                                macroLabel: macroName,
                                macroValue: "Score statement macro"
                            });
                        }
                    }
                }
                break;
            case "macro_define":
                const macroNameNode = currentNode.childForFieldName("macro_name");
                if (macroNameNode) {
                    const macroName = getCleanNodeText(macroNameNode.text);
                    const macroId = macroNameNode.childForFieldName("id");
                    if (macroId) {
                        const idText = macroId.text;
                        // `#define NAME ##` has no macro_values node
                        const macroValue = currentNode.childForFieldName("macro_values");
                        const mv = macroValue ? macroValue.text : "";
                        let udm = report.userDefinitions.userDefinedMacros.get(idText);
                        if (udm) {
                            udm.nodeLocation = currentNode.startIndex;
                            udm.macroLabel = macroName;
                            udm.macroValue = mv;
                        } else {
                            const udm: UserDefinedMacro = {
                                nodeLocation: currentNode.startIndex,
                                macroName: idText,
                                macroLabel: macroName,
                                macroValue: mv
                            };
                            report.userDefinitions.userDefinedMacros.set(idText, udm);
                        }
                    }
                }
                break;
            case "struct_definition":
                const nodeType = currentNode.childForFieldName("struct_name");
                if (nodeType) {
                    const nodeName = getCleanNodeText(nodeType.text);
                    report.udt.add(nodeName);
                    addUserDefinedType(currentNode, nodeName, report.userDefinitions);
                }
                break;
            case "udo_definition_legacy":
            case "udo_definition_modern":
                const udoNodeName = currentNode.childForFieldName("name");
                if (udoNodeName) {
                    const opName = getCleanNodeText(udoNodeName.text);
                    report.udo.add(opName);
                    addUserDefinedOpcode(currentNode, opName, report.userDefinitions);
                }
                break;
            case "legacy_udo_args":
                const legacyArgs = currentNode.text;
                const isInputsContext = currentNode.parent
                    ?.childForFieldName("inputs")
                    ?.id === currentNode.id;
                const isValidLegacyArgs = isInputsContext
                    ? isValidInputUdoTypes(legacyArgs)
                    : currentNode.parent
                        ? isValidOutputUdoTypes(legacyArgs, currentNode.parent)
                        : false;
                if (!isValidLegacyArgs) {
                    report.genericErrors.push({
                        node: currentNode,
                        errorType: GError.explicitType
                    });
                }
                break;
            case "score_statement_func":
                const nodeMode = currentNode.child(0);
                const modeName = nodeMode?.childForFieldName("id")?.text.trim();
                if (modeName?.startsWith("i") && currentNode.childCount < 3) {
                    report.genericErrors.push({
                        node: currentNode,
                        errorType: GError.missingPfield
                    });
                }
                break;
            case "score_statement_instr":
                const firstFieldName = currentNode.fieldNameForChild(0);
                if (firstFieldName) {
                    const mode = firstFieldName === "statement" ? 1 : 0;
                    const p1 = currentNode.fieldNameForChild(mode);
                    const p2 = currentNode.fieldNameForChild(1 + mode);
                    const p3 = currentNode.fieldNameForChild(2 + mode);
                    const isValidInstr = (
                        ["instr", "statement_instr", "statement_macro_instr"].includes(p1 ?? "") &&
                        p2 === "start_time" &&
                        p3 === "duration"
                    );
                    if (!isValidInstr) {
                        report.genericErrors.push({
                            node: currentNode,
                            errorType: GError.missingPfield
                        });
                    }
                }
                break;
            case "include_directive":
                const includedNode = currentNode.childForFieldName("included_file");
                let iFile = includedNode?.text ?? "";
                iFile = iFile.replace(/^[<"]/, "").replace(/[>"]$/, "").trim();
                if (iFile.endsWith(".udo")) {
                    const uf = prepareUdoFile(iFile);
                    report.includedUdoFiles.set(iFile, uf);
                }
                break;
            case "control_statement":
                const controlKind = currentNode.children
                    .map((child): { node: Node, expected: string[] } | undefined => {
                        switch (child.type) {
                            case "if_statement":
                                return { node: child, expected: ["kw_endif", "kw_fi", "then_goto"] };
                            case "while_loop":
                            case "for_loop":
                            case "until_loop":
                                return { node: child, expected: ["kw_od", "od"] };
                            case "switch_statement":
                                return { node: child, expected: ["kw_switch_end", "endsw"] };
                            default:
                                return undefined;
                        }
                    })
                    .find((child): child is { node: Node, expected: string[] } => !!child);

                if (controlKind) {
                    const isBoundedError = hasSpecificNode(controlKind.node, "control_statement_bounded_error");
                    const isClosed = controlKind.expected.some(closer => {
                        if (closer === "then_goto") {
                            return !!controlKind.node.childForFieldName("then_goto");
                        }
                        return hasSpecificNode(controlKind.node, closer);
                    });

                    if (isBoundedError || !isClosed) {
                        report.genericErrors.push({
                            node: currentNode,
                            errorType: GError.controlLoopSyntaxError
                        });
                    }
                }
                break;
            case "instrument_definition":
            case "udo_definition":
                const firstChild = currentNode.child(0);
                if (firstChild?.type === "instr" && hasSpecificNode(currentNode, "instr_udo_bounded_error")) {
                    report.genericErrors.push({
                        node: currentNode,
                        errorType: GError.instrBlockSyntaxError
                    });
                } else if (
                    (firstChild?.type === "udo_definition_legacy" || firstChild?.type === "udo_definition_modern") &&
                    hasSpecificNode(currentNode, "instr_udo_bounded_error")
                ) {
                    report.genericErrors.push({
                        node: currentNode,
                        errorType: GError.udoBlockSyntaxError
                    });
                }
                break;
            case "options_block":
                const children = currentNode.children;
                for (const child of children) {
                    if (child.type === "flag_content") {
                        const fi = child.children.find(n => n.type === "flag_identifier");
                        const ft = child.childForFieldName("flag_type");
                        if (fi && ft) {
                            const flag = `${fi.text}${ft.text}`;
                            report.flags.set(flag.trim(), child);
                        }
                    }
                }
                break;
            case "tag_cabbage_start":
            case "tag_cabbageara_start":
                if (currentNode.type === "tag_cabbage_start") {
                    hasCabbageStart = true;
                } else {
                    hasCabbageAraStart = true;
                }

                if (hasCabbageStart && hasCabbageAraStart) {
                    report.genericErrors.push({
                        node: currentNode,
                        errorType: GError.cabbageBlockError
                    });
                }
                break;
            case "ERROR":
                const errorText = currentNode.text.trim();
                const isKnownCsdWrapperError = (
                    errorText.includes("<CsInstruments>") ||
                    errorText.includes("</CsInstruments>") ||
                    errorText.includes("<CsScore>") ||
                    errorText.includes("</CsScore>") ||
                    errorText.includes("csd_file") ||
                    errorText.includes("cs_legacy_file")
                );

                if (!isKnownCsdWrapperError) {
                    const scope = findScope(currentNode, report.userDefinitions.userDefinedTypes);
                    const currentParentKind = currentNode.parent?.type ?? "";
                    const canReport = (
                        !errorText.includes(")") &&
                        !errorText.includes(",") &&
                        !errorText.includes("]") &&
                        !errorText.includes("<")
                    );

                    if (currentParentKind !== "modern_udo_outputs" && canReport) {
                        if (errorText.length === 1 || errorText.includes(":")) {
                            report.genericErrors.push({
                                node: currentNode,
                                errorType: GError.explicitType
                            });
                        } else if (scope.kind === "SCORE") {
                            report.genericErrors.push({
                                node: currentNode,
                                errorType: GError.scoreStatement
                            });
                        } else {
                            report.genericErrors.push({
                                node: currentNode,
                                errorType: GError.syntax
                            });
                        }
                    }
                }
                break;
            default:
                break;
        }

        for (let i = currentNode.childCount; i >= 0; i--) {
            const child = currentNode.child(i);
            if (child) { toVisit.push(child); }

        }
    }

    for (const lscope of report.userDefinitions.userDefinedLocalVars.values()) {
        for (const varRef of lscope.values()) {
            if (varRef.references.length > 0) { report.userDefinitions.userUndefinedVars.push(varRef); }
            if (varRef.isUnused) { report.userDefinitions.userUnusedVars.push(varRef); }
        }
    }

    for (const varRef of report.userDefinitions.userDefinedGlobalVars.values()) {
        if (varRef.references.length > 0) { report.userDefinitions.userUndefinedVars.push(varRef); }
        if (varRef.isUnused) { report.userDefinitions.userUnusedVars.push(varRef); }
    }

    return report;
}

export function findScope(node: Node, udt: Map<string, UserDefinedType>): Scope {
    let currentNode = node;
    if (currentNode.type === "ERROR") { return { kind: "UNKNOWN" }; }
    while (true) {
        const currentKind = currentNode.type;
        const parent = currentNode.parent;
        if (parent && parent.type === "opcode_statement") {
            if (isValidNotDefinedArg(parent, udt)) {
                return { kind: "GLOBAL" };
            }
        }

        const childField = currentNode.childForFieldName("name");
        let childName = childField?.text;
        if (childName) {
            childName = getCleanNodeText(childName);
            switch (currentKind) {
                case "instrument_definition":
                case "instr":
                    return { kind: "INSTR", name: childName };
                case "udo_definition_modern":
                case "udo_definition_legacy":
                    return { kind: "UDO", name: childName };
                default:
                    break;
            }
        }

        switch (currentKind) {
            case "score_block":
            case "cs_score":
                const pflag = node.parent?.type === "macro_name" ?? false;
                if (pflag) {
                    return { kind: "GLOBAL" };
                }
                return { kind: "SCORE" };
            case "instrument_block":
            case "cs_legacy_file":
                return { kind: "GLOBAL" };
            default:
                break;
        }

        if (currentNode.parent) {
            currentNode = currentNode.parent;
        } else {
            break;
        }
    }
    return { kind: "GLOBAL" };
}


function isValidNotDefinedArg(node: Node, udt: Map<string, UserDefinedType>): boolean {
    const childField = node.childForFieldName("outputs");
    if (childField) {
        let varData = getVariableDataType(childField, udt);
        if (varData) {
            if ((varData.dataType.kind === "OPCODE" || varData.dataType.kind === "INSTR") && varData.isArray) {
                return true;
            }
        }
        return false;
    }
    return false;
};

function getUdoDataType(argList: string): VariableData[] {
    const trimmed = argList.trim();
    if (trimmed === "void" || trimmed === "0" || trimmed === "") {
        return [{
            dataType: { kind: "VOID" },
            dataShape: { kind: "NO_SHAPE" },
            isArray: false
        }];
    }

    let data: VariableData[] = [];
    const tokens = trimmed.match(/[ijkaopOKVJSbfw](?:\[\])*/g) || [];
    for (const token of tokens) {
        const baseType = Array.from(token).find(c => /\p{L}/u.test(c)) ?? "";
        const dimension = token.match(/\[\]/g)?.length ?? 0;

        let dType: VarDataType;
        switch (baseType) {
            case 'i':
            case 'j':
            case 'o':
            case 'p':
                dType = { kind: "INIT_TIME" };
                break;
            case 'k':
            case 'O':
            case 'P':
            case 'V':
            case 'J':
            case 'K':
                dType = { kind: "KONTROL_RATE" };
                break;
            case 'a':
                dType = { kind: "AUDIO_RATE" };
                break;
            case 'S':
                dType = { kind: "STRING" };
                break;
            case 'b':
                dType = { kind: "BOOL" };
                break;
            case 'f':
            case 'w':
                dType = { kind: "SPECTRAL" };
                break;
            default:
                dType = { kind: "UNKNOWN" };
                break;
        }

        let shape: VarDataShape;
        if (dimension !== 0) {
            shape = { kind: "ARRAY", size: dimension };
            break;
        } else {
            switch (dType.kind) {
                case "INIT_TIME":
                case "KONTROL_RATE":
                case "AUDIO_RATE":
                case "STRING":
                    shape = { kind: "SCALAR" };
                    break;
                case "BOOL":
                    shape = { kind: "BOOLEAN" };
                    break;
                case "SPECTRAL":
                    shape = { kind: "SPECTRA" };
                    break;
                default:
                    shape = { kind: "UNKNOWN" };
                    break;
            }
        }
        data.push({
            dataType: dType,
            dataShape: shape,
            isArray: dimension !== 0,
        });
    }
    return data;
}

function getVariableDataType(node: Node, udt: Map<string, UserDefinedType>): VariableData | undefined {
    let currentNode = node;
    switch (node.type) {
        case "typed_identifier":
        case "global_typed_identifier":
            const child = node.childForFieldName("type");
            if (child) {
                currentNode = child;
                break;
            } else {
                return undefined;
            };
        case "type_identifier_legacy":
            break;
        default:
            return undefined;
    }

    const typed = currentNode.text;
    const absTrimmed = typed.trim();
    const legacyFlag = currentNode.type === "type_identifier_legacy";
    let trimmed = absTrimmed;
    if (legacyFlag) {
        const noG = absTrimmed.startsWith('g')
            ? absTrimmed.slice(1)
            : absTrimmed;
        trimmed = noG.length > 0 ? Array.from(noG)[0] : "";
    };

    let isStruct: UserDefinedType | undefined = undefined;
    const varType = trimmed.split("[")[0];
    let dtype: VarDataType;
    switch (varType) {
        case "i":
            dtype = { kind: "INIT_TIME" };
            break;
        case "k":
            dtype = { kind: "KONTROL_RATE" };
            break;
        case "a":
            dtype = { kind: "AUDIO_RATE" };
            break;
        case "S":
            dtype = { kind: "STRING" };
            break;
        case "b":
            dtype = { kind: "BOOL" };
            break;
        case "f":
        case "w":
            dtype = { kind: "SPECTRAL" };
            break;
        case "InstrDef":
            dtype = { kind: "INSTR_DEF" };
            break;
        case "Instr":
            dtype = { kind: "INSTR" };
            break;
        case "Opcode":
            dtype = { kind: "OPCODE" };
            break;
        case "OpcodeDef":
            dtype = { kind: "OPCODE_DEF" };
            break;
        case "Complex":
            dtype = { kind: "COMPLEX" };
            break;
        default:
            const struct = udt.get(trimmed);
            if (struct) {
                isStruct = struct;
                dtype = { kind: "TYPE_DEF", name: trimmed };
                break;
            }
            dtype = { kind: "UNKNOWN" };
            break;
    }

    const dimension = absTrimmed.match(/\[\]/g)?.length ?? 0;
    let shape: VarDataShape;
    if (dimension !== 0) {
        shape = { kind: "ARRAY", size: dimension };
    } else {
        switch (dtype.kind) {
            case "INIT_TIME":
            case "KONTROL_RATE":
            case "AUDIO_RATE":
            case "STRING":
                shape = { kind: "SCALAR" };
                break;
            case "BOOL":
                shape = { kind: "BOOLEAN" };
                break;
            case "SPECTRAL":
                shape = { kind: "SPECTRA" };
                break;
            case "UNKNOWN":
                shape = { kind: "UNKNOWN" };
                break;
            default:
                if (isStruct) {
                    let members = [];
                    for (const member of isStruct.udtMembers) {
                        members.push(`${member.name}:${member.type}`);
                    }
                    shape = members
                        ? { kind: "STRUCT", name: members.join(", ") }
                        : { kind: "STRUCT", name: "Unknown members" };
                    break;
                }
                shape = { kind: "EXPRESSION" };
                break;
        }
    };

    return {
        dataType: dtype,
        dataShape: shape,
        isArray: dimension !== 0
    };

};

function updateVarUse(node: Node, udv: Map<string, UserDefinedVariable>, noDefArgs: Set<string>, key: string, accessMode: AccessVariableType) {
    const nodeRange: Range = {
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        startIndex: node.startIndex,
        endIndex: node.endIndex
    };

    let check = true;
    let variable = udv.get(key);
    if (variable) {
        variable.varCalls += 1;
        switch (accessMode) {
            case AccessVariableType.read:
                variable.isUnused = false;
                if (variable.isUndefined) { variable.references.push(nodeRange); }
                break;
            case AccessVariableType.write:
                const pkind = node.parent?.type ?? "";
                if (pkind === "label_statement") { variable.references = []; }
                variable.isUndefined = false;
                variable.nodeLocation = node.startIndex;
                variable.definitionLocation ??= node.startIndex;
                break;
            case AccessVariableType.withoutDefinition:
                variable.isUndefined = false;
                variable.isUnused = false;
                variable.nodeLocation = node.startIndex;
                variable.definitionLocation ??= node.startIndex;
                break;
            case AccessVariableType.update:
                variable.isUnused = false;
                if (variable.isUndefined) { variable.references.push(nodeRange); }
                variable.isUndefined = false;
                variable.definitionLocation ??= node.startIndex;
                break;
        }
    } else {
        if (accessMode === AccessVariableType.withoutDefinition) {
            noDefArgs.add(key);
        } else {
            check = false;
        }
    }
    return check;
};

function getAccessType(node: Node, udt: Map<string, UserDefinedType>): AccessVariableType {
    let currentNode = node;
    for (let i = 0; i < 12; i++) {
        const parent = currentNode.parent;
        if (!parent) { return AccessVariableType.read; }

        const pkind = parent.type;
        if (node.type === "identifier") {
            if (pkind === "macro_usage" || pkind === "array_access") { return AccessVariableType.read; }

            if (
                pkind === "score_nestable_loop" || pkind === "score_statement" ||
                pkind === "score_statement_instr" || pkind === "score_statement_func" ||
                pkind === "score_statement_wm"
            ) { return AccessVariableType.write; }
        }

        if (
            pkind === "xin_statement" || pkind === "modern_udo_inputs" ||
            pkind === "for_loop" || pkind === "macro_define"
        ) { return AccessVariableType.write; }

        if (currentNode.type === "identifier" && pkind === "argument_list") {
            const gparent = parent.parent;
            if (gparent && (gparent.type === "opcode_statement") && isValidNotDefinedArg(gparent, udt)) {
                return AccessVariableType.withoutDefinition;
            }
        }

        if (pkind.includes('assignment_statement')) {
            const childrens = parent.childrenForFieldName("left");
            for (const child of childrens) {
                if (node.startIndex >= child.startIndex && currentNode.endIndex <= child.endIndex) {
                    const operatorField = parent.childForFieldName("operator");
                    if (operatorField) {
                        const opName = operatorField.text;
                        if (opName && /[+\-*/%]=/.test(opName)) {
                            return AccessVariableType.update;
                        }
                    }
                    if (child.type !== ',') {
                        return AccessVariableType.write;
                    }
                }
            }
            return AccessVariableType.read;
        }

        if (currentNode.type === "identifier") {
            const outNode = parent.childForFieldName("outputs");
            if (outNode) {
                if (outNode.type === "identifier" && outNode.id === currentNode.id) {
                    return AccessVariableType.write;
                }
            }
        }

        if (pkind === "opcode_statement") {
            const opField = parent.childForFieldName("op") || parent.childForFieldName("op_macro");
            if (opField) {
                if (currentNode.endIndex <= opField.startIndex) {
                    return AccessVariableType.write;
                }
                if (currentNode.startIndex >= opField.endIndex) {
                    return AccessVariableType.read;
                }
            }
        }

        if (pkind === "label_statement") {
            const opLabel = parent.childForFieldName("label_name");
            if (opLabel) {
                return AccessVariableType.write;
            }
        }

        if (pkind === "goto_statement" || pkind === "rigoto_statement") {
            const opLabel = parent.childForFieldName("label_name");
            if (opLabel) {
                return AccessVariableType.read;
            }
        }

        currentNode = parent;
    }
    return AccessVariableType.read;
}

function addUserDefinedVar(node: Node, key: string, udef: UserDefinitions, macros: Map<string, any>) {
    if (!key) { return; }
    const physicalScope = findScope(node, udef.userDefinedTypes);
    const accessMode = getAccessType(node, udef.userDefinedTypes);
    const parent = node.parent;
    const pKind = parent?.type;
    const isGlobalSyntax = pKind === "global_typed_identifier";

    let preferredScope = physicalScope;
    if (udef.userDefinedGlobalVars.has(key) || isGlobalSyntax || key.startsWith('g')) {
        preferredScope = { kind: "GLOBAL" };
    };

    const scopeKey = getScopeKey(preferredScope);
    let isFound = false;
    if (preferredScope.kind === "GLOBAL") {
        isFound = updateVarUse(node, udef.userDefinedGlobalVars, udef.varsWithoutDefinition, key, accessMode);
    } else {
        let localMap = udef.userDefinedLocalVars.get(scopeKey);
        if (localMap) {
            isFound = updateVarUse(node, localMap, udef.varsWithoutDefinition, key, accessMode);
        }
    }

    if (!isFound && preferredScope.kind !== "GLOBAL" && accessMode !== AccessVariableType.write) {
        isFound = updateVarUse(node, udef.userDefinedGlobalVars, udef.varsWithoutDefinition, key, accessMode);
    }

    if (!isFound && preferredScope.kind === "GLOBAL" && accessMode !== AccessVariableType.withoutDefinition) {
        isFound = updateVarUse(node, udef.userDefinedGlobalVars, udef.varsWithoutDefinition, key, accessMode);
    }

    if (!isFound) {
        let udv: UserDefinedVariable = {
            nodeLocation: node.startIndex,
            definitionLocation: undefined,
            varName: key,
            varScope: preferredScope,
            varCalls: 1,
            isUndefined: false,
            isUnused: false,
            references: [],
            dataType: undefined
        };

        if (macros.has(key)) {
            udv.varScope = { kind: "GLOBAL" };
            udv.varCalls = 2;
            udv.dataType = {
                dataType: { kind: "MACRO" },
                dataShape: { kind: "EXPRESSION" },
                isArray: false
            };
            udv.definitionLocation = node.startIndex;
            udef.userDefinedGlobalVars.set(key, udv);
        } else {
            const isWrite = accessMode === AccessVariableType.write;
            udv.isUndefined = !isWrite;
            udv.isUnused = isWrite;
            if (isWrite) { udv.definitionLocation = node.startIndex; }
            const nodeToCheck = isGlobalSyntax && node.parent ? node.parent : node;
            udv.dataType = getVariableDataType(nodeToCheck, udef.userDefinedTypes);
            if (!isWrite) {
                const nodeRange: Range = {
                    startIndex: node.startIndex,
                    endIndex: node.endIndex,
                    startPosition: { row: node.startPosition.row, column: node.startPosition.column },
                    endPosition: { row: node.endPosition.row, column: node.endPosition.column }
                };
                udv.references.push(nodeRange);
            }
            if (preferredScope.kind === "GLOBAL") {
                udef.userDefinedGlobalVars.set(key, udv);
            } else {
                let scopeMap = udef.userDefinedLocalVars.get(scopeKey);
                if (!scopeMap) {
                    scopeMap = new Map<string, UserDefinedVariable>();
                    udef.userDefinedLocalVars.set(scopeKey, scopeMap);
                }
                scopeMap.set(key, udv);
            }
        }
    }
};


function addUserDefinedType(node: Node, key: string, udef: UserDefinitions) {
    let formats = [];
    let completionItems: UdtMember[] = [];
    for (const child of node.childrenForFieldName("struct_field")) {
        const nodeName = child.childForFieldName("name");
        const nodeType = child.childForFieldName("type");
        if (nodeName && nodeType) {
            const cName = nodeName.text;
            const cType = nodeType.text;
            formats.push(`${cName}:${cType}`);
            completionItems.push({
                name: cName,
                type: cType
            });
        } else {
            if (child.type === "type_identifier_legacy") {
                const cName = getCleanNodeText(child.text);
                const legacyVar = getNameAndTypeFromLegacyVar(cName);
                const cleanName = cName.replace(/[\[\]]/g, '');
                formats.push(`${legacyVar.varName}:${legacyVar.varType}`);
                completionItems.push({
                    name: cleanName,
                    type: legacyVar.varType
                });
            }
        }
    }

    let localUdt: UserDefinedType = {
        udtName: "",
        udtFormat: "",
        udtMembers: []
    };

    const structFormat = `struct ${key} ${formats.join(', ')}`;
    if (formats.length > 0) {
        localUdt.udtMembers = completionItems;
    }

    let udt = udef.userDefinedTypes.get(key);
    if (!udt) {
        localUdt.udtName = key;
        localUdt.udtFormat = structFormat;
        udef.userDefinedTypes.set(key, localUdt);
    } else {
        udt.udtFormat = structFormat;
    }
};

function addUserDefinedOpcode(node: Node, key: string, udef: UserDefinitions) {
    let formats:string[] = [];
    const inputsNode = node.childForFieldName("inputs");
    if (inputsNode) {
        const inpText = inputsNode.text;
        formats.push(inpText);

        const outNode = node.childForFieldName("outputs");
        if (outNode) {
            const outText = outNode.text;
            formats.push(outText);
        }

        let udoInfo: any[] = [];
        switch (node.type) {
            case "udo_definition_legacy":
                const formLeg = `opcode ${key} ${formats[1]}, ${formats[0]}`;
                const inps = getUdoDataType(formats[0]);
                const outs = getUdoDataType(formats[1]);
                udoInfo = [formLeg, inps, outs, UdoType.legacy];
                break;
            case "udo_definition_modern":
                const formMod = `opcode ${key} ${formats.join(":")}`;
                const inputs = formats[0]
                    .replace(/^\(|\)$/g, "")
                    .split(",")
                    .map(c => {
                        if (c.includes(':')) {
                            return c.split(":").pop()?.trim();
                        } else {
                            return getNameAndTypeFromLegacyVar(c).varType;
                        }
                    })
                    .filter((v): v is string => !!v)
                    .join("");

                const outputs = formats[1].replace(/^\(|\)$/g, "");
                const inputsData = getUdoDataType(inputs);
                const outputsData = getUdoDataType(outputs);
                udoInfo = [formMod, inputsData, outputsData, UdoType.modern];
                break;
            default:
                udoInfo = ["", [], [], UdoType.unknown];
                break;
        }

        let argInputs: UdoArg[] = [];
        for (let i = 0; i < udoInfo[1].length; i++) {
            const arg = udoInfo[1][i];
            argInputs.push({
                position: i,
                arg: arg
            });
        }

        let argOutputs: UdoArg[] = [];
        for (let i = 0; i < udoInfo[2].length; i++) {
            const arg = udoInfo[2][i];
            argOutputs.push({
                position: i,
                arg: arg
            });
        }

        const signature = udoInfo[0];
        const udoType = udoInfo[3];
        const udo: Udo = {
            nodePosition: {
                start: node.startPosition,
                end: node.endPosition
            },
            signature: signature,
            inputs: argInputs,
            outputs: argOutputs,
            udoType: udoType,
            isValid: true
        };

        let udefUdo = udef.userDefinedOpcodes.get(key);
        if (!udefUdo) {
            udef.userDefinedOpcodes.set(key, udo);
        } else {
            udef.userDefinedOpcodes.set(key, udo);
        }
    }
};
