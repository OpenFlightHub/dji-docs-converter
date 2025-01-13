import { makeTypeAndSchemaString } from "./typeGenerator"
import * as fs from 'fs'
import * as path from 'path'

const OUTPUT_FILE = 'output.ts'

async function run(){

    console.log('searching files ...')

    const files = getFilesRecrusively('docs/mqtt')

    console.log('  found', files.length, 'files')

    console.log('generating output ...')

    if(fs.existsSync(OUTPUT_FILE)){
        fs.rmSync(OUTPUT_FILE)
    }


    const entriesTotal = files.length
    let entriesDone = 0

    fs.appendFileSync(OUTPUT_FILE, '/* AUTOMATICALLY GENERATED WITH dji-docs-converter */\n\n\n', 'utf-8')

    for(const file of files){

        console.log('  processing', path.relative('docs', file.path))

        const ret = await makeTypeAndSchemaString(file.path, file.name)
        fs.appendFileSync(OUTPUT_FILE, ret, 'utf-8')

        entriesDone ++
        console.log('  progess', entriesDone, '/', entriesTotal)
    }

    console.log('done')
}

function getFilesRecrusively(filePath: string){

    const result: {
        path: string
        name: string
    }[] = []

    const files = fs.readdirSync(filePath)

    for(const file of files){
        const pathAbsolute = path.join(filePath, file)

        if(fs.lstatSync(pathAbsolute).isDirectory()){
            result.push(...getFilesRecrusively(pathAbsolute))
        } else {
            result.push({
                name: path.relative('docs', pathAbsolute).replace(/\.xml/, '').replace(/\\/g, '_').replace(/\s/g, '_'),
                path: pathAbsolute
            })
        }
    }

    return result
}

run()
