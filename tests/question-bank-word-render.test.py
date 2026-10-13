"""Verify rendered browser-generated fixtures, after render_docx.py and visual QA.

Usage: python tests/question-bank-word-render.test.py /path/to/WORD_TEST_OUTPUT_DIR
The PDF files are expected under final-<fixture>/<fixture>.pdf.
"""
import re
import sys
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import fitz

directory = Path(sys.argv[1])
docs = {}
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
for name in ("continuous-double", "overflow-single", "oversized-table"):
    with ZipFile(directory / (name + ".docx")) as archive:
        for file in archive.namelist():
            if file.endswith(".xml") or file.endswith(".rels"):
                ET.fromstring(archive.read(file))
        document = ET.fromstring(archive.read("word/document.xml"))
        assert len(document.findall('.//w:cols[@w:num="2"]', ns)) == (0 if name == "overflow-single" else 2)
    doc = docs[name] = fitz.open(directory / ("final-" + name) / (name + ".pdf"))
    assert "物理精准练习" in doc[0].get_text(), "Chinese title must render"
    for index, page in enumerate(doc):
        text = page.get_text()
        assert re.search(rf"第\s*{index+1}\s*/\s*{len(doc)}\s*页", text), "page fields must update"
        for x0, y0, x1, y1, *_ in page.get_text("words"):
            assert 0 <= x0 < x1 <= page.rect.width + 1 and 0 <= y0 < y1 <= page.rect.height + 1, "clipped text"

flow = docs["continuous-double"]
assert len(flow) == 2, "long stem, illustrated options, table and answers must fit front/back"
page = flow[0]
assert page.search_for("题干段0")[0].x0 < page.rect.width / 2 < page.search_for("题干段9")[0].x0, "one question must cross columns"
for text in ("项目", "电压", "电流", "电阻"):
    rects = page.search_for(text)
    assert len(rects) == 1 and rects[0].x0 > page.rect.width / 2, "complete table must remain in the right column"
images = [rect for data in page.get_images() for rect in page.get_image_rects(data[0])]
assert len(images) == 2
for label, rect in zip(("第一项", "第二项"), sorted(images, key=lambda r: r.y0)):
    option = page.search_for(label)[0]
    assert option.x0 > page.rect.width / 2 and option.y1 < rect.y0, "option and corresponding picture must share one column"
assert "参考答案" in flow[1].get_text()

many = "\n".join(p.get_text() for p in docs["overflow-single"])
assert re.findall(r"续页题干\s*(\d{3})", many) == [f"{i:03}" for i in range(75)], "stem paragraphs lost, duplicated or reordered"
assert re.findall(r"续页答案\s*(\d{3})", many) == [f"{i:03}" for i in range(65)], "answer paragraphs lost, duplicated or reordered"
assert len(docs["overflow-single"]) > 2
huge = "\n".join(p.get_text() for p in docs["oversized-table"])
assert [int(x) for x in re.findall(r"实验\s*(\d+)", huge)] == list(range(65)), "oversized table data lost or reordered"
assert "完成后勾选" in huge and "核对后" in huge
print("PASS: parsed OOXML, rendered sequential columns, whole short table, paired options/images, full overflow content and correct page fields")
print("Rendered pages:", {name: len(doc) for name, doc in docs.items()})
