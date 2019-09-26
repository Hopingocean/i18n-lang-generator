#!/usr/bin/env node

const fs = require('fs')
const glob = require('glob')
const _ = require('lodash')
const sortObject = require('deep-sort-object')

class i18nLangGenerator {
  constructor(options) {
    this.options = _.extend({
      base: '',
      from: [],
      to: '',
      languages: [],
      extensions: ['vue', 'js'],
      functionName: '\\$t',
      deleteExpired: false,
      forceReWrite: false
    }, options)
  }

  run() {
    const {
      from,
      extensions,
      base
    } = this.options
    let path = from.join('|')
    let ext = extensions.join('|')
    glob(`${base}/@(${path})/**/*.@(${ext})`, {}, (err, files) => {
      if (err) throw err
      this.writeJSON(this.getText(files))
    })
  }

  getText(files) {
    const fn = '\\$t'
    let obj = {}

    const createPath = (obj, path) => {

      let orgPath = path
      path = typeof path === 'string' ? path.split('.') : path;
      let current = obj

      while (path.length > 1) {

        const [head, ...tail] = path
        path = tail
        if (current[head] === undefined)
          current[head] = {}
        current = current[head]

      }

      if (!current[path[0]])
        current[path[0]] = path[path.length - 1]
      else if (typeof current[path[0]] === 'object')
        throw ({ message: `Cannot create a string ${orgPath} exist as an object` })

      return obj

    }

    files.forEach((file) => {
      const text = fs.readFileSync(file, 'utf8')
      const findTranslations = new RegExp(`\\W${fn}\\(\\'([^\\']*)\\'(\\)|,)`, 'g')
      let result
      let newObj = {}
      while (result = findTranslations.exec(text)) {
        try {
          createPath(obj, result[1])
        } catch (e) {
          console.log(`Error creating property ${result[1]}. ${e.message}`, file)
          process.exit(1)
        }
      }
    })

    return obj
  }

  writeJSON(result) {

    const {
      languages
    } = this.options

    languages.forEach((lang) => {
      this.processLanguage(lang, result)
    })

  }

  processLanguage(lang, result) {

    console.log(`\n${lang}.json`)

    const {
      base,
      to,
      deleteExpired
    } = this.options

    const localeText = this.getLocaleConfig(lang)

    const localeMap = this.flatten(localeText)
    const resultMap = this.flatten(result)
    const report = {}
    let itemsDeleted = false
    let itemsAdded = false

    localeMap.forEach((item) => {

      if (resultMap.indexOf(item) < 0) {

        if (deleteExpired) {
          itemsDeleted = true
          this.deletePropertyPath(localeText, item)
        }
        else
          report[item] = "unused"

      }

    })

    this.clean(localeText)

    resultMap.forEach((item) => {
      if (localeMap.indexOf(item) < 0) {
        itemsAdded = true
        report[item] = "new item added"
      }
    })

    const mergedObj = sortObject(_.merge({}, result, localeText))

    if (itemsDeleted || itemsAdded)
      fs.writeFileSync(
        `${base}/${to}/${lang}.json`,
        JSON.stringify(mergedObj, null, 2),
        'utf8'
      )

    const iterate = (obj, parent = '') => {
      Object.keys(obj).forEach(key => {
        let newParent = parent ? parent + '.' + key : key
        if (typeof obj[key] === 'object')
          iterate(obj[key], newParent)
        else if (key === obj[key] && !report[newParent])
          report[newParent] = 'needs translation'
      })
    }

    iterate(mergedObj)

    if (Object.keys(report).length)
      console.table(report)
    else
      console.log('No issues')

  }

  deletePropertyPath(obj, path) {

    if (!obj || !path)
      return

    if (typeof path === 'string')
      path = path.split('.')

    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]]
      if (typeof obj === 'undefined')
        return
    }

    delete obj[path.pop()]

  }

  clean(o) {
    for (var propName in o) {
      if (typeof o[propName] == "object")
        this.clean(o[propName])
      if (!Object.keys(o[propName]).length)
        delete o[propName];
    }
  }

  getLocaleConfig(language) {
    const {
      base,
      to,
      forceReWrite
    } = this.options
    const path = `${base}/${to}/${language}.json`

    try {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path)
        return JSON.parse(content)
      } else {
        return {}
      }
    } catch (error) {
      console.warn(`${path}: Please fix`, error.message, `or force to rewrite the file with the option "-r true"`)
      if (forceReWrite)
        return {}
      else
        process.exit(1)
    }
  }


  flatten(value) {

    let arr = []

    const iterate = (obj, parent = '') => {
      Object.keys(obj).forEach(key => {
        let newParent = parent ? parent + '.' + key : key
        if (typeof obj[key] === 'object')
          iterate(obj[key], newParent)
        else
          arr.push(newParent)
      })
    }

    iterate(value)

    return arr

  }


}

const argv = require('minimist')(process.argv.slice(2))
const languages = argv.l || argv.languages || ''
const baseDir = argv.b || argv.baseDirectory || '.'
const dir = argv.d || argv.directory || ''
const functionName = argv.f || argv.functionName || '\\$t'
const outputDirectory = argv.o || argv.output || 'lang'
const deleteExpired = argv.x || argv.deleteExpired || false
const forceReWrite = argv.r || argv.forceReWrite || false

new i18nLangGenerator({
  base: baseDir.replace(/\/$/, ''),
  from: dir ? dir.split(' ') : [],
  to: outputDirectory,
  languages: languages ? languages.split(' ') : [],
  functionName: functionName,
  deleteExpired: deleteExpired,
  forceReWrite: forceReWrite
}).run()
