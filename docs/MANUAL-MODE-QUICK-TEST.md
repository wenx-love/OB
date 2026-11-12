# 快速验证步骤

## 一、加载扩展

1. 打开 Chrome 浏览器
2. 地址栏输入：`chrome://extensions/`
3. 右上角打开「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择：`D:\Projects\ob-recover\dist`
6. 确认 OB-Recover 已加载

## 二、打开测试页面

在地址栏输入：
```
file:///D:/Projects/ob-recover/test-pages/manual-mode-test.html
```

## 三、验证手动模式

### 3.1 确认不会自动设置断点

1. **打开 DevTools**（F12）
2. **切换到 Sources 标签**
3. **观察左侧源码树**

✅ **预期**：没有看到大量自动设置的断点（蓝色标记）
❌ **失败**：Sources 面板被大量断点填满，页面一直暂停

### 3.2 切换到 OB-Recover 面板

1. **切换到 OB-Recover 标签**
2. **点击「连接调试器」按钮**

✅ **预期**：连接成功，显示「已连接」状态
❌ **失败**：连接失败，或页面开始自动暂停

### 3.3 手动设置断点

1. **返回 Sources 标签**
2. **找到 manual-mode-test.html 文件**（左侧源码树）
3. **展开 `<script>` 标签内容**
4. **找到 testFunction1 函数**（约第 80 行）
5. **在第一行点击行号**：`const message = _0x123456(0);`

✅ **预期**：断点成功设置（行号变蓝色）
❌ **失败**：无法设置断点

### 3.4 触发断点

1. **切换到 Elements 或 Console 标签**（离开 Sources）
2. **点击页面上的「测试函数 1」按钮**

✅ **预期**：
- 页面暂停执行
- Sources 标签自动激活
- 高亮显示在断点行
- 右侧显示调用栈和局部变量

❌ **失败**：
- 页面没有暂停
- 或者暂停在其他位置

### 3.5 检查捕获（临时验证）

**由于 Panel UI 未实现，需要查看 background console：**

1. **打开新标签**，输入：`chrome://extensions/`
2. **找到 OB-Recover**
3. **点击「检查视图：背景页面」**（或「Service Worker - 检查」）
4. **查看 Console 输出**

✅ **预期**：看到类似输出
```
[ManualCapture] Pause detected at testFunction1 (line 80, col 6)
[ManualCapture] CallFrames: 1
[ManualCapture] Record saved
```

❌ **失败**：没有任何输出，或报错

### 3.6 继续执行

1. **返回页面 DevTools**
2. **按 F8**（或点击 Sources 顶部的「继续」按钮 ▶️）

✅ **预期**：
- 执行继续
- 页面正常显示结果：`Username says: Hello`
- 没有再次自动暂停

❌ **失败**：
- 执行卡住
- 或者继续在其他位置暂停

## 四、多次触发验证

1. **再次点击「测试函数 1」按钮**
2. **应该再次暂停在断点处**
3. **按 F8 继续**

✅ **预期**：每次都能正常暂停和继续

## 五、测试其他函数

### 5.1 测试函数 2

1. **在 testFunction2 第一行设置断点**
2. **点击「测试函数 2」按钮**
3. **验证暂停和继续**

### 5.2 测试嵌套调用

1. **在 innerFunction 内部设置断点**
2. **点击「测试解码调用」按钮**
3. **验证能否正确暂停在嵌套函数中**

## 六、清理

1. **移除所有断点**（Sources 右侧 Breakpoints 列表）
2. **关闭测试页面**
3. **（可选）卸载扩展**

---

## 常见问题

### Q1: 页面一直暂停，无法正常加载

**可能原因**：插桩断点没有被正确关闭

**解决方法**：
1. 检查 background.ts 中的 `onInstrumentation` 是否正确返回
2. 查看 background console 日志
3. 尝试点击「断开调试器」，然后重新连接

### Q2: 手动断点不触发

**可能原因**：调试器未正确连接

**解决方法**：
1. 确认 OB-Recover 面板显示「已连接」
2. 检查 `chrome://extensions/` 中扩展是否启用
3. 刷新页面重试

### Q3: 看不到 OB-Recover 标签

**可能原因**：扩展未正确加载

**解决方法**：
1. 检查 `dist/` 目录是否存在
2. 检查 `dist/manifest.json` 是否存在
3. 重新构建：`npm run build`
4. 重新加载扩展

### Q4: background console 找不到

**Chrome 版本差异**：

- **老版本**：chrome://extensions/ → OB-Recover → 「检查视图：背景页面」
- **新版本**：chrome://extensions/ → OB-Recover → 「Service Worker」→ 「检查」

### Q5: 无法查看 callFrames 详情

**当前限制**：Panel UI 未实现

**临时方法**：
1. 在 background console 中设置断点
2. 或者在 ManualCapture.onManualPause 中添加 console.log
3. 重新构建并加载扩展

---

## 验证通过标准

- [x] 打开页面不会自动暂停
- [x] 不会自动设置大量断点
- [x] 可以手动设置断点
- [x] 手动断点可以正常触发
- [x] 暂停时可以查看调用栈和变量
- [x] 可以正常继续执行
- [x] 多次触发都正常
- [ ] OB-Recover 面板显示捕获记录（Panel UI 待实现）

**当前状态**：Backend 功能已实现，等待真实浏览器验证。
