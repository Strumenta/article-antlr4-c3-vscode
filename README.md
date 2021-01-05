# Integrating Code Completion in Visual Studio Code – With the Language Server Protocol

This repository contains the code for the article, [Integrating Code Completion in Visual Studio Code – With the Language Server Protocol](https://tomassetti.me/integrating-code-completion-in-visual-studio-code-with-the-language-server-protocol/), published on the Strumenta blog.

The code is released under the Apache license and is intended for demonstration purposes only.

## Functionality

This Language Server works for a subset of the Kotlin language, stored in files with the .mykt extension (so as not to clash with proper Kotlin support). It has the following language features:
- Code Completion (both syntactic and semantic)

It also includes an End-to-End test.

The code was originally adapted from Microsoft's LSP samples.

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the Sample

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the client and server.
- Switch to the Debug viewlet.
- Select `Launch Client` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a document in 'plain text' language mode.
  - Type `j` or `t` to see `Javascript` and `TypeScript` completion.
  - Enter text content such as `AAA aaa BBB`. The extension will emit diagnostics for all words in all-uppercase.
