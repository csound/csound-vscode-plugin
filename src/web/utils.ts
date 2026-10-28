import { Parser, Point, Query, Tree, Node } from "web-tree-sitter";

export interface ResolveIncludedUdoRequest {
    documentPath: string,
    udoPath: string
}

export interface ResolveIncludedUdoResult {
    uri: string,
    content: string,
    contentHash: string,
    pathBaseName: string
}

export const SEMANTIC_TOKEN_TYPE = [
    "decorator",
    "parameter",
    "macro",
    "type",
    "comment",
    "keyword",
    "property",
    "namespace",
    "variable",
    "string",
    "number",
    "function",
    "operator"
];

export function mapTokenToIndex(label: string): number {
    switch (label) {
        case "decorator": return 0;
        case "parameter": return 1;
        case "macro": return 2;
        case "type": return 3;
        case "comment": return 4;
        case "keyword": return 5;
        case "property": return 6;
        case "namespace": return 7;
        case "variable": return 8;
        case "string": return 9;
        case "number": return 10;
        case "function": return 11;
        case "operator": return 12;
        default: return 8;
    }
}

export function captureToTokenType(capture: string): string {
    switch (capture) {
        case "attribute":
            return "decorator";
        case "variable.parameter":
            return "parameter";
        case "macro.emphasis.strong":
            return "macro";
        case "type":
            return "type";
        case "comment":
            return "comment";
        case "keyword":
        case "keyword.emphasis.strong":
            return "keyword";
        case "constant":
        case "constant.builtin":
        case "constant.builtin.emphasis":
        case "string.special.key":
        case "property":
            return "property";
        case "tag":
        case "tag.emphsis":
            return "namespace";
        case "variable":
        case "label":
            return "variable";
        case "string":
        case "string.special":
            return "string";
        case "number":
            return "number";
        case "function":
        case "entity.name.function":
            return "function";
        case "operator":
        case "punctuation.delimiter":
        case "punctuation.bracket":
            return "operator";
        default:
            return "variable";
    }
}


export interface SemToken {
    node: Node;
    line: number;
    char: number;
    length: number;
    index: number;
    modifier: number;
};

export function getSemanticTokens(query: Query, tree: Tree, text: string): SemToken[] {
    const captures = query.captures(tree.rootNode);

    let tokens: SemToken[] = [];

    let lastRow = 0;
    let lastColumn = 0;

    for (const capture of captures) {
        const node = capture.node;

        if (node.isError || node.isMissing) { continue; }

        const type = captureToTokenType(capture.name);
        const index = mapTokenToIndex(type);
        if (index < 0) { continue; }

        const start = node.startPosition;
        const end = node.endPosition;

        if (start.row < lastRow || (start.row === lastRow && start.column < lastColumn)) {
            continue;
        }

        if (start.row === end.row) {
            const length = end.column - start.column;
            if (length > 0) {
                tokens.push({
                    node: node,
                    line: start.row,
                    char: start.column,
                    length: length,
                    index: index,
                    modifier: 0
                });
                lastRow = start.row;
                lastColumn = end.column;
            }
        }
        else {
            const startByte = node.startIndex;
            const endByte = node.endIndex;
            const slicedText = text.slice(startByte, endByte);
            const lines = slicedText.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const lineText = lines[i];
                const length = lineText.length;

                if (length === 0) { continue; }

                const row = start.row + i;
                const col = i === 0 ? start.column : 0;
                if (row < lastRow || (row === lastRow && col < lastColumn)) {
                    continue;
                }
                tokens.push({
                    node: node,
                    line: row,
                    char: col,
                    length: length,
                    index: index,
                    modifier: 0
                });

                lastRow = row;
                lastColumn = col + length;
            }
        }
    }
    return tokens;
}


export function getInjections(
    injection: Query,
    tree: Tree,
    languages: Record<string, { parser: Parser, query: Query }>
): SemToken[] {
    const injectionsCaptures = injection.captures(tree.rootNode);

    // blocks to parse; with `injection.combined` the captures under the same node form one block
    const blocks: { langName: string, startIndex: number, endIndex: number, startPosition: Point }[] = [];
    const combined = new Map<number, number>();

    for (const capture of injectionsCaptures) {
        if (capture.name !== "injection.content") { continue; }

        const langName = capture.setProperties?.["injection.language"];
        if (!langName || !languages[langName]) { continue; }

        const node = capture.node;
        const isCombined = capture.setProperties !== undefined && "injection.combined" in capture.setProperties;
        const parentId = node.parent?.id;
        const index = isCombined && parentId !== undefined ? combined.get(parentId) : undefined;

        if (index !== undefined) {
            const block = blocks[index];
            if (node.startIndex < block.startIndex) {
                block.startIndex = node.startIndex;
                block.startPosition = node.startPosition;
            }
            block.endIndex = Math.max(block.endIndex, node.endIndex);
            continue;
        }
        if (isCombined && parentId !== undefined) { combined.set(parentId, blocks.length); }
        blocks.push({ langName, startIndex: node.startIndex, endIndex: node.endIndex, startPosition: node.startPosition });
    }

    const text = tree.rootNode.text;
    let allInjections: SemToken[] = [];
    for (const block of blocks) {
        const lang = languages[block.langName];
        const blockContent = text.slice(block.startIndex, block.endIndex);
        const subTree = lang.parser.parse(blockContent);
        if (!subTree) { continue; }

        const currentTokens = getSemanticTokens(lang.query, subTree, blockContent);
        // token.node is not read after this point, so the injected tree can be freed
        subTree.delete();
        for (const token of currentTokens) {
            const absoluteLine = block.startPosition.row + token.line;
            const absoluteChar = (token.line === 0)
                ? block.startPosition.column + token.char
                : token.char;

            allInjections.push({ ...token, line: absoluteLine, char: absoluteChar });
        }
    }
    return allInjections;
}

// Raw strings and embedded languages (Python, HTML, Cabbage JSON, CsTest TOML): their
// leading whitespace is program content, so formatting must not touch it.
const PRESERVED_NODE_TYPES = ["internal_raw_block", "strong_string", "raw_script", "cabbage_json_block"];

// Lines whose first character lies inside a preserved node.
export function getPreservedLines(rootNode: Node, lineCount: number): boolean[] {
    const preserved = new Array<boolean>(lineCount).fill(false);
    for (const node of rootNode.descendantsOfType(PRESERVED_NODE_TYPES)) {
        const { startPosition: start, endPosition: end } = node;
        // a node ending at column 0 stops right before that line
        const lastRow = end.column > 0 ? end.row : end.row - 1;
        for (let i = start.row + 1; i <= lastRow && i < lineCount; i++) { preserved[i] = true; }
    }
    return preserved;
}

export function getUnusedLabelFromKind(kind: string): string {
    switch (kind) {
        case "label_statement":
            return "Unused label";
        case "macro_usage":
            return "Unused macro";
        default:
            return "Unused variable";
    }
}

export function getUndefinedLabelFromKind(kind: string): string {
    switch (kind) {
        case "goto_statement":
        case "rigoto_statement":
            return "Undefined label";
        case "macro_usage":
            return "Undefined macro";
        default:
            return "Undefined variable";
    }
}

export function getCleanNodeText(nodeText: string) {
    let nodeClean = nodeText.trim();
    let lastIndexChar = nodeClean.lastIndexOf(":");
    lastIndexChar = lastIndexChar === -1 ? nodeClean.length : lastIndexChar;
    return nodeClean.slice(0, lastIndexChar);
}

export function getNameAndTypeFromLegacyVar(variable: string): { varName: string, varType: string } {
    const vMatch = variable.match(/^([a-z])(.*?)(\[\])*$/);
    if (!vMatch) { return { varName: variable, varType: "" }; }
    return { varName: vMatch[2], varType: vMatch[1] + (vMatch[3] ?? "") };
}
