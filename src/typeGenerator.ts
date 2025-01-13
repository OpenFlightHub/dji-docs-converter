import { JSONSchema, compile } from "json-schema-to-typescript/dist/src";
import { readAndParseXmlFile } from "./xml";



export async function makeTypeAndSchemaString(path: string, name: string){

    const jsonSchema = parseObjectDefintionTable(await readAndParseXmlFile(path))

    if(jsonSchema.push_mode_0){
        return await process(jsonSchema.push_mode_0, name, '_STABLE_FREQUENCY') + '\n\n' + await process(jsonSchema.push_mode_1, name, '_STATE_CHANGE')
    } else {
        return await process(jsonSchema, name)
    }

    async function process(schema: JSONSchema, name: string, suffix?: string){

        const typescriptType = await compile(schema, name + (suffix || '') + '_TYPE', {
            style: {
                tabWidth: 4
            },
            bannerComment: ''
        })

        return 'export const ' + (name.toUpperCase().replace(/\-/g, '_').split('_').map(s => {
            return s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase()
        }).join('')) + (suffix || '') + '_SCHEMA = ' + JSON.stringify(schema, null, 4).replace(/(\s*)\"([^\"]+)\"(\s*\:.*)/g, (substring, ...args)=>{
            if(!args[1].match(/^[a-zA-Z].*$/)){
                return substring
            } else {
                return args[0] + args[1] + args[2]
            }

        }) + '\n\n' +
        typescriptType + '\n\n'
    }
}

function parseXmlTable<C extends string>(xmlObject: any, columns: C[]){

    const data: Record<C, string>[] = []

    for(const row of xmlObject.table.tbody.tr){

        const d = {} as Record<C, string>

        for(let i = 0; i < columns.length; i++){
            let data = row.td[i]

            if(typeof data !== 'string'){
                data = JSON.stringify(data)
            }

            d[columns[i]] = data
        }

        data.push(d)
    }

    return data
}

type PropertyType = 'struct' | 'array' | 'text' | 'int' | 'double' | 'enum_int' | 'bool' | 'float' //TODO support enum_string ? see https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/m3-series/properties.html » photo_storage_settings


type Properties = Record<"name" | "description" | "type" | "constraint" | "comments" | "accessMode" | "pushMode", string>[]

/**
 * dji adds one "»" in front of the property for ever depth
 *
 * e.g.
 *
 * device
 * »sn
 * »details
 * »»color
 *
 * means:
 *
 * type device = {
 *    sn: any
 *    details: {
 *        color: any
 *    }
 * }
 *
 *
 */
function parseObjectDefintionTable(xmlObject: any): JSONSchema | {push_mode_0: JSONSchema, push_mode_1: JSONSchema} {

    const parsed: Properties = parseXmlTable(xmlObject, ['name', 'description', 'type', 'constraint', 'comments', 'accessMode', 'pushMode'])

    const parsedPushMode_0: Properties = []
    const parsedPushMode_1: Properties = []

    for(const property of parsed){
        if(typeof property.accessMode === 'string'){
            if(property.accessMode.trim() === 'r'){
                property.comments += ' READONLY'
            } else if(property.accessMode.trim() === 'rw'){
                property.comments += ' READ AND WRITEABLE'
            }
        }

        if(typeof property.pushMode === 'string'){

            if(property.pushMode.trim() === '0'){
                parsedPushMode_0.push(property)
            } else if(property.pushMode.trim() === '1'){
                parsedPushMode_1.push(property)
            }
        }
    }

    if(parsedPushMode_0.length > 0 || parsedPushMode_1.length > 0){
        return {
            push_mode_0: process(parsedPushMode_0),
            push_mode_1: process(parsedPushMode_1)
        }
    } else {
        return process(parsed)
    }


    function process(rows: Properties){


        const schema: JSONSchema = {
            type: 'object',
            properties: {}
        }

        const scopeChain: JSONSchema[] = [schema]
        let lastScope: JSONSchema = schema

        for(const property of parsed){

            const depth = property.name.lastIndexOf('»') + 1

            const propertyNameClean = property.name.replace(/»/g, '').trim()


            if(depth !== (scopeChain.length - 1)){

                let depthDiff = depth - (scopeChain.length - 1)

                if (depthDiff === 1){

                    if(lastScope.type !== 'object' && lastScope.type !== 'array'){
                        throw new Error('property has depth but scope is not an object or array! ' +  property.name)
                    }

                    scopeChain.push(lastScope)

                } else if(depthDiff > 1){
                    throw new Error('depthDiff is > 1')
                } else if(depthDiff < 0){
                    while(depthDiff < 0){
                        scopeChain.pop()
                        lastScope = scopeChain[scopeChain.length - 1] //TODO is this correct?
                        depthDiff++
                    }
                }
            }


            const currentScope = scopeChain[scopeChain.length - 1]

            if(currentScope.type === 'object'){

                if(!currentScope.properties){
                    currentScope.properties = {}
                }

                const def = getPropertyDefinition(property as any)
                currentScope.properties[propertyNameClean] = def
                lastScope = def
            } else if(currentScope.type === 'array'){

                if(currentScope.items instanceof Array){
                    throw new Error('this should never happen: curenntScope.items is an array')
                }

                if(!currentScope.items){
                    currentScope.items = {
                        type: 'object'
                    }
                }

                const def = getPropertyDefinition(property as any)

                if(!currentScope.items.properties){
                    currentScope.items.properties = {}
                }

                currentScope.items.properties[propertyNameClean] = def
                lastScope = def
            } else {
                throw new Error('this should never ever happen')
            }
        }

        return schema
    }

}


function parsePropertyConstraints<P extends PropertyType>(str: string, propertyType: P): P extends 'array' ? {
    size?: null | number
    item_type: PropertyType
} : P extends 'text' ? {
    length?: null | number // in chars TODO: is this max length? or min length?
} : P extends 'int' ? {
    length?: null | number // length in digits TODO: is this max length? or min length?
    max?: null | number
    min?: null | number
    step?: null | number
    unit_name?: string
} : P extends 'float' ? {
    max?: null | number
    min?: null | number
    step?: null | number
    unit_name?: string
} : P extends 'double' ? {
    max?: null | number
    min?: null | number
    step?: null | number
    unit_name?: string
} : P extends 'bool' ? {
    false?: string
    true?: string
} : P extends 'enum_int' ? Map<number,string> : {} {

    if(str.length === 0){
        return
    }

    const parsed = JSON.parse(str.replace(/((\,|\{)\s*\"[^\"]+\")(\s*(\,|\}))/g, (substring, ...args)=>{
        return args[0] + ': "UNKNOWN"' + args[2]
    }).replace(/(\:)\s*([^\"\s]+)\s*(,|})/g, (substring, ...args)=>{//replace invalid json

        let value = args[1]
        if(value === '-'){
            value = 'null'
        }

        return args[0] + ' "' + value + '"' + args[2]
    }).replace(/(\:)\s*\"([^\"]+)\"\s*(,|})/g, (substring, ...args)=>{//replace empty strings with null

        let value = args[1]
        if(value === ''){
            value = 'null'
        }

        if(value.match(/^\d+$/)){
            value = parseInt(value)
        } else if(value.match(/^\d+\.+\d+$/)){
            value = parseFloat(value)
        }

        return args[0] + ' "' + value + '"' + args[2]
    }))

    if(propertyType === 'enum_int'){
        const ret = new Map<number, string>()

        for(const key of Object.keys(parsed)){
            ret.set(parseInt(key), parsed[key])
        }

        //@ts-ignore
        return ret
    }

    return parsed
}

function getPropertyDefinition(info: {name: string, description: string, type: PropertyType, constraint: string, comments: string, accessMode: string, pushMode: string}): JSONSchema {


    if(info.type === 'struct'){
        return {
            type: 'object',
            description: info.description + '\n\n' + info.comments
        }
    } else if (info.type === 'array'){

        const constraints = parsePropertyConstraints(info.constraint, info.type)

        return {
            type: 'array',
            description: info.description + '\n\n' + info.comments,
            maxItems: typeof constraints?.size === 'number' ? constraints.size : undefined,
            minItems: typeof constraints?.size === 'number' ? constraints.size : undefined,
        }
    } else if(info.type === 'bool'){
        return {
            type: 'boolean',
            description: info.description + '\n\n' + info.comments
        }
    } else if (info.type === 'int'){

        const constraints = parsePropertyConstraints(info.constraint, info.type)

        return {
            type: 'integer',
            description: info.description + '\n\n' + info.comments + (constraints?.unit_name ? ('\n\n' + constraints.unit_name) : ''),
            minimum: typeof constraints?.min === 'number' ? constraints.min : undefined,
            maximum: typeof constraints?.max === 'number' ? constraints.max : (typeof constraints?.length === 'number' ? parseInt(new Array(5).fill(9).join('')) : undefined)
        }
    } else if (info.type === 'double' || info.type === 'float'){

        const constraints = parsePropertyConstraints(info.constraint, info.type)

        return {
            type: 'number',
            description: info.description + '\n\n' + info.comments + (constraints?.unit_name ? ('\n\n' + constraints.unit_name) : ''),
            minimum: typeof constraints?.min === 'number' ? constraints.min : undefined,
            maximum: typeof constraints?.max === 'number' ? constraints.max : undefined
        }
    } else if (info.type === 'text'){

        const constraints = parsePropertyConstraints(info.constraint, info.type)

        return {
            type: 'string',
            description: info.description + '\n\n' + info.comments,
            maxLength: typeof constraints?.length === 'number' ? constraints.length : undefined
        }
    } else if (info.type === 'enum_int'){

        const constraints = parsePropertyConstraints(info.constraint, info.type)

        return {
            type: 'integer',
            description: info.description + '\n\n' + info.comments + '\n\n' + info.constraint,
            enum: (()=>{

                if(!constraints){
                    return
                }

                if(constraints.size === 0){
                    return [-1]
                }

                const possibleValues = []

                for(const e of constraints.keys()){
                    possibleValues.push(e)
                }

                return possibleValues

            })()
        }
    }


}
