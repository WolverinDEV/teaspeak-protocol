import * as fs from "fs-extra";
import * as path from "path";
import {Message, MessageDirection, MessageType, ProtocolDefinitions} from "./Declarations";
import {camelCase} from "change-case";

const kIndent = "    ";
const kIndent2 = kIndent + kIndent;
const kIndent3 = kIndent2 + kIndent;

const TypeMapping = {
    "u8": "number",
    "u16": "number",
    "u32": "number",
    "u64": "number",

    "i8": "number",
    "i16": "number",
    "i32": "number",
    "i64": "number",

    "str": "string",
    "bool": "boolean",

    "f32": "number"
};

function generateType(declaration: ProtocolDefinitions, type: string) {
    let targetType = declaration.findType(type);
    if(typeof targetType === "undefined")
        throw "missing type mapping for " + type;

    return TypeMapping[targetType.name] || targetType.name;
}

function generateMessageClassName(declaration: ProtocolDefinitions, message: Message) : string {
    const direction = message.direction === MessageDirection.S2C ? "S2C" : "C2S";
    return direction + message.className;
}

interface MessageGenerateData {
    declaration: ProtocolDefinitions;
    message: Message;

    className: string;
    command: string
}

function generateMessageConstructor(data: MessageGenerateData, declarationOnly: boolean) : string[] {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public constructor(payload: ${data.className}.Data, ...payloads: ${data.className}.DataArray[]);`);
    } else {
        lines.push(`public constructor(payload: ${data.className}.Data, ...bulks: ${data.className}.DataArray[]) {`);
        lines.push(`${kIndent}super();`);
        lines.push(`${kIndent}this.payload = payload;`);
        lines.push(`${kIndent}this.bulks = bulks;`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageParseString(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public static parseString(payload: string, containsCommand: boolean) : ${data.className};`);
    } else {
        lines.push(`public static parseString(payload: string, containsCommand: boolean) : ${data.className} {`);
        lines.push(`${kIndent}return createPacketFromString(${data.className}, payload, containsCommand);`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageParseJson(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public static parseJson(payload: any[]) : ${data.className};`);
    } else {
        lines.push(`public static parseJson(payload: any[]) : ${data.className} {`);
        lines.push(`${kIndent}return new (${data.className} as any)(...payload.map(e => mapFromJson(e, ${data.className}.kFields)));`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageData(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    lines.push(`public data(bulkIndex?: 0) : Readonly<${data.className}.Data>;`);
    lines.push(`public data(bulkIndex: number) : Readonly<${data.className}.DataArray>;`);
    if(!declarationOnly) {
        lines.push(`public data(bulkIndex?: number) {`);
        lines.push(`${kIndent}return bulkIndex > 0 ? this.bulks[bulkIndex - 1] : this.payload;`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageDataLength(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public dataLength() : number;`);
    } else {
        lines.push(`public dataLength() : number {`);
        lines.push(`${kIndent}return 1 + this.bulks.length;`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageKeys(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    lines.push(`public keys(bulkIndex?: 0) : (keyof ${data.className}.Data)[];`);
    lines.push(`public keys(bulkIndex: number) : (keyof ${data.className}.DataArray)[];`);
    if(!declarationOnly) {
        lines.push(`public keys(bulkIndex?: number) {`);
        lines.push(`${kIndent}return Object.keys(this.data(bulkIndex)) as any;`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageBuildString(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public buildString(withCommand: boolean) : string;`);
    } else {
        lines.push(`public buildString(withCommand: boolean) : string {`);
        lines.push(`${kIndent}return (withCommand && this.command ? this.command + " " : "") + [this.payload, ...this.bulks]`);
        lines.push(`${kIndent2}.map(e => mapToString(e, ${data.className}.kFields))`);
        lines.push(`${kIndent2}.join(" | ");`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageBuildJson(data: MessageGenerateData, declarationOnly: boolean) {
    let lines = [];

    if(declarationOnly) {
        lines.push(`public buildJson() : {[key: string]: string}[];`);
    } else {
        lines.push(`public buildJson() : {[key: string]: string}[] {`);
        lines.push(`${kIndent}return [this.payload, ...this.bulks].map(e => mapToJson(e, ${data.className}.kFields));`);
        lines.push(`}`);
    }

    return lines;
}

function generateMessageDeclaration(declaration: ProtocolDefinitions, message: Message, declarationOnly: boolean): string[] {
    let lines = [];

    const data: MessageGenerateData = {
        message: message,
        declaration: declaration,
        className: generateMessageClassName(declaration, message),
        command: message.type === MessageType.COMMAND ? message.command : message.notify
    }
    const directionValue = message.direction === MessageDirection.C2S ? "c2s" : "s2c";

    lines.push(`export class ${data.className} extends Message {`);
    {
        let commandDecl = declarationOnly ? `: "${data.command}";` : `: "${data.command}" = "${data.command}";`;

        lines.push(`${kIndent}public static readonly kCommand${commandDecl}`);
        lines.push(`${kIndent}public static readonly kDirection = "${directionValue}"`);
        lines.push(``);
        lines.push(...generateMessageParseString(data, declarationOnly).map(e => kIndent + e));
        lines.push(...generateMessageParseJson(data, declarationOnly).map(e => kIndent + e));
        lines.push(``);

        lines.push(`${kIndent}public readonly command${commandDecl}`);
        if(!declarationOnly) {
            lines.push(`${kIndent}private payload: ${data.className}.Data;`);
            lines.push(`${kIndent}private bulks: ${data.className}.DataArray[];`);
        }

        lines.push(``);

        lines.push(...generateMessageConstructor(data, declarationOnly).map(e => kIndent + e));
        lines.push(``);

        lines.push(...generateMessageData(data, declarationOnly).map(e => kIndent + e));
        lines.push(``);

        lines.push(...generateMessageDataLength(data, declarationOnly).map(e => kIndent + e));
        lines.push(``);

        lines.push(...generateMessageKeys(data, declarationOnly).map(e => kIndent + e));
        lines.push(``);

        lines.push(...generateMessageBuildString(data, declarationOnly).map(e => kIndent + e));
        lines.push(...generateMessageBuildJson(data, declarationOnly).map(e => kIndent + e));
    }
    lines.push(`}`);
    lines.push(``);

    lines.push(`export namespace ${data.className} {`);
    lines.push(`${kIndent}export type Data = {`);
    message.attributes.forEach(attribute => {
        let varName = camelCase(attribute.field.readableName);
        lines.push(`${kIndent}${kIndent}${varName}${attribute.optional ? "?" : ""}: ${generateType(declaration, attribute.field.type)};`);
    });
    lines.push(`${kIndent}};`);
    /* TODO: Better implementation of which attributes are send as bulk */
    lines.push(`${kIndent}export type DataArray = Partial<Data>;`);
    lines.push(``);
    lines.push(`${kIndent}export const kFields = {`);
    message.attributes.forEach(attribute => {
        let varName = camelCase(attribute.field.readableName);
        let constraints = [];

        if(attribute.optional)
            constraints.push("is-optional");

        const type = declaration.findType(attribute.field.type);
        const primitiveType = declaration.resolveType(type);
        if(typeof primitiveType === "undefined")
            throw "missing primitive type for " + type.name;

        constraints.push("is-" + primitiveType.name);

        lines.push(`${kIndent2}"${varName}": {`);
        lines.push(`${kIndent3}type: "${attribute.field.type}",`);
        lines.push(`${kIndent3}parseType: "${primitiveType.name}",`);
        lines.push(``);
        lines.push(`${kIndent3}commandName: "${attribute.field.commandName}",`);
        lines.push(`${kIndent3}readableName: "${varName}",`);
        lines.push(``);
        lines.push(`${kIndent3}constraints: [${constraints.map(e => `"${e}"`).join(",")}],`);
        lines.push(`${kIndent2}},`);
    });
    lines.push(`${kIndent}};`);
    lines.push(`}`);

    return lines;
}

function generateBaseDeclaration(declarationOnly: boolean) : string[] {
    let lines = [];

    lines.push(`export abstract class Message {`);
    if(declarationOnly) {
        lines.push(`${kIndent}protected constructor();`);
    } else {
        lines.push(`${kIndent}protected constructor() {}`);
    }
    lines.push(``);
    lines.push(`${kIndent}public abstract buildString(withCommand: boolean): string;`);
    lines.push(`${kIndent}public abstract buildJson(): any[];`);
    lines.push(`}`);
    lines.push(``);

    /* I've to do it like that, else my IDE's inspection breaks... (PHPStorm 2020.1.4) */
    let line = "export type MessageClass<T";
    line += " extends Message = Message> = {";
    lines.push(line);

    lines.push(`${kIndent}kCommand: string;`);
    lines.push(`${kIndent}kDirection: "s2c" | "c2s";`);
    lines.push(`${kIndent}kFields: {[key: string]: any};`);
    lines.push(``);
    lines.push(`${kIndent}parseString(payload: string, containsCommand: boolean) : T;`);
    lines.push(`${kIndent}parseJson(payload: any[]) : T;`);
    lines.push("}");

    return lines;
}

export async function generateDTSFiles(declaration: ProtocolDefinitions, outDir: string) {
    const message = await generateMessage(declaration, false);
    const types = await generateTypes(declaration);

    await fs.writeFile(path.join(outDir, "messages.ts"), message);
    await fs.writeFile(path.join(outDir, "types.ts"), types);
    await fs.copyFile(path.join(__dirname, "node", "helper.ts"), path.join(outDir, "helper.ts"));
}

async function generateMessage(declaration: ProtocolDefinitions, declarationOnly: boolean) : Promise<String> {
    const lines = [];
    lines.push(`/*`);
    lines.push(` * This is an auto generated file!`);
    lines.push(` */`);
    lines.push(``);

    /* import all "special" types */
    lines.push(`import {`);
    for(const type of declaration.typeRefs)
        lines.push(`${kIndent}${type.name},`);
    lines.push(`} from "./types";`);
    lines.push(`import { mapToJson, mapFromJson, mapToString, createPacketFromString, parseMessageFromString } from "./helper";`);

    /* basic class generation */
    lines.push(``);
    lines.push(...generateBaseDeclaration(declarationOnly));
    lines.push(``);

    lines.push(`/*`);
    lines.push(` * All messages send from the server to the client.`);
    lines.push(` */`);
    declaration.messages.filter(e => e.direction === MessageDirection.S2C).forEach(message => {
        lines.push(...generateMessageDeclaration(declaration, message, declarationOnly));
        lines.push(``);
    });

    lines.push(``);
    lines.push(`/*`);
    lines.push(` * All messages send from the client to the server.`);
    lines.push(` */`);
    declaration.messages.filter(e => e.direction === MessageDirection.C2S).forEach(message => {
        lines.push(...generateMessageDeclaration(declaration, message, declarationOnly));
        lines.push(``);
    });

    lines.push(``);
    lines.push(`/*`);
    lines.push(` * General types.`);
    lines.push(` */`);
    for(const direction of [MessageDirection.S2C, MessageDirection.C2S]) {
        const directionName = direction === MessageDirection.C2S ? "C2S" : "S2C";
        lines.push(`export interface CommandMap${directionName} {`);
        declaration.messages.filter(e => e.direction === direction).forEach((message) => {
            const command = message.type === MessageType.COMMAND ? message.command : message.notify;
            if(command === undefined) return;

            const klass = generateMessageClassName(declaration, message);
            lines.push(`${kIndent}"${command}": ${klass};`);
        });
        lines.push(`}`);
        lines.push(``);
    }

    for(const direction of [MessageDirection.S2C, MessageDirection.C2S]) {
        const directionName = direction === MessageDirection.C2S ? "C2S" : "S2C";
        lines.push(`export type Message${directionName} =`);
        declaration.messages.filter(e => e.direction === direction).forEach((message, index, array) => {
            const ending = index + 1 === array.length ? ";" : " |";
            lines.push(kIndent + generateMessageClassName(declaration, message) + ending);
        });
        lines.push(``);
    }

    /* the class helper methods */
    for(const direction of [MessageDirection.S2C, MessageDirection.C2S]) {
        const directionName = direction === MessageDirection.C2S ? "C2S" : "S2C";
        lines.push(`export function findClass${directionName}<T extends keyof CommandMap${directionName}>(key: T) : MessageClass<CommandMap${directionName}[T]> | undefined;`);
        lines.push(`export function findClass${directionName}(key: string) : MessageClass<Message${directionName}> | undefined${declarationOnly ? ";" : " {"}`);
        if(!declarationOnly) {
            lines.push(`${kIndent}switch(key) {`);
            for(const message of declaration.messages) {
                if(message.direction !== direction)
                    continue;

                const command = message.type === MessageType.COMMAND ? message.command : message.notify;
                if(command === undefined)
                    continue;

                const className = generateMessageClassName(declaration, message);
                lines.push(`${kIndent2}case "${command}":`);
                lines.push(`${kIndent3}return ${className};`);
            }
            lines.push(`${kIndent2}default:`);
            lines.push(`${kIndent3}return undefined;`);
            lines.push(`${kIndent}}`);
            lines.push(`}`);
        }
        lines.push(``);
    }

    for(const direction of [MessageDirection.S2C, MessageDirection.C2S]) {
        const directionName = direction === MessageDirection.C2S ? "C2S" : "S2C";
        lines.push(`export function parseMessage${directionName}String(payload: string) : Message${directionName} | undefined {`)
        lines.push(`${kIndent}return parseMessageFromString(payload, findClass${directionName});`);
        lines.push(`}`);
        lines.push(``);
    }

    return lines.join("\n");
}

async function generateTypes(declaration: ProtocolDefinitions) : Promise<string> {
    const lines = [];
    lines.push(`/*`);
    lines.push(` * This is an auto generated file!`);
    lines.push(` */`);
    lines.push(``);

    declaration.typeRefs.forEach(ref => {
        lines.push(`export type ${ref.name} = ${generateType(declaration, ref.target.name)};`);
    });

    return lines.join("\n");
}