import * as fs from "fs-extra";
import * as path from "path";
import * as ts from "typescript";
import * as ejs from "ejs";
import * as child_process from "child_process";
import {ProtocolDefinitions} from "./Declarations";
import {generateDTSFiles} from "./NodeEmitter";

export async function generateNodePackage(declaration: ProtocolDefinitions, outDir: string) {
    if(await fs.pathExists(outDir))
        await fs.remove(outDir);
    await fs.mkdirp(outDir);

    await generateDTSFiles(declaration, outDir);
    await compileWebpackConfig(outDir);
    await fs.copyFile(path.join(__dirname, "node", "tsconfig.json"), path.join(outDir, "tsconfig.json"));

    console.log("Compiling package.");
    await executeWebpack(outDir);
    console.log("Package compiled.");

    /* generate the package.json.ejs */
    await generatePackageJson(declaration, outDir);
    await fs.copyFile(path.join(__dirname, "node", ".npmignore"), path.join(outDir, "dist", ".npmignore"));
    /* TODO: Execute publish? */
}

async function generatePackageJson(declaration: ProtocolDefinitions, outDir: string) {
    const source = await fs.readFile(path.join(__dirname, "node", "package.json.ejs"));
    const rendered = ejs.render(source.toString(), {
        version: declaration.version
    });

    await fs.writeFile(path.join(outDir, "dist", "package.json"), rendered);
}

async function compileWebpackConfig(outDir: string) {
    const program = ts.createProgram([
        path.join(__dirname, "node", "webpack.config.ts")
    ],{
        noEmitOnError: true,
        noImplicitAny: true,
        target: ts.ScriptTarget.ES2016,
        module: ts.ModuleKind.CommonJS,
        outDir: path.join(outDir)
    });

    let emitResult = program.emit();

    let allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
            let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
    });

    if(emitResult.emitSkipped)
        throw "failed to compile webpack config";
}

async function executeWebpack(dir: string) {
    const process = child_process.exec(`webpack-cli --config ${dir}/webpack.config.js`);
    process.stdout.on("data", console.log);
    process.stderr.on("data", console.error);

    await new Promise(resolve => process.once("exit", resolve));
    if(process.exitCode > 0)
        throw "webpack compile failed with exit code " + process.exitCode;
}