import { EXAM_REMINDER_CHOICES, examEnd, examStart, localDateKey, parseExams, validExamDate, type ExamRecord } from './exams';

interface Property { name: string; params: Record<string,string>; value: string }
export interface ExamCalendarResult { exams: ExamRecord[]; warnings: string[]; skipped: number }
const MAX_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
function property(line: string): Property {
  let quoted = false, colon = -1;
  for (let i=0;i<line.length;i++) { if (line[i] === '"') quoted = !quoted; if (line[i] === ':' && !quoted) { colon=i; break; } }
  if (colon < 1) throw new Error('日历属性格式无效');
  const [name,...parts] = line.slice(0,colon).split(';');
  const params: Record<string,string> = {};
  for (const part of parts) { const equal=part.indexOf('='); if (equal>0) params[part.slice(0,equal).toUpperCase()] = part.slice(equal+1).replace(/^"|"$/g,''); }
  return {name:name.toUpperCase(),params,value:line.slice(colon+1)};
}
const unescapeText = (value: string) => value.replace(/\\([nN,;\\])/g,(_, character: string) => /[nN]/.test(character) ? '\n' : character);
const escapeText = (value: string) => value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
function field(values: Property[], name: string): Property | undefined {
  const found=values.filter(value=>value.name===name);
  if(found.length>1) throw new Error(`${name} 重复，无法确定考试信息`);
  return found[0];
}
function clock(date: Date) { return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }
function parseDate(value?: Property): Date {
  if (!value) throw new Error('缺少明确的开始或结束时间，请手动录入');
  const match=/^(20\d{2})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value.value);
  if (!match || (value.params.VALUE && value.params.VALUE.toUpperCase() !== 'DATE-TIME')) throw new Error('只支持有明确起止时间的考试，不支持全天事件');
  const dateKey=`${match[1]}-${match[2]}-${match[3]}`, time=`${match[4]}:${match[5]}`;
  if (!validExamDate(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || match[6] !== '00') throw new Error('日期或时间无效，当前支持精确到分钟');
  const zone=value.params.TZID;
  if (match[7] && zone) throw new Error('UTC 时间不能同时带 TZID');
  if (zone && !['Asia/Shanghai','Asia/Chongqing','Asia/Chungking','Asia/Hong_Kong','UTC','Etc/UTC','GMT'].includes(zone)) throw new Error(`暂不支持时区 ${zone}，请先转换为 UTC 或北京时间`);
  const suffix=match[7] || (zone && !['UTC','Etc/UTC','GMT'].includes(zone) ? '+08:00' : zone ? 'Z' : '');
  const date=new Date(`${dateKey}T${time}:00${suffix}`);
  if (!Number.isFinite(date.getTime()) || (!suffix && (localDateKey(date)!==dateKey || clock(date)!==time))) throw new Error('该本地时间不存在');
  return date;
}
function stableId(uid: string) {
  let a=2166136261,b=5381;
  for (const char of uid) { const code=char.codePointAt(0)!; a=Math.imul(a^code,16777619); b=Math.imul(b,33)^code; }
  return `exam-ics-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;
}

/** Deliberately imports one-off events only; never guesses missing dates or expands recurrence. */
export function parseExamCalendar(text: string): ExamCalendarResult {
  if (encoder.encode(text).length > MAX_BYTES) throw new Error('考试日历不能超过 4 MB');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r?\n[ \t]/g,'').split(/\r?\n/).filter(line=>line.trim());
  const stack: string[]=[], events: Property[][]=[];
  let current: Property[]|undefined, calendars=0, method='';
  for (const line of lines) {
    const item=property(line);
    if (item.name==='BEGIN') {
      const kind=item.value.trim().toUpperCase();
      if (kind==='VCALENDAR') { if(stack.length || ++calendars>1) throw new Error('请选择单个完整日历文件'); }
      else if(!stack.length) throw new Error('缺少 VCALENDAR');
      if(kind==='VEVENT') { if(stack.at(-1)!=='VCALENDAR' || current) throw new Error('考试事件嵌套无效'); current=[]; }
      stack.push(kind); continue;
    }
    if (item.name==='END') {
      const kind=item.value.trim().toUpperCase();
      if (stack.pop()!==kind) throw new Error('日历结构不完整');
      if (kind==='VEVENT' && current) { events.push(current); current=undefined; if(events.length>1000) throw new Error('一次最多读取 1000 条日历事件'); }
      continue;
    }
    if(!stack.length) throw new Error('日历结构无效');
    if (stack.at(-1)==='VEVENT' && current) current.push(item);
    if (stack.at(-1)==='VCALENDAR' && item.name==='METHOD') method=item.value.toUpperCase();
  }
  if(stack.length || calendars!==1 || !events.length) throw new Error('没有读取到完整的考试事件');
  const result: ExamCalendarResult={exams:[],warnings:[],skipped:0}, ids=new Set<string>();
  events.forEach((values,index)=>{
    const title=unescapeText(values.find(value=>value.name==='SUMMARY')?.value ?? '').trim();
    try {
      if(method==='CANCEL' || field(values,'STATUS')?.value.toUpperCase()==='CANCELLED') throw new Error('已取消事件不导入');
      if(values.some(value=>['RRULE','RDATE','EXDATE','RECURRENCE-ID'].includes(value.name))) throw new Error('重复或例外事件暂不支持，请按单次考试录入');
      if(field(values,'DURATION')) throw new Error('请提供明确的 DTEND 结束时间');
      const start=parseDate(field(values,'DTSTART')), end=parseDate(field(values,'DTEND'));
      if (localDateKey(start)!==localDateKey(end)) throw new Error('跨天考试暂不支持，请手动拆分');
      const uid=unescapeText(field(values,'UID')?.value ?? '');
      const ownId=field(values,'X-KEZHI-EXAM-ID');
      const reminders=field(values,'X-KEZHI-REMINDERS');
      const exam: ExamRecord={id:ownId ? unescapeText(ownId.value) : stableId(uid || `${title}|${start.toISOString()}|${end.toISOString()}`), title:unescapeText(field(values,'SUMMARY')?.value ?? '').trim(), date:localDateKey(start), startTime:clock(start), endTime:clock(end), location:unescapeText(field(values,'LOCATION')?.value ?? ''), seat:unescapeText(field(values,'X-KEZHI-SEAT')?.value ?? ''), note:unescapeText(field(values,'DESCRIPTION')?.value ?? ''), reminderMinutes:reminders?.value ? reminders.value.split(',').map(Number) : []};
      exam.note=unescapeText(field(values,'X-KEZHI-NOTE')?.value ?? field(values,'DESCRIPTION')?.value ?? '');
      parseExams([exam]);
      if(ids.has(exam.id)) throw new Error('重复日历标识，已保留文件中的第一条');
      ids.add(exam.id); result.exams.push(exam);
    } catch(error) { result.skipped++; result.warnings.push(`${title || `第 ${index+1} 条`}：${error instanceof Error ? error.message : '记录无效'}`); }
  });
  return result;
}

function utcStamp(date: Date) { return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
function fold(line: string): string {
  const parts: string[]=[]; let current='', bytes=0;
  for(const char of line) { const size=encoder.encode(char).length; if(bytes+size>75) { parts.push(current); current=' '; bytes=1; } current+=char; bytes+=size; }
  parts.push(current); return parts.join('\r\n');
}
export function buildExamCalendar(exams: ExamRecord[], now=new Date()): string {
  parseExams(exams);
  if(!exams.length) throw new Error('请先选择需要导出的考试');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kezhi//Exam Calendar//ZH','CALSCALE:GREGORIAN','X-WR-CALNAME:课织考试'];
  for(const exam of exams) {
    lines.push('BEGIN:VEVENT',`UID:${encodeURIComponent(exam.id)}@kezhi.local`,`DTSTAMP:${utcStamp(now)}`,`DTSTART:${utcStamp(examStart(exam))}`,`DTEND:${utcStamp(examEnd(exam))}`,`SUMMARY:${escapeText(exam.title)}`,`LOCATION:${escapeText(exam.location)}`,`DESCRIPTION:${escapeText(exam.note)}${exam.seat ? escapeText(`\n座位号：${exam.seat}`) : ''}`,`X-KEZHI-EXAM-ID:${escapeText(exam.id)}`,`X-KEZHI-SEAT:${escapeText(exam.seat)}`,`X-KEZHI-NOTE:${escapeText(exam.note)}`,`X-KEZHI-REMINDERS:${exam.reminderMinutes.join(',')}`);
    for(const minutes of EXAM_REMINDER_CHOICES.filter(value=>exam.reminderMinutes.includes(value))) lines.push('BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER:-PT${minutes}M`,`DESCRIPTION:${escapeText(exam.title)}`,'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const text=lines.map(fold).join('\r\n')+'\r\n';
  if(encoder.encode(text).length>MAX_BYTES) throw new Error('导出日历超过 4 MB，请减少考试数量');
  return text;
}
