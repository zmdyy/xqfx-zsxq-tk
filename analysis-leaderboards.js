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

async function exportClassDiffTopTenImage() {
    const table = document.getElementById('classDiffTopTenTable');
    const button = document.getElementById('classDiffTopTenExport');
    if (button.disabled) return;
    try {
        const scope = document.getElementById('classDiffTopTenClass').selectedOptions[0].textContent;
        const batch = document.getElementById('batchLabelClassDiff').textContent.trim();
        const summary = document.getElementById('classDiffTopTenSummary').textContent;
        const mode = table.classList.contains('show-details') ? '详情' : '名单';
        const filename = ['各科前十', batch, scope, mode].map(part => part.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)).join('_');
        const {svg, usePng} = buildClassDiffTopTenExportSvg(table, `${batch} · ${scope} · ${summary}`);
        if (usePng) downloadHeatmapReportImage(svg, filename + '.png', 1);
        else downloadCollectiveHeatmapBlob(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}), filename + '.svg');
    } catch (error) {
        await showAlert(error.message || '图片生成失败，请重试');
    }
}
document.getElementById('classDiffTopTenExport').addEventListener('click', exportClassDiffTopTenImage);

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
        <h4 id="${titleId}">${title}</h4>
        <div class="scroll-container class-top-ten-scroll sr-class-top-ten-scroll sr-class-progress-scroll"
            tabindex="0" role="region" aria-labelledby="${titleId}">
            <table class="class-top-ten-table sr-class-progress-table" aria-labelledby="${titleId}">
                <thead><tr>${header}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

