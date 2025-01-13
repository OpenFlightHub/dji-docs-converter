
import { XMLParser } from 'fast-xml-parser'
import * as fs from 'fs'


export async function readAndParseXmlFile(filePath: string){
	let xmlString = await fs.promises.readFile(filePath, 'utf-8')

	const parser = new XMLParser({
        attributeNamePrefix : "@_",
        ignoreAttributes : false,
        allowBooleanAttributes : true,
        parseAttributeValue : false,
        trimValues: true,
        attributeValueProcessor: (tag, value) => {return tag},
        tagValueProcessor: (tag, value) => {return value},
        isArray: (tagName, jPath) => {
            if(tagName === 'tr'){
                return true
            } else {
                return false
            }
        }
    });

	return parser.parse(xmlString)
}
