# URL 参数配置

通过在 URL 中添加查询参数，可以预设浏览器的所有配置选项。

## 基本用法

```
index.html?参数1=值1&参数2=值2&参数3=值3
```

## 参数列表

### 设备参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `device` | 设备预设 | `xteink-x4` (480×800), `xteink-x3` (528×792), `custom` |
| `width` | 自定义宽度 | 100-2000 |
| `height` | 自定义高度 | 100-2000 |
| `orientation` | 屏幕旋转角度 | 0, 90, 180, 270 |

### 文本参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `font` | 字体 | `Noto Sans SC`, `Noto Serif SC`, `LXGW WenKai GB Screen`, `Alegreya Sans SC`, `Alegreya SC`, `Literata`, `Lora`, `Merriweather`, `Source Serif 4`, `Noto Serif`, `Noto Sans`, `Open Sans`, `Roboto`, `EB Garamond`, `Crimson Pro`, `ZCOOL XiaoWei`, `ZCOOL QingKe HuangYou`, `Ma Shan Zheng`, `Long Cang` |
| `fontSize` | 字号 | 12-48 |
| `fontWeight` | 字重 | 100-900 (100, 200, 300, 400, 500, 600, 700, 800, 900) |
| `lineHeight` | 行高 | 100-200 (%) |
| `margin` | 页边距 | 0-48 (px) |
| `paraIndent` | 首行缩进 | 0-4 (em) |
| `paraSpacing` | 段落间距（固定模式时） | 0-32 (px) |
| `paraSpacingMode` | 段距模式 | `fixed`（固定 px）, `double`（二倍行距，段间 1× 行高） |
| `textAlign` | 对齐方式 | `justify`, `left`, `center`, `right` |
| `hyphenation` | 断词模式 | `0` (无), `1` (算法), `2` (词典) |
| `hyphenLang` | 断词语言 | `auto`, `en`, `zh`, `de`, `fr`, `es`, `ru`, `ja`, `ko`, `pt`, `pt-br`, `it`, `nl`, `pl`, `tr`, `uk`, `el`, `fi`, `sv`, `da`, `no`, `cs`, `hu`, `ro`, `sk`, `bg`, `hr`, `sr`, `sl`, `et`, `lv`, `lt`, `ca`, `gl`, `eu`, `hy`, `ka`, `mk`, `eo`, `la`, `ga`, `is`, `cy`, `oc` |

### 图像参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `quality` | 质量模式 | `fast` (1-bit), `hq` (2-bit) |
| `dither` | 抖动 | `1` (开启), `0` (关闭) |
| `ditherStrength` | 抖动强度 | 0-100 (%) |
| `negative` | 反色模式 | `1` (开启), `0` (关闭) |

### 进度条参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `progressBar` | 进度条 | `1` (开启), `0` (关闭) |
| `progressPos` | 位置 | `top`, `bottom` |
| `showBookProgress` | 显示书籍进度 | `1`, `0` |
| `showChapterMarks` | 显示章节标记 | `1`, `0` |
| `showChapterProgress` | 显示章节进度 | `1`, `0` |
| `progressFullWidth` | 全宽进度条 | `1`, `0` |
| `showPageXY` | 显示页码 X/Y | `1`, `0` |
| `showBookPercent` | 显示书籍百分比 | `1`, `0` |
| `showChapterXY` | 显示章节页码 | `1`, `0` |
| `showChapterPercent` | 显示章节百分比 | `1`, `0` |
| `statusFontSize` | 状态栏字号 | 8-24 |
| `statusEdgeMargin` | 状态栏边距 | 0-24 |
| `statusSideMargin` | 状态栏侧边距 | 0-24 |

## 使用示例

### 示例 1：X3 设备配置
```
index.html?device=xteink-x3&fontSize=28&margin=20&dither=1&quality=hq
```

### 示例 2：自定义尺寸 + 进度条
```
index.html?device=custom&width=600&height=800&font=Lora&fontSize=32&lineHeight=140&progressBar=1&showBookPercent=1
```

### 示例 3：深色模式 + 大字号
```
index.html?device=xteink-x4&fontSize=40&margin=24&negative=1&font=Noto+Sans
```

### 示例 4：完整配置
```
index.html?device=xteink-x4&fontSize=34&fontWeight=400&lineHeight=120&margin=16&textAlign=justify&hyphenation=2&quality=hq&dither=1&ditherStrength=20&progressBar=1&progressPos=bottom&showBookProgress=1&showChapterMarks=1&showPageXY=1&showBookPercent=1
```

## 注意事项

1. 布尔参数（如 `dither`、`negative`、`progressBar`）使用 `1` 表示开启，`0` 表示关闭
2. 字符串参数区分大小写
3. 多个参数用 `&` 连接
4. 参数会在页面加载时自动应用
5. 用户仍然可以在界面中手动修改这些设置