/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult
} from 'vscode-languageserver';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import {
	computeTokenPosition,
	getSuggestionsForParseTree, ImportHeaderContext,
	KotlinLexer,
	KotlinParser, SymbolTableVisitor,
	setTokenMatcher, filterTokens_fuzzySearch
} from 'toy-kotlin-language-server'
import {CharStreams, CommonTokenStream} from "antlr4ts";
import {TerminalNode} from "antlr4ts/tree";
import {SymbolTable} from "antlr4-c3";
import * as pathFunctions from "path";
import * as fs from "fs";
import fileUriToPath = require("file-uri-to-path");

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

setTokenMatcher(filterTokens_fuzzySearch);

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

function computeBasePath(uri: string) {
	let basePath = ensurePath(uri);
	let lastSep = basePath.lastIndexOf(pathFunctions.sep);
	if (lastSep >= 0) {
		basePath = basePath.substring(0, lastSep + 1);
	} else {
		basePath = "";
	}
	return basePath;
}

function processImports(imports: ImportHeaderContext[], uri: string, symbolTableVisitor: SymbolTableVisitor) {
	let basePath = computeBasePath(uri);
	for(let i in imports) {
		const filename = imports[i].identifier().text + ".mykt";
		const filepath = basePath + filename;
		if (fs.existsSync(filepath)) {
			processImport(filepath, symbolTableVisitor);
		} else {
			connection.window.showErrorMessage("Imported file not found: " + filepath);
		}
	}
}

function processImport(path: string, symbolTableVisitor: SymbolTableVisitor) {
	try {
		let data = fs.readFileSync(path);
		let input = CharStreams.fromString(data.toString());
		let lexer = new KotlinLexer(input);
		let parser = new KotlinParser(new CommonTokenStream(lexer));

		let parseTree = parser.kotlinFile();
		symbolTableVisitor.visit(parseTree);
	} catch (e) {
		connection.window.showErrorMessage("Cannot read from imported file " + path + ": " + e);
		console.error(e);
	}
}

function ensurePath(path: string) {
	if (path.startsWith("file:")) {
		//Decode for Windows paths like /C%3A/...
		let decoded = decodeURIComponent(fileUriToPath(path));
		if(!decoded.startsWith("\\\\") && decoded.startsWith("\\")) {
			//Windows doesn't seem to like paths like \C:\...
			decoded = decoded.substring(1);
		}
		return decoded;
	} else if(!pathFunctions.isAbsolute(path)) {
		return pathFunctions.resolve(path);
	} else {
		return path;
	}
}


// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		let uri = _textDocumentPosition.textDocument.uri;
		let document = documents.get(uri);
		let pos = _textDocumentPosition.position;

		let input = CharStreams.fromString(document.getText());
		let lexer = new KotlinLexer(input);
		let parser = new KotlinParser(new CommonTokenStream(lexer));

		let parseTree = parser.kotlinFile();
		let imports = parseTree?.preamble()?.importList()?.importHeader();

		let symbolTableVisitor = new SymbolTableVisitor();
		if(imports) {
			processImports(imports, uri, symbolTableVisitor);
		}

		function computeTokenPositionForCompletion(parseTree, caretPosition) {
			let pos = computeTokenPosition(parseTree, caretPosition);
			if(pos.context instanceof TerminalNode && pos.context.symbol.type == KotlinParser.Identifier) {
				pos.index--;
			}
			return pos;
		}

		let suggestions = getSuggestionsForParseTree(parser, parseTree, symbolTableVisitor,
			{ line: pos.line + 1, column: pos.character },
			computeTokenPositionForCompletion);
		return suggestions.map(s => {
			return {
				label: s,
				kind: CompletionItemKind.Keyword
			}
		});
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
