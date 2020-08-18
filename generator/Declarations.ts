export type FieldModifiers = "array";

export interface Field {
    id: string;

    commandName: string;
    readableName: string;

    type: string;
    modifiers: FieldModifiers[];
}

export enum MessageDirection {
    C2S,
    S2C
}

export enum MessageType {
    COMMAND,
    EVENT,
    RESPONSE
}

export interface MessageBase {
    className: string;

    direction: MessageDirection;
    attributes: MessageAttribute[];
}

export interface MessageCommand extends MessageBase {
    type: MessageType.COMMAND;

    command: string;
}

export interface MessageEvent extends MessageBase {
    type: MessageType.EVENT;

    notify: string;
}

export interface MessageResponse extends MessageBase {
    type: MessageType.RESPONSE;

    notify: string;
}

export type Message = MessageCommand | MessageEvent | MessageResponse;

export interface MessageAttribute {
    optional: boolean;
    field: Field;
}

export class ProtocolDefinitions {
    version: {
        major: number,
        minor: number,
        patch: number
    }
    fields: Field[];
    messages: Message[];

    types: TypeDeclaration[];
    typeRefs: TypeReference[];

    resolveType(type: Type) : Type | undefined {
        if(type.type === "reference") {
            return this.resolveType(type.target);
        } else {
            return type;
        }
    }

    findType(type: string) : Type | undefined {
        return this.types.find(e => e.name === type) || this.typeRefs.find(e => e.name === type);
    }
}

export interface TypeBase {
    description: string;
    name: string;
}

export interface TypeReference extends TypeBase {
    type: "reference";

    target: Type;
    targetType: string;
}

export interface TypeDeclaration extends TypeBase {
    type: "declaration";
}

export type Type = TypeReference | TypeDeclaration;