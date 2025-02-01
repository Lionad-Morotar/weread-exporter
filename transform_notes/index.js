/**
 * 将微信读书导出的笔记转换成 json 格式
 * */

const fs = require('fs')
const path = require('path')

const bookID = '04932050813ab7900g0179b5'
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

let results = []
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
      .replace(/^\d*\]/g, '')
      // 移除不完整的页码（右）
      .replace(/\[\d*$/g, '')
      // 移除奇奇怪怪的非笔记格式
      .replace(/\[插图\]/g, '')
      // 移除数字间的空格（给数字划线会出现莫名奇妙的空格，而原书中没有）（这一条可能会破坏特定格式的书籍）
      .replace(/(\d+) (\d+)/g, '$1$2')

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

const chapters = []
function makeList(cs) {
  cs.map(chapter => {
    chapters.push(chapter)
    if (chapter.anchors) {
      makeList(chapter.anchors)
    }
  })
}
makeList(meta.chapters)

let parentIDX = 0
results
  .map(note => {
    function wash(text) {
      return text.replace(/^。/, '')
    }
    note.mark = wash(note.mark)
    note.comment = wash(note.comment)
    return note
  })
  .reduce((h, c) => {
    if (c.type === 'title') {
      h.push([c])
    } else {
      h[h.length - 1].push(c)
    }
    return h
  }, [])
  .sort((a, b) => {
    if (!a[0].type === 'title') return 1
    if (!b[0].type === 'title') return -1
    const [titleA, titleB] = [a[0].mark, b[0].mark]
    const [aIdx, bIdx] = [titles.findIndex(x => x.title === titleA), titles.findIndex(x => x.title === titleB)]
    return aIdx - bIdx
  })
  .flat()
  .map(note => {
    if (note.type === 'title') {
      return parentIDX = chapters.findIndex(x => x.title === note.mark)
    }
    chapters[parentIDX].notes = chapters[parentIDX].notes || []
    chapters[parentIDX].notes.push(note)
  })

const res = chapters
  .filter(c => c.title !== '版权信息')
  .map(chapter => {
    return [
      {
        "type": "title",
        "mark": chapter.title,
        "comment": "",
        "time": "",
        "data": {
          "level": chapter.level,
          "anchors": []
        }
      },
      ...(chapter.notes || []),
    ]
  })
  .flat()
// console.log('[info] res', res.length)


const notesMetaDir = path.resolve(bookCacheDir, 'notes.json')
fs.writeFileSync(notesMetaDir, JSON.stringify(res, null, 2))