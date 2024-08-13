import fs from 'fs'
import yaml from 'js-yaml'
import toml from 'toml'

export function parseYamlConfig(filePath: string): any {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8')
    return yaml.load(fileContents)
  } catch (error) {
    throw new Error(`Error parsing YAML config: ${error}`)
  }
}

export function parseTomlConfig(filePath: string): any {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8')
    return toml.parse(fileContents)
  } catch (error) {
    throw new Error(`Error parsing TOML config: ${error}`)
  }
}