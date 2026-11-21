// Offline OOXML export. Each confirmed tasting occupies one row.
(() => {
  "use strict";

  const mainNS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const relNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const packageRelNS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const encoder = new TextEncoder();

  function xmlText(value) {
    // Protect literal OOXML escape sequences, then encode illegal XML characters.
    const raw = String(value ?? "");
    if (raw.length > 32767) throw new Error("单元格文字超过 Excel 的 32767 字符限制。");
    return raw.replace(/_x(?=[0-9a-f]{4}_)/gi, "_x005F_x")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,
        char => "_x" + char.charCodeAt(0).toString(16).padStart(4, "0") + "_")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\r/g, "&#13;");
  }

  function columnName(number) {
    let name = "";
    while (number > 0) {
      number -= 1;
      name = String.fromCharCode(65 + number % 26) + name;
      number = Math.floor(number / 26);
    }
    return name;
  }

  function textCell(value, style = 0) {
    return { value: String(value ?? ""), style, numeric: false };
  }

  function scoreCell(value, { min = 1, max = 10 } = {}) {
    if (value == null || value === "") return textCell("");
    const score = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isInteger(score) || score < min || score > max) {
      throw new Error(`评分应为 ${min} 至 ${max} 的整数，请检查后再导出。`);
    }
    return { value: score, style: 2, numeric: true };
  }

  function timeCell(at) {
    if (!at) return textCell("");
    const milliseconds = new Date(at).getTime();
    if (!Number.isFinite(milliseconds)) return textCell(at);
    // Excel's 1900 date system uses day 25569 for the Unix epoch.
    const serial = 25569 + (milliseconds + 8 * 3600000) / 86400000;
    return { value: serial, style: 3, numeric: true };
  }

  function rowXml(cells, row) {
    const attributes = row === 1 ? ' ht="26" customHeight="1"' : "";
    const content = cells.map((cell, column) => {
      const ref = columnName(column + 1) + row;
      if (cell.numeric) return `<c r="${ref}" s="${cell.style}" t="n"><v>${cell.value}</v></c>`;
      return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${row}"${attributes}>${content}</row>`;
  }

  function worksheet(headers, widths, rows) {
    if (rows.length >= 1048576 || headers.length > 16384) {
      throw new Error("记录或指标数量超过 Excel 单表容量。");
    }
    const range = "A1:" + columnName(headers.length) + (rows.length + 1);
    const columns = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
    return xmlDeclaration + `<worksheet xmlns="${mainNS}">
      <dimension ref="${range}"/>
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
      <sheetFormatPr defaultRowHeight="20"/>
      <cols>${columns}</cols><sheetData>${rowXml(headers.map(name => textCell(name, 1)), 1)}${rows.map((cells, index) => rowXml(cells, index + 2)).join("")}</sheetData>
      <autoFilter ref="${range}"/>
    </worksheet>`;
  }

  const styles = `<styleSheet xmlns="${mainNS}">
    <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>
    <fonts count="2"><font><sz val="11"/><color rgb="FF283F35"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts>
    <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF355B45"/><bgColor indexed="64"/></patternFill></fill></fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="4">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
      <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
      <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    </cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  </styleSheet>`;

  // ZIP's stored method keeps downloads available without an external library or a network request.
  const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
    let value = byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeZip(parts) {
    const chunks = [];
    const directory = [];
    let offset = 0;
    for (const [path, contents] of Object.entries(parts)) {
      const name = encoder.encode(path);
      const data = encoder.encode(contents);
      const checksum = crc32(data);
      const header = new Uint8Array(30 + name.length);
      const local = new DataView(header.buffer);
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, 0x21, true); // Minimum valid DOS date, 1980-01-01.
      local.setUint32(14, checksum, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      header.set(name, 30);
      chunks.push(header, data);

      const entry = new Uint8Array(46 + name.length);
      const central = new DataView(entry.buffer);
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(14, 0x21, true);
      central.setUint32(16, checksum, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      entry.set(name, 46);
      directory.push(entry);
      offset += header.length + data.length;
    }
    const directorySize = directory.reduce((total, entry) => total + entry.length, 0);
    const tail = new Uint8Array(22);
    const end = new DataView(tail.buffer);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, directory.length, true);
    end.setUint16(10, directory.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    const bytes = new Uint8Array(offset + directorySize + tail.length);
    let cursor = 0;
    for (const chunk of [...chunks, ...directory, tail]) {
      bytes.set(chunk, cursor);
      cursor += chunk.length;
    }
    return bytes;
  }

  function build({ title = "", traits, samples, records, rater = "", template }) {
    const names = new Map(samples.map(sample => [sample.code, sample.name]));
    const rules = new Map((template?.traits || []).map(rule => [rule.name, rule]));
    const sampleName = template?.foodType && !template.foodType.includes("饼干") ? "样品名称" : "品种名称";
    const headers = ["盲码", sampleName, "评价人", ...traits, "品鉴备注", "记录时间（北京时间）", "品鉴批次"];
    const widths = [14, 25, 18, ...traits.map(trait => Math.min(65, Math.max(13, trait.length * 2 + 5))), 44, 27, 30];
    const rows = records.map(record => [
      textCell(record.code), textCell(names.get(record.code)), textCell(record.rater ?? rater),
      ...traits.map(trait => scoreCell(record.scores?.[trait], rules.get(trait))), textCell(record.note), timeCell(record.at), textCell(title)
    ]);
    const prefix = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
    const rels = entries => xmlDeclaration + `<Relationships xmlns="${packageRelNS}">` +
      entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${relNS}/${type}" Target="${target}"/>`).join("") + "</Relationships>";
    const sheets = [
      ["评分明细", worksheet(headers, widths, rows)],
      ["盲码对照", worksheet(["盲码", sampleName], [14, 30], samples.map(sample => [textCell(sample.code), textCell(sample.name)]))]
    ];
    if (template) {
      const scaleRows = template.traits.map(rule => [
        textCell(rule.name), scoreCell(rule.min, rule), scoreCell(rule.max, rule), textCell(rule.low), textCell(rule.high),
        textCell(rule.instructions), textCell(template.foodType), textCell(template.instructions),
        textCell(template.contributor), textCell(template.version)
      ]);
      sheets.push(["评分量表", worksheet(
        ["性状", "下限", "上限", "下限含义", "上限含义", "性状说明", "食品类型", "模板说明", "贡献者", "模板版本"],
        [20, 12, 12, 28, 28, 45, 20, 45, 24, 18], scaleRows
      )]);
    }
    const sheetParts = sheets.map((_, i) => `worksheets/sheet${i + 1}.xml`);
    return writeZip({
      "[Content_Types].xml": xmlDeclaration + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="${prefix}sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${prefix}styles+xml"/>
        ${sheetParts.map(path => `<Override PartName="/xl/${path}" ContentType="${prefix}worksheet+xml"/>`).join("")}
      </Types>`,
      "_rels/.rels": rels([["rId1", "officeDocument", "xl/workbook.xml"]]),
      "xl/workbook.xml": xmlDeclaration + `<workbook xmlns="${mainNS}" xmlns:r="${relNS}"><bookViews><workbookView/></bookViews><sheets>
        ${sheets.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}
      </sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": rels([
        ...sheetParts.map((path, i) => ["rId" + (i + 1), "worksheet", path]), ["rIdStyle", "styles", "styles.xml"]
      ]),
      "xl/styles.xml": xmlDeclaration + styles,
      ...Object.fromEntries(sheets.map(([, content], i) => ["xl/" + sheetParts[i], content]))
    });
  }

  globalThis.TasterExport = Object.freeze({ build });
})();
