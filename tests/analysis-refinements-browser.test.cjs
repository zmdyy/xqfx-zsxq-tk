'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.writeHead(404).end();
            return;
        }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript'
            : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({
        headless:true,
        executablePath:process.env.CHROMIUM_EXECUTABLE,
        args:process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox']
    });
    try {
        const page = await browser.newPage({viewport:{width:1500,height:950}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.waitForFunction(() => typeof renderClassTopTenTable === 'function' && typeof AppCore === 'object');
        await page.evaluate(() => {
            const roster = Array.from({length:12}, (_, i) => ({
                name:'学生' + String(i).padStart(2, '0'), class:'01班',
                subjects:{
                    总分:{score:500 - (i === 10 ? 9 : i), gradeRank:i === 0 ? 3 : i < 3 ? 10 : 20 + i},
                    数学:{score:95 - i, gradeRank:95},
                    物理:{score:95 - i, grade:'B', subScores:{'1':{score:i === 2 ? 2 : 0,maxScore:2}}}
                }
            }));
            const other = {name:'学生01',class:'02班',subjects:{
                总分:{score:600,gradeRank:1}, 数学:{score:100,gradeRank:1},
                物理:{score:80,grade:'B',subScores:{'1':{score:0,maxScore:2}}}
            }};
            const headers = [{name:'总分'}, {name:'数学'}, {name:'物理'}];
            const makeBatch = (id, label, students) => ({
                id, label, combinedStudentData:students, allSubjectHeaders:headers, uploadedPdfs:[],
                uploadedFilesData:{main:{fileType:'main', studentData:students.map(student => ({
                    name:student.name, class:student.class, subjects:{总分:student.subjects.总分}
                }))}}
            });
            const earlier = AppCore.clone([...roster, other]);
            earlier[3].subjects.总分.gradeRank = 100;
            earlier[4].subjects.总分.gradeRank = 4;
            earlier[3].subjects.数学.score = 60;
            const latest = makeBatch('latest', '本次测试', [...roster, other]);
            DataPool.batches = [makeBatch('reference','对照测试',earlier),latest];
            DataPool.currentBatchId = latest.id;
            combinedStudentData = latest.combinedStudentData;
            allSubjectHeaders = headers;
            applyDuplicateDisplayNames(combinedStudentData);
        });

        await page.click('[data-tab="tab-class-diff"]');
        await page.selectOption('#classDiffTopTenClass', '1');
        assert.deepEqual(await page.locator('#classDiffTopTenTable th').allTextContents(), ['总分','数学','物理']);
        assert.equal(await page.locator('#classDiffTopTenTable tbody tr').count(), 11);
        assert.equal(await page.locator('#classDiffTopTenTable td:first-child .class-top-ten-tie').last().textContent(), '并列第 10');
        await page.click('#classDiffTopTenDetails');
        await page.locator('#classDiffTopTenTable .class-top-ten-score').first().waitFor({state:'visible'});
        const topPng = page.waitForEvent('download');
        await page.click('#classDiffTopTenExport');
        const png = fs.readFileSync(await (await topPng).path());
        assert.equal(png.subarray(1,4).toString(), 'PNG');
        assert.ok(png.readUInt32BE(16) >= 1600, 'export uses final-size rasterization');

        await page.click('[data-tab="tab-smart"]');
        await page.selectOption('#smartClassFilter', '01班');
        await page.selectOption('#smartClassCurrentBatch', 'latest');
        await page.selectOption('#smartClassCompareBatch', 'reference');
        await page.click('#smartClassBtn');
        const gold = await page.locator('#classReportTopTenTable .class-top-ten-grade-top').first().getAttribute('title');
        assert.equal(gold, '年级第 3 名');
        const improve = page.locator('[data-class-leaderboard="improved"] tbody tr').first();
        const decline = page.locator('[data-class-leaderboard="declined"] tbody tr').first();
        assert.equal(await improve.locator('td').nth(0).locator('.sr-class-progress-delta').textContent(), '↑77');
        assert.equal(await improve.locator('td').nth(1).locator('.sr-class-progress-change').textContent(), '13 → 5');
        assert.equal(await decline.locator('td').nth(0).locator('.sr-class-progress-delta').textContent(), '↓20');

        await page.fill('#smartNameSearch','学生00');
        await page.locator('#smartNameSuggest [data-display-name="学生00"]').click();
        await page.click('#smartIndividualBtn');
        const color = await page.locator('#studentReportWeakCompareChart').evaluate(el => {
            const series = echarts.getInstanceByDom(el).getOption().series;
            return [series[0].color,series[1].color,series[0].data[0].label.backgroundColor];
        });
        assert.deepEqual(color, ['#a23e1b','#176681','#fff0e8']);

        await page.click('[data-tab="tab-collective"]');
        await page.selectOption('#collectiveSubjectFilter','物理');
        await page.locator('#collectiveHeatmapExportSvgBtn:enabled').waitFor();
        assert.doesNotMatch(await page.locator('#collectiveHeatmapChart').textContent(), /异常学生名单/);
        async function exportSvg() {
            const result = page.waitForEvent('download');
            await page.click('#collectiveHeatmapExportSvgBtn');
            const xml = fs.readFileSync(await (await result).path(),'utf8');
            assert.equal(await page.evaluate(value => !!new DOMParser().parseFromString(value,'image/svg+xml').querySelector('parsererror'),xml),false);
            return xml.slice(xml.indexOf('异常学生名单'));
        }
        const roster = await exportSvg();
        assert.match(roster, /01班<.*学生01（01班）.*02班<.*学生01（02班）/);
        assert.doesNotMatch(roster, /学生02|识别依据/);
        const heatPng = page.waitForEvent('download');
        await page.click('#collectiveHeatmapExportPngBtn');
        const heatImage = fs.readFileSync(await (await heatPng).path());
        assert.equal(heatImage.subarray(1,4).toString(), 'PNG');
        assert.ok(heatImage.readUInt32BE(16) >= 4 * 520, 'PNG includes the full roster canvas');
        await page.selectOption('#collectiveClassFilter','01班');
        assert.doesNotMatch(await exportSvg(), /02班/);

        await page.click('[data-tab="tab-trend"]');
        const trend = await page.evaluate(() => {
            const labels = ['测试前','第一次','中间缺考','最后一次'];
            const dataset = values => ({headers:['姓名',...labels],rows:[['趋势学生',...values]]});
            DataPool.trendParsedSheets = {
                total:dataset([1,1,1,1]), subjects:{physics:dataset([null,null,null,2]),history:dataset([null,2,null,1])}
            };
            trendRowIdx = 0;
            document.getElementById('trendDisplayMode').value = 'ranking';
            document.getElementById('trendPointStyleSelect').value = 'none';
            updateTrendDisplay();
            const read = id => {
                const option = trendEchartsInst[id + 'RankChart'].getOption();
                const series = option.series[0];
                return {labels:option.xAxis[0].data,data:series.data,symbol:series.symbol,connectNulls:series.connectNulls};
            };
            return [read('physics'), read('history')];
        });
        assert.deepEqual(trend[0], {labels:['最后一次'],data:[2],symbol:'circle',connectNulls:false});
        assert.deepEqual(trend[1].labels, ['第一次','中间缺考','最后一次']);
        assert.deepEqual(trend[1].data, [2,null,1]);
        assert.equal(trend[1].connectNulls, false);
        assert.deepEqual(errors, []);
        console.log('PASS analysis refinements: class filter, competition ties, 4x PNG, grade highlights and progress, weak-item contrast, heatmap roster, trend gaps');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
