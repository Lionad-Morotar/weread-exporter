/**
 * 将微信读书导出的笔记转换成 json 格式
 * */

const fs = require('fs')
const path = require('path')

const bookID = '59c328507273b68f59cb9d9'
const bookDir = path.resolve(__dirname, `../cache/${bookID}`)
const metaDir = path.resolve(bookDir, 'meta.json')

const metaContent = fs.readFileSync(metaDir, 'utf-8')
const meta = JSON.parse(metaContent)

const notesDir = path.resolve(bookDir, 'notes.txt')
const notesContent = fs.readFileSync(notesDir, 'utf-8')

const titles = meta.chapters.map(x => x.title).map(x => x.trim())

const results = []
notesContent
  .split('\n')
  .filter(Boolean)
  .map((line, _idx) => {
    const result = { type: '', mark: '', comment: '', time: '' }
    line = line.trim()
    if (titles.find(title => title === line)) {
      result.type = 'title'
      result.mark = line
    } else if (line.match(/^◆ (\d{4}\/\d{2}\/\d{2})发表想法/)) {
      result.type = 'comment'
      result.time = line.match(/^◆ (\d{4}\/\d{2}\/\d{2})发表想法/)[1]
    } else if (line.startsWith('◆ ')) {
      result.type = 'mark'
      result.mark = line.slice(2)
    } else if (results[results.length - 1].type === 'comment') {
      if (line.startsWith('原文：')) {
        results[results.length - 1].mark = line.slice(3)
      } else {
        results[results.length - 1].comment = line
      }
    }
    if (result.type) {
      results.push(result)
    }
  })

results
  .map(note => {
    function wash(text) {
      return text.replace(/^。/, '')
    }
    note.mark = wash(note.mark)
    note.comment = wash(note.comment)
    return note
  })

const notesMetaDir = path.resolve(bookDir, 'notes.json')
fs.writeFileSync(notesMetaDir, JSON.stringify(results, null, 2))