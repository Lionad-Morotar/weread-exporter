/**
 * 将微信读书导出的笔记转换为携带上下文原文的形式
 * */

const fs = require('fs')
const path = require('path')

// 简读日本史
const bookID = '59c328507273b68f59cb9d9'
const bookCacheDir = path.resolve(__dirname, `../cache/${bookID}`)

const bookDir = path.resolve(__dirname, `../output/简读日本史.md`)
const bookContentRaw = fs.readFileSync(bookDir, 'utf-8')
const [bookContentFull, bookContent, bookFootnotes] = cleanBookContent(bookContentRaw)

const cleanedBookContentDir = path.resolve(bookCacheDir, 'book.clean.md')
fs.writeFileSync(cleanedBookContentDir, bookContentFull, 'utf-8')
console.log('[info] raw len:', bookContentRaw.length, 'clean len:', bookContent.length, 'book start:', bookContent.slice(0, 10), '...')

function cleanBookContent(text) {  
  text = text
    // 移除奇怪的字符如零宽空格
    .replace(/\u200b/g, "")
    // 移除图片
    .replace(/!\[.*\]\([^\n]*\)/g, '')
    // 移除扉页版权信息
    .replace(/(\r|\n|\r\n)?## 版权信息[^#]*(\r|\n|\r\n)?#/, '#')
    // 合并超过两个换行的空行
    .replace(/(\r|\n|\r\n){2,}/g, '\n\n')
    .trim()
  // 将脚注移至尾部
  let res = null, footnotes = []
  while ((res = text.match(/(\r|\n|\r\n)?\[\^\d+_\d+\]:\s+[^\r\n]*/))) {
    const [footnote, footnoteLen] = [res[0], res[0].length]
    // console.log('[debug] res', footnote.slice(0, 10))
    const idx = text.indexOf(footnote)
    if (idx !== -1) {
      text = text.slice(0, idx) + text.slice(idx + footnoteLen + 1)
      footnotes.push(footnote)
    }
  }
  return [text + footnotes.join(''), text, footnotes]
}

const notesDir = path.resolve(bookCacheDir, 'notes.json')
const notesContent = fs.readFileSync(notesDir, 'utf-8')
const notes = JSON.parse(notesContent)

function cleanNote(note) {
  return note
    // 移除奇怪的字符如零宽空格
    .replace(/\u200b/g, "")
    // 合并超过两个换行的空行
    .replace(/(\r|\n|\r\n){2,}/g, '\n\n')
    // 在可能换行的地方添加允许换行的匹配
    .replace(/(。|：|』|”|]|？)(?!$)/g, '$1\\n*')
    // 不精确匹配脚注
    .replace(/\[[^\]]*\]/g, "\\[([^\\]]*)\\]")
    .trim()
}

// 检查所有笔记都能在书中找到对应的内容
notes.forEach(note => {
  const cleanedNote = cleanNote(note.mark)
  const noteRegex = new RegExp(cleanedNote)
  const res = bookContentFull.match(noteRegex)
  note.regex = noteRegex
  note.isIn = res?.[0]

  if (!note.isIn) {
    console.error(note, noteRegex, res)
    let tmp = ''
    note.mark.split('').map(x => {
      tmp += x
      console.error(bookContentFull.includes(tmp), tmp)
    })
    throw new Error('[ERR] note no found in book')
  }
})

let output = ''
let rest = bookContent
const noteContextSize = 100
function adjustContext(matchRes, start, end) {
  // console.log('[debug] raw start end', start, end)
  // 将匹配截止到目标内容前后
  const isStartFromBeginning = start === 0
  const titleLenMax = isStartFromBeginning ? 0 : 100
  const titleSearchStart = Math.max(0, start - titleLenMax)
  const titleSearchEnd = end + titleLenMax
  const titleToSearch = rest.slice(titleSearchStart, titleSearchEnd)
  // console.log('[debug] titleToSearch', titleToSearch)
  const targetRegex = [
    // 标题
    /\n#+\s+[^\n]*\n/,
    // 空行
    /\n\n/
  ]
  targetRegex.map(reg => {
    let searchIDX = 0
    while (searchIDX < titleToSearch.length) {
      const temp = ' '.repeat(searchIDX) + titleToSearch.slice(searchIDX)
      const titleMatchRes = temp.match(reg)
      if (!titleMatchRes) {
        break
      }
      const titleLen = titleMatchRes[0].length
      const titleStartPos = titleMatchRes.index
      const titleEndPos = titleMatchRes.index + titleLen + (reg === targetRegex[1] ? -2 : 0)
      // console.log('[debug] titleEndPos', titleEndPos, (titleEndPos > titleLenMax), (titleEndPos <= titleLenMax + noteContextSize))
      if ((titleEndPos > titleLenMax) && (titleEndPos <= titleLenMax + noteContextSize) && (titleEndPos < matchRes.index)) {
        // console.log('[debug] start ', reg, start)
        start = Math.max(start, titleEndPos)
        // if (isStartFromBeginning) {
        //   start = Math.max(start, titleEndPos)
        // } else {
        //   start = Math.max(start, Math.max(0, matchRes.index - (titleLenMax + noteContextSize - titleEndPos)))
        // }
        // console.log('[debug] start set to', reg, start)
        // console.log(matchRes.index - noteContextSize, titleLenMax, noteContextSize, titleEndPos)
        // console.log("\"", temp.slice(0, 150), "\"", titleMatchRes)
      }
      // console.log('[debug] titleStartPos', titleStartPos, (titleStartPos < titleToSearch.length - titleLenMax), (titleStartPos > titleToSearch.length - titleLenMax - noteContextSize), matchRes.index + matchRes[0].length)
      if ((titleStartPos < titleToSearch.length - titleLenMax) && (titleStartPos > titleToSearch.length - titleLenMax - noteContextSize)) {
        // console.log('[debug] end ', reg, end)
        // end = Math.min(end, titleStartPos)
        end = Math.min(end, matchRes.index + matchRes[0].length + (titleLenMax + noteContextSize - (titleToSearch.length - titleStartPos)))
        // console.log('[debug] end set to', matchRes.index + matchRes[0].length + (titleLenMax + noteContextSize - (titleToSearch.length - titleStartPos)), 'now end is:', end, titleMatchRes)
      }
      // console.log("[debug] next", reg, titleMatchRes.index + titleMatchRes[0].length)
      searchIDX = titleMatchRes.index + titleMatchRes[0].length
    }
  })
  return [start, end]
}

let isContextNotEnd = false
notes.forEach(note => {
  if (note.type === 'title') {
    // const titleMeters = '册部卷编章回节段'.split('')
    // const titleMeterIDX = titleMeters.findIndex(x => note.mark.includes(x))
    // const level = titleMeterIDX === -1 ? 2 : titleMeterIDX
    const idx = rest.indexOf(note.mark)
    output += `\n\n${'#'.repeat(+note.data + 1)} ${note.mark}\n\n`
    rest = rest.slice(idx + note.mark.length + 2)
  }
  if (note.type === 'comment') {
    // todo
  }
  // 显示划线句子前后多少字符
  if (note.type === 'mark') {
    // console.log('\n\n[note]', note.mark)
    const cleanedNote = cleanNote(note.mark)
    const noteRegex = new RegExp(cleanedNote)
    const matchRes = rest.match(noteRegex)
    let matched, start, end
    // console.log('[debug] matchRes', matchRes[0])
    if (matchRes) {
      start = Math.max(0, matchRes.index - noteContextSize)
      end = matchRes.index + matchRes[0].length + noteContextSize
      ;[start, end] = adjustContext(matchRes, start, end)
      matched = rest.slice(start, end)
      // console.log('[debug] start end', start, end, matched)
      
    } else {
      // 笔记可能以及被截断导致匹配失败，
      // 所以把 output 的内容加回去，重新尝试匹配
      let tryLen = 50
      while (tryLen < output.length) {
        tryLen = Math.min(output.length, tryLen * 2)

        const paddingRest = output.slice(-1 * tryLen) + rest
        const paddingMatchRes = paddingRest.match(noteRegex)
        if (!paddingMatchRes) {
          // console.log('\n[info]', tryLen, paddingRest.slice(Math.min(tryLen, 100), Math.min(tryLen, 100) + 100), noteRegex)
          // console.log(output.slice(-15), rest.slice(0, 15))
          continue
        }

        start = paddingMatchRes.index
        end = paddingMatchRes.index + paddingMatchRes[0].length
        // console.log('\n--->', rest.slice(start, end))
        start = Math.max(0, start - tryLen)
        end = Math.max(0, end - tryLen + noteContextSize)
        ;[start, end] = adjustContext(paddingMatchRes, start, end)
        // console.log('[debug] adjust start end', start, end, rest.slice(start, end))
        matched = rest.slice(start, end)
        break
        // console.log('--->', rest.slice(start, end))
      }
      if (start == null || end == null) {
        // console.log('[info]', note.mark, bookFootnotes)
        if (bookFootnotes.find(x => x.includes(note.mark))) {
          console.log('[info] skip mark in footnote:', note.mark.slice(0, 10) + (note.mark.length > 10 ? '...' : ''))
        } else {
          // matched = ''
          // end = 0
          console.error('[ERR]', note.mark)
          throw new Error('[ERR] unexpect matching, sliced note')
        }
      }
    }
    if (matched) {
      if (start === 0) {
        wrapOutput = false
      }
      if (note.type === 'mark') {
        if (isContextNotEnd && start !== 0) {
          output += '...'
          isContextNotEnd = false
        }
        // console.log('rest.slice(start-1, 1)', rest.slice(start-1, 2))
        // if (start && rest.slice(start-1, 1) !== '\n') {
        //   output += '...'
        // }
        const lastMatchedChar = matched[matched.length - 1]
        const ends = ['\n', '。', '？']
        if (!ends.find(x => x === lastMatchedChar)) {
          isContextNotEnd = true
        }
      }
      if (rest.slice(0, start).includes('\n\n')) {
        output += '\n\n'  
      }
      output += matched
      // output += `\n\n---\n${note.mark}\n---\n\n`
      rest = rest.slice(end)
      // console.log('\n--->output', output, '===', rest.slice(0, 5))
    }
  }

  // if (wrapOutput) {
  //   output += '\n\n'
  // }
})

function cleanFootnotes(source, footnotes) {
  const output = [], marks = []
  let res, reg = /\[\^\d+_\d+\](?!:)/g
  while ((res = reg.exec(source))) {
    marks.push(res[0])
    reg.lastIndex = res.index + res[0].length
    // console.log(res,res.index)
  }
  // console.log('[debug] marks', marks)
  while (marks.length) {
    const mark = marks.shift()
    const markReg = new RegExp(mark.replace(/(\^|\[|\])/g, '\\$1') + ':\\s+([^\\n]*)')
    const res = footnotes.match(markReg)
    res && output.push(res[0])
    // console.log('[debug] footnotes', markReg, res?.[0])
  }
  return output.length
    ? `\n\n## 注释汇总\n\n${output.join('\n\n')}`
    : ''
}

function markNotes(source) {
  notes.forEach(note => {
    if (note.type === 'mark') {
      // 可能出现标签嵌套或交叉情况，但影响不大，暂时不处理
      source = source.replace(new RegExp(`(${note.regex.source})`), '<mark>$1</mark>')
      // console.log('[debug]', new RegExp(`(${note.regex})`))
    }
  })
  return source
}

const outputDir = path.resolve(bookCacheDir, 'notes.expansion.md')
const cleanedOutput = cleanBookContent(output)[1]
const expandedNotes = markNotes(cleanedOutput) + cleanFootnotes(cleanedOutput, bookFootnotes.join('\n'))
fs.writeFileSync(outputDir, expandedNotes, 'utf-8')
