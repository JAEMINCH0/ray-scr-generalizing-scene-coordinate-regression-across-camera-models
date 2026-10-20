"""Copy original manuscript text into the static page without rewriting prose."""

from pathlib import Path
import html
import re
import xml.etree.ElementTree as ET

from build_tables import TABLES, build_tables

ROOT = Path(__file__).resolve().parent
PAPER = ROOT.parent / "[WACV'27] Ray-SCR"
REFERENCES = {
    "ace-g": {
        "key": "bruns2025aceg", "number": 1, "venue": "ICCV", "model": "ACE-G",
        "url": "https://openaccess.thecvf.com/content/ICCV2025/papers/Bruns_ACE-G_Improving_Generalization_of_Scene_Coordinate_Regression_Through_Query_Pre-Training_ICCV_2025_paper.pdf",
    },
    "ace": {
        "key": "brachmann2023ace", "number": 2, "venue": "CVPR", "model": "ACE",
        "url": "https://openaccess.thecvf.com/content/CVPR2023/papers/Brachmann_Accelerated_Coordinate_Encoding_Learning_to_Relocalize_in_Minutes_Using_RGB_CVPR_2023_paper.pdf",
    },
    "glace": {
        "key": "wang2024glace", "number": 3, "venue": "CVPR", "model": "GLACE",
        "url": "https://openaccess.thecvf.com/content/CVPR2024/html/Wang_GLACE_Global_Local_Accelerated_Coordinate_Encoding_CVPR_2024_paper.html",
    },
    "dsac": {
        "key": "brachmann2022dsacstar", "number": 4, "venue": "TPAMI", "model": "DSAC*",
        "url": "https://arxiv.org/abs/2002.12324",
    },
    "360loc": {
        "key": "huang2024loc", "number": 1, "venue": "CVPR",
        "url": "https://openaccess.thecvf.com/content/CVPR2024/html/Huang_360Loc_A_Dataset_and_Benchmark_for_Omnidirectional_Visual_Localization_with_CVPR_2024_paper.html",
    },
    "cdgloc": {
        "key": "wang2025cdgloc", "number": 2, "venue": "ICML",
        "url": "https://proceedings.mlr.press/v267/wang25dv.html",
    },
    "fgpl": {
        "key": "kim2024fully", "number": 3, "venue": "CVPR",
        "url": "https://openaccess.thecvf.com/content/CVPR2024/html/Kim_Fully_Geometric_Panoramic_Localization_CVPR_2024_paper.html",
    },
    "ldl": {
        "key": "kim2023ldl", "number": 4, "venue": "ICCV",
        "url": "https://openaccess.thecvf.com/content/ICCV2023/html/Kim_LDL_Line_Distance_Functions_for_Panoramic_Localization_ICCV_2023_paper.html",
    },
}


def source(relative):
    lines = (PAPER / relative).read_text().splitlines()
    lines = [line for line in lines if not line.lstrip().startswith("%")]
    return "\n".join(re.split(r"(?<!\\)%", line, maxsplit=1)[0] for line in lines)


def braced(text, start):
    assert text[start] == "{"
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{" and (index == 0 or text[index - 1] != "\\"):
            depth += 1
        elif text[index] == "}" and text[index - 1] != "\\":
            depth -= 1
            if depth == 0:
                return text[start + 1:index]
    raise ValueError("Unclosed LaTeX group")


def to_html(text):
    text = re.sub(r"\s+", " ", text).strip()
    # Citations are not renumbered for this standalone project-page extract.
    text = re.sub(r"~?\\cite\{[^{}]+\}", "", text)
    text = re.sub(r"\\rotatebox(?:\[[^\]]*\])?\{[^{}]*\}\{([^{}]*)\}", r"\1", text)
    text = html.escape(text)
    text = re.sub(r"\\textbf\{([^{}]*)\}", r"<strong>\1</strong>", text)
    text = re.sub(r"\\underline\{([^{}]*)\}", r"<u>\1</u>", text)
    text = text.replace(r"$\theta_i$", "<i>θ</i><sub>i</sub>")
    text = text.replace(r"$\mathbf r_i$", "<b>r</b><sub>i</sub>")
    text = text.replace(r"$N$", "<i>N</i>")
    text = text.replace(r"$^*$", "<sup>*</sup>")
    text = text.replace(r"\mathrm{m}", "m")
    text = text.replace(r"\,", " ").replace(r"^\circ", "°").replace(r"\times", "×")
    return text.replace("$", "").replace("~", " ")


def caption(relative, containing):
    text = source(relative)
    for match in re.finditer(r"\\caption(?:\[[^\]]*\])?\s*(\{)", text):
        body = braced(text, match.start(1))
        if containing in body:
            return to_html(body)
    raise ValueError(f"Caption not found: {relative}: {containing}")


def reference_list(names):
    """Use the manuscript bibliography, with links to the published papers."""
    bib = source("main.bib")
    entries = []
    for name in names:
        reference = REFERENCES[name]
        entry = re.search(r"@\w+\s*(\{" + re.escape(reference["key"]) + r",)", bib)
        if not entry:
            raise ValueError(f"Missing bibliography entry: {reference['key']}")
        body = braced(bib, entry.start(1))

        def field(key):
            match = re.search(r"\b" + key + r"\s*=\s*(\{)", body)
            if not match:
                raise ValueError(f"Missing {key} in {reference['key']}")
            value = braced(body, match.start(1)).replace("{", "").replace("}", "")
            return re.sub(r"\s+", " ", value).strip()

        authors = field("author").split(" and ")
        author = " ".join(reversed(authors[0].split(", ")))
        if len(authors) > 1:
            author += " et al."
        title, year = field("title"), field("year")
        label = f'[{reference["number"]}]'
        url = html.escape(reference["url"])
        model = (f'<span class="reference-model">{html.escape(reference["model"])}</span>. '
                 if reference.get("model") else "")
        entries.append(
            f'<li><a class="reference-number" href="{url}" target="_blank" rel="noopener">'
            f'{html.escape(label)}</a>'
            f'<span>{model}{html.escape(author)} <a href="{url}" target="_blank" rel="noopener">'
            f'<cite>{html.escape(title)}</cite></a>. {reference["venue"]}, {year}.</span></li>'
        )
    return '<ol class="benchmark-references" aria-label="References">\n' + "\n".join(entries) + "\n</ol>"


def render_table(relative, label):
    asset_name = TABLES[Path(relative).name]
    asset = f"assets/{asset_name}.svg"
    svg = ET.parse(ROOT / "dist" / asset).getroot()
    _, _, width, height = map(float, svg.attrib["viewBox"].split())
    aachen = "tab7_" in relative
    table_class = " aachen-table" if aachen else ""
    metric_note = "Success rate (%)" if aachen else "Median translation / rotation (m / °)"
    references = reference_list(("360loc", "cdgloc")) if Path(relative).name in (
        "tab1_day.tex", "tab2_night.tex",
    ) else ""
    return f'''<figure class="paper-figure paper-table{table_class}">
<button type="button" class="image-zoom" data-image="{asset}" data-caption="" data-table="true" aria-label="Enlarge {html.escape(label)}">
<img src="{asset}" alt="{html.escape(label)}" width="{round(width * 2)}" height="{round(height * 2)}" loading="lazy"/>
<span class="zoom-hint" aria-hidden="true"><svg class="icon"><use href="#i-expand"></use></svg></span>
</button>
<p class="table-metric">{metric_note}</p>
{references}
</figure>'''


def sections():
    main = source("main.tex")
    title = braced(main, main.index(r"\title") + len(r"\title"))
    title = re.sub(r"\s+", " ", title).strip()
    name, subtitle = title.split(":", 1)
    abstract = source("Section/0_Abstract.tex")
    abstract = abstract.split(r"\begin{abstract}", 1)[1].split(r"\end{abstract}", 1)[0]
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", abstract) if p.strip()]
    subtitle_html = html.escape(subtitle.strip()).replace(
        "Scene Coordinate Regression",
        '<span class="neon-text">Scene Coordinate Regression</span>',
        1,
    )
    return {
        "title": f'<span class="paper-name">{html.escape(name)}:</span> <span class="paper-subtitle">{subtitle_html}</span>',
        "abstract": "\n".join(f"<p>{to_html(p)}</p>" for p in paragraphs),
        "pipeline-caption": caption("Section/2_Related_Work.tex", "Ray-SCR scene-training pipeline"),
        "table1": render_table("Table/tab1_day.tex", "360Loc-Day results"),
        "table2": render_table("Table/tab2_night.tex", "360Loc-Night results"),
        "table3": render_table("Table/tab3_scr.tex", "360Loc-Day (SCR) results: Atrium, Concourse, Hall, and Piatrium in a 2 × 2 grid"),
        "aachen-table": render_table("Table/tab7_aachen.tex", "Aachen-Day results"),
        "omniscenes-references": reference_list(("fgpl", "ldl")),
        "backbone-references": reference_list(("ace-g", "ace", "glace", "dsac")),
    }


if __name__ == "__main__":
    build_tables()
    page_path = ROOT / "dist/index.html"
    page = page_path.read_text()
    for name, content in sections().items():
        pattern = rf"(<!-- paper:{name} -->).*?(<!-- /paper:{name} -->)"
        page, count = re.subn(pattern, lambda m: m[1] + content + m[2], page, flags=re.S)
        if count != 1:
            raise ValueError(f"Expected exactly one content slot for {name}, got {count}")
    page_path.write_text(page)
    print("Copied the original title, abstract, Method caption, and Day, Night, SCR, and Aachen tables.")
