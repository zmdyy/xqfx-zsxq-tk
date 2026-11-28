const assert = require('node:assert/strict');
global.WrongQuestionRecommendations = require('../wrong-question-recommendations.js');
const C = require('../ai-practice-core.js');
const R = C.rules;

const image = { data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=' };
const work = 'mech_work', relay = 'elec_电磁继电器', ohm = 'elec_ohm_law', mirror = 'opt_平面镜成像';
const catalog = [work, relay, ohm, mirror].map(concept_id => ({ concept_id }));

function question(id, concept, stem, answer, extra = {}) {
 return { id, stem, answer, primary_concept_id: concept, concept_ids: [concept], difficulty: '容易', review: 'pending', images: [], answerImages: [], revision: 1, ...extra };
}

function classroomCase(conceptId, task, stem) {
 const focus = { sourceId: 'exam|22', score: 1, full: 3, itemName: '22', tags: [{ conceptId, scoreEligible: true, assessmentIds: [task] }] };
 const packet = { original: { stem }, currentBatchId: 'exam', focus, exams: [{ batchId: 'exam', sourceId: 'exam|subject', units: [focus] }] };
 return { packet, targets: C.mappedTargets(packet, catalog), task };
}

function shortlist(fixture, bank, goal, fields = {}, options = {}) {
 const practiceIntent = C.preparation({ goal, startingPoint: 'same_skill', taskTypes: [fixture.task], evidenceKeys: ['E1'], ...fields }, fixture.packet, fixture.targets);
 const packet = { ...fixture.packet, ...options, practiceIntent };
 const targets = { ...fixture.targets, practiceIntent };
 return { packet, targets, report: C.candidateReport(bank, packet, targets, null, [], {}) };
}

function verifySelection(attempt, approvedId, solution, quote) {
 const { packet, targets, report } = attempt;
 const rank = report.questions.findIndex(q => q.id === approvedId) + 1;
 assert.equal(rank, 1, approvedId + ' should be first in the actual shortlist');
 const response = {
  goal: packet.practiceIntent.goal, summary: '依据本次计分项安排短练习。', evidenceKeys: ['E1'],
  items: [{ id: approvedId, reason: '按本次训练操作练习', minutes: 3, suitability: {
   relation: 'same_skill', completeness: 'complete', answerConsistency: 'consistent', fitsStartingPoint: true, solutionSteps: [solution], basis: [quote]
  } }]
 };
 const plan = C.recommendation(response, packet, catalog, report.questions, targets).plan;
 assert.deepEqual(plan.items.map(q => q.id), [approvedId]);
 return response;
}

// Keep the same score, task type and starting point. Only the operation to train changes.
const skipping = classroomCase(work, 'estimate', '小明跳绳，每次升高约5cm，估算跳绳过程克服重力做的功。');
const estimateFromGiven = question('given-height', work, '已知小华重力约400N，练习中重心累计升高10m。请估算他克服重力做的功。', 'W=Gh=400N×10m=4000J。');
const estimateFromGraph = question('graph-height', work, '从累计高度图像读出总高度，估算500N的学生训练时克服重力做的功。', '从图像读出累计高度9m，W=Gh=500N×9m=4500J。', { images: [image] });
const estimateBank = [estimateFromGraph, estimateFromGiven];
const given = shortlist(skipping, estimateBank, '已知量直接估算克服重力做功，不读图', { formulaIds: ['work_gravity'] });
const graph = shortlist(skipping, estimateBank, '从图像读出累计高度后估算克服重力做功', { requiredOperations: ['graph_reading'], formulaIds: ['work_gravity'] });
assert.deepEqual(given.packet.practiceIntent.requiredOperations, ['direct_substitution']);
assert.deepEqual(given.packet.practiceIntent.avoidOperations, ['graph_reading']);
assert.deepEqual(given.report.retrieval[1].avoidConflicts, ['graph_reading']);
const fixtureResponse = verifySelection(given, 'given-height', '将重力和总高度代入 W=Gh', '重心累计升高10m');
verifySelection(graph, 'graph-height', '从图像读出累计高度，再计算 W=Gh', '从累计高度图像读出总高度');
for (const fields of [{ completeness: 'uncertain' }, { answerConsistency: 'uncertain' }, { fitsStartingPoint: undefined }, { relation: 'unknown' }]) {
 const item = fixtureResponse.items[0];
 const response = { ...fixtureResponse, items: [{ ...item, suitability: { ...item.suitability, ...fields } }] };
 assert.throws(() => C.recommendation(response, given.packet, catalog, given.report.questions, given.targets), /适配核验|待确认/);
}

// The original mapping stays on the relay. The same operation and formula retrieve an ordinary circuit question.
const relayCase = classroomCase(relay, 'calculate', '光控继电器电路中两个电阻串联，计算电路中的电流。');
const plainOhm = question('plain-series', ohm, '两个串联的电阻分别为10Ω和20Ω，两端总电压6V。求电流。', String.raw`$I=\frac{U}{R_0+R}=0.2\mathrm{A}$。`);
const relayDistractor = question('relay-graph', relay, '从光敏电阻图像读出对应的阻值，说明开关变化后并计算电流。', '从图像读出电阻，先求总电阻再求电流，I=U/R。', { images: [image] });
const plainWork = question('other-formula', work, '一人用20N的拉力水平拉动物体5m，求拉力所做的功。', 'W=Fs=100J。');
const electric = shortlist(relayCase, [relayDistractor, plainWork, plainOhm], '练习串联已知量的一步代入', {
 startingPoint: 'formula_direct', requiredOperations: ['direct_substitution'], avoidOperations: ['graph_reading', 'multi_step'], formulaIds: ['ohm_series_current', 'unlisted_formula']
});
assert.deepEqual(electric.packet.practiceIntent.formulaIds, ['ohm_series_current']);
assert.deepEqual(electric.targets.conceptIds, [relay]);
assert(!electric.report.questions.some(q => q.id === plainWork.id));
assert.equal(electric.report.retrieval[0].path, 'task_supplement');
verifySelection(electric, 'plain-series', '将总电压和两个已知电阻代入串联电流关系', '两个串联的电阻分别为10Ω和20Ω');

// In a reflective ray diagram, a complete question must exercise both construction steps.
const mirrorCase = classroomCase(mirror, 'draw', '在平面镜前通过镜面观察另一位同学，请画出观察光路图。');
const reflect = question('mirror-ray', mirror,
 '如图，灯S和眼睛E在平面镜同一侧。请先画出灯的像点，再画出E通过平面镜观察灯的完整反射光路，并在光线上标出箭头。',
 '画出S关于镜面的对称点S′，连接S′与E交镜面于反射点，连接S、反射点与E。',
 { images: [image] });
const mirrorOnly = question('image-only-drawing', mirror, '如图，画出蜡烛在平面镜中的像。', '画出蜡烛关于镜面对称的虚像。', { images: [image] });
const drawing = shortlist(mirrorCase, [mirrorOnly, reflect], '利用虚像确定反射点并画观察光路', {
 requiredOperations: ['mirror_virtual_image', 'reflection_ray']
});
assert.deepEqual(drawing.report.retrieval[0].matchedOperations, ['mirror_virtual_image', 'reflection_ray']);
verifySelection(drawing, 'mirror-ray', '先作对称像，再连接眼睛以确定反射点', '画出完整反射光路');

// Quality checks run before deduplication. A missing illustration affects only its own question.
const textStem = '车站工人在水平地面上以30N的水平拉力拖动行李车，行李车在拉力方向移动了20m，求该拉力对行李车所做的功。';
const complete = question('z-complete', work, textStem, 'W=Fs=600J。');
const noAnswer = question('a-no-answer', work, textStem, '', { review: 'approved' });
const validCopy = question('zz-copy', work, textStem, complete.answer);
const brokenImage = question('missing-image', work, estimateFromGraph.stem, estimateFromGraph.answer, { images: [{ src: 'missing.png' }] });
const filtered = shortlist(skipping, [noAnswer, complete, validCopy, brokenImage], '练习做功').report;
assert.deepEqual(filtered.questions.map(q => q.id), ['z-complete']);
assert.equal(filtered.counts.noAnswer, 1);
assert.equal(filtered.counts.mediaUnavailable, 1);
assert.equal(filtered.counts.duplicates, 1);

// Pack complete question sets under the image budget. A deferred illustrated question is eligible in the next round.
const illustrated = Array.from({ length: 13 }, (_, i) => ({ ...estimateFromGraph, id: 'graph-'+String(i).padStart(2, '0'), images: [image, image, image] }));
const oversized = { ...estimateFromGraph, id: 'too-many-images', images: Array(25).fill(image) };
const textFallback = estimateFromGiven;
const packedBank = [...illustrated, oversized, textFallback];
const options = { candidateImageBudget: 23 };
const packed = shortlist(skipping, packedBank, '从图像估算做功', { requiredOperations: ['graph_reading'] }, options).report;
assert.equal(packed.counts.mediaOversize, 1);
assert(packed.counts.imageDeferred > 0);
assert(packed.questions.some(q => q.id === textFallback.id));
assert(packed.retrieval.reduce((n, q) => n + q.necessaryImages, 0) <= 23);
const next = shortlist(skipping, packedBank, '从图像估算做功', { requiredOperations: ['graph_reading'] }, { ...options, excludeCandidateIds: packed.questions.map(q => q.id) }).report;
assert.equal(next.questions.length, 6);
assert(next.questions.every(q => !packed.questions.some(first => first.id === q.id)));
console.log('PASS classroom retrieval: work estimation (given values vs. graph), relay (ordinary circuit), mirror (virtual image + rays); quality before dedup, media budgeting, and checked selections');
