import * as assert from 'assert';
import * as fs from 'fs';
import * as mocha from 'mocha';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

/**
 * Resolves a package relative path (relative to root folder / package.json folder) to the actual path
 * @param pathStr the package relative path to resolve to an actual path
 */
function res(pathStr: string): string {
	return path.join(__dirname, "../../../", pathStr);
}

const onigWasmPath = res("node_modules/vscode-oniguruma/release/onig.wasm");

const syntaxTestRootPath = res("src/test/ci/syntax");

const syntaxes = {
	d: {
		extension: ".d",
	},
	diet: {
		extension: ".dt",
	},
	dml: {
		extension: ".dml",
	},
	sdl: {
		extension: ".sdl",
	},
};

function readTextFile(pathStr: string): Promise<string> {
	return new Promise((resolve, reject) => {
		fs.readFile(pathStr, (error, data) => error ? reject(error) : resolve(data.toString()));
	});
}

function splitLines(s: string): string[] {
	return s.split(/\r?\n/g);
}

function joinLines(lines: string[]): string {
	return lines.join("\n");
}

const registry = new vsctm.Registry({
	onigLib: async function () {
		const { buffer } = fs.readFileSync(onigWasmPath);
		await oniguruma.loadWASM(buffer);
		const lib: vsctm.IOnigLib = {
			createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
			createOnigString: (s: string) => new oniguruma.OnigString(s),
		};
		return lib;
	}(),
	loadGrammar: async function (scopeName) {
		const prefix = "source.";
		if (scopeName.startsWith(prefix)) {
			const name = scopeName.substring(prefix.length);
			if (name in syntaxes) {
				const syntaxFilePath = res(`syntaxes/${name}.json`);
				const syntaxFileContents = await readTextFile(syntaxFilePath);
				return vsctm.parseRawGrammar(syntaxFileContents, syntaxFilePath);
			}
		}
		return null;
	},
});

function getTestSourceFilePaths(name: string, extension: string): string[] {
	const root = path.join(syntaxTestRootPath, name);
	if (!fs.existsSync(root))
		return [];
	return fs.readdirSync(root)
		.filter(relPath => relPath.endsWith(extension))
		.map(relPath => path.join(root, relPath));
}

async function testSyntax(scope: string, sourceFilePath: string) {
	const grammarNullable = await registry.loadGrammar(scope);
	assert(grammarNullable);
	const grammar = grammarNullable;

	function parseLines(lines: string[]): string[] {
		let parsedLines: string[] = [];
		let ruleStack = vsctm.INITIAL;
		for (const [i, line] of lines.entries()) {
			const lineNumber = i + 1;
			const tokenizedLine = grammar.tokenizeLine(line, ruleStack);
			assert(!tokenizedLine.stoppedEarly, `Parsing line ${lineNumber} timed out`);
			ruleStack = tokenizedLine.ruleStack;
			for (const t of tokenizedLine.tokens) {
				parsedLines.push(`L${lineNumber} C${t.startIndex}..${t.endIndex}: ${t.scopes.join(" ")}`);
			}
		}
		return parsedLines;
	}

	const sourceCode = await readTextFile(sourceFilePath);
	const lines = splitLines(sourceCode);
	const parsedLines = parseLines(lines);
	const parsed = joinLines(parsedLines);
	fs.writeFileSync(`${sourceFilePath}.actual`, parsed);

	const expectedParsed = await readTextFile(`${sourceFilePath}.expected`);
	const expectedParsedLines = splitLines(expectedParsed);

	assert.deepStrictEqual(parsedLines, expectedParsedLines, `Unexpected result for ${sourceFilePath}`);
}

mocha.suite("syntax tests", function () {
	for (const [name, props] of Object.entries(syntaxes)) {
		const scopeName = `source.${name}`;
		mocha.suite(name, function () {
			const sourceFilePaths = getTestSourceFilePaths(name, props.extension);
			if (sourceFilePaths.length) {
				for (const sourceFilePath of sourceFilePaths) {
					const sourceFileName = path.basename(sourceFilePath);
					mocha.test(sourceFileName, async function () {
						await testSyntax(scopeName, sourceFilePath);
					});
				}
			} else {
				mocha.test(`No tests for ${name}`);
			}
		});
	}
});
