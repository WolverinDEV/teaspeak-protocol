type Type = "number" | "boolean" | "string" | "object" | "any";
type ReverseType<T> = T extends "number" ? number :
                        T extends "string" ? string :
                        T extends "object" ? object :
                        T extends "boolean" ? boolean :
                        T extends "any" ? any :
                        never;

export enum ConstraintResult {
    VALID,
    VALID_EXIT
}

export interface Constraint<T extends Type = "any"> {
    name: string;
    valueType: T;
    validator: (value: ReverseType<T>) => ConstraintResult | string;
}

export class ConstraintValidator {
    private registeredConstraints: {[key: string]: Constraint} = {};

    validate(object: any, constraints: string[]) {
        for(const constraintName of constraints) {
            const constraint = this.registeredConstraints[constraintName];
            if(typeof constraint !== "object")
                throw "missing constraint " + constraintName;

            if(constraint.valueType !== "any" && constraint.valueType !== typeof object)
                throw "object type miss matches constraints " + constraint.name + " type (" + typeof object + " <> " + constraint.valueType + ")";

            const result = constraint.validator(object);
            if(result === ConstraintResult.VALID_EXIT) {
                return;
            } else if(typeof result === "string") {
                throw "constraint " + constraint.name + " failed: " + result;
            }
        }
    }

    registerConstraint<T extends Type>(constraint: Constraint<T>) {
        this.registeredConstraints[constraint.name] = constraint as any;
    }
}

export const messageParameterValidator = new ConstraintValidator();

messageParameterValidator.registerConstraint({
    name: "is-optional",
    valueType: "any",
    validator: value => typeof value === "undefined" ? ConstraintResult.VALID_EXIT : ConstraintResult.VALID
});

const ValueRangeConstraint = (name: string, min: number | bigint, max: number | bigint) => {
    return {
        name: name,
        valueType: "number",
        validator: value => {
            if(Math.floor(value) !== value)
                throw "value " + value + " isn't an integer";

            if(value > max || value < min)
                throw "value " + value + " out of range ([" + min + "; " + max + "])";

            return ConstraintResult.VALID;
        }
    } as Constraint<"number">;
}

messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u8", 0, 255));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u16", 0, 65536));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u32", 0, 4294967296));

messageParameterValidator.registerConstraint(ValueRangeConstraint("is-i8", -128, 127));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-i16", -32768, 32767));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-i32", -2147483648, 2147483647));

/*
const twoPow64 = 4294967296n * 4294967296n;
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u64", 0, twoPow64));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-i64", twoPow64 / -2n, twoPow64 / 2n -1n));
*/
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u64", 0, Number.MAX_SAFE_INTEGER));
messageParameterValidator.registerConstraint(ValueRangeConstraint("is-u64", Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));

messageParameterValidator.registerConstraint({
    name: "is-bool",
    valueType: "boolean",
    validator: () => ConstraintResult.VALID
});

messageParameterValidator.registerConstraint({
    name: "is-str",
    valueType: "string",
    validator: () => ConstraintResult.VALID
});

/* TODO: Test range! */
messageParameterValidator.registerConstraint({
    name: "is-f32",
    valueType: "number",
    validator: () => ConstraintResult.VALID
});

export interface StringConverter {
    name: string;

    fromString(data: string) : any;
    toString(data: any) : string;
}

export const converters: {[key: string]: StringConverter} = {};

const NumberConverter = (name: string, method: typeof parseInt | typeof parseFloat) => {
    return {
        name: name,
        fromString: data => method(data),
        toString: data => data.toString()
    } as StringConverter;
}

converters["u8"] = NumberConverter("u8", parseInt);
converters["u16"] = NumberConverter("u16", parseInt);
converters["u32"] = NumberConverter("u32", parseInt);
converters["u64"] = NumberConverter("u64", parseInt);

converters["i8"] = NumberConverter("i8", parseInt);
converters["i16"] = NumberConverter("i16", parseInt);
converters["i32"] = NumberConverter("i32", parseInt);
converters["i64"] = NumberConverter("i64", parseInt);

converters["f32"] = NumberConverter("f32", parseFloat);

converters["str"] = {
    name: "str",
    fromString: data => data,
    toString: data => data
};

converters["bool"] = {
    name: "bool",
    fromString: data => data === "1" || data === "true",
    toString: data => data ? "1" : "0"
}

interface Field {
    commandName: string;
    readableName: string;

    parseType: string;
    constraints: string[];
}

type FieldMap = {[key: string]: Field};

export function mapToJson(object: object, fields: FieldMap) : {[key: string]: string} {
    let result = {};

    for(const key of Object.keys(object)) {
        const field = fields[key];
        if(typeof field !== "object")
            throw "key " + key + " is unknown";

        messageParameterValidator.validate(object[key], field.constraints);

        const converter = converters[field.parseType];
        if(typeof converter === "undefined")
            throw "missing value converter for " + field.parseType;

        result[field.commandName] = converter.toString(object[key]);
    }

    return result;
}

export function mapFromJson(payload: any, fields: FieldMap) : {[key: string]: any} {
    let result = {};

    for(const key of Object.keys(fields)) {
        const field = fields[key];

        const converter = converters[field.parseType];
        if(typeof converter === "undefined")
            throw "missing value converter for " + field.parseType;

        if(typeof payload[field.commandName] === "undefined") {
            messageParameterValidator.validate(undefined, field.constraints);
            continue;
        }

        let value = converter.fromString(payload[field.commandName]);
        messageParameterValidator.validate(value, field.constraints);
        result[field.readableName] = value;

    }

    return result;
}

function unescapeCommandValue(value: string) : string {
    let result = "", index = 0, lastIndex = 0;

    while (true) {
        index = value.indexOf('\\', lastIndex);
        if(index === -1 || index >= value.length + 1)
            break;

        let replace;
        switch (value.charAt(index + 1)) {
            case 's': replace = ' '; break;
            case '/': replace = '/'; break;
            case 'p': replace = '|'; break;
            case 'b': replace = '\b'; break;
            case 'f': replace = '\f'; break;
            case 'n': replace = '\n'; break;
            case 'r': replace = '\r'; break;
            case 't': replace = '\t'; break;
            case 'a': replace = '\x07'; break;
            case 'v': replace = '\x0B'; break;
            case '\\': replace = '\\'; break;
            default:
                lastIndex = index + 1;
                continue;
        }

        result += value.substring(lastIndex, index) + replace;
        lastIndex = index + 2;
    }

    return result + value.substring(lastIndex);
}

const escapeCharacterMap = {
    "\\": "\\",
    " ": "s",
    "/": "/",
    "|": "p",
    "\b": "b",
    "\f": "f",
    "\n": "n",
    "\r": "r",
    "\t": "t",
    "\x07": "a",
    "\x0B": "b"
};

const escapeCommandValue = (value: string) => value.replace(/[\\ \/|\b\f\n\r\t\x07]/g, value => "\\" + escapeCharacterMap[value]);

export function mapToString(object: object, fields: FieldMap) : string {
    const json = mapToJson(object, fields);
    return Object.keys(json)
                .map(key => typeof json[key] === "undefined" ? key : key + "=" + escapeCommandValue(json[key]))
                .join(" ");
}

function mapFromString(payload: string, fields: FieldMap) : {[key: string]: any} {
    const json = {};

    for(const keyValue of payload.split(" ")) {
        if(keyValue[0] === '-') {
            /* switches.push(pair.substring(1)); */
            continue;
        }

        const separator = keyValue.indexOf('=');
        if(separator === -1) {
            json[keyValue] = undefined;
        } else {
            json[keyValue.substring(0, separator)] = unescapeCommandValue(keyValue.substring(separator + 1));
        }
    }

    return mapFromJson(json, fields);
}

type CommandKlass = {
    kFields: FieldMap,
    kCommand: string,
    parseString(payload: string, containsCommand: boolean)
};

export function createPacketFromString(klass: (new(...args: any) => any) & CommandKlass, payload: string, containsCommand: boolean) {
    const bulks = payload.split("|");

    if(containsCommand) {
        const firstBulk = bulks[0].split(" ");

        if(firstBulk[0].indexOf("=") === -1) {
            /* we've a command */
            const [ command ] = firstBulk.splice(0, 1);
            if(command !== klass.kCommand)
                throw "command miss match (expected: " + klass.kCommand + ", received: " + command + ")";
            bulks[0] = firstBulk.join(" ");
        } else {
            throw "missing command type";
        }
    }

    return new klass(
        ...bulks.map(e => mapFromString(e, klass.kFields))
    );
}

export function parseMessageFromString(payload: string, classResolver: (command: string) => CommandKlass | undefined) : any | undefined {
    let index = payload.indexOf(" ");
    if(index === -1) {
        index = payload.length;
    }

    const command = payload.substring(0, index);
    const commandPayload = payload.substring(index + 1);

    const klass = classResolver(command);
    if(!klass) {
        return undefined;
    }

    return klass.parseString(commandPayload, false);
}