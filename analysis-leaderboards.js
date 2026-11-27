function rankClassDiffScores(students, getScore) {
    const entries = students.map(student => ({ student, score: getScore(student) }))
        .filter(entry => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score);
    let rank = 1;
    return entries.map((entry, index) => {
        if (index && entry.score !== entries[index - 1].score) rank = index + 1;
        return { ...entry, rank };
    });
}

function getClassDiffTopTenSubjects(students, headers, includeRankOnly = false) {
    const score = (student, subject) => AppCore.number(student.subjects?.[subject]?.score);
    const names = getMergedSubjectNames(students, headers).filter(name => students.some(student =>
        Number.isFinite(score(student, name)) || (includeRankOnly && hasMeaningfulRank(student.subjects?.[name]?.gradeRank))));

    const total = names.find(name => name === '总分')
        || names.find(name => /^(总分|总成绩|(考试|全科|综合|学科|文化课?|年级|原始|折算|赋分)总分)/.test(name));
    const englishParts = name => /^(英语(笔试|听说|听力|口语)|听说|听力|口语)$/.test(name);
    const englishTotals = names.filter(name => /^英语(合并|总分|合)$/.test(name));
    if (names.includes('英语') && (!names.some(englishParts) || names.includes('英语笔试')
        || resolveAmbiguousEnglishFullMark(students) === 100)) {
        englishTotals.push('英语');
    }

    const columns = [{ label: '总分', keys:total ? [total] : [], score: student => total ? score(student, total) : '' }];
    let englishShown = false;
    for (const name of names) {
        if (name === total) continue;
        if (englishTotals.length && (name === '英语' || englishTotals.includes(name) || englishParts(name))) {
            if (!englishShown) {
                columns.push({ label: '英语', keys:englishTotals, score: student => {
                    for (const subject of englishTotals) {
                        const value = score(student, subject);
                        if (Number.isFinite(value)) return value;
                    }
                    return '';
                }});
                englishShown = true;
            }
        } else {
            columns.push({ label: name, keys:[name], score: student => score(student, name) });
        }
    }
    return columns;
}

function renderClassDiffTopTen() {
    const section = document.getElementById('classDiffTopTenSection');
    const classSelect = document.getElementById('classDiffTopTenClass');
    const previous = classSelect.value;
    const classes = new Map();
    for (const student of combinedStudentData) {
        const key = AppCore.classKey(student.class);
        if (key) classes.set(key, AppCore.classLabel(student.class));
    }
    const classOptions = Array.from(classes).sort((a, b) =>
        a[1].localeCompare(b[1], 'zh-CN', { numeric: true }));
    classSelect.replaceChildren(new Option('全部班级', ''),
        ...classOptions.map(([key, label]) => new Option(label, key)));
    classSelect.value = classes.has(previous) ? previous : '';

    section.style.display = combinedStudentData.length ? 'block' : 'none';
    const students = classSelect.value
        ? combinedStudentData.filter(student => AppCore.classKey(student.class) === classSelect.value)
        : combinedStudentData;
    const columns = getClassDiffTopTenSubjects(combinedStudentData, allSubjectHeaders)
        .map(column => ({ label: column.label, entries: rankClassDiffScores(students, column.score)
            .filter(entry => entry.rank <= 10) }));
    const table = document.getElementById('classDiffTopTenTable');
    const rowCount = renderClassTopTenTable(table, columns, !classSelect.value && classes.size > 0);
    const totalNote = rowCount && !columns[0].entries.length ? ' · 暂无总分成绩' : '';
    document.getElementById('classDiffTopTenSummary').textContent = `${students.length} 人${totalNote}`;
    document.getElementById('classDiffTopTenExport').disabled = !rowCount;
    document.getElementById('classDiffTopTenCopyPng').disabled = !rowCount;
    table.parentElement.scrollTop = 0;
}

function renderClassTopTenTable(table, columns, showClass = false) {
    const rowCount = Math.max(...columns.map(column => column.entries.length));
    table.tHead.innerHTML = `<tr>${columns.map(column => `<th scope="col">${escapeHtml(column.label)}</th>`).join('')}</tr>`;
    const rows = [];
    for (let index = 0; index < rowCount; index++) {
        const cells = columns.map(column => {
            const entry = column.entries[index];
            if (!entry) return '<td></td>';
            const tied = column.entries[index - 1]?.rank === entry.rank || column.entries[index + 1]?.rank === entry.rank;
            const tieLabel = tied ? `<span class="class-top-ten-tie">并列第 ${entry.rank}</span>` : '';
            const classLabel = showClass
                ? `<span class="class-top-ten-detail class-top-ten-class">${escapeHtml(AppCore.classLabel(entry.student.class))}</span>`
                : '';
            const gradeTop = entry.gradeRank > 0 && entry.gradeRank <= 10;
            const nameClass = gradeTop ? 'class-top-ten-name class-top-ten-grade-top' : 'class-top-ten-name';
            const rankTitle = gradeTop ? ` title="年级第 ${entry.gradeRank} 名"` : '';
            return `<td><div class="class-top-ten-entry">
                <span class="class-top-ten-detail class-top-ten-rank">${entry.rank}</span>
                <span class="${nameClass}"${rankTitle}>${escapeHtml(entry.student.name)}</span>
                ${tieLabel}${classLabel}
                <span class="class-top-ten-detail class-top-ten-score">${entry.score}</span>
            </div></td>`;
        });
        rows.push(`<tr>${cells.join('')}</tr>`);
    }
    table.tBodies[0].innerHTML = rows.join('') || `<tr><td colspan="${columns.length}">当前范围暂无有效成绩</td></tr>`;
    return rowCount;
}

document.getElementById('classDiffTopTenClass').addEventListener('change', renderClassDiffTopTen);
document.getElementById('classDiffTopTenDetails').addEventListener('click', function() {
    const showDetails = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', String(showDetails));
    document.getElementById('classDiffTopTenTable').classList.toggle('show-details', showDetails);
});

function buildClassDiffTopTenExportSvg(table, caption) {
    const fontFamily = getComputedStyle(table).fontFamily;
    const layout = document.createElement('canvas').getContext('2d');
    if (!layout) throw new Error('当前浏览器无法生成图片');
    const fontStyles = {
        title: { size:22, weight:700, color:'#193a56' },
        caption: { size:13, weight:400, color:'#53677c' },
        header: { size:14, weight:700, color:'#ffffff' },
        name: { size:14, weight:600, color:'#1a1a2e' },
        rank: { size:13, weight:600, color:'#193a56' },
        class: { size:11, weight:400, color:'#53677c' },
        score: { size:13, weight:600, color:'#193a56' },
        tie: { size:11, weight:400, color:'#53677c' }
    };
    function measure(text, key) {
        const style = fontStyles[key];
        layout.font = `${style.weight} ${style.size}px ${fontFamily}`;
        return Math.ceil(layout.measureText(text).width);
    }
    function drawText(text, key, x, y, anchor = 'start') {
        const {size, weight, color} = fontStyles[key];
        return `<text x="${x}" y="${y}" dominant-baseline="central" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeHtml(text)}</text>`;
    }

    const detailed = table.classList.contains('show-details');
    const fields = detailed ? ['rank','name','class','score'] : ['name','tie'];
    const headers = Array.from(table.tHead.rows[0].cells, cell => ({
        label:cell.textContent.trim(),
        background:getComputedStyle(cell).backgroundColor
    }));
    const padding = 12, gap = 6, margin = 20;
    const widths = headers.map(header => Math.max(detailed ? 132 : 106, measure(header.label, 'header') + padding * 2));
    const rows = Array.from(table.tBodies[0].rows, row => Array.from(row.cells, (cell, columnIndex) => {
        const parts = [];
        let width = padding * 2;
        for (const key of fields) {
            const text = cell.querySelector('.class-top-ten-' + key)?.textContent.trim();
            if (!text) continue;
            const partWidth = measure(text, key) + (key === 'tie' ? 8 : 0);
            width += partWidth + (parts.length ? gap : 0);
            parts.push({key,text,width:partWidth});
        }
        widths[columnIndex] = Math.max(widths[columnIndex], width);
        return parts;
    }));
    const tableWidth = widths.reduce((total, width) => total + width, 0);
    const width = Math.max(tableWidth, measure(caption, 'caption'), measure('各科前十', 'title')) + margin * 2;
    const top = 78, headerHeight = 40, rowHeight = 36;
    const height = top + headerHeight + rows.length * rowHeight + margin;
    // 将 SVG 直接按 4 倍像素栅格化，超出画布预算时导出原尺寸的矢量图。
    const pngWidth = width * 4, pngHeight = height * 4;
    const usePng = Math.max(pngWidth, pngHeight) <= 16384 && pngWidth * pngHeight <= 32000000;
    const exportWidth = usePng ? pngWidth : width, exportHeight = usePng ? pngHeight : height;
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${width} ${height}" font-family="${escapeHtml(fontFamily)}">`,
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        drawText('各科前十', 'title', margin, 31),
        drawText(caption, 'caption', margin, 57)
    ];
    let x = margin;
    headers.forEach((header, index) => {
        const cellWidth = widths[index];
        svg.push(`<rect x="${x}" y="${top}" width="${cellWidth}" height="${headerHeight}" fill="${header.background}"/>`,
            drawText(header.label, 'header', x + cellWidth / 2, top + headerHeight / 2, 'middle'));
        x += cellWidth;
    });
    rows.forEach((row, index) => {
        const y = top + headerHeight + index * rowHeight;
        const center = y + rowHeight / 2;
        const fill = index % 2 ? '#f8fafc' : '#ffffff';
        let x = margin;
        row.forEach((parts, columnIndex) => {
            const cellWidth = widths[columnIndex];
            svg.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${fill}" stroke="#e9eef3"/>`);
            let cursor = x + padding;
            for (const part of parts) {
                if (part.key === 'score') {
                    svg.push(drawText(part.text, part.key, x + cellWidth - padding, center, 'end'));
                } else {
                    if (part.key === 'tie') {
                        svg.push(`<rect x="${cursor}" y="${center - 9}" width="${part.width}" height="18" rx="4" fill="#edf3f9"/>`);
                    }
                    svg.push(drawText(part.text, part.key, cursor + (part.key === 'tie' ? 4 : 0), center));
                    cursor += part.width + gap;
                }
            }
            x += cellWidth;
        });
    });
    svg.push('</svg>');
    return {svg:svg.join(''), usePng};
}

function getClassDiffTopTenImage() {
    const table = document.getElementById('classDiffTopTenTable');
    const scope = document.getElementById('classDiffTopTenClass').selectedOptions[0].textContent;
    const batch = document.getElementById('batchLabelClassDiff').textContent.trim();
    const summary = document.getElementById('classDiffTopTenSummary').textContent;
    const mode = table.classList.contains('show-details') ? '详情' : '名单';
    const filename = ['各科前十', batch, scope, mode].map(part => part.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)).join('_');
    return {...buildClassDiffTopTenExportSvg(table, `${batch} · ${scope} · ${summary}`), filename};
}

async function exportClassDiffTopTenImage() {
    if (document.getElementById('classDiffTopTenExport').disabled) return;
    try {
        const {svg, usePng, filename} = getClassDiffTopTenImage();
        if (usePng) downloadHeatmapReportImage(svg, filename + '.png', 1);
        else downloadCollectiveHeatmapBlob(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}), filename + '.svg');
    } catch (error) {
        await showAlert(error.message || '图片生成失败，请重试');
    }
}
document.getElementById('classDiffTopTenExport').addEventListener('click', exportClassDiffTopTenImage);
document.getElementById('classDiffTopTenCopyPng').addEventListener('click', function() {
    AppCore.images.copyPng(this, () => {
        const {svg, usePng} = getClassDiffTopTenImage();
        return AppCore.images.svgPng(svg, usePng ? 1 : 4);
    });
});

const rankCopyPngButton = document.getElementById('classDiffRankCopyPng');
rankCopyPngButton.addEventListener('click', function() {
    AppCore.charts.copyPng(this, classDiffEchartsInst.mainChart);
});

function getClassReportImportedGradeRanks(batch) {
    const ranks = new Map();
    // Merged rows may contain automatically filled ranks from only part of the grade.
    const uniqueStudentByName = new Map();
    for (const student of batch?.combinedStudentData || []) {
        const name = AppCore.text(student.name);
        uniqueStudentByName.set(name, uniqueStudentByName.has(name) ? null : student);
    }
    const files = Object.values(batch?.uploadedFilesData || {})
        .sort((a, b) => Number(b.fileType === 'main') - Number(a.fileType === 'main'));
    for (const file of files) {
        for (const student of file.studentData || []) {
            const name = AppCore.text(student.name);
            const matched = AppCore.classKey(student.class) ? student : uniqueStudentByName.get(name);
            if (!name || !matched || !AppCore.classKey(matched.class)) continue;
            const key = AppCore.studentKey(matched);
            for (const [subject, data] of Object.entries(student.subjects || {})) {
                const rank = AppCore.number(data?.gradeRank);
                if (!Number.isInteger(rank) || rank <= 0) continue;
                if (!ranks.has(key)) ranks.set(key, new Map());
                const subjects = ranks.get(key);
                if (file.fileType === 'main' || !subjects.has(subject)) subjects.set(subject, rank);
            }
        }
    }
    return ranks;
}

function getClassReportGradeRanks(data, column, importedRanks) {
    const ranks = new Map();
    for (const student of data) {
        const key = AppCore.studentKey(student);
        const bySubject = importedRanks.get(key);
        const rank = column.keys.map(subject => bySubject?.get(subject)).find(Number.isInteger);
        if (rank !== undefined) ranks.set(key, rank);
    }
    if (ranks.size) return ranks;

    // A single class cannot provide a grade-wide ranking without imported ranks.
    const entries = rankClassDiffScores(data, column.score);
    const classes = new Set(entries.map(entry => AppCore.classKey(entry.student.class)).filter(Boolean));
    if (classes.size > 1) {
        for (const { student, rank } of entries) ranks.set(AppCore.studentKey(student), rank);
    }
    return ranks;
}

function buildClassReportLeaderboards(students, currentData, batch, compareBatch, columns) {
    const currentImported = getClassReportImportedGradeRanks(batch);
    const previousImported = getClassReportImportedGradeRanks(compareBatch);
    const previousData = compareBatch?.combinedStudentData || [];
    const previousColumns = getClassDiffTopTenSubjects(previousData, compareBatch?.allSubjectHeaders || [], true);
    const canonicalSubject = label => /^(道法|道德与法治|政治|思想政治|思想品德)$/.test(label) ? '道德与法治' : label;
    const previousBySubject = new Map(previousColumns.map(column => [canonicalSubject(column.label), column]));
    const previousByStudent = new Map();
    for (const student of previousData) {
        const key = AppCore.studentKey(student);
        previousByStudent.set(key, previousByStudent.has(key) ? null : student);
    }

    const compareRankChangeTies = (a, b) => a.curRank - b.curRank || a.name.localeCompare(b.name, 'zh-CN');
    return columns.map(column => {
        const currentRanks = getClassReportGradeRanks(currentData, column, currentImported);
        const classTop = rankClassDiffScores(students, column.score).filter(entry => entry.rank <= 10)
            .map(entry => ({ ...entry, gradeRank:currentRanks.get(AppCore.studentKey(entry.student)) }));
        const classRanks = students.map(student => ({
            student, rank:currentRanks.get(AppCore.studentKey(student))
        })).filter(entry => entry.rank !== undefined);
        const priorColumn = previousBySubject.get(canonicalSubject(column.label));
        const previousRanks = priorColumn ? getClassReportGradeRanks(previousData, priorColumn, previousImported) : new Map();
        const comparable = classRanks.flatMap(({student, rank}) => {
            const key = AppCore.studentKey(student);
            const priorRank = previousRanks.get(key);
            if (priorRank === undefined || !previousByStudent.get(key)) return [];
            return [{name:getStudentDisplayName(student), compareRank:priorRank, curRank:rank, change:priorRank - rank}];
        });
        const improved = comparable.filter(entry => entry.change > 0)
            .sort((a, b) => b.change - a.change || compareRankChangeTies(a, b))
            .slice(0, 10);
        const declined = comparable.filter(entry => entry.change < 0)
            .sort((a, b) => a.change - b.change || compareRankChangeTies(a, b))
            .slice(0, 10);
        const unavailableMessage = comparable.length ? null
            : !currentRanks.size ? '本次缺少年级排名数据'
            : !previousRanks.size ? '对照批次缺少年级排名数据'
            : '无学生在两次均有有效名次';
        return {
            label:column.label, entries:classTop, comparable, improved, declined, unavailableMessage,
            gradeTopCount:classRanks.length ? classRanks.filter(entry => entry.rank <= 10).length : null
        };
    });
}

function renderReportListImageHeading(title, {disabled = false, allowDownload = false, heading = 'h3'} = {}) {
    const state = disabled ? ' disabled' : '';
    return `<div class="sr-list-image-heading"><${heading}>${title}</${heading}><div class="sr-class-leaderboard-actions">
        ${allowDownload ? `<button type="button" class="image-action-btn" onclick="exportReportListImage(this)"${state}>导出 PNG</button>` : ''}
        <button type="button" class="image-action-btn" onclick="exportReportListImage(this, true)"${state}>复制图片</button>
    </div></div>`;
}

function drawReportListImage(section, title, caption) {
    const tables = [...section.querySelectorAll(':scope > table, :scope > .scroll-container > table')];
    if (!tables.length) throw new Error('暂无可生成图片的清单');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成图片');
    const family = getComputedStyle(tables[0]).fontFamily || 'sans-serif';
    const width = 1040, margin = 24, contentWidth = width - margin * 2;
    const lineHeight = 20, padding = 10;
    const useFont = (size, weight = 400) => { context.font = `${weight} ${size}px ${family}`; };
    const wrap = (text, maxWidth) => {
        const lines = [];
        let line = '';
        for (const char of text) {
            if (line && context.measureText(line + char).width > maxWidth) {
                lines.push(line);
                line = '';
            }
            line += char;
        }
        lines.push(line);
        return lines;
    };
    const weights = {
        'weak-items':[.085, .125, .075, .115, .14, .16, .15, .15],
        'priority-students':[.16, .12, .20, .20, .16, .16],
        'choice-distribution':[.10, .11, .10, .11, .25, .33],
        'threshold-questions':[.09, .16, .09, .08, .08, .10, .30, .10],
        'threshold-questions-with-knowledge':[.08, .13, .14, .08, .07, .07, .09, .25, .09],
        'level-questions':[.10, .17, .10, .09, .09, .34, .11]
    }[section.dataset.reportListImage] || [.16, .08, .76];
    const plans = tables.map(table => {
        const columns = weights.map(weight => weight * contentWidth);
        // The question-bank action column contains controls, not report data.
        const actionColumn = [...table.tHead.rows[0].cells].findIndex(cell => cell.textContent.trim() === '操作');
        const rows = [...table.rows].map(row => {
            const header = row.parentElement === table.tHead;
            const cells = [...row.cells].filter((_, index) => index !== actionColumn).map((cell, index) => {
                useFont(14, header ? 700 : 400);
                const correct = cell.querySelector('.collective-correct-option');
                if (correct) {
                    const marked = correct.textContent.trim();
                    const style = getComputedStyle(correct);
                    const runs = [];
                    const nodes = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                    for (let node; (node = nodes.nextNode());) {
                        runs.push({text:node.textContent, highlighted:correct.contains(node)});
                    }
                    const lines = [[]];
                    let lineWidth = 0;
                    for (const run of runs) {
                        useFont(14, run.highlighted ? 700 : 400);
                        for (const token of (run.highlighted ? [marked] : run.text.split(/(\s+)/)).filter(Boolean)) {
                            const tokenWidth = context.measureText(token).width + (run.highlighted ? 10 : 0);
                            if (lineWidth + tokenWidth > columns[index] - 2 * padding && lineWidth) {
                                lines.push([]);
                                lineWidth = 0;
                            }
                            if (!lineWidth && !token.trim()) continue;
                            lines[lines.length - 1].push({text:token, width:tokenWidth, highlighted:run.highlighted});
                            lineWidth += tokenWidth;
                        }
                    }
                    return {lines, color:'#1e293b', accent:style.color, fill:style.backgroundColor};
                }
                const badge = cell.querySelector('.sr-pill');
                return {
                    lines:wrap(cell.textContent.trim().replace(/\s+/g, ' '), columns[index] - 2 * padding),
                    color:header ? '#ffffff' : badge ? getComputedStyle(badge).color : '#1e293b'
                };
            });
            return {header, cells, height:2 * padding + lineHeight * Math.max(1, ...cells.map(cell => cell.lines.length))};
        });
        return {columns, rows};
    });
    useFont(13);
    const captionLines = caption ? wrap(caption, contentWidth) : [];
    const notes = [...section.querySelectorAll(':scope > .sr-note-box')]
        .flatMap(node => wrap(node.textContent.trim(), contentWidth));
    const height = 78 + lineHeight * captionLines.length + margin
        + plans.reduce((total, {rows}) => total + 12 + rows.reduce((height, row) => height + row.height, 0), 0)
        + lineHeight * notes.length;
    const scale = Math.min(3, 16384 / Math.max(width, height), Math.sqrt(32000000 / (width * height)));
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    context.scale(canvas.width / width, canvas.height / height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.textBaseline = 'middle';
    useFont(24, 700);
    context.fillStyle = '#1e3a5f';
    context.fillText(title, margin, 36);
    useFont(13);
    context.fillStyle = '#475569';
    captionLines.forEach((line, index) => context.fillText(line, margin, 64 + index * lineHeight));
    let y = 78 + captionLines.length * lineHeight;
    for (const {columns, rows} of plans) {
        rows.forEach((row, index) => {
            let x = margin;
            useFont(14, row.header ? 700 : 400);
            row.cells.forEach((cell, columnIndex) => {
                const {lines, color} = cell;
                const cellWidth = columns[columnIndex];
                context.fillStyle = row.header ? '#1e3a5f' : index % 2 ? '#ffffff' : '#f8fafc';
                context.fillRect(x, y, cellWidth, row.height);
                context.strokeStyle = '#e2e8f0';
                context.strokeRect(x, y, cellWidth, row.height);
                context.fillStyle = color;
                const start = y + (row.height - (lines.length - 1) * lineHeight) / 2;
                lines.forEach((text, line) => {
                    const baseline = start + line * lineHeight;
                    if (typeof text === 'string') {
                        useFont(14, row.header ? 700 : 400);
                        context.fillStyle = color;
                        context.fillText(text, x + padding, baseline);
                        return;
                    }
                    let cursor = x + padding;
                    for (const run of text) {
                        useFont(14, run.highlighted ? 700 : 400);
                        if (run.highlighted) {
                            context.fillStyle = cell.fill;
                            context.beginPath();
                            context.roundRect(cursor, baseline - 9, run.width, 18, 4);
                            context.fill();
                        }
                        context.fillStyle = run.highlighted ? cell.accent : color;
                        context.fillText(run.text, cursor + (run.highlighted ? 5 : 0), baseline);
                        cursor += run.width;
                    }
                });
                x += cellWidth;
            });
            y += row.height;
        });
        y += 12;
    }
    useFont(13);
    context.fillStyle = '#475569';
    notes.forEach((line, index) => context.fillText(line, margin, y + 10 + index * lineHeight));
    return canvas;
}

async function exportReportListImage(button, copy = false) {
    if (button.disabled) return;
    const section = button.closest('[data-report-list-image]');
    const title = section.querySelector('.sr-list-image-heading :is(h3, h4)').textContent.trim();
    const report = section.closest('.student-readable-report, .comp-readable-report');
    const reportName = report?.querySelector('h2')?.textContent.trim() || '';
    const metadata = [...(report?.querySelectorAll('.sr-meta > div, .cr-meta > div') || [])]
        .map(node => node.textContent.trim()).filter(text => !text.startsWith('生成时间'));
    const caption = [reportName, ...metadata].filter(Boolean).join(' · ');
    const renderPng = async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        return AppCore.images.canvasPng(drawReportListImage(section, title, caption));
    };
    if (copy) {
        await AppCore.images.copyPng(button, renderPng);
        return;
    }
    button.disabled = true;
    try {
        const filename = [reportName, title].filter(Boolean).join('_').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) + '.png';
        downloadCollectiveHeatmapBlob(await renderPng(), filename);
    } catch (error) {
        showToast(error.message || '清单图片导出失败，请重试', 'error');
    } finally {
        button.disabled = false;
    }
}

function renderClassLeaderboardHeading(id,title) {
    return `<div class="sr-class-leaderboard-heading"><h4 id="${id}">${title}</h4>
        <div class="sr-class-leaderboard-actions">
            <button type="button" class="image-action-btn sr-class-leaderboard-export" aria-label="复制图片：${title}" onclick="exportClassReportLeaderboard(this, true)">复制图片</button>
            <button type="button" class="class-top-ten-export sr-class-leaderboard-export" title="导出完整榜单高清 PNG（不受滚动范围限制）" aria-label="导出${title}高清PNG" onclick="exportClassReportLeaderboard(this)">高清 PNG</button>
        </div></div>`;
}

function drawClassReportLeaderboard(table, title, caption, legend, kind) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法生成图片');
    const family = getComputedStyle(table).fontFamily || 'sans-serif';
    const font = (size, weight) => { ctx.font = `${weight} ${size}px ${family}`; };
    const measure = (value, size, weight = 400) => { font(size, weight); return Math.ceil(ctx.measureText(value).width); };
    const txt = (value, x, y, size, weight, color, align = 'left') => {
        font(size, weight); ctx.fillStyle = color; ctx.textAlign = align;
        ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
    };
    const rect = (x,y,w,h,color) => { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); };
    const headers = Array.from(table.tHead.rows[0].cells, cell => cell.textContent.trim());
    if (!headers.length) throw new Error('暂无可导出的榜单');
    const progress = kind === 'improved' || kind === 'declined';
    const pad = 12, gap = 8, margin = 24;
    const widths = headers.map(label => Math.max(progress ? 150 : 118, measure(label,14,700) + 2*pad));
    const read = (cell, selector) => cell.querySelector(selector)?.textContent.trim() || '';
    const rows = Array.from(table.tBodies[0].rows, row => {
        if (row.cells.length === 1 && row.cells[0].colSpan === headers.length &&
            !row.cells[0].querySelector('.class-top-ten-entry, .sr-class-progress-entry')) {
            return {message:row.cells[0].textContent.trim()};
        }
        return {cells:Array.from(row.cells, (cell,i) => {
            const name = read(cell, progress ? '.sr-class-progress-name' : '.class-top-ten-name');
            const tie = read(cell, '.class-top-ten-tie');
            const gold = !!cell.querySelector('.class-top-ten-name.class-top-ten-grade-top');
            const delta = read(cell,'.sr-class-progress-delta');
            const change = read(cell,'.sr-class-progress-change');
            const empty = read(cell,'.sr-class-progress-empty');
            const nameWidth = name ? measure(name,progress ? 16 : 14,700) + (gold ? 8 : 0) : 0;
            const tieWidth = tie ? measure(tie,11) + 8 : 0;
            const rightWidth = progress ? Math.max(measure(delta,14,700),measure(change,11)) : tieWidth;
            widths[i] = Math.max(widths[i],2*pad+nameWidth+(rightWidth ? gap+rightWidth : 0),2*pad+measure(empty,12));
            return {name,tie,gold,delta,change,empty,nameWidth,tieWidth};
        })};
    });
    const tableWidth = widths.reduce((sum,w)=>sum+w,0);
    const width = Math.ceil(Math.max(tableWidth,measure(title,24,700),measure(caption,13),measure(legend,12),...rows.map(r=>r.message ? measure(r.message,14)+2*pad : 0))+2*margin);
    const top = legend ? 104 : 82;
    const headerHeight = 40, rowHeight = progress ? 52 : 38;
    const height = top+headerHeight+Math.max(rows.length,1)*rowHeight+margin;
    // Prefer 4x export; bound pixel count for unusually wide or long tables.
    const scale = Math.min(4,16384/Math.max(width,height),Math.sqrt(32000000/(width*height)));
    canvas.width = Math.max(1,Math.floor(width*scale));
    canvas.height = Math.max(1,Math.floor(height*scale));
    ctx.scale(canvas.width/width,canvas.height/height);
    rect(0,0,width,height,'#ffffff');
    txt(title,margin,32,24,700,'#193a56');
    txt(caption,margin,61,13,400,'#53677c');
    if (legend) txt(legend,margin,83,12,400,'#795510');
    let x = margin;
    headers.forEach((label,i)=>{
        rect(x,top,widths[i],headerHeight,i===0?'#193a56':'#2b4e6b');
        txt(label,x+widths[i]/2,top+headerHeight/2,14,700,'#ffffff','center');
        x += widths[i];
    });
    rows.forEach((row,j)=>{
        const y=top+headerHeight+j*rowHeight, cy=y+rowHeight/2;
        const bg=j%2?'#f8fafc':'#ffffff';
        if (row.message) {
            rect(margin,y,tableWidth,rowHeight,bg);
            txt(row.message,margin+pad,cy,14,400,'#53677c');
            rect(margin,y+rowHeight-1,tableWidth,1,'#e9eef3');
            return;
        }
        let x=margin;
        row.cells.forEach((cell,i)=>{
            const w=widths[i];
            rect(x,y,w,rowHeight,bg);
            rect(x+w-1,y,1,rowHeight,'#e9eef3');
            rect(x,y+rowHeight-1,w,1,'#e9eef3');
            if(cell.empty) txt(cell.empty,x+pad,cy,12,400,'#53677c');
            if(cell.name){
                if(cell.gold) rect(x+pad,cy-11,cell.nameWidth,22,'#ffe4a0');
                txt(cell.name,x+pad+(cell.gold?4:0),cy,progress?16:14,700,cell.gold?'#563600':'#1a1a2e');
                if(cell.tie){
                    const tx=x+pad+cell.nameWidth+gap;
                    rect(tx,cy-9,cell.tieWidth,18,'#edf3f9');
                    txt(cell.tie,tx+4,cy,11,400,'#53677c');
                }
                if(progress){
                    txt(cell.delta,x+w-pad,cy-9,14,700,kind==='declined'?'#991b1b':'#166534','right');
                    txt(cell.change,x+w-pad,cy+10,11,400,'#53677c','right');
                }
            }
            x+=w;
        });
    });
    return canvas;
}

async function exportClassReportLeaderboard(button, copy = false) {
    if (button.disabled) return;
    const board = button.closest('.sr-class-leaderboard');
    const table = board?.querySelector('table');
    if (!table?.tHead?.rows.length || !table.tBodies[0]) {
        await showAlert('暂无可导出的榜单');
        return;
    }
    const title = board.querySelector('h4').textContent.trim();
    const meta = Array.from(board.closest('.comp-readable-report').querySelectorAll('.cr-meta > div'))
        .map(el=>el.textContent.trim()).filter(t=>!t.startsWith('生成时间'));
    const caption = meta.join(' · ');
    const legend = board.querySelector('.sr-class-top-ten-legend')?.textContent.trim() || '';
    async function renderPng() {
        if (document.fonts?.ready) await document.fonts.ready;
        const canvas = drawClassReportLeaderboard(table,title,caption,legend,board.dataset.classLeaderboard);
        return AppCore.images.canvasPng(canvas);
    }
    if (copy) {
        await AppCore.images.copyPng(button, renderPng);
        return;
    }
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '导出中…';
    try {
        const blob = await renderPng();
        const filename = [title,...meta].map(s=>s.replace(/[\\/:*?"<>|：]/g,'_').slice(0,60)).join('_')+'.png';
        downloadCollectiveHeatmapBlob(blob,filename);
    } catch (error) {
        await showAlert(error.message || '图片生成失败，请重试');
    } finally {
        button.disabled = false;
        button.textContent = original;
    }
}

function renderClassReportRankChangeTable(columns, kind) {
    const declining = kind === 'declined';
    const title = declining ? '年级名次退步前十' : '年级名次进步前十';
    const titleId = declining ? 'classReportDeclineTitle' : 'classReportProgressTitle';
    const arrow = declining ? '↓' : '↑';
    const emptyMessage = declining ? '本班无人退步' : '本班无人进步';
    const header = columns.map(column => `<th scope="col">${escapeHtml(column.label)}</th>`).join('');
    const rowCount = Math.max(1, ...columns.map(column => column[kind].length));
    const rows = Array.from({ length:rowCount }, (_, index) => {
        const cells = columns.map(column => {
            const entry = column[kind][index];
            if (entry) {
                return `<td><div class="sr-class-progress-entry">
                    <span class="sr-class-progress-name">${escapeHtml(entry.name)}</span>
                    <div class="sr-class-progress-ranks">
                        <strong class="sr-class-progress-delta">${arrow}${Math.abs(entry.change)}</strong>
                        <small class="sr-class-progress-change">${entry.compareRank} → ${entry.curRank}</small>
                    </div>
                </div></td>`;
            }
            if (index === 0) return `<td><span class="sr-class-progress-empty">${escapeHtml(column.unavailableMessage ?? emptyMessage)}</span></td>`;
            return '<td></td>';
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="sr-class-leaderboard" data-class-leaderboard="${kind}">
        ${renderClassLeaderboardHeading(titleId, title)}
        <div class="scroll-container class-top-ten-scroll sr-class-top-ten-scroll sr-class-progress-scroll"
            tabindex="0" role="region" aria-labelledby="${titleId}">
            <table class="class-top-ten-table sr-class-progress-table" aria-labelledby="${titleId}">
                <thead><tr>${header}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

