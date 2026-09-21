# 医学院标签修订

Mode: built-in image_gen, edit / text-localization.
Input: campus-overview-v1.png. Output: campus-overview-v2.png.

Final prompt:

Use case: text-localization. Edit target: the supplied full campus map PNG. Make exactly ONE local text replacement: the bottom-center building directly right of 南行政楼 and left of 学生公寓8号楼 currently labelled 实验楼 must be labelled 医学院 (these exact three simplified Chinese characters). Keep the same dark navy typography, label size, baseline and background. All other labels including 化学实验楼、生物实验楼、物理实验楼 and 临床实验（实训）中心楼 remain unchanged. Preserve entire full-map canvas dimensions and every building, road, tree, colors, geometry and relative pixel position exactly; do NOT crop, rescale, reinterpret or redraw the map. This is an app map with existing pixel-based highlight coordinates so geometric fidelity is essential. Return the full map with only 实验楼→医学院 changed.

Reviewed: 医学院文字准确；全图建筑与道路位置未见偏移。仍为示意图，不提供路线导航。
