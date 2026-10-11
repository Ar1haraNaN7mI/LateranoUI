# 来源与第三方素材说明

LateranoUI 从 [deepseek-harness-rust-optimize](https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize) 的 [`16dbd2d`](https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize/commit/16dbd2d) 提取拉特兰风界面与官方 DSH 适配器。源代码和原创几何资产的许可见仓库 [LICENSE](LICENSE)；以下组件及来源分别保留说明。

## 原创图形与设计参考

DSH 铭文徽章、教堂尖拱、鸢尾、日月星、花窗、结绳、书页与转场由本项目代码绘制，未从游戏或参考视频提取原画、界面图片、标志或视频片段。电子提示音由代码合成。

几何与排版研究参考：

- [几何与神学的碰撞](https://www.bilibili.com/video/BV17iGR6nEh9/)。
- [众生行记 UI／交互／动效记录](https://www.bilibili.com/video/BV1WFkwBJEhR/)。

“拉特兰风”描述设计方向，不表示本项目由游戏或其发行方制作、授权或背书。参考作品本身不随本仓库重新许可。

## 文字动效参考：RhineLabUI

文字的固定单元、向上滚动与遮挡条撤回节奏参考 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)，对应提交 `12cc5e4013acb9408f753ff71de6b8492299b7c8`。本项目使用自己的文字、布局、图形与时间采样实现；未打包该项目的商业字体、文案图形或 PV 采样音频。

参考源码为 MIT，保留 [RhineLabUI-MIT.txt](docs/assets/licenses/RhineLabUI-MIT.txt) 中的原版权声明与许可。本地文字实现见 [`docs/startup-text.js`](docs/startup-text.js)。

## 中文字体：Noto Sans SC

[`dsh-industrial-sc.woff2`](docs/assets/fonts/dsh-industrial-sc.woff2) 是 Noto Sans SC 的改名子集，原字体来自 Adobe / Noto 项目；来源固定于 [google/fonts](https://github.com/google/fonts/tree/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc)。

字体采用 **SIL Open Font License 1.1**，独立于代码许可。重新分发时保留 [`OFL-NotoSansSC.txt`](docs/assets/fonts/OFL-NotoSansSC.txt)；子集范围与系统回退说明见 [字体 README](docs/assets/fonts/README.md)。界面中的衬线和等宽回退使用本机字体，不打包或再许可操作系统字体。

## 固定英文旁白

[`docs/assets/voice`](docs/assets/voice) 包含预先生成的英文 WAV 和生成溯源记录。运行时只播放这些录音，不调用系统 TTS，也不附带语音模型权重。台词采用通用称呼 OPERATOR，不包含用户姓名、密码、Key 或私有能力清单。

生成方法是 **参考声音条件推理，不是模型微调**：

- 模型：[`Qwen/Qwen3-TTS-12Hz-1.7B-Base`](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/tree/fd4b254389122332181a7c3db7f27e918eec64e3)，固定 revision `fd4b254389122332181a7c3db7f27e918eec64e3`；模型记录许可为 Apache-2.0。
- 参考声音来自 [`6shenhonghong9/dsh-startup-screen`](https://github.com/6shenhonghong9/dsh-startup-screen) 的 `4a2cfe642867fac013fdef90095981544a819a2a` 版本中五段 `line-*.mp3`；项目作者为 6shenhonghong9。本仓库保留生成后的录音及来源记录，不打包这五段原始参考 MP3。
- 每段台词、文件 SHA-256、模型版本、参考文件 URL 和后处理参数见 [`manifest.json`](docs/assets/voice/manifest.json)；自动转写与格式核验结果见 [`verification.json`](docs/assets/voice/verification.json)。自动核验不表示已完成主观试听。

**模型的 Apache-2.0 许可不等同于参考录音、声音或生成录音获得同一许可。** 当前溯源记录没有为参考声音附带独立的再授权文本；因此本项目不把这些语音笼统标为代码的 MIT 资产，也不声称取得了参考声音方的额外授权。分发或替换音频时应保留其来源与适用权利说明。序列与确认机制也参考上述启动项目，与录音来源分别记录。

## 官方 DSH 运行时

官方插件的 npm 依赖是 [`@deepseek-ai/dsh@0.2.0-rc.2`](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.0-rc.2)，源项目为 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。LateranoUI 的安装器通过 npm 安装这一固定版本，未把官方运行时改称本项目原创，也不覆盖其许可与第三方依赖声明。

适配器只增加可选启动覆盖层，保留官方登录和真实能力读取接口。本仓库的 MIT 许可不取代上述字体、参考项目、语音来源或 npm 依赖各自的许可与权利范围。
