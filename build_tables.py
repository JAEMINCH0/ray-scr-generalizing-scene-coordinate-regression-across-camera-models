"""Typeset the manuscript tables with LaTeX and export cropped PDF/SVG assets.

Only Table 3 is rearranged: its four original scene blocks form a 2 × 2 grid.
Captions are omitted. Day/Night references use the project's [1]/[2] numbering.
Requires pdflatex and PyMuPDF.
"""

from collections import Counter
from pathlib import Path
import re
import subprocess
import tempfile

import pymupdf

ROOT = Path(__file__).resolve().parent
PAPER = ROOT.parent / "[WACV'27] Ray-SCR"
TABLES = {
    "tab1_day.tex": "table-360loc-day",
    "tab2_night.tex": "table-360loc-night",
    "tab3_scr.tex": "table-360loc-scr",
    "tab7_aachen.tex": "table-aachen-day",
}


def original_tabular(filename):
    source = (PAPER / "Table" / filename).read_text()
    source = re.sub(r"(?<!\\)%[^\n]*", "", source)
    match = re.search(r"\\begin\{tabular\}.*?\\end\{tabular\}", source, re.S)
    if not match:
        raise ValueError(f"No tabular found in {filename}")
    tabular = re.sub(r"~?\s*\\cite\{[^{}]+\}", "", match[0])
    if filename in ("tab1_day.tex", "tab2_night.tex"):
        # These are result-source citations requested for the project page,
        # independent of the bibliography numbering in the manuscript.
        for method, number in (
            ("PN", 1), ("MS-T", 1), ("PN-VC2", 1), ("MS-T-VC2", 1), ("CDG-Loc", 2),
        ):
            pattern = rf"(&\s*){re.escape(method)}(\s*&)"
            tabular, count = re.subn(
                pattern,
                lambda m: m[1] + method + rf"~\textcolor{{citationgreen}}{{[{number}]}}" + m[2],
                tabular,
            )
            if count != 2:
                raise ValueError(f"Expected two {method} rows in {filename}, got {count}")
    return tabular


def scr_grid(tabular):
    header = re.match(r"\\begin\{tabular\}\{([^{}]*)\}", tabular)
    body = tabular[header.end():tabular.rindex(r"\end{tabular}")]
    blocks = re.split(r"(?=\\multicolumn\{7\}\{c\})", body)[1:]
    expected = ("Atrium Day", "Concourse Day", "Hall Day", "Piatrium Day")
    if len(blocks) != 4 or any(
        f"{{{name}}}" not in block for name, block in zip(expected, blocks)
    ):
        raise ValueError("Expected four SCR scene blocks in manuscript order")
    scenes = [
        rf"\begin{{tabular}}{{{header[1]}}}" + "\n\\hline\n"
        + block.strip() + "\n\\end{tabular}"
        for block in blocks
    ]
    # Preserve every scene's original columns, headers, rules, and values.
    return (
        r"\begin{tabular}{@{}c@{\hspace{18pt}}c@{}}" + "\n"
        + scenes[0] + " &\n" + scenes[1] + r" \\ \noalign{\vskip 18pt}" + "\n"
        + scenes[2] + " &\n" + scenes[3] + "\n"
        + r"\end{tabular}"
    )


def document(tabular):
    return (
        r"""\documentclass[10pt]{article}
\usepackage[paperwidth=22in,paperheight=12in,margin=0.4in]{geometry}
\usepackage{times}
\usepackage{graphicx,array,multirow,amssymb,xcolor}
\definecolor{citationgreen}{HTML}{B9E787}
\pagestyle{empty}
\begin{document}
\noindent
"""
        + tabular + "\n\\end{document}\n"
    )


def export_table(pdf_path, asset_name, original):
    with pymupdf.open(pdf_path) as pdf:
        if len(pdf) != 1:
            raise ValueError(f"{asset_name} unexpectedly spans {len(pdf)} pages")
        page = pdf[0]
        text = page.get_text()
        # Check every decimal value survives typesetting, including the 1.3/3.0 fix.
        numbers = lambda value: Counter(re.findall(r"\d+\.\d+", value))
        if numbers(text) != numbers(original):
            raise ValueError(f"Typeset numbers differ from the source: {asset_name}")
        bounds = pymupdf.Rect()
        for block in page.get_text("blocks"):
            bounds |= pymupdf.Rect(block[:4])
        for drawing in page.get_drawings():
            # A horizontal/vertical rule has an empty Rect until its stroke
            # width is included, so a plain rectangle union would skip it.
            half_stroke = (drawing["width"] or 0.4) / 2
            bounds |= drawing["rect"] + (
                -half_stroke, -half_stroke, half_stroke, half_stroke,
            )
        bounds += (-7, -7, 7, 7)
        if not page.rect.contains(bounds):
            raise ValueError(f"Clipped table: {asset_name}")
        with pymupdf.open() as cropped:
            result = cropped.new_page(width=bounds.width, height=bounds.height)
            result.draw_rect(result.rect, color=None, fill=(1, 1, 1))
            result.show_pdf_page(result.rect, pdf, 0, clip=bounds)
            output = ROOT / "dist/assets" / asset_name
            cropped.save(output.with_suffix(".pdf"), garbage=4, deflate=True)
            output.with_suffix(".svg").write_text(result.get_svg_image(text_as_path=True))
            print(f"{asset_name}: {bounds.width:.0f} × {bounds.height:.0f} pt")


def build_tables():
    (ROOT / "dist/assets").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ray-scr-tables-") as directory:
        build_dir = Path(directory)
        for filename, asset_name in TABLES.items():
            original = original_tabular(filename)
            tabular = scr_grid(original) if filename == "tab3_scr.tex" else original
            tex_path = build_dir / f"{asset_name}.tex"
            tex_path.write_text(document(tabular))
            result = subprocess.run(
                ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode",
                 "-halt-on-error", tex_path.name],
                cwd=build_dir, capture_output=True, text=True, timeout=60,
            )
            if result.returncode:
                raise RuntimeError(f"LaTeX failed for {filename}:\n{result.stdout[-5000:]}")
            if re.search(r"Overfull \\[hv]box", result.stdout):
                raise RuntimeError(f"LaTeX overflow in {filename}")
            export_table(tex_path.with_suffix(".pdf"), asset_name, original)


if __name__ == "__main__":
    build_tables()
