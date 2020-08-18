import * as path from "path";
import * as fs from "fs-extra";
import * as toml from "toml";
import {
    Field,
    Message,
    MessageAttribute,
    MessageDirection,
    MessageType,
    ProtocolDefinitions,
    TypeDeclaration, TypeReference
} from "./Declarations";
import {generateNodePackage} from "./NodeGenerator";

async function readVersion(definitions: ProtocolDefinitions) {
    const protBuffer = await fs.readFile(path.join(__dirname, "..", "declarations", "version.toml"));
    const data = toml.parse(protBuffer.toString());
    const { major, minor, patch } = data["protocol-version"][0];
    definitions.version = {
        major: parseInt(major),
        minor: parseInt(minor),
        patch: parseInt(patch)
    }
}

async function readTypes(definitions: ProtocolDefinitions) {
    const protBuffer = await fs.readFile(path.join(__dirname, "..", "declarations", "types.toml"));
    const data = toml.parse(protBuffer.toString());

    definitions.types = data["type"].map(type => {
        return {
            type: "declaration",
            name: type["id"],
            description: type["desc"]
        } as TypeDeclaration;
    });

    definitions.typeRefs = data["type-ref"].map(type => {
        return {
            type: "reference",
            name: type["id"],
            description: type["desc"],
            target: null,
            targetType: type["ref"]
        } as TypeReference;
    });

    const allTypes = [...definitions.types, ...definitions.typeRefs];
    definitions.typeRefs.forEach(type => {
        const target = allTypes.find(e => e.name === type.targetType);
        if(typeof target === "undefined")
            throw "type ref " + type.name + " points to invalid ref " + type.targetType;

        type.target = target;
    });

    /* TODO: Check for circular references? */
}

async function readFields() : Promise<Field[]> {
    const protBuffer = await fs.readFile(path.join(__dirname, "..", "declarations", "fields.toml"));
    const data = toml.parse(protBuffer.toString());
    return data.fields.map(field => {
        return {
            id: field.map,
            commandName: field.ts,
            readableName: field.pretty,
            modifiers: field.mod,
            type: field.type
        } as Field
    });
}

async function readMessages(fields: Field[]) : Promise<Message[]> {
    const protBuffer = await fs.readFile(path.join(__dirname, "..", "declarations", "messages.toml"));
    const data = toml.parse(protBuffer.toString());

    const fieldMap = {};
    fields.forEach(field => {
        if(typeof fieldMap[field.id] !== "undefined")
            throw "duplicated field id " + field.id;

        fieldMap[field.id] = field;
    });

    return data["msg_group"].reduce((previousValue: Message[], currentValue: any) => {
        let direction: MessageDirection;
        if(currentValue.default.s2c) {
            direction = MessageDirection.S2C;
        } else if(currentValue.default.c2s) {
            direction = MessageDirection.C2S;
        } else {
            throw "invalid message direction";
        }

        const isResponse = currentValue.default.response;
        previousValue.push(...currentValue.msg.map(entry => {
            const attributes = entry.attributes.map(attribute => {
                let optional = attribute.endsWith("?");
                if(optional) {
                    attribute = attribute.substr(0, attribute.length - 1);
                }

                const field = fieldMap[attribute];
                if(typeof field === "undefined") {
                    throw "missing field " + attribute;
                }

                return {
                    field: field,
                    optional: optional
                } as MessageAttribute
            });

            if(isResponse) {
                return {
                    type: MessageType.RESPONSE,
                    attributes: attributes,
                    direction: direction,
                    notify: entry.notify,
                    className: entry.name
                } as Message;
            } else if(direction === MessageDirection.S2C) {
                return {
                    type: MessageType.EVENT,
                    attributes: attributes,
                    direction: direction,
                    notify: entry.notify,
                    className: entry.name
                } as Message;
            } else {
                return {
                    type: MessageType.COMMAND,
                    attributes: attributes,
                    direction: direction,
                    command: entry.notify,
                    className: entry.name
                } as Message;
            }
        }));
        return previousValue;
    }, []);
}

async function readMessageDeclaration() : Promise<ProtocolDefinitions> {
    let result = new ProtocolDefinitions();
    await readVersion(result);
    await readTypes(result);
    result.fields = await readFields();
    result.messages = await readMessages(result.fields);
    return result;
}

async function main() {
    const decl = await readMessageDeclaration();
    await generateNodePackage(decl, path.join(__dirname, "..", "generated-node"));
}

main().catch(error => {
    console.error(error);
});