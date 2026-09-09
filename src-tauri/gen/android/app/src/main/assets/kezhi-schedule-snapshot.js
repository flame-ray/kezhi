(() => {
  const tables = [], warnings = [];
  let budget = 100000, visited = 0;
  const text = node => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('input,textarea,select,script,style,button').forEach(child => child.remove());
    clone.querySelectorAll('br').forEach(child => child.replaceWith('\n'));
    clone.querySelectorAll('div,p,li').forEach(child => child.append('\n'));
    return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t\r]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
  };
  const collect = (doc, depth = 0) => {
    if (++visited > 20 || depth > 4 || budget <= 0) return;
    if (Array.from(doc.querySelectorAll('input[type="password"]')).some(input => input.getClientRects().length)) {
      warnings.push('页面仍有登录密码框，请完成登录后打开课表'); return;
    }
    for (const table of doc.querySelectorAll('table')) {
      if (tables.length >= 24 || budget <= 0) break;
      if (table.querySelector('table') || !table.getClientRects().length) continue;
      const rows = [], spans = [];
      for (const [r, row] of Array.from(table.rows).slice(0, 100).entries()) {
        rows[r] ||= [];
        let col = 0;
        for (const cell of row.cells) {
          while (rows[r][col] !== undefined && col < 40) col++;
          if (col >= 40 || budget <= 0) break;
          const content = text(cell).slice(0, Math.min(3000, budget));
          budget -= content.length;
          const rowSpan = Math.min(100-r, cell.rowSpan || 100-r), colSpan = Math.min(40-col, cell.colSpan || 1);
          for (let y=r; y<r+rowSpan; y++) {
            rows[y] ||= [];
            for (let x=col; x<col+colSpan; x++) rows[y][x] = y===r ? content : '';
          }
          spans.push({ row:r, column:col, rowSpan, colSpan });
          col += colSpan;
        }
      }
      if (rows.length > 1) tables.push({ caption: text(table.caption || doc.createElement('span')).slice(0,160), headers: [], rows: rows.map(row => Array.from(row, cell => cell || '')), spans });
    }
    for (const frame of doc.querySelectorAll('iframe,frame')) {
      try { if (frame.contentDocument) collect(frame.contentDocument, depth+1); else warnings.push('部分跨域框架无法读取，请直接打开框架中的课表网址'); }
      catch (_) { warnings.push('部分跨域框架无法读取，请直接打开框架中的课表网址'); }
    }
  };
  collect(document);
  if (budget <= 0) warnings.push('页面数据较多，已限制读取范围，请核对导入预览');
  return JSON.stringify({ pageUrl: location.origin + location.pathname, title: document.title.slice(0,160), headings: [], forms: [], links: [], resources: [], tables, warnings: [...new Set(warnings)] });
})()
