/**
 * 将微信读书导出的笔记转换为携带上下文原文的形式
 * */

const fs = require('fs')
const path = require('path')

// 太白金星有点烦
const bookID = '23e32130813ab82bdg015cd2'
const bookCacheDir = path.resolve(__dirname, `../cache/${bookID}`)

const bookDir = path.resolve(__dirname, `../output/太白金星有点烦.md`)
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
    // 不知道为啥，《太白金星有点烦》中有大量的点号
    .replace(/((\r|\n|\r\n)\`)|(\`(\r|\n|\r\n))/g, '\n')
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
let rest = bookContent, _lastRest
const noteContextSize = 100
function adjustContext(matchRes, start, end) {
  // console.log('[debug] raw start end', start, end, matchRes.index)
  // 将匹配截止到目标内容前后
  const searchOffset = 100
  const searchStartPos = Math.max(0, start - searchOffset)
  const searchEndPos = Math.min(rest.length, end + searchOffset)
  const searchRegExp = [
    // 标题
    /\n#+\s+[^\n]*\n/g,
    // 空行
    /\n\n/g
  ]
  searchRegExp.map(reg => {
    reg.lastIndex = searchStartPos
    while (reg.lastIndex < searchEndPos) {
      const titleMatchRes = reg.exec(rest)
      // console.log('titleMatchRes', reg, reg.lastIndex, titleMatchRes?.index)
      if (!titleMatchRes) {
        break
      }
      const regMatchedLen = titleMatchRes[0].length
      const regMatchedStartPos = titleMatchRes.index
      const regMatchedEndPos = titleMatchRes.index + regMatchedLen // + (reg === searchRegExp[1] ? -2 : 0)
      if ((regMatchedEndPos > (matchRes.index - searchOffset - noteContextSize)) && (regMatchedEndPos < matchRes.index)) {
        // console.log('[debug] start ', reg, start)
        start = Math.max(start, regMatchedEndPos)
        // console.log('[debug] start set to', reg, start)
      }
      if ((regMatchedStartPos > (matchRes.index + matchRes[0].length)) && (regMatchedStartPos < (matchRes.index + matchRes[0].length + noteContextSize + searchOffset))) {
        // console.log('[debug] end ', reg, end)
        end = Math.min(end, regMatchedStartPos)
        // console.log('[debug] end set to', reg, end)
      }
      reg.lastIndex = titleMatchRes.index + titleMatchRes[0].length
      // console.log('[debug] reg', reg, reg.lastIndex, titleMatchRes[0].length, titleMatchRes.index + titleMatchRes[0].length, searchEndPos)
    }
  })
  return [start, end]
}

function formatRest(source) {
  source = source.replace(/^\s+/, '')
  while (source.match(/^\#+\s+[^\n]*\n*/)) {
    source = source.replace(/^\#+\s+[^\n]*\n*/g, '')
  }
  return source
}

let isContextNotEnd = false
notes.forEach(note => {
  _lastRest = rest
  rest = formatRest(rest)

  // console.log('\n\n[note]', note.type, note.mark, rest.slice(0, 10))
  if (note.type === 'title') {
    // const titleMeters = '册部卷编章回节段'.split('')
    // const titleMeterIDX = titleMeters.findIndex(x => note.mark.includes(x))
    // const level = titleMeterIDX === -1 ? 2 : titleMeterIDX
    output += `\n\n${'#'.repeat(+(note.data?.level || 1) + 1)} ${note.mark}\n\n`
    if (note.data?.anchors?.length) {
      note.data.anchors.map(x => {
        output += `\n\n${'#'.repeat(+(x?.level || 1) + 1)} ${x.title}\n\n`
      })
    }
  }
  if (note.type === 'comment') {
    // todo
  }
  // 显示划线句子前后多少字符
  if (note.type === 'mark') {
    const cleanedNote = cleanNote(note.mark)
    const noteRegex = new RegExp(cleanedNote)
    const matchRes = rest.match(noteRegex)
    let matched, start, end
    // console.log('[debug] matchRes', !!matchRes, noteRegex, rest.slice(0, 5))
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
      if (note.type === 'mark') {
        if (isContextNotEnd && start !== 0) {
          output += '...'
          isContextNotEnd = false
        }
        const lastMatchedChar = matched[matched.length - 1]
        const ends = ['\n', '。', '？']
        if (!ends.find(x => x === lastMatchedChar)) {
          isContextNotEnd = true
        }
      }
      // 如果要回溯 output 才能匹配到笔记，说明笔记被截断，此时不需要换行
      // TODO fixme
      if (matchRes && start) {
        output += '\n\n'
      }
      // [
      //   {
      //     "type": "mark",
      //     "mark": "日本传统家庭实行“长子继承制”",
      //     "comment": "",
      //     "time": "",
      //     "data": ""
      //   },
      //   {
      //     "type": "mark",
      //     "mark": "日语里却几乎没有脏话，“唯二”的两句“脏话”还都是来自汉语。",
      //     "comment": "",
      //     "time": "",
      //     "data": ""
      //   }
      // ]
      // [
      //   {
      //     "type": "mark",
      //     "mark": "日本人却不那么重视家族和亲戚关系，倒是发自内心地热爱“公司”“单位”等集体。在日本人的价值观中，“不给别人添麻烦”差不多是最高准则。",
      //     "comment": "",
      //     "time": "",
      //     "data": ""
      //   },
      //   {
      //     "type": "mark",
      //     "mark": "“鸦片战争”在中国是国耻，迫使日本开国的武力威胁“黑船来航”却被日本人当成带领日本走入现代文明的“恩惠”。",
      //     "comment": "",
      //     "time": "",
      //     "data": ""
      //   }
      // ]
      // console.log(note.mark, start, lastRest.slice(0, start), lastRest.slice(0, start).split('').find(x => x === '\n'))
      output += matched
      // output += `\n\n---\n${note.mark}\n---\n\n`
      rest = rest.slice(end)
      // console.log('\n--->output', output, '===', rest.slice(0, 5))
    }
  }
  // console.log('rest s', rest.slice(0, 20))
  rest = formatRest(rest)
  // console.log('rest e', rest.slice(0, 20))
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
// const noteMeta = `---\ntitle: ${'太白金星有点烦'}\ndescription: ${'ISBN 9787553815268'}\n---\n\n`
// const expandedNotes = noteMeta + markNotes(cleanedOutput) + cleanFootnotes(cleanedOutput, bookFootnotes.join('\n'))
const expandedNotes = markNotes(cleanedOutput) + cleanFootnotes(cleanedOutput, bookFootnotes.join('\n'))
fs.writeFileSync(outputDir, expandedNotes, 'utf-8')
