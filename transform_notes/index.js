/**
 * 将微信读书导出的笔记转换成 json 格式
 * */

const fs = require('fs')
const path = require('path')

// 简读日本史
const bookID = '59c328507273b68f59cb9d9'
const bookCacheDir = path.resolve(__dirname, `../cache/${bookID}`)
const metaDir = path.resolve(bookCacheDir, 'meta.json')

const metaContent = fs.readFileSync(metaDir, 'utf-8')
const meta = JSON.parse(metaContent)

const notesDir = path.resolve(bookCacheDir, 'notes.txt')
const notesContent = fs.readFileSync(notesDir, 'utf-8')

const titles = [] // { title: 'xxx', level: 2 }

meta.chapters.map(chapter => {
  titles.push({
    title: chapter.title,
    level: chapter.level,
    anchors: chapter.anchors || []
  })
})

const results = []
notesContent
  .split('\n')
  .filter(Boolean)
  .map((line, _idx) => {
    const result = { type: '', mark: '', comment: '', time: '', data: '' }
    line = line
      .trim()
      // 移除奇怪的字符如零宽空格
      .replace(/\u200b/g, "")
      // 移除不完整的页码（左）
      .replace(/^\d*\]/, '')
      // 移除不完整的页码（右）
      .replace(/\[\d*$/, '')

    const findTitle = titles.find(x => x.title === line)
    if (findTitle) {
      result.type = 'title'
      result.mark = findTitle.title
      result.data = {
        level: findTitle.level,
        anchors: findTitle.anchors
      }
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

const notesMetaDir = path.resolve(bookCacheDir, 'notes.json')
fs.writeFileSync(notesMetaDir, JSON.stringify(results, null, 2))