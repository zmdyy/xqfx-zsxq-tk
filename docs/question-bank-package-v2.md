# 统一题库包 V2

更新包与个人备份使用同一文件协议和读取器，不再分别实现图片编码、资源引用或校验。

## 结构

- `manifest.json`：`format: physics-training-bank-package`、`schemaVersion: 2`、`kind: backup|update`、生成时间、正文及资源的SHA-256与字节数。
- `bank.json`：`format: physics-training-bank-v2`，含questions及可选events、settings、meta、bankVersion和原有扩展字段。
- `media/<SHA-256>.bin`：资源原始字节。相同内容只写一次，原图、候选、答案图、重绘图、草稿、历史及回退/冲突记录共用资源。

manifest.bank固定引用bank.json，校验的是其UTF-8文件字节；manifest.resources以相对路径为键，值为sha256与size。media路径中的哈希与文件内容一致。未来不支持的版本直接拒绝，避免误读。

正文中的资源字符串用对象替代：`{"$physicsAsset":"media/<hash>.bin","prefix":"data:image/png;base64,","encoding":"base64"}`。读取后还原为原来的字符串再进入数据库，编辑、预览和Word导出无需处理文件内标记。非标准URI转义或base64空白使用可选sourceRef保留原始编码，因此草稿内容比较不受编码变化影响。

仅资源数据转为引用；题目ID、题干文字保持文本。新旧草稿的baseFingerprint迁移为`sha256-editor-v1:<64位哈希>`，防止旧指纹中再次嵌入全部题图。旧指纹解析后按当前编辑字段和默认值计算，仍可识别已有草稿；旧原始备份文件不被改写。

## 用途

- backup：完整个人快照，包含当前所有问题、图片与个人记录。可以仅合并题目，或明确确认同ID覆盖后恢复全部记录。
- update：题库修订包，使用稳定题目ID及revision、bankVersion/buildId。保留教师修改、审核与现有使用记录，冲突保留本机内容；个人记录不因更新包而覆盖。

两种用途仅通过清单kind区分，正文和资源协议相同。缺少个人记录的更新包也可以用相同读取器处理。

## 校验与兼容

- 新包验证ZIP CRC、正文SHA-256、每个资源的SHA-256和字节数、资源路径、引用、题目/事件/settings的唯一ID、题干与关键记录结构。
- 所有资源在执行前还原和检查，包括最终因教师保护不采用的题目所引用的资源。缺图或损坏不进行部分导入。
- 同时存在bank.json和teacher-bank-backup.json的模糊旧包拒绝处理。
- 旧bank.json ZIP、旧teacher-bank-backup.json ZIP及标准旧备份JSON仍可读，旧ref和repair资源引用统一还原。引用外部图片文件而未携带资源的JSON拒绝导入。
- 单独取出的V2 bank.json不具有完整资源和清单，不能单独导入；应选择完整ZIP。
- 不改变浏览器数据库名称。新包采用V2正文标识，使旧页面拒绝不支持的格式，而不是将资源标记误写入数据库。
- 使用记录引用已删除题目属于合法历史，不强制删除这类记录。未知扩展数据保留。

## 生成与转换

网页完整备份与题图审核导出都调用`PhysicsBankPackage.create(snapshot, {kind:'backup'})`。生产更新包调用同一方法并使用kind:update。

已有完整旧包可转换为新格式，原件保留且输出文件不能覆盖已有文件：

```bash
node tools/convert-question-bank-package.cjs legacy.zip unified.zip
node tools/convert-question-bank-package.cjs legacy-backup.json unified-backup.zip backup
```

需要按指定用途转换时，最后一个参数为backup或update；用途转换应与文件的真实数据范围一致。
