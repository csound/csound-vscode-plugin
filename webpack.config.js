//@ts-check

'use strict';

const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const copyPlugin = require('copy-webpack-plugin');

const localCsoundGrammarPath = path.resolve(__dirname, '../csound-tree-sitter');
const csoundGrammarPath = fs.existsSync(path.join(localCsoundGrammarPath, 'tree-sitter-csound.wasm'))
	? localCsoundGrammarPath
	: path.resolve(__dirname, 'node_modules/tree-sitter-csound');

// web extension and LSP worker are type-checked against WebWorker libs, not Node or DOM
const webTsConfig = path.resolve(__dirname, 'src/web/tsconfig.json');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const webExtensionConfig = {
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
	target: 'webworker', // extensions run in a webworker context
	entry: {
        'extension': './src/web/extension.ts',
		'test/suite/index': './src/web/test/suite/index.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, './dist/web'),
        libraryTarget: 'commonjs',
		devtoolModuleFilenameTemplate: '../../[resource-path]'
    },
	resolve: {
		mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
		extensions: ['.ts', '.js'], // support ts-files and js-files
		alias: {
			// provides alternate implementation for node module and source files
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				loader: 'ts-loader',
				options: { configFile: webTsConfig }
			}]
		}]
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: 'process/browser', // provide a shim for the global `process` variable
		}),
        new copyPlugin({
            patterns: [
                {
                    from: 'resources/csound-json_data/',
                    to: './csound-json_data',
                    context: 'src/web',
                    noErrorOnMissing: true
                }
            ]

		}),
	],
	externals: {
		'vscode': 'commonjs vscode', // ignored because it doesn't exist
	},
	performance: {
		hints: false
	},
	// devtool: 'nosources-source-map' // create a source map that points to the original source file
	devtool: 'inline-source-map' // create a source map that points to the original source file
};

/** @type WebpackConfig */
const lspServerConfig = {
	mode: 'none',
	target: 'webworker',
	entry: {
		'server': './src/web/server.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, './dist/web'),
        globalObject: 'self',
    },
	resolve: {
		mainFields: ['browser', 'module', 'main'],
		extensions: ['.ts', '.js'],
		fallback: {
	        "fs": false,
            "module": false,
            "crypto": false,
            "path": require.resolve("path-browserify"),
            "assert": require.resolve("assert"),
            "process": require.resolve("process/browser"),
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{ loader: 'ts-loader', options: { configFile: webTsConfig } }]
		}]
	},
	plugins: [
    	new webpack.ProvidePlugin({
            process: 'process/browser.js',
        }),
        new copyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'node_modules/web-tree-sitter/web-tree-sitter.wasm'),
                    to: './'
                },
                {
                    from: path.join(csoundGrammarPath, 'tree-sitter-csound.wasm'),
                    to: './',
                    context: 'src/web'
                },
                {
                    from: path.join(csoundGrammarPath, 'queries'),
                    to: './queries',
                    context: 'src/web',
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-python/tree-sitter-python.wasm'),
                    to: './',
                    context: 'src/web'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-python/queries'),
                    to: './python_queries',
                    context: 'src/web'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-html/tree-sitter-html.wasm'),
                    to: './'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-html/queries'),
                    to: './html_queries',
                    context: 'src/web'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-json/tree-sitter-json.wasm'),
                    to: './'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-json/queries'),
                    to: './json_queries',
                    context: 'src/web'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-bash/tree-sitter-bash.wasm'),
                    to: './'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/tree-sitter-bash/queries'),
                    to: './bash_queries',
                    context: 'src/web'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/@tree-sitter-grammars/tree-sitter-toml/tree-sitter-toml.wasm'),
                    to: './'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/@tree-sitter-grammars/tree-sitter-toml/queries'),
                    to: './toml_queries',
                    context: 'src/web'
                }
            ]
        })
    ],
    externals: { },
	performance: { hints: false },
	devtool: 'inline-source-map'
};

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vsceignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map'
};
/** @type WebpackConfig */
const webviewConfig = {
	mode: 'none',
	target: 'web', // webview runs in browser context
	entry: {
		'csound-webview': './src/webview/csound-webview.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, './dist/webview'),
		libraryTarget: 'umd',
		devtoolModuleFilenameTemplate: '../../[resource-path]'
	},
	resolve: {
		mainFields: ['browser', 'module', 'main'],
		extensions: ['.ts', '.js'],
		fallback: {
			// Webpack 5 no longer polyfills Node.js core modules automatically.
			'assert': require.resolve('assert')
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				loader: 'ts-loader',
				options: {
					configFile: path.resolve(__dirname, 'src/webview/tsconfig.webview.json'),
					compilerOptions: {
						lib: ['ES2020', 'DOM', 'DOM.Iterable']
					}
				}
			}]
		}]
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: 'process/browser',
		}),
		new copyPlugin({
            patterns: [
                {
                    from: '*.css',
                    to: './',
                    context: 'src/webview' // from src/webview to dist/webview
                },
            ],
        }),
	],
	performance: {
		hints: false
	},
	devtool: 'nosources-source-map'
};

module.exports = [ webExtensionConfig, extensionConfig, webviewConfig, lspServerConfig ];
